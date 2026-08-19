/* ===== The venue's calendar (owner) =====
   One month grid holding the two kinds of thing an owner keeps in their head:

   · deliveries — read from the deliveries table, so the date the driver is due
     is the date on the calendar. Nothing is retyped and the two can't disagree.
   · jobs the venue does to itself — pest control, the deep clean, the grease
     trap, whoever is opening on Sunday. The owner writes their own, gives it to
     a person, and repeats it if it repeats.

   It reads and writes .ics, the format every calendar app already speaks, so
   this page is never the only place the pest control date exists.

   Table: events
*/
window.MKR = window.MKR || {};
(function(){
  const U = MKR.util;
  function kid(){ const s=MKR.auth&&MKR.auth.current&&MKR.auth.current(); return (s&&s.kitchenId)||'k_main'; }

  // A job's kind is only ever used to colour it and pick its icon. It is NOT a
  // second title: the owner's own words stay the title, so "Pest control —
  // Rentokil, back alley" reads on the grid exactly as they typed it.
  const KIND = {
    delivery: {label:'Goods arriving',tone:'amber',  ic:'truck'},
    pest:     {label:'Pest control',  tone:'red',    ic:'shield'},
    clean:    {label:'Deep clean',    tone:'blue',   ic:'sparkle'},
    fix:      {label:'Maintenance',   tone:'violet', ic:'gear'},
    other:    {label:'Something else',tone:'green',  ic:'calendar'},
  };
  const REPEAT = {
    none:      {label:'Does not repeat'},
    weekly:    {label:'Weekly',           days:7},
    fortnight: {label:'Fortnightly',      days:14},
    monthly:   {label:'Monthly'},
    quarterly: {label:'Every quarter'},
  };

  // ---------- dates ----------
  // Everything here is a local YYYY-MM-DD string. A calendar that stores
  // timestamps has to answer "which day is this in?" on every read, and gets it
  // wrong for anyone east of Greenwich for the first ten hours of the day.
  const iso = (y,m,d)=> U.isoDate(new Date(y,m,d).getTime());
  const parse = (s)=>{ const [y,m,d]=String(s||'').split('-').map(Number); return new Date(y||1970,(m||1)-1,d||1); };
  const addDays = (s,n)=>{ const d=parse(s); d.setDate(d.getDate()+n); return U.isoDate(d.getTime()); };
  const addMonths = (s,n)=>{ const d=parse(s); const day=d.getDate(); d.setDate(1); d.setMonth(d.getMonth()+n);
    // 31 Jan + 1 month is 28/29 Feb, not 3 March.
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth()+1, 0).getDate()));
    return U.isoDate(d.getTime()); };
  const monthName = (y,m)=> new Date(y,m,1).toLocaleDateString('en-AU',{month:'long',year:'numeric'});
  const DOW = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  // ---------- data ----------
  async function events(){
    return (await MKR.db.getAll('events')).filter(e=>(e.kitchenId||'k_main')===kid() && !e.archived);
  }
  async function save(e){
    return MKR.db.put('events', {kind:'other', repeat:'none', who:'', time:'', note:'', kitchenId:kid(), ...e,
                                 id:e.id||U.uid('evt')});
  }
  async function remove(id){ return MKR.db.remove('events', id); }

  // Every date this job lands on inside [from,to]. A repeat with no end date
  // runs forever, which is what "every week until we stop" actually means —
  // the loop is bounded by the window being drawn, not by the rule.
  function occurrences(e, from, to){
    const out = [];
    const step = REPEAT[e.repeat] || REPEAT.none;
    let d = e.date;
    if(!d) return out;
    const end = e.until && e.until < to ? e.until : to;
    // Wind forward to the window rather than walking from the first occurrence
    // in 2019 one week at a time.
    if(d < from && e.repeat !== 'none'){
      if(step.days){
        const gap = Math.round((parse(from)-parse(d))/864e5);
        d = addDays(d, Math.floor(gap/step.days)*step.days);
      } else {
        const months = (parse(from).getFullYear()-parse(d).getFullYear())*12 + (parse(from).getMonth()-parse(d).getMonth());
        const per = e.repeat==='quarterly' ? 3 : 1;
        if(months > 0) d = addMonths(d, Math.floor(months/per)*per);
      }
    }
    let guard = 0;
    while(d <= end && guard++ < 400){
      if(d >= from) out.push(d);
      if(e.repeat === 'none') break;
      d = step.days ? addDays(d, step.days) : addMonths(d, e.repeat==='quarterly' ? 3 : 1);
    }
    return out;
  }

  // Deliveries are shown, never stored here. `dueTs` is the date the driver is
  // expected; older rows only have `ts` (when the docket was created), which is
  // the same day often enough to be the right fallback.
  const dayOfDelivery = (d)=> d.dueTs ? U.isoDate(d.dueTs) : U.isoDate(d.ts||Date.now());

  // Everything on one day, jobs and deliveries together, in time order.
  async function dayIndex(from, to){
    const [evs, dels] = await Promise.all([events(), MKR.deliveries.all()]);
    const map = {};
    const push = (day, item)=>{ (map[day] = map[day] || []).push(item); };
    evs.forEach(e=> occurrences(e, from, to).forEach(day=> push(day, {type:'event', e, day})));
    dels.filter(d=> d.status!=='rejected').forEach(d=>{
      const day = dayOfDelivery(d);
      if(day>=from && day<=to) push(day, {type:'delivery', d, day});
    });
    Object.values(map).forEach(list=> list.sort((a,b)=>
      String(a.type==='event'?(a.e.time||'99:99'):'00:00').localeCompare(b.type==='event'?(b.e.time||'99:99'):'00:00')));
    return map;
  }

  // ---------- .ics ----------
  // Deliberately hand-rolled and deliberately small: one VEVENT per job, all-day
  // unless a time was typed. Anything a real calendar sends back that this
  // doesn't understand is dropped on import rather than guessed at.
  const icsDate = (s)=> s.replace(/-/g,'');
  const icsEsc  = (s)=> String(s||'').replace(/[\\;,]/g, m=>'\\'+m).replace(/\n/g,'\\n');
  const RRULE = {weekly:'FREQ=WEEKLY', fortnight:'FREQ=WEEKLY;INTERVAL=2', monthly:'FREQ=MONTHLY', quarterly:'FREQ=MONTHLY;INTERVAL=3'};

  function toICS(list, venue){
    const stamp = new Date().toISOString().replace(/[-:]/g,'').split('.')[0]+'Z';
    const body = list.map(e=>{
      const rule = RRULE[e.repeat];
      const dt = e.time
        ? `DTSTART:${icsDate(e.date)}T${e.time.replace(':','')}00`
        : `DTSTART;VALUE=DATE:${icsDate(e.date)}`;
      const dtEnd = e.time ? '' : `\r\nDTEND;VALUE=DATE:${icsDate(addDays(e.date,1))}`;
      return ['BEGIN:VEVENT', `UID:${e.id}@mykitchenrules`, `DTSTAMP:${stamp}`, dt+dtEnd,
        `SUMMARY:${icsEsc(e.title)}`,
        e.who ? `DESCRIPTION:${icsEsc(e.who + (e.note?' · '+e.note:''))}` : (e.note?`DESCRIPTION:${icsEsc(e.note)}`:''),
        rule ? `RRULE:${rule}${e.until?';UNTIL='+icsDate(e.until):''}` : '',
        'END:VEVENT'].filter(Boolean).join('\r\n');
    }).join('\r\n');
    return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//My Kitchen Rules//EN','CALSCALE:GREGORIAN',
      `X-WR-CALNAME:${icsEsc(venue||'My Kitchen Rules')}`, body, 'END:VCALENDAR'].filter(Boolean).join('\r\n');
  }

  function fromICS(text){
    // Unfold first: the spec wraps long lines and a folded SUMMARY is half a
    // title otherwise.
    const lines = String(text||'').replace(/\r\n[ \t]/g,'').split(/\r?\n/);
    const out = []; let cur = null;
    const val = (l)=> l.slice(l.indexOf(':')+1).replace(/\\n/g,'\n').replace(/\\([\\;,])/g,'$1').trim();
    const dateOf = (l)=>{ const v = val(l).slice(0,8); return `${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}`; };
    const timeOf = (l)=>{ const v = val(l); const m = v.match(/T(\d{2})(\d{2})/); return m ? `${m[1]}:${m[2]}` : ''; };
    lines.forEach(l=>{
      if(/^BEGIN:VEVENT/i.test(l)) cur = {kind:'other', repeat:'none'};
      else if(/^END:VEVENT/i.test(l)){ if(cur && cur.title && cur.date) out.push(cur); cur = null; }
      else if(!cur) return;
      else if(/^SUMMARY[;:]/i.test(l)) cur.title = val(l);
      else if(/^DTSTART[;:]/i.test(l)){ cur.date = dateOf(l); cur.time = timeOf(l); }
      else if(/^DESCRIPTION[;:]/i.test(l)) cur.note = val(l);
      else if(/^RRULE[;:]/i.test(l)){
        const r = val(l).toUpperCase();
        cur.repeat = /FREQ=WEEKLY/.test(r) ? (/INTERVAL=2/.test(r) ? 'fortnight' : 'weekly')
                   : /FREQ=MONTHLY/.test(r) ? (/INTERVAL=3/.test(r) ? 'quarterly' : 'monthly') : 'none';
        const u = r.match(/UNTIL=(\d{4})(\d{2})(\d{2})/);
        if(u) cur.until = `${u[1]}-${u[2]}-${u[3]}`;
      }
    });
    return out;
  }

  // ---------- the page ----------
  async function render(c){
    let cursor = new Date(); cursor.setDate(1);

    async function draw(){
      const y = cursor.getFullYear(), m = cursor.getMonth();
      const first = iso(y,m,1);
      const daysIn = new Date(y,m+1,0).getDate();
      const last = iso(y,m,daysIn);
      const map = await dayIndex(first, last);
      const today = U.todayISO();
      // Monday-first, to match the roster week the venue already runs on.
      const lead = (new Date(y,m,1).getDay()+6)%7;
      const cells = [];
      for(let i=0;i<lead;i++) cells.push(null);
      for(let d=1;d<=daysIn;d++) cells.push(iso(y,m,d));
      while(cells.length%7) cells.push(null);

      const chip = (it)=> it.type==='delivery'
        ? `<a class="cal-chip t-amber" href="#/owner/deliveries" title="Delivery">${MKR.ui.icon('truck')}<span>${
            U.esc(it.d.supplierName || 'Delivery')}</span></a>`
        : `<button class="cal-chip t-${(KIND[it.e.kind]||KIND.other).tone}" data-ev="${it.e.id}">${
            MKR.ui.icon((KIND[it.e.kind]||KIND.other).ic)}<span>${it.e.time?U.esc(it.e.time)+' ':''}${U.esc(it.e.title)}</span></button>`;

      c.innerHTML = `
        <div class="section-head"><div><h2>Calendar</h2>
          <p>Deliveries, pest control, the deep clean — who is doing what, and when</p></div>
          <div class="row gap8 wrap">
            <button class="btn btn-dark btn-sm" id="calAdd">${MKR.ui.icon('plus')} Add to the calendar</button>
            <details class="omenu"><summary class="btn btn-ghost btn-sm" aria-label="More calendar actions">${MKR.ui.icon('dots')}</summary>
              <div class="omenu-pop">
                <button id="calExp">${MKR.ui.icon('download')} Export .ics</button>
                <button id="calImp">${MKR.ui.icon('inbox')} Import .ics</button>
              </div>
            </details>
          </div></div>

        <div class="cal-bar">
          <button class="btn btn-ghost btn-sm" id="calPrev" aria-label="Previous month">${MKR.ui.icon('chevleft')}</button>
          <b class="cal-title">${monthName(y,m)}</b>
          <button class="btn btn-ghost btn-sm" id="calNext" aria-label="Next month">${MKR.ui.icon('chevright')}</button>
          <button class="btn btn-ghost btn-sm" id="calToday">Today</button>
        </div>

        <div class="cal-grid" role="grid">
          ${DOW.map(d=>`<div class="cal-dow">${d}</div>`).join('')}
          ${cells.map(day=> day===null
            ? `<div class="cal-cell cal-off"></div>`
            : `<div class="cal-cell${day===today?' is-today':''}" data-day="${day}">
                 <button class="cal-day" data-add="${day}" aria-label="Add something on ${day}">${Number(day.slice(8))}</button>
                 <div class="cal-items">${(map[day]||[]).map(chip).join('')}</div>
               </div>`).join('')}
        </div>

        <div class="disclaimer mt16"><span>${MKR.ui.icon('truck')}</span>Deliveries come from the Deliveries page — change a date there and it changes here. Everything else on this calendar is yours.</div>`;

      U.qs('#calPrev',c).onclick = ()=>{ cursor.setMonth(cursor.getMonth()-1); draw(); };
      U.qs('#calNext',c).onclick = ()=>{ cursor.setMonth(cursor.getMonth()+1); draw(); };
      U.qs('#calToday',c).onclick = ()=>{ cursor = new Date(); cursor.setDate(1); draw(); };
      U.qs('#calAdd',c).onclick  = ()=> eventModal({date: today}, draw);
      U.qsa('[data-add]',c).forEach(b=> b.onclick = ()=> eventModal({date:b.dataset.add}, draw));
      U.qsa('[data-ev]',c).forEach(b=> b.onclick = async()=>{
        const e = (await events()).find(x=>x.id===b.dataset.ev);
        if(e) eventModal(e, draw);
      });
      U.qs('#calExp',c).onclick = async()=> exportICS();
      U.qs('#calImp',c).onclick = ()=> importICS(draw);
    }

    // Awaited, not fired: the router checks the pane is non-empty the moment
    // render() resolves and bounces to the dashboard if it isn't.
    return draw();
  }

  async function eventModal(e, after){
    const isNew = !e.id;
    const staff = (await MKR.db.getAll('users')).filter(u=>(u.kitchenId||'k_main')===kid() && !u.offboarded);
    const wrap = U.el(`<div>
      <div class="field"><label>What is it</label>
        <input class="input" id="e_t" value="${U.esc(e.title||'')}" placeholder="e.g. Pest control · Rentokil"></div>
      <div class="row"><div class="field grow"><label>Kind</label><select class="input" id="e_k">
        ${Object.entries(KIND).map(([k,v])=>`<option value="${k}" ${e.kind===k?'selected':''}>${v.label}</option>`).join('')}
      </select></div>
      <div class="field grow"><label>Who is doing it</label>
        <input class="input" id="e_w" list="e_wl" value="${U.esc(e.who||'')}" placeholder="a name, or the company">
        <datalist id="e_wl">${staff.map(u=>`<option value="${U.esc(u.name||'')}">`).join('')}</datalist></div></div>
      <div class="row"><div class="field grow"><label>Date</label>
          <input class="input" id="e_d" type="date" value="${U.esc(e.date||U.todayISO())}"></div>
        <div class="field grow"><label>Time — optional</label>
          <input class="input" id="e_ti" type="time" value="${U.esc(e.time||'')}"></div></div>
      <div class="row"><div class="field grow"><label>Repeat</label><select class="input" id="e_r">
          ${Object.entries(REPEAT).map(([k,v])=>`<option value="${k}" ${(e.repeat||'none')===k?'selected':''}>${v.label}</option>`).join('')}
        </select></div>
        <div class="field grow" id="e_uWrap"><label>Repeat until — optional</label>
          <input class="input" id="e_u" type="date" value="${U.esc(e.until||'')}"></div></div>
      <div class="field"><label>Note — optional</label>
        <input class="input" id="e_n" value="${U.esc(e.note||'')}" placeholder="gate code, what to have ready, who to ring"></div>
    </div>`);
    const syncRepeat = ()=>{ U.qs('#e_uWrap',wrap).style.display = U.qs('#e_r',wrap).value==='none' ? 'none' : ''; };
    U.qs('#e_r',wrap).onchange = syncRepeat; syncRepeat();

    const actions = [{label:'Save', class:'btn-dark', onClick:async(close)=>{
      const title = U.qs('#e_t',wrap).value.trim();
      if(!title){ U.toast('Give it a name','red'); return; }
      await save({id:e.id, title, kind:U.qs('#e_k',wrap).value, who:U.qs('#e_w',wrap).value.trim(),
        date:U.qs('#e_d',wrap).value || U.todayISO(), time:U.qs('#e_ti',wrap).value,
        repeat:U.qs('#e_r',wrap).value, until:U.qs('#e_r',wrap).value==='none' ? '' : U.qs('#e_u',wrap).value,
        note:U.qs('#e_n',wrap).value.trim()});
      close(); U.toast(isNew?'Added to the calendar':'Saved','green'); after();
    }}];
    if(!isNew) actions.unshift({label:'Delete', class:'btn-ghost', onClick:async(close)=>{
      if(!(await U.confirm('Delete', `Remove "${e.title}" from the calendar?`, {ok:'Delete', danger:true}))) return;
      await remove(e.id); close(); U.toast('Removed','amber'); after();
    }});
    U.modal(isNew?'Add to the calendar':'Edit', wrap, {actions});
  }

  async function exportICS(){
    const list = await events();
    // Deliveries go out too — the point of exporting is that the phone calendar
    // shows the same week the app does.
    const dels = (await MKR.deliveries.all()).filter(d=>d.status!=='rejected').map(d=>({
      id:d.id, title:(d.supplierName||'Delivery')+' delivery', date:dayOfDelivery(d), time:'', repeat:'none',
      who:'', note:d.docketNo?('Docket '+d.docketNo):''}));
    if(!list.length && !dels.length){ U.toast('Nothing on the calendar to export','amber'); return; }
    let venue = ''; try{ venue = ((await MKR.db.get('kitchens', kid()))||{}).name || ''; }catch(err){}
    U.download(`calendar-${U.todayISO()}.ics`, toICS(list.concat(dels), venue), 'text/calendar;charset=utf-8');
    U.toast(`Exported ${list.length+dels.length} entries`,'green');
  }

  function importICS(after){
    const input = U.el('<input type="file" accept=".ics,text/calendar" hidden>');
    document.body.appendChild(input);
    input.onchange = ()=>{
      const f = input.files[0]; input.remove();
      if(!f) return;
      const r = new FileReader();
      r.onload = async()=>{
        const found = fromICS(r.result);
        if(!found.length){ U.toast('No events found in that file','amber'); return; }
        // Same title on the same day = the file has been imported before. Adding
        // it twice is the one thing an import must not do.
        const have = await events();
        let added = 0;
        for(const e of found){
          if(have.some(x=> x.title===e.title && x.date===e.date)) continue;
          await save(e); added++;
        }
        U.toast(added ? `Imported ${added} of ${found.length}` : 'Already imported — nothing new', added?'green':'amber');
        after();
      };
      r.readAsText(f);
    };
    input.click();
  }

  MKR.calendar = { render, events, save, remove, occurrences, toICS, fromICS, KIND, REPEAT };
})();
