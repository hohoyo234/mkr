/* ===== Daily takings — the denominator =====
   Everything else in this app measures what the venue SPENT. Without what it
   took, none of those numbers mean anything: $4,000 of food is either fine or a
   disaster depending on a figure the app never asked for.

   So it asks for the smallest thing that works — cash, card, covers, once a day
   at close — and nothing else. No POS integration on purpose: a till gets
   replaced every few years and an integration would make this app die with it.

   Food cost % here is purchases over takings for the same window. That is what
   the venue BOUGHT, not what it used (usage needs two stocktakes and is on the
   stock page). Over a week or a month the two converge; over one day they do
   not, which is why the ratios are only shown on a range.
*/
window.MKR = window.MKR || {};
(function(){
  const U = MKR.util;
  const kid = ()=> (MKR.auth.current()&&MKR.auth.current().kitchenId)||'k_main';
  const me  = ()=> (MKR.auth.current()&&MKR.auth.current().name)||'—';

  // One row per venue per day: re-entering a day corrects it rather than
  // stacking a second row on top of the first.
  const idFor = (date)=> `tk_${kid()}_${date}`;
  const total = (r)=> U.round2((+((r||{}).cash)||0) + (+((r||{}).card)||0));

  const mine = async ()=> (await MKR.db.getAll('takings')).filter(r=>(r.kitchenId||'k_main')===kid());
  const forDay = async (date)=> (await MKR.db.get('takings', idFor(date))) || null;

  // Last `days` calendar days, newest first, with the empty days left out.
  async function recent(days=14){
    const from = U.isoDate(Date.now()-(days-1)*864e5);
    return (await mine()).filter(r=>r.date>=from).sort((a,b)=>b.date.localeCompare(a.date));
  }

  async function save({date, cash, card, covers, note}){
    const row = await MKR.db.put('takings', {
      id: idFor(date), date, cash:+cash||0, card:+card||0, covers:+covers||0,
      note: note||'', by: me(), kitchenId: kid(),
    });
    try{ await MKR.audit.log({action:'takings.record', desc:`Takings for ${date}`, amount:total(row)}); }catch(e){}
    return row;
  }

  // What the window is worth, and what it cost to buy. Purchases are matched on
  // the same dates so the ratio can't quietly compare a week to a month.
  async function summary(days=14){
    const rows = await recent(days);
    // Dockets are matched to the days that were actually ENTERED, not to the
    // whole window: one day of takings against a fortnight of deliveries reads
    // as a 98% food cost, which is not a bad week, it is a mismatched divisor.
    const entered = new Set(rows.map(r=>r.date));
    let purchases = [];
    try{ purchases = (await MKR.stock.purchases()).filter(p=>entered.has(U.isoDate(p.ts))); }catch(e){}
    const revenue = U.round2(rows.reduce((t,r)=>t+total(r),0));
    const covers  = rows.reduce((t,r)=>t+(+r.covers||0),0);
    const spend   = U.round2(purchases.reduce((t,p)=>t+(+p.total||0),0));
    return {
      rows, days, revenue, covers, spend,
      avg:      covers ? U.round2(revenue/covers) : null,
      foodPct:  revenue ? U.round2(spend/revenue*100) : null,
      counted:  rows.length,                       // days actually entered
    };
  }

  // ---------- entry ----------
  function modal(date, after){
    date = date || U.todayISO();
    forDay(date).then(existing=>{
      const r = existing || {};
      const wrap = U.el(`<div>
        <div class="field"><label>Which day</label>
          <input class="input" id="tk_d" type="date" value="${date}" max="${U.todayISO()}"></div>
        <div class="row">
          <div class="field grow"><label>Cash</label>
            <input class="input" id="tk_cash" type="number" min="0" step="0.01" value="${r.cash!=null?r.cash:''}" placeholder="0.00"></div>
          <div class="field grow"><label>Card / EFTPOS</label>
            <input class="input" id="tk_card" type="number" min="0" step="0.01" value="${r.card!=null?r.card:''}" placeholder="0.00"></div>
        </div>
        <div class="row">
          <div class="field grow"><label>Covers (customers served)</label>
            <input class="input" id="tk_cov" type="number" min="0" step="1" value="${r.covers||''}" placeholder="e.g. 84"></div>
          <div class="field grow"><label>Total</label>
            <input class="input" id="tk_tot" value="${U.money(total(r))}" disabled></div>
        </div>
        <div class="field"><label>Note (optional)</label>
          <input class="input" id="tk_note" value="${U.esc(r.note||'')}" placeholder="e.g. function of 30 in the back room"></div>
        <div class="disclaimer mt12"><span>${MKR.ui.icon('receipt')}</span>Your own figure off the till, typed once. Nothing here is sent to the ATO or used to calculate pay — it exists so the app can tell you what your food and labour actually cost as a share of what you took.</div>
      </div>`);

      const recalc = ()=>{ U.qs('#tk_tot',wrap).value =
        U.money((Number(U.qs('#tk_cash',wrap).value)||0) + (Number(U.qs('#tk_card',wrap).value)||0)); };
      U.qs('#tk_cash',wrap).addEventListener('input', recalc);
      U.qs('#tk_card',wrap).addEventListener('input', recalc);
      // Switching the day loads that day's figures rather than overwriting them
      // with whatever is on screen — a Monday correction must not eat Sunday.
      U.qs('#tk_d',wrap).addEventListener('change', async(e)=>{
        const d = e.target.value; if(!d) return;
        const x = (await forDay(d)) || {};
        U.qs('#tk_cash',wrap).value = x.cash!=null?x.cash:'';
        U.qs('#tk_card',wrap).value = x.card!=null?x.card:'';
        U.qs('#tk_cov',wrap).value  = x.covers||'';
        U.qs('#tk_note',wrap).value = x.note||'';
        recalc();
      });

      U.modal(existing?'Correct the day’s takings':'Takings at close', wrap, {actions:[
        {label:'Cancel', class:'btn-ghost', onClick:c=>c()},
        {label:'Save', class:'btn-dark', onClick:async(close)=>{
          const d = U.qs('#tk_d',wrap).value || date;
          const cash = Number(U.qs('#tk_cash',wrap).value)||0;
          const card = Number(U.qs('#tk_card',wrap).value)||0;
          if(cash<0 || card<0) return U.toast('Takings can’t be negative','red');
          if(!cash && !card)   return U.toast('Type what the till says','amber');
          await save({date:d, cash, card, covers:U.qs('#tk_cov',wrap).value, note:U.qs('#tk_note',wrap).value.trim()});
          close(); U.toast('Takings recorded','green'); if(after) after();
        }},
      ]});
    });
  }

  // ---------- page ----------
  async function render(c){
    let days = 14;

    async function draw(){
      const s = await summary(days);
      const today = await forDay(U.todayISO());
      c.innerHTML = `
        <div class="section-head"><div><h2>Takings &amp; covers</h2>
          <p>What the till took, typed once a day — the number every cost in this app is measured against</p></div>
          <div class="row gap8 wrap center">
            <div class="viewswitch" role="group" aria-label="How far back">
              ${[7,14,30].map(d=>`<button class="${days===d?'on':''}" data-days="${d}">${d} days</button>`).join('')}
            </div>
            <button class="btn btn-dark btn-sm" id="tkNew" data-new>${MKR.ui.icon('plus')} Enter takings</button>
          </div></div>

        ${today ? '' : `<div class="alert amber"><span>${MKR.ui.icon('warning')}</span>
          <div><b>Today isn’t entered yet.</b> Do it at close — it takes about twenty seconds.</div></div>`}

        <div class="grid g4 mt16">
          <div class="card stat"><div class="k">Taken · last ${s.days} days</div><div class="v">${U.money0(s.revenue)}</div>
            <div class="faint">${s.counted} day${s.counted===1?'':'s'} entered</div></div>
          <div class="card stat"><div class="k">Covers</div><div class="v">${s.covers||'—'}</div>
            <div class="faint">${s.avg!=null?U.money(s.avg)+' a head':'enter covers to see spend a head'}</div></div>
          <div class="card stat"><div class="k">Bought · same days</div><div class="v">${U.money0(s.spend)}</div>
            <div class="faint">dockets dated on the days you entered</div></div>
          <div class="card stat"><div class="k">Food cost</div>
            <div class="v" style="${s.foodPct!=null && s.foodPct>38 ? 'color:var(--red)' : ''}">${s.foodPct!=null?s.foodPct+'%':'—'}</div>
            <div class="faint">${s.foodPct!=null?'of what you took':'needs takings and dockets'}</div></div>
        </div>

        <div class="section-title mt24">Day by day</div>
        <div class="card" style="padding:6px 18px" id="tkList"></div>

        <div class="disclaimer mt16"><span>${MKR.ui.icon('receipt')}</span>Food cost here is what you BOUGHT on the days you entered, not what you used — one big delivery still swings a short window, so read it over a month rather than a night. What you actually USED comes from stocktakes, on the Stock page.</div>`;

      const list = U.qs('#tkList',c);
      list.innerHTML = s.rows.length ? s.rows.map(r=>`<div class="li clickable" data-day="${r.date}">
          <div class="ava">${MKR.ui.icon('receipt')}</div>
          <div class="meta"><b>${U.fmtDate(new Date(r.date+'T00:00:00'))} · ${U.money(total(r))}</b>
            <span>${U.money(r.cash||0)} cash · ${U.money(r.card||0)} card${r.covers?` · ${r.covers} covers · ${U.money(U.round2(total(r)/r.covers))} a head`:''}${r.note?' · '+U.esc(r.note):''}</span></div>
          <span class="today-act-chev" aria-hidden="true">›</span>
        </div>`).join('')
        : `<div class="empty"><div class="em">${MKR.ui.icon('receipt')}</div><p>Nothing entered yet. Hit “Enter takings” after you cash up tonight — two numbers and you’re done.</p></div>`;

      U.qsa('[data-day]',list).forEach(b=> b.onclick=()=> modal(b.dataset.day, draw));
      U.qsa('[data-days]',c).forEach(b=> b.onclick=()=>{ days = +b.dataset.days; draw(); });
      U.qs('#tkNew',c).onclick = ()=> modal(U.todayISO(), draw);
    }

    await draw();
    MKR.db.on('takings', draw);
  }

  MKR.takings = { forDay, recent, save, summary, total, modal, render };
})();
