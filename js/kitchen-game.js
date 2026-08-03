/* ===== Kitchen · Room view (the space, not the list) =====
   The same daily checklist rows as the list — drawn as the kitchen they happen
   in. Every job sits at the station where someone actually does it: the range,
   the prep bench, the cold room, the sink, the floor. A red dot on a station is
   a job still outstanding; the station goes green when its dots are gone.

   Same rule as the shelf view: this is a picture of the data, not a game. No
   points, no levels, nobody to walk around. Tap the station, tick the job, and
   it writes to exactly the same `tasks` records the staff and manager lists use.
*/
window.MKR = window.MKR || {};
(function(){
  const U = MKR.util;

  // Where each job happens. First match wins, so the specific patterns sit
  // above the general ones ("deep clean the fridge" is a fridge job, not a
  // cleaning job). Names are typed by the venue, in English or Chinese.
  const STATIONS = [
    {id:'fridge', em:'🧊', name:'Fridges & cold room', note:'Temperatures and stock',
     re:/fridge|freezer|chiller|cold\s*room|冰箱|冷藏|冷冻|冷庫|冷凍/i},
    {id:'range',  em:'🔥', name:'Range & hood',        note:'Stove, oven, fryer, filters',
     re:/stove|range|hood|oven|grill|fryer|burner|filter|灶|炉|爐|烤箱|油烟|抽油煙|炸/i},
    {id:'prep',   em:'🔪', name:'Prep bench',          note:'Prep, portioning, labels',
     re:/prep|chop|cut|portion|marinat|dough|label|备料|備料|切配|分装|分裝|贴标|貼標/i},
    {id:'sink',   em:'🚰', name:'Sink & dishes',       note:'Washing up and glassware',
     re:/sink|dish|wash|glass|sanitis|sanitiz|洗|水槽|消毒/i},
    {id:'floor',  em:'🧹', name:'Floor & bins',        note:'Mopping, rubbish, deep clean',
     re:/floor|mop|sweep|bin|rubbish|waste|trash|clean|地|拖|扫|掃|垃圾|清洁|清潔/i},
    {id:'pass',   em:'🍽️', name:'Pass & everything else', note:'Whatever is left on the list',
     re:null},
  ];

  const stationOf = (t)=> (STATIONS.find(s=> s.re && s.re.test(String(t.name||''))) || STATIONS[STATIONS.length-1]).id;

  // A temperature check has to record the reading, not just a tick — same rule
  // the staff checklist applies, kept in one place so both agree.
  const needsValue = (t)=> /temperature|温度|溫度/i.test(String(t.name||''));

  async function load(){
    return (await MKR.db.getAll('tasks')).filter(t=>t.date===U.todayISO());
  }

  function stationHtml(s, list){
    const open = list.filter(t=>!t.done).length;
    const clear = !open;
    // One dot per job, so the size of the pile is visible without reading a number.
    const dots = list.slice(0,8).map(t=>`<i class="kv-dot${t.done?' done':''}"></i>`).join('');
    return `<button class="kv-st ${clear?'clear':'live'}" data-st="${s.id}"
        aria-label="${U.esc(s.name)} — ${open} still to do">
      <span class="kv-st-badge${clear?' ok':''}">${clear?'✓':open}</span>
      <span class="kv-st-em">${s.em}</span>
      <b>${s.name}</b>
      <small>${s.note}</small>
      <span class="kv-dots">${dots}</span>
    </button>`;
  }

  // opts: {tasks, reload}
  async function render(c, opts){
    const o = opts || {};
    const tasks = o.tasks || await load();
    const reload = o.reload || (()=> render(c, {}));

    const byStation = {};
    STATIONS.forEach(s=> byStation[s.id] = []);
    tasks.forEach(t=> byStation[stationOf(t)].push(t));

    const open = tasks.filter(t=>!t.done).length;
    const done = tasks.length - open;

    c.innerHTML = `
      <div class="kv">
        <div class="kv-top">
          <div class="kv-top-num ${open?'hot':''}"><b>${open}</b><i>still to do</i></div>
          <div class="kv-top-num"><b>${done} / ${tasks.length}</b><i>ticked off today</i></div>
        </div>
        <div class="kv-room">
          <div class="kv-room-label"><span>Your kitchen</span><small>Tap the station you're standing at</small></div>
          <div class="kv-stations">
            ${STATIONS.filter(s=> byStation[s.id].length).map(s=>stationHtml(s, byStation[s.id])).join('')}
          </div>
        </div>
        ${tasks.length ? `<div class="kv-hint">Every tick writes to the same checklist the kitchen sees on their phone.</div>`
          : `<div class="tiles-empty">No tasks published for today yet.</div>`}
      </div>`;

    U.qsa('[data-st]', c).forEach(b=> b.onclick = ()=>{
      const s = STATIONS.find(x=>x.id===b.dataset.st);
      stationSheet(s, byStation[s.id], reload);
    });
  }

  // ---------- one station ----------
  function stationSheet(s, list, reload){
    const wrap = U.el(`<div><div class="list kv-list" id="kvList"></div>
      <div class="disclaimer mt12"><span>📋</span>Ticking here is the same action as ticking on the phone — it records who did it and when.</div>
    </div>`);
    const el = U.qs('#kvList', wrap);

    function draw(){
      el.innerHTML = list.map(t=>`<div class="li" data-row="${t.id}">
        <div class="kv-tick${t.done?' on':''}">✓</div>
        <div class="meta"><b>${U.esc(t.name)}</b>
          <span>${t.done ? `${U.esc(t.by||'someone')}${t.value?' · '+U.esc(t.value):''} · done` : 'Not done yet'}</span></div>
        ${t.photo?`<img class="thumb" src="${t.photo}" alt="">`:''}
      </div>`).join('');
      U.qsa('[data-row]', el).forEach(row=> row.onclick = ()=> toggle(row.dataset.row));
    }

    async function toggle(id){
      const t = list.find(x=>x.id===id); if(!t) return;
      const me = (MKR.auth.current()||{}).name;

      if(!t.done && needsValue(t)){
        const f = U.el(`<div class="field"><label>Record temperature (°C)</label>
          <input class="input" id="kv_v" type="number" step="0.1" placeholder="e.g. 3.5"></div>`);
        U.modal('Temperature check', f, {actions:[{label:'Record & complete', class:'btn-dark', onClick:async(close)=>{
          const v = U.qs('#kv_v', f).value;
          if(v===''){ U.toast('Type the reading','amber'); return; }
          await MKR.db.put('tasks', {id, done:true, by:me, value:v+'°C'});
          Object.assign(t, {done:true, by:me, value:v+'°C'});
          close(); draw(); reload(); U.toast('Recorded','green');
        }}]});
        return;
      }

      const now = !t.done;
      await MKR.db.put('tasks', {id, done:now, by: now?me:null});
      Object.assign(t, {done:now, by: now?me:null});
      // Repaint the room behind the sheet too, so the badge and the dots are
      // already right whichever way the sheet gets closed.
      draw(); reload();
    }

    draw();
    U.modal(`${s.em} ${s.name}`, wrap, {actions:[
      {label:'Done', class:'btn-dark', onClick:(close)=>{ close(); }},
    ]});
  }

  MKR.kitchenGame = { render, STATIONS, stationOf };
})();
