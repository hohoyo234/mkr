/* ===== Owner Portal ===== */
window.MKR = window.MKR || {}; MKR.portals = MKR.portals || {};
(function(){
  const U = MKR.util;
  const DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  // Safe date→YYYY-MM-DD ('' for missing/invalid dates) — a single bad order's
  // createdAt used to throw "Invalid time value" and crash the whole dashboard.
  const dayOf = ts => { const d=new Date(ts); return isNaN(d.getTime()) ? '' : d.toISOString().slice(0,10); };
  const isToday = ts => dayOf(ts)===U.todayISO();

  // Everything the owner needs to know in one pass. Operational, not financial —
  // who's on, what's done, what's short, what's waiting on someone.
  async function metrics(){
    const todayIdx = (new Date().getDay()+6)%7;
    const week = MKR.roster.thisWeek();
    const [shifts, clockins, tasks, alerts] = await Promise.all([
      MKR.roster.shiftsFor(week),
      MKR.db.getAll('clockins'),
      MKR.db.getAll('tasks'),
      MKR.db.getAll('alerts'),
    ]);
    const todayShifts = shifts.filter(s=>s.day===todayIdx);
    const todayTasks  = tasks.filter(t=>t.date===U.todayISO());
    const clockedIn   = todayShifts.filter(s=>clockins.some(k=>k.shiftId===s.id)).length;

    let stock=[], deliveries=[], training=[];
    try{ stock = await MKR.stock.overview(); }catch(e){}
    try{ deliveries = await MKR.deliveries.pending(); }catch(e){}
    try{ training = (await MKR.training.trainings()).filter(t=>t.status!=='done'); }catch(e){}

    const nowMin = new Date().getHours()*60 + new Date().getMinutes();
    const onNow = todayShifts.filter(s=>nowMin>=U.toMin(s.start) && nowMin<U.toMin(s.end)).length;

    return {
      week, todayIdx, shifts, todayShifts, onNow, clockedIn,
      tasks: todayTasks, tasksDone: todayTasks.filter(t=>t.done).length,
      alerts: alerts.filter(a=>!a.read),
      stock, lowStock: stock.filter(r=>r.low||r.expiring),
      stockValue: U.round2(stock.reduce((t,r)=>t+r.value,0)),
      deliveries,
      training, trainingOverdue: training.filter(t=>MKR.training.isOverdue(t)),
    };
  }

  // Scan today's shifts: planned start passed by 1h with no clock-in → No Show alert (deduped)
  async function noShowScan(){
    const todayIdx=(new Date().getDay()+6)%7;
    const shifts=(await MKR.db.getAll('shifts')).filter(s=>s.day===todayIdx);
    const clockins=await MKR.db.getAll('clockins');
    const users=await MKR.db.getAll('users');
    const now=Date.now();
    for(const s of shifts){
      const startTs=MKR.alerts.shiftStartTs(s);
      if(now > startTs+60*60000 && !clockins.find(k=>k.shiftId===s.id)){
        const u=users.find(x=>x.id===s.staffId);
        await MKR.alerts.raise({key:'noshow-'+s.id, level:'red', type:'noshow', title:'Staff No-Show risk',
          desc:`${u?u.name:'A staff member'}'s ${DAYS[s.day]} ${s.start} shift is 1h past start with no clock-in`});
      }
    }
  }

  MKR.portals.owner = {
    home:'dashboard', subtitle:'Fewer hours on admin — the app only asks when it has to',
    nav:[
      {id:'dashboard', label:'Dashboard',    em:'📊', short:'Dash'},
      {id:'assistant', label:'AI Assistant', em:'✨', short:'AI',        feature:'o_assistant'},
      {id:'stock',     label:'Stock & costs',em:'📦', short:'Stock',     feature:'stock'},
      {id:'deliveries',label:'Deliveries',   em:'🚚', short:'Delivery',  feature:'deliveries'},
      {id:'training',  label:'Training & SOP',em:'📘',short:'Training',  feature:'training'},
      {id:'alerts',    label:'Alerts',       em:'🚨', short:'Alerts'},
      {id:'team',      label:'Team',         em:'👥', short:'Team',      feature:'o_team'},
      {id:'performance',label:'Performance', em:'🏅', short:'Perform',   feature:'o_performance'},
      {id:'branches',  label:'Branches',     em:'🏢', short:'Branches',  feature:'o_branches'},
      {id:'feedback',  label:'Feedback',     em:'⭐', short:'Reviews',   feature:'o_feedback'},
      {id:'audit',     label:'Audit log',    em:'🔍', short:'Audit'},
      {id:'switch',    label:'Switch view',  em:'👁', short:'Switch'},
      {id:'settings',  label:'Settings',     em:'⚙️', short:'Settings'},
    ],
    async badges(){
      const b={};
      const a=(await MKR.db.getAll('alerts')).filter(x=>!x.read && x.level==='red').length;
      if(a) b.alerts=a;
      try{ const d=(await MKR.deliveries.pending()).length; if(d) b.deliveries=d; }catch(e){}
      return b;
    },
    async view(section,c,arg){
      // First-run setup gate: a freshly-approved owner must add a logo + pick features.
      const sess=MKR.auth.current();
      if(sess && sess.role==='owner' && sess.kitchenId){
        const k=await MKR.db.get('kitchens', sess.kitchenId);
        if(k && k.setupComplete===false && section!=='setup') return setupWizard(c, k);
      }
      if(section==='setup') return setupWizard(c, sess && sess.kitchenId ? await MKR.db.get('kitchens', sess.kitchenId) : null);
      if(section==='dashboard') return dashboard(c);
      if(section==='assistant') return MKR.views.admin.render(c);
      if(section==='alerts') return alerts(c);
      if(section==='audit') return audit(c);
      if(section==='team') return team(c,arg);
      if(section==='performance') return performanceView(c);
      if(section==='branches') return branches(c);
      if(section==='stock') return MKR.stock.render(c);
      if(section==='deliveries') return MKR.deliveries.render(c);
      if(section==='training') return MKR.training.renderManage(c);
      if(section==='feedback') return feedback(c);
      if(section==='switch') return switchView(c);
      if(section==='settings') return settings(c);
    }
  };

  // ---------- First-run owner setup wizard (logo + feature selection) ----------
  async function setupWizard(c, kitchen){
    const sess=MKR.auth.current();
    kitchen = kitchen || {id:sess&&sess.kitchenId, name:'Your restaurant'};
    const mods = await MKR.features.load();
    const work = JSON.parse(JSON.stringify(mods));
    let logo = kitchen.logo || null;
    c.innerHTML=`
      <div class="section-head"><div><h2>Welcome — let's set up ${U.esc(kitchen.name||'your restaurant')}</h2>
        <p>Two quick steps: add your logo, then choose the features you want. You can change these later in Settings.</p></div></div>
      <div class="grid g2" style="align-items:start">
        <div class="card" style="padding:22px">
          <div class="section-title">1 · Restaurant logo</div>
          <p class="muted" style="font-size:13px;margin-bottom:10px">Your logo appears on the sign-in page and in every portal.</p>
          <label class="img-drop"><div class="img-preview" id="logoPrev">${logo?`<img src="${logo}">`:'<span>📷 Tap to upload your logo</span>'}</div><input type="file" id="logoFile" accept="image/*" hidden></label>
          <div class="field mt12"><label>Display name</label><input class="input" id="setName" value="${U.esc(kitchen.name||'')}"></div>
        </div>
        <div class="card" style="padding:22px">
          <div class="section-title">2 · Choose your features</div>
          <p class="muted" style="font-size:13px;margin-bottom:10px">Tick the modules you want. Unticked ones are hidden from your team.</p>
          <div id="featList"></div>
        </div>
      </div>
      <div class="row gap8 mt16" style="max-width:560px"><button class="btn btn-dark grow" id="finishSetup">✅ Finish setup</button></div>
      <div class="disclaimer mt12"><span>ℹ️</span>You can revisit Settings anytime to toggle features or switch language.</div>`;
    U.qs('#logoFile',c).onchange=(e)=> U.readImage(e.target.files[0], (data)=>{ logo=data; U.qs('#logoPrev',c).innerHTML=`<img src="${logo}">`; });
    const fl=U.qs('#featList',c);
    fl.innerHTML=Object.keys(work).map(k=>{
      const m=work[k];
      return `<label class="onb-item" style="cursor:pointer">
        <input type="checkbox" data-feat="${k}" ${m.on?'checked':''} style="width:20px;height:20px">
        <div class="grow"><b>${U.esc(m.label)}</b><div class="faint" style="font-size:12px">for ${(m.roles||[]).join(', ')||'everyone'}</div></div></label>`;
    }).join('');
    U.qsa('[data-feat]',fl).forEach(ch=>ch.onchange=()=>{ work[ch.dataset.feat].on=ch.checked; });
    U.qs('#finishSetup',c).onclick=async()=>{
      const name=U.qs('#setName',c).value.trim()||kitchen.name;
      await MKR.db.put('kitchens',{id:kitchen.id, name, logo, modules:work, setupComplete:true});
      await MKR.features.save(work, kitchen.id);
      await MKR.db.meta('brand', {name, avatar:logo});       // syncs logo to the login page
      await MKR.audit.log({action:'settings.update', desc:'Completed restaurant setup'});
      U.toast('Setup complete — welcome aboard! 🎉','green');
      location.hash='#/owner/dashboard'; MKR.router.render();
    };
  }

  // ---------- Customer feedback (bad-review interception) ----------
  async function feedback(c){
    const all=await MKR.db.getAll('customer_feedback');
    const fbs=all.filter(f=>f.type==='review').sort((a,b)=>b.ts-a.ts);
    const bad=fbs.filter(f=>f.rating<=3);
    const todayUrge=all.filter(f=>f.type==='urge' && dayOf(f.ts)===U.todayISO()).length;
    const avg=fbs.length?(fbs.reduce((s,f)=>s+f.rating,0)/fbs.length).toFixed(1):'—';
    c.innerHTML=`
      <div class="section-head"><div><h2>Customer feedback</h2><p>Reviews you log or receive — 1-3★ stay internal for you to handle</p></div></div>
      <div class="grid g3" style="margin-bottom:18px">
        <div class="card stat"><div class="k">⭐ Average rating</div><div class="v">${avg}</div><div class="delta flat">${fbs.length} reviews</div></div>
        <div class="card stat"><div class="k">😟 Bad (1-3★)</div><div class="v" style="color:${bad.length?'var(--red)':'inherit'}">${bad.length}</div><div class="delta flat">kept internal</div></div>
        <div class="card stat"><div class="k">🔔 Urges today</div><div class="v">${todayUrge}</div></div>
      </div>
      <div class="card" style="padding:8px 18px"><div class="list">
        ${fbs.length? fbs.map(f=>`<div class="li">
          <div class="ava" style="background:${f.rating<=3?'var(--red-soft)':'var(--green-soft)'};color:${f.rating<=3?'var(--red)':'var(--green)'}">${f.rating}★</div>
          <div class="meta"><b>${'★'.repeat(f.rating)}<span class="faint">${'★'.repeat(5-f.rating)}</span> · table ${U.esc(f.table||'—')}</b>
            <span>${U.esc(f.comment||'(no written review)')} · ${U.ago(f.ts)}</span></div>
          ${f.rating<=3?'<span class="pill danger">Bad</span>':'<span class="pill ok">Good</span>'}</div>`).join('')
        :'<div class="empty"><div class="em">⭐</div><p>No customer reviews yet</p></div>'}
      </div></div>
      <div class="disclaimer mt16"><span>🛡️</span>Low ratings stay in here so you can reach out privately rather than letting them sit online.</div>`;
  }

  // ---------- Switch view (owner is super admin, can preview any portal) ----------
  function switchView(c){
    const card=(href,em,title,desc)=>`<a class="card clickable" href="${href}" style="padding:22px;display:block">
      <div style="font-size:30px">${em}</div><b style="font-size:17px;display:block;margin-top:8px">${title}</b>
      <span class="muted" style="font-size:13px">${desc}</span></a>`;
    c.innerHTML=`
      <div class="section-head"><div><h2>Switch view</h2><p>The owner can preview any portal and see exactly what staff / managers see</p></div></div>
      <div class="grid g3">
        ${card('#/owner/dashboard','👑','Owner','Dashboard · your current portal')}
        ${card('#/manager/schedule','📋','Manager · Roster','AI rostering / warnings / add users')}
        ${card('#/manager/stock','📦','Stock & costs','Ingredients, tools, suppliers, purchases')}
        ${card('#/manager/deliveries','🚚','Deliveries','Confirm what actually turned up')}
        ${card('#/manager/training','📘','Training & SOP','Write it once, assign it, track it')}
        ${card('#/staff/my','🧑‍🍳','Staff · Shifts','Clock-in / availability / claim')}
        ${card('#/staff/training','🎓','Staff · Training','What a new starter sees')}
      </div>
      <div class="disclaimer mt16"><span>👁</span>Inside another portal the top shows an "Owner preview" banner — tap "Back to Owner" to return.</div>`;
  }

  // ---------- Settings (feature switches + role permissions) ----------
  async function settings(c){
    const mods = await MKR.features.load();
    const roleNames={owner:'Owner',manager:'Manager',staff:'Staff'};
    const work = JSON.parse(JSON.stringify(mods));
    const sess = MKR.auth.current();
    const kitchen = sess && sess.kitchenId ? await MKR.db.get('kitchens', sess.kitchenId) : null;
    let rLogo = kitchen ? (kitchen.logo||null) : null;
    c.innerHTML=`
      <div class="section-head"><div><h2>Settings</h2><p>Toggle modules · control which roles can access each one</p></div>
        <button class="btn btn-dark btn-sm" id="saveBtn">Save settings</button></div>
      ${kitchen?`
      <div class="card pad20" style="margin-bottom:16px">
        <div class="section-title" style="margin-top:0">🏪 Restaurant profile</div>
        <p class="muted" style="font-size:13px;margin-bottom:12px">Your logo and name appear in the sidebar, on the sign-in page and across every portal.</p>
        <div class="row gap8 wrap" style="align-items:flex-start">
          <label class="img-drop" style="width:140px;flex:none">
            <div class="img-preview" id="rLogoPrev" style="min-height:120px">${rLogo?`<img src="${rLogo}">`:'<span>📷 Tap to upload</span>'}</div>
            <input type="file" id="rLogoFile" accept="image/*" hidden>
          </label>
          <div class="grow" style="min-width:200px">
            <div class="field"><label>Restaurant name</label><input class="input" id="rName" value="${U.esc(kitchen.name||'')}" placeholder="Your restaurant name"></div>
            <div class="row gap8 wrap">
              <button class="btn btn-dark btn-sm" id="rSave">Save profile</button>
              <button class="btn btn-ghost btn-sm" id="rClear">Remove logo</button>
            </div>
          </div>
        </div>
      </div>`:''}
      <div class="card" style="padding:14px 18px;margin-bottom:16px"><div class="li" style="border:none;padding:0">
        <div class="meta"><b>System language</b><span>English / 简体中文</span></div>
        ${MKR.i18n?MKR.i18n.switcher():''}
      </div></div>
      <div class="card pad20" style="margin-bottom:16px">
        <div class="section-title" style="margin-top:0">⚖️ Optional Australian add-ons</div>
        <p class="muted" style="font-size:13px;margin-bottom:12px">This app never interprets awards, calculates pay or checks work rights itself. Turn these on and it will simply hand you to someone who does — your call, every time.</p>
        <div class="list">
          <div class="li"><div class="ds-li-ic">⚖️</div><div class="meta"><b>Awards help</b><span>Adds a button that opens our partner employment lawyer</span></div>
            <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" data-on="au_awards" ${work.au_awards&&work.au_awards.on?'checked':''} style="width:22px;height:22px"> On</label></div>
          <div class="li"><div class="ds-li-ic">🛂</div><div class="meta"><b>Work rights check</b><span>Adds a button that opens VEVO (Home Affairs) — we store no visa data</span></div>
            <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" data-on="au_workrights" ${work.au_workrights&&work.au_workrights.on?'checked':''} style="width:22px;height:22px"> On</label></div>
        </div>
        <div class="row gap8 wrap mt12"><button class="btn btn-ghost btn-sm" id="lawyerBtn">✏️ Partner lawyer details</button></div>
      </div>
      <div class="card pad20" style="margin-bottom:16px">
        <div class="section-title" style="margin-top:0">📤 Data export</div>
        <p class="muted" style="font-size:13px;margin-bottom:12px">Your own operational records — download CSV or print to PDF.</p>
        <div class="row gap8 wrap">
          <div class="field" style="margin:0;min-width:170px"><label>What to export</label>
            <select class="input" id="exType">
              <option value="roster">Roster</option>
              <option value="stock">Stock &amp; costs</option>
              <option value="purchases">Purchases</option>
              <option value="audit">Audit log</option>
            </select></div>
          <div class="field" style="margin:0;min-width:150px"><label>Date range</label>
            <select class="input" id="exRange">
              <option value="today">Today</option>
              <option value="week" selected>This week</option>
              <option value="month">This month</option>
              <option value="custom">Custom…</option>
            </select></div>
        </div>
        <div class="row gap8 wrap hidden" id="exCustom" style="margin-top:2px">
          <div class="field" style="margin:0"><label>From</label><input class="input" id="exFrom" type="date"></div>
          <div class="field" style="margin:0"><label>To</label><input class="input" id="exTo" type="date"></div>
        </div>
        <div class="row gap8 wrap mt12">
          <button class="btn btn-dark btn-sm" id="exCsv">⬇️ Export CSV</button>
          <button class="btn btn-ghost btn-sm" id="exPdf">🖨️ Print / PDF</button>
        </div>
        <div class="faint" id="exNote" style="font-size:11.5px;margin-top:8px"></div>
        <div class="disclaimer mt12"><span>ℹ️</span>These are your own records, exported for you. Nothing is filed or sent anywhere.</div>
      </div>
      <div class="card" style="padding:8px 18px"><div id="mlist"></div></div>
      <div class="disclaimer mt16"><span>ℹ️</span>Disabled features disappear from the matching portal's nav and direct access is blocked; saving applies to every device in the venue. Owner core (dashboard / alerts / audit / settings) is always available.</div>`;
    if(MKR.i18n) MKR.i18n.bindSwitchers(c);
    const el=U.qs('#mlist',c);
    // The two optional AU add-ons have their own card above, so keep them out of
    // the general module list rather than showing each toggle twice.
    const AU = ['au_awards','au_workrights'];
    U.qsa('[data-on]',c).filter(ch=>AU.includes(ch.dataset.on)).forEach(ch=>{
      ch.onchange = ()=>{ work[ch.dataset.on].on = ch.checked; applyLive(); };
    });
    function draw(){
      el.innerHTML=Object.keys(work).filter(k=>!AU.includes(k)).map(k=>{
        const m=work[k];
        const chips=['owner','manager','staff'].map(r=>`<button class="pill ${m.roles.includes(r)?'ok':'ghost'}" data-role="${k}:${r}" style="cursor:pointer">${roleNames[r]}</button>`).join(' ');
        return `<div class="li" style="flex-wrap:wrap;gap:10px">
          <div class="meta" style="min-width:150px"><b>${m.label}</b><span style="opacity:${m.on?1:.5}">${m.on?'On':'Off'}</span></div>
          <div class="row gap6 center wrap">${chips}
            <label style="display:inline-flex;align-items:center;gap:6px;margin-left:8px;cursor:pointer"><input type="checkbox" data-on="${k}" ${m.on?'checked':''} style="width:22px;height:22px"> Enabled</label>
          </div></div>`;
      }).join('');
      U.qsa('[data-role]',el).forEach(b=>b.onclick=()=>{ const [k,r]=b.dataset.role.split(':'); const arr=work[k].roles; const i=arr.indexOf(r); if(i>=0) arr.splice(i,1); else arr.push(r); draw(); applyLive(); });
      U.qsa('[data-on]',el).forEach(ch=>ch.onchange=()=>{ work[ch.dataset.on].on=ch.checked; draw(); applyLive(); });
    }
    // Apply a toggle the instant it changes: persist + show/hide the matching
    // sidebar (and mobile-nav) items live — no need to press "Save settings".
    async function applyLive(){
      try{ await MKR.features.save(work); }catch(e){}
      const sess=MKR.auth.current(); const portal=MKR.portals[sess.role]||MKR.portals.owner;
      const can=(n)=> !n.feature || MKR.features.can(n.feature, sess.role==='owner'?'owner':sess.role);
      U.qsa('.sidebar .nav-item, .mobile-nav a').forEach(a=>{
        const mm=(a.getAttribute('href')||'').match(/#\/[^/]+\/([^/?]+)/); if(!mm) return;
        const nav=portal.nav.find(n=>n.id===mm[1]); if(!nav) return;
        a.style.display = can(nav) ? '' : 'none';
      });
    }
    draw();
    U.qs('#saveBtn',c).onclick=async()=>{
      await MKR.features.save(work);
      await MKR.audit.log({action:'settings.update', desc:'Updated settings / permissions'});
      U.toast('Settings saved across the venue','green');
      MKR.router.refresh();   // rebuild the shell so hidden features drop out of the sidebar right away
    };

    // ---- Optional AU add-ons: the two toggles above the module list share the
    // same [data-on] handler as the module rows, so they only need the lawyer form.
    U.qs('#lawyerBtn',c).onclick=async()=>{
      const L = await MKR.partners.lawyer();
      const wrap=U.el(`<div>
        <p class="muted" style="font-size:13.5px">Where should the "Awards help" button send you? Leave it blank until you've picked a firm.</p>
        <div class="field"><label>Firm / lawyer name</label><input class="input" id="lw_n" value="${U.esc(L.name||'')}"></div>
        <div class="field"><label>Link</label><input class="input" id="lw_u" value="${U.esc(L.url||'')}" placeholder="https://…"></div>
        <div class="row"><div class="field grow"><label>Email</label><input class="input" id="lw_e" value="${U.esc(L.email||'')}"></div>
          <div class="field grow"><label>Phone</label><input class="input" id="lw_p" value="${U.esc(L.phone||'')}"></div></div>
      </div>`);
      U.modal('Partner lawyer', wrap, {actions:[{label:'Save', class:'btn-dark', onClick:async(close)=>{
        await MKR.partners.saveLawyer({name:U.qs('#lw_n',wrap).value.trim(), url:U.qs('#lw_u',wrap).value.trim(),
          email:U.qs('#lw_e',wrap).value.trim(), phone:U.qs('#lw_p',wrap).value.trim()});
        close(); U.toast('Saved','green');
      }}]});
    };

    // ---- Restaurant profile (logo + name) ----
    if(kitchen){
      const prev=U.qs('#rLogoPrev',c);
      // No size gate any more: the reader shrinks it, so a straight-off-the-phone
      // photo is accepted instead of bounced back at the owner.
      U.qs('#rLogoFile',c).onchange=(e)=> U.readImage(e.target.files[0], (data)=>{ rLogo=data; prev.innerHTML=`<img src="${rLogo}">`; });
      U.qs('#rClear',c).onclick=()=>{ rLogo=null; prev.innerHTML='<span>📷 Tap to upload</span>'; };
      U.qs('#rSave',c).onclick=async()=>{
        const name=U.qs('#rName',c).value.trim()||kitchen.name;
        await MKR.db.put('kitchens',{id:kitchen.id, name, logo:rLogo});
        await MKR.db.meta('brand', {name, avatar:rLogo});      // keeps the sign-in page in sync
        await MKR.audit.log({action:'settings.update', desc:'Updated restaurant profile (logo / name)'});
        U.toast('Restaurant profile saved','green');
        MKR.router.refresh();                                  // repaint the shell with the new logo/name
      };
    }

    // ---- Data export / reports ----
    const kid=(sess&&sess.kitchenId)||'k_main';
    const DAYS2=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const exRange=U.qs('#exRange',c), exType=U.qs('#exType',c), exCustom=U.qs('#exCustom',c), exNote=U.qs('#exNote',c);
    function getRange(){
      const r=exRange.value, now=new Date(), today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
      let from, to=today.getTime()+864e5-1, label;
      if(r==='today'){ from=today.getTime(); label='Today'; }
      else if(r==='month'){ from=new Date(today.getFullYear(),today.getMonth(),1).getTime(); label='This month'; }
      else if(r==='custom'){ const f=U.qs('#exFrom',c).value, t=U.qs('#exTo',c).value; from=f?new Date(f).getTime():0; to=t?new Date(t).getTime()+864e5-1:Date.now(); label=(f||'…')+' → '+(t||'…'); }
      else { const d=new Date(today); d.setDate(d.getDate()-((d.getDay()+6)%7)); from=d.getTime(); label='This week'; }
      return {from,to,label};
    }
    function noteText(){
      exNote.textContent = exType.value==='roster'
        ? 'The roster export covers the current week.'
        : (exType.value==='stock' ? 'Stock is a snapshot of what you hold right now.' : 'Uses the selected date range.');
    }
    exRange.onchange=()=>{ exCustom.classList.toggle('hidden', exRange.value!=='custom'); };
    exType.onchange=noteText; noteText();
    async function buildExport(){
      const type=exType.value, {from,to,label}=getRange();
      if(type==='audit'){
        const l=(await MKR.db.getAll('audit')).filter(x=>x.ts>=from&&x.ts<=to).sort((a,b)=>a.ts-b.ts);
        return {name:'audit',label,headers:['Time','Action','Actor','Amount','Detail'],rows:l.map(x=>[U.fmtDateTime(x.ts),MKR.audit.label(x.action),x.actor||'System',x.amount!=null?Number(x.amount).toFixed(2):'',x.desc||''])};
      }
      if(type==='stock'){
        const rows=(await MKR.stock.overview()).map(r=>[r.name, MKR.stock.KIND[r.kind].label, r.qty, r.unit||'', (+r.price||0).toFixed(2), r.value.toFixed(2), r.safety, (r.supplier&&r.supplier.name)||'']);
        const total=rows.reduce((t,r)=>t+Number(r[5]),0);
        return {name:'stock',label:'Right now',headers:['Item','Type','Qty','Unit','Unit price','Amount AUD','Reorder at','Supplier'],rows,footer:['','','','','Total value',total.toFixed(2),'','']};
      }
      if(type==='purchases'){
        const [ps,sups]=await Promise.all([MKR.stock.purchases(), MKR.stock.suppliers()]);
        const sn=id=>{ const s=sups.find(x=>x.id===id); return s?s.name:''; };
        const rows=[]; let total=0;
        ps.filter(p=>p.ts>=from&&p.ts<=to).sort((a,b)=>a.ts-b.ts).forEach(p=>{
          total+=(+p.total||0);
          (p.lines||[]).forEach(l=>rows.push([U.fmtDateTime(p.ts), sn(p.supplierId), p.invoiceNo||'', l.name, l.qty, (+l.unitPrice||0).toFixed(2), (+l.amount||0).toFixed(2)]));
        });
        return {name:'purchases',label,headers:['Date','Supplier','Invoice','Item','Qty','Unit price','Amount AUD'],rows,footer:['','','','','','Total',total.toFixed(2)]};
      }
      const staff=(await MKR.db.getAll('users')).filter(u=>(u.kitchenId||'k_main')===kid&&u.role!=='owner'&&!u.offboarded);
      const week=MKR.roster.thisWeek();
      const shifts=(await MKR.roster.shiftsFor(week)).filter(s=>staff.some(u=>u.id===s.staffId));
      const rows=shifts.slice().sort((a,b)=>a.day-b.day||String(a.start).localeCompare(String(b.start))).map(s=>{
        const u=staff.find(x=>x.id===s.staffId)||{};
        return [DAYS2[s.day],U.fmtDate(MKR.roster.dayTs(week,s.day)),u.name||s.staffId,s.start,s.end,U.round2(U.shiftHours(s.start,s.end)).toFixed(2)];
      });
      const totH=rows.reduce((t,r)=>t+Number(r[5]),0);
      return {name:'roster',label:'Week of '+week,headers:['Day','Date','Person','Start','End','Hours'],rows,footer:['','','','','Total',totH.toFixed(2)]};
    }
    function toCSV(d){ const esc=v=>`"${String(v==null?'':v).replace(/"/g,'""')}"`; const all=[d.headers,...d.rows]; if(d.footer) all.push(d.footer); return all.map(r=>r.map(esc).join(',')).join('\n'); }
    function toHTML(d){ const e=U.esc, name=(kitchen&&kitchen.name)||'My Kitchen';
      return `<div style="font-family:Inter,system-ui,sans-serif;padding:24px;color:#211E1B">
        <h2 style="margin:0 0 2px">${e(name)} — ${e(d.name)} report</h2>
        <p style="color:#6F655B;font-size:13px;margin:0 0 14px">${e(d.label)} · generated ${e(U.fmtDateTime(Date.now()))}</p>
        ${d.rows.length?`<table cellspacing="0" cellpadding="7" style="border-collapse:collapse;width:100%;font-size:13px">
          <thead><tr>${d.headers.map(h=>`<th align="left" style="border-bottom:2px solid #211E1B;padding:7px">${e(h)}</th>`).join('')}</tr></thead>
          <tbody>${d.rows.map(r=>`<tr>${r.map(c2=>`<td style="border-bottom:1px solid #ddd;padding:7px">${e(c2)}</td>`).join('')}</tr>`).join('')}
          ${d.footer?`<tr>${d.footer.map(c2=>`<td style="border-top:2px solid #211E1B;padding:7px;font-weight:700">${e(c2)}</td>`).join('')}</tr>`:''}</tbody></table>`
          :'<p>No data for this range.</p>'}
        <p style="font-size:11px;color:#9A8F84;margin-top:18px">Your own operational records, exported for your use.</p></div>`;
    }
    U.qs('#exCsv',c).onclick=async()=>{ const d=await buildExport(); if(!d.rows.length){ U.toast('Nothing to export for that range','amber'); return; } U.download(`${d.name}-${U.todayISO()}.csv`, toCSV(d)); await MKR.audit.log({action:'export',desc:`Exported ${d.name} (${d.label})`}); U.toast('CSV exported','green'); };
    U.qs('#exPdf',c).onclick=async()=>{ const d=await buildExport(); U.printHTML(toHTML(d)); await MKR.audit.log({action:'export',desc:`Printed ${d.name} (${d.label})`}); };
  }

  // The owner shouldn't have to go looking. Everything that wants a decision
  // today is on this one screen; everything quiet stays quiet.
  // Home comes three ways: the restaurant floor (the default — rooms you walk
  // into), the springboard of blocks the owner arranges themselves, or the plain
  // list. Same data underneath; the choice sticks per device.
  const HKEY = 'mkr_home_view';
  const HOME_VIEWS = ['floor','tiles','list'];
  let homeView = (function(){
    try{ const v = localStorage.getItem(HKEY); return HOME_VIEWS.includes(v) ? v : 'floor'; }
    catch(e){ return 'floor'; }
  })();
  function homeSwitch(){
    return `<div class="viewswitch" role="group" aria-label="How to show today">
      <button class="${homeView==='floor'?'on':''}" data-home="floor">🏠 Floor</button>
      <button class="${homeView==='tiles'?'on':''}" data-home="tiles">⬛ Blocks</button>
      <button class="${homeView==='list'?'on':''}" data-home="list">☰ List</button>
    </div>`;
  }
  function bindHomeSwitch(c){
    U.qsa('[data-home]',c).forEach(b=> b.onclick = ()=>{
      homeView = b.dataset.home;
      try{ localStorage.setItem(HKEY, homeView); }catch(e){}
      dashboard(c);
    });
  }

  async function dashboard(c){
    await noShowScan();
    if((homeView==='floor' && MKR.gameMap) || (homeView==='tiles' && MKR.tiles)){
      c.innerHTML = `<div class="section-head"><div><h2>Today</h2><p>Runs quietly — it only asks for you when something actually needs you</p></div>
        <div class="row gap8 wrap">${homeSwitch()}</div></div><div id="homeBody"></div>`;
      bindHomeSwitch(c);
      const body = U.qs('#homeBody',c);
      return homeView==='tiles' ? MKR.tiles.render(body, {role:'owner'}) : MKR.gameMap.render(body);
    }
    const m = await metrics();
    const staff = (await MKR.db.getAll('users')).filter(u=>(u.role==='staff'||u.role==='manager') && !u.offboarded);

    // Warnings from this week's roster — advisory, same as the roster page.
    let rWarns=[]; try{ rWarns = await MKR.roster.warnings(m.week, staff); }catch(e){}

    // The one job of this screen: surface only what actually needs the owner
    // today, as tappable actions. Everything else is demoted to a quiet footer.
    const short = rWarns.filter(w=>w.level==='red').length;
    const todo = [];
    if(m.deliveries.length)      todo.push({icon:'truck',    ink:'var(--blue)',       href:'#/owner/deliveries', title:'Deliveries to confirm', sub:'Check them at the back door', n:m.deliveries.length, tint:'var(--blue-soft)'});
    if(m.lowStock.length)        todo.push({icon:'box',      ink:'#8a6410',           href:'#/owner/stock',      title:'Stock running low', sub:m.lowStock.slice(0,3).map(r=>r.name).join(', '), n:m.lowStock.length, tint:'var(--amber-soft)'});
    if(m.trainingOverdue.length) todo.push({icon:'book',     ink:'var(--accent-ink)', href:'#/owner/training',   title:'Training overdue', sub:'Waiting to be signed off', n:m.trainingOverdue.length, tint:'var(--accent-soft)'});
    if(short)                    todo.push({icon:'calendar', ink:'var(--red)',        href:'#/manager/schedule', title:'Roster is short today', sub:'Fewer people on than you planned', n:short, tint:'var(--red-soft)'});
    if(m.alerts.length)          todo.push({icon:'bell',     ink:'var(--red)',        href:'#/owner/alerts',     title:'Unread alerts', sub:'Tap to review', n:m.alerts.length, tint:'var(--red-soft)'});

    const weekHrs = U.round2(m.shifts.reduce((t,s)=>t+U.shiftHours(s.start,s.end),0)).toFixed(1);

    c.innerHTML = `
      <div class="section-head"><div><h2>Today</h2><p>Runs quietly — it only asks for you when something actually needs you</p></div>
        <div class="row gap8 wrap">${homeSwitch()}</div></div>

      ${todo.length ? `
        <div class="today-label">Needs you now</div>
        <div class="today-acts">
          ${todo.map(t=>`<a class="today-act clickable" href="${t.href}">
            <div class="today-act-ic" style="background:${t.tint};color:${t.ink}">${MKR.ui.icon(t.icon)}</div>
            <div class="today-act-body"><b>${t.title}</b><span>${U.esc(t.sub)}</span></div>
            ${t.n>1?`<span class="today-act-n">${t.n}</span>`:''}
            <span class="today-act-chev" aria-hidden="true">›</span>
          </a>`).join('')}
        </div>
      ` : `
        <div class="today-clear card">
          <div class="today-clear-ic">${MKR.ui.icon('check')}</div>
          <b>Nothing needs you right now</b>
          <span>Nothing outstanding. Go and run your restaurant.</span>
        </div>
      `}

      <div class="today-foot">
        <div class="today-foot-head">${MKR.ui.icon('check')} Everything else is running fine</div>
        <div class="today-foot-metrics">
          <a href="#/owner/stock"><span>Stock</span><b>${U.money0(m.stockValue)}</b></a>
          <a href="#/manager/schedule"><span>This week</span><b>${weekHrs}h</b></a>
          <a href="#/owner/training"><span>Training</span><b>${m.training.length}</b></a>
          <a href="#/manager/schedule"><span>On today</span><b>${m.todayShifts.length}</b></a>
        </div>
      </div>

      <div class="disclaimer mt16"><span>ℹ️</span>This app tracks your own operations only. It doesn't calculate pay, interpret awards, or talk to any government system.</div>`;

    bindHomeSwitch(c);
  }

  // ---------- Staff performance points ----------
  async function performanceView(c){
    const settings = await MKR.db.meta('settings') || {};
    // Points come from things the venue can actually observe without a till:
    // turning up on time, finishing the checklist, and getting trained.
    const W = Object.assign({perOnTime:5, perTask:3, perTraining:6, latePenalty:4}, settings.perfWeights||{});
    const kid = (MKR.auth.current()&&MKR.auth.current().kitchenId)||'k_main';
    const staff = (await MKR.db.getAll('users')).filter(u=>u.role==='staff' && !u.offboarded && (u.kitchenId||'k_main')===kid);
    const clockins = await MKR.db.getAll('clockins');
    const tasks = await MKR.db.getAll('tasks');
    let trainings=[]; try{ trainings = await MKR.training.trainings(); }catch(e){}
    const cut = Date.now()-30*864e5;

    const rows = staff.map(s=>{
      const mine = clockins.filter(k=>k.staffId===s.id && (k.clockTs||0)>=cut);
      const onTime = mine.filter(k=>!k.late).length;
      const late = mine.filter(k=>k.late).length;
      const tasksDone = tasks.filter(t=>t.done && t.by===s.name).length;
      const trained = trainings.filter(t=>t.staffId===s.id && t.status==='done').length;
      const trainingOpen = trainings.filter(t=>t.staffId===s.id && t.status!=='done').length;
      const bonus = (s.rewards||[]).reduce((a,r)=>a+(r.points||0),0);
      const points = Math.max(0, Math.round(onTime*W.perOnTime + tasksDone*W.perTask + trained*W.perTraining - late*W.latePenalty + bonus));
      return { s, onTime, late, tasks:tasksDone, trained, trainingOpen, bonus, points, lastReward:(s.rewards||[]).slice(-1)[0] };
    }).sort((a,b)=>b.points-a.points);
    const maxPts = Math.max(1,...rows.map(r=>r.points));

    c.innerHTML = `
      <div class="section-head"><div><h2>Staff performance</h2><p>Points from on-time clock-ins, checklist tasks and completed training over the last 30 days</p></div>
        <button class="btn btn-ghost btn-sm" id="ptsCfg">⚙️ Points settings</button></div>
      <div class="card pad20"><div class="bestlist" id="lb"></div></div>
      <div class="disclaimer mt16"><span>🏅</span>Points are an internal incentive metric over the last 30 days — not a formal performance review.</div>`;

    const lb = U.qs('#lb',c);
    lb.innerHTML = rows.length ? rows.map((r,i)=>{
      const medal = ['🥇','🥈','🥉'][i] || `#${i+1}`;
      return `<div class="li"><div class="ava">${r.s.emoji||U.initials(r.s.name)}</div>
        <div class="meta"><b>${medal} ${U.esc(r.s.name)} ${r.lastReward?`<span class="pill ok">🎁 ${U.esc(r.lastReward.note||'rewarded')}</span>`:''}</b>
          <span>${r.onTime} on-time · ${r.tasks} tasks · ${r.trained} training done${r.late?` · <span style="color:var(--red)">${r.late} late</span>`:''}${r.trainingOpen?` · ${r.trainingOpen} outstanding`:''}</span>
          <div class="bar" style="margin-top:6px"><i style="width:${Math.round(r.points/maxPts*100)}%"></i></div></div>
        <div class="row gap6 center"><b style="font-family:'Playfair Display',serif;font-size:18px">${r.points}</b><button class="btn btn-ghost btn-sm" data-reward="${r.s.id}">🎁 Reward</button></div></div>`;
    }).join('') : '<div class="empty"><div class="em">🏅</div><p>No staff yet</p></div>';
    U.qsa('[data-reward]',lb).forEach(b=>b.onclick=()=>rewardModal((rows.find(r=>r.s.id===b.dataset.reward)||{}).s));
    U.qs('#ptsCfg',c).onclick=cfgModal;

    function cfgModal(){
      const f=(id,label,val)=>`<div class="row center" style="gap:10px;margin-bottom:8px"><div class="grow" style="font-size:14px">${label}</div><input class="input" id="${id}" type="number" min="0" value="${val}" style="width:90px;text-align:right"></div>`;
      const wrap=U.el(`<div><div class="disclaimer" style="margin-bottom:12px"><span>⚙️</span>Set how many points each action is worth (last 30 days, all staff).</div>
        ${f('w_t','Points per on-time clock-in',W.perOnTime)}${f('w_k','Points per task done',W.perTask)}${f('w_r','Points per training completed',W.perTraining)}${f('w_e','Penalty per late clock-in',W.latePenalty)}</div>`);
      U.modal('Points settings', wrap, {actions:[{label:'Save', class:'btn-dark', onClick:async(cl)=>{
        const s=await MKR.db.meta('settings')||{};
        s.perfWeights={perOnTime:+U.qs('#w_t',wrap).value||0, perTask:+U.qs('#w_k',wrap).value||0, perTraining:+U.qs('#w_r',wrap).value||0, latePenalty:+U.qs('#w_e',wrap).value||0};
        await MKR.db.meta('settings',s); cl(); U.toast('Points settings saved','green'); performanceView(c);
      }}]});
    }
    function rewardModal(su){ if(!su) return;
      const wrap=U.el(`<div>
        <div class="field"><label>Reward / recognition</label><input class="input" id="r_note" placeholder="e.g. $50 bonus · Employee of the month"></div>
        <div class="field"><label>Bonus points (optional)</label><input class="input" id="r_pts" type="number" min="0" value="0"></div></div>`);
      U.modal('🎁 Reward '+U.esc(su.name), wrap, {actions:[{label:'Give reward', class:'btn-green', onClick:async(cl)=>{
        const note=U.qs('#r_note',wrap).value.trim(); if(!note){ U.toast('Enter a reward','red'); return; }
        const pts=Math.max(0,+U.qs('#r_pts',wrap).value||0);
        const u=await MKR.db.get('users',su.id)||{}; const rewards=(u.rewards||[]).concat([{ts:Date.now(),note,points:pts,by:(MKR.auth.current()||{}).name}]);
        await MKR.db.put('users',{id:su.id, rewards});
        await MKR.audit.log({action:'reward', desc:`Rewarded ${su.name}: ${note}${pts?` (+${pts} pts)`:''}`});
        cl(); U.toast('Reward recorded 🎁','green'); performanceView(c);
      }}]});
    }
  }

  // ---------- Alerts ----------
  async function alerts(c){
    const settings = await MKR.db.meta('settings') || {};
    let retention = settings.alertRetentionDays==null ? 7 : settings.alertRetentionDays;  // 0 = keep forever
    // Auto-clean: drop alerts older than the chosen retention so the list stays tidy.
    if(retention>0){
      const cut = Date.now() - retention*864e5;
      for(const a of await MKR.db.getAll('alerts')){ if((a.ts||0) < cut) await MKR.db.remove('alerts', a.id); }
    }
    let list=(await MKR.db.getAll('alerts')).sort((a,b)=>b.ts-a.ts);
    async function reload(){ list=(await MKR.db.getAll('alerts')).sort((x,y)=>y.ts-x.ts); draw(); }
    function draw(){
      const opts=[3,7,14,30,0].map(d=>`<option value="${d}"${d===retention?' selected':''}>${d===0?'Never':d+' days'}</option>`).join('');
      c.innerHTML=`<div class="section-head"><div><h2>Alerts</h2><p>Only fires when something actually needs you — low stock, a no-show, a delivery problem</p></div>
        <div class="row gap8 wrap center">
          <span class="faint" style="font-size:13px">Auto-clear after</span>
          <select class="input" id="retSel" style="height:38px;width:auto">${opts}</select>
          ${list.some(a=>a.read)?'<button class="btn btn-ghost btn-sm" id="clrRead">🗑️ Clear read</button>':''}
          ${list.some(a=>!a.read)?'<button class="btn btn-ghost btn-sm" id="readAll">Mark all read</button>':''}
        </div></div>
        <div id="al"></div>`;
      const el=U.qs('#al',c);
      if(!list.length){ el.innerHTML=`<div class="empty"><div class="em">😌</div><p>No alerts — all good</p></div>`; }
      else el.innerHTML=list.map(a=>`<div class="alert ${a.level==='red'?'red':'amber'}" style="margin-bottom:12px;${a.read?'opacity:.55':''}"><span>${a.level==='red'?'⚠️':'🔔'}</span>
        <div class="grow"><b>${U.esc(a.title)}</b><br>${U.esc(a.desc)} · <span class="faint">${U.ago(a.ts)}</span></div>
        <div class="row gap6">${a.read?'<span class="pill ghost">Read</span>':`<button class="btn btn-ghost btn-sm" data-r="${a.id}">Mark read</button>`}<button class="btn btn-ghost btn-sm" data-x="${a.id}" aria-label="Delete">✕</button></div></div>`).join('');
      U.qs('#retSel',c).onchange=async(e)=>{ retention=+e.target.value; const s=await MKR.db.meta('settings')||{}; s.alertRetentionDays=retention; await MKR.db.meta('settings',s); U.toast('Auto-clear setting saved','green'); alerts(c); };
      U.qsa('[data-r]',el).forEach(b=>b.onclick=async()=>{ await MKR.db.put('alerts',{id:b.dataset.r,read:true}); reload(); });
      U.qsa('[data-x]',el).forEach(b=>b.onclick=async()=>{ await MKR.db.remove('alerts',b.dataset.x); reload(); });
      const ra=U.qs('#readAll',c); if(ra) ra.onclick=async()=>{ for(const a of list) if(!a.read) await MKR.db.put('alerts',{id:a.id,read:true}); reload(); };
      const cr=U.qs('#clrRead',c); if(cr) cr.onclick=async()=>{ if(await U.confirm('Clear read alerts','Delete all alerts already marked read?',{ok:'Clear',danger:true})){ for(const a of list) if(a.read) await MKR.db.remove('alerts',a.id); reload(); } };
    }
    draw();
  }

  // ---------- Audit log ----------
  async function audit(c){
    const logs=await MKR.audit.all();
    c.innerHTML=`<div class="section-head"><div><h2>Sensitive-action audit</h2><p>Roster changes, stock counts, deliveries, ID reveals · append-only, tamper-proof</p></div>
      <span class="pill ghost">🔒 Append-only · ${logs.length} entries</span></div>
      <div class="card" style="padding:14px 18px;margin-bottom:14px"><input class="input" id="auditSearch" placeholder="Search actions, people, details…"></div>
      <div class="card" style="padding:8px 18px"><div class="list" id="auditList"></div></div>
      <div class="disclaimer mt16"><span>🔒</span>The audit log is append-only — there is no delete or edit path anywhere in the system.</div>`;
    function iconOf(a){ return ({'staff.offboard':'🔒','staff.hire':'➕','tfn.view':'🪪','login':'🔑','shift.create':'📅','shift.remove':'🗑️','sos.post':'🆘','swap.approve':'🔁','settings.update':'⚙️','kitchen.create':'🏢','kitchen.approve':'✅','booking.create':'📅','booking.update':'📖','reward':'🎁','export':'⬇️','stock.purchase':'🧾','stock.count':'🔢','delivery.confirm':'✅','delivery.reject':'⛔','training.assign':'📘','training.complete':'🎓','partner.lawyer':'⚖️','partner.vevo':'🛂'})[a]||'•'; }
    const list=U.qs('#auditList',c);
    function draw(q){
      const ql=(q||'').trim().toLowerCase();
      const rows=logs.filter(l=>!ql || (MKR.audit.label(l.action)+' '+(l.desc||'')+' '+(l.actor||'')).toLowerCase().includes(ql));
      list.innerHTML = rows.length? rows.map(l=>`<div class="li"><div class="ava">${iconOf(l.action)}</div>
        <div class="meta"><b>${MKR.audit.label(l.action)}${l.amount!=null?' · '+U.money(l.amount):''}</b><span>${U.esc(l.desc||'')}</span></div>
        <div style="text-align:right"><div style="font-size:13px;font-weight:600">${U.esc(l.actor||'System')}</div><div class="faint" style="font-size:11.5px">${U.fmtDateTime(l.ts)}</div></div></div>`).join('')
        : `<div class="empty"><div class="em">🗂️</div><p>${ql?'No matching actions':'No actions recorded yet'}</p></div>`;
    }
    draw('');
    U.qs('#auditSearch',c).oninput=(e)=>draw(e.target.value);
  }

  // ---------- Branches (the owner's own venues — add & switch) ----------
  async function branches(c){
    const sess=MKR.auth.current();
    const all=await MKR.db.getAll('kitchens');
    const users=await MKR.db.getAll('users');
    const shifts=await MKR.roster.shiftsFor(MKR.roster.thisWeek());
    const mine=all.filter(k=>k.ownerId===sess.id || k.id===sess.kitchenId);
    const I=(n)=> MKR.ui?MKR.ui.icon(n):'';
    function draw(){
      const bstat=k=>{
        const people=users.filter(u=>(u.kitchenId||'k_main')===k.id && u.role!=='owner' && !u.offboarded);
        const ids=new Set(people.map(u=>u.id));
        const ss=shifts.filter(s=>ids.has(s.staffId));
        return { people:people.length, shifts:ss.length,
                 hours:U.round2(ss.reduce((t,s)=>t+U.shiftHours(s.start,s.end),0)) }; };
      const rows=mine.map(k=>({k, ...bstat(k)}));
      const totPpl=rows.reduce((s,r)=>s+r.people,0), totSh=rows.reduce((s,r)=>s+r.shifts,0), totH=U.round2(rows.reduce((s,r)=>s+r.hours,0));
      const maxH=Math.max(1,...rows.map(r=>r.hours));
      const ranked=rows.slice().sort((a,b)=>b.hours-a.hours);
      const tile=(ic,label,val)=>`<div class="card ds-tile"><div class="ds-ico">${I(ic)}</div><div class="ds-tile-body"><span class="ds-tile-label">${label}</span><span class="ds-tile-val">${val}</span></div></div>`;
      c.innerHTML=`
        <div class="section-head"><div><h2>Branches</h2><p>All your venues at a glance — then switch in to manage one</p></div>
          <button class="btn btn-accent btn-sm" id="addBranch">＋ Add branch</button></div>
        <div class="grid g4" style="margin-bottom:16px">
          ${tile('building','Branches', rows.length)}
          ${tile('users','People (all)', totPpl)}
          ${tile('calendar','Shifts this week', totSh)}
          ${tile('clock','Hours this week', totH.toFixed(1)+'h')}
        </div>
        <div class="card pad20" style="margin-bottom:16px">
          <div class="section-title">${I('bars')} Rostered hours this week by branch</div>
          <div class="bestlist">${rows.length? ranked.map(r=>`
            <div class="bestrow"><span class="bestnm">${U.esc(r.k.name)}</span><div class="besttrack"><div class="bestfill" data-w="${Math.round(r.hours/maxH*100)}"></div></div><b class="bestq">${r.hours.toFixed(1)}h</b></div>`).join('')
            : '<div class="empty" style="padding:16px"><div class="em">🏢</div><p>No branches yet</p></div>'}</div>
        </div>
        <div class="card" style="padding:8px 18px"><div class="list" id="blist"></div></div>
        <div class="disclaimer mt16"><span>🏢</span>Switching a branch changes which venue's team, stock and settings you manage. The current branch is highlighted and its logo/name shows on the sign-in page.</div>`;
      const el=U.qs('#blist',c);
      el.innerHTML = rows.length? rows.map(({k,shifts:sh,hours,people})=>{
        const active=k.id===sess.kitchenId;
        const logo=k.logo?`<img src="${k.logo}" class="kit-logo">`:`<div class="ds-li-ic">${I('building')}</div>`;
        return `<div class="li">${logo}
          <div class="meta"><b>${U.esc(k.name)} ${active?'<span class="pill ok">Current</span>':''} ${k.primary?'<span class="pill ghost">Primary</span>':''}</b><span>${U.esc(k.location||'—')} · ${people} people · ${sh} shifts · ${hours.toFixed(1)}h this week</span></div>
          ${active?'':`<button class="btn btn-ghost btn-sm" data-sw="${k.id}">Switch ›</button>`}</div>`;
      }).join('') : '<div class="empty"><div class="em">🏢</div><p>No branches yet</p></div>';
      requestAnimationFrame(()=> U.qsa('.bestfill',c).forEach(b=> b.style.width=b.dataset.w+'%'));
      U.qsa('[data-sw]',el).forEach(b=>b.onclick=async()=>{
        const k=mine.find(x=>x.id===b.dataset.sw);
        MKR.auth.switchKitchen(b.dataset.sw);
        await MKR.features.load();
        if(k) await MKR.db.meta('brand', {name:k.name, avatar:k.logo||null});
        U.toast('Switched to '+(k?k.name:'branch'),'green');
        location.hash='#/owner/dashboard'; MKR.router.render();
      });
      U.qs('#addBranch',c).onclick=addBranch;
    }
    function addBranch(){
      const wrap=U.el(`<div>
        <div class="field"><label>Branch name</label><input class="input" id="b_name" placeholder="e.g. My Kitchen · Sydney"></div>
        <div class="field"><label>Location</label><input class="input" id="b_loc" placeholder="e.g. Sydney, NSW"></div>
        <div class="row"><div class="field grow"><label>Opening time</label><input class="input" id="b_open" type="time" value="09:00"></div>
        <div class="field grow"><label>Closing time</label><input class="input" id="b_close" type="time" value="22:00"></div></div>
        <div class="disclaimer"><span>ℹ️</span>Adds a new venue you own. Switch to it to set up its team, menu and features.</div>
      </div>`);
      U.modal('Add a branch', wrap, {actions:[{label:'Add branch', class:'btn-dark', onClick:async(close)=>{
        const name=U.qs('#b_name',wrap).value.trim(); if(!name){ U.toast('Please enter a name','red'); return; }
        const id='k_'+Math.random().toString(36).slice(2,8);
        await MKR.db.put('kitchens',{id, name, location:U.qs('#b_loc',wrap).value.trim(), status:'active', ownerId:sess.id, primary:false, setupComplete:true, logo:null, operatingHours:{open:U.qs('#b_open',wrap).value, close:U.qs('#b_close',wrap).value}, createdAt:Date.now()});
        await MKR.audit.log({action:'kitchen.create', desc:`Added branch ${name}`});
        close(); U.toast('Branch added — switch to it to set it up','green'); branches(c);
      }}]});
    }
    draw();
  }

  // ---------- Super Admin · multi-tenant Kitchens ----------
  async function kitchens(c, arg){
    if(arg) return kitchenDetail(c, arg);
    const list=(await MKR.db.getAll('kitchens'));
    let kitch = list.length ? list : [{id:'k_main', name:(await MKR.db.meta('settings')||{}).shopName||'My Kitchen', location:'Melbourne, VIC', status:'active', primary:true, createdAt:Date.now()}];
    const users=await MKR.db.getAll('users');
    const usersIn = k => users.filter(u=>(u.kitchenId||'k_main')===k.id);
    const active=kitch.filter(k=>k.status==='active').length;
    const pending=kitch.filter(k=>k.status==='pending').length;

    c.innerHTML=`
      <div class="section-head"><div><h2>Super Admin · Kitchens</h2><p>Master dashboard — full visibility and provisioning across every venue (tenant)</p></div>
        <button class="btn btn-accent btn-sm" id="newK">＋ Create kitchen</button></div>
      <div class="grid g4" style="margin-bottom:18px">
        <div class="card stat"><div class="k">🏢 Kitchens</div><div class="v">${kitch.length}</div></div>
        <div class="card stat"><div class="k">✅ Active</div><div class="v" style="color:var(--green)">${active}</div></div>
        <div class="card stat"><div class="k">⏳ Pending approval</div><div class="v" style="color:${pending?'var(--amber)':'inherit'}">${pending}</div></div>
        <div class="card stat"><div class="k">👥 Total users</div><div class="v">${users.length}</div></div>
      </div>
      <div class="card" style="padding:8px 18px"><div class="list" id="klist"></div></div>
      <div class="disclaimer mt16"><span>🏢</span>Each kitchen is an isolated tenant. From here you have global visibility into every kitchen's data, configuration and users, and you approve or onboard new ones.</div>`;

    const el=U.qs('#klist',c);
    el.innerHTML=kitch.sort((a,b)=>(a.status==='pending'?-1:0)-(b.status==='pending'?-1:0)).map(k=>{
      const mem=usersIn(k);
      const mgr=mem.filter(u=>u.role==='manager').length, stf=mem.filter(u=>u.role==='staff').length;
      const badge = k.status==='active'?'<span class="pill ok">Active</span>': k.status==='pending'?'<span class="pill warn">Pending</span>':'<span class="pill ghost">'+U.esc(k.status)+'</span>';
      return `<div class="li">
        <div class="ava">🏢</div>
        <div class="meta"><b>${U.esc(k.name)} ${k.primary?'<span class="pill ghost">Primary</span>':''}</b><span>${U.esc(k.location||'—')} · ${mgr} manager(s) · ${stf} staff · ID ${U.esc(k.id)}</span></div>
        <div class="row gap6 center">
          ${badge}
          ${k.status==='pending'?`<button class="btn btn-green btn-sm" data-ap="${k.id}">Approve</button>`:''}
          <a class="btn btn-ghost btn-sm" href="#/owner/kitchens/${k.id}">View ›</a>
        </div></div>`;
    }).join('');
    U.qsa('[data-ap]',el).forEach(b=>b.onclick=async()=>{
      await MKR.db.put('kitchens',{id:b.dataset.ap, status:'active', approvedAt:Date.now()});
      await MKR.audit.log({action:'kitchen.approve', desc:`Approved kitchen ${b.dataset.ap}`});
      U.toast('Kitchen approved & provisioned','green'); kitchens(c);
    });
    U.qs('#newK',c).onclick=()=>{
      const wrap=U.el(`<div>
        <div class="field"><label>Kitchen / venue name</label><input class="input" id="k_name" placeholder="e.g. My Kitchen · Sydney"></div>
        <div class="field"><label>Location</label><input class="input" id="k_loc" placeholder="e.g. Sydney, NSW"></div>
        <div class="disclaimer"><span>ℹ️</span>New kitchens start as <b>Pending</b> until you approve them from this dashboard.</div>
      </div>`);
      U.modal('Create a new kitchen', wrap, {actions:[{label:'Create (pending)', class:'btn-dark', onClick:async(cl)=>{
        const name=U.qs('#k_name',wrap).value.trim(); if(!name){ U.toast('Please enter a name','red'); return; }
        const id='k_'+Math.random().toString(36).slice(2,8);
        await MKR.db.put('kitchens',{id, name, location:U.qs('#k_loc',wrap).value.trim(), status:'pending', ownerId:(MKR.auth.current()||{}).id, createdAt:Date.now()});
        await MKR.audit.log({action:'kitchen.create', desc:`Created kitchen ${name}`});
        cl(); U.toast('Kitchen created — pending approval','green'); kitchens(c);
      }}]});
    };
  }

  async function kitchenDetail(c, id){
    const k=(await MKR.db.getAll('kitchens')).find(x=>x.id===id) || {id, name:'My Kitchen', status:'active', primary:true};
    const users=(await MKR.db.getAll('users')).filter(u=>(u.kitchenId||'k_main')===id);
    const settings=await MKR.db.meta('settings')||{};
    const mgrs=users.filter(u=>u.role==='manager');
    const staff=users.filter(u=>u.role==='staff');
    const owners=users.filter(u=>u.role==='owner');
    const group=(title,arr,em)=>`
      <div class="card" style="padding:6px 18px;margin-bottom:16px"><div class="section-title" style="padding-top:12px">${em} ${title} <span class="faint" style="font-size:12px">${arr.length}</span></div>
      <div class="list">${arr.length?arr.map(u=>`<a class="li clickable" href="#/owner/team/${u.id}"><div class="ava">${u.emoji||U.initials(u.name)}</div>
        <div class="meta"><b>${U.esc(u.name)} ${u.offboarded?'<span class="pill danger">Offboarded</span>':''}</b><span>Unique ID <b>${U.esc(u.id)}</b> · ${U.esc(u.position||MKR.auth.roleName(u.role))}</span></div>
        <span class="faint" style="font-size:22px">›</span></a>`).join(''):'<div class="empty" style="padding:20px"><div class="em">—</div><p>None</p></div>'}</div></div>`;

    c.innerHTML=`
      <div class="row center between wrap" style="margin-bottom:16px">
        <a class="btn btn-ghost btn-sm" href="#/owner/kitchens">← Back to kitchens</a>
        ${k.status==='pending'?`<button class="btn btn-green btn-sm" id="apK">Approve & provision</button>`:`<span class="pill ok">Active</span>`}
      </div>
      <div class="section-head"><div><h2>${U.esc(k.name)}</h2><p>${U.esc(k.location||'—')} · tenant ID ${U.esc(k.id)}</p></div></div>
      <div class="grid g4" style="margin-bottom:18px">
        <div class="card stat"><div class="k">👑 Owners</div><div class="v">${owners.length}</div></div>
        <div class="card stat"><div class="k">📋 Managers</div><div class="v">${mgrs.length}</div></div>
        <div class="card stat"><div class="k">🧑‍🍳 Staff</div><div class="v">${staff.length}</div></div>
        <div class="card stat"><div class="k">👥 Total people</div><div class="v">${users.length}</div></div>
      </div>
      <div class="section-title">Hierarchy &amp; unique IDs</div>
      ${owners.length?group('Owners',owners,'👑'):''}
      ${group('Managers',mgrs,'📋')}
      ${group('Staff',staff,'🧑‍🍳')}
      <div class="card" style="padding:6px 18px"><div class="section-title" style="padding-top:12px">⚙️ Configuration snapshot</div><div class="list">
        <div class="li"><div class="meta"><span>Operating hours</span><b>${(settings.operatingHours||{}).open||'—'} – ${(settings.operatingHours||{}).close||'—'}</b></div></div>
        <div class="li"><div class="meta"><span>Shift slots</span><b>${(settings.shiftSlots||[]).map(s=>s.label+' '+s.start+'-'+s.end).join(' · ')||'—'}</b></div></div>
        <div class="li"><div class="meta"><span>Daily task template</span><b>${(settings.dailyTasks||[]).length} task(s)</b></div></div>
      </div></div>
      <div class="disclaimer mt16"><span>🔑</span>Every user has a unique ID for signing into their customised portal. Tap a person to open their full profile.</div>`;
    const ap=U.qs('#apK',c); if(ap) ap.onclick=async()=>{ await MKR.db.put('kitchens',{id, status:'active', approvedAt:Date.now()}); await MKR.audit.log({action:'kitchen.approve', desc:`Approved kitchen ${id}`}); U.toast('Kitchen approved','green'); kitchenDetail(c,id); };
  }

  // ---------- Team management (offboard cut-off + TFN reveal + skills) ----------
  const EMP_LABEL=e=>({casual:'Casual',parttime:'Part-time',fulltime:'Full-time'})[e]||e||'—';
  const SKILL_EM=(k)=> ((MKR.roster.SKILLS[k]||{}).em)||'';

  async function team(c, arg){
    if(arg) return staffPage(c, arg);   // full-page staff profile
    const sess=MKR.auth.current();
    const kid=(sess&&sess.kitchenId)||'k_main';
    const settings=await MKR.db.meta('settings');
    const all=(await MKR.db.getAll('users')).filter(u=>(u.kitchenId||'k_main')===kid && u.role!=='owner');
    const managers=all.filter(u=>u.role==='manager');
    const staff=all.filter(u=>u.role==='staff');
    const shifts=await MKR.roster.shiftsFor(MKR.roster.thisWeek());
    const weekHours=id=>U.round2(shifts.filter(s=>s.staffId===id).reduce((t,s)=>t+U.shiftHours(s.start,s.end),0));
    const joinLink=`${location.origin}${location.pathname}#/join/${kid}`;

    const row=(u)=>{
      const h=weekHours(u.id);
      const sk=MKR.roster.skillsOf(u).map(SKILL_EM).join('');
      const roleTag = `<span class="pill ${u.role==='manager'?'info':'ghost'}">${MKR.auth.roleName(u.role)}</span>`;
      return `<a class="li clickable" href="#/owner/team/${u.id}">
        <div class="ava">${u.emoji||U.initials(u.name)}</div>
        <div class="meta"><b>${U.esc(u.name)} ${roleTag} ${sk?`<span class="pill ghost">${sk}</span>`:''} ${u.offboarded?'<span class="pill danger">Offboarded</span>':''}</b>
          <span>ID ${U.esc(u.id)} · ${U.esc(u.position||EMP_LABEL(u.employment))} · ${h.toFixed(1)}h this week · ${u.onboarded?'onboarded':'pending'}</span></div>
        <span class="faint" style="font-size:22px;line-height:1">›</span></a>`;
    };

    c.innerHTML=`
      <div class="section-head"><div><h2>Team</h2><p>Your managers and staff · tap anyone to open their profile or change their role</p></div>
        <button class="btn btn-dark btn-sm" id="joinBtn">🔗 Manager join link</button></div>
      <div class="grid g3" style="margin-bottom:16px">
        <div class="card stat"><div class="k">📋 Managers</div><div class="v">${managers.length}</div></div>
        <div class="card stat"><div class="k">🧑‍🍳 Staff</div><div class="v">${staff.length}</div></div>
        <div class="card stat"><div class="k">👥 Total people</div><div class="v">${all.length}</div></div>
      </div>
      <div class="card" style="padding:6px 18px;margin-bottom:16px"><div class="section-title" style="padding-top:12px">📋 Managers <span class="faint" style="font-size:12px">${managers.length}</span></div>
        <div class="list">${managers.length?managers.map(row).join(''):'<div class="empty" style="padding:18px"><div class="em">📋</div><p>No managers yet — share the join link</p></div>'}</div></div>
      <div class="card" style="padding:6px 18px"><div class="section-title" style="padding-top:12px">🧑‍🍳 Staff <span class="faint" style="font-size:12px">${staff.length}</span></div>
        <div class="list">${staff.length?staff.map(row).join(''):'<div class="empty" style="padding:18px"><div class="em">🧑‍🍳</div><p>No staff yet</p></div>'}</div></div>
      <div class="disclaimer mt16"><span>🔒</span>Only the owner can reveal a TFN / passport, and every reveal is audited. Skills (🔑 open · 🌙 close · 🍳 kitchen …) are what the AI roster plans around — set them in Rostering → Preferences.</div>`;

    U.qs('#joinBtn',c).onclick=()=>{
      const wrap=U.el(`<div>
        <p class="muted" style="font-size:14px">Share this link with a manager. They open it, create their login, and instantly join <b>this restaurant</b>.</p>
        <div class="field"><label>Manager join link</label><input class="input" id="jl" value="${joinLink}" readonly onclick="this.select()"></div>
      </div>`);
      U.modal('Invite a manager', wrap, {actions:[{label:'Copy link', class:'btn-dark', onClick:(cl)=>{
        navigator.clipboard?.writeText(joinLink).then(()=>U.toast('Join link copied','green')).catch(()=>{});
        cl();
      }}]});
    };
  }

  // ---------- Full staff profile (full page + editable) ----------
  async function staffPage(c, id){
    const settings=await MKR.db.meta('settings');
    const u=(await MKR.db.getAll('users')).find(x=>x.id===id);
    const ob=(await MKR.db.getAll('onboarding')).find(o=>o.userId===id);
    if(!u){ c.innerHTML=`<div class="empty"><div class="em">🤷</div><p>Staff member not found</p><a class="btn btn-ghost mt12" href="#/owner/team">← Back to team</a></div>`; return; }
    const shifts=await MKR.roster.shiftsFor(MKR.roster.thisWeek());
    const h=U.round2(shifts.filter(s=>s.staffId===id).reduce((t,s)=>t+U.shiftHours(s.start,s.end),0));
    let myTraining=[]; try{ myTraining=(await MKR.training.trainings()).filter(t=>t.staffId===id); }catch(e){}
    const availTxt=()=>{ const a=u.availability||{}; const m={off:'Off',am:'AM',pm:'PM',all:'All day'}; const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
      const parts=days.map((d,i)=>a[i]&&a[i]!=='off'?d+' '+m[a[i]]:null).filter(Boolean); return parts.length?parts.join(' · '):'Not set'; };

    function header(){ return `
      <div class="row center between wrap" style="margin-bottom:16px">
        <a class="btn btn-ghost btn-sm" href="#/owner/team">← Back to team</a>
        <div class="row gap8" id="headActions"></div>
      </div>
      <div class="row center gap8" style="margin-bottom:18px">
        <div class="ava" style="width:54px;height:54px;border-radius:15px;background:var(--accent-soft);color:var(--accent-ink);display:grid;place-items:center;font-size:24px">${u.emoji||U.initials(u.name)}</div>
        <div><b style="font-size:20px">${U.esc(u.name)}</b> ${u.offboarded?'<span class="pill danger">Offboarded</span>':'<span class="pill ok">Active</span>'}
          <div class="faint" style="font-size:13px">Unique ID ${U.esc(u.id)} · login ${U.esc(u.username||'—')} · ${EMP_LABEL(u.employment)}</div></div>
      </div>`; }

    // ---- View mode ----
    function renderView(){
      const row=(k,v)=>`<div class="li"><div class="meta"><span>${k}</span><b style="font-size:15px">${v||'—'}</b></div></div>`;
      const docRow=(label,data,key)=> data?`<div class="li"><div class="meta"><span>${label}</span><b style="font-size:15px">Uploaded</b></div><button class="btn btn-ghost btn-sm" data-doc="${key}">View</button></div>`:row(label,'<span class="faint">Not provided</span>');
      c.innerHTML=`
        <div style="max-width:680px">
        ${header()}
        <div class="card" style="padding:6px 18px;margin-bottom:16px"><div class="section-title" style="padding-top:12px">Basic info</div><div class="list">
          ${row('Phone', U.esc(u.phone))}
          ${row('Email', U.esc(u.email))}
          ${row('Position', U.esc(u.position))}
          ${row('Age', u.age!=null?u.age:'')}
          ${row('Start date', U.esc(u.startDate))}
          ${row('Address', U.esc(u.address))}
          ${row('Emergency contact', U.esc(u.emergency))}
          ${row('Availability', availTxt())}
        </div></div>
        <div class="card" style="padding:6px 18px;margin-bottom:16px"><div class="section-title" style="padding-top:12px">Work details</div><div class="list">
          ${row('Contract type', EMP_LABEL(u.employment))}
          ${row('Hours this week', h.toFixed(2)+'h')}
          ${row('Skills', MKR.roster.skillsOf(u).map(k=>`${(MKR.roster.SKILLS[k]||{}).em||''} ${(MKR.roster.SKILLS[k]||{}).label||k}`).join(' · ') || '<span class="faint">None set — add them in Rostering → Preferences</span>')}
          ${row('Training', myTraining.length?`${myTraining.filter(t=>t.status==='done').length}/${myTraining.length} signed off`:'<span class="faint">None assigned</span>')}
          ${row('ID / passport no.', ob&&ob.passportEnc?'<span id="ppSlot">'+MKR.crypto.mask()+'</span> <button class="btn btn-ghost btn-sm" id="ppBtn" style="margin-left:6px;min-height:32px;padding:0 12px">Reveal</button>':'')}
        </div></div>
        <div class="card" style="padding:6px 18px;margin-bottom:16px"><div class="section-title" style="padding-top:12px">Onboarding</div><div class="list">
          ${docRow('Passport / ID document', ob&&ob.passportDoc, 'passportDoc')}
          ${row('Emergency contact', U.esc(u.emergency))}
          ${row('Onboarding', u.onboarded?'<span class="pill ok">Complete</span>'+(ob&&ob.signedAt?' · signed '+U.fmtDate(ob.signedAt):''):'<span class="pill warn">Pending</span>')}
        </div></div>
        <div class="alert info" style="margin-bottom:16px"><span>💸</span><div>Pay, tax, super and bank details are deliberately not held here — this app doesn't run payroll or talk to any government system.${MKR.features.can('au_workrights','owner')?' Work rights are checked on VEVO.':''}</div></div>
        ${u.offboarded?`<div class="card" style="padding:6px 18px;margin-bottom:16px"><div class="section-title" style="padding-top:12px">Offboard archive</div><div class="list">
          ${row('Offboarded on', u.archivedAt?new Date(u.archivedAt).toISOString().slice(0,10):'')}
          ${row('Retained until', u.retentionUntil?new Date(u.retentionUntil).toISOString().slice(0,10):'')}
        </div></div>`:''}
        <div class="disclaimer"><span>🔒</span>The ID number is encrypted separately and only the owner can reveal it; each reveal is written to the audit log.</div>
        </div>`;
      // Head actions
      const ha=U.qs('#headActions',c);
      ha.innerHTML = `${MKR.partners?MKR.partners.buttons('owner'):''}<button class="btn btn-ghost btn-sm" id="roleBtn">🔀 ${MKR.auth.roleName(u.role)}</button>
        <button class="btn btn-dark btn-sm" id="editBtn">✏️ Edit profile</button>
        ${u.offboarded?'<button class="btn btn-green btn-sm" id="restoreBtn">Reactivate</button>':'<button class="btn btn-danger btn-sm" id="offBtn">Offboard</button>'}`;
      if(MKR.partners) MKR.partners.bind(c);
      U.qs('#editBtn',c).onclick=renderEdit;
      U.qs('#roleBtn',c).onclick=changeRole;
      const offB=U.qs('#offBtn',c); if(offB) offB.onclick=()=>offboard();
      const reB=U.qs('#restoreBtn',c); if(reB) reB.onclick=async()=>{ await MKR.db.put('users',{id,offboarded:false,archivedAt:null,retentionUntil:null}); if(MKR.supa.client) await MKR.supa.client.from('profiles').update({active:true}).eq('staff_id',id); U.toast(u.name+' reactivated','green'); staffPage(c,id); };
      // Document viewers
      U.qsa('[data-doc]',c).forEach(b=>b.onclick=()=>{ const img=ob[b.dataset.doc]; if(img) U.modal('Document', `<img src="${img}" style="width:100%;border-radius:12px">`); });
      // TFN / passport reveal
      const pb=U.qs('#ppBtn',c); if(pb) pb.onclick=async()=>{ const v=await MKR.crypto.dec(ob.passportEnc, ob.userId); await MKR.audit.log({action:'tfn.view',desc:`Revealed ${u.name}'s ID number`}); U.qs('#ppSlot',c).textContent=v; pb.remove(); };
    }

    // ---- Edit mode ----
    function renderEdit(){
      const fld=(id,label,val,type='text',ph='')=>`<div class="field"><label>${label}</label><input class="input" id="${id}" type="${type}" value="${U.esc(val==null?'':val)}" placeholder="${ph}"></div>`;
      const sel=(id,label,val,opts)=>`<div class="field"><label>${label}</label><select class="input" id="${id}">${opts.map(([v,t])=>`<option value="${v}" ${val===v?'selected':''}>${t}</option>`).join('')}</select></div>`;
      c.innerHTML=`
        <div style="max-width:680px">
        ${header()}
        <div class="card" style="padding:18px;margin-bottom:16px"><div class="section-title">Basic info</div>
          ${fld('f_phone','Phone',u.phone,'tel','04XX XXX XXX')}
          ${fld('f_email','Email',u.email,'email','name@example.com')}
          ${fld('f_position','Position',u.position,'text','e.g. Front of House / Kitchen')}
          <div class="row"><div class="grow">${fld('f_age','Age',u.age,'number')}</div><div class="grow">${fld('f_start','Start date',u.startDate,'date')}</div></div>
          ${fld('f_address','Address',u.address)}
          ${fld('f_emergency','Emergency contact',u.emergency,'text','name + phone')}
        </div>
        <div class="card" style="padding:18px;margin-bottom:16px"><div class="section-title">Work details</div>
          ${sel('f_emp','Contract type',u.employment||'casual',[['casual','Casual'],['parttime','Part-time'],['fulltime','Full-time']])}
          ${fld('f_passport','ID / passport no. (encrypted)','', 'text', ob&&ob.passportEnc?'stored (leave blank to keep)':'enter ID number')}
          <div class="field"><label>Skills — what this person can be rostered onto</label>
            <div class="row gap6 wrap">${Object.entries(MKR.roster.SKILLS).map(([k,v])=>`
              <label class="skill-chip"><input type="checkbox" data-fsk="${k}" ${MKR.roster.skillsOf(u).includes(k)?'checked':''}>${v.em} ${v.label}</label>`).join('')}</div></div>
        </div>
        <div class="row gap8" style="max-width:680px">
          <button class="btn btn-dark grow" id="saveBtn">Save profile</button>
          <button class="btn btn-ghost grow" id="cancelBtn">Cancel</button>
        </div>
        <div class="disclaimer mt12"><span>🔒</span>The ID number is AES-encrypted and stored separately — only the owner can reveal it. This app holds no pay, tax, super or bank data.</div>
        </div>`;
      U.qs('#cancelBtn',c).onclick=renderView;
      U.qs('#saveBtn',c).onclick=async()=>{
        const v=id2=>{ const e=U.qs('#'+id2,c); return e?e.value.trim():''; };
        // Non-sensitive → users
        await MKR.db.put('users',{ id,
          phone:v('f_phone'), email:v('f_email'), position:v('f_position'),
          age:v('f_age')?Number(v('f_age')):null, startDate:v('f_start'), address:v('f_address'), emergency:v('f_emergency'),
          employment:v('f_emp'),
          skills: U.qsa('[data-fsk]',c).filter(i=>i.checked).map(i=>i.dataset.fsk) });
        // ID number → onboarding (encrypted, owner-reveal only)
        const obId = (ob&&ob.id) || ('onb_'+id);
        const rec = { id:obId, userId:id };
        if(ob){ rec.passportDoc=ob.passportDoc; }
        const pp=v('f_passport'); if(pp) rec.passportEnc=await MKR.crypto.enc(pp, id); else if(ob&&ob.passportEnc) rec.passportEnc=ob.passportEnc;
        await MKR.db.put('onboarding', rec);
        await MKR.audit.log({action:'staff.hire', desc:`Updated ${u.name}'s profile`});
        U.toast('Profile saved','green');
        staffPage(c,id);   // re-fetch and return to view
      };
    }

    function changeRole(){
      const cur=u.role;
      const opt=(r,em,lbl)=>`<button data-role="${r}" class="${cur===r?'active':''}">${em} ${lbl}</button>`;
      const wrap=U.el(`<div>
        <p class="muted" style="font-size:14px">Change ${U.esc(u.name)}'s role in this restaurant. Managers can run rostering, the menu and approvals; staff get the simple execution portal.</p>
        <div class="role-seg" id="rseg">${opt('staff','🧑‍🍳','Staff')}${opt('manager','📋','Manager')}</div>
      </div>`);
      let pick=cur;
      U.qsa('[data-role]',wrap).forEach(b=>b.onclick=()=>{ pick=b.dataset.role; U.qsa('[data-role]',wrap).forEach(x=>x.classList.toggle('active', x===b)); });
      U.modal('Change role', wrap, {actions:[{label:'Save role', class:'btn-dark', onClick:async(cl)=>{
        if(pick!==cur){
          await MKR.db.put('users',{id, role:pick});
          if(MKR.supa.client){ try{ await MKR.supa.client.from('profiles').update({role:pick}).eq('staff_id',id); }catch(e){} }
          await MKR.audit.log({action:'staff.hire', desc:`Changed ${u.name}'s role to ${MKR.auth.roleName(pick)}`});
          U.toast(`${u.name} is now ${MKR.auth.roleName(pick)}`,'green');
        }
        cl(); staffPage(c,id);
      }}]});
    }

    async function offboard(){
      if(await U.confirm('Instant offboard cut-off',`Mark ${u.name} as offboarded? The account is disabled at the database layer and immediately loses access to all data; compliance data is encrypted and retained for 7 years.`,{ok:'Confirm offboard',danger:true})){
        const now=Date.now();
        await MKR.db.put('users',{id,offboarded:true, archivedAt:now, retentionUntil: now+7*365*24*3600*1000});
        if(MKR.supa.client) await MKR.supa.client.from('profiles').update({active:false}).eq('staff_id',id);
        await MKR.audit.log({action:'staff.offboard',desc:`Offboard cut-off · ${u.name}`});
        U.toast(`${u.name}'s access cut off`,'red'); staffPage(c,id);
      }
    }
    renderView();
  }

})();
