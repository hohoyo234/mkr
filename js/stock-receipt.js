/* ===== Purchases · the dockets =====
   A purchase in this app is not a database row an owner should have to read as
   a table. It's the piece of paper that came in with the delivery, and that's
   how it's drawn here: one docket per delivery, in the order they arrived, with
   everything the paper had on it — who supplied it, the invoice number, every
   line at the price you actually paid, freight, the GST the supplier charged,
   how it was paid and who took it in.

   The one thing the paper can't tell you is added here: next to each line, what
   the same thing cost on the last docket. That's how a $2 creep gets noticed
   before it's been quietly costing you $200 a month.

   Nothing here is a tax invoice and the app works nothing out for tax — it is
   your own copy of your own record.
*/
window.MKR = window.MKR || {};
(function(){
  const U = MKR.util;
  const S = ()=>MKR.stock;

  const subOf = (p)=> p.sub!=null ? +p.sub : U.round2((p.lines||[]).reduce((t,l)=>t+(+l.amount||0),0));
  const totalOf = (p)=> p.total!=null ? +p.total : subOf(p);
  const monthKey = (ts)=> new Date(ts).toISOString().slice(0,7);
  const monthName = (key)=>{ const [y,m]=key.split('-'); return new Date(+y, +m-1, 1)
    .toLocaleDateString('en-AU',{month:'long', year:'numeric'}); };

  // ---------- the docket ----------
  // opts: {sup, venue, purch (for the vs-last-time note), compact}
  function receiptHtml(p, opts){
    const o = opts||{};
    const sup = o.sup, lines = p.lines||[];
    const shown = o.compact ? lines.slice(0,5) : lines;
    const sub = subOf(p), gst = +p.gst||0, fee = +p.fee||0;

    // A line that was checked in at the back door carries what was ordered and
    // what condition it turned up in. That belongs on the docket: it's exactly
    // what you'd be arguing about when the invoice doesn't match.
    const COND = {short:'came up short', damaged:'damaged', wrong:'wrong item'};
    const lineHtml = (l)=>{
      const prev = o.purch ? S().previousPrice(l.itemId, p.ts, o.purch) : null;
      let move = '';
      if(prev && prev.price>0 && Math.abs(prev.price-(+l.unitPrice||0))>0.005){
        const pct = ((+l.unitPrice||0)-prev.price)/prev.price*100;
        const up = pct>0;
        move = `<span class="dkt-move ${up?'up':'down'}">${up?'▲':'▼'} ${Math.abs(pct).toFixed(1)}% vs ${U.money(prev.price)} on ${U.fmtDate(prev.ts)}</span>`;
      } else if(prev){
        move = `<span class="dkt-move flat">same price as ${U.fmtDate(prev.ts)}</span>`;
      } else {
        move = `<span class="dkt-move flat">first time on a docket</span>`;
      }
      const short = (+l.ordered||0) > 0 && U.round2(+l.ordered) !== U.round2(+l.qty);
      const flag = (l.condition && l.condition!=='ok') ? COND[l.condition] || l.condition : '';
      // A docket bought by the carton is read back the way the paper reads —
      // "3 cartons × $60.00" — with the per-unit figure underneath, because that
      // is the number the ▲▼ against last time is actually comparing.
      const pk = +l.packSize>0 && l.packQty!=null;
      const sub = pk
        ? `${U.round2(l.packQty)} ${U.esc((l.packLabel||'pack')+(U.round2(l.packQty)===1?'':'s'))} × ${U.money(l.packPrice)}`
        : `${l.qty} ${U.esc(l.unit||'')} × ${U.money(l.unitPrice)}`;
      return `<div class="dkt-line">
        <div class="dkt-line-top"><span class="dkt-name">${U.esc(l.name||'')}</span><b>${U.money(l.amount)}</b></div>
        <div class="dkt-line-sub"><span>${sub}</span>${move}</div>
        ${pk?`<div class="dkt-line-sub"><span class="faint">= ${l.qty} ${U.esc(l.unit||'')} · ${U.money(l.unitPrice)}/${U.esc(l.unit||'unit')}</span></div>`:''}
        ${short||flag ? `<div class="dkt-flag">${MKR.ui.icon('warning')} ${short?`ordered ${l.ordered} ${U.esc(l.unit||'')}, took ${l.qty}`:''}${short&&flag?' · ':''}${flag?U.esc(flag):''}</div>`:''}
      </div>`;
    };

    return `<div class="receipt dkt">
      <div class="dkt-head">
        <b>${U.esc(o.venue||'My Kitchen')}</b>
        <span>GOODS RECEIVED · your own record</span>
      </div>
      <div class="dkt-meta">
        <div><span>Supplier</span><b>${U.esc(sup?sup.name:'Not recorded')}</b></div>
        <div><span>Docket</span><b>${U.esc(p.invoiceNo||'—')}</b></div>
        <div><span>Delivered</span><b>${U.fmtDateTime(p.ts)}</b></div>
        <div><span>Paid by</span><b>${U.esc(p.payMethod||'—')}</b></div>
      </div>
      <div class="dkt-rule"></div>
      <div class="dkt-lines">${shown.map(lineHtml).join('')}
        ${o.compact && lines.length>shown.length ? `<div class="dkt-more">+ ${lines.length-shown.length} more line${lines.length-shown.length===1?'':'s'}</div>`:''}
      </div>
      <div class="dkt-rule"></div>
      <div class="dkt-sum">
        <div><span>Goods</span><b>${U.money(sub)}</b></div>
        ${fee?`<div><span>Freight</span><b>${U.money(fee)}</b></div>`:''}
        ${gst?`<div><span>GST on the docket</span><b>${U.money(gst)}</b></div>`:''}
        <div class="dkt-total"><span>TOTAL</span><b>${U.money(totalOf(p))}</b></div>
      </div>
      ${p.note?`<div class="dkt-note">${U.esc(p.note)}</div>`:''}
      ${p.deliveryId ? `<div class="dkt-stamp">
          <b>${MKR.ui.icon('check')} Checked in at the back door</b>
          <span>${U.esc(p.by||'—')} counted it off the truck${o.dlv&&o.dlv.tempC!=null&&o.dlv.tempC!==''?` · ${U.esc(String(o.dlv.tempC))}°C on arrival`:''}</span>
        </div>` : `<div class="dkt-stamp plain">
          <b>Typed up from the paper</b>
          <span>Not checked in against a delivery</span>
        </div>`}
      <div class="dkt-foot">Taken in by ${U.esc(p.by||'—')}<br>Not a tax invoice · your own record of what you paid</div>
    </div>`;
  }

  // ---------- the tab ----------
  async function tab(c, actions, reload){
    const [purch, sups, its, dlvs] = await Promise.all([
      S().purchases(), S().suppliers(), S().items(),
      MKR.deliveries ? MKR.deliveries.all() : Promise.resolve([]),
    ]);
    let venue = 'My Kitchen';
    try{ const k = await MKR.db.get('kitchens', (MKR.auth.current()||{}).kitchenId||'k_main'); if(k&&k.name) venue=k.name; }catch(e){}

    const supOf = (id)=> sups.find(s=>s.id===id) || null;
    const dlvOf = (p)=> p.deliveryId ? dlvs.find(d=>d.id===p.deliveryId) || null : null;
    const thisM = monthKey(Date.now());
    const prevM = monthKey(new Date(new Date().setMonth(new Date().getMonth()-1)).getTime());
    // Month-to-date against the SAME stretch of last month. Comparing three
    // days of August with all of July would say spending collapsed 94%, which
    // is true of the arithmetic and false about the restaurant.
    const today = new Date().getDate();
    const spend = (key, upToDay)=> U.round2(purch
      .filter(p=>monthKey(p.ts)===key && (!upToDay || new Date(p.ts).getDate()<=upToDay))
      .reduce((t,p)=>t+totalOf(p),0));
    const spendThis = spend(thisM), spendPrev = spend(prevM, today);
    const months = Array.from(new Set(purch.map(p=>monthKey(p.ts)))).sort().reverse();
    const avg = purch.length ? U.round2(purch.reduce((t,p)=>t+totalOf(p),0)/purch.length) : 0;

    actions.innerHTML = `<button class="btn btn-ghost btn-sm" id="purCsv">${MKR.ui.icon('download')} Export CSV</button>
      <button class="btn btn-dark btn-sm" id="purAdd">${MKR.ui.icon('plus')} Record purchase</button>`;

    const monthDelta = spendPrev>0 ? (spendThis-spendPrev)/spendPrev*100 : null;
    c.innerHTML = `
      <div class="statline">
        <span class="statcell"><b>${purch.length}</b><i>dockets kept</i></span>
        <span class="statcell"><b>${U.money0(spendThis)}</b><i>spent this month</i></span>
        <span class="statcell"${monthDelta!=null&&monthDelta>0?' style="color:var(--amber-ink)"':''}><b>${monthDelta==null?'—':(monthDelta>0?'+':'')+monthDelta.toFixed(0)+'%'}</b><i>vs the same days last month</i></span>
        <span class="statcell"><b>${U.money0(avg)}</b><i>average docket</i></span>
      </div>

      ${purch.length?`
      <div class="dkt-filters">
        <select class="input" id="fSup"><option value="">Every supplier</option>
          ${sups.map(s=>`<option value="${s.id}">${U.esc(s.name)}</option>`).join('')}</select>
        <select class="input" id="fMon"><option value="">Every month</option>
          ${months.map(m=>`<option value="${m}">${U.esc(monthName(m))}</option>`).join('')}</select>
        <input class="input" id="fQ" placeholder="Search an item or a docket number">
      </div>
      <div class="dkt-wall" id="dktWall"></div>
      <div class="dkt-none" id="dktNone" hidden>Nothing matches that.</div>`
      : `<div class="empty mt16"><div class="em">${MKR.ui.icon('receipt')}</div><p>No dockets yet. Record the first delivery and this becomes the pile of receipts you'd otherwise keep in a drawer — with the price of every line compared against last time.</p></div>`}`;

    function draw(){
      const wall = U.qs('#dktWall', c); if(!wall) return;
      const fs = U.qs('#fSup',c).value, fm = U.qs('#fMon',c).value, q = U.qs('#fQ',c).value.trim().toLowerCase();
      const list = purch.filter(p=>{
        if(fs && p.supplierId!==fs) return false;
        if(fm && monthKey(p.ts)!==fm) return false;
        if(q){
          const hay = [(supOf(p.supplierId)||{}).name||'', p.invoiceNo||'', p.note||'',
                       ...(p.lines||[]).map(l=>l.name||'')].join(' ').toLowerCase();
          if(!hay.includes(q)) return false;
        }
        return true;
      });
      U.qs('#dktNone',c).hidden = !!list.length;
      wall.innerHTML = list.map(p=>`<button class="dkt-card" data-pur="${p.id}">
        ${receiptHtml(p, {sup:supOf(p.supplierId), venue, purch, dlv:dlvOf(p), compact:true})}</button>`).join('');
      U.qsa('[data-pur]', wall).forEach(b=> b.onclick = ()=>{
        const p = purch.find(x=>x.id===b.dataset.pur);
        openReceipt(p, supOf(p.supplierId), venue, purch, dlvOf(p));
      });
    }
    if(purch.length){
      ['#fSup','#fMon'].forEach(sel=> U.qs(sel,c).onchange = draw);
      U.qs('#fQ',c).oninput = draw;
      draw();
    }

    U.qs('#purAdd',actions).onclick = ()=>{
      if(!its.length){ U.toast('Add some stock items first','amber'); return; }
      purchaseModal(sups, its, purch, reload, dlvs.filter(d=>d.status==='expected'));
    };
    U.qs('#purCsv',actions).onclick = ()=>{
      // Both readings of every line: what the paper said (packs) and what the
      // kitchen counts (units). An accountant reconciling against the supplier's
      // invoice needs the first; anyone checking a price needs the second.
      const out=[['Date','Supplier','Docket','Item','Packs','Pack','Pack size','Price per pack','Qty','Unit','Unit price','Amount','Goods','Freight','GST','Docket total','Paid by','Taken in by']];
      purch.forEach(p=>(p.lines||[]).forEach((l,i)=>out.push([U.fmtDateTime(p.ts), (supOf(p.supplierId)||{}).name||'', p.invoiceNo||'',
        l.name,
        l.packSize>0 && l.packQty!=null ? l.packQty : '', l.packSize>0 ? (l.packLabel||'pack') : '',
        l.packSize>0 ? l.packSize : '', l.packSize>0 && l.packPrice!=null ? (+l.packPrice).toFixed(2) : '',
        l.qty, l.unit||'', (+l.unitPrice||0).toFixed(2), (+l.amount||0).toFixed(2),
        i===0?subOf(p).toFixed(2):'', i===0?(+p.fee||0).toFixed(2):'', i===0?(+p.gst||0).toFixed(2):'',
        i===0?totalOf(p).toFixed(2):'', i===0?(p.payMethod||''):'', i===0?(p.by||''):''])));
      if(out.length===1){ U.toast('Nothing to export','amber'); return; }
      U.downloadCSV(`purchases-${U.todayISO()}.csv`, out); U.toast('Exported','green');
    };
  }

  // ---------- one docket, full size ----------
  function openReceipt(p, sup, venue, purch, dlv){
    const html = receiptHtml(p, {sup, venue, purch, dlv});
    const problems = (p.lines||[]).filter(l=>l.condition && l.condition!=='ok').length;
    // Typed-up dockets carry their own photo; ones checked in at the back door
    // keep it on the delivery, so read whichever exists.
    const photo = p.photo || (dlv && dlv.photo) || null;
    const wrap = U.el(`<div>${html}
      ${photo?`<div class="dkt-photo"><img src="${photo}" alt="Photo of the docket"></div>`:''}
      ${dlv?`<div class="alert ${problems?'amber':'green'} mt12"><span>${MKR.ui.icon(problems?'warning':'checkcircle')}</span><div>
        ${problems?`${problems} ${problems===1?'line was':'lines were'} short or damaged when this arrived — worth checking before you pay the invoice.`
                  :'Everything on this docket was counted off the truck and matched.'}
        <button class="linkish" id="dktToDlv">Open the delivery →</button></div></div>`:''}
      ${sup?`<div class="disclaimer mt12"><span>${MKR.ui.icon('truck')}</span>${U.esc(sup.name)}${sup.phone?' · '+U.esc(sup.phone):''}${sup.terms?' · pays on '+U.esc(sup.terms):''}</div>`:''}
    </div>`);
    const jump = U.qs('#dktToDlv', wrap);
    if(jump) jump.onclick = ()=>{
      const back = wrap.closest('.modal-back'); if(back) back.remove();
      location.hash = `#/${(MKR.auth.current()||{}).role==='manager'?'manager':'owner'}/deliveries`;
    };
    U.modal('Docket', wrap, {actions:[
      {label:'Export CSV', class:'btn-ghost', onClick:(close)=>{
        const out=[['Item','Qty','Unit','Unit price','Amount']];
        (p.lines||[]).forEach(l=>out.push([l.name,l.qty,l.unit||'',(+l.unitPrice||0).toFixed(2),(+l.amount||0).toFixed(2)]));
        out.push([],['Goods','','','',subOf(p).toFixed(2)]);
        if(+p.fee) out.push(['Freight','','','',(+p.fee).toFixed(2)]);
        if(+p.gst) out.push(['GST on the docket','','','',(+p.gst).toFixed(2)]);
        out.push(['TOTAL','','','',totalOf(p).toFixed(2)]);
        U.downloadCSV(`docket-${p.invoiceNo||U.todayISO()}.csv`, out); close(); U.toast('Exported','green');
      }},
      {label:'Print', class:'btn-dark', onClick:(close)=>{ close(); U.printHTML(html); }},
    ]});
  }

  // ---------- recording one ----------
  // `waiting` is the deliveries still sitting unconfirmed at the back door. Typing
  // a docket up here while one of them is open is the one way to count the same
  // goods twice: this form tops stock up now, and whoever ticks the delivery off
  // later tops it up again — which also feeds a phantom "bought" into the usage
  // maths. So the form says so and offers the back-door route instead.
  function purchaseModal(sups, its, purch, after, waiting){
    const opt = its.map(i=>`<option value="${i.id}">${U.esc(i.name)} (${U.esc(i.unit||'')})</option>`).join('');
    const PAY = ['Bank transfer','Card','Cash','Account · 7 days','Account · 14 days','Account · 30 days'];
    let photo = null;

    const lineHtml = ()=>`<tr class="pl-row">
      <td><select class="input pl-item">${opt}</select></td>
      <td class="num"><input class="input pl-qty" type="number" step="0.01" value="1" style="text-align:right">
        <div class="faint pl-hint" style="font-size:11px;margin-top:4px;text-align:right"></div></td>
      <td class="num"><input class="input pl-price" type="number" step="0.01" value="0" style="text-align:right"></td>
      <td class="num pl-amt">${U.money(0)}</td>
      <td class="num"><button class="btn btn-ghost btn-sm pl-del" aria-label="remove line">×</button></td></tr>`;

    const wrap = U.el(`<div>
      <div class="row"><div class="field grow"><label>Supplier</label><select class="input" id="p_sup">
          <option value="">— not recorded —</option>${sups.map(s=>`<option value="${s.id}">${U.esc(s.name)}</option>`).join('')}
        </select></div>
        <div class="field grow"><label>Invoice / docket no.</label><input class="input" id="p_inv" placeholder="e.g. VF-1042"></div></div>
      <div id="p_dlv"></div>
      <div class="row"><div class="field grow"><label>Delivered on</label><input class="input" id="p_date" type="date" value="${U.todayISO()}"></div>
        <div class="field grow"><label>Paid by</label><select class="input" id="p_pay">
          <option value="">— not recorded —</option>${PAY.map(x=>`<option value="${x}">${x}</option>`).join('')}
        </select></div></div>

      <div class="tablewrap"><table class="dtable">
        <thead><tr><th>Item</th><th class="num" style="width:96px">Qty</th><th class="num" style="width:110px">Unit price</th><th class="num" style="width:100px">Amount</th><th></th></tr></thead>
        <tbody id="p_lines">${lineHtml()}</tbody>
      </table></div>
      <button class="btn btn-ghost btn-sm mt8" id="p_add">${MKR.ui.icon('plus')} Add line</button>

      <div class="row mt12"><div class="field grow"><label>Freight / delivery fee</label><input class="input" id="p_fee" type="number" step="0.01" value="0"></div>
        <div class="field grow"><label>GST shown on the docket</label><input class="input" id="p_gst" type="number" step="0.01" value="0"></div></div>
      <div class="dkt-runtotal"><span>Docket total</span><b id="p_total">${U.money(0)}</b></div>

      <div class="field mt12"><label>Note (optional)</label><input class="input" id="p_note" placeholder="e.g. two crates short, credit promised"></div>
      <div class="field"><label>Photo of the docket (optional)</label>
        <input class="input" id="p_photo" type="file" accept="image/*">
        <div id="p_prev" class="dkt-photo"></div></div>
      <div class="disclaimer"><span>${MKR.ui.icon('box')}</span>Saving adds these quantities to stock, updates each item's unit price and files the docket. Type only what the paper says — the app works nothing out for tax.</div>
    </div>`);

    const body = U.qs('#p_lines',wrap);
    function recalc(){
      let sub=0;
      U.qsa('.pl-row',body).forEach(tr=>{
        const amt = S().lineAmount(U.qs('.pl-qty',tr).value, U.qs('.pl-price',tr).value);
        U.qs('.pl-amt',tr).textContent = U.money(amt); sub+=amt;
      });
      const total = sub + (Number(U.qs('#p_fee',wrap).value)||0) + (Number(U.qs('#p_gst',wrap).value)||0);
      U.qs('#p_total',wrap).textContent = U.money(total);
    }
    // This form takes the item's own unit, not the supplier's pack — it has no
    // per-line basis switch, so the row has to say which one it wants. Typing a
    // carton figure here is exactly the mistake the pack field exists to stop,
    // and it is silent: the number looks plausible and only the price page ever
    // notices. The back door is the right route when the paper is in cartons.
    function packHintOf(it){
      const n = S().packSizeOf(it);
      return n ? `in ${S().unitOf(it)} — 1 ${S().packLabelOf(it)} = ${U.round2(n)}` : '';
    }
    function bindRow(tr){
      const syncHint = ()=>{
        const it = its.find(i=>i.id===U.qs('.pl-item',tr).value);
        U.qs('.pl-hint',tr).textContent = packHintOf(it);
      };
      U.qs('.pl-qty',tr).oninput = recalc;
      U.qs('.pl-price',tr).oninput = recalc;
      U.qs('.pl-item',tr).onchange = ()=>{
        const it = its.find(i=>i.id===U.qs('.pl-item',tr).value);
        if(it && Number(U.qs('.pl-price',tr).value)===0) U.qs('.pl-price',tr).value = it.price||0;
        syncHint(); recalc();
      };
      syncHint();
      U.qs('.pl-del',tr).onclick = ()=>{ if(U.qsa('.pl-row',body).length>1){ tr.remove(); recalc(); } };
    }
    U.qsa('.pl-row',body).forEach(bindRow);
    U.qs('#p_add',wrap).onclick = ()=>{ const tr=U.el(lineHtml()); body.appendChild(tr); bindRow(tr); recalc(); };
    ['#p_fee','#p_gst'].forEach(sel=> U.qs(sel,wrap).oninput = recalc);
    U.qs('#p_photo',wrap).onchange = (e)=> U.readImage(e.target.files[0], (data)=>{
      photo=data; U.qs('#p_prev',wrap).innerHTML=`<img src="${photo}" alt="">`; });

    const supSel = U.qs('#p_sup',wrap), dlvBox = U.qs('#p_dlv',wrap);
    // ponytail: warns but doesn't block — there are honest reasons to have both a
    // typed docket and an open delivery. Match the two automatically (and offer to
    // close the delivery off) if double entries actually show up in real venues.
    function drawWaiting(){
      // Nobody's picked a supplier yet, so every open delivery is still a candidate.
      const open = (waiting||[]).filter(d=>!supSel.value || d.supplierId===supSel.value);
      // Supplier names and docket numbers stay on their own line: the dictionary
      // translates by exact match, so interpolated values must never sit inside
      // a sentence that needs translating.
      dlvBox.innerHTML = !open.length ? '' : `<div class="alert amber"><span>${MKR.ui.icon('truck')}</span><div>
        <b>This may already be waiting at the back door</b>
        <div class="faint">${open.map(d=>U.esc(d.supplierName||'Supplier')+(d.docketNo?' · '+U.esc(d.docketNo):'')).join('<br>')}</div>
        <div>Checking it in there files the docket and moves the stock. Typing it up here as well counts the same goods twice.</div>
        <button class="linkish" id="p_toDlv">Check it in instead →</button></div></div>`;
      const jump = U.qs('#p_toDlv',wrap);
      if(jump) jump.onclick = ()=>{
        const back = wrap.closest('.modal-back'); if(back) back.remove();
        location.hash = `#/${(MKR.auth.current()||{}).role==='manager'?'manager':'owner'}/deliveries`;
      };
    }
    supSel.onchange = drawWaiting;
    drawWaiting();

    U.modal('Record a purchase', wrap, {actions:[
      {label:'Cancel', class:'btn-ghost', onClick:c=>c()},
      {label:'Save docket', class:'btn-dark', onClick:async(close)=>{
        const lines = U.qsa('.pl-row',body).map(tr=>{
          const id=U.qs('.pl-item',tr).value; const it=its.find(i=>i.id===id)||{};
          return {itemId:id, name:it.name||'', unit:it.unit||'', qty:Number(U.qs('.pl-qty',tr).value)||0,
                  unitPrice:Number(U.qs('.pl-price',tr).value)||0};
        }).filter(l=>l.qty>0);
        if(!lines.length){ U.toast('Add at least one line','red'); return; }
        // A back-dated docket keeps the time of day, so two deliveries on the
        // same day still sort the way they arrived.
        const d = U.qs('#p_date',wrap).value;
        const ts = d ? new Date(d+'T'+new Date().toTimeString().slice(0,5)).getTime() : Date.now();
        await S().savePurchase({
          ts, supplierId:U.qs('#p_sup',wrap).value||null, invoiceNo:U.qs('#p_inv',wrap).value.trim(),
          payMethod:U.qs('#p_pay',wrap).value, fee:Number(U.qs('#p_fee',wrap).value)||0,
          gst:Number(U.qs('#p_gst',wrap).value)||0, note:U.qs('#p_note',wrap).value.trim(), photo, lines,
        });
        close(); U.toast('Docket filed · stock topped up','green'); after();
      }}
    ]});
  }

  MKR.stockReceipt = { tab, receiptHtml, purchaseModal, openReceipt };
})();
