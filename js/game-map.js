/* ===== The restaurant floor — the owner's home screen =====
   Everything the app wants from the owner today, laid out as the place they
   already know: the cold room, the back door, the kitchen, the staff area, the
   office. A badge on a room means that room is waiting on you; no badge means
   it's fine. Walk in, clear the badge, walk out.

   The counts are real. Every one of them is read from the same modules the list
   dashboard reads, and every room links to the page that actually does the work
   — this is a way in, not a second copy of the app.

   Still no levels, no points and no character to steer. The little figure just
   stands there and tells you which room to start with.
*/
window.MKR = window.MKR || {};
(function(){
  const U = MKR.util;

  // Every room maps to a module that exists. There is no "front of house /
  // takings" room on purpose — this app has no point of sale, so it would have
  // nothing honest to show.
  // `tone` is the module's colour from MKR.ui — the same one its block on the
  // home screen uses, so a room and its block are recognisably the same thing.
  const ROOMS = [
    {id:'stock',    ic:'box',      tone:'blue',   name:'Cold room & store', note:'Stock to top up',     href:'#/owner/stock',      cls:'r-stock'},
    {id:'delivery', ic:'truck',    tone:'amber',  name:'Back door',         note:'Deliveries to check', href:'#/owner/deliveries', cls:'r-delivery'},
    {id:'kitchen',  ic:'pan',      tone:'green',  name:'Kitchen',           note:"Today's checklist",   href:'#/manager/tasks',    cls:'r-kitchen'},
    {id:'team',     ic:'calendar', tone:'violet', name:'Staff area',        note:'Roster for the week', href:'#/manager/schedule', cls:'r-team'},
    {id:'training', ic:'book',     tone:'teal',   name:'Training room',     note:'Sign-offs waiting',   href:'#/owner/training',   cls:'r-training'},
    {id:'office',   ic:'bell',     tone:'red',    name:'Your office',       note:'Alerts and the week', href:'#/owner/alerts',     cls:'r-office'},
  ];

  function greeting(){
    const h = new Date().getHours();
    if(h<11) return 'Morning, boss';
    if(h<14) return 'Middle of the day, boss';
    if(h<18) return 'Afternoon, boss';
    return 'Evening, boss';
  }

  // Roughly a minute and a half per thing to decide — enough to be honest about
  // the size of the job without pretending to be precise.
  const minutesFor = (n)=> Math.max(1, Math.round(n*1.5));

  async function counts(){
    const m = {};
    const out = {};
    let stock=[], deliveries=[], training=[], tasks=[], alerts=[], shifts=[], staff=[];
    try{ stock = await MKR.stock.overview(); }catch(e){}
    try{ deliveries = await MKR.deliveries.pending(); }catch(e){}
    try{ training = (await MKR.training.trainings()).filter(t=>t.status!=='done'); }catch(e){}
    try{ tasks = (await MKR.db.getAll('tasks')).filter(t=>t.date===U.todayISO()); }catch(e){}
    try{ alerts = (await MKR.db.getAll('alerts')).filter(a=>!a.read); }catch(e){}

    let rosterShort = 0;
    try{
      const week = MKR.roster.thisWeek();
      shifts = await MKR.roster.shiftsFor(week);
      staff = (await MKR.db.getAll('users')).filter(u=>(u.role==='staff'||u.role==='manager') && !u.offboarded);
      const w = await MKR.roster.warnings(week, staff);
      rosterShort = w.filter(x=>x.level==='red').length;
    }catch(e){}

    const lowStock = stock.filter(r=>r.low||r.expiring);
    out.stock    = {n:lowStock.length,          why: lowStock.slice(0,3).map(r=>r.name).join(', ')};
    out.delivery = {n:deliveries.length,        why: deliveries.length?'Waiting to be confirmed at the back door':''};
    out.kitchen  = {n:tasks.filter(t=>!t.done).length, why: 'Cleaning, prep and temperature checks'};
    out.team     = {n:rosterShort,              why: rosterShort?'Fewer people on than you planned':''};
    out.training = {n:training.length,          why: training.length?'Staff still to sign off':''};
    out.office   = {n:alerts.length,            why: alerts.length?'Unread alerts':''};

    m.rooms = out;
    m.stock = stock;
    m.stockValue = U.round2(stock.reduce((t,r)=>t+r.value,0));
    m.total = Object.values(out).reduce((t,x)=>t+x.n, 0);
    m.clear = ROOMS.filter(r=>!out[r.id].n).length;
    return m;
  }

  // One plain-English line about what changed, built from the owner's own data —
  // no network call, no model, nothing invented.
  function insight(m){
    // Same test the cold room uses, so the line can never contradict the badge.
    const risky = m.stock.filter(r=>r.low || r.short || r.expiring)
      .sort((a,b)=>(a.cover==null?99:a.cover)-(b.cover==null?99:b.cover))[0];
    const climbing = m.stock.filter(r=>r.move && r.move.dir==='up')
      .sort((a,b)=>Math.abs(b.move.pct)-Math.abs(a.move.pct))[0];
    const bits = [];
    if(risky) bits.push(
      risky.cover!=null ? `${risky.name} runs out in about ${risky.cover.toFixed(1)} days.`
      : risky.expiring  ? `${risky.name} is near the end of its shelf life.`
      : `${risky.name} is under the level you reorder at.`);
    if(climbing) bits.push(`${climbing.supplier?climbing.supplier.name+' put ':''}${climbing.name} up ${Math.abs(climbing.move.pct).toFixed(1)}%.`);
    return bits.length ? bits.join(' ') : 'Nothing is running short and no supplier has moved a price on you.';
  }

  // Rooms where a number means "today", not "this week". Same list the home
  // blocks use, so a room and its block never disagree about how loud to be.
  const URGENT = ['office','team'];

  function roomHtml(r, c){
    const done = !c.n;
    // The icon chip carries which room this is; the badge carries how it is
    // going. Letting the badge take the room's colour too meant the kitchen's
    // "5 jobs left" was the same green as "all clear".
    const state = MKR.ui.tier(c.n, URGENT.includes(r.id));
    return `<a class="rm t-${r.tone} is-${state} ${r.cls}${done?' rm-done':' rm-live'}" href="${r.href}" data-room="${r.id}"
       aria-label="${U.esc(r.name)} — ${done?'all clear':c.n+' waiting'}">
      <span class="rm-badge${done?' ok':''}">${done?MKR.ui.icon('check'):c.n}</span>
      <span class="rm-ic">${MKR.ui.icon(r.ic)}</span>
      <b>${r.name}</b>
      <small>${r.note}</small>
    </a>`;
  }

  async function render(c){
    const m = await counts();
    const first = ROOMS.find(r=>m.rooms[r.id].n);          // where to send them first
    const firstC = first ? m.rooms[first.id] : null;
    const pct = Math.round(m.clear / ROOMS.length * 100);

    c.innerHTML = `
      <div class="fp">
        <div class="fp-hello">
          <div>
            <h2>${greeting()}</h2>
            ${m.total
              // One text node, no inner markup: the translator matches whole
              // nodes, so a <b> in the middle would split the sentence in two.
              ? `<p class="fp-count">${m.total} thing${m.total===1?'':'s'} waiting on you · about ${minutesFor(m.total)} minute${minutesFor(m.total)===1?'':'s'}</p>`
              : `<p class="fp-count">Nothing is waiting on you. Go and run your restaurant.</p>`}
          </div>
          ${first ? `<a class="btn btn-accent" href="${first.href}">Start with ${first.name} →</a>` : ''}
        </div>

        <div class="fp-prog card">
          <div class="fp-prog-copy"><span>Today's rounds</span><strong>${m.clear} / ${ROOMS.length}</strong></div>
          <div class="fp-prog-track"><span style="width:${pct}%"></span></div>
          <div class="fp-prog-goal">${m.total?'Clear them all and you can leave the back office alone tonight':'All clear — nothing left in the back office'}</div>
        </div>

        <div class="fp-floor">
          <div class="fp-floor-label"><span>Your restaurant</span><small>Tap a room with a badge on it</small></div>
          <div class="fp-rooms">${ROOMS.map(r=>roomHtml(r, m.rooms[r.id])).join('')}</div>
          <div class="fp-boss">
            ${first ? `<span class="fp-think">${U.esc(firstC.why || 'Start here')}</span>` : `<span class="fp-think">All done for today</span>`}
            <span class="fp-body">MKR</span>
          </div>
        </div>

        <div class="fp-insight">
          <span class="fp-insight-ic">${MKR.ui.icon('sparkle')}</span>
          <div><b>What changed since you last looked</b><p>${U.esc(insight(m))}</p></div>
          <a class="btn btn-ghost btn-sm" href="#/owner/stock">Open the cold room →</a>
        </div>

        <details class="disclaimer-fold mt16">
          <summary>Where these numbers come from</summary>
          <p>Every number on this floor is read from your own records. This app tracks your operations only — it has no till, so it never shows takings, and it doesn't calculate pay or talk to any government system.</p>
        </details>
      </div>`;

    // Nothing to bind: the rooms are real links, so they work with the back
    // button, middle-click and the router exactly like the rest of the app.
  }

  MKR.gameMap = { render, ROOMS, counts, greeting };
})();
