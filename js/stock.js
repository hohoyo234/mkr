/* ===== Stock, ingredient costs, suppliers & purchases =====
   Raw materials and consumable tools — what you hold, what it cost, who you buy
   it from, and how fast it's going.

   Two kinds of item:
     · perishable — food that goes off (shelf life, expiry warnings)
     · durable    — tools/consumables that don't (chopsticks, containers, gloves)

   There is NO point-of-sale in this app, so usage is never deducted per dish.
   Instead consumption is DERIVED from what actually happened in the venue:

       used between two stocktakes = counted(before) + purchased in between − counted(now)

   That is the honest, POS-free number. With two or more counts the forecast page
   shows daily usage, days of cover and a suggested order; before that it says so
   rather than inventing a figure.

   Money here is purchase cost only — what you paid a supplier. The app does no
   payroll, no sales, no reconciliation and no tax.

   Tables: inventory (items) · suppliers · purchases · stocktakes
*/
window.MKR = window.MKR || {};
(function(){
  const U = MKR.util;
  const DAY = 864e5;

  function kid(){ const s=MKR.auth&&MKR.auth.current&&MKR.auth.current(); return (s&&s.kitchenId)||'k_main'; }
  function me(){ const s=MKR.auth&&MKR.auth.current&&MKR.auth.current(); return (s&&s.name)||'—'; }
  const mineOf = async (t)=> (await MKR.db.getAll(t)).filter(r=>(r.kitchenId||'k_main')===kid());

  const KIND = {
    perishable:{label:'Perishable', em:'🥬', hint:'Goes off — has a shelf life'},
    durable:   {label:'Non-perishable', em:'🥢', hint:"Doesn't go off — tools & consumables"},
  };

  // ---------- items ----------
  async function items(){ return (await mineOf('inventory')).filter(r=>!r.archived); }
  async function suppliers(){ return (await mineOf('suppliers')).filter(r=>!r.archived); }
  async function purchases(){ return (await mineOf('purchases')).sort((a,b)=>(b.ts||0)-(a.ts||0)); }
  async function stocktakes(){ return (await mineOf('stocktakes')).sort((a,b)=>(b.ts||0)-(a.ts||0)); }

  async function saveItem(p){
    const row = {
      kind:'perishable', unit:'kg', qty:0, safety:0, price:0, priceHistory:[],
      supplierId:null, shelfLifeDays:null, leadTimeDays:2, kitchenId:kid(), ...p
    };
    if(!row.id) row.id = U.uid('itm');
    return MKR.db.put('inventory', row);
  }
  async function removeItem(id){ await MKR.db.put('inventory',{id, archived:true}); }

  // Record a new unit price, keeping an audit trail of every change so the price
  // trend (▲ / ▼) is real history rather than a guess.
  function pushPrice(item, price, supplierId, note){
    const p = U.round2(price);
    const hist = (item.priceHistory||[]).slice();
    const last = hist[hist.length-1];
    if(!last || U.round2(last.price)!==p) hist.push({ts:Date.now(), price:p, supplierId:supplierId||null, note:note||''});
    return hist.slice(-40);   // keep the last 40 changes per item
  }
  // Latest price move: {dir:'up'|'down'|'flat', pct, from, to, ts}
  function priceMove(item){
    const h = item.priceHistory||[];
    if(h.length<2) return {dir:'flat', pct:0, from:null, to:(h[0]||{}).price ?? item.price, ts:(h[0]||{}).ts};
    const to=h[h.length-1], from=h[h.length-2];
    const pct = from.price ? (to.price-from.price)/from.price*100 : 0;
    return { dir: to.price>from.price?'up':(to.price<from.price?'down':'flat'), pct, from:from.price, to:to.price, ts:to.ts };
  }
  function moveBadge(item){
    const m = priceMove(item);
    if(m.dir==='flat') return `<span class="pill ghost">— steady</span>`;
    const up = m.dir==='up';
    return `<span class="pill ${up?'danger':'ok'}" title="${U.money(m.from)} → ${U.money(m.to)} · ${U.fmtDate(m.ts)}">${up?'▲':'▼'} ${Math.abs(m.pct).toFixed(1)}%</span>`;
  }

  const lineAmount = (qty, price)=> U.round2((+qty||0)*(+price||0));
  const itemValue  = (it)=> lineAmount(it.qty, it.price);
  async function totalValue(){ return U.round2((await items()).reduce((t,i)=>t+itemValue(i),0)); }

  // ---------- usage derived from stocktakes + purchases (no POS) ----------
  // Returns {daily, days, samples} — samples is how many count-to-count intervals
  // we had to work with. samples===0 means "we genuinely don't know yet".
  async function usageOf(itemId, allTakes, allPurch){
    const takes = (allTakes||await stocktakes())
      .filter(t=>(t.lines||[]).some(l=>l.itemId===itemId))
      .sort((a,b)=>(a.ts||0)-(b.ts||0));
    if(takes.length<2) return {daily:0, days:0, samples:0};
    const purch = allPurch||await purchases();
    let used=0, days=0, samples=0;
    for(let i=1;i<takes.length;i++){
      const a=takes[i-1], b=takes[i];
      const spanDays=(b.ts-a.ts)/DAY;
      if(spanDays<=0.2 || spanDays>90) continue;                 // ignore same-day or stale gaps
      const before=(a.lines.find(l=>l.itemId===itemId)||{}).counted||0;
      const now   =(b.lines.find(l=>l.itemId===itemId)||{}).counted||0;
      const bought = purch.filter(p=>p.ts>a.ts && p.ts<=b.ts)
        .reduce((t,p)=>t+(p.lines||[]).filter(l=>l.itemId===itemId).reduce((q,l)=>q+(+l.qty||0),0),0);
      const u = before + bought - now;
      if(u<0) continue;                                          // a miscount — skip rather than distort
      used+=u; days+=spanDays; samples++;
    }
    if(!samples || days<=0) return {daily:0, days:0, samples:0};
    return { daily:U.round2(used/days), days:U.round2(days), samples };
  }

  // One row per item enriched with cost, usage, cover and its warning state.
  async function overview(){
    const [its, takes, purch, sups] = await Promise.all([items(), stocktakes(), purchases(), suppliers()]);
    const out=[];
    for(const it of its){
      const use = await usageOf(it.id, takes, purch);
      const daily = use.samples ? use.daily : (+it.avgDailyUse||0);
      const cover = daily>0 ? U.round2((+it.qty||0)/daily) : null;
      const lastBuy = purch.find(p=>(p.lines||[]).some(l=>l.itemId===it.id));
      const expiresAt = (it.kind==='perishable' && it.shelfLifeDays && lastBuy) ? lastBuy.ts + it.shelfLifeDays*DAY : null;
      out.push({
        ...it,
        value: itemValue(it),
        move: priceMove(it),
        daily, cover, usageSamples:use.samples,
        supplier: sups.find(s=>s.id===it.supplierId) || null,
        lastBuyTs: lastBuy ? lastBuy.ts : null,
        expiresAt,
        low: (+it.qty||0) <= (+it.safety||0),
        short: cover!=null && cover <= (+it.leadTimeDays||2),
        expiring: expiresAt!=null && expiresAt - Date.now() < 2*DAY,
      });
    }
    return out.sort((a,b)=>{
      const rank=(r)=> (r.low||r.expiring)?0:(r.short?1:2);
      return rank(a)-rank(b) || String(a.name).localeCompare(String(b.name));
    });
  }

  // Warnings only — this never blocks anything, it just raises an alert.
  async function scanWarnings(){
    for(const r of await overview()){
      if(r.low) await MKR.alerts.raise({key:'lowstock-'+r.id, level:'amber', type:'stock',
        title:'Low stock', desc:`${r.name} is down to ${r.qty} ${r.unit||''} (reorder at ${r.safety})`});
      else if(r.expiring) await MKR.alerts.raise({key:'expiry-'+r.id, level:'amber', type:'stock',
        title:'Use it or lose it', desc:`${r.name} is near the end of its ${r.shelfLifeDays}-day shelf life`});
    }
  }

  // ---------- purchases ----------
  // Saving a purchase moves stock in, updates each item's unit price and appends
  // to its price history — that's where the ▲▼ trend comes from.
  async function savePurchase(p){
    const lines = (p.lines||[]).filter(l=>l.itemId && (+l.qty||0)>0);
    const total = U.round2(lines.reduce((t,l)=>t+lineAmount(l.qty,l.unitPrice),0));
    const row = await MKR.db.put('purchases', {
      id:p.id||U.uid('pur'), ts:p.ts||Date.now(), supplierId:p.supplierId||null,
      invoiceNo:p.invoiceNo||'', note:p.note||'', by:p.by||me(),
      lines: lines.map(l=>({...l, qty:+l.qty, unitPrice:U.round2(l.unitPrice), amount:lineAmount(l.qty,l.unitPrice)})),
      total, kitchenId:kid()
    });
    const all = await items();
    for(const l of row.lines){
      const it = all.find(x=>x.id===l.itemId); if(!it) continue;
      await MKR.db.put('inventory', {
        id: it.id,
        qty: U.round2((+it.qty||0) + l.qty),
        price: l.unitPrice,
        priceHistory: pushPrice(it, l.unitPrice, row.supplierId, row.invoiceNo?('inv '+row.invoiceNo):''),
        supplierId: row.supplierId || it.supplierId,
      });
    }
    try{ await MKR.audit.log({action:'stock.purchase', desc:`Recorded purchase · ${row.lines.length} item(s)`, amount:total}); }catch(e){}
    return row;
  }

  // ---------- stocktake ----------
  async function saveStocktake(lines, note){
    const all = await items();
    const rows = lines.filter(l=>l.counted!=null && l.counted!=='').map(l=>{
      const it=all.find(x=>x.id===l.itemId)||{};
      return {itemId:l.itemId, name:it.name||'', counted:U.round2(l.counted), expected:U.round2(it.qty||0),
              diff:U.round2((+l.counted||0)-(+it.qty||0))};
    });
    if(!rows.length) return null;
    const row = await MKR.db.put('stocktakes', {id:U.uid('stk'), ts:Date.now(), by:me(), note:note||'', lines:rows, kitchenId:kid()});
    for(const l of rows) await MKR.db.put('inventory', {id:l.itemId, qty:l.counted, lastCountAt:row.ts});
    try{ await MKR.audit.log({action:'stock.count', desc:`Stocktake · ${rows.length} item(s) counted`}); }catch(e){}
    await scanWarnings();
    return row;
  }

  MKR.stock = {
    KIND, items, suppliers, purchases, stocktakes, overview, usageOf,
    saveItem, removeItem, savePurchase, saveStocktake,
    priceMove, moveBadge, itemValue, lineAmount, totalValue, scanWarnings,
    render: (c, opts)=> MKR.stockView.render(c, opts),
  };
})();
