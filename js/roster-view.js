/* ===== Rostering page =====
   Week-by-week roster grid on top of MKR.roster. Auto-roster asks for the owner's
   preferences the first time, then plans from availability, skills and how many
   people they actually rostered in past weeks.

   No wages, no ratios, no caps. Warnings only.
*/
window.MKR = window.MKR || {};
(function(){
  const U = MKR.util;
  const R = ()=>MKR.roster;
  const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const BANDS = [
    {key:'floor',   label:'Floor',   color:'#2E7D5B', soft:'#E4F2EA'},
    {key:'kitchen', label:'Kitchen', color:'#B5561E', soft:'#FBE9DD'},
    {key:'manager', label:'Manager', color:'#2F5BB7', soft:'#E5EDFB'},
  ];
  let weekOffset = 0;     // 0 = this week, +1 = next week …

  function bandOf(s){
    if(s.role==='manager') return 'manager';
    const sk = R().skillsOf(s);
    if(sk.includes('kitchen')) return 'kitchen';
    if(/kitchen|chef|厨|后厨/i.test(s.position||'')) return 'kitchen';
    return 'floor';
  }

  async function render(c){
    const week = R().weekKey(R().weekStart(weekOffset));
    const staff = (await MKR.db.getAll('users')).filter(u=>(u.role==='staff'||u.role==='manager') && !u.offboarded);
    const p = await R().prefs();
    let shifts = await R().shiftsFor(week);

    const staffOf = id=> staff.find(s=>s.id===id) || {name:'?', id};
    const hoursOf = id=> U.round2(shifts.filter(s=>s.staffId===id).reduce((t,s)=>t+U.shiftHours(s.start,s.end),0));
    const totalHours = U.round2(shifts.reduce((t,s)=>t+U.shiftHours(s.start,s.end),0));

    const warns = await R().warnings(week, staff, p);
    const reds = warns.filter(w=>w.level==='red').length;
    if(warns.length) R().notifyWarnings(week, warns, p);

    const label = weekOffset===0 ? 'This week' : (weekOffset===1 ? 'Next week' : (weekOffset===-1 ? 'Last week' : `Week of ${U.fmtDate(new Date(week))}`));

    c.innerHTML = `
      <div class="section-head"><div><h2>Rostering</h2><p>AI plans it from availability, skills and your own history · you stay in charge</p></div>
        <div class="row gap8 wrap">
          ${MKR.partners ? MKR.partners.buttons(((MKR.auth.current()||{}).role)||'manager') : ''}
          <button class="btn btn-ghost btn-sm" id="rsPrefs">⚙️ Preferences</button>
          <button class="btn btn-ghost btn-sm" id="rsCsv">⬇️ Export</button>
          <button class="btn btn-accent btn-sm" id="rsAuto">✨ AI auto-roster</button>
        </div></div>

      <div class="weekbar">
        <button class="btn btn-ghost btn-sm" id="wkPrev">‹ Previous</button>
        <div class="weekbar-mid"><b>${U.esc(label)}</b><span class="faint">${U.fmtDate(R().dayTs(week,0))} – ${U.fmtDate(R().dayTs(week,6))}</span></div>
        <button class="btn btn-ghost btn-sm" id="wkNext">Next ›</button>
        ${weekOffset!==0?`<button class="btn btn-ghost btn-sm" id="wkToday">Today</button>`:''}
      </div>

      <div class="rs-summary">
        <span class="rs-sum"><b>${new Set(shifts.map(s=>s.staffId)).size}/${staff.length}</b><i>rostered</i></span>
        <span class="rs-sum"><b>${shifts.length}</b><i>shifts</i></span>
        <span class="rs-sum"><b>${totalHours.toFixed(1)}h</b><i>total</i></span>
        <span class="rs-sum rs-warn clickable" id="warnCard" style="${reds?'color:var(--red)':(warns.length?'color:#8a6410':'')}">${warns.length? `<b>${warns.length}</b><i>warnings</i>` : '<b>✓</b><i>all clear</i>'}</span>
      </div>

      ${warns.length? `<div class="card pad20" style="margin-bottom:16px">
        <div class="section-title">⚠️ Worth a look — none of this blocks anything</div>
        <div class="list">${warns.slice(0,6).map(w=>`
          <div class="li"><div class="ds-li-ic">${w.level==='red'?'🔴':(w.level==='amber'?'🟠':'🔵')}</div>
            <div class="meta"><b>${U.esc(w.title)}</b><span>${U.esc(w.detail)}</span></div></div>`).join('')}
          ${warns.length>6?`<div class="li"><div class="meta"><span class="faint">+ ${warns.length-6} more</span></div></div>`:''}
        </div>
        <div class="faint" style="font-size:12px;margin-top:10px">These are your own preferences talking back to you. Change what you're warned about in ⚙️ Preferences.</div>
      </div>` : ''}

      <div class="card" style="padding:14px 14px 6px;margin-bottom:16px">
        <div class="section-title" style="padding:2px 4px 10px">Team roster</div>
        <div class="rgrid-wrap" id="rosterGrid"></div>
        <div class="faint" style="font-size:11.5px;padding:8px 4px">Tap an empty cell to add a shift · drag a shift to move or reassign it · tap × to remove</div>
      </div>
      <div id="rsExplain"></div>`;

    U.qs('#wkPrev',c).onclick = ()=>{ weekOffset--; render(c); };
    U.qs('#wkNext',c).onclick = ()=>{ weekOffset++; render(c); };
    const t=U.qs('#wkToday',c); if(t) t.onclick=()=>{ weekOffset=0; render(c); };
    U.qs('#rsPrefs',c).onclick = ()=> prefsModal(staff, ()=>render(c));
    U.qs('#rsAuto',c).onclick  = ()=> autoRoster(c, week, staff);
    U.qs('#warnCard',c).onclick = ()=> warnModal(warns);
    U.qs('#rsCsv',c).onclick = ()=>{
      if(!shifts.length){ U.toast('Nothing to export','amber'); return; }
      const rows=[['Week','Day','Date','Person','Start','End','Hours']];
      shifts.slice().sort((a,b)=>a.day-b.day||String(a.start).localeCompare(String(b.start)))
        .forEach(s=>rows.push([week, DAYS[s.day], U.fmtDate(R().dayTs(week,s.day)), staffOf(s.staffId).name, s.start, s.end, U.shiftHours(s.start,s.end).toFixed(2)]));
      rows.push(['','','','','','Total', totalHours.toFixed(2)]);
      U.downloadCSV(`roster-${week}.csv`, rows); U.toast('Exported','green');
    };
    if(MKR.partners) MKR.partners.bind(c);

    drawGrid();

    function drawGrid(){
      const grid = U.qs('#rosterGrid',c);
      if(!staff.length){ grid.innerHTML='<div class="empty"><div class="em">👥</div><p>No team members yet</p></div>'; return; }
      const todayIdx = weekOffset===0 ? (new Date().getDay()+6)%7 : -1;
      const cellShifts = (id,d)=> shifts.filter(x=>x.staffId===id && x.day===d).sort((a,b)=>String(a.start).localeCompare(String(b.start)));
      const head = `<tr><th class="rg-name">Name</th>${DAYS.map((d,di)=>`<th${di===todayIdx?' style="color:var(--accent)"':''}>${d}<br><span class="rg-date">${U.fmtDate(R().dayTs(week,di))}</span></th>`).join('')}<th>Total</th></tr>`;
      let body='';
      for(const band of BANDS){
        const people = staff.filter(s=>bandOf(s)===band.key);
        if(!people.length) continue;
        body += `<tr class="rg-bandrow"><td class="rg-name" style="background:${band.soft};color:${band.color}">${band.label} · ${people.length}</td><td colspan="${DAYS.length+1}" style="background:${band.soft}"></td></tr>`;
        for(const s of people){
          const cells = DAYS.map((d,di)=>{
            const chips = cellShifts(s.id,di).map(x=>`<span class="rg-chip" draggable="true" data-id="${x.id}" style="background:${band.soft};color:${band.color};border-color:${band.color}55">${x.start}–${x.end}<span class="rg-x" data-rm="${x.id}">×</span></span>`).join('');
            return `<td class="rg-cell${di===todayIdx?' today':''}" data-day="${di}" data-staff="${s.id}">${chips||'<span class="rg-empty">＋</span>'}</td>`;
          }).join('');
          const sk = R().skillsOf(s).map(k=>(R().SKILLS[k]||{}).em||'').join('');
          body += `<tr><td class="rg-name"><div class="rg-person"><span class="ava">${s.emoji||U.initials(s.name)}</span>
            <div style="min-width:0"><b>${U.esc(s.name)}</b><span class="faint">${U.esc(s.position||MKR.auth.roleName(s.role))} ${sk}</span></div></div></td>${cells}
            <td class="rg-total">${hoursOf(s.id).toFixed(1)}h</td></tr>`;
        }
      }
      grid.innerHTML = `<table class="rgrid"><thead>${head}</thead><tbody>${body}</tbody></table>`;

      let dragId=null;
      U.qsa('.rg-chip',grid).forEach(ch=>{
        ch.addEventListener('dragstart',e=>{ dragId=ch.dataset.id; e.dataTransfer.effectAllowed='move'; ch.style.opacity='.35'; });
        ch.addEventListener('dragend',()=>{ ch.style.opacity=''; });
      });
      U.qsa('.rg-cell',grid).forEach(cell=>{
        cell.addEventListener('dragover',e=>{ e.preventDefault(); cell.classList.add('dragover'); });
        cell.addEventListener('dragleave',()=>cell.classList.remove('dragover'));
        cell.addEventListener('drop',async e=>{
          e.preventDefault(); cell.classList.remove('dragover');
          if(!dragId) return;
          const day=+cell.dataset.day, staffId=cell.dataset.staff;
          const sh=shifts.find(x=>x.id===dragId);
          if(sh && (sh.day!==day || sh.staffId!==staffId)){
            await MKR.db.put('shifts',{id:dragId, day, staffId, week});
            render(c);
          }
          dragId=null;
        });
        cell.onclick = e=>{ if(e.target.closest('.rg-chip')||e.target.dataset.rm) return; addShift(+cell.dataset.day, cell.dataset.staff); };
      });
      U.qsa('[data-rm]',grid).forEach(b=> b.onclick=async e=>{
        e.stopPropagation(); await MKR.db.remove('shifts', b.dataset.rm); render(c);
      });
    }

    async function addShift(day, staffId){
      const sl = await R().slots();
      const s = staffOf(staffId);
      const av = (s.availability||{})[day];
      const wrap = U.el(`<div>
        <div class="faint" style="font-size:12.5px;margin-bottom:10px">${U.esc(s.name)} · ${DAYS[day]} ${U.fmtDate(R().dayTs(week,day))}
          ${av&&av!=='off'?` · available: <b>${U.esc(av==='all'?'any time':av)}</b>`:' · <b style="color:var(--red)">not marked available</b>'}</div>
        <div class="row gap6 wrap" style="margin-bottom:10px">${sl.map(x=>`<button class="btn btn-ghost btn-sm" data-slot="${x.start}|${x.end}">${U.esc(x.label)} ${x.start}–${x.end}</button>`).join('')}</div>
        <div class="row"><div class="field grow"><label>Start</label><input class="input" id="sh_s" type="time" value="${sl[0]?sl[0].start:'09:00'}"></div>
          <div class="field grow"><label>End</label><input class="input" id="sh_e" type="time" value="${sl[0]?sl[0].end:'17:00'}"></div></div>
        <div class="faint" style="font-size:12px">Adding a shift outside someone's availability is allowed — you'll just get a warning.</div>
      </div>`);
      U.qsa('[data-slot]',wrap).forEach(b=> b.onclick=()=>{ const [a,z]=b.dataset.slot.split('|'); U.qs('#sh_s',wrap).value=a; U.qs('#sh_e',wrap).value=z; });
      U.modal('Add shift', wrap, {actions:[
        {label:'Cancel', class:'btn-ghost', onClick:x=>x()},
        {label:'Add', class:'btn-dark', onClick:async(close)=>{
          const st=U.qs('#sh_s',wrap).value, en=U.qs('#sh_e',wrap).value;
          if(U.shiftHours(st,en)<=0){ U.toast('End time must be after start','red'); return; }
          await MKR.db.put('shifts',{id:U.uid('sh'), week, day, staffId, start:st, end:en});
          close(); render(c);
        }}
      ]});
    }
  }

  function warnModal(warns){
    U.modal(`Roster warnings · ${warns.length}`, warns.length? `
      <div class="alert info" style="margin-bottom:12px"><span>ℹ️</span><div>Every item here is advisory. Nothing in this app stops you publishing a roster — these are the things you asked to be told about.</div></div>
      <div class="list">${warns.map(w=>`<div class="li"><div class="ds-li-ic">${w.level==='red'?'🔴':(w.level==='amber'?'🟠':'🔵')}</div>
        <div class="meta"><b>${U.esc(w.title)}</b><span>${U.esc(w.detail)}</span></div></div>`).join('')}</div>`
      : `<div class="empty"><div class="em">✅</div><p>Nothing flagged</p></div>`);
  }

  // ---------- auto-roster ----------
  async function autoRoster(c, week, staff){
    const p = await R().prefs();
    if(!p.asked){                     // first run — ask before planning anything
      U.toast('First, tell us how you like your roster','');
      return prefsModal(staff, ()=>autoRoster(c, week, staff), true);
    }
    if(!staff.length){ U.toast('Add some team members first','amber'); return; }
    const existing = await R().shiftsFor(week);
    if(existing.length && !(await U.confirm('Auto-roster', `This replaces the ${existing.length} shifts already on this week. Continue?`, {ok:'Generate'}))) return;

    U.toast('Planning…','');
    const {plan, gaps} = await R().generate(week, staff, p);
    await R().apply(week, plan);
    const warns = await R().warnings(week, staff, p);
    await R().notifyWarnings(week, warns, p);
    await render(c);

    const box = U.qs('#rsExplain');
    if(box){
      box.innerHTML = `<div class="card pad20 mt16"><div class="section-title">✨ Why it planned it this way</div><p class="muted">Thinking…</p></div>`;
      const text = await R().explain(week, staff, plan, warns);
      box.innerHTML = `<div class="card pad20 mt16"><div class="section-title">✨ Why it planned it this way</div>${text}
        ${gaps.length?`<div class="alert amber mt12"><span>🕳️</span><div><b>${gaps.length} slot${gaps.length===1?'':'s'} couldn't be filled</b> — nobody was available. Add availability, or fill them by hand.</div></div>`:''}</div>`;
    }
    U.toast(`Rostered ${plan.length} shifts`,'green');
  }

  // ---------- preference questionnaire ----------
  async function prefsModal(staff, after, firstRun){
    const p = await R().prefs();
    const sl = await R().slots();
    const {table, learned} = await R().demandTable(p);
    const num=(id,val,step='1')=>`<input class="input" id="${id}" type="number" step="${step}" value="${val}" style="width:90px;text-align:right">`;
    const check=(id,on,label,hint)=>`<label class="onb-item" style="cursor:pointer"><input type="checkbox" id="${id}" ${on?'checked':''} style="width:20px;height:20px">
      <div class="grow"><b>${label}</b><div class="faint" style="font-size:12px">${hint}</div></div></label>`;

    const wrap = U.el(`<div>
      ${firstRun?`<div class="alert info" style="margin-bottom:14px"><span>👋</span><div>Before the AI rosters anything, tell it how you like to run the place. You can change all of this later.</div></div>`:''}

      <div class="section-title">1 · How many people do you want on?</div>
      <p class="muted" style="font-size:13px">${learned?'These numbers were learned from what you actually rostered over the last few weeks — adjust anything that looks wrong.':'Set the headcount you want for each day-part.'}</p>
      <div class="tablewrap"><table class="dtable">
        <thead><tr><th>Day-part</th>${DAYS.map(d=>`<th class="num">${d}</th>`).join('')}</tr></thead>
        <tbody>${sl.map(slot=>`<tr><td><b>${U.esc(slot.label)}</b><div class="faint" style="font-size:11.5px">${slot.start}–${slot.end}</div></td>
          ${DAYS.map((d,di)=>`<td class="num"><input class="input dm" type="number" min="0" step="1" data-slot="${slot.k}" data-day="${di}" value="${(table[slot.k]||{})[di]||0}" style="width:56px;text-align:right"></td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>
      ${check('pf_hist', p.useHistory, 'Keep learning from my history', 'Uses how many people you really rostered in past weeks when you haven\'t set a number yourself.')}

      <div class="section-title mt16">2 · What should it optimise for?</div>
      ${check('pf_fair', p.fairness, 'Spread hours evenly', 'Otherwise it just fills shifts with whoever scores highest.')}
      ${check('pf_open', p.requireOpener, 'Every day needs someone who can open 🔑', 'Warns you if the first shift has nobody with the open skill.')}
      ${check('pf_close', p.requireCloser, 'Every day needs someone who can close 🌙', 'Warns you if the last shift has nobody with the close skill.')}
      ${check('pf_kit', p.requireKitchen, 'Every day needs kitchen skill 🍳', 'Warns you if nobody rostered that day can cook.')}

      <div class="section-title mt16">3 · When should it warn you?</div>
      <div class="alert info" style="margin-bottom:10px"><span>ℹ️</span><div>These are <b>warnings, not limits</b>. Go past any of them and the roster still saves — you just get told.</div></div>
      <div class="row center" style="gap:10px;margin-bottom:8px"><div class="grow" style="font-size:14px">Tell me when someone goes over</div>${num('pf_maxh', p.maxWeekHours)}<b>h / week</b></div>
      <div class="row center" style="gap:10px;margin-bottom:8px"><div class="grow" style="font-size:14px">Tell me when someone works more than</div>${num('pf_maxd', p.maxConsecutiveDays)}<b>days straight</b></div>
      <div class="row center" style="gap:10px;margin-bottom:8px"><div class="grow" style="font-size:14px">Tell me when the gap between shifts is under</div>${num('pf_rest', p.minRestHours)}<b>hours</b></div>
      ${check('pf_notify', p.notify, 'Send me a notification for roster warnings', 'Otherwise they only show on this page.')}

      <div class="section-title mt16">4 · Who can do what?</div>
      <p class="muted" style="font-size:13px">Skills drive the plan — someone with 🔑 gets the early shift, 🍳 keeps the kitchen covered.</p>
      <div id="pf_skills">${staff.map(s=>`
        <div class="skill-row"><b>${U.esc(s.name)}</b>
          <div class="row gap6 wrap">${Object.entries(R().SKILLS).map(([k,v])=>`
            <label class="skill-chip"><input type="checkbox" data-sk="${s.id}" data-k="${k}" ${R().skillsOf(s).includes(k)?'checked':''}>${v.em} ${v.label}</label>`).join('')}</div></div>`).join('')}
      </div>
      ${staff.length?'':'<div class="empty" style="padding:14px"><div class="em">👥</div><p>No team members yet</p></div>'}
    </div>`);

    U.modal(firstRun?'How do you like your roster?':'Rostering preferences', wrap, {actions:[
      {label:'Cancel', class:'btn-ghost', onClick:x=>x()},
      {label:firstRun?'Save & roster':'Save', class:'btn-dark', onClick:async(close)=>{
        const demand={};
        U.qsa('.dm',wrap).forEach(i=>{ (demand[i.dataset.slot]=demand[i.dataset.slot]||{})[i.dataset.day]=Math.max(0,Number(i.value)||0); });
        await R().savePrefs({
          demand,
          useHistory: U.qs('#pf_hist',wrap).checked,
          fairness: U.qs('#pf_fair',wrap).checked,
          requireOpener: U.qs('#pf_open',wrap).checked,
          requireCloser: U.qs('#pf_close',wrap).checked,
          requireKitchen: U.qs('#pf_kit',wrap).checked,
          maxWeekHours: Number(U.qs('#pf_maxh',wrap).value)||38,
          maxConsecutiveDays: Number(U.qs('#pf_maxd',wrap).value)||6,
          minRestHours: Number(U.qs('#pf_rest',wrap).value)||10,
          notify: U.qs('#pf_notify',wrap).checked,
        });
        // Skills live on the user record so every page sees them.
        for(const s of staff){
          const picked = U.qsa(`[data-sk="${s.id}"]`,wrap).filter(i=>i.checked).map(i=>i.dataset.k);
          const before = R().skillsOf(s).slice().sort().join(',');
          if(before !== picked.slice().sort().join(',')) await MKR.db.put('users',{id:s.id, skills:picked});
        }
        close(); U.toast('Preferences saved','green'); if(after) after();
      }}
    ]});
  }

  MKR.rosterView = { render, prefsModal };
})();
