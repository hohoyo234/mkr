/* ===== Staff Portal ===== */
window.MKR = window.MKR || {}; MKR.portals = MKR.portals || {};
(function(){
  const U = MKR.util;
  const DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  MKR.portals.staff = {
    home:'my',
    nav:[
      {id:'my',     label:'My shifts', short:'Shifts'},
      {id:'availability', label:'Availability', short:'Available', feature:'availability'},
      {id:'tasks',  label:'Today\'s tasks', short:'Tasks', feature:'tasks'},
      {id:'training',label:'My training', short:'Training', feature:'training'},
      {id:'deliveries',label:'Deliveries', short:'Delivery', feature:'deliveries'},
      {id:'market', label:'Swap market', short:'Swaps', feature:'market'},
      {id:'me',     label:'My profile', short:'Profile'},
    ],
    async badges(){
      const sos=(await MKR.db.getAll('sos')).filter(s=>s.status==='open'&&!s.claimedBy).length;
      const sess=MKR.auth.current();
      let onb=0; if(sess){ const u=await MKR.db.get('users',sess.id); if(u && !u.onboarded) onb=1; }
      const b={}; if(sos) b.market=sos; if(onb) b.me='!';
      try{ const t=(await MKR.tasks.today()).filter(x=>!x.done).length; if(t) b.tasks=t; }catch(e){}
      try{ const t=(await MKR.training.mine()).filter(x=>x.status!=='done').length; if(t) b.training=t; }catch(e){}
      try{ const d=(await MKR.deliveries.pending()).length; if(d) b.deliveries=d; }catch(e){}
      return b;
    },
    async view(section,c){
      if(section==='my') return my(c);
      if(section==='availability') return availability(c);
      if(section==='tasks') return tasks(c);
      if(section==='market') return market(c);
      if(section==='training') return MKR.training.renderMine(c);
      if(section==='deliveries') return MKR.deliveries.render(c);
      if(section==='me' || section==='onboarding') return me(c);
    }
  };

  // ---------- Availability (quick presets + custom time per day; per-row update) ----------
  async function availability(c){
    const sess=MKR.auth.current();
    const me=await MKR.db.get('users',sess.id)||{};
    const av=Object.assign({}, me.availability||{});   // {0..6: 'off'|'am'|'pm'|'all'|'HH:MM-HH:MM'}
    c.innerHTML=`
      <div class="section-head"><div><h2>Availability</h2><p>Pick the times you can work each day — the manager's auto-roster prioritises what you fill in</p></div>
        <button class="btn btn-dark btn-sm" id="saveAv">Save</button></div>
      <div class="card" style="padding:6px 18px"><div id="avlist"></div></div>
      <div class="disclaimer mt16"><span>${MKR.ui.icon('calendar')}</span>Tap a quick slot, or set your own start/end time per day. The final roster is set by your manager.</div>`;
    const list=U.qs('#avlist',c);
    const PRESETS=[['off','Off'],['am','Morning 09-15'],['pm','Evening 15-22'],['all','All day 09-22']];
    const isCustom=(v)=> typeof v==='string' && /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(v);
    function rowEl(i){
      const cur=av[i]||'off', custom=isCustom(cur), cs=custom?cur.split('-'):['',''];
      const pills=PRESETS.map(([v,label])=>`<button class="pill ${(!custom&&cur===v)?'ok':'ghost'}" data-p="${v}" style="cursor:pointer">${label}</button>`).join(' ');
      const row=U.el(`<div class="li" style="flex-wrap:wrap;gap:8px"><div class="meta" style="min-width:64px"><b>${DAYS[i]}</b></div>
        <div class="row gap6 wrap center">${pills}
          <span class="pill ${custom?'ok':'ghost'}" style="gap:4px">Custom <input type="time" class="cstart" value="${cs[0]}" style="border:none;background:transparent;width:82px;font-size:13px;color:inherit">–<input type="time" class="cend" value="${cs[1]}" style="border:none;background:transparent;width:82px;font-size:13px;color:inherit"></span>
        </div></div>`);
      row.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{ av[i]=b.dataset.p; replaceRow(i); });
      const a=row.querySelector('.cstart'), b=row.querySelector('.cend');
      const onCustom=()=>{ if(a.value&&b.value){ av[i]=a.value+'-'+b.value; replaceRow(i); } };
      a.onchange=onCustom; b.onchange=onCustom;
      return row;
    }
    function replaceRow(i){ const old=list.children[i], neu=rowEl(i); if(old) list.replaceChild(neu, old); else list.appendChild(neu); }
    for(let i=0;i<DAYS.length;i++) list.appendChild(rowEl(i));
    U.qs('#saveAv',c).onclick=async()=>{ await MKR.db.put('users',{id:sess.id, availability:av}); U.toast('Availability saved','green'); };
  }

  // ---------- My shifts ----------
  async function my(c){
    const sess = MKR.auth.current();
    const todayIdx = (new Date().getDay()+6)%7;
    const week = MKR.roster.thisWeek();
    let shifts = (await MKR.roster.shiftsFor(week)).filter(s=>s.staffId===sess.id).sort((a,b)=>a.day-b.day||a.start.localeCompare(b.start));
    let clockins = (await MKR.db.getAll('clockins')).filter(k=>k.staffId===sess.id);
    const total = U.round2(shifts.reduce((t,s)=>t+MKR.util.shiftHours(s.start,s.end),0));
    function draw(){
      // One focus: today's shift + the single action (clock in). The rest of the
      // week sits quietly below.
      const todayShift = shifts.find(s=>s.day===todayIdx);
      const ck = todayShift ? clockins.find(k=>k.shiftId===todayShift.id) : null;
      const rest = shifts.filter(s=>s.day!==todayIdx);
      c.innerHTML = `
        <div class="section-head"><div><h2>My shifts</h2><p>One-tap clock-in on the day · drop a shift if something comes up</p></div>
          <span class="pill ghost">${U.hrs(total)} this week</span></div>

        ${todayShift ? `
          <div class="staff-today card">
            <div class="staff-today-top"><span class="staff-today-label">Today</span><span class="staff-today-date">${MKR.util.fmtDate(MKR.roster.dayTs(week, todayShift.day))}</span></div>
            <div class="staff-today-time">${todayShift.start} – ${todayShift.end}</div>
            <div class="staff-today-hrs">${U.hrs(MKR.util.shiftHours(todayShift.start, todayShift.end))}</div>
            ${ck
              ? `<div class="staff-today-status ${ck.late?'late':'ok'}"><b>Clocked in</b> · ${ck.late?`${ck.lateMins} min late`:MKR.util.fmtTime(ck.clockTs)}${
                  ck.clockOutTs?` · <b>off</b> ${MKR.util.fmtTime(ck.clockOutTs)} · ${U.hrs(MKR.roster.workedHours(todayShift, ck))}`:''}</div>
                 ${ck.clockOutTs?'':`<button class="btn btn-ghost staff-clock-btn" data-clockoff="${todayShift.id}">Clock off</button>`}`
              : `<button class="btn btn-green staff-clock-btn" data-clock="${todayShift.id}">Clock in</button>`}
          </div>
        ` : `
          <div class="today-clear card">
            <div class="today-clear-ic" style="background:var(--amber-soft);color:var(--amber-ink)">${MKR.ui.icon('sun')}</div>
            <b>No shift today</b>
            <span>Enjoy your day off.</span>
          </div>
        `}

        ${shifts.length
          ? `<div class="today-label" style="margin-top:24px">This week</div>
             <div class="list card" style="padding:8px 18px" id="slist"></div>`
          : `<div class="today-clear card" style="margin-top:16px"><div class="today-clear-ic" style="background:var(--amber-soft);color:var(--amber-ink)">${MKR.ui.icon('sun')}</div><b>No shifts rostered this week</b></div>`}`;

      if(shifts.length){
        const el=U.qs('#slist',c);
        el.innerHTML = rest.length ? rest.map(s=>`<div class="li"><div class="ava">${DAYS[s.day][0]}</div>
            <div class="meta"><b>${DAYS[s.day]} · ${s.start} – ${s.end}</b><span>${MKR.util.fmtDate(MKR.roster.dayTs(week, s.day))} · ${U.hrs(MKR.util.shiftHours(s.start,s.end))}</span></div>
            <button class="btn btn-ghost btn-sm" data-hang="${s.id}">Drop</button></div>`).join('')
          : `<div class="empty" style="padding:18px 0"><p class="faint">Just today this week.</p></div>`;
        U.qsa('[data-hang]',el).forEach(b=>b.onclick=()=>hang(shifts.find(x=>x.id===b.dataset.hang)));
      }
      U.qsa('[data-clock]',c).forEach(b=>b.onclick=()=>clockIn(shifts.find(x=>x.id===b.dataset.clock)));
      U.qsa('[data-clockoff]',c).forEach(b=>b.onclick=()=>clockOff(shifts.find(x=>x.id===b.dataset.clockoff)));
    }
    async function clockIn(shift){
      const {lateMins, late} = await MKR.roster.clockIn(shift, sess);
      U.toast(late?`Clocked in · ${lateMins} min late`:'Clocked in · on time', late?'amber':'green');
      clockins=(await MKR.db.getAll('clockins')).filter(k=>k.staffId===sess.id); draw();
    }
    // Optional, and it stays optional: a shift never clocked off is read as
    // finishing when it was rostered to. It just isn't as good a record.
    async function clockOff(shift){
      const out = await MKR.roster.clockOut(shift, sess);
      U.toast(out?`Clocked off · ${U.hrs(out.hours)}`:'You are not clocked in', out?'green':'amber');
      clockins=(await MKR.db.getAll('clockins')).filter(k=>k.staffId===sess.id); draw();
    }
    function hang(shift){
      const wrap=U.el(`<div class="field"><label>Reason (optional)</label><input class="input" id="rs" placeholder="e.g. something came up"></div>`);
      U.modal('Drop to the swap market',wrap,{actions:[{label:'Confirm drop',class:'btn-dark',onClick:async(cl)=>{
        await MKR.db.put('swaps',{staffId:sess.id, shiftId:shift.id, label:`${DAYS[shift.day]} ${shift.start}-${shift.end}`, reason:U.qs('#rs',wrap).value.trim(), status:'pending', ts:Date.now()});
        cl(); U.toast('Submitted — waiting on manager approval, then it goes to the swap market','green');
      }}]});
    }
    draw();
  }

  // ---------- Today's tasks ----------
  async function tasks(c){
    const sess=MKR.auth.current();
    let list=await MKR.tasks.today();
    function draw(){
      const done=list.filter(t=>t.done).length;
      c.innerHTML=`
        <div class="section-head"><div><h2>Today's task checklist</h2><p>Tick when done and upload a photo · temperature checks need a value</p></div></div>
        <div class="card stat" style="margin-bottom:16px"><div class="k">Progress</div><div class="v">${done}<small> / ${list.length}</small></div><div class="bar"><i style="width:${list.length?done/list.length*100:0}%"></i></div></div>
        <div id="tl"></div>`;
      const el=U.qs('#tl',c);
      el.innerHTML=list.map(t=>`<div class="task-item ${t.done?'done':''}">
        <div class="task-check ${t.done?'done':''}" data-tk="${t.id}">${t.done?MKR.ui.icon('check'):''}</div>
        <div class="grow"><b>${U.esc(t.name)}</b><div class="faint" style="font-size:12px">${t.done?(U.esc(t.value||'')+' done'):(MKR.tasks.needsPhoto(t)?'Upload the photo first — that is what ticks it off':'Tap the box on the left to complete')}</div></div>
        ${t.photo?`<img class="thumb" src="${t.photo}">`:`<label class="btn btn-ghost btn-sm" style="cursor:pointer">${MKR.ui.icon('camera')} Photo<input type="file" accept="image/*" capture="environment" data-photo="${t.id}" hidden></label>`}
      </div>`).join('');
      U.qsa('[data-tk]',el).forEach(b=>b.onclick=()=>toggle(b.dataset.tk));
      U.qsa('[data-photo]',el).forEach(inp=>inp.onchange=(e)=>upload(inp.dataset.photo, e.target.files[0]));
    }
    async function toggle(id){
      const t=list.find(x=>x.id===id); if(!t) return;
      if(t.done){ await MKR.tasks.uncomplete(t); list=await MKR.tasks.today(); draw(); return; }
      if(MKR.tasks.needsValue(t)){
        const wrap=U.el(`<div class="field"><label>Record temperature (°C)</label><input class="input" id="tp" type="number" step="0.1" placeholder="e.g. 3.5"></div>`);
        U.modal('Fridge temperature check',wrap,{actions:[{label:'Record & complete',class:'btn-dark',onClick:async(cl)=>{
          const r=await MKR.tasks.complete(t,{value:U.qs('#tp',wrap).value});
          if(!r.ok) return U.toast(r.msg,'amber');
          list=await MKR.tasks.today(); cl(); draw();
        }}]});
        return;
      }
      const r=await MKR.tasks.complete(t);
      if(!r.ok) return U.toast(r.msg,'amber');
      list=await MKR.tasks.today(); draw();
    }
    function upload(id,file){
      U.readImage(file, async(data)=>{
        const t=list.find(x=>x.id===id); if(!t) return;
        const r=await MKR.tasks.complete(t,{photo:data, value:t.value});
        list=await MKR.tasks.today(); draw();
        U.toast(r.ok?'Photo uploaded':r.msg, r.ok?'green':'amber');
      });
    }
    draw();
    MKR.db.on('tasks', async()=>{ list=await MKR.tasks.today(); draw(); });
  }

  // ---------- Swap market + SOS ----------
  async function market(c){
    const sess=MKR.auth.current();
    const users=await MKR.db.getAll('users');
    const nameOf=id=>{ const u=users.find(x=>x.id===id); return u?u.name:'a colleague'; };
    let swaps=(await MKR.db.getAll('swaps')).filter(s=>s.status==='approved' && s.staffId!==sess.id && !s.claimedBy);
    let sos=(await MKR.db.getAll('sos')).filter(s=>s.status==='open');
    function draw(){
      c.innerHTML=`
        <div class="section-head"><div><h2>Swap market · claim shifts</h2><p>Pick up a colleague's dropped shift · claim an urgent SOS cover in one tap</p></div></div>
        <div class="section-title">🆘 Urgent cover (with reward)</div>
        <div id="sl" class="mt8"></div>
        <div class="section-title mt24">${MKR.ui.icon('repeat')} Shifts colleagues dropped</div>
        <div class="list card" style="padding:6px 18px" id="ml"></div>`;
      const sl=U.qs('#sl',c);
      sl.innerHTML = sos.length? sos.map(s=>`<div class="alert ${s.claimedBy?'green':'amber'}" style="margin-bottom:10px"><span>🆘</span>
        <div class="grow"><b>${U.esc(s.title)}</b><br>Reward ${U.esc(s.reward)} ${s.claimedBy?'· claimed by '+nameOf(s.claimedBy):''}</div>
        ${s.claimedBy?(s.claimedBy===sess.id?'<span class="pill ok">You got it</span>':''):`<button class="btn btn-accent btn-sm" data-sos="${s.id}">Claim</button>`}</div>`).join('')
        : `<div class="empty" style="padding:20px"><div class="em">${MKR.ui.icon('inbox')}</div><p>No urgent cover right now</p></div>`;
      U.qsa('[data-sos]',sl).forEach(b=>b.onclick=async()=>{
        await MKR.db.put('sos',{id:b.dataset.sos, claimedBy:sess.id});
        sos=(await MKR.db.getAll('sos')).filter(s=>s.status==='open'); draw(); U.toast('Claimed! Be there on time','green');
      });
      const ml=U.qs('#ml',c);
      ml.innerHTML = swaps.length? swaps.map(s=>`<div class="li"><div class="ava">${U.initials(nameOf(s.staffId))}</div>
        <div class="meta"><b>${U.esc(nameOf(s.staffId))}'s shift</b><span>${U.esc(s.label||'')} · ${U.esc(s.reason||'')}</span></div>
        <button class="btn btn-dark btn-sm" data-claim="${s.id}">Take it</button></div>`).join('')
        : `<div class="empty"><div class="em">${MKR.ui.icon('repeat')}</div><p>No shifts to claim</p></div>`;
      U.qsa('[data-claim]',ml).forEach(b=>b.onclick=async()=>{
        const s=swaps.find(x=>x.id===b.dataset.claim);
        await MKR.db.put('swaps',{id:s.id, claimedBy:sess.id, status:'filled'});
        await MKR.db.put('shifts',{id:s.shiftId, staffId:sess.id});  // shift moves to me
        swaps=(await MKR.db.getAll('swaps')).filter(x=>x.status==='approved' && x.staffId!==sess.id && !x.claimedBy);
        draw(); U.toast('Taken — the shift is now on your roster','green');
      });
    }
    draw();
    MKR.db.on('sos',async()=>{ sos=(await MKR.db.getAll('sos')).filter(s=>s.status==='open'); draw(); });
    MKR.db.on('swaps',async()=>{ swaps=(await MKR.db.getAll('swaps')).filter(s=>s.status==='approved' && s.staffId!==sess.id && !s.claimedBy); draw(); });
  }

  // ---------- My profile + onboarding checklist ----------
  async function me(c){
    const sess=MKR.auth.current();
    const user=await MKR.db.get('users',sess.id) || {id:sess.id, name:sess.name};
    let ob=(await MKR.db.getAll('onboarding')).find(o=>o.userId===sess.id) || {id:'onb_'+sess.id, userId:sess.id};

    // Save a partial onboarding update and refresh the screen
    async function patchOb(patch){ ob = await MKR.db.put('onboarding', {...ob, ...patch}); }

    // Staff can see their OWN sensitive info in full (no masking for one's own data).
    let passPlain='', tfnPlain='';
    try{ if(ob.passportEnc) passPlain = await MKR.crypto.dec(ob.passportEnc, sess.id); }catch(e){}
    try{ if(ob.tfnEnc)      tfnPlain  = await MKR.crypto.dec(ob.tfnEnc, sess.id); }catch(e){}

    // Even to its owner, a TFN is shown as the last three on a summary line that
    // sits open on a bench phone. The full number is one tap away in the modal.
    const maskTfn = (v)=> v ? '••• ••• '+String(v).replace(/\D/g,'').slice(-3) : '';

    // The ATO's own check digit: weight each digit, and the total must divide by
    // 11. It catches a transposed pair, which is the mistake people actually
    // make — it says nothing about whether the number belongs to this person,
    // and the app makes no claim that it does.
    const TFN_W = [1,4,3,7,5,8,6,9,10];
    function tfnLooksValid(v){
      const d = String(v||'').replace(/\D/g,'');
      if(d.length!==8 && d.length!==9) return false;
      // 000000000 divides by 11 and so passes the check digit — as does any
      // all-same-digit run that happens to. They are placeholder typing, never
      // a real TFN, and the checksum alone will wave them through.
      if(/^(\d)\1+$/.test(d)) return false;
      let sum=0; for(let i=0;i<d.length;i++) sum += Number(d[i]) * TFN_W[i];
      return sum % 11 === 0;
    }

    // Employment records. Pay, super and bank details are still not collected —
    // those stay with the venue's payroll. A TFN and work-rights status are held
    // because payroll needs them to exist somewhere the owner can retrieve them,
    // and the app makes no judgement about either: it never checks a visa
    // against its conditions and never counts hours against one.
    function docStatus(){
      return {
        passport:  !!ob.passportDoc || !!ob.passportEnc,
        emergency: !!user.emergency,
        tfn:       !!ob.tfnEnc || ob.tfnDeclined===true,
        // Satisfied by saying you're a citizen or PR just as much as by entering
        // a visa — most staff have no visa to enter and must not be stuck here.
        workrights: !!ob.workRights,
      };
    }

    const WORK_RIGHTS = {
      citizen: 'Australian citizen',
      pr:      'Permanent resident',
      visa:    'Visa holder',
    };
    function workRightsLine(){
      const w = ob.workRights; if(!w) return '';
      if(w!=='visa') return WORK_RIGHTS[w] || w;
      const bits = [ob.visaSubclass ? 'Subclass '+ob.visaSubclass : 'Visa holder'];
      if(ob.visaExpiry) bits.push('expires '+U.fmtDate(new Date(ob.visaExpiry).getTime()));
      return bits.join(' · ');
    }

    function draw(){
      const st = docStatus();
      const required = ['passport','emergency','tfn','workrights'];
      const doneCount = required.filter(k=>st[k]).length;
      const allDone = doneCount===required.length;

      const item = (key, icon, title, desc, done, btnLabel)=>`
        <div class="onb-item ${done?'done':''}">
          <div class="onb-ic">${done?MKR.ui.icon('check'):MKR.ui.icon(icon)}</div>
          <div class="grow"><b>${title}</b><div class="faint" style="font-size:12.5px">${desc}</div></div>
          <button class="btn ${done?'btn-ghost':'btn-dark'} btn-sm" data-doc="${key}">${done?'Update':btnLabel}</button>
        </div>`;

      c.innerHTML=`
        <div class="section-head"><div><h2>My profile</h2><p>Edit your details and complete the documents your manager requires</p></div>
          <span class="pill ${user.onboarded?'ok':'warn'}">${user.onboarded?'Onboarding complete':'Onboarding in progress'}</span></div>

        ${!user.onboarded?`<div class="alert amber" style="margin-bottom:16px"><span>${MKR.ui.icon('users')}</span><div><b>Welcome aboard, ${U.esc(user.name||'')}!</b> Two quick things before your first shift: your <b>ID</b> and an <b>emergency contact</b>. ${doneCount}/${required.length} done.</div></div>`:''}

        <div class="grid g2" style="align-items:start">
          <div class="card" style="padding:20px">
            <div class="section-title">Onboarding checklist <span class="faint" style="font-size:12px">${doneCount}/${required.length} required</span></div>
            <div class="bar" style="margin:0 0 14px"><i style="width:${doneCount/required.length*100}%;background:var(--green)"></i></div>
            ${item('passport','idcard','Passport / ID', st.passport?('ID'+(passPlain?' '+U.esc(passPlain):'')+(ob.passportDoc?' · document on file':'')):'Upload a photo of your passport or ID', st.passport, 'Upload')}
            ${item('tfn','receipt','Tax file number', st.tfn?(ob.tfnDeclined?'You chose not to provide one':U.esc(maskTfn(tfnPlain))+' · encrypted'):'Your TFN, for the venue\'s payroll', st.tfn, 'Add')}
            ${item('workrights','shield','Work rights', st.workrights?U.esc(workRightsLine()):'Citizen, permanent resident, or the visa you work on', st.workrights, 'Add')}
            ${item('emergency','bell','Emergency contact', st.emergency?U.esc(user.emergency):'Who should we call if something happens on shift', st.emergency, 'Add')}
            ${!user.onboarded?`<button class="btn btn-green btn-block mt16" id="finishBtn" ${allDone?'':'disabled'}>${allDone?`${MKR.ui.icon('checkcircle')} Submit onboarding`:`Complete all ${required.length} items first`}</button>`:`<div class="alert green mt16"><span>${MKR.ui.icon('checkcircle')}</span><div>All set. Tap any item above to view or update it.</div></div>`}
            <div class="disclaimer mt12"><span>${MKR.ui.icon('lock')}</span>Your ID and tax file number are encrypted at rest (${MKR.crypto.available?'AES-GCM':'local cipher'}) and only you and the owner can open them — never your manager, and never another staff member. Every time the owner opens one it is written to the audit log. <b>The app still never asks for your super fund or bank details</b>, and it never checks your visa or counts your hours against it.</div>
          </div>

          <div class="card" style="padding:20px">
            <div class="section-title">Personal details</div>
            <div class="field"><label>Full name</label><input class="input" id="p_name" value="${U.esc(user.name||'')}"></div>
            <div class="row"><div class="field grow"><label>Phone</label><input class="input" id="p_phone" type="tel" value="${U.esc(user.phone||'')}" placeholder="04XX XXX XXX"></div>
              <div class="field grow"><label>Email</label><input class="input" id="p_email" type="email" value="${U.esc(user.email||'')}" placeholder="name@example.com"></div></div>
            <div class="field"><label>Address</label><input class="input" id="p_address" value="${U.esc(user.address||'')}"></div>
            <div class="field"><label>Emergency contact</label><input class="input" id="p_emergency" value="${U.esc(user.emergency||'')}" placeholder="name + phone"></div>
            <button class="btn btn-dark btn-block" id="saveProfile">Save profile</button>
            <div class="li mt12" style="border:none;padding:8px 0"><div class="meta"><span>Your staff ID</span><b style="font-size:15px">${U.esc(user.id)}</b></div></div>
            <a class="btn btn-ghost btn-block" href="#/staff/availability">${MKR.ui.icon('calendar')} Set my availability</a>
          </div>
        </div>`;

      // Personal details save
      U.qs('#saveProfile',c).onclick=async()=>{
        await MKR.db.put('users',{id:sess.id, name:U.qs('#p_name',c).value.trim()||user.name,
          phone:U.qs('#p_phone',c).value.trim(), email:U.qs('#p_email',c).value.trim(),
          address:U.qs('#p_address',c).value.trim(), emergency:U.qs('#p_emergency',c).value.trim()});
        U.toast('Profile saved','green');
      };

      // Checklist item modals
      U.qsa('[data-doc]',c).forEach(b=>b.onclick=()=>docModal(b.dataset.doc));

      const fb=U.qs('#finishBtn',c);
      if(fb && allDone) fb.onclick=()=>finish();
    }

    // Reusable document-upload helper: file -> shrunk dataURL
    function fileToData(input, cb){ U.readImage(input.files[0], cb); }

    function docModal(key){
      if(key==='passport'){
        let img = ob.passportDoc||null;
        const wrap=U.el(`<div>
          <div class="field"><label>Passport / ID number</label><input class="input" id="pp_no" value="${U.esc(passPlain)}" placeholder="e.g. PA1234567"></div>
          <div class="field"><label>Upload document photo</label>
            <label class="img-drop"><div class="img-preview" id="pp_prev">${img?`<img src="${img}">`:`<span>${MKR.ui.icon('camera')} Tap to upload passport / ID</span>`}</div><input type="file" id="pp_file" accept="image/*" hidden></label></div>
        </div>`);
        U.qs('#pp_file',wrap).onchange=(e)=>fileToData(e.target,(d)=>{ img=d; U.qs('#pp_prev',wrap).innerHTML=`<img src="${d}">`; });
        U.modal('Passport / ID',wrap,{actions:[{label:'Save',class:'btn-dark',onClick:async(cl)=>{
          const no=U.qs('#pp_no',wrap).value.trim();
          const patch={ passportDoc: img };
          if(no){ patch.passportEnc = await MKR.crypto.enc(no, sess.id); passPlain=no; }
          await patchOb(patch); cl(); U.toast('Passport saved','green'); draw();
        }}]});
      }
      else if(key==='tfn'){
        // Quoting a TFN is not compulsory in Australia — declining is a lawful
        // choice with a tax consequence, not a refusal to onboard. A form that
        // only accepts a number would push people into typing a wrong one, so
        // "I'd rather not" is a first-class answer that still ticks the item.
        const wrap=U.el(`<div>
          <div class="field"><label>Tax file number</label>
            <input class="input" id="tfn_no" inputmode="numeric" autocomplete="off" value="${U.esc(tfnPlain)}" placeholder="9 digits">
            <div class="faint" id="tfn_msg" style="font-size:12px;margin-top:6px"></div></div>
          <label class="row gap6" style="align-items:center;margin:10px 0">
            <input type="checkbox" id="tfn_no_thanks" ${ob.tfnDeclined?'checked':''}>
            <span style="font-size:13px">I'd rather not provide it</span></label>
          <div class="disclaimer"><span>${MKR.ui.icon('lock')}</span>Encrypted before it is stored, readable only by you and the owner, and never included in any export or report. You are not required by law to quote it — if you don't, tax is withheld at the top rate.</div>
        </div>`);
        const msg=U.qs('#tfn_msg',wrap), inp=U.qs('#tfn_no',wrap), skip=U.qs('#tfn_no_thanks',wrap);
        const check=()=>{
          const d=inp.value.replace(/\D/g,'');
          inp.disabled = skip.checked;
          if(skip.checked){ msg.textContent=''; return; }
          msg.textContent = !d ? '' : (tfnLooksValid(d) ? 'Checks out' : 'That doesn\'t look right — check the digits');
          msg.style.color = !d ? '' : (tfnLooksValid(d) ? 'var(--green)' : 'var(--red)');
        };
        inp.oninput=check; skip.onchange=check; check();
        U.modal('Tax file number',wrap,{actions:[{label:'Save',class:'btn-dark',onClick:async(cl)=>{
          if(skip.checked){
            await patchOb({tfnDeclined:true, tfnEnc:null}); tfnPlain='';
            cl(); U.toast('Noted','green'); draw(); return;
          }
          const d=inp.value.replace(/\D/g,'');
          if(!d){ U.toast('Enter your TFN, or tick the box','red'); return; }
          if(!tfnLooksValid(d)){ U.toast('That TFN doesn\'t check out — please re-read it','red'); return; }
          await patchOb({tfnEnc: await MKR.crypto.enc(d, sess.id), tfnDeclined:false});
          tfnPlain=d; cl(); U.toast('Tax file number saved','green'); draw();
        }}]});
      }
      else if(key==='workrights'){
        let img = ob.visaDoc||null;
        const wrap=U.el(`<div>
          <div class="field"><label>Your work rights</label>
            <select class="input" id="wr_kind">
              <option value="">— choose —</option>
              ${Object.entries(WORK_RIGHTS).map(([k,v])=>`<option value="${k}" ${ob.workRights===k?'selected':''}>${v}</option>`).join('')}
            </select></div>
          <div id="wr_visa" style="display:none">
            <div class="row"><div class="field grow"><label>Visa subclass</label>
                <input class="input" id="wr_sub" value="${U.esc(ob.visaSubclass||'')}" placeholder="e.g. 500, 482, 417"></div>
              <div class="field grow"><label>Expires</label>
                <input class="input" id="wr_exp" type="date" value="${U.esc(ob.visaExpiry||'')}"></div></div>
            <div class="field"><label>Visa grant notice (optional)</label>
              <label class="img-drop"><div class="img-preview" id="wr_prev">${img?`<img src="${img}">`:`<span>${MKR.ui.icon('camera')} Tap to upload</span>`}</div><input type="file" id="wr_file" accept="image/*" hidden></label></div>
          </div>
          <div class="disclaimer"><span>ℹ️</span>Recorded, not judged. The app never checks a visa against its conditions and never counts your hours against one — if the venue needs that checked, they use VEVO themselves.</div>
        </div>`);
        const kind=U.qs('#wr_kind',wrap);
        const syncKind=()=>{ U.qs('#wr_visa',wrap).style.display = kind.value==='visa' ? '' : 'none'; };
        kind.onchange=syncKind; syncKind();
        U.qs('#wr_file',wrap).onchange=(e)=>fileToData(e.target,(d)=>{ img=d; U.qs('#wr_prev',wrap).innerHTML=`<img src="${d}">`; });
        U.modal('Work rights',wrap,{actions:[{label:'Save',class:'btn-dark',onClick:async(cl)=>{
          const k=kind.value;
          if(!k){ U.toast('Choose one','red'); return; }
          const patch={workRights:k};
          if(k==='visa'){
            patch.visaSubclass = U.qs('#wr_sub',wrap).value.trim();
            patch.visaExpiry   = U.qs('#wr_exp',wrap).value || '';
            patch.visaDoc      = img;
            if(!patch.visaSubclass){ U.toast('Which visa subclass?','red'); return; }
          } else {
            // Switching off "visa holder" clears what was only ever there to
            // describe a visa — leaving a stale subclass on a citizen's record
            // is worse than having none.
            patch.visaSubclass=''; patch.visaExpiry=''; patch.visaDoc=null;
          }
          await patchOb(patch); cl(); U.toast('Work rights saved','green'); draw();
        }}]});
      }
      else if(key==='emergency'){
        const wrap=U.el(`<div>
          <div class="field"><label>Emergency contact</label><input class="input" id="em_c" value="${U.esc(user.emergency||'')}" placeholder="name + phone"></div>
          <div class="faint" style="font-size:12px">Only your manager and the owner can see this.</div>
        </div>`);
        U.modal('Emergency contact',wrap,{actions:[{label:'Save',class:'btn-dark',onClick:async(cl)=>{
          const v=U.qs('#em_c',wrap).value.trim();
          if(!v){ U.toast('Enter a name and phone number','red'); return; }
          await MKR.db.put('users',{id:sess.id, emergency:v}); user.emergency=v;
          cl(); U.toast('Saved','green'); draw();
        }}]});
      }
    }

    function finish(){
      const wrap=U.el(`<div>
        <p class="muted" style="font-size:14px">Confirm your details are correct and submit them as your employment record (e-signature).</p>
        <label class="row center gap8" style="margin:12px 0;cursor:pointer"><input type="checkbox" id="sign" style="width:20px;height:20px"> <span style="font-size:14px">I confirm the above is true and accurate</span></label>
      </div>`);
      U.modal('Submit onboarding', wrap, {actions:[{label:'Confirm & submit',class:'btn-green',onClick:async(cl)=>{
        if(!U.qs('#sign',wrap).checked){ U.toast('Please tick the confirmation','red'); return; }
        await patchOb({ signedAt:Date.now() });
        await MKR.db.put('users',{id:sess.id, onboarded:true});
        await MKR.audit.log({action:'staff.hire', desc:`${user.name} completed onboarding`});
        cl(); U.toast('Onboarding submitted','green');
        const u2=await MKR.db.get('users',sess.id); user.onboarded=u2.onboarded; draw();
      }}]});
    }

    draw();
  }
})();
