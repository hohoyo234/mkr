/* ===== Prices · what the shopping cost this week =====
   The question this page answers is the one owners actually ask on a Monday:
   "did my ingredients get dearer?" — and the honest answer only comes from the
   dockets, never from a price list.

   So every figure here is what was PAID: for each item, the weighted average
   unit price across the last 7 days of dockets, against the same figure for the
   7 days before. Weighted, because two crates at $6 and one at $9 averages $7,
   not $7.50.

   The number that leads is dollars, not percent. A 30% jump on garlic you buy
   twice a month is noise; a 6% creep on the meat order is a real hole in the
   week. Both are shown, but the list is ordered by what it cost you.

   The basket line at the top compares like with like: this week's quantities
   priced at last week's rates versus what they actually cost — so "we just
   bought more" can never read as "everything got dearer".
*/
window.MKR = window.MKR || {};
(function(){
  const U = MKR.util;
  const S = ()=>MKR.stock;

  const WINDOWS = [{d:7,label:'Week'},{d:14,label:'Fortnight'},{d:30,label:'Month'}];
  const WKEY = 'mkr_price_window';
  let days = (function(){ try{ return +localStorage.getItem(WKEY) || 7; }catch(e){ return 7; } })();

  const pctBadge = (pct, dir)=>{
    if(pct==null) return `<span class="pill ghost">first time</span>`;
    if(dir==='flat') return `<span class="pill ghost">— held</span>`;
    const up = dir==='up';
    return `<span class="pill ${up?'danger':'ok'}">${up?'▲':'▼'} ${Math.abs(pct).toFixed(1)}%</span>`;
  };

  // A price line drawn small enough to sit in a table cell. Reads as a shape,
  // not as numbers — the numbers are already in the columns either side.
  function spark(item){
    const h = (item.priceHistory||[]).slice(-10).map(p=>+p.price||0).filter(p=>p>0);
    if(h.length<2) return '<span class="faint" style="font-size:11px">—</span>';
    const w=64, ht=22, min=Math.min(...h), max=Math.max(...h), span=(max-min)||1;
    const pts = h.map((p,i)=>`${(i/(h.length-1)*w).toFixed(1)},${(ht-2-((p-min)/span)*(ht-5)).toFixed(1)}`).join(' ');
    const rising = h[h.length-1] > h[0];
    return `<svg class="spark" viewBox="0 0 ${w} ${ht}" width="${w}" height="${ht}" aria-hidden="true">
      <polyline points="${pts}" fill="none" stroke="${rising?'var(--red)':'var(--green)'}" stroke-width="1.6"
        stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${w}" cy="${(ht-2-((h[h.length-1]-min)/span)*(ht-5)).toFixed(1)}" r="2.2" fill="${rising?'var(--red)':'var(--green)'}"/>
    </svg>`;
  }

  async function tab(c, actions, reload){
    const w = await S().priceWatch(days);
    const t = w.totals;
    const label = (WINDOWS.find(x=>x.d===days)||WINDOWS[0]).label.toLowerCase();

    actions.innerHTML = `<div class="viewswitch" role="group" aria-label="Which window to compare">
        ${WINDOWS.map(x=>`<button class="${x.d===days?'on':''}" data-win="${x.d}">${x.label}</button>`).join('')}
      </div>
      <button class="btn btn-ghost btn-sm" id="pwCsv">${MKR.ui.icon('download')} Export CSV</button>`;
    U.qsa('[data-win]',actions).forEach(b=> b.onclick = ()=>{
      days = +b.dataset.win; try{ localStorage.setItem(WKEY, days); }catch(e){}
      reload();
    });

    const movers = w.rows.filter(r=>r.dir==='up'||r.dir==='down');
    const steady = w.rows.filter(r=>r.dir==='flat');
    const fresh  = w.rows.filter(r=>r.dir==='new');
    const worse  = t.impact > 0;

    // The headline, in a sentence rather than a dashboard. Each sentence is its
    // own text node with nothing bolded inside it — the translator matches whole
    // nodes, and a sentence broken up by <b> tags can never be translated.
    const headline = !t.compared
      ? `<b>Not enough dockets to compare yet.</b>
         <div>Record purchases for two ${label}s in a row and this page tells you exactly which ingredients moved, and what that did to the bill.</div>`
      : `<b>${worse?'Your shopping got dearer this '+label:(t.impact<0?'Your shopping got cheaper this '+label:'Prices held steady this '+label)}.</b>
         <div>The same ${t.compared} item${t.compared===1?'':'s'} you bought this ${label} would have cost ${U.money(t.atOld)} at last ${label}'s prices — you paid ${U.money(t.atNew)}.</div>
         <div>${t.impact===0?'No change overall.':`That is ${worse?'+':'−'}${U.money(Math.abs(t.impact))} on the ${label}'s shopping (${t.basketPct>0?'+':''}${t.basketPct.toFixed(1)}%).`} ${t.up} went up, ${t.down} came down.</div>`;

    const rowHtml = (r)=>`<tr>
      <td><b>${U.esc(r.name)}</b>
        <div class="faint" style="font-size:11.5px">${r.supplier?U.esc(r.supplier.name):'supplier not recorded'} · ${r.qtyThis} ${U.esc(r.unit)} this ${label}</div>
        ${r.cheapest?`<div class="pw-cheap">↩ ${r.cheapest.sameSupplier?'they charged':'was'} ${U.money(r.cheapest.price)}${r.cheapest.sameSupplier?'':` at ${U.esc(r.cheapest.supplier?r.cheapest.supplier.name:'another supplier')}`} on ${U.fmtDate(r.cheapest.ts)}${r.cheapest.saving>0.5?` · ${U.money(r.cheapest.saving)} on this ${label}'s quantity`:''}</div>`:''}
      </td>
      <td class="num">${r.prevAvg==null?'<span class="faint">—</span>':U.money(r.prevAvg)}</td>
      <td class="num"><b>${r.thisAvg==null?'—':U.money(r.thisAvg)}</b>${r.thisAvg==null||!r.unit?'':`<small class="faint">/${U.esc(r.unit)}</small>`}</td>
      <td>${pctBadge(r.pct, r.dir)}</td>
      <td class="num ${r.impact>0?'pw-worse':(r.impact<0?'pw-better':'')}">${r.impact?`<b>${r.impact>0?'+':'−'}${U.money(Math.abs(r.impact))}</b>`:'<span class="faint">—</span>'}</td>
      <td class="pw-spark">${spark(r.item)}</td>
    </tr>`;

    const table = (title, hint, list)=> !list.length ? '' : `
      <div class="card pad20 mt16">
        <div class="section-title">${title}<span class="faint" style="font-size:12px;font-weight:500">${hint}</span></div>
        <div class="tablewrap"><table class="dtable">
          <thead><tr><th>Item</th><th class="num">Last ${label}</th><th class="num">This ${label}</th><th>Move</th><th class="num">Cost to you</th><th>Trend</th></tr></thead>
          <tbody>${list.map(rowHtml).join('')}</tbody></table></div>
      </div>`;

    c.innerHTML = `
      <div class="alert ${!t.compared?'info':(worse?'amber':'green')} mt16"><span>${!t.compared?'🧾':(worse?'📈':'📉')}</span><div>${headline}</div></div>
      <div class="statline">
        <span class="statcell"><b>${U.money0(t.spendThis)}</b><i>spent this ${label}</i></span>
        <span class="statcell"><b>${U.money0(t.spendPrev)}</b><i>the ${label} before</i></span>
        <span class="statcell"${t.up?' style="color:#8a6410"':''}><b>${t.up}</b><i>went up</i></span>
        <span class="statcell"${t.down?' style="color:var(--green)"':''}><b>${t.down}</b><i>came down</i></span>
      </div>
      ${table('📈 What moved', 'ordered by what the move cost you, not by percent', movers)}
      ${table('➖ Held their price', 'same money as last '+label, steady)}
      ${table('🆕 No comparison yet', 'only appears on one '+label+"'s dockets", fresh)}
      ${!w.rows.length?`<div class="empty mt16"><div class="em">🏷️</div><p>No purchases in the last ${days*2} days. Record your dockets and prices start comparing themselves.</p></div>`:''}
      <div class="disclaimer mt16"><span>ℹ️</span><div>
        <div>Every figure is the price you actually paid, weighted by quantity, taken straight off your dockets. Nothing here is a market rate or a forecast of one.</div>
        <div>Prices are per unit, never per carton. A docket booked in packs is converted first, so a supplier changing their pack size cannot show up here as a price rise.</div>
        <div>Comparing ${U.fmtDate(w.from)} – ${U.fmtDate(w.to)} against ${U.fmtDate(w.prevFrom)} – ${U.fmtDate(w.prevTo)}.</div>
      </div></div>`;

    U.qs('#pwCsv',actions).onclick = ()=>{
      if(!w.rows.length){ U.toast('Nothing to export','amber'); return; }
      const out=[[`Item`,`Unit`,`Last ${label} avg`,`This ${label} avg`,`Move %`,`Qty this ${label}`,`Cost of the move`,`Spent this ${label}`,`Supplier`]];
      w.rows.forEach(r=>out.push([r.name, r.unit, r.prevAvg==null?'':r.prevAvg.toFixed(2), r.thisAvg==null?'':r.thisAvg.toFixed(2),
        r.pct==null?'':r.pct.toFixed(1), r.qtyThis, r.impact.toFixed(2), r.spendThis.toFixed(2), (r.supplier&&r.supplier.name)||'']));
      out.push([], ['Same basket at last '+label+"'s prices", '', '', '', '', '', t.atOld.toFixed(2)]);
      out.push(['What it actually cost', '', '', '', '', '', t.atNew.toFixed(2)]);
      U.downloadCSV(`prices-${U.todayISO()}.csv`, out); U.toast('Exported','green');
    };
  }

  MKR.stockPrices = { tab };
})();
