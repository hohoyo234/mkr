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
    perishable:{label:'Perishable', ic:'clock', hint:'Goes off — has a shelf life'},
    durable:   {label:'Non-perishable', ic:'utensils', hint:"Doesn't go off — tools & consumables"},
  };

  // ---------- items ----------
  // Every screen dereferences KIND[kind] to draw an icon, so one row with a
  // missing or unrecognised kind takes the whole page down with a TypeError —
  // and rows can arrive from bulk paste, a cloud sync or a partial write, not
  // just from saveItem (which does default it). Coerced once here, on the read
  // every consumer goes through, rather than guarded at seven call sites.
  async function items(){
    return (await mineOf('inventory')).filter(r=>!r.archived)
      .map(r=> KIND[r.kind] ? r : {...r, kind:'perishable'});
  }
  async function suppliers(){ return (await mineOf('suppliers')).filter(r=>!r.archived); }
  async function purchases(){ return (await mineOf('purchases')).sort((a,b)=>(b.ts||0)-(a.ts||0)); }
  async function stocktakes(){ return (await mineOf('stocktakes')).sort((a,b)=>(b.ts||0)-(a.ts||0)); }
  async function wastes(){ return (await mineOf('waste')).sort((a,b)=>(b.ts||0)-(a.ts||0)); }

  async function saveItem(p){
    const row = {
      kind:'perishable', unit:'kg', qty:0, safety:0, price:0, priceHistory:[],
      supplierId:null, shelfLifeDays:null, leadTimeDays:2,
      packLabel:'', packSize:null, category:'', kitchenId:kid(), ...p
    };
    if(!row.id) row.id = U.uid('itm');
    return MKR.db.put('inventory', row);
  }
  async function removeItem(id){ await MKR.db.put('inventory',{id, archived:true}); }

  // ---------- categories: the owner's own shelves ----------
  // Perishable / non-perishable is the APP's rule — it decides whether a shelf
  // life applies and whether an expiry warning can exist. A category is the
  // owner's own word for where a thing lives: "Meat", "Veg", "Dry store",
  // "Packaging". The two are independent and an item is always both, so neither
  // list can be derived from the other and neither replaces the other.
  //
  // The list lives on the kitchen record rather than being inferred from the
  // items, for two reasons: a category has to exist before anything is in it
  // (you make "Seafood" on Monday and stock it on Tuesday), and the order the
  // owner dragged them into is the order they expect to see.
  async function categories(){
    try{
      const k = await MKR.db.get('kitchens', kid());
      const list = (k && k.stockCategories) || [];
      return list.filter(x=>typeof x==='string' && x.trim()).map(x=>x.trim());
    }catch(e){ return []; }
  }
  async function saveCategories(list){
    // De-duplicated case-insensitively: "Veg" and "veg" as two shelves is a
    // typo every time, never an intention.
    const seen = new Set(), out = [];
    (list||[]).forEach(x=>{
      const s = String(x||'').trim(); if(!s) return;
      const k = s.toLowerCase(); if(seen.has(k)) return;
      seen.add(k); out.push(s);
    });
    await MKR.db.put('kitchens', {id:kid(), stockCategories:out});
    return out;
  }
  // Renaming a shelf has to carry its items with it, and removing one must not
  // take the stock with it — the items fall back to uncategorised, which is a
  // state the UI already has to draw anyway.
  async function renameCategory(from, to){
    const f = String(from||'').trim(), t = String(to||'').trim();
    if(!f) return;
    const its = await items();
    for(const it of its){
      if((it.category||'').trim().toLowerCase() === f.toLowerCase()){
        await MKR.db.put('inventory', {id:it.id, category:t});
      }
    }
    const list = await categories();
    await saveCategories(t ? list.map(x=>x.toLowerCase()===f.toLowerCase()?t:x)
                           : list.filter(x=>x.toLowerCase()!==f.toLowerCase()));
  }
  async function moveToCategory(itemIds, category){
    const cat = String(category||'').trim();
    for(const id of (itemIds||[])) await MKR.db.put('inventory', {id, category:cat});
    if(cat){
      const list = await categories();
      if(!list.some(x=>x.toLowerCase()===cat.toLowerCase())) await saveCategories([...list, cat]);
    }
  }

  // ---------- packs: what the supplier sells vs what the kitchen counts ----------
  // A venue counts tomatoes in kg, but the supplier sells them by the 10 kg
  // carton and the docket only ever quotes the carton price. Typing that carton
  // figure into a per-kg field is the quiet way to corrupt everything downstream:
  // stock goes up by 2 instead of 20, and the price page reads $60 against last
  // week's $6 and calls it a 900% rise — a wrong answer that looks reasonable,
  // which is the worst kind.
  //
  // So a pack is a DATA-ENTRY convenience and never a second unit of account.
  // `qty` and `unitPrice` on a line stay in the item's own unit, always, and
  // packLine() below is the single place a pack figure becomes one of them.
  const packSizeOf  = (it)=>{ const n = +(it && it.packSize) || 0; return n>0 ? n : null; };
  const packLabelOf = (it)=> ((it && it.packLabel) || '').trim() || 'pack';
  const unitOf      = (it)=> ((it && it.unit) || '').trim() || 'units';

  // "1 carton = 10 kg" — the sentence every pack input needs sitting under it.
  function packHint(it){
    const n = packSizeOf(it);
    return n ? `1 ${packLabelOf(it)} = ${U.round2(n)} ${unitOf(it)}` : '';
  }

  // A line typed in packs carries packQty/packPrice; this turns them into the
  // qty/unitPrice everything downstream reads, and keeps the pack pair beside
  // them so the docket can be shown back exactly as the paper was written.
  //
  // The conversion is deliberately ONE-WAY. Back-deriving a pack figure from a
  // unit figure would put "2.67 crates" on a docket for tomatoes bought loose at
  // the market — a sentence no supplier ever wrote. The pack pair being present
  // means the paper was written that way; absent means it wasn't.
  //
  // The pack size is SNAPSHOTTED onto the line. A supplier who moves from 10 kg
  // to 12 kg cartons next month must not silently rewrite what last month cost.
  function packLine(l, item){
    const has  = (v)=> v!=null && v!=='';
    if(!has(l.packQty) && !has(l.packPrice)) return {...l};
    const size = +l.packSize>0 ? +l.packSize : packSizeOf(item);
    if(!(size>0)) return {...l};
    const out = {...l, packSize:size,
      packLabel: (l.packLabel || (item && item.packLabel) || '').trim() || 'pack'};
    if(has(l.packQty))   out.qty       = U.round2((+l.packQty||0) * size);
    if(has(l.packPrice)) out.unitPrice = U.round2((+l.packPrice||0) / size);
    return out;
  }

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
  // Every count-to-count interval for one item, with the arithmetic left in the
  // open so the forecast page can show its working:
  //     used = counted last time + bought since − counted this time
  // Intervals that can't be trusted (same-day recounts, months-old gaps, or a
  // miscount that would imply negative usage) are marked skipped rather than
  // quietly dropped — an owner comparing this against their own notes deserves
  // to see why a week isn't in the average.
  async function usageIntervals(itemId, allTakes, allPurch, allWaste){
    const takes = (allTakes||await stocktakes())
      .filter(t=>(t.lines||[]).some(l=>l.itemId===itemId))
      .sort((a,b)=>(a.ts||0)-(b.ts||0));
    if(takes.length<2) return [];
    const purch = allPurch||await purchases();
    const wst = allWaste||await wastes();
    const out=[];
    for(let i=1;i<takes.length;i++){
      const a=takes[i-1], b=takes[i];
      const days=U.round2((b.ts-a.ts)/DAY);
      const before=(a.lines.find(l=>l.itemId===itemId)||{}).counted||0;
      const now   =(b.lines.find(l=>l.itemId===itemId)||{}).counted||0;
      const buys = purch.filter(p=>p.ts>a.ts && p.ts<=b.ts)
        .filter(p=>(p.lines||[]).some(l=>l.itemId===itemId));
      const bought = U.round2(buys.reduce((t,p)=>t+(p.lines||[]).filter(l=>l.itemId===itemId)
        .reduce((q,l)=>q+(+l.qty||0),0),0));
      // Everything that left the shelf: what went into dishes AND what went in
      // the bin. `used` stays the whole figure because that's what you have to
      // replace — the split below is for knowing how much of it was thrown away.
      const used = U.round2(before + bought - now);
      const wasted = U.round2(wst.filter(w=>w.ts>a.ts && w.ts<=b.ts)
        .reduce((t,w)=>t+(w.lines||[]).filter(l=>l.itemId===itemId)
          .reduce((q,l)=>q+(+l.qty||0),0),0));
      const skip = days<=0.2 ? 'counted again the same day'
                 : days>90   ? 'too long a gap to be meaningful'
                 : used<0    ? 'more on the shelf than could have arrived — looks like a miscount'
                 : '';
      out.push({fromTs:a.ts, toTs:b.ts, days, before, bought, now, used,
                // A fat-fingered bin entry can claim more than was ever on the
                // shelf; the shelf clamps at zero, so this has to as well or the
                // page reports negative food cooked.
                wasted, cooked: U.round2(Math.max(0, used-wasted)),
                deliveries:buys.length, skip, daily: skip||days<=0 ? 0 : U.round2(used/days)});
    }
    return out;
  }
  // Returns {daily, days, samples} — samples is how many intervals we had to
  // work with. samples===0 means "we genuinely don't know yet".
  async function usageOf(itemId, allTakes, allPurch, allWaste){
    const rows = (await usageIntervals(itemId, allTakes, allPurch, allWaste)).filter(r=>!r.skip);
    const used = rows.reduce((t,r)=>t+r.used,0), days = rows.reduce((t,r)=>t+r.days,0);
    if(!rows.length || days<=0) return {daily:0, days:0, samples:0};
    return { daily:U.round2(used/days), days:U.round2(days), samples:rows.length };
  }

  // One row per item enriched with cost, usage, cover and its warning state.
  async function overview(){
    const [its, takes, purch, sups, wst] = await Promise.all([items(), stocktakes(), purchases(), suppliers(), wastes()]);
    const out=[];
    for(const it of its){
      const use = await usageOf(it.id, takes, purch, wst);
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

  // ---------- what the shopping actually cost this week ----------
  // The price on the item record is just the last one you paid. The question an
  // owner asks on a Monday is different: "is the same shop getting dearer?"
  //
  // So compare what was PAID, not what was quoted: for each item, the weighted
  // average unit price across every docket in the last 7 days against the same
  // figure for the 7 days before. Weighted, because two crates at $6 and one at
  // $9 is an average of $7, not $7.50.
  //
  // The dollar figure is the one that matters: the price move multiplied by the
  // quantity actually bought this week — what the change did to this week's bill.
  async function priceWatch(days){
    const span = (+days||7)*DAY, now = Date.now();
    const [purch, its, sups] = await Promise.all([purchases(), items(), suppliers()]);
    const win = (from, to)=>{
      const acc = {};
      purch.filter(p=>p.ts>from && p.ts<=to).forEach(p=>(p.lines||[]).forEach(l=>{
        const a = acc[l.itemId] = acc[l.itemId] || {qty:0, spend:0, dockets:0, sup:{}};
        a.qty += (+l.qty||0); a.spend += (+l.amount||0); a.dockets++;
        if(p.supplierId) a.sup[p.supplierId] = (a.sup[p.supplierId]||0) + (+l.amount||0);
      }));
      Object.values(acc).forEach(a=>{ a.avg = a.qty>0 ? U.round2(a.spend/a.qty) : 0; });
      return acc;
    };
    const thisW = win(now-span, now), prevW = win(now-2*span, now-span);

    // The cheapest this item has been bought for lately, and from whom — the
    // answer to "could I have paid less?" without pretending to shop around.
    const best = {};
    purch.filter(p=>p.ts>now-60*DAY).forEach(p=>(p.lines||[]).forEach(l=>{
      const up=+l.unitPrice||0; if(!(up>0)) return;
      const b=best[l.itemId];
      if(!b || up<b.price) best[l.itemId] = {price:up, supplierId:p.supplierId, ts:p.ts};
    }));

    const rows = Object.keys({...thisW, ...prevW}).map(id=>{
      const it = its.find(x=>x.id===id) || {id, name:'(removed item)', unit:''};
      const t = thisW[id], p = prevW[id];
      const thisAvg = t ? t.avg : null, prevAvg = p ? p.avg : null;
      const pct = (thisAvg!=null && prevAvg) ? (thisAvg-prevAvg)/prevAvg*100 : null;
      const b = best[id];
      // Who you actually bought it from — the supplier with the most of this
      // item's spend in whichever window has data.
      const src = t || p || {sup:{}};
      const topSup = Object.keys(src.sup||{}).sort((x,y)=>src.sup[y]-src.sup[x])[0] || null;
      return {
        item: it, name: it.name, unit: it.unit||'',
        thisAvg, prevAvg, pct,
        dir: pct==null ? 'new' : (pct>0.5 ? 'up' : (pct<-0.5 ? 'down' : 'flat')),
        qtyThis: t ? U.round2(t.qty) : 0, spendThis: t ? U.round2(t.spend) : 0,
        qtyPrev: p ? U.round2(p.qty) : 0, spendPrev: p ? U.round2(p.spend) : 0,
        dockets: t ? t.dockets : 0,
        // What the move did to this week's bill, in dollars.
        impact: (thisAvg!=null && prevAvg!=null && t) ? U.round2((thisAvg-prevAvg)*t.qty) : 0,
        supplier: sups.find(s=>s.id===topSup) || null,
        // Only worth raising if it's actually actionable: somebody else sold it
        // cheaper, or the same supplier did recently enough to ask about. A
        // better price from your own supplier a month ago is just history.
        cheapest: (b && thisAvg!=null && b.price < thisAvg*0.97
                   && (b.supplierId!==topSup || (now-b.ts) < 14*DAY))
          ? {...b, supplier: sups.find(s=>s.id===b.supplierId)||null,
             sameSupplier: b.supplierId===topSup,
             saving: U.round2((thisAvg-b.price)*(t?t.qty:0))}
          : null,
      };
    });
    rows.sort((a,b)=> Math.abs(b.impact)-Math.abs(a.impact) || Math.abs(b.pct||0)-Math.abs(a.pct||0));

    const spendThis = U.round2(rows.reduce((t,r)=>t+r.spendThis,0));
    const spendPrev = U.round2(rows.reduce((t,r)=>t+r.spendPrev,0));
    const impact    = U.round2(rows.reduce((t,r)=>t+r.impact,0));
    // Basket move: what this week's shopping would have cost at last week's
    // prices, versus what it did cost. Same basket both times, so it isolates
    // price from "we just bought more".
    const comparable = rows.filter(r=>r.thisAvg!=null && r.prevAvg!=null && r.qtyThis>0);
    const atOld = U.round2(comparable.reduce((t,r)=>t+r.prevAvg*r.qtyThis,0));
    const atNew = U.round2(comparable.reduce((t,r)=>t+r.thisAvg*r.qtyThis,0));
    return {
      days:(+days||7), from:now-span, to:now, prevFrom:now-2*span, prevTo:now-span,
      rows,
      totals:{ spendThis, spendPrev, impact, atOld, atNew,
        basketPct: atOld>0 ? U.round2((atNew-atOld)/atOld*100) : 0,
        up: rows.filter(r=>r.dir==='up').length, down: rows.filter(r=>r.dir==='down').length,
        compared: comparable.length },
    };
  }

  // What this item cost on the docket before this one — powers the "vs last
  // time" note on a receipt line.
  function previousPrice(itemId, beforeTs, allPurch){
    const p = (allPurch||[]).filter(x=>x.ts<beforeTs && (x.lines||[]).some(l=>l.itemId===itemId))
      .sort((a,b)=>b.ts-a.ts)[0];
    if(!p) return null;
    const l = p.lines.find(x=>x.itemId===itemId);
    return {price:+l.unitPrice||0, ts:p.ts, supplierId:p.supplierId};
  }

  // ---------- purchases ----------
  // Saving a purchase moves stock in, updates each item's unit price and appends
  // to its price history — that's where the ▲▼ trend comes from.
  async function savePurchase(p){
    // Normalise BEFORE filtering: a line typed in cartons carries no `qty` yet,
    // so filtering first would silently drop the whole delivery.
    const all = await items();
    const lines = (p.lines||[])
      .map(l=> packLine(l, all.find(x=>x.id===l.itemId)))
      .filter(l=> l.itemId && (+l.qty||0)>0);
    // When the paper was written in packs, the paper's own arithmetic wins:
    // 3 cartons at $60 is $180 exactly, where 30 kg × a rounded $6.00/kg can
    // land a few cents out and leave the docket disagreeing with the invoice.
    const amountOf = (l)=> (l.packQty!=null && l.packPrice!=null)
      ? U.round2((+l.packQty||0) * (+l.packPrice||0))
      : lineAmount(l.qty, l.unitPrice);
    // A docket has more on it than the goods: freight, the GST the supplier
    // charged, how it was paid. Record what the piece of paper says — the app
    // still works nothing out for tax, it just keeps your own copy.
    const sub = U.round2(lines.reduce((t,l)=>t+amountOf(l),0));
    const gst = U.round2(p.gst||0), fee = U.round2(p.fee||0);
    const row = await MKR.db.put('purchases', {
      id:p.id||U.uid('pur'), ts:p.ts||Date.now(), supplierId:p.supplierId||null,
      invoiceNo:p.invoiceNo||'', note:p.note||'', by:p.by||me(),
      payMethod:p.payMethod||'', photo:p.photo||null,
      // Set when the docket came in through the back door rather than being
      // typed up afterwards — the receipt shows the check that was done.
      deliveryId:p.deliveryId||null,
      lines: lines.map(l=>({...l, qty:+l.qty, unitPrice:U.round2(l.unitPrice), amount:amountOf(l)})),
      sub, gst, fee, total: U.round2(sub+gst+fee), kitchenId:kid()
    });
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
    try{ await MKR.audit.log({action:'stock.purchase', desc:`Recorded purchase · ${row.lines.length} item(s)`, amount:row.total}); }catch(e){}
    return row;
  }

  // ---------- statement reconciliation ----------
  // Suppliers on account send one statement a month with a single total on it.
  // You hold a pile of dockets. Checking one against the other is the job nobody
  // enjoys and everybody pays for when it's skipped — the expensive direction is
  // a line on their statement you have no docket for, because that gets paid.
  //
  // No matching engine here: the owner ticks off what appears on the statement,
  // types the total, and the arithmetic names the gap. A saved row is what makes
  // "did I already do July?" answerable.
  const periodOf = (ts)=> U.isoDate(ts).slice(0,7);
  async function reconciliations(){ return (await mineOf('reconciliations')).sort((a,b)=>(b.ts||0)-(a.ts||0)); }

  // Everything one statement check needs: the dockets in that month and the
  // previous verdict, if there was one.
  async function statementFor(supplierId, period, allPurch, allRecs){
    const purch = (allPurch||await purchases()).filter(p=>p.supplierId===supplierId && periodOf(p.ts)===period);
    const recs  = allRecs||await reconciliations();
    return { supplierId, period, dockets: purch,
             ourTotal: U.round2(purch.reduce((t,p)=>t+(+p.total||0),0)),
             saved: recs.find(r=>r.supplierId===supplierId && r.period===period) || null };
  }
  // Which months this supplier has dockets in, newest first, and whether each
  // has been signed off — the "2 still to do" on the button.
  async function statementPeriods(supplierId, allPurch, allRecs){
    const purch = (allPurch||await purchases()).filter(p=>p.supplierId===supplierId);
    const recs  = allRecs||await reconciliations();
    const keys  = Array.from(new Set(purch.map(p=>periodOf(p.ts)))).sort().reverse();
    return keys.map(period=>{
      const mine = purch.filter(p=>periodOf(p.ts)===period);
      const saved = recs.find(r=>r.supplierId===supplierId && r.period===period) || null;
      return {period, dockets:mine.length, ourTotal:U.round2(mine.reduce((t,p)=>t+(+p.total||0),0)), saved};
    });
  }
  async function saveReconciliation(r){
    const row = await MKR.db.put('reconciliations', {
      id: r.id || `rec_${r.supplierId}_${r.period}`,   // one verdict per supplier per month
      supplierId:r.supplierId, period:r.period,
      statementTotal:U.round2(r.statementTotal||0), matchedTotal:U.round2(r.matchedTotal||0),
      ourTotal:U.round2(r.ourTotal||0), gap:U.round2(r.gap||0),
      matched:r.matched||[], note:r.note||'', by:me(), ts:Date.now(), kitchenId:kid()
    });
    try{ await MKR.audit.log({action:'stock.statement',
      desc:`Statement checked · ${r.period}${row.gap?` · ${U.money(row.gap)} unexplained`:' · matched'}`, amount:row.statementTotal}); }catch(e){}
    return row;
  }

  // ---------- waste ----------
  // The one number a stocktake can't give you. `counted before + bought − counted
  // now` says how much left the shelf, but not whether it was cooked and sold or
  // scraped into the bin. Those are the same arithmetic and very different
  // businesses, so the bin gets written down as it happens.
  //
  // Recording waste takes the stock down straight away, exactly like it does in
  // real life — so the next count still reconciles and the reorder maths, which
  // works on total depletion, is untouched.
  const WASTE_REASONS = {
    expired:  {label:'Out of date',        ic:'calendar'},
    spoiled:  {label:'Spoiled or off',     ic:'warning'},
    prep:     {label:'Prep error / burnt', ic:'warning'},
    damaged:  {label:'Dropped or damaged', ic:'warning'},
    returned: {label:'Sent back by a customer', em:'↩️'},
    other:    {label:'Other',              ic:'trash'},
  };
  async function saveWaste(lines, reason, note){
    const all = await items();
    const rows = lines.filter(l=>(+l.qty||0)>0).map(l=>{
      const it=all.find(x=>x.id===l.itemId)||{};
      return {itemId:l.itemId, name:it.name||'', unit:it.unit||'', qty:U.round2(l.qty),
              unitPrice:U.round2(it.price||0), amount:lineAmount(l.qty, it.price||0)};
    });
    if(!rows.length) return null;
    const cost = U.round2(rows.reduce((t,l)=>t+l.amount,0));
    const row = await MKR.db.put('waste', {id:U.uid('wst'), ts:Date.now(), by:me(),
      reason:reason||'other', note:note||'', lines:rows, cost, kitchenId:kid()});
    for(const l of rows){
      const it = all.find(x=>x.id===l.itemId); if(!it) continue;
      // Never below zero: a mis-keyed bin entry shouldn't invent negative stock
      // that then reads as a miscount at the next stocktake.
      await MKR.db.put('inventory', {id:it.id, qty:U.round2(Math.max(0, (+it.qty||0) - l.qty))});
    }
    try{ await MKR.audit.log({action:'stock.waste', desc:`Waste recorded · ${rows.length} item(s)`, amount:cost}); }catch(e){}
    await scanWarnings();
    return row;
  }
  // What the bin cost over a window, newest first — the headline figure.
  async function wasteSince(days, allWaste){
    const from = Date.now() - (+days||30)*DAY;
    const rows = (allWaste||await wastes()).filter(w=>w.ts>=from);
    const byItem = {};
    rows.forEach(w=>(w.lines||[]).forEach(l=>{
      const a = byItem[l.itemId] = byItem[l.itemId] || {itemId:l.itemId, name:l.name, unit:l.unit, qty:0, cost:0};
      a.qty = U.round2(a.qty + (+l.qty||0)); a.cost = U.round2(a.cost + (+l.amount||0));
    }));
    return { days:(+days||30), rows, cost: U.round2(rows.reduce((t,w)=>t+(+w.cost||0),0)),
             byItem: Object.values(byItem).sort((a,b)=>b.cost-a.cost) };
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
    // A shelf cannot hold −5 kg. A typo like that went straight into inventory
    // and then poisoned every usage interval derived from it, so nothing is
    // saved until it's fixed — silently clamping to 0 would be a second lie.
    const bad = rows.filter(l=>!isFinite(l.counted) || l.counted<0);
    if(bad.length) return {error:'negative', lines:bad};
    const row = await MKR.db.put('stocktakes', {id:U.uid('stk'), ts:Date.now(), by:me(), note:note||'', lines:rows, kitchenId:kid()});
    for(const l of rows) await MKR.db.put('inventory', {id:l.itemId, qty:l.counted, lastCountAt:row.ts});
    try{ await MKR.audit.log({action:'stock.count', desc:`Stocktake · ${rows.length} item(s) counted`}); }catch(e){}
    await scanWarnings();
    return row;
  }

  MKR.stock = {
    KIND, WASTE_REASONS, items, suppliers, purchases, stocktakes, wastes,
    overview, usageOf, usageIntervals, saveWaste, wasteSince,
    reconciliations, statementFor, statementPeriods, saveReconciliation, periodOf,
    saveItem, removeItem, savePurchase, saveStocktake, priceWatch, previousPrice,
    priceMove, moveBadge, itemValue, lineAmount, totalValue, scanWarnings,
    packSizeOf, packLabelOf, packHint, packLine, unitOf,
    categories, saveCategories, renameCategory, moveToCategory,
    render: (c, opts)=> MKR.stockView.render(c, opts),
  };
})();
