(function(){
const CATS={work:{name:"Работа",cls:"c-work"},home:{name:"Дом",cls:"c-home"},hobby:{name:"Хобби",cls:"c-hobby"},insta:{name:"Instagram",cls:"c-insta"}};
const STAGES=[["idea","Идеи"],["script","Сценарий"],["shoot","Съёмка"],["edit","Монтаж"],["ready","Готово"],["posted","Опубликовано"]];
const FORMATS=["Reels","Карусель","Пост","Сторис"];
const REPEAT={none:"Не повторять",daily:"Каждый день",weekdays:"По будням",weekly:"Каждую неделю",monthly:"Каждый месяц"};
const WD=["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];
const WDF=["понедельник","вторник","среда","четверг","пятница","суббота","воскресенье"];
const MONTHS=["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
const MONTHS_N=["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const LKEY="ma-planner-v2";
const H0=7,H1=24,PX=56;

const pad=n=>String(n).padStart(2,"0");
const iso=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const parse=s=>{const[y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d)};
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const monday=d=>{const x=new Date(d.getFullYear(),d.getMonth(),d.getDate());return addDays(x,-((x.getDay()+6)%7))};
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const mins=t=>{if(!t)return null;const[h,m]=t.split(":").map(Number);return h*60+m};
const hhmm=m=>pad(Math.floor(m/60)%24)+":"+pad(m%60);
const plural=(n,f)=>{const a=n%10,b=n%100;return f[a===1&&b!==11?0:a>=2&&a<=4&&(b<10||b>=20)?1:2]};

/* ================= хранилище =================
   Задачи, проекты и профиль живут в Supabase. Каждая строка принадлежит
   одному пользователю, и правила базы (RLS) не дают читать чужие. */
const CFG=window.PLANNER_CONFIG||{};
const sb=(window.supabase&&CFG.supabaseUrl&&CFG.supabaseAnonKey)?window.supabase.createClient(CFG.supabaseUrl,CFG.supabaseAnonKey):null;
const Store={
  tasks:[],projects:[],insta:{goal:"",perWeek:3,rubrics:[]},myName:"",user:null,channel:null,
  async load(user){
    this.user=user;
    const [t,p,pr]=await Promise.all([
      sb.from("tasks").select("id,data"),
      sb.from("projects").select("id,data"),
      sb.from("profiles").select("name,insta").eq("user_id",user.id).maybeSingle()
    ]);
    if(t.error||p.error)toast("Не удалось загрузить задачи","Проверьте соединение и обновите страницу");
    this.tasks=(t.data||[]).map(r=>({...r.data,id:r.id}));
    this.projects=(p.data||[]).map(r=>({...r.data,id:r.id}));
    const meta=user.user_metadata||{};
    if(pr.data){this.myName=pr.data.name||"";if(pr.data.insta)this.insta={goal:"",perWeek:3,rubrics:[],...pr.data.insta}}
    else{this.myName=meta.name||"";await sb.from("profiles").upsert({user_id:user.id,name:this.myName,insta:this.insta})}
    this.subscribe();
  },
  subscribe(){
    // изменения с другого устройства прилетают сразу
    if(this.channel)sb.removeChannel(this.channel);
    const f=`user_id=eq.${this.user.id}`;
    const apply=(list,pl)=>{
      if(pl.eventType==="DELETE"){const id=pl.old&&pl.old.id;return list.filter(x=>x.id!==id)}
      const row={...pl.new.data,id:pl.new.id};const i=list.findIndex(x=>x.id===row.id);
      if(i<0)return[...list,row];const c=list.slice();c[i]=row;return c;
    };
    this.channel=sb.channel("planner-"+this.user.id)
      .on("postgres_changes",{event:"*",schema:"public",table:"tasks",filter:f},pl=>{this.tasks=apply(this.tasks,pl);render()})
      .on("postgres_changes",{event:"*",schema:"public",table:"projects",filter:f},pl=>{this.projects=apply(this.projects,pl);render()})
      .on("postgres_changes",{event:"*",schema:"public",table:"profiles",filter:f},pl=>{if(pl.new){this.myName=pl.new.name||"";if(pl.new.insta)this.insta={...this.insta,...pl.new.insta};renderHello();if(!metaEditing)render()}})
      .subscribe();
  },
  reset(){if(this.channel)sb.removeChannel(this.channel);this.channel=null;this.tasks=[];this.projects=[];this.myName="";this.user=null},
  clean(o){const r={};for(const k in o){if(o[k]!==undefined&&k!=="id")r[k]=o[k]}return r},
  fail(){toast("Не удалось сохранить","Проверьте соединение и попробуйте ещё раз")},
  putTask(t){
    const i=this.tasks.findIndex(x=>x.id===t.id);if(i<0)this.tasks.push(t);else this.tasks[i]=t;
    sb.from("tasks").upsert({user_id:this.user.id,id:t.id,data:this.clean(t),updated_at:new Date().toISOString()},{onConflict:"user_id,id"}).then(r=>{if(r.error)this.fail()});
  },
  delTask(id){
    this.tasks=this.tasks.filter(x=>x.id!==id);
    sb.from("tasks").delete().eq("user_id",this.user.id).eq("id",id).then(r=>{if(r.error)this.fail()});
  },
  putProject(p){
    this.projects.push(p);
    sb.from("projects").upsert({user_id:this.user.id,id:p.id,data:this.clean(p)},{onConflict:"user_id,id"}).then(r=>{if(r.error)this.fail()});
  },
  saveProfile(){
    sb.from("profiles").upsert({user_id:this.user.id,name:this.myName,insta:this.insta,updated_at:new Date().toISOString()}).then(r=>{if(r.error)this.fail()});
  },
  putInsta(patch){this.insta={...this.insta,...patch};this.saveProfile()},
  setName(n){this.myName=n;this.saveProfile()},
  displayName(){return this.myName||""}
};

/* ================= состояние ================= */
let metaEditing=false;
const S={view:"week",cursor:iso(new Date()),off:{},team:false,activeProject:null,inboxOpen:false};
try{const v=localStorage.getItem(LKEY+"-view");if(v)S.view=v}catch(e){}

const isRepeat=t=>t.repeat&&t.repeat!=="none";
function occursOn(t,k){
  if(!t.date)return false;
  if(!isRepeat(t))return t.date===k;
  if(k<t.date)return false;
  const d=parse(k),s=parse(t.date);
  switch(t.repeat){
    case"daily":return true;
    case"weekdays":return d.getDay()>=1&&d.getDay()<=5;
    case"weekly":return d.getDay()===s.getDay();
    case"monthly":return d.getDate()===s.getDate();
  }return false;
}
const isDone=(t,k)=>isRepeat(t)?(t.doneDates||[]).includes(k):!!t.done;
const visible=t=>{
  if(S.team&&t.cat!=="work")return false;
  if(S.off[t.cat])return false;
  if(S.activeProject&&t.project!==S.activeProject)return false;
  return true;
};
const byTime=a=>a.slice().sort((x,y)=>{const mx=mins(x.time),my=mins(y.time);
  if(mx==null&&my==null)return(x.created||0)-(y.created||0);if(mx==null)return 1;if(my==null)return-1;return mx-my});
const tasksOn=k=>byTime(Store.tasks.filter(t=>occursOn(t,k)&&visible(t)));
const inboxTasks=()=>Store.tasks.filter(t=>!t.date&&t.cat!=="insta"&&visible(t)).sort((a,b)=>(a.created||0)-(b.created||0));
const projName=id=>{const p=Store.projects.find(p=>p.id===id);return p?p.name:""};

/* ================= карточка задачи ================= */
function chip(t,k,extraCls="",style=""){
  const meta=[];
  if(t.time){const e=mins(t.time)+(t.dur||60);meta.push(`<span class="time">${t.time}${extraCls?"–"+hhmm(e):""}</span>`)}
  if(t.cat==="insta"&&t.format)meta.push(`<span class="fmt">${esc(t.format)}</span>`);
  if(t.cat==="insta"&&t.rubric)meta.push(`<span>${esc(t.rubric)}</span>`);
  if(t.project)meta.push(`<span>${esc(projName(t.project))}</span>`);
  if(t.subs&&t.subs.length)meta.push(`<span class="sub">${t.subs.filter(s=>s.done).length}/${t.subs.length}</span>`);
  if(isRepeat(t))meta.push(`<span title="${REPEAT[t.repeat]}">↻</span>`);
  if(t.deadline)meta.push(`<span class="tag-due">дедлайн</span>`);
  if(t.remind!=null)meta.push(`<span title="Напоминание">🔔</span>`);
  const done=isDone(t,k||"");
  return `<div class="task tint ${CATS[t.cat]?.cls||""} ${done?"done":""} ${extraCls}" data-id="${t.id}" data-date="${k||""}" data-drag role="button" tabindex="0" style="${style}">
    <span class="check" data-toggle="${t.id}" data-date="${k||""}" role="checkbox" aria-checked="${done}" aria-label="Готово"></span>
    <span class="tb"><span class="tt">${esc(t.title)}</span>${meta.length?`<span class="tm">${meta.join("")}</span>`:""}</span></div>`;
}

/* ================= боковая панель ================= */
function renderSide(){
  const todayIso=iso(new Date());
  const wk=monday(parse(S.cursor));const days=[...Array(7)].map((_,i)=>iso(addDays(wk,i)));
  const counts={work:0,home:0,hobby:0,insta:0};
  Store.tasks.forEach(t=>days.forEach(k=>{if(occursOn(t,k)&&!isDone(t,k)&&counts[t.cat]!=null)counts[t.cat]++}));
  const catBtns=Object.entries(CATS).filter(([k])=>!S.team||k==="work").map(([k,c])=>
    `<button class="cat ${S.off[k]?"off":""}" data-cat="${k}" aria-pressed="${!S.off[k]}"><span class="dot ${k}"></span>${c.name}<span class="n">${counts[k]}</span></button>`).join("");
  const projs=Store.projects.map(p=>{
    const dl=Store.tasks.filter(t=>t.project===p.id&&t.deadline&&!t.done&&t.date&&t.date>=todayIso).sort((a,b)=>a.date.localeCompare(b.date))[0];
    let txt="без дедлайна",soon=false;
    if(dl){const diff=Math.round((parse(dl.date)-parse(todayIso))/864e5);soon=diff<=3;
      txt="дедлайн "+(diff===0?"сегодня":diff===1?"завтра":parse(dl.date).getDate()+" "+MONTHS[parse(dl.date).getMonth()]);}
    return `<button class="proj ${S.activeProject===p.id?"on":""}" data-proj="${p.id}"><span class="pn">${esc(p.name)}</span><span class="pd ${soon?"soon":""}">${txt}</span></button>`;
  }).join("")||'<p class="hint">Проекты появятся, когда вы создадите рабочую задачу с проектом.</p>';
  const inbox=inboxTasks();
  const hasEx=Store.tasks.some(t=>t.example);
  document.getElementById("side").innerHTML=`

    <div><div class="label">Входящие <span class="num">${inbox.length||""}</span></div>
      <div class="inbox" data-drop="inbox">${inbox.map(t=>chip(t,"")).join("")||'<div class="empty-day">Идеи без даты. Перетащите задачу на день, когда будет ясно.</div>'}</div></div>
    <div><div class="label">Категории</div><div class="cats">${catBtns}</div></div>
    <div><div class="label">Рабочие проекты</div><div class="projects">${projs}</div></div>
    <div><div class="label">Доступ</div>
      <button class="switch" data-team aria-pressed="${S.team}"><span class="track"></span><span>Вид для команды<small>только рабочие задачи</small></span></button></div>
    <div><div class="label">Аккаунт</div>
      <p class="hint">${esc(Store.user?Store.user.email:"")}</p>
      ${("Notification" in window)&&Notification.permission!=="granted"?'<button class="switch" data-notif><span>Включить уведомления<small>о напоминаниях, пока планер открыт</small></span></button>':""}
      <button class="switch" data-signout><span>Выйти</span></button></div>
    <p class="hint">Это ваш личный планер: его видите только вы.${hasEx?` Примеры можно <button data-clear-ex>убрать</button>.`:""}</p>`;
  document.getElementById("mcats").innerHTML=catBtns+`<button class="cat" data-team style="${S.team?"background:rgba(var(--work),.15)":""}">${S.team?"Вид команды ✓":"Вид для команды"}</button>`;
  document.getElementById("inboxN").textContent=inbox.length||"";
  document.getElementById("mInbox").innerHTML=S.inboxOpen?`<div class="panel glass" style="margin-bottom:4px"><div class="label">Входящие</div>
    <div class="inbox" data-drop="inbox">${inbox.map(t=>chip(t,"")).join("")||'<div class="empty-day">Пусто. Задачи без даты попадают сюда.</div>'}</div>
    <p class="hint" style="margin-top:8px">Удерживайте задачу и перетащите её на день.</p></div>`:"";
}

/* ================= виды ================= */
function setTitle(h){document.getElementById("title").innerHTML=h}
function renderWeek(){
  const m=monday(parse(S.cursor)),end=addDays(m,6),today=iso(new Date());
  setTitle(m.getMonth()===end.getMonth()?`<b>${m.getDate()}–${end.getDate()}</b> ${MONTHS[m.getMonth()]}`
    :`<b>${m.getDate()}</b> ${MONTHS[m.getMonth()].slice(0,3)} – <b>${end.getDate()}</b> ${MONTHS[end.getMonth()].slice(0,3)}`);
  let html='<div class="week" id="weekScroller">';
  for(let i=0;i<7;i++){
    const d=addDays(m,i),k=iso(d),list=tasksOn(k);
    html+=`<section class="day glass ${k===today?"today":""} ${k<today?"past":""}" data-drop="date:${k}" data-k="${k}">
      <div class="dh" data-goday="${k}"><span class="dn">${pad(d.getDate())}</span><span class="dw">${WD[i]}${k===today?" · сегодня":""}</span></div>
      <div class="tasks">${list.map(t=>chip(t,k)).join("")||'<div class="empty-day">Свободно</div>'}</div>
      <button class="add-in" data-add="${k}">+ добавить</button></section>`;
  }
  return html+"</div>";
}
function renderDay(){
  const d=parse(S.cursor),k=S.cursor,today=iso(new Date());
  setTitle(`<b>${d.getDate()} ${MONTHS[d.getMonth()]}</b>, ${WDF[(d.getDay()+6)%7]}`);
  const list=tasksOn(k),timed=list.filter(t=>t.time),untimed=list.filter(t=>!t.time);
  let hours="";for(let h=H0;h<H1;h++)hours+=`<div class="hour"><span>${pad(h)}:00</span></div>`;
  const lanes=[];
  const placed=timed.map(t=>{const s=Math.max(mins(t.time),H0*60),e=s+(t.dur||60);let li=lanes.findIndex(x=>x<=s);if(li<0){li=lanes.length;lanes.push(e)}else lanes[li]=e;return{t,s,e,li}});
  const nL=Math.max(1,lanes.length);
  const evs=placed.map(({t,s,e,li})=>{
    const top=12+(s-H0*60)/60*PX,h=Math.max(32,(e-s)/60*PX-4);
    return chip(t,k,"ev",`top:${top}px;height:${h}px;left:calc(64px + (100% - 76px) * ${li}/${nL});width:calc((100% - 76px)/${nL} - 4px)`);
  }).join("");
  let now="";
  if(k===today){const n=new Date(),nm=n.getHours()*60+n.getMinutes();if(nm>=H0*60)now=`<div class="nowline" style="top:${12+(nm-H0*60)/60*PX}px"></div>`;}
  const dues=Store.tasks.filter(t=>t.deadline&&!t.done&&t.date&&t.date>=today&&visible(t)).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,4);
  return `<div class="dayview">
    <div class="timeline glass" data-drop="time:${k}" id="timeline">${hours}${evs}${now}</div>
    <div class="dayside">
      <div class="panel glass" data-drop="date:${k}"><div class="label">Без времени</div><div class="tasks">${untimed.map(t=>chip(t,k)).join("")||'<div class="empty-day">Ничего</div>'}</div></div>
      <div class="panel glass"><div class="label">Ближайшие дедлайны</div><div class="tasks">${dues.map(t=>chip(t,t.date)).join("")||'<div class="empty-day">Спокойно</div>'}</div></div>
      <button class="add-btn tint c-due" data-add="${k}">+ Задача на этот день</button>
    </div></div>`;
}
function renderMonth(){
  const c=parse(S.cursor),first=new Date(c.getFullYear(),c.getMonth(),1),start=monday(first),today=iso(new Date());
  setTitle(`<b>${MONTHS_N[c.getMonth()]}</b> ${c.getFullYear()}`);
  const weeks=Math.ceil(((first.getDay()+6)%7+new Date(c.getFullYear(),c.getMonth()+1,0).getDate())/7);
  let html=`<div class="mhead">${WD.map(w=>`<div>${w}</div>`).join("")}</div><div class="month">`;
  for(let i=0;i<weeks*7;i++){
    const d=addDays(start,i),k=iso(d),list=tasksOn(k);
    html+=`<button class="mc glass ${d.getMonth()!==c.getMonth()?"other":""} ${k===today?"today":""}" data-goday="${k}">
      <span class="md">${pad(d.getDate())}</span>
      ${list.slice(0,3).map(t=>`<span class="mp tint ${t.deadline?"c-due":CATS[t.cat]?.cls}">${esc(t.title)}</span>`).join("")}
      ${list.length>3?`<span class="more">+${list.length-3}</span>`:""}</button>`;
  }
  return html+"</div>";
}

function renderInsta(){
  const m=monday(parse(S.cursor)),end=addDays(m,6),wk=[...Array(7)].map((_,i)=>iso(addDays(m,i)));
  setTitle(`<b>Instagram</b> · контент`);
  const all=Store.tasks.filter(t=>t.cat==="insta");
  const thisWeek=all.filter(t=>wk.includes(t.date));
  const posted=thisWeek.filter(t=>t.status==="posted").length;
  const I=Store.insta,target=I.perWeek||3;
  const pct=Math.min(100,Math.round(thisWeek.length/target*100));
  const rubs=(I.rubrics||[]).map((r,i)=>`<span class="rub tint c-insta">${esc(r)}<button class="x" data-rubx="${i}" aria-label="Удалить рубрику">×</button></span>`).join("");
  const cols=STAGES.map(([k,name])=>{
    const list=all.filter(t=>(t.status||"idea")===k).sort((a,b)=>(a.date||"9").localeCompare(b.date||"9")||(a.created||0)-(b.created||0));
    return `<section class="col glass" data-drop="status:${k}"><h3>${name}<span>${list.length||""}</span></h3>
      <div class="tasks">${list.map(t=>chip(t,t.date||"")).join("")||'<div class="empty-day">Пусто</div>'}</div>
      ${k==="idea"?`<button class="add-in" style="opacity:1" data-add-insta="${k}">+ идея</button>`:""}</section>`;
  }).join("");
  return `<div class="insta">
    <div class="istrat">
      <div class="panel glass"><div class="label" style="margin:0">Цель и стратегия</div>
        <textarea class="goal" id="instaGoal" placeholder="Например: показывать процесс AI-продакшна и приводить 2 заявки в месяц">${esc(I.goal||"")}</textarea></div>
      <div class="panel glass"><div class="label" style="margin:0">Неделя ${m.getDate()}–${end.getDate()} ${MONTHS[end.getMonth()].slice(0,3)}</div>
        <div class="meter"><b>${thisWeek.length}</b><span>из ${target} публикаций в плане · ${posted} ${plural(posted,["вышла","вышли","вышло"])}</span></div>
        <div class="bar"><i style="width:${pct}%"></i></div>
        <div class="stepper">Цель в неделю <button data-per="-1" aria-label="Меньше">−</button><b>${target}</b><button data-per="1" aria-label="Больше">+</button></div></div>
      <div class="panel glass"><div class="label" style="margin:0">Рубрики</div>
        <div class="rubrics">${rubs}<input class="rubadd" id="rubAdd" placeholder="+ рубрика, Enter"></div></div>
    </div>
    <div class="board">${cols}</div>
    <p class="hint">Публикации с датой видны и в календаре розовым. Перетаскивайте карточки между этапами.</p>
  </div>`;
}

let lastWeekKey=null;
function render(){
  if(drag&&drag.started)return;
  renderSide();
  document.querySelectorAll("#viewSeg button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.v===S.view));
  const v=document.getElementById("view");
  const prevScroll=document.getElementById("weekScroller")?.scrollLeft;
  v.innerHTML=S.view==="day"?renderDay():S.view==="month"?renderMonth():S.view==="insta"?renderInsta():renderWeek();
  const g=document.getElementById("instaGoal");
  if(g){g.onfocus=()=>metaEditing=true;g.onblur=()=>{metaEditing=false;if(g.value!==(Store.insta.goal||""))Store.putInsta({goal:g.value})}}
  const ra=document.getElementById("rubAdd");
  if(ra)ra.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();const v=ra.value.trim();if(v){Store.putInsta({rubrics:[...(Store.insta.rubrics||[]),v]});render();document.getElementById("rubAdd")?.focus()}}};
  const sc=document.getElementById("weekScroller");
  if(sc&&sc.scrollWidth>sc.clientWidth){
    const wkKey=iso(monday(parse(S.cursor)));
    if(lastWeekKey===wkKey&&prevScroll!=null)sc.scrollLeft=prevScroll;
    else{const t=sc.querySelector(".day.today")||sc.querySelector(`[data-k="${S.cursor}"]`);if(t)sc.scrollLeft=t.offsetLeft-16}
    lastWeekKey=wkKey;
  }
  const d=new Date(),k=iso(d);
  const open=Store.tasks.filter(t=>occursOn(t,k)&&!isDone(t,k)&&visible(t)).length;
  document.getElementById("subtitle").textContent=`Сегодня ${WDF[(d.getDay()+6)%7]}, ${d.getDate()} ${MONTHS[d.getMonth()]} · ${open?open+" "+plural(open,["задача","задачи","задач"]):"дел нет"}`;
  let b="";
  if(S.team)b+=`<div class="banner glass">Так вашу неделю видят коллеги: только рабочие задачи и проекты. Дом и хобби скрыты.</div>`;
  if(S.activeProject)b+=`<div class="banner glass" style="margin-top:8px">Показан проект «${esc(projName(S.activeProject))}». <button data-clr-proj>Показать всё</button></div>`;
  document.getElementById("bannerSlot").innerHTML=b;
}

/* ================= редактор ================= */
function openEditor(task,presetDate,preset){
  const isNew=!task;
  const t=task?JSON.parse(JSON.stringify(task)):{id:uid(),title:"",cat:"work",date:presetDate===undefined?S.cursor:presetDate,time:"",dur:60,deadline:false,remind:null,done:false,note:"",project:S.activeProject||null,repeat:"none",subs:[],created:Date.now(),...(preset||{})};
  t.subs=t.subs||[];
  const slot=document.getElementById("modalSlot");
  const projOpts=`<option value="">Без проекта</option>`+Store.projects.map(p=>`<option value="${p.id}" ${t.project===p.id?"selected":""}>${esc(p.name)}</option>`).join("")+`<option value="__new">+ Новый проект…</option>`;
  slot.innerHTML=`<div class="scrim" id="scrim"><form class="sheet glass" id="form" autocomplete="off">
    <h2>${isNew?"Новая задача":"Задача"}</h2>
    <input class="title-in" id="f-title" placeholder="Что нужно сделать?" value="${esc(t.title)}">
    <div class="field"><span class="fl">Категория</span><div class="catpick" id="f-cat">
      ${Object.entries(CATS).map(([k,c])=>`<button type="button" class="tint ${c.cls}" data-c="${k}" aria-pressed="${t.cat===k}">${c.name}</button>`).join("")}</div></div>
    <div class="field" id="projField"><label for="f-proj">Проект</label><select id="f-proj">${projOpts}</select>
      <input id="f-newproj" placeholder="Название проекта" hidden></div>
    <div class="row" id="instaFields">
      <div class="field"><label for="f-fmt">Формат</label><select id="f-fmt">${FORMATS.map(f=>`<option ${t.format===f?"selected":""}>${f}</option>`).join("")}</select></div>
      <div class="field"><label for="f-rub">Рубрика</label><select id="f-rub"><option value="">Без рубрики</option>${(Store.insta.rubrics||[]).map(r=>`<option ${t.rubric===r?"selected":""}>${esc(r)}</option>`).join("")}</select></div>
      <div class="field"><label for="f-stage">Этап</label><select id="f-stage">${STAGES.map(([k,n])=>`<option value="${k}" ${(t.status||"idea")===k?"selected":""}>${n}</option>`).join("")}</select></div>
    </div>
    <div class="toggles"><button type="button" class="chk tint c-work" id="f-inbox" aria-pressed="${!t.date}"><span class="box"></span>Без даты, во входящие</button></div>
    <div class="row">
      <div class="field"><label for="f-date">Дата</label><input type="date" id="f-date" value="${t.date||S.cursor}" ${t.date?"":"disabled"}></div>
      <div class="field"><label for="f-time">Время</label><input type="time" id="f-time" value="${t.time||""}" ${t.date?"":"disabled"}></div>
    </div>
    <div class="row">
      <div class="field"><label for="f-dur">Длительность</label><select id="f-dur">
        ${[[15,"15 мин"],[30,"30 мин"],[45,"45 мин"],[60,"1 час"],[90,"1,5 часа"],[120,"2 часа"],[180,"3 часа"],[240,"4 часа"]].map(([v,l])=>`<option value="${v}" ${t.dur==v?"selected":""}>${l}</option>`).join("")}</select></div>
      <div class="field"><label for="f-rep">Повтор</label><select id="f-rep">
        ${Object.entries(REPEAT).map(([v,l])=>`<option value="${v}" ${(t.repeat||"none")===v?"selected":""}>${l}</option>`).join("")}</select></div>
      <div class="field"><label for="f-rem">Напомнить</label><select id="f-rem">
        ${[["","Не напоминать"],[0,"В момент начала"],[10,"За 10 минут"],[30,"За 30 минут"],[60,"За 1 час"],[1440,"За день"]].map(([v,l])=>`<option value="${v}" ${String(t.remind??"")===String(v)?"selected":""}>${l}</option>`).join("")}</select></div>
    </div>
    <div class="toggles"><button type="button" class="chk tint c-due" id="f-due" aria-pressed="${!!t.deadline}"><span class="box"></span>Это дедлайн</button></div>
    <div class="field"><span class="fl">Подзадачи</span><div class="subs" id="f-subs"></div>
      <input class="subadd" id="f-subadd" placeholder="+ Добавить подзадачу и нажать Enter"></div>
    <div class="field"><label for="f-note">Заметка</label><textarea id="f-note" placeholder="Детали, ссылки…">${esc(t.note||"")}</textarea></div>
    <div class="actions">
      <span>${isNew?"":`<button type="button" class="btn danger" id="f-del">Удалить</button>`}</span>
      <span style="display:flex;gap:8px"><button type="button" class="btn ghost" id="f-cancel">Отмена</button><button type="submit" class="btn primary tint c-work">Сохранить</button></span>
    </div></form></div>`;
  const $=id=>document.getElementById(id);
  const syncProj=()=>{$("projField").hidden=t.cat!=="work";$("instaFields").hidden=t.cat!=="insta";
    $("f-inbox").lastChild.textContent=t.cat==="insta"?"Без даты публикации":"Без даты, во входящие"};
  const drawSubs=()=>{$("f-subs").innerHTML=t.subs.map((s,i)=>`<div class="subrow ${s.done?"done":""}"><button type="button" class="sbox" role="checkbox" aria-checked="${s.done}" data-si="${i}" aria-label="Готово"></button><span>${esc(s.text)}</span><button type="button" class="x" data-sx="${i}" aria-label="Удалить">×</button></div>`).join("")};
  syncProj();drawSubs();
  $("f-cat").onclick=e=>{const b=e.target.closest("[data-c]");if(!b)return;t.cat=b.dataset.c;$("f-cat").querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",x===b));syncProj()};
  $("f-proj").onchange=e=>{$("f-newproj").hidden=e.target.value!=="__new";if(e.target.value==="__new")$("f-newproj").focus()};
  $("f-due").onclick=()=>{t.deadline=!t.deadline;$("f-due").setAttribute("aria-pressed",t.deadline)};
  let inbox=!t.date;
  $("f-inbox").onclick=()=>{inbox=!inbox;$("f-inbox").setAttribute("aria-pressed",inbox);$("f-date").disabled=inbox;$("f-time").disabled=inbox};
  $("f-subs").onclick=e=>{const c=e.target.closest("[data-si]");if(c){const s=t.subs[+c.dataset.si];s.done=!s.done;drawSubs()}
    const x=e.target.closest("[data-sx]");if(x){t.subs.splice(+x.dataset.sx,1);drawSubs()}};
  $("f-subadd").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();const v=e.target.value.trim();if(v){t.subs.push({id:uid(),text:v,done:false});e.target.value="";drawSubs()}}};
  const close=()=>{slot.innerHTML=""};
  $("f-cancel").onclick=close;
  $("scrim").onclick=e=>{if(e.target.id==="scrim")close()};
  if($("f-del")){let armed=false;$("f-del").onclick=()=>{
    if(!armed){armed=true;$("f-del").textContent=isRepeat(t)?"Удалить всю серию?":"Точно удалить?";return}
    Store.delTask(t.id);close();render();}}
  $("form").onsubmit=e=>{
    e.preventDefault();
    t.title=$("f-title").value.trim();if(!t.title){$("f-title").focus();return}
    const pending=$("f-subadd").value.trim();if(pending)t.subs.push({id:uid(),text:pending,done:false});
    t.date=inbox?"":($("f-date").value||S.cursor);t.time=inbox?"":$("f-time").value;t.dur=+$("f-dur").value;
    t.repeat=inbox?"none":$("f-rep").value;
    const r=$("f-rem").value;t.remind=r===""?null:+r;t.note=$("f-note").value;
    if(t.cat==="work"){
      let p=$("f-proj").value;
      if(p==="__new"){const n=$("f-newproj").value.trim();if(n){const np={id:uid(),name:n};Store.putProject(np);p=np.id}else p=""}
      t.project=p||null;
    }else t.project=null;
    if(t.cat==="insta"){t.format=$("f-fmt").value;t.rubric=$("f-rub").value;t.status=$("f-stage").value;t.done=t.status==="posted"}
    delete t.example;
    Store.putTask(t);close();render();
  };
  setTimeout(()=>{if(isNew)$("f-title").focus()},60);
}

/* ================= уведомления ================= */
function toast(title,sub,action){
  const el=document.createElement("div");el.className="toast glass";
  el.innerHTML=`<div class="tx"><b>${esc(title)}</b><span>${esc(sub)}</span></div>${action?`<button>${esc(action.label)}</button>`:""}`;
  if(action)el.querySelector("button").onclick=()=>{action.run();el.remove()};
  document.getElementById("toasts").appendChild(el);setTimeout(()=>el.remove(),action?10000:9000);
}
const fired=new Set();
function checkReminders(){
  const now=Date.now(),today=new Date();
  [iso(today),iso(addDays(today,1))].forEach(k=>{
    Store.tasks.forEach(t=>{
      if(t.remind==null||!t.time||!occursOn(t,k)||isDone(t,k))return;
      const key=t.id+k;if(fired.has(key))return;
      const start=parse(k);const m=mins(t.time);start.setHours(Math.floor(m/60),m%60,0,0);
      const at=start.getTime()-t.remind*60000;
      if(now>=at&&now<start.getTime()+5*60000){
        fired.add(key);
        const body=t.remind===0?"Начинается сейчас":`${t.remind>=1440?"Завтра":"Через "+(t.remind>=60?t.remind/60+" ч":t.remind+" мин")} · ${t.time}`;
        try{if("Notification" in window&&Notification.permission==="granted"&&document.hidden)navigator.serviceWorker?.ready.then(r=>r.showNotification(t.title,{body,icon:"/icons/icon-192.png",tag:key}))}catch(e){}
        toast(t.title,t.remind===0?"Начинается сейчас":`${t.remind>=1440?"Завтра":"Через "+(t.remind>=60?t.remind/60+" ч":t.remind+" мин")} · ${t.time}`);
      }
    });
  });
}

/* ================= перетаскивание ================= */
let drag=null,suppressClick=false;
function startDrag(){
  if(!drag)return;drag.started=true;
  const r=drag.el.getBoundingClientRect();
  const g=drag.el.cloneNode(true);g.classList.add("ghost-drag");g.classList.remove("ev");
  g.style.cssText=`width:${Math.min(r.width,260)}px;left:${r.left}px;top:${r.top}px`;
  document.body.appendChild(g);drag.ghost=g;drag.dx=drag.x-r.left;drag.dy=drag.y-r.top;
  drag.el.classList.add("dragging");
  try{navigator.vibrate&&navigator.vibrate(12)}catch(e){}
}
function dropTarget(x,y){
  const el=document.elementFromPoint(x,y);
  return el?el.closest("[data-drop]"):null;
}
function timeFromY(tl,y,dy){
  const r=tl.getBoundingClientRect();
  let m=H0*60+Math.round(((y-r.top-12-(dy||0)+4)/PX*60)/15)*15;
  return Math.max(H0*60,Math.min((H1*60)-15,m));
}
document.addEventListener("pointerdown",e=>{
  if(e.button>0)return;
  const el=e.target.closest("[data-drag]");
  if(!el||e.target.closest("[data-toggle]"))return;
  drag={el,id:el.dataset.id,from:el.dataset.date,x:e.clientX,y:e.clientY,started:false,touch:e.pointerType!=="mouse"};
  if(drag.touch)drag.timer=setTimeout(startDrag,320);
});
document.addEventListener("pointermove",e=>{
  if(!drag)return;
  const dist=Math.hypot(e.clientX-drag.x,e.clientY-drag.y);
  if(!drag.started){
    if(!drag.touch&&dist>6)startDrag();
    else if(drag.touch&&dist>10){clearTimeout(drag.timer);drag=null;return}
    if(!drag||!drag.started)return;
  }
  e.preventDefault();
  drag.ghost.style.left=(e.clientX-drag.dx)+"px";drag.ghost.style.top=(e.clientY-drag.dy)+"px";
  document.querySelectorAll(".drop-on").forEach(n=>n.classList.remove("drop-on"));
  document.querySelector(".droptime")?.remove();
  const tg=dropTarget(e.clientX,e.clientY);
  if(tg){
    if(tg.dataset.drop.startsWith("time:")){
      const m=timeFromY(tg,e.clientY,drag.dy);
      const line=document.createElement("div");line.className="droptime";line.style.top=(12+(m-H0*60)/60*PX)+"px";line.innerHTML=`<span>${hhmm(m)}</span>`;tg.appendChild(line);
    }else tg.classList.add("drop-on");
  }
  const sc=document.getElementById("weekScroller");
  if(sc&&sc.scrollWidth>sc.clientWidth){const r=sc.getBoundingClientRect();
    if(e.clientX<r.left+40)sc.scrollLeft-=12;else if(e.clientX>r.right-40)sc.scrollLeft+=12;}
},{passive:false});
document.addEventListener("touchmove",e=>{if(drag&&drag.started)e.preventDefault()},{passive:false});
function endDrag(e,cancel){
  if(!drag)return;clearTimeout(drag.timer);
  const d=drag;drag=null;
  if(!d.started)return;
  suppressClick=true;setTimeout(()=>suppressClick=false,50);
  d.ghost.remove();d.el.classList.remove("dragging");
  document.querySelectorAll(".drop-on").forEach(n=>n.classList.remove("drop-on"));
  if(cancel){render();return}
  const tg=dropTarget(e.clientX,e.clientY);
  const t=Store.tasks.find(x=>x.id===d.id);
  if(!tg||!t){render();return}
  const nt={...t};const spec=tg.dataset.drop;
  const moveTo=k=>{
    if(isRepeat(t)&&d.from&&t.date){const delta=Math.round((parse(k)-parse(d.from))/864e5);nt.date=iso(addDays(parse(t.date),delta))}
    else nt.date=k;
  };
  if(spec.startsWith("status:")){nt.status=spec.slice(7);nt.done=nt.status==="posted";Store.putTask(nt);render();return}
  if(spec==="inbox"){nt.date="";nt.time="";nt.repeat="none"}
  else if(spec.startsWith("date:"))moveTo(spec.slice(5));
  else if(spec.startsWith("time:")){moveTo(spec.slice(5));nt.time=hhmm(timeFromY(tg,e.clientY,d.dy));}
  Store.putTask(nt);render();
  if(spec!=="inbox"){const k=spec.slice(5);const dd=parse(k);toast("Перенесено",`${esc(t.title)} → ${dd.getDate()} ${MONTHS[dd.getMonth()]}${nt.time?", "+nt.time:""}`,{label:"Отменить",run:()=>{Store.putTask(t);render()}})}
}
document.addEventListener("pointerup",e=>endDrag(e,false));
document.addEventListener("pointercancel",e=>endDrag(e,true));
document.addEventListener("contextmenu",e=>{if(e.target.closest("[data-drag]"))e.preventDefault()});

/* ================= клики ================= */
document.addEventListener("click",e=>{
  if(suppressClick){e.stopPropagation();e.preventDefault();return}
  const tg=e.target.closest("[data-toggle]");
  if(tg){e.stopPropagation();const t=Store.tasks.find(x=>x.id===tg.dataset.toggle);if(!t)return;const nt={...t};const k=tg.dataset.date;
    if(isRepeat(t)){const s=new Set(t.doneDates||[]);s.has(k)?s.delete(k):s.add(k);nt.doneDates=[...s]}else nt.done=!t.done;
    if(t.cat==="insta")nt.status=nt.done?"posted":(t.status==="posted"?"ready":t.status);
    Store.putTask(nt);render();return}
  const task=e.target.closest(".task[data-id]");
  if(task&&!task.closest(".ghost-drag")){openEditor(Store.tasks.find(x=>x.id===task.dataset.id));return}
  const add=e.target.closest("[data-add]");if(add){openEditor(null,add.dataset.add);return}
  const ai=e.target.closest("[data-add-insta]");if(ai){openEditor(null,"",{cat:"insta",status:ai.dataset.addInsta,format:"Reels"});return}
  const per=e.target.closest("[data-per]");if(per){Store.putInsta({perWeek:Math.max(1,Math.min(21,(Store.insta.perWeek||3)+ +per.dataset.per))});render();return}
  const rx=e.target.closest("[data-rubx]");if(rx){const r=[...(Store.insta.rubrics||[])];r.splice(+rx.dataset.rubx,1);Store.putInsta({rubrics:r});render();return}
  const go=e.target.closest("[data-goday]");if(go){S.cursor=go.dataset.goday;setView("day");return}
  const cat=e.target.closest("[data-cat]");if(cat){S.off[cat.dataset.cat]=!S.off[cat.dataset.cat];render();return}
  const pr=e.target.closest("[data-proj]");if(pr){S.activeProject=S.activeProject===pr.dataset.proj?null:pr.dataset.proj;render();return}
  if(e.target.closest("[data-editname]")){editName();return}
  if(e.target.closest("[data-signout]")){sb.auth.signOut();return}
  if(e.target.closest("[data-notif]")){Notification.requestPermission().then(()=>render());return}
  if(e.target.closest("[data-team]")){S.team=!S.team;render();return}
  if(e.target.closest("[data-clr-proj]")){S.activeProject=null;render();return}
  if(e.target.closest("[data-clear-ex]")){Store.tasks.filter(t=>t.example).forEach(t=>Store.delTask(t.id));render();return}
},true);
document.addEventListener("keydown",e=>{
  if(e.key==="Escape")document.getElementById("modalSlot").innerHTML="";
  if(e.key==="Enter"&&e.target.matches(".task[data-id]"))e.target.click();
});
function setView(v){S.view=v;try{localStorage.setItem(LKEY+"-view",v)}catch(e){}render()}
document.getElementById("viewSeg").onclick=e=>{const b=e.target.closest("[data-v]");if(b)setView(b.dataset.v)};
const step=dir=>{const c=parse(S.cursor);
  if(S.view==="day")S.cursor=iso(addDays(c,dir));
  else if(S.view==="week")S.cursor=iso(addDays(c,7*dir));
  else S.cursor=iso(new Date(c.getFullYear(),c.getMonth()+dir,1));render()};
document.getElementById("prev").onclick=()=>step(-1);
document.getElementById("next").onclick=()=>step(1);
document.getElementById("todayBtn").onclick=()=>{S.cursor=iso(new Date());render()};
const quickAdd=()=>S.view==="insta"?openEditor(null,"",{cat:"insta",status:"idea",format:"Reels"}):openEditor(null);
document.getElementById("addBtn").onclick=quickAdd;
document.getElementById("fab").onclick=quickAdd;
document.getElementById("inboxBtn").onclick=()=>{S.inboxOpen=!S.inboxOpen;render()};

/* ================= голосовой ассистент ================= */
const assist=document.getElementById("assist"),aIn=document.getElementById("assistIn"),hint=document.getElementById("assistHint");
function showHint(t){hint.textContent=t;hint.hidden=!t}
document.getElementById("mic").onclick=()=>{
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  const fallback=()=>{aIn.focus();showHint("Нажмите на поле и включите диктовку: на iPhone значок микрофона на клавиатуре, на Mac дважды нажмите Fn. Потом «Добавить».")};
  if(!SR)return fallback();
  try{
    const rec=new SR();rec.lang="ru-RU";rec.interimResults=true;
    const mic=document.getElementById("mic");mic.classList.add("live");showHint("Слушаю…");
    rec.onresult=ev=>{aIn.value=[...ev.results].map(r=>r[0].transcript).join(" ")};
    rec.onerror=()=>{mic.classList.remove("live");fallback()};
    rec.onend=()=>{mic.classList.remove("live");if(aIn.value.trim()){showHint("");assist.requestSubmit()}};
    rec.start();
  }catch(e){fallback()}
};
assist.onsubmit=async e=>{
  e.preventDefault();
  const text=aIn.value.trim();if(!text)return;
  const now=new Date();
  assist.classList.add("busy");showHint("");
  try{
    const {data:{session}}=await sb.auth.getSession();
    const r=await fetch("/api/parse",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+(session?session.access_token:"")},
      body:JSON.stringify({text,today:iso(now),now:hhmm(now.getHours()*60+now.getMinutes()),projects:Store.projects.map(p=>p.name),rubrics:Store.insta.rubrics||[]})});
    if(r.status===503){showHint("Ассистент ещё не подключён. Пока можно добавить задачу через «+ Задача».");return}
    if(r.status===429){showHint("Слишком много запросов подряд. Подождите минуту.");return}
    if(!r.ok)throw new Error("parse "+r.status);
    const res=await r.json();
    const list=(res&&Array.isArray(res.tasks))?res.tasks:[];
    if(!list.length){showHint("Не получилось разобрать фразу. Попробуйте сказать иначе, например: «завтра в 10 созвон с клиентом».");return}
    const added=[];
    list.forEach(x=>{
      let pid=null;
      if(x.project){const ex=Store.projects.find(p=>p.name.toLowerCase()===String(x.project).toLowerCase());
        if(ex)pid=ex.id;else{const np={id:uid(),name:String(x.project)};Store.putProject(np);pid=np.id}}
      const t={id:uid(),title:String(x.title||text).slice(0,200),cat:CATS[x.cat]?x.cat:"work",project:x.cat==="work"||!CATS[x.cat]?pid:null,
        date:/^\d{4}-\d{2}-\d{2}$/.test(x.date||"")?x.date:"",time:/^\d{2}:\d{2}$/.test(x.time||"")?x.time:"",
        dur:+x.dur||60,deadline:!!x.deadline,remind:x.remind==null?null:+x.remind,repeat:REPEAT[x.repeat]?x.repeat:"none",
        subs:(x.subs||[]).map(s=>({id:uid(),text:String(s),done:false})),done:false,note:"",created:Date.now()};
      if(t.cat==="insta"){t.format=FORMATS.includes(x.format)?x.format:"Reels";t.status=STAGES.some(([k])=>k===x.status)?x.status:"idea";t.rubric=(Store.insta.rubrics||[]).includes(x.rubric)?x.rubric:"";t.done=t.status==="posted"}
      if(!t.date){t.time="";t.repeat="none"}
      Store.putTask(t);added.push(t);
    });
    aIn.value="";
    const f=added[0];
    if(f.date&&S.view!=="month")S.cursor=f.date;
    render();
    const when=f.date?`${parse(f.date).getDate()} ${MONTHS[parse(f.date).getMonth()]}${f.time?", "+f.time:""}`:"во входящие";
    toast(added.length>1?`Добавлено задач: ${added.length}`:f.title,added.length>1?added.map(a=>a.title).join(" · "):when,
      {label:"Отменить",run:()=>{added.forEach(a=>Store.delTask(a.id));render()}});
  }catch(err){
    showHint("Не получилось связаться с ассистентом. Попробуйте ещё раз.");
  }finally{assist.classList.remove("busy")}
};

/* ================= приветствие ================= */
let editingName=false;
function renderHello(){
  if(editingName)return;
  const h=document.getElementById("hello"),n=Store.displayName();
  h.innerHTML=n?`Hello, <span class="nm" data-editname title="Изменить имя">${esc(n)}</span>`:`Hello<button class="ask" data-editname>Как вас зовут?</button>`;
}
function editName(){
  editingName=true;
  const h=document.getElementById("hello");
  h.innerHTML=`Hello, <input id="nameIn" aria-label="Ваше имя" placeholder="Имя" value="${esc(Store.displayName())}">`;
  const i=document.getElementById("nameIn");i.focus();i.select();
  const done=save=>{if(!editingName)return;editingName=false;const v=i.value.trim();if(save&&v)Store.setName(v);renderHello()};
  i.onkeydown=e=>{if(e.key==="Enter")done(true);if(e.key==="Escape")done(false)};
  i.onblur=()=>done(true);
}

/* ================= часы и погода ================= */
function tick(){const n=new Date();document.getElementById("clockNow").textContent=hhmm(n.getHours()*60+n.getMinutes())}
tick();setInterval(tick,10000);
const WKEY="planner-geo";
const WCODES=[[0,"☀️","ясно"],[2,"🌤","малооблачно"],[3,"☁️","облачно"],[48,"🌫","туман"],[57,"🌦","морось"],[67,"🌧","дождь"],[77,"🌨","снег"],[82,"🌧","ливень"],[86,"🌨","снегопад"],[99,"⛈","гроза"]];
async function loadWeather(lat,lon){
  try{
    const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}&current=temperature_2m,weather_code&timezone=auto`);
    const j=await r.json();const c=j.current;const w=WCODES.find(([m])=>c.weather_code<=m)||WCODES[0];
    const el=document.getElementById("weather");el.textContent=`${w[1]} ${Math.round(c.temperature_2m)}°`;el.title=w[2];
  }catch(e){}
}
function askWeather(){
  if(!navigator.geolocation)return;
  navigator.geolocation.getCurrentPosition(p=>{
    const g={lat:p.coords.latitude,lon:p.coords.longitude};
    try{localStorage.setItem(WKEY,JSON.stringify(g))}catch(e){}
    loadWeather(g.lat,g.lon);
  },()=>{document.getElementById("weather").textContent="Погода недоступна"},{maximumAge:36e5,timeout:10000});
}
document.getElementById("weather").onclick=askWeather;
try{const g=JSON.parse(localStorage.getItem(WKEY)||"null");if(g){loadWeather(g.lat,g.lon);setInterval(()=>loadWeather(g.lat,g.lon),30*60000)}}catch(e){}

/* ================= вход ================= */
const authEl=document.getElementById("auth"),appEl=document.getElementById("app"),fab=document.getElementById("fab");
let authMode="signin";
function authShow(mode,msg){
  authMode=mode;
  const T={signin:["Hello","Войдите, чтобы открыть свой планер.","Войти"],signup:["Новый планер","Создайте аккаунт: у вас будет свой личный планер.","Создать аккаунт"],
    reset:["Пароль","Пришлём на почту ссылку для нового пароля.","Отправить ссылку"],newpass:["Новый пароль","Придумайте новый пароль.","Сохранить пароль"]}[mode];
  document.getElementById("authTitle").textContent=T[0];document.getElementById("authSub").textContent=T[1];document.getElementById("authGo").textContent=T[2];
  document.getElementById("nameRow").hidden=mode!=="signup";
  document.getElementById("emailRow").hidden=mode==="newpass";
  document.getElementById("passRow").hidden=mode==="reset";
  document.getElementById("aEmail").required=mode!=="newpass";
  document.getElementById("aPass").required=mode!=="reset";
  document.getElementById("aPass").autocomplete=mode==="signin"?"current-password":"new-password";
  document.getElementById("toSignup").textContent=mode==="signin"?"Создать аккаунт":"У меня уже есть аккаунт";
  document.getElementById("toReset").hidden=mode!=="signin";
  authMsg(msg||"");
}
function authMsg(t){const m=document.getElementById("authMsg");m.textContent=t;m.hidden=!t}
document.getElementById("toSignup").onclick=()=>authShow(authMode==="signin"?"signup":"signin");
document.getElementById("toReset").onclick=()=>authShow("reset");
const RU_ERR=m=>/Invalid login/i.test(m)?"Неверная почта или пароль.":/already registered/i.test(m)?"Такая почта уже зарегистрирована. Войдите или восстановите пароль.":/Email not confirmed/i.test(m)?"Почта ещё не подтверждена. Откройте письмо и нажмите на ссылку.":/Password should be/i.test(m)?"Пароль слишком короткий: нужно не меньше 6 символов.":/rate limit/i.test(m)?"Слишком много попыток. Подождите пару минут.":"Не получилось: "+m;
document.getElementById("authForm").onsubmit=async e=>{
  e.preventDefault();
  const email=document.getElementById("aEmail").value.trim(),password=document.getElementById("aPass").value,name=document.getElementById("aName").value.trim();
  const go=document.getElementById("authGo");go.disabled=true;authMsg("");
  try{
    let r;
    if(authMode==="signin")r=await sb.auth.signInWithPassword({email,password});
    else if(authMode==="signup"){
      r=await sb.auth.signUp({email,password,options:{data:{name},emailRedirectTo:location.origin}});
      if(!r.error&&!r.data.session){authShow("signin","Готово! Мы отправили письмо на "+email+". Подтвердите почту по ссылке и войдите.");return}
    }
    else if(authMode==="reset"){r=await sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin});if(!r.error){authShow("signin","Письмо со ссылкой отправлено на "+email+".");return}}
    else if(authMode==="newpass"){r=await sb.auth.updateUser({password});if(!r.error){history.replaceState(null,"",location.pathname);toast("Пароль обновлён","");}}
    if(r&&r.error)authMsg(RU_ERR(r.error.message));
  }catch(err){authMsg("Нет соединения. Проверьте интернет и попробуйте ещё раз.")}
  finally{go.disabled=false}
};

let started=false;
async function enter(user){
  authEl.hidden=true;appEl.hidden=false;fab.hidden=false;
  await Store.load(user);
  render();renderHello();
  if(!started){started=true;checkReminders();setInterval(()=>{checkReminders();if(S.view==="day"&&!document.getElementById("modalSlot").innerHTML)render()},30000)}
}
function leave(){Store.reset();appEl.hidden=true;fab.hidden=true;authEl.hidden=false;authShow("signin")}

/* ================= старт ================= */
if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js").catch(()=>{});
if(!sb){
  authEl.hidden=false;authShow("signin","Планер ещё не подключён к базе данных: заполните config.js.");
  document.getElementById("authGo").disabled=true;
}else{
  let current=null;
  sb.auth.onAuthStateChange((ev,session)=>{
    if(ev==="PASSWORD_RECOVERY"){appEl.hidden=true;authEl.hidden=false;authShow("newpass");return}
    const u=session?session.user:null;
    if(u&&(!current||current.id!==u.id)){current=u;enter(u)}
    else if(!u&&current!==false){current=false;leave()}
  });
}
})();
