/* ===== Built-in AI assistant =====
   A role-aware help assistant available across the app. It answers two kinds of
   questions, fully offline (no API key / backend):
   1. "How do I…" / "what does X do" — from a feature knowledge base, with a jump
      link to the relevant screen.
   2. Personal queries — "what's my roster / hours / pay / tasks / TFN / super" —
      answered by reading the live local data for the signed-in user.
   It renders as a floating 💬 button + chat panel mounted on <body>, so it
   survives route re-renders. Hidden on the public customer/join pages.

   (Pluggable: if MKR.assistant.llm is set to an async fn, free-form questions can
    be routed to a real LLM later — the built-in answers are the default.)
*/
window.MKR = window.MKR || {};
(function(){
  const U = MKR.util;
  const DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  let mounted=false, openState=false, btn=null, panel=null, log=null, started=false;

  // ---------- Feature knowledge base (role-aware; EN + 中文 keywords) ----------
  const KB = [
    {id:'roster', roles:['owner','manager'], go:'#/manager/schedule', k:['roster','rostering','schedule','rota','排班','排班表'],
      a:'Open <b>Rostering</b> to plan the week. Tap ✨ AI auto-roster — the first time it asks how you like your roster (how many people per day-part, what to warn you about, who can open/close/cook), then plans from availability, skills and how many people you rostered in past weeks. Drag chips between days to adjust. Nothing is ever blocked; you just get warnings.'},
    {id:'rosterprefs', roles:['owner','manager'], go:'#/manager/schedule', k:['preference','preferences','warning','warnings','limit','max hours','偏好','提醒','警告','工时上限'],
      a:'In <b>Rostering → ⚙️ Preferences</b> you set what the AI optimises for and <b>when it should warn you</b> — long weeks, too many days straight, short breaks between shifts. These are warnings, never limits: the roster always saves.'},
    {id:'skills', roles:['owner','manager'], go:'#/manager/schedule', k:['skill','skills','open','close','技能','会开店','会关店'],
      a:'Skills (🔑 open · 🌙 close · 🍳 kitchen · ☕ coffee · ⭐ shift lead) drive the plan. Set them in <b>Rostering → Preferences</b> or on anyone\'s profile — the roster then makes sure each day has someone who can open, close and cook.'},
    {id:'addusers', roles:['owner','manager'], go:'#/manager/hire', k:['add user','add staff','hire','new starter','加人','添加员工','招聘'],
      a:'Use <b>Add Users</b>: enter a phone number, role and skills, and it creates a staff login plus an onboarding link. To add a <b>manager</b>, share the “Manager join link” from the owner Team page.'},
    {id:'stock', roles:['owner','manager'], go:'#/manager/stock', k:['stock','inventory','ingredient','cost','price','库存','原料','食材','成本','价格'],
      a:'<b>Stock &amp; costs</b> tracks raw ingredients and the tools that run out (chopsticks, containers, gloves) — quantity, unit price, amount and a total value. Each item keeps a price history, so you can see ▲ / ▼ against what you paid last time.'},
    {id:'stocktake', roles:['owner','manager','staff'], go:'#/manager/stock', k:['stocktake','count','盘点','点存货','数库存'],
      a:'In <b>Stock</b> tap 🔢 Stocktake and type what you actually count. This is the only place usage comes from — there is no till in this app — so counting regularly is what makes the forecast work.'},
    {id:'forecast', roles:['owner','manager'], go:'#/manager/stock', k:['forecast','how much used','running out','order list','预测','用了多少','要订货'],
      a:'The <b>Forecast</b> tab works out how much of each ingredient you get through per day (last count + purchases − this count), how many days of cover you have left, and how much to order. Tap ✨ Ask AI for a plain-English read.'},
    {id:'suppliers', roles:['owner','manager'], go:'#/manager/stock', k:['supplier','who to call','purchase','buy','供应商','在哪买','采购','联系人'],
      a:'The <b>Suppliers</b> tab keeps who you buy from, who you actually ring and their number. <b>Purchases</b> keeps every invoice — what you bought, from whom and at what price.'},
    {id:'deliveries', roles:['owner','manager','staff'], go:'#/manager/deliveries', k:['delivery','deliveries','receive','docket','送货','收货','确认'],
      a:'<b>Deliveries</b> is the back-door check. Open it before the driver leaves, enter what actually arrived (not what was ordered), record chilled temperatures, photograph any damage and sign. Short or damaged lines are flagged so you can chase them before you pay the invoice.'},
    {id:'training', roles:['owner','manager','staff'], go:'#/manager/training', k:['training','sop','procedure','how we do it','培训','流程','标准'],
      a:'<b>Training &amp; SOP</b>: write a procedure once, assign it to people with a due date, and see who has signed off. Staff open <b>My training</b>, read the steps and sign with their name.'},
    {id:'tasks', roles:['owner','manager','staff'], go:'#/manager/tasks', k:['task','checklist','cleaning','prep','temperature','任务','清洁','测温','每日清洁'],
      a:'<b>Tasks</b>: publish daily cleaning / prep / temperature checks; staff tick them off and upload a photo. Temperature checks ask for a value.'},
    {id:'swaps', roles:['owner','manager'], go:'#/manager/swaps', k:['swap','sos','cover','换班','顶班','调班'],
      a:'<b>Swaps / SOS</b>: approve shift-drop requests, and post a rewarded urgent cover shift that pushes a notification to available staff.'},
    {id:'availability', roles:['staff'], go:'#/staff/availability', k:['availability','available','when can i work','可用时间','空班'],
      a:'Open <b>Availability</b> and tap the times you can work each day. The AI roster only places you into day-parts you said you were free for.'},
    {id:'clockin', roles:['staff','manager'], k:['clock in','clock-in','start shift','打卡','上班打卡'],
      a:'On <b>My shifts</b>, tap “Clock in” on the day of your shift. Clocking in more than 5 minutes late is flagged to the owner.'},
    {id:'dropshift', roles:['staff'], k:['drop shift','give away shift','can\'t work','放班','请假','换掉班'],
      a:'On <b>My shifts</b>, tap “Drop” on a future shift to send it to the swap market (it goes live once the manager approves).'},
    {id:'onboarding', roles:['staff'], go:'#/staff/me', k:['onboard','onboarding','passport','documents','入职','护照','资料'],
      a:'In <b>My profile</b> there are two things to complete: a photo of your ID, and an emergency contact. That\'s it — this app never asks for your TFN, super fund or bank details.'},
    {id:'pay', roles:['owner','manager','staff'], k:['pay','wage','salary','award','penalty rate','super','tfn','tax','工资','薪水','税','退休金'],
      a:'This app does <b>not</b> do pay. It doesn\'t calculate wages, interpret awards, or file anything with the government — that stays with your payroll process. If the owner has switched it on, ⚖️ <b>Awards help</b> hands you to a qualified employment lawyer.'},
    {id:'workrights', roles:['owner','manager'], k:['visa','work rights','vevo','签证','工作权利','工时限制'],
      a:'The app applies no visa hour limits and stores no visa data. If the owner switches on the optional add-on, 🛂 <b>Check work rights</b> opens VEVO — the Department of Home Affairs\' own checker — with the person\'s consent.'},
    {id:'export', roles:['owner'], go:'#/owner/settings', k:['export','csv','pdf','download report','导出','下载','报表'],
      a:'In <b>Settings → Data export</b> you can download the roster, stock, purchases or the audit log as CSV, or print to PDF. They\'re your own records — nothing is filed anywhere.'},
    {id:'branches', roles:['owner'], go:'#/owner/branches', k:['branch','branches','分店','另一家','second store','multiple venues','add restaurant','加餐厅'],
      a:'<b>Branches</b>: add another venue and switch between them to see each one\'s team, stock and settings.'},
    {id:'team', roles:['owner'], go:'#/owner/team', k:['team','manager','staff list','change role','团队','改身份','offboard','离职'],
      a:'<b>Team</b> lists your managers and staff. Open anyone to edit their profile, set their skills, change their role (staff ↔ manager), or offboard them; and copy the manager join link.'},
    {id:'superadmin', roles:['superadmin'], go:'#/superadmin/applications', k:['approve','application','provision','审批','申请','超级管理员'],
      a:'<b>Applications</b>: review and approve new restaurant applications. <b>Switch view</b> lets you enter any venue as its owner / manager / staff.'},
    {id:'switchview', roles:['owner','superadmin'], go:'#/owner/switch', k:['preview','switch view','see staff view','切换视图','预览'],
      a:'<b>Switch view</b> previews the manager and staff portals so you see exactly what they see.'},
    {id:'language', roles:[], k:['language','chinese','english','translate','中文','英文','语言','切换语言'],
      a:'Tap <b>EN | 中</b> on the login page or in Settings to switch the whole app between English and 简体中文.'},
  ];

  function roleOf(){ const s=MKR.auth&&MKR.auth.current&&MKR.auth.current(); return s?s.role:null; }
  function norm(s){ return String(s||'').toLowerCase(); }

  // ---------- Personal data answers ----------
  async function myShifts(){
    const s=MKR.auth.current(); if(!s) return signIn();
    const shifts=(await MKR.db.getAll('shifts')).filter(x=>x.staffId===s.id).sort((a,b)=>a.day-b.day||a.start.localeCompare(b.start));
    const link = s.role==='manager'?'#/manager/myshifts':'#/staff/my';
    if(!shifts.length) return `You have no shifts rostered this week. ${jump(link,'Open My shifts')}`;
    const total=U.round2(shifts.reduce((t,x)=>t+MKR.util.shiftHours(x.start,x.end),0));
    const todayIdx=(new Date().getDay()+6)%7;
    const next=shifts.find(x=>x.day>=todayIdx)||shifts[0];
    const rows=shifts.map(x=>`• ${DAYS[x.day]} ${x.start}–${x.end} (${U.hrs(MKR.util.shiftHours(x.start,x.end))})`).join('<br>');
    return `Here are your shifts this week — <b>${U.hrs(total)}</b> total:<br>${rows}<br><br>Next up: <b>${DAYS[next.day]} ${next.start}</b>. ${jump(link,'Open My shifts')}`;
  }
  async function myHours(){
    const s=MKR.auth.current(); if(!s) return signIn();
    const shifts=(await MKR.db.getAll('shifts')).filter(x=>x.staffId===s.id);
    const total=U.round2(shifts.reduce((t,x)=>t+MKR.util.shiftHours(x.start,x.end),0));
    return `You're rostered <b>${U.hrs(total)}</b> across ${shifts.length} shift${shifts.length===1?'':'s'} this week.`;
  }
  // This app deliberately holds no pay data. Say so plainly rather than guessing.
  function payAnswer(){
    return `This app doesn't handle pay — no rates, no award calculations, no payslips. It only tracks the hours you're rostered. For anything about what you're paid, talk to your employer directly.`;
  }
  async function myTasks(){
    const list=(await MKR.db.getAll('tasks')).filter(t=>t.date===U.todayISO());
    const open=list.filter(t=>!t.done);
    if(!list.length) return `No tasks published for today.`;
    if(!open.length) return `🎉 All ${list.length} of today's tasks are done.`;
    return `Today's tasks — ${list.length-open.length}/${list.length} done. Still to do:<br>${open.map(t=>'• '+U.esc(t.name)).join('<br>')} ${jump(roleOf()==='manager'?'#/manager/tasks':'#/staff/tasks','Open tasks')}`;
  }
  async function myProfileInfo(which){
    const s=MKR.auth.current(); if(!s) return signIn();
    const ob=(await MKR.db.getAll('onboarding')).find(o=>o.userId===s.id);
    const me=await MKR.db.get('users',s.id)||{};
    if(!ob) return `You haven't submitted onboarding details yet. ${jump('#/staff/me','Complete onboarding')}`;
    if(which==='passport'){ const v=ob.passportEnc?await MKR.crypto.dec(ob.passportEnc, ob.userId):null; return v?`Your ID number on file is <b>${U.esc(v)}</b>.`:`No ID number submitted yet.`; }
  }
  async function onboardStatus(){
    const s=MKR.auth.current(); if(!s) return signIn();
    const me=await MKR.db.get('users',s.id)||{};
    return me.onboarded ? `✅ Your onboarding is complete.` : `Your onboarding is still in progress. ${jump('#/staff/me','Finish it')}`;
  }
  // Owner / manager aggregates
  async function staffCount(){
    const s=MKR.auth.current(); const kid=s&&s.kitchenId||'k_main';
    const all=(await MKR.db.getAll('users')).filter(u=>(u.kitchenId||'k_main')===kid && u.role!=='owner' && !u.offboarded);
    const m=all.filter(u=>u.role==='manager').length, st=all.filter(u=>u.role==='staff').length;
    return `This venue has <b>${st}</b> staff and <b>${m}</b> manager${m===1?'':'s'} (${all.length} people). ${jump('#/owner/team','Open Team')}`;
  }
  // What's short and what it'd cost to restock — the closest thing to a money
  // question this app will answer, and it's purchase cost, not sales.
  async function stockAnswer(){
    let rows=[]; try{ rows=await MKR.stock.overview(); }catch(e){}
    if(!rows.length) return `No stock items set up yet. ${jump('#/owner/stock','Open Stock & costs')}`;
    const total=rows.reduce((t,r)=>t+r.value,0);
    const short=rows.filter(r=>r.low||r.short||r.expiring);
    if(!short.length) return `You're holding <b>${U.money(total)}</b> of stock across ${rows.length} items, and nothing is running low. ${jump('#/owner/stock','Open Stock & costs')}`;
    return `You're holding <b>${U.money(total)}</b> of stock. ${short.length} item${short.length===1?' needs':'s need'} attention:<br>`
      + short.slice(0,6).map(r=>`• ${U.esc(r.name)} — ${r.qty} ${U.esc(r.unit||'')}${r.cover!=null?` (~${r.cover.toFixed(1)} days left)`:''}${r.expiring?' · near expiry':''}`).join('<br>')
      + ` ${jump('#/owner/stock','Open Stock & costs')}`;
  }
  // Owner / manager: who is rostered today + who has actually clocked in.
  async function whoIsOnToday(){
    const s=MKR.auth.current(); const kid=(s&&s.kitchenId)||'k_main';
    const todayIdx=(new Date().getDay()+6)%7;
    const users=(await MKR.db.getAll('users')).filter(u=>(u.kitchenId||'k_main')===kid && !u.offboarded);
    const nameOf=id=>{ const u=users.find(x=>x.id===id); return u?u.name:id; };
    const shifts=(await MKR.db.getAll('shifts')).filter(x=>x.day===todayIdx).sort((a,b)=>a.start.localeCompare(b.start));
    const onNow=new Set((await MKR.db.getAll('clockins')).filter(c=>c.date===U.todayISO()).map(c=>c.staffId));
    if(!shifts.length) return `今天没有人排班。${jump('#/manager/schedule','打开排班')}`;
    const rows=shifts.map(x=>`• ${x.start}–${x.end} ${U.esc(nameOf(x.staffId))}${onNow.has(x.staffId)?' <b>✅ 已打卡</b>':''}`).join('<br>');
    return `今天上班的人（共 ${shifts.length} 个班，${onNow.size} 人已打卡）：<br>${rows} ${jump('#/manager/schedule','打开排班')}`;
  }
  async function myBranches(){
    const s=MKR.auth.current(); if(!s) return signIn();
    const mine=(await MKR.db.getAll('kitchens')).filter(k=>k.ownerId===s.id || k.id===s.kitchenId);
    if(mine.length<=1) return `You have one venue right now. Add more in <b>Branches</b> if you open another location. ${jump('#/owner/branches','Open Branches')}`;
    return `You have <b>${mine.length}</b> branches:<br>${mine.map(k=>`• ${U.esc(k.name)}${k.id===s.kitchenId?' <b>(current)</b>':''}`).join('<br>')} ${jump('#/owner/branches','Manage branches')}`;
  }
  async function pendingApps(){
    const p=(await MKR.db.getAll('kitchens')).filter(k=>k.status==='pending');
    return `${p.length} restaurant application${p.length===1?'':'s'} pending approval. ${jump('#/superadmin/applications','Review')}`;
  }

  function signIn(){ return `Please sign in first and I can pull up your personal details.`; }
  function jump(hash,label){ return `<a href="${hash}" class="ai-jump" data-jump="${hash}">${label} ›</a>`; }

  // ---------- Actions: the assistant can DO things, not just answer ----------
  // Every mutation CONFIRMS first (a chip) so a misread never silently changes
  // data. db.put already stamps the kitchen + obeys Row Level Security.
  let pendingAction=null;
  function confirmCard(text){
    return `${text}<div class="ai-chips"><button class="ai-chip" data-q="yes, do it">✅ Yes, do it</button><button class="ai-chip" data-q="cancel">Cancel</button></div>`;
  }
  async function runPending(){ const a=pendingAction; pendingAction=null; if(!a) return `Nothing to confirm.`;
    try{ return await a.run(); }catch(e){ return `Sorry — that didn't go through. Please try it from the screen directly.`; } }

  const DAYKW={mon:0,monday:0,'周一':0,'星期一':0,tue:1,tuesday:1,'周二':1,'星期二':1,wed:2,wednesday:2,'周三':2,'星期三':2,thu:3,thursday:3,'周四':3,'星期四':3,fri:4,friday:4,'周五':4,'星期五':4,sat:5,saturday:5,'周六':5,'星期六':5,sun:6,sunday:6,'周日':6,'星期日':6,'星期天':6};
  function dayInText(q){ for(const k in DAYKW){ if(q.includes(k)) return DAYKW[k]; }
    if(q.includes('tomorrow')||q.includes('明天')) return ((new Date().getDay()+6)%7+1)%7;
    if(q.includes('today')||q.includes('今天')) return (new Date().getDay()+6)%7; return null; }

  // Pull the task text out of "add a task: mop floors" / "帮我加个任务 拖地".
  function taskNameFrom(raw){
    let t=String(raw||'');
    const colon=t.split(/[:：]/); if(colon.length>1 && colon.slice(1).join(':').trim()) return colon.slice(1).join(':').trim();
    t=t.replace(/(add|create|make|new)\s+(a\s+)?(task|to-?do|todo)\b/ig,' ')
       .replace(/(帮我|帮|请|给我)/g,' ').replace(/(加|新增|添加|新建|加个|加一个|建)\s*(一个)?\s*(任务|待办|todo|task)?/ig,' ')
       .replace(/\b(task|任务|待办)\b/ig,' ').replace(/[\s,，。:：-]+/g,' ').trim();
    return t;
  }
  async function addTask(name){
    await MKR.db.put('tasks',{name, date:U.todayISO(), done:false, photo:null, by:null});
    return `✅ Added today's task: <b>${U.esc(name)}</b>. ${jump('#/manager/tasks','Open tasks')}`;
  }

  // Staff: ask the manager to cover a shift (same mechanic as dropping a shift).
  async function requestSwap(q){
    const s=MKR.auth.current(); if(!s) return signIn();
    const shifts=(await MKR.db.getAll('shifts')).filter(x=>x.staffId===s.id).sort((a,b)=>a.day-b.day);
    if(!shifts.length) return `You have no shifts to swap this week. ${jump('#/staff/my','My shifts')}`;
    const dIdx=dayInText(q);
    let target = dIdx!=null ? shifts.find(x=>x.day===dIdx) : null;
    if(!target){
      if(shifts.length===1) target=shifts[0];
      else return `Which shift should I ask your manager to cover?<div class="ai-chips">${shifts.map(x=>`<button class="ai-chip" data-q="swap my ${DAYS[x.day]} shift">${DAYS[x.day]} ${x.start}–${x.end}</button>`).join('')}</div>`;
    }
    const label=`${DAYS[target.day]} ${target.start}-${target.end}`;
    pendingAction={ run: async()=>{
      await MKR.db.put('swaps',{staffId:s.id, shiftId:target.id, label, reason:'Requested via assistant', status:'pending', ts:Date.now()});
      await MKR.db.put('alerts',{type:'swap', level:'amber', title:'Shift swap requested', desc:`${s.name} asked to swap ${label}`, read:false, ts:Date.now()});
      try{ if(MKR.notify&&MKR.notify.push) MKR.notify.push({role:'manager'},'🔁 Swap requested',`${s.name}: ${label}`,'swap'); }catch(e){}
      return `✅ Done — I've asked your manager to cover <b>${label}</b>. You'll be notified once it's approved. ${jump('#/staff/swaps','View swaps')}`;
    }};
    return confirmCard(`I'll ask your manager to cover your <b>${label}</b> shift. Send the request?`);
  }

  // Owner / manager: look up a teammate's roster by name.
  async function findTeammate(q){
    const s=MKR.auth.current(); const kid=(s&&s.kitchenId)||'k_main';
    const users=(await MKR.db.getAll('users')).filter(u=>(u.kitchenId||'k_main')===kid && !u.offboarded && u.id!==(s&&s.id));
    for(const u of users){ const fn=norm(u.name).split(' ')[0]; if(fn.length>=2 && q.includes(fn)) return u;
      const un=norm(u.username); if(un && un.length>=2 && q.includes(un)) return u; }
    return null;
  }
  async function rosterFor(u){
    const shifts=(await MKR.db.getAll('shifts')).filter(x=>x.staffId===u.id).sort((a,b)=>a.day-b.day||a.start.localeCompare(b.start));
    if(!shifts.length) return `<b>${U.esc(u.name)}</b> has no shifts rostered this week. ${jump('#/manager/schedule','Open roster')}`;
    const total=U.round2(shifts.reduce((t,x)=>t+MKR.util.shiftHours(x.start,x.end),0));
    return `<b>${U.esc(u.name)}</b>'s shifts this week (${U.hrs(total)} total):<br>${shifts.map(x=>`• ${DAYS[x.day]} ${x.start}–${x.end}`).join('<br>')} ${jump('#/manager/schedule','Open roster')}`;
  }

  // ---------- Intent routing ----------
  async function answer(qRaw){
    const q=norm(qRaw);
    const has=(...arr)=>arr.some(w=>q.includes(w));
    const mine = has('my','mine','我的','我','i ',"i'm",'am i','do i');
    const role=roleOf();

    // resolve a pending confirmation typed as plain text (instead of the chip)
    if(pendingAction){
      if(has('yes','confirm','do it','go ahead','sure','please do','是','确认','好','可以','对','行')) return await runPending();
      if(has('no','cancel',"don't",'nope','取消','算了','不要','不用','别')){ pendingAction=null; return `Okay — cancelled, nothing changed.`; }
    }

    // ----- Actions (DO things) — checked before read intents so e.g.
    //       "帮我加个任务拖地" creates a task instead of listing my tasks. -----
    if((role==='owner'||role==='manager') && has('add','create','new','加','新增','添加','新建','建个','建一个') && has('task','任务','待办','to-do','todo')){
      const name=taskNameFrom(qRaw);
      if(!name) return `Sure — what should today's task say? Try “add task: mop the floor”.`;
      pendingAction={ run:()=>addTask(name) };
      return confirmCard(`Add today's task: <b>${U.esc(name)}</b>?`);
    }
    if(role==='staff' && (has('swap','换班','调班','顶班','换掉','someone to cover','cover my','give away') || (has('drop','请假',"can't work",'cannot work','不能上','叫经理','找经理') && has('shift','班')))){
      return await requestSwap(q);
    }
    // "Who's working / on shift today" — venue-wide roster + clock-in status.
    // Checked before the named-teammate lookup so it isn't mistaken for a person.
    if((role==='owner'||role==='manager') && has('谁上班','谁在上班','谁当班','谁值班','谁在岗','在岗','今天排班','今天的班','今天班表','今天上班','现在谁','谁今天','who is working','whos working','who works today','who is on','whos on','on shift today','rostered today','working today','who is in','whos in')) return await whoIsOnToday();

    // A named teammate always wins (findTeammate excludes the caller, so "my
    // roster" still falls through to the personal answer below). Note: we must
    // NOT gate on `mine` here — names like "Amy" contain the substring "my",
    // and Chinese "帮我…" contains "我", which would false-trigger the personal path.
    if((role==='owner'||role==='manager') && has('roster','schedule','shift','排班','班','rota','上班','几点','什么时候','when')){
      const u=await findTeammate(q); if(u) return await rosterFor(u);
    }

    // personal intents first
    if(has('tfn','税号','tax file','super','养老金','superannuation','bank','bsb','银行','账号')) return payAnswer();
    if(has('passport','护照','my id')) return await myProfileInfo('passport');
    if(has('onboard','入职') && mine) return await onboardStatus();
    if((mine && has('shift','roster','schedule','排班','班','班次')) || has('my shifts','my roster','next shift','下个班','我的班')) return await myShifts();
    if(mine && has('hour','工时','小时')) return await myHours();
    if(has('pay','wage','salary','工资','薪水','earn')) return payAnswer();
    if(has('my task','my tasks','我的任务') || (mine && has('task','任务'))) return await myTasks();

    // owner / manager aggregates
    if((role==='owner'||role==='manager') && has('how many staff','how many people','staff count','员工总数','多少员工','多少人')) return await staffCount();
    if((role==='owner'||role==='manager') && has('stock','inventory','库存','原料','食材','running out','要订货','低库存')) return await stockAnswer();
    if(role==='owner' && has('branch','分店','my branches')) return await myBranches();
    if(role==='superadmin' && has('pending','application','申请','待审批')) return await pendingApps();

    // greeting / capabilities
    if(has('hi','hello','hey','help','你好','帮助','what can you','怎么用','can you')) return greeting();

    // knowledge-base match (role-filtered, scored by keyword hits)
    let best=null, bestScore=0;
    for(const e of KB){
      if(e.roles.length && role && !e.roles.includes(role)) continue;
      let score=0; for(const kw of e.k){ if(q.includes(kw)) score+= kw.length>3?2:1; }
      if(score>bestScore){ bestScore=score; best=e; }
    }
    if(best && bestScore>0){ return best.a + (best.go?'<br>'+jump(best.go,'Open it'):''); }

    // optional LLM hook
    if(typeof MKR.assistant.llm==='function'){ try{ const r=await MKR.assistant.llm(qRaw,{role}); if(r) return r; }catch(e){} }

    const zh = (MKR.i18n && MKR.i18n.lang)==='zh';
    return (zh
      ? `这个我还不太确定。你可以问我功能（排班、库存与成本、送货确认、培训 SOP、每日任务…），或你自己的信息（“我的班次”“我的工时”“今天谁上班”）。<br>`
      : `I'm not sure about that one yet. Try asking about a feature (rostering, stock &amp; costs, deliveries, training, tasks…) or your own info (“what are my shifts?”, “my hours”, “who's on today?”).<br>`)
      + chips();
  }

  function greeting(){
    const role=roleOf();
    const name=(MKR.auth.current()||{}).name||'there';
    return `Hi ${U.esc(name)} 👋 I'm your My Kitchen assistant. Ask me how a feature works, or about your own info. Try:<br>${chips()}`;
  }
  function chips(){
    const role=roleOf();
    const zh = (MKR.i18n && MKR.i18n.lang)==='zh';
    let qs;
    if(zh){
      if(role==='staff') qs=['我的班次','我的工时','我的培训','怎么打卡','怎么收货'];
      else if(role==='manager') qs=['今天谁上班','怎么排班','库存还剩多少','怎么加人','换班/顶班'];
      else if(role==='owner') qs=['库存还剩多少','有多少员工','今天谁上班','怎么排班','怎么做培训'];
      else if(role==='superadmin') qs=['待审批申请','怎么审批餐厅','切换视图'];
      else qs=['这个系统怎么用','怎么登录','切换语言'];
    } else {
      if(role==='staff') qs=['What are my shifts?','How many hours this week?','My training','How do I clock in?','How do I take a delivery?'];
      else if(role==='manager') qs=['Who is working today?','How does AI rostering work?','What stock is running low?','How do I add a user?','Post an SOS cover'];
      else if(role==='owner') qs=['What stock is running low?','How many staff?','Who is working today?','How do I roster?','How do I set up training?'];
      else if(role==='superadmin') qs=['Pending applications','How do I approve a restaurant?','Switch into a venue'];
      else qs=['How do I sign in?','What is this app?','Switch to 中文'];
    }
    return `<div class="ai-chips">${qs.map(t=>`<button class="ai-chip" data-q="${U.esc(t)}">${U.esc(t)}</button>`).join('')}</div>`;
  }

  // ---------- UI ----------
  function push(role, html){
    const m=document.createElement('div'); m.className='ai-msg '+role; m.innerHTML=html; log.appendChild(m);
    log.scrollTop=log.scrollHeight;
    // wire jump links + chips inside this message
    m.querySelectorAll('[data-jump]').forEach(a=>a.onclick=(e)=>{ e.preventDefault(); location.hash=a.dataset.jump; close(); });
    m.querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>ask(b.dataset.q));
    return m;
  }
  async function ask(text){
    text=String(text||'').trim(); if(!text) return;
    push('user', U.esc(text));
    const typing=push('bot','<span class="ai-dots"><i></i><i></i><i></i></span>');
    try{ const html=await answer(text); typing.innerHTML=html; typing.querySelectorAll('[data-jump]').forEach(a=>a.onclick=(e)=>{ e.preventDefault(); location.hash=a.dataset.jump; close(); }); typing.querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>ask(b.dataset.q)); }
    catch(e){ typing.innerHTML='Sorry, something went wrong answering that.'; }
    log.scrollTop=log.scrollHeight;
  }
  function open(){ openState=true; panel.classList.add('show'); btn.classList.add('open');
    if(!started){ started=true; push('bot', greeting()); }
    setTimeout(()=>{ const i=panel.querySelector('#aiInput'); if(i) i.focus(); },50);
  }
  function close(){ openState=false; panel.classList.remove('show'); btn.classList.remove('open'); }

  function mount(){
    if(mounted) return; mounted=true;
    btn=document.createElement('button'); btn.className='ai-fab'; btn.setAttribute('aria-label','Assistant'); btn.innerHTML='💬';
    panel=document.createElement('div'); panel.className='ai-panel';
    panel.innerHTML=`
      <div class="ai-head"><b>🤖 Assistant</b><button class="ai-x" aria-label="Close">×</button></div>
      <div class="ai-log" id="aiLog"></div>
      <form class="ai-input-row" id="aiForm">
        <input class="input" id="aiInput" placeholder="Ask about a feature or your shifts…" autocomplete="off">
        <button class="btn btn-dark" type="submit" aria-label="Send">➤</button>
      </form>`;
    document.body.appendChild(panel); document.body.appendChild(btn);
    log=panel.querySelector('#aiLog');
    btn.onclick=()=> openState?close():open();
    panel.querySelector('.ai-x').onclick=close;
    panel.querySelector('#aiForm').onsubmit=(e)=>{ e.preventDefault(); const i=panel.querySelector('#aiInput'); const v=i.value; i.value=''; ask(v); };
    window.addEventListener('hashchange', sync); sync();
  }
  function sync(){
    if(!btn) return;
    const h=location.hash||'';
    const hide = h.startsWith('#/order') || h.startsWith('#/join') || h==='' || h==='#/login' || h==='#/';
    btn.style.display = hide?'none':'';
    if(hide) close();
  }

  // A compact, privacy-aware snapshot of live venue data, sent with free-form
  // questions so the assistant can answer "how's today going?" etc. Owners and
  // managers get venue aggregates; staff get only their own roster summary.
  async function snapshot(){
    const s = MKR.auth && MKR.auth.current && MKR.auth.current(); if(!s) return '';
    const role = s.role, today = U.todayISO(), lines = [];
    try{
      if(role==='owner' || role==='manager'){
        const staff=(await MKR.db.getAll('users')).filter(u=>u.role!=='owner' && !u.offboarded);
        lines.push(`Team: ${staff.filter(u=>u.role==='staff').length} staff, ${staff.filter(u=>u.role==='manager').length} managers.`);
        try{ const todayIdx=(new Date().getDay()+6)%7; const nm=id=>{const u=staff.find(x=>x.id===id);return u?u.name:id;};
          const onToday=(await MKR.roster.shiftsFor(MKR.roster.thisWeek())).filter(x=>x.day===todayIdx).sort((a,b)=>String(a.start).localeCompare(String(b.start))).map(x=>`${nm(x.staffId)} ${x.start}-${x.end}`);
          if(onToday.length) lines.push(`On shift today: ${onToday.join(', ')}.`); }catch(e){}
        try{ const t=(await MKR.db.getAll('tasks')).filter(x=>x.date===today);
          if(t.length) lines.push(`Today's checklist: ${t.filter(x=>x.done).length}/${t.length} done.`); }catch(e){}
        try{ const rows=await MKR.stock.overview();
          const val=rows.reduce((a,r)=>a+r.value,0);
          lines.push(`Stock: ${rows.length} items, ${U.money(val)} on hand.`);
          const low=rows.filter(r=>r.low||r.short||r.expiring).map(r=>`${r.name} (${r.qty}${r.unit||''})`);
          if(low.length) lines.push(`Low or near expiry: ${low.slice(0,8).join(', ')}.`);
          const moved=rows.filter(r=>r.move.dir!=='flat').map(r=>`${r.name} ${r.move.dir} ${Math.abs(r.move.pct).toFixed(0)}%`);
          if(moved.length) lines.push(`Recent price moves: ${moved.slice(0,6).join(', ')}.`); }catch(e){}
        try{ const d=await MKR.deliveries.pending(); if(d.length) lines.push(`${d.length} delivery/deliveries waiting to be confirmed.`); }catch(e){}
        try{ const tr=(await MKR.training.trainings()).filter(x=>x.status!=='done'); if(tr.length) lines.push(`${tr.length} training task(s) outstanding.`); }catch(e){}
        try{ const q=(await MKR.db.getAll('waitlist')).filter(x=>x.status==='waiting'||x.status==='called').length;
          const bk=(await MKR.db.getAll('reservations')).filter(r=>r.status==='booked' && r.date>=today).length;
          if(q||bk) lines.push(`${q} parties waiting, ${bk} upcoming bookings.`); }catch(e){}
      } else if(role==='staff'){
        const shifts=(await MKR.db.getAll('shifts')).filter(x=>x.staffId===s.id);
        const hrs=U.round2(shifts.reduce((t,x)=>t+MKR.util.shiftHours(x.start,x.end),0));
        lines.push(`This week you have ${shifts.length} shifts, ${U.hrs(hrs)} total.`);
      }
    }catch(e){}
    return lines.join(' ').slice(0,900);
  }

  // Free-form questions route here when nothing in the knowledge base matches.
  // Calls the Supabase Edge Function `ai-assistant` (which holds the Claude API
  // key server-side). Returns null on any failure → answer() shows its fallback.
  async function llm(question, ctx){
    try{
      if(!MKR.supa || !MKR.supa.client || !MKR.supa.URL) return null;
      let token=''; try{ const {data}=await MKR.supa.client.auth.getSession(); token=(data&&data.session&&data.session.access_token)||''; }catch(e){}
      const lang = (MKR.i18n && MKR.i18n.lang) || 'en';
      const context = await snapshot();
      const res = await fetch(`${MKR.supa.URL}/functions/v1/ai-assistant`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'apikey':MKR.supa.ANON, ...(token?{Authorization:'Bearer '+token}:{}) },
        body: JSON.stringify({ question, role:(ctx&&ctx.role)||null, lang, context })
      });
      if(!res.ok) return null;
      const out = await res.json().catch(()=>null);
      if(!out || !out.text) return null;
      const html = U.esc(out.text).replace(/\n/g,'<br>');
      return html + '<div class="faint" style="font-size:11px;margin-top:6px">🤖 AI</div>';
    }catch(e){ return null; }
  }

  MKR.assistant = { mount, ask, answer, llm };
})();
