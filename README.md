# Планер

Личный планер: неделя по горизонтали, день, месяц, входящие, подзадачи, повторы,
вкладка Instagram для контент-стратегии и голосовой ассистент. Открывается в
браузере, ставится на экран «Домой» на iPhone, у каждого пользователя свой планер.

## Как устроено

| Часть | Где |
|---|---|
| Страница приложения | `index.html`, `styles.css`, `app.js` |
| Подключение к базе | `config.js` (адрес проекта Supabase и публичный ключ) |
| Установка на iPhone | `manifest.webmanifest`, `sw.js`, `icons/` |
| База данных и правила доступа | `supabase/schema.sql` |
| Голосовой ассистент | `api/parse.js` (функция Vercel, вызывает Claude API) |
| Первая версия в Claude | `prototype/index.html` |

## Запуск

1. **Supabase → SQL Editor → New query**: вставить `supabase/schema.sql`, нажать Run.
2. **Supabase → Authentication → URL Configuration**: в Site URL указать адрес
   приложения на Vercel.
3. В `config.js` вписать `supabaseUrl` и `supabaseAnonKey`
   (Supabase → Project Settings → API).
4. **Vercel → Add New → Project** → выбрать этот репозиторий → Deploy.
5. Для ассистента: Vercel → Settings → Environment Variables:
   `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, затем Redeploy.
   Без ключа приложение работает, ассистент просто показывает, что не подключён.

## На iPhone

Открыть адрес в Safari → «Поделиться» → «На экран Домой».
