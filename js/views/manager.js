/* ===== Manager Portal ===== */
window.MKR = window.MKR || {}; MKR.portals = MKR.portals || {};
(function(){
  const U = MKR.util;
  const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  async function staffList(){ return (await MKR.db.getAll('users')).filter(u=>u.role==='staff' && !u.offboarded); }
  function hrs(s,e){ return MKR.util.shiftHours(s,e); }


  MKR.portals.manager = {
    home:'dashboard',
    nav:[
      {id:'dashboard', label:'Dashboard', short:'Home'},
      {id:'schedule', label:'Rostering', short:'Roster', feature:'schedule'},
      {id:'myshifts', label:'My shifts', short:'Mine'},
      {id:'availability', label:'My availability', short:'Available', feature:'availability'},
      {id:'tasks',    label:'Tasks', short:'Tasks',  feature:'tasks'},
      {id:'stock',    label:'Stock & costs', short:'Stock', feature:'stock'},
      {id:'deliveries',label:'Deliveries', short:'Delivery',feature:'deliveries'},
      {id:'training', label:'Training', short:'Training',feature:'training'},
      {id:'swaps',    label:'Swaps / SOS', short:'Swaps',  feature:'swaps'},
      {id:'hire',     label:'Add Users', short:'Add',    feature:'hire'},
      {id:'bookings', label:'Bookings', short:'Bookings',feature:'bookings'},
    ],
    async badges(){
      const b={};
      const sw = (await MKR.db.getAll('swaps')).filter(s=>s.status==='pending').length;
      if(sw) b.swaps=sw;
      try{ const d=(await MKR.deliveries.pending()).length; if(d) b.deliveries=d; }catch(e){}
      return b;
    },
    async view(section, c){
      if(section==='dashboard') return MKR.tiles.render(c, {role:'manager'});
      if(section==='schedule') return MKR.rosterView.render(c);
      if(section==='myshifts') return myShifts(c);
      if(section==='availability') return availabilityPage(c);
      if(section==='hire') return hire(c);
      if(section==='tasks') return tasks(c);
      if(section==='swaps') return swaps(c);
      if(section==='bookings') return bookings(c);
      if(section==='stock') return MKR.stock.render(c);
      if(section==='deliveries') return MKR.deliveries.render(c);
      if(section==='training') return MKR.training.renderManage(c);
    },
    // The owner portal renders these two as its own pages. Exported rather than
    // copied: the task checklist and the add-user flow each write to tables with
    // their own rules, and a second implementation drifting out of step with
    // this one is how two portals end up disagreeing about what a staff record
    // needs. One page, two places it can be shown.
    renderTasks: (c)=> tasks(c),
    nextTicket,
    renderHire:  (c)=> hire(c),
  };

  // ---------- My availability (manager fills their own, like staff) ----------
  async function availabilityPage(c){
    const sess=MKR.auth.current();
    const me=await MKR.db.get('users',sess.id)||{};
    const av=Object.assign({}, me.availability||{});   // {0..6: 'off'|'am'|'pm'|'all'|'HH:MM-HH:MM'}
    c.innerHTML=`
      <div class="section-head"><div><h2>My availability</h2><p>Pick the times you can work each day — the auto-roster uses this to schedule you too</p></div>
        <button class="btn btn-dark btn-sm" id="saveAv">Save</button></div>
      <div class="card" style="padding:6px 18px"><div id="avlist"></div></div>
      <div class="disclaimer mt16"><span>${MKR.ui.icon('calendar')}</span>Tap a quick slot, or set your own start/end time per day. The owner/auto-roster uses this to schedule you — managers can be rostered just like staff.</div>`;
    buildAvailability(c, av, ()=> MKR.db.put('users',{id:sess.id, availability:av}));
  }

  // Shared availability editor: quick presets + custom time per day, updated
  // ROW-BY-ROW (no full re-render) so the page never jumps while you edit.
  function buildAvailability(c, av, persist){
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
    list.innerHTML='';
    for(let i=0;i<DAYS.length;i++) list.appendChild(rowEl(i));
    const sv=U.qs('#saveAv',c); if(sv) sv.onclick=async()=>{ await persist(); U.toast('Availability saved','green'); };
  }

  // One ticket counter for the front door, read at the moment the ticket is
  // issued rather than from whatever the page loaded with. The assistant can add
  // a walk-in from another device while this screen sits open, and both would
  // hand out #7. Shared with that assistant command for the same reason.
  async function nextTicket(){
    const today = U.todayISO();
    return (await MKR.db.getAll('waitlist'))
      .filter(q=>U.isoDate(q.createdAt)===today)
      .reduce((mx,q)=>Math.max(mx, q.num||0), 0) + 1;
  }

  // ---------- Reservations + walk-in queue ----------
  async function bookings(c){
    const today = U.todayISO();
    let resv  = await MKR.db.getAll('reservations');
    let queue = await MKR.db.getAll('waitlist');

    async function reload(){ resv = await MKR.db.getAll('reservations'); queue = await MKR.db.getAll('waitlist'); draw(); }

    function draw(){
      const upcoming = resv.filter(r=>r.status==='booked' && r.date>=today).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
      const seatedToday = resv.filter(r=>r.status==='seated' && r.date===today);
      const waiting = queue.filter(q=>q.status==='waiting' || q.status==='called').sort((a,b)=>a.createdAt-b.createdAt);
      c.innerHTML = `
        <div class="section-head"><div><h2>Bookings &amp; queue</h2><p>Table reservations and the live walk-in waitlist</p></div></div>
        <div class="grid g3" style="margin-bottom:16px">
          <div class="card stat"><div class="k">${MKR.ui.icon('calendar')} Upcoming bookings</div><div class="v">${upcoming.length}</div></div>
          <div class="card stat"><div class="k">⏳ Waiting now</div><div class="v">${waiting.filter(q=>q.status==='waiting').length}</div></div>
          <div class="card stat"><div class="k">${MKR.ui.icon('bell')} Called</div><div class="v">${waiting.filter(q=>q.status==='called').length}</div></div>
        </div>
        <div class="grid g2">
          <div class="card pad20">
            <div class="section-head" style="margin-bottom:10px"><div class="section-title" style="margin:0">${MKR.ui.icon('calendar')} Reservations</div>
              <button class="btn btn-dark btn-sm" id="addResv">＋ New booking</button></div>
            <div id="resvList"></div>
          </div>
          <div class="card pad20">
            <div class="section-head" style="margin-bottom:10px"><div class="section-title" style="margin:0">⏳ Walk-in queue</div>
              <button class="btn btn-dark btn-sm" id="addQ" data-new>＋ Add to queue</button></div>
            <div id="qList"></div>
          </div>
        </div>`;

      const rl = U.qs('#resvList',c);
      rl.innerHTML = upcoming.length ? upcoming.map(r=>`
        <div class="li"><div class="ava">${r.partySize||'?'}</div>
          <div class="meta"><b>${U.esc(r.name)}</b>
            <span>${r.date===today?'Today':r.date} ${r.time} · ${r.partySize} ppl${r.phone?' · '+U.esc(r.phone):''}${r.note?' · '+U.esc(r.note):''}</span></div>
          <div class="row gap6 wrap"><button class="btn btn-green btn-sm" data-seat="${r.id}">Seat</button>
            <button class="btn btn-ghost btn-sm" data-noshow="${r.id}">No-show</button>
            <button class="btn btn-ghost btn-sm" data-cancelr="${r.id}">${MKR.ui.icon('minus')}</button></div>
        </div>`).join('') : `<div class="empty"><div class="em">${MKR.ui.icon('calendar')}</div><p>No upcoming bookings</p></div>`;

      const ql = U.qs('#qList',c);
      ql.innerHTML = waiting.length ? waiting.map(q=>`
        <div class="li"><div class="ava">${q.num}</div>
          <div class="meta"><b>${U.esc(q.name||('#'+q.num))} ${q.status==='called'?'<span class="pill warn">Called</span>':''}</b>
            <span>${q.partySize} ppl${q.phone?' · '+U.esc(q.phone):''} · waiting ${U.ago(q.createdAt)}</span></div>
          <div class="row gap6 wrap">${q.status==='waiting'?`<button class="btn btn-accent btn-sm" data-call="${q.id}">${MKR.ui.icon('bell')} Call</button>`:''}
            <button class="btn btn-green btn-sm" data-qseat="${q.id}">Seat</button>
            <button class="btn btn-ghost btn-sm" data-qleft="${q.id}">Left</button></div>
        </div>`).join('') : `<div class="empty"><div class="em">${MKR.ui.icon('clock')}</div><p>Queue is empty</p></div>`;

      U.qs('#addResv',c).onclick = resvModal;
      U.qs('#addQ',c).onclick = queueModal;
      U.qsa('[data-seat]',rl).forEach(b=>b.onclick=()=>setResv(b.dataset.seat,'seated','Seated booking'));
      U.qsa('[data-noshow]',rl).forEach(b=>b.onclick=()=>setResv(b.dataset.noshow,'noshow','Marked no-show'));
      U.qsa('[data-cancelr]',rl).forEach(b=>b.onclick=()=>setResv(b.dataset.cancelr,'cancelled','Cancelled booking'));
      U.qsa('[data-call]',ql).forEach(b=>b.onclick=async()=>{ await MKR.db.put('waitlist',{id:b.dataset.call,status:'called',calledAt:Date.now()}); U.toast('Called','green'); reload(); });
      U.qsa('[data-qseat]',ql).forEach(b=>b.onclick=async()=>{ await MKR.db.put('waitlist',{id:b.dataset.qseat,status:'seated'}); U.toast('Seated','green'); reload(); });
      U.qsa('[data-qleft]',ql).forEach(b=>b.onclick=async()=>{ await MKR.db.put('waitlist',{id:b.dataset.qleft,status:'left'}); U.toast('Removed from queue','amber'); reload(); });
    }

    async function setResv(id, status, desc){
      await MKR.db.put('reservations',{id, status});
      await MKR.audit.log({action:'booking.update', desc:`${desc} #${id.slice(-4)}`});
      U.toast(desc,'green'); reload();
    }

    function resvModal(){
      const wrap = U.el(`<div>
        <div class="field"><label>Guest name</label><input class="input" id="rv_n" placeholder="Name"></div>
        <div class="row"><div class="field grow"><label>Phone</label><input class="input" id="rv_p" placeholder="Optional"></div>
          <div class="field grow"><label>Party size</label><input class="input" id="rv_sz" type="number" min="1" value="2"></div></div>
        <div class="row"><div class="field grow"><label>Date</label><input class="input" id="rv_d" type="date" value="${today}"></div>
          <div class="field grow"><label>Time</label><input class="input" id="rv_t" type="time" value="18:00"></div></div>
        <div class="field"><label>Note (optional)</label><input class="input" id="rv_note" placeholder="e.g. window seat, birthday"></div>
      </div>`);
      U.modal('New booking', wrap, {actions:[{label:'Add booking', class:'btn-dark', onClick:async(cl)=>{
        const name=U.qs('#rv_n',wrap).value.trim(); if(!name){ U.toast('Enter a name','red'); return; }
        await MKR.db.put('reservations',{ name, phone:U.qs('#rv_p',wrap).value.trim(), partySize:+U.qs('#rv_sz',wrap).value||1,
          date:U.qs('#rv_d',wrap).value||today, time:U.qs('#rv_t',wrap).value||'', note:U.qs('#rv_note',wrap).value.trim(),
          status:'booked', kitchenId:(MKR.auth.current()&&MKR.auth.current().kitchenId)||'k_main' });
        await MKR.audit.log({action:'booking.create', desc:`New booking · ${name}`});
        cl(); U.toast('Booking added','green'); reload();
      }}]});
    }

    function queueModal(){
      const wrap = U.el(`<div>
        <div class="field"><label>Name (optional)</label><input class="input" id="q_n" placeholder="Walk-in name"></div>
        <div class="row"><div class="field grow"><label>Phone</label><input class="input" id="q_p" placeholder="Optional · for SMS"></div>
          <div class="field grow"><label>Party size</label><input class="input" id="q_sz" type="number" min="1" value="2"></div></div>
      </div>`);
      U.modal('Add to queue', wrap, {actions:[{label:'Add to queue', class:'btn-dark', onClick:async(cl)=>{
        const num=await nextTicket();
        await MKR.db.put('waitlist',{ num, name:U.qs('#q_n',wrap).value.trim(), phone:U.qs('#q_p',wrap).value.trim(),
          partySize:+U.qs('#q_sz',wrap).value||1, status:'waiting', kitchenId:(MKR.auth.current()&&MKR.auth.current().kitchenId)||'k_main' });
        cl(); U.toast(`Added · ticket #${num}`,'green'); reload();
      }}]});
    }

    draw();
  }

  // ---------- Manager's own shifts (view + self-roster + clock-in) ----------
  async function myShifts(c){
    const sess=MKR.auth.current();
    const todayIdx=(new Date().getDay()+6)%7;
    const settings=await MKR.db.meta('settings')||{};
    const slots=settings.shiftSlots||[{label:'Morning',start:'09:00',end:'15:00'},{label:'Evening',start:'15:00',end:'22:00'}];
    let shifts=[], clockins=[];
    async function reload(){
      const wk=MKR.roster.thisWeek();
      shifts=(await MKR.roster.shiftsFor(wk)).filter(s=>s.staffId===sess.id).sort((a,b)=>a.day-b.day||a.start.localeCompare(b.start));
      clockins=(await MKR.db.getAll('clockins')).filter(k=>k.staffId===sess.id);
    }
    function draw(){
      const total=U.round2(shifts.reduce((t,s)=>t+hrs(s.start,s.end),0));
      c.innerHTML=`
        <div class="section-head"><div><h2>My shifts</h2><p>Your own roster · clock in on the day · add a shift for yourself</p></div>
          <div class="row gap8 center"><span class="pill ghost">${U.hrs(total)} this week</span><button class="btn btn-accent btn-sm" id="addMine">＋ Add my shift</button></div></div>
        ${shifts.length?`<div class="alert info" style="margin-bottom:16px"><span>⏰</span><div>Next shift <b>${DAYS[shifts[0].day]} ${shifts[0].start}</b> — you'll get a reminder 1 hour before.</div></div>`:''}
        <div class="list card" style="padding:8px 18px" id="slist"></div>
        <div class="disclaimer mt16"><span>${MKR.ui.icon('calendar')}</span>The owner can also place your shifts. Anything here syncs with the team roster.</div>`;
      const el=U.qs('#slist',c);
      if(!shifts.length){ el.innerHTML=`<div class="empty"><div class="em">${MKR.ui.icon('checkcircle')}</div><p>No shifts rostered for you this week — tap “Add my shift”.</p></div>`; }
      else el.innerHTML=shifts.map(s=>{
        const ck=clockins.find(k=>k.shiftId===s.id); const isToday=s.day===todayIdx;
        let right;
        if(isToday) right = ck?(ck.late?`<span class="pill danger">Late ${ck.lateMins}′</span>`:`<span class="pill ok">Clocked in ${U.fmtTime(ck.clockTs)}</span>`):`<button class="btn btn-green btn-sm" data-clock="${s.id}">Clock in</button>`;
        else right=`<button class="btn btn-ghost btn-sm" data-rm="${s.id}">Remove</button>`;
        return `<div class="li"><div class="ava">${DAYS[s.day][0]}</div>
          <div class="meta"><b>${DAYS[s.day]} · ${s.start} – ${s.end}${isToday?' · <span style="color:var(--accent)">Today</span>':''}</b><span>${U.fmtDate(MKR.roster.dayTs(MKR.roster.thisWeek(), s.day))} · ${U.hrs(hrs(s.start,s.end))}</span></div>${right}</div>`;
      }).join('');
      U.qsa('[data-clock]',el).forEach(b=>b.onclick=()=>clockIn(shifts.find(x=>x.id===b.dataset.clock)));
      U.qsa('[data-rm]',el).forEach(b=>b.onclick=async()=>{ await MKR.db.remove('shifts',b.dataset.rm); await MKR.audit.log({action:'shift.remove',desc:'Manager removed own shift'}); await reload(); draw(); U.toast('Shift removed','amber'); });
      U.qs('#addMine',c).onclick=addMine;
    }
    async function clockIn(shift){
      const {lateMins, late} = await MKR.roster.clockIn(shift, sess);
      U.toast(late?`Clocked in · ${lateMins} min late`:'Clocked in · on time', late?'amber':'green');
      await reload(); draw();
    }
    function addMine(){
      const dayOpts=DAYS.map((d,i)=>`<option value="${i}" ${i===todayIdx?'selected':''}>${d}</option>`).join('');
      const slotPick=slots.map((s,i)=>`<option value="${i}">${U.esc(s.label)} ${s.start}-${s.end}</option>`).join('');
      const wrap=U.el(`<div>
        <div class="field"><label>Day</label><select class="input" id="md">${dayOpts}</select></div>
        <div class="field"><label>Quick slot</label><select class="input" id="ms"><option value="">Custom</option>${slotPick}</select></div>
        <div class="row"><div class="field grow"><label>Start</label><input class="input" id="mst" type="time" value="${slots[0]?slots[0].start:'09:00'}"></div>
        <div class="field grow"><label>End</label><input class="input" id="met" type="time" value="${slots[0]?slots[0].end:'15:00'}"></div></div>
      </div>`);
      U.qs('#ms',wrap).onchange=(e)=>{ const i=e.target.value; if(i!==''){ U.qs('#mst',wrap).value=slots[i].start; U.qs('#met',wrap).value=slots[i].end; } };
      U.modal('Add my shift', wrap, {actions:[{label:'Save shift', class:'btn-dark', onClick:async(close)=>{
        const day=+U.qs('#md',wrap).value, start=U.qs('#mst',wrap).value, end=U.qs('#met',wrap).value;
        if(hrs(start,end)<=0){ U.toast('End time must be after start','red'); return; }
        await MKR.db.put('shifts',{staffId:sess.id, week:MKR.roster.thisWeek(), day, start, end});
        await MKR.audit.log({action:'shift.create', desc:`${sess.name} self-rostered ${DAYS[day]} ${start}-${end}`});
        await reload(); close(); draw(); U.toast('Shift added to your roster','green');
      }}]});
    }
    await reload(); draw();
  }

  // ---------- One-Click Add Users ----------
  async function hire(c){
    const settings = await MKR.db.meta('settings') || {};
    const roles = settings.customRoles && settings.customRoles.length ? settings.customRoles : ['Kitchen','Front of House','Cashier','Dishwasher','Head Chef'];
    const pending = (await MKR.db.getAll('users')).filter(u=>u.role==='staff' && !u.onboarded);
    const myKid = (MKR.auth.current()&&MKR.auth.current().kitchenId)||'k_main';
    c.innerHTML = `
      <div class="section-head"><div><h2>One-Click Add Users</h2><p>Approve phone join requests, or add a new starter directly by phone</p></div></div>
      <div class="card" id="jreqCard" style="padding:8px 18px;margin-bottom:16px;display:none">
        <div class="section-title" style="padding-top:12px">${MKR.ui.icon('userplus')} Join requests · approval needed</div>
        <div class="list" id="jreqList"></div>
      </div>
      <div class="grid g2" style="align-items:start">
        <div class="card" style="padding:22px">
          <div class="field"><label>New starter's phone</label><input class="input" id="hphone" placeholder="04XX XXX XXX" inputmode="tel"></div>
          <div class="field"><label>Name (optional)</label><input class="input" id="hname" placeholder="leave blank to use phone"></div>
          <div class="row">
            <div class="field grow"><label>Employment type</label><select class="input" id="htype"><option value="casual">Casual</option><option value="parttime">Part-time</option><option value="fulltime">Full-time</option></select></div>
            <div class="field grow"><label>Role</label><select class="input" id="hpos">${roles.map(r=>`<option>${U.esc(r)}</option>`).join('')}</select></div>
          </div>
          <div class="field"><label>Skills — what they can be rostered onto</label>
            <div class="row gap6 wrap">${Object.entries(MKR.roster.SKILLS).map(([k,v])=>`
              <label class="skill-chip"><input type="checkbox" data-hsk="${k}">${MKR.ui.icon(v.ic)} ${v.label}</label>`).join('')}</div></div>
          <button class="btn btn-accent btn-block" id="hbtn">${MKR.ui.icon('mail')} Create account &amp; send link</button>
          <div class="disclaimer mt12"><span>${MKR.ui.icon('checksq')}</span>They'll be asked for an ID, their tax file number, their work-rights status and an emergency contact. They enter all of it themselves. This app doesn't collect TFN, super or bank details.${MKR.features.can('au_workrights','manager')?' Check work rights separately on VEVO.':''}</div>
        </div>
        <div class="card" style="padding:22px">
          <div class="section-title">Pending / onboarding</div>
          <div class="list" id="plist"></div>
        </div>
      </div>`;
    function drawPending(list){
      const el = U.qs('#plist',c);
      if(!list.length){ el.innerHTML = `<div class="empty"><div class="em">${MKR.ui.icon('users')}</div><p>No new starters waiting</p></div>`; return; }
      el.innerHTML = list.map(u=>`<div class="li"><div class="ava">${U.initials(u.name)}</div>
        <div class="meta"><b>${U.esc(u.name)}</b><span>ID ${U.esc(u.id)} · ${u.position||''} · ${({casual:'Casual',parttime:'PT',fulltime:'FT'})[u.employment]} · ${u.onboarded?'Complete':'Waiting on details'}</span></div>
        <button class="btn btn-ghost btn-sm" data-link="${u.username}">Copy link</button></div>`).join('');
      U.qsa('[data-link]',el).forEach(b=>b.onclick=()=>{
        const link = `${location.origin}${location.pathname}#/staff/onboarding`;
        navigator.clipboard?.writeText(link).then(()=>U.toast('Onboarding link copied','green')).catch(()=>U.toast('Link: sign in to Staff → My onboarding'));
      });
    }
    drawPending(pending);

    // ----- Phone join requests (pending manager approval) -----
    async function drawRequests(){
      const reqs = (await MKR.db.getAll('users')).filter(u=>u.status==='pending' && (u.kitchenId||'k_main')===myKid && u.role!=='owner');
      const card=U.qs('#jreqCard',c), el=U.qs('#jreqList',c); if(!card||!el) return;
      card.style.display = reqs.length? '' : 'none';
      if(!reqs.length){ el.innerHTML=''; return; }
      el.innerHTML = reqs.map(u=>`<div class="li"><div class="ava">${U.initials(u.name)}</div>
        <div class="meta"><b>${U.esc(u.name)} <span class="pill warn">Pending</span></b><span>${MKR.ui.icon('phone')} ${U.esc(u.phone||u.username||'—')} · wants to join as ${u.role==='manager'?'Manager':'Staff'} · ${U.ago(u.requestedAt||u.createdAt||Date.now())}</span></div>
        <div class="row gap6"><button class="btn btn-green btn-sm" data-ap="${u.id}">Approve</button><button class="btn btn-ghost btn-sm" data-rj="${u.id}">Reject</button></div></div>`).join('');
      U.qsa('[data-ap]',el).forEach(b=>b.onclick=async()=>{
        const u=reqs.find(x=>x.id===b.dataset.ap);
        await MKR.db.put('users',{id:b.dataset.ap, status:'active'});
        // Grant the role server-side: create the profiles row tied to their Auth
        // account. RLS lets a manager create staff; manager-role joins need an owner.
        if(u && u.joinUid && MKR.supa.client){
          const {error}=await MKR.supa.client.from('profiles').upsert({id:u.joinUid, username:u.username, name:u.name, role:u.role||'staff', staff_id:u.id, emoji:u.emoji, active:true, kitchen_id:u.kitchenId});
          if(error){ U.toast('Approved, but role grant failed: '+error.message,'amber'); }
        }
        await MKR.audit.log({action:'staff.hire', desc:`Approved join request · ${u?u.name:b.dataset.ap}`});
        await MKR.db.put('alerts',{type:'join', level:'amber', title:'Join request approved', desc:`${u?u.name:'A new member'} can now sign in`, read:false, ts:Date.now()});
        U.toast('Approved — they can sign in now','green'); drawRequests();
      });
      U.qsa('[data-rj]',el).forEach(b=>b.onclick=async()=>{
        if(!(await U.confirm('Reject request','Reject and remove this join request?',{ok:'Reject',danger:true}))) return;
        await MKR.db.remove('users', b.dataset.rj); U.toast('Request rejected','amber'); drawRequests();
      });
    }
    drawRequests();
    MKR.db.on('users', drawRequests);

    U.qs('#hbtn',c).onclick = async ()=>{
      const phone = U.qs('#hphone',c).value.trim().replace(/\s/g,'');
      if(!phone){ U.toast('Please enter a phone number','red'); return; }
      const name = U.qs('#hname',c).value.trim() || ('Starter '+phone.slice(-4));
      const username = phone, password = 'mkr'+phone.slice(-4);   // default password (>=6), staff can change after first login
      const staffId = MKR.util.uid('u');
      const btn = U.qs('#hbtn',c); btn.disabled=true; btn.textContent='Creating account…';

      // 1) create the login account (secondary client, doesn't affect manager's session)
      let uid=null, authMsg='';
      if(MKR.supa.signupClient){
        const {data,error}=await MKR.supa.signupClient.auth.signUp({email:MKR.supa.emailFor(username), password});
        if(data&&data.user) uid=data.user.id;
        else if(error && /regist|exist/i.test(error.message)){ const {data:si}=await MKR.supa.signupClient.auth.signInWithPassword({email:MKR.supa.emailFor(username),password}); if(si&&si.user) uid=si.user.id; }
        else if(error) authMsg=error.message;
        await MKR.supa.signupClient.auth.signOut().catch(()=>{});
      }
      // 2) staff data + profile (role)
      const kitchenId = (MKR.auth.current()&&MKR.auth.current().kitchenId)||'k_main';
      await MKR.db.put('users',{ id:staffId, role:'staff', name, username, kitchenId,
        employment:U.qs('#htype',c).value, position:U.qs('#hpos',c).value,
        skills:U.qsa('[data-hsk]',c).filter(i=>i.checked).map(i=>i.dataset.hsk), onboarded:false, age:null, createdAt:Date.now() });
      if(uid && MKR.supa.client) await MKR.supa.client.from('profiles').upsert({id:uid, username, name, role:'staff', staff_id:staffId, active:true, kitchen_id:kitchenId});
      await MKR.audit.log({action:'staff.hire', desc:`Added user ${name}`});
      btn.disabled=false; btn.textContent='Create account & send link';

      U.modal('Staff account created', `
        ${authMsg?`<div class="alert amber"><span>${MKR.ui.icon('warning')}</span><div>Account note: ${U.esc(authMsg)} (staff data saved — you can retry creating the login later)</div></div>`:`<div class="alert green"><span>${MKR.ui.icon('key')}</span><div>Created an independent login for <b>${U.esc(name)}</b>.</div></div>`}
        <div class="field mt12"><label>Send these details to the new starter</label>
          <input class="input" value="Username ${U.esc(username)} · password ${U.esc(password)} · staff ID ${U.esc(staffId)}" readonly onclick="this.select()"></div>
        <p class="muted" style="font-size:13px">After signing in to the Staff portal, they complete onboarding (Passport / TFN / Super / bank) under “My profile”.</p>`,
        {actions:[{label:'Done',class:'btn-dark',onClick:x=>{x(); hire(c);}}]});
      U.qs('#hphone',c).value=''; U.qs('#hname',c).value='';
    };
  }

  // ---------- Task checklist review ----------
  // Two ways to look at the same checklist: the kitchen it happens in (the
  // default — a station per bench, a dot per outstanding job) or the plain list
  // with the photos staff submitted. The choice sticks per device.
  const TKEY = 'mkr_tasks_view';
  let tasksView = (function(){ try{ return localStorage.getItem(TKEY)==='list' ? 'list' : 'room'; }catch(e){ return 'room'; } })();

  async function tasks(c){
    let list = await MKR.tasks.today();
    c.innerHTML = `
      <div class="section-head"><div><h2>Daily task checklist</h2><p>Publish cleaning / prep / temperature checks · review the digital logs and photos staff submit</p></div>
        <div class="row gap8 wrap center">
          <div class="viewswitch" role="group" aria-label="How to show today's tasks">
            <button class="${tasksView==='room'?'on':''}" data-tview="room">${MKR.ui.icon('pan')}Kitchen</button>
            <button class="${tasksView==='list'?'on':''}" data-tview="list">${MKR.ui.icon('list')}List</button>
          </div>
          <button class="btn btn-ghost btn-sm" id="addTask" data-new>+ Add task</button>
        </div></div>
      <div id="tlist"></div>`;
    function draw(){
      const el = U.qs('#tlist',c);
      if(tasksView==='room' && MKR.kitchenGame){ MKR.kitchenGame.render(el, {tasks:list, reload:refresh}); return; }
      const done = list.filter(t=>t.done).length;
      el.innerHTML = `<div class="card stat" style="margin-bottom:16px"><div class="k">Today's progress</div>
        <div class="v">${done}<small> / ${list.length}</small></div><div class="bar"><i style="width:${list.length?done/list.length*100:0}%"></i></div></div>` +
        list.map(t=>`<div class="task-item ${t.done?'done':''}">
          <div class="task-check ${t.done?'done':''}" data-tk="${t.id}">${t.done?MKR.ui.icon('check'):''}</div>
          <div class="grow"><b>${U.esc(t.name)}</b><div class="faint" style="font-size:12px">${t.done?`${U.esc(t.by||'')} · ${t.value?U.esc(t.value)+' · ':''}submitted`:(MKR.tasks.needsPhoto(t)?'Waiting on staff · needs a photo':'Waiting on staff')}</div></div>
          ${t.photo?`<img class="thumb" src="${t.photo}" data-img="${t.id}">`
                   :`<label class="btn btn-ghost btn-sm" style="cursor:pointer">${MKR.ui.icon('camera')} Photo<input type="file" accept="image/*" capture="environment" data-photo="${t.id}" hidden></label>`}
        </div>`).join('');
      U.qsa('[data-img]',el).forEach(im=> im.onclick=()=> U.modal('Submitted photo', `<img src="${im.src}" style="width:100%;border-radius:12px">`));
      // The list view drew the same tick box as the phone but never bound it,
      // so on this screen the checklist could only be read, never worked.
      U.qsa('[data-tk]',el).forEach(b=> b.onclick=()=> toggle(b.dataset.tk));
      U.qsa('[data-photo]',el).forEach(inp=> inp.onchange=()=> U.readImage(inp.files[0], async(data)=>{
        const t=list.find(x=>x.id===inp.dataset.photo); if(!t) return;
        const r=await MKR.tasks.complete(t, {photo:data, value:t.value});
        await refresh(); U.toast(r.ok?'Photo uploaded':r.msg, r.ok?'green':'amber');
      }));
    }
    async function refresh(){ list=await MKR.tasks.today(); draw(); }
    // Same rules as the phone: a temperature check needs its reading, a photo
    // task needs its photo — MKR.tasks is what decides, not the screen.
    async function toggle(id){
      const t=list.find(x=>x.id===id); if(!t) return;
      if(t.done){ await MKR.tasks.uncomplete(t); return refresh(); }
      if(MKR.tasks.needsValue(t)){
        const f=U.el(`<div class="field"><label>Record temperature (°C)</label><input class="input" id="mt_v" type="number" step="0.1" placeholder="e.g. 3.5"></div>`);
        U.modal('Temperature check', f, {actions:[{label:'Record & complete', class:'btn-dark', onClick:async(cl)=>{
          const r=await MKR.tasks.complete(t,{value:U.qs('#mt_v',f).value});
          if(!r.ok) return U.toast(r.msg,'amber');
          cl(); refresh();
        }}]});
        return;
      }
      const r=await MKR.tasks.complete(t);
      if(!r.ok) return U.toast(r.msg,'amber');
      refresh();
    }
    U.qsa('[data-tview]',c).forEach(b=> b.onclick = ()=>{
      tasksView = b.dataset.tview;
      try{ localStorage.setItem(TKEY, tasksView); }catch(e){}
      tasks(c);
    });
    draw();
    MKR.db.on('tasks', refresh);
    U.qs('#addTask',c).onclick=()=>{
      const wrap=U.el(`<div class="field"><label>Task name</label><input class="input" id="tn" placeholder="e.g. clean the range hood"></div>`);
      U.modal('Add task',wrap,{actions:[{label:'Publish',class:'btn-dark',onClick:async(cl)=>{
        const nm=U.qs('#tn',wrap).value.trim(); if(!nm) return;
        await MKR.db.put('tasks',{name:nm, date:U.todayISO(), done:false, photo:null, by:null});
        list=await MKR.tasks.today(); cl(); draw(); U.toast('Task published','green');
      }}]});
    };
  }

  // ---------- Swaps / SOS ----------
  async function swaps(c){
    const staff = await staffList();
    function nameOf(id){ const s=staff.find(x=>x.id===id); return s?s.name:'?'; }
    let sw = (await MKR.db.getAll('swaps'));
    let sos = (await MKR.db.getAll('sos')).filter(s=>s.status!=='closed');
    c.innerHTML = `
      <div class="section-head"><div><h2>Swaps / SOS dispatch</h2><p>Approve swap requests · post a rewarded urgent cover shift when it gets slammed</p></div>
        <button class="btn btn-accent btn-sm" id="sosBtn">🆘 Post SOS cover</button></div>
      <div class="grid g2" style="align-items:start">
        <div class="card" style="padding:20px"><div class="section-title">Swap requests to approve</div><div class="list" id="swlist"></div></div>
        <div class="card" style="padding:20px"><div class="section-title">Active SOS cover</div><div class="list" id="soslist"></div></div>
      </div>`;
    function drawSwaps(){
      const el=U.qs('#swlist',c); const pend=sw.filter(s=>s.status==='pending');
      if(!pend.length){ el.innerHTML=`<div class="empty"><div class="em">${MKR.ui.icon('repeat')}</div><p>No swaps to approve</p></div>`; return; }
      el.innerHTML=pend.map(s=>`<div class="li"><div class="ava">${U.initials(nameOf(s.staffId))}</div>
        <div class="meta"><b>${U.esc(nameOf(s.staffId))} wants to drop a shift</b><span>${U.esc(s.label||'')} · ${U.esc(s.reason||'something came up')}</span></div>
        <div class="row gap6"><button class="btn btn-green btn-sm" data-ap="${s.id}">Approve</button><button class="btn btn-ghost btn-sm" data-rj="${s.id}">Reject</button></div></div>`).join('');
      U.qsa('[data-ap]',el).forEach(b=>b.onclick=async()=>{ await MKR.db.put('swaps',{id:b.dataset.ap,status:'approved'}); await MKR.audit.log({action:'swap.approve',desc:'Swap approved'}); sw=await MKR.db.getAll('swaps'); drawSwaps(); U.toast('Approved — posted to the swap market','green'); });
      U.qsa('[data-rj]',el).forEach(b=>b.onclick=async()=>{ await MKR.db.put('swaps',{id:b.dataset.rj,status:'rejected'}); sw=await MKR.db.getAll('swaps'); drawSwaps(); });
    }
    function drawSos(){
      const el=U.qs('#soslist',c);
      if(!sos.length){ el.innerHTML=`<div class="empty"><div class="em">${MKR.ui.icon('bell')}</div><p>No active SOS</p></div>`; return; }
      el.innerHTML=sos.map(s=>`<div class="li"><div class="ava">🆘</div>
        <div class="meta"><b>${U.esc(s.title)}</b><span>Reward ${U.esc(s.reward)} · ${s.claimedBy?('claimed by '+nameOf(s.claimedBy)):'waiting for a taker'}</span></div>
        ${s.claimedBy?'<span class="pill ok">Covered</span>':'<span class="pill warn">Recruiting</span>'}</div>`).join('');
    }
    drawSwaps(); drawSos();
    MKR.db.on('swaps', async()=>{ sw=await MKR.db.getAll('swaps'); drawSwaps(); });
    MKR.db.on('sos', async()=>{ sos=(await MKR.db.getAll('sos')).filter(s=>s.status!=='closed'); drawSos(); });
    U.qs('#sosBtn',c).onclick=()=>{
      const wrap=U.el(`<div>
        <div class="field"><label>Time / description</label><input class="input" id="st" placeholder="e.g. tonight 18:00, short 1 person"></div>
        <div class="field"><label>Reward</label><input class="input" id="rw" value="+$40 / free meal"></div></div>`);
      U.modal('🆘 Post urgent SOS cover',wrap,{actions:[{label:'Push to available staff',class:'btn-accent',onClick:async(cl)=>{
        const title=U.qs('#st',wrap).value.trim()||'Urgent cover'; const reward=U.qs('#rw',wrap).value.trim();
        await MKR.db.put('sos',{title,reward,status:'open',claimedBy:null,ts:Date.now()});
        await MKR.audit.log({action:'sos.post',desc:'Posted SOS: '+title});
        if(MKR.notify&&MKR.notify.push) MKR.notify.push({role:'staff'}, '🆘 Urgent cover', title+' · reward '+reward, 'sos');
        sos=(await MKR.db.getAll('sos')).filter(s=>s.status!=='closed'); cl(); drawSos(); U.toast('SOS pushed to all available staff','green');
      }}]});
    };
  }

})();
