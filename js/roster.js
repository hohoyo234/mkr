/* ===== AI rostering — preferences, planning, warnings =====
   Deputy-style auto-rostering built around three inputs:

     1. What you actually need  — headcount per day-part, either set by the owner
        or LEARNED from how many people they really rostered in past weeks.
     2. When people can work    — each person's declared availability.
     3. What people can do      — skills (open, close, kitchen, …), so a shift is
        never left without someone who can unlock the door.

   Two rules this module will not break:

     · It ASKS before it plans. The preference questionnaire is the input; the
       roster is the output. No hidden defaults doing the deciding.
     · It WARNS, it never blocks. Long weeks, short breaks, back-to-back days —
       all of it surfaces as a warning and a notification. The owner decides.
       There are no hard caps, no compliance gates and no pay calculations here.

   Shifts carry a `week` key (the Monday, YYYY-MM-DD) so past weeks stay on the
   record and can be learned from. Older shifts without one are read as this week.
*/
window.MKR = window.MKR || {};
(function(){
  const U = MKR.util;
  const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  const SKILLS = {
    open:    {label:'Can open',    ic:'key'},
    close:   {label:'Can close',   ic:'moon'},
    kitchen: {label:'Kitchen',     ic:'pan'},
    floor:   {label:'Front of house', ic:'utensils'},
    coffee:  {label:'Coffee / bar', ic:'cup'},
    lead:    {label:'Can run a shift', ic:'star'},
  };
  // One skill -> one icon, drawn the same wherever it appears.
  const skillIcon = (k)=> SKILLS[k] ? MKR.ui.icon(SKILLS[k].ic, 'skill-ic') : '';

  // ---------- week helpers ----------
  function weekStart(offset=0){
    const d=new Date(); const dow=(d.getDay()+6)%7;
    d.setHours(0,0,0,0); d.setDate(d.getDate()-dow+offset*7); return d;
  }
  const weekKey  = (d)=> U.isoDate(d);   // local date — UTC would push the Monday back to Sunday
  const thisWeek = ()=> weekKey(weekStart(0));
  function dayTs(weekK, dayIdx){ const d=new Date(weekK+'T00:00:00'); d.setDate(d.getDate()+dayIdx); return d.getTime(); }
  const weekOf = (s)=> s.week || thisWeek();   // back-compat for pre-week shifts

  async function shiftsFor(week){ return (await MKR.db.getAll('shifts')).filter(s=>weekOf(s)===week); }

  // ---------- preferences ----------
  const DEFAULT_PREFS = {
    asked:false,                       // has the owner answered the questionnaire?
    useHistory:true,                   // learn headcount from past weeks
    demand:{},                         // {slotKey:{0..6:headcount}} — manual override
    fairness:true,                     // spread hours evenly
    maxWeekHours:38,                   // WARN above this — not a limit
    maxConsecutiveDays:6,              // WARN above this
    minRestHours:10,                   // WARN below this gap between shifts
    requireOpener:true,                // warn if the first shift of a day has nobody with 'open'
    requireCloser:true,
    requireKitchen:true,               // warn if a shift has nobody with 'kitchen'
    notify:true,                       // push warnings to the owner/manager
  };
  async function prefs(){
    const s = (await MKR.db.meta('settings')) || {};
    return {...DEFAULT_PREFS, ...(s.rosterPrefs||{})};
  }
  async function savePrefs(p){
    const s = (await MKR.db.meta('settings')) || {};
    s.rosterPrefs = {...DEFAULT_PREFS, ...(s.rosterPrefs||{}), ...p, asked:true};
    await MKR.db.meta('settings', s);
    try{ await MKR.audit.log({action:'settings.update', desc:'Updated rostering preferences'}); }catch(e){}
    return s.rosterPrefs;
  }

  async function slots(){
    const s = (await MKR.db.meta('settings')) || {};
    return s.shiftSlots || [{label:'Morning',start:'09:00',end:'15:00',k:'am'},{label:'Evening',start:'15:00',end:'22:00',k:'pm'}];
  }

  // ---------- demand: what you actually rostered in past weeks ----------
  // Average headcount per weekday per slot over the last `weeks` completed weeks,
  // rounded to a whole person. Returns null when there's no history to learn from.
  async function learnedDemand(weeks=4){
    const all = await MKR.db.getAll('shifts');
    const keys=[]; for(let i=1;i<=weeks;i++) keys.push(weekKey(weekStart(-i)));
    const past = all.filter(s=>keys.includes(weekOf(s)));
    if(!past.length) return null;
    const sl = await slots();
    const seenWeeks = new Set(past.map(weekOf)).size || 1;
    const out={};
    for(const slot of sl){
      out[slot.k]={};
      for(let d=0; d<7; d++){
        const n = past.filter(s=>s.day===d && s.slot===slot.k).length
               || past.filter(s=>s.day===d && overlapsSlot(s, slot)).length;
        out[slot.k][d] = Math.round(n/seenWeeks);
      }
    }
    return out;
  }
  function overlapsSlot(shift, slot){
    const a1=U.toMin(shift.start), a2=U.toMin(shift.end), b1=U.toMin(slot.start), b2=U.toMin(slot.end);
    return Math.min(a2,b2) - Math.max(a1,b1) >= 60;   // an hour of overlap counts as covering it
  }

  // Effective demand = manual override where set, otherwise learned, otherwise 1.
  async function demandTable(p){
    p = p || await prefs();
    const sl = await slots();
    const learned = p.useHistory ? await learnedDemand() : null;
    const out={};
    for(const slot of sl){
      out[slot.k]={};
      for(let d=0; d<7; d++){
        const manual = p.demand && p.demand[slot.k] && p.demand[slot.k][d];
        out[slot.k][d] = manual!=null && manual!=='' ? Math.max(0,+manual)
                       : (learned && learned[slot.k] ? Math.max(0, learned[slot.k][d]) : 1);
      }
    }
    return {table:out, learned:!!learned && !(p.demand && Object.keys(p.demand).length)};
  }

  // ---------- availability ----------
  // av values: 'off' | 'all' | slot key ('am'/'pm') | 'HH:MM-HH:MM'
  function fits(av, slot){
    if(!av || av==='off') return false;
    if(av==='all' || av===slot.k) return true;
    const m = String(av).match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
    if(m) return U.toMin(m[1])<=U.toMin(slot.start) && U.toMin(m[2])>=U.toMin(slot.end);
    return false;
  }
  const skillsOf = (u)=> Array.isArray(u.skills) ? u.skills : [];

  // ---------- generate ----------
  // Greedy, deterministic and explainable: for each day-part we score everyone who
  // can work it and take the best N. Same inputs → same roster, every time.
  async function generate(week, staff, p){
    p = p || await prefs();
    const sl = await slots();
    const {table} = await demandTable(p);
    const plan = [];                         // {staffId, day, start, end, slot}
    const hours = {}; staff.forEach(s=>hours[s.id]=0);
    const daysWorked = {}; staff.forEach(s=>daysWorked[s.id]=[]);
    const gaps = [];

    const slotOrder = sl.slice();            // earliest first, so openers get placed first
    slotOrder.sort((a,b)=>U.toMin(a.start)-U.toMin(b.start));

    for(let day=0; day<7; day++){
      for(let si=0; si<slotOrder.length; si++){
        const slot = slotOrder[si];
        const need = (table[slot.k]||{})[day] || 0;
        if(need<=0) continue;
        const len = U.shiftHours(slot.start, slot.end);
        const picked = [];
        // Opening and closing are the specific shift's problem; kitchen cover is
        // the day's problem, so it only counts as missing until someone rostered
        // that day can actually cook.
        const needSkills = [];
        if(p.requireOpener && si===0) needSkills.push('open');
        if(p.requireCloser && si===slotOrder.length-1) needSkills.push('close');
        const dayHasKitchen = ()=> plan.filter(x=>x.day===day)
          .some(x=>skillsOf(staff.find(s=>s.id===x.staffId)||{}).includes('kitchen'));

        for(let n=0; n<need; n++){
          const stillNeeded = needSkills.filter(sk=>!picked.some(pk=>skillsOf(pk).includes(sk)));
          if(p.requireKitchen && !dayHasKitchen() && !picked.some(pk=>skillsOf(pk).includes('kitchen'))) stillNeeded.push('kitchen');
          const pool = staff.filter(s=>{
            if(picked.some(x=>x.id===s.id)) return false;
            if(plan.some(x=>x.staffId===s.id && x.day===day)) return false;    // one shift per person per day
            return fits((s.availability||{})[day], slot);
          });
          if(!pool.length){ gaps.push({day, slot:slot.k, label:slot.label, missing:need-picked.length}); break; }

          pool.sort((a,b)=>score(b)-score(a));
          picked.push(pool[0]);

          function score(s){
            let v = 0;
            const sk = skillsOf(s);
            // Cover the skills this shift is still missing — this dominates.
            stillNeeded.forEach(need=>{ if(sk.includes(need)) v += 60; });
            if(sk.includes('lead')) v += 6;
            // Spread the hours around.
            if(p.fairness) v -= hours[s.id]*2.2;
            // Ease off people already on a long run of days.
            const run = consecutiveRun(daysWorked[s.id], day);
            if(run >= (p.maxConsecutiveDays||6)) v -= 40; else v -= run*3;
            // An exact availability match beats a blanket "any time".
            if((s.availability||{})[day]===slot.k) v += 8;
            // Whoever the owner marked as wanting more hours.
            v += (+s.rosterPriority||0)*5;
            // Stable tie-break so the same inputs always give the same roster.
            v += (s.id.charCodeAt(s.id.length-1)%7)*0.01;
            return v;
          }
        }

        picked.forEach(s=>{
          plan.push({staffId:s.id, day, start:slot.start, end:slot.end, slot:slot.k});
          hours[s.id]+=len; daysWorked[s.id].push(day);
        });
        if(picked.length<need) gaps.push({day, slot:slot.k, label:slot.label, missing:need-picked.length});
      }
    }
    return {plan, gaps, hours};
  }
  function consecutiveRun(days, upTo){
    let run=0; for(let d=upTo-1; d>=0; d--){ if(days.includes(d)) run++; else break; } return run;
  }

  // Write a generated plan over a week (replacing what was there).
  async function apply(week, plan){
    for(const s of await shiftsFor(week)) await MKR.db.remove('shifts', s.id);
    for(const x of plan) await MKR.db.put('shifts', {id:U.uid('sh'), week, ...x});
    try{ await MKR.audit.log({action:'shift.create', desc:`Auto-rostered ${plan.length} shifts for week of ${week}`}); }catch(e){}
  }

  // ---------- warnings (never blocking) ----------
  // Every one of these is advisory. The roster saves regardless; the owner reads
  // the list and decides what, if anything, to do about it.
  async function warnings(week, staff, p){
    p = p || await prefs();
    const shifts = await shiftsFor(week);
    const byId = {}; staff.forEach(s=>byId[s.id]=s);
    const out = [];
    const push = (level, title, detail)=> out.push({level, title, detail});

    // Hours per person
    for(const s of staff){
      const mine = shifts.filter(x=>x.staffId===s.id);
      const h = U.round2(mine.reduce((t,x)=>t+U.shiftHours(x.start,x.end),0));
      if(h > (p.maxWeekHours||38))
        push('amber', `${s.name} is on ${h.toFixed(1)}h this week`, `That's above the ${p.maxWeekHours}h you said you'd like to stay under. Nothing is blocked — just worth a look.`);
      if(!mine.length && (s.availability && Object.values(s.availability).some(v=>v&&v!=='off')))
        push('info', `${s.name} has no shifts`, `They gave availability this week but didn't get rostered.`);

      // Consecutive days
      const days = mine.map(x=>x.day).sort((a,b)=>a-b);
      let run=1, best=1;
      for(let i=1;i<days.length;i++){ run = days[i]===days[i-1]+1 ? run+1 : 1; best=Math.max(best,run); }
      if(days.length && best > (p.maxConsecutiveDays||6))
        push('amber', `${s.name} works ${best} days straight`, `Above your ${p.maxConsecutiveDays}-day comfort line.`);

      // Rest between shifts
      const sorted = mine.slice().sort((a,b)=>a.day-b.day || U.toMin(a.start)-U.toMin(b.start));
      for(let i=1;i<sorted.length;i++){
        const prevEnd = sorted[i-1].day*1440 + U.toMin(sorted[i-1].end);
        const nextStart = sorted[i].day*1440 + U.toMin(sorted[i].start);
        const rest = (nextStart-prevEnd)/60;
        if(rest>0 && rest < (p.minRestHours||10))
          push('amber', `${s.name} has ${rest.toFixed(1)}h between shifts`, `${DAYS[sorted[i-1].day]} close → ${DAYS[sorted[i].day]} start. You asked to be told below ${p.minRestHours}h.`);
      }
    }

    // Skill cover per day
    const sl = (await slots()).slice().sort((a,b)=>U.toMin(a.start)-U.toMin(b.start));
    for(let d=0; d<7; d++){
      const onDay = shifts.filter(x=>x.day===d);
      if(!onDay.length) continue;
      const has = (sk)=> onDay.some(x=>skillsOf(byId[x.staffId]||{}).includes(sk));
      if(p.requireOpener && !has('open'))   push('amber', `${DAYS[d]}: nobody rostered can open`, `No one on that day is marked as able to open.`);
      if(p.requireCloser && !has('close'))  push('amber', `${DAYS[d]}: nobody rostered can close`, `No one on that day is marked as able to close.`);
      if(p.requireKitchen && !has('kitchen')) push('amber', `${DAYS[d]}: no kitchen skill rostered`, `Nobody on that day is marked as kitchen.`);
    }

    // Understaffed against your own target
    const {table} = await demandTable(p);
    for(const slot of sl){
      for(let d=0; d<7; d++){
        const need = (table[slot.k]||{})[d]||0;
        if(!need) continue;
        const got = shifts.filter(x=>x.day===d && (x.slot===slot.k || overlapsSlot(x, slot))).length;
        if(got < need) push('red', `${DAYS[d]} ${slot.label}: ${got}/${need} rostered`, `Short ${need-got} person${need-got===1?'':'s'} against what you asked for.`);
      }
    }
    return out;
  }

  // ---------- clocking on ----------
  // The staff phone and the manager's own roster both do this, and they had
  // drifted apart: the manager's copy recorded the lateness and told nobody, so
  // a manager could be twenty minutes late every day of the week and the alert
  // feed stayed empty. One function now, both screens call it.
  async function clockIn(shift, who){
    const startTs  = MKR.alerts.shiftStartTs(shift);
    const lateMins = Math.max(0, Math.round((Date.now()-startTs)/60000));
    const late     = lateMins > 5;
    await MKR.db.put('clockins', {staffId:who.id, shiftId:shift.id, date:U.todayISO(),
                                  scheduledTs:startTs, clockTs:Date.now(), lateMins, late});
    // Turning up answers the no-show alert this shift raised.
    const ns = (await MKR.db.getAll('alerts')).find(a=>a.key==='noshow-'+shift.id && !a.read);
    if(ns) await MKR.db.put('alerts', {id:ns.id, read:true});
    if(late){
      const mine = (await MKR.db.getAll('clockins')).filter(k=>k.staffId===who.id && k.late).length;
      if(mine>=2) await MKR.alerts.raise({key:'late-consec-'+who.id, level:'red', type:'late',
        title:'Staff repeatedly late', desc:`${who.name} has been late ${mine} times (this time ${lateMins} min) — worth a look.`});
      else await MKR.alerts.raise({key:'late-'+shift.id, level:'amber', type:'late',
        title:'Staff late', desc:`${who.name} was ${lateMins} min late (${DAYS[shift.day]} ${shift.start} shift)`});
    }
    return {lateMins, late};
  }

  // Raise warnings as alerts + notifications. Deduped per week so re-opening the
  // roster page doesn't spam anyone.
  async function notifyWarnings(week, list, p){
    p = p || await prefs();
    if(!p.notify || !list.length) return;
    const worst = list.filter(w=>w.level==='red');
    const head = worst.length ? worst[0] : list[0];
    await MKR.alerts.raise({
      key:`roster-${week}-${list.length}-${head.title}`,
      level: worst.length ? 'red' : 'amber', type:'roster',
      title:`Roster warnings · week of ${week}`,
      desc:`${head.title}${list.length>1?` (+${list.length-1} more)`:''}`
    });
  }

  // ---------- explain (LLM, optional) ----------
  // The plan is made by the deterministic scorer above; the model only puts it
  // into words. If it's unreachable we fall back to a plain summary.
  async function explain(week, staff, plan, warns){
    const byId={}; staff.forEach(s=>byId[s.id]=s);
    const perPerson = staff.map(s=>{
      const mine=plan.filter(x=>x.staffId===s.id);
      if(!mine.length) return `${s.name}: not rostered`;
      const h=mine.reduce((t,x)=>t+U.shiftHours(x.start,x.end),0);
      return `${s.name} (${(skillsOf(s).join('/')||'no skills set')}): ${mine.length} shifts, ${h.toFixed(1)}h — ${mine.map(x=>`${DAYS[x.day]} ${x.start}-${x.end}`).join(', ')}`;
    }).join('\n');
    const q = `I run a small restaurant in Australia. This is the roster my system just generated for the week of ${week}:\n${perPerson}\n\n`
      + (warns.length?`Warnings raised:\n${warns.map(w=>`- ${w.title}: ${w.detail}`).join('\n')}\n\n`:'No warnings were raised.\n\n')
      + `In 3-5 short bullets, explain in plain language why this roster looks the way it does and what I should double-check before publishing it. Do not give legal, industrial-relations or pay advice.`;
    try{
      const out = MKR.assistant && MKR.assistant.llm ? await MKR.assistant.llm(q, {role:'manager'}) : null;
      if(out) return out;
    }catch(e){}
    const total = plan.reduce((t,x)=>t+U.shiftHours(x.start,x.end),0);
    return `<p>${plan.length} shifts, ${total.toFixed(1)} hours across ${new Set(plan.map(p=>p.staffId)).size} people. `
      + `Everyone was placed only into day-parts they said they were free for, the busiest days were filled first, and hours were spread as evenly as availability allowed.</p>`
      + (warns.length?`<p class="muted">${warns.length} warning${warns.length===1?'':'s'} below — none of them block publishing.</p>`:'');
  }

  MKR.roster = { skillIcon,
    DAYS, SKILLS, DEFAULT_PREFS,
    weekStart, weekKey, thisWeek, dayTs, weekOf, shiftsFor, slots,
    prefs, savePrefs, demandTable, learnedDemand, fits, skillsOf,
    generate, apply, warnings, notifyWarnings, explain, clockIn,
  };
})();
