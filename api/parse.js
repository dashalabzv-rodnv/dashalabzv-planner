// Голосовой ассистент: превращает фразу («встреча с Анной в пятницу в 15:00»)
// в задачи планера. Работает на сервере Vercel, чтобы ключ Claude API
// никогда не попадал в браузер.
import Anthropic from "@anthropic-ai/sdk";

const WEEKDAYS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];

const TASK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["tasks"],
  properties: {
    tasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "cat", "project", "date", "time", "dur", "deadline", "remind", "repeat", "subs", "format", "status", "rubric"],
        properties: {
          title: { type: "string" },
          cat: { type: "string", enum: ["work", "home", "hobby", "insta"] },
          project: { type: ["string", "null"] },
          date: { type: ["string", "null"], description: "YYYY-MM-DD" },
          time: { type: ["string", "null"], description: "HH:MM" },
          dur: { type: "integer" },
          deadline: { type: "boolean" },
          remind: { type: ["integer", "null"] },
          repeat: { type: "string", enum: ["none", "daily", "weekdays", "weekly", "monthly"] },
          subs: { type: "array", items: { type: "string" } },
          format: { type: ["string", "null"], enum: ["Reels", "Карусель", "Пост", "Сторис", null] },
          status: { type: ["string", "null"], enum: ["idea", "script", "shoot", "edit", "ready", "posted", null] },
          rubric: { type: ["string", "null"] }
        }
      }
    }
  }
};

async function currentUser(token) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key || !token) return null;
  const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
  return r.ok ? r.json() : null;
}

function buildPrompt({ text, today, now, projects, rubrics }) {
  const [y, m, d] = today.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const days = [...Array(14)].map((_, i) => {
    const x = new Date(base); x.setUTCDate(base.getUTCDate() + i);
    return `${x.toISOString().slice(0, 10)} — ${WEEKDAYS[x.getUTCDay()]}`;
  }).join("\n");
  const list = a => (a.length ? a.map(s => `"${s}"`).join(", ") : "нет");
  return `Ты помощник личного планера. Преобразуй фразу пользователя в одну или несколько задач.
Сегодня ${today}, ${WEEKDAYS[base.getUTCDay()]}, сейчас ${now}.
Ближайшие даты:
${days}

Категории: "work" (работа, встречи, созвоны, клиенты, проекты, дедлайны), "home" (быт, дом, покупки, здоровье, семья), "hobby" (хобби, спорт, прогулки, чтение, отдых), "insta" (всё для Instagram: рилсы, посты, карусели, сторис, контент-план).
Рабочие проекты пользователя: ${list(projects)}. Если фраза относится к одному из них, верни его точное имя в "project". Новый проект указывай, только если пользователь явно назвал проект; иначе null.
Для "insta" заполни "format", "status" (по умолчанию "idea") и "rubric" — одну из рубрик ${list(rubrics)} или null; дата для "insta" — дата публикации. Для остальных категорий format, status и rubric = null.
Если день не назван, date = null (задача уйдёт во «Входящие»). Если время не названо, time = null.
"title" — коротко, с заглавной буквы. "dur" — длительность в минутах, по умолчанию 60. "remind" — за сколько минут напомнить, или null.

Фраза: «${text}»`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: "assistant_not_configured" });

  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const user = await currentUser(token);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const text = String(body.text || "").slice(0, 1000).trim();
  const today = /^\d{4}-\d{2}-\d{2}$/.test(body.today || "") ? body.today : new Date().toISOString().slice(0, 10);
  if (!text) return res.status(400).json({ error: "empty" });

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: TASK_SCHEMA } },
      messages: [{
        role: "user",
        content: buildPrompt({
          text, today,
          now: /^\d{2}:\d{2}$/.test(body.now || "") ? body.now : "12:00",
          projects: (body.projects || []).slice(0, 50).map(String),
          rubrics: (body.rubrics || []).slice(0, 30).map(String)
        })
      }]
    });
    if (response.stop_reason === "refusal") return res.status(200).json({ tasks: [] });
    const out = response.content.filter(b => b.type === "text").map(b => b.text).join("");
    return res.status(200).json(JSON.parse(out));
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "rate_limited" });
    if (err instanceof Anthropic.AuthenticationError) return res.status(503).json({ error: "bad_api_key" });
    if (err instanceof Anthropic.APIError) return res.status(502).json({ error: "api_error", status: err.status });
    return res.status(500).json({ error: "parse_failed" });
  }
}
