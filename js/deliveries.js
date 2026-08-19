/* ===== Delivery confirmation =====
   The paper docket the driver hands over, done properly on a phone at the back
   door: what was ordered, what actually turned up, what condition it was in, and
   who signed for it.

   Confirming a delivery is the ONE place goods enter the building — it writes a
   purchase (which moves stock and records the unit price), so nothing is counted
   twice. Short or damaged lines are recorded as received, not as ordered, so the
   stock figure stays honest.

   Table: deliveries
*/
window.MKR = window.MKR || {};
(function(){
  const U = MKR.util;
  function kid(){ const s=MKR.auth&&MKR.auth.current&&MKR.auth.current(); return (s&&s.kitchenId)||'k_main'; }
  function me(){ const s=MKR.auth&&MKR.auth.current&&MKR.auth.current(); return (s&&s.name)||'—'; }

  const COND = {
    // "Good condition", not "Good" — the feedback page also has a "Good", and a
    // one-word key that means two different things can only be translated wrong
    // in one of them.
    ok:      {label:'Good condition',  pill:'ok'},
    short:   {label:'Short delivered', pill:'warn'},
    damaged: {label:'Damaged',         pill:'danger'},
    wrong:   {label:'Wrong item',      pill:'danger'},
  };
  const STATUS = {
    expected:  {label:'Expected',  pill:'ghost', ic:'clock'},
    confirmed: {label:'Confirmed', pill:'ok',    ic:'checkcircle'},
    // "Turned away", not "Rejected" — a rejected kitchen application elsewhere
    // means something else entirely, and one shared key can only be translated
    // right in one of them. Matches the wording already used in detailModal.
    rejected:  {label:'Turned away',  pill:'danger',ic:'warning'},
  };
  // Same list the Purchases form offers, so a docket says the same thing
  // whichever door it came in through.
  const PAY = ['Bank transfer','Card','Cash','Account · 7 days','Account · 14 days','Account · 30 days'];

  // What happens after "2 boxes were off". A problem noticed at the back door is
  // only worth noticing if somebody chases the money, and "they said they'd fix
  // it" is where that money quietly dies.
  const CLAIM = {
    open:    {label:'Still to raise',   pill:'warn',  ic:'dot'},
    claimed: {label:'Raised with them', pill:'ghost', ic:'phone'},
    settled: {label:'Settled',          pill:'ok',    ic:'checkcircle'},
    dropped: {label:'Written off',      pill:'ghost', ic:'minus'},
  };

  async function all(){ return (await MKR.db.getAll('deliveries')).filter(d=>(d.kitchenId||'k_main')===kid()).sort((a,b)=>(b.ts||0)-(a.ts||0)); }
  async function pending(){ return (await all()).filter(d=>d.status==='expected'); }
  async function claims(){ return (await MKR.db.getAll('claims')).filter(c=>(c.kitchenId||'k_main')===kid()).sort((a,b)=>(b.ts||0)-(a.ts||0)); }

  // What a delivery actually cost you in goods you can't use.
  //
  // Only damaged and wrong-item lines carry money: those were received, so the
  // docket charged for them, and they're useless. A SHORT line was never
  // charged — confirm() books the received quantity, not the ordered one — so
  // there is nothing to claim back unless the supplier's monthly invoice bills
  // the full order, and that's what the statement check is for. Claiming for a
  // short line here would be asking for a refund on something you never paid.
  function claimableOf(d){
    const lines = (d.lines||[])
      .filter(l=>(l.condition==='damaged'||l.condition==='wrong') && (+l.received||0)>0)
      .map(l=>({itemId:l.itemId, name:l.name, unit:l.unit, qty:+l.received||0,
                unitPrice:+l.unitPrice||0, condition:l.condition,
                amount:U.round2((+l.received||0)*(+l.unitPrice||0))}));
    const short = (d.lines||[]).filter(l=>l.condition==='short' ||
      ((+l.ordered||0) > 0 && (+l.received||0) < (+l.ordered||0)));
    return {lines, amount:U.round2(lines.reduce((t,l)=>t+l.amount,0)), short};
  }

  async function saveClaim(c){
    const prev = c.id ? await MKR.db.get('claims', c.id) : null;
    const status = c.status || 'open';
    // An append-only trail: who said what, when. That's the whole point — the
    // number is easy, remembering that Kim promised a credit on the 3rd is not.
    const history = (prev && prev.history || []).slice();
    if(!prev || prev.status !== status || (c.note||'') !== (prev.note||''))
      history.push({ts:Date.now(), by:me(), status, note:c.note||''});
    const row = await MKR.db.put('claims', {
      id: c.id || `clm_${c.deliveryId}`,          // one claim per delivery
      deliveryId:c.deliveryId, supplierId:c.supplierId||null, supplierName:c.supplierName||'',
      lines:c.lines||[], amount:U.round2(c.amount||0), status, note:c.note||'',
      history, by:me(), ts: prev ? prev.ts : Date.now(), updatedAt:Date.now(), kitchenId:kid()
    });
    try{ await MKR.audit.log({action:'delivery.claim',
      desc:`Claim ${CLAIM[status].label.toLowerCase()} · ${c.supplierName||'supplier'}`, amount:row.amount}); }catch(e){}
    return row;
  }

  async function save(d){
    return MKR.db.put('deliveries', {status:'expected', kitchenId:kid(), ts:Date.now(), ...d, id:d.id||U.uid('dlv')});
  }

  // Confirm: record what actually arrived, then push it into stock as a purchase.
  //
  // This is the only door goods come in through, so it has to capture the whole
  // docket in one go — quantities, the prices you were charged, the freight, the
  // GST the supplier put on it and how it's being paid. Anything left out here
  // is something the owner has to type a second time later, which is exactly the
  // job this app exists to delete.
  async function confirm(d, {lines, receivedBy, signature, tempC, note, photo, photos, docketNo, payMethod, fee, gst}){
    const got = lines.filter(l=>(+l.received||0)>0);
    let purchaseId = null;
    if(got.length){
      const p = await MKR.stock.savePurchase({
        supplierId: d.supplierId, invoiceNo: docketNo || d.docketNo || '',
        note: note || '', by: receivedBy, payMethod: payMethod||'',
        // The photo is kept once, on the delivery — the docket reads it back
        // through deliveryId. Storing it on both rows doubled the biggest field
        // in the database for nothing.
        fee: +fee||0, gst: +gst||0, deliveryId: d.id,
        // Received, never ordered — a short delivery must not inflate stock.
        // The pack figures are carried through rather than recomputed: the
        // docket's own arithmetic (3 cartons at $60 = $180) is what the invoice
        // will be checked against, and a re-derived figure can land cents out.
        lines: got.map(l=>({itemId:l.itemId, name:l.name, unit:l.unit, qty:+l.received,
                            unitPrice:+l.unitPrice||0, ordered:+l.ordered||0, condition:l.condition||'ok',
                            ...(l.packSize>0 ? {packSize:l.packSize, packLabel:l.packLabel||'pack',
                                                packQty:l.packQty, packPrice:l.packPrice} : {})})),
      });
      purchaseId = p.id;
    }
    const saved = await MKR.db.put('deliveries', {
      id:d.id, status:'confirmed', lines, receivedBy, signature:signature||null, tempC:tempC===''?null:tempC,
      docketNo: docketNo || d.docketNo || '', payMethod: payMethod||'', fee:+fee||0, gst:+gst||0,
      note, photo:photo||null, photos:photos||[], confirmedAt:Date.now(), purchaseId
    });
    // A reading that is only filed is not a check — same rule the fridge
    // checklist applies, same alert.
    if(tempC!=='' && tempC!=null) await MKR.tasks.checkTemp(tempC, `${d.supplierName||'Supplier'} delivery`);
    const problems = lines.filter(l=>l.condition && l.condition!=='ok');
    if(problems.length){
      // Open the claim the moment the problem is signed for, rather than waiting
      // for someone to remember. An empty-money claim is still worth raising:
      // a short line has to be watched on their invoice even though the docket
      // was right.
      const cl = claimableOf({lines});
      await saveClaim({deliveryId:d.id, supplierId:d.supplierId, supplierName:d.supplierName||'',
        lines:cl.lines, amount:cl.amount, status:'open',
        note:`Opened automatically · ${problems.length} problem line(s) signed for`});
      await MKR.alerts.raise({ key:'delivery-'+d.id, level:'amber', type:'delivery',
        title:'Delivery problem', desc:`${problems.length} line(s) short or damaged on the ${d.supplierName||'supplier'} delivery${cl.amount?` — ${U.money(cl.amount)} of it you were charged for`:''} — worth a call before you pay the invoice`});
    }
    try{ await MKR.audit.log({action:'delivery.confirm', desc:`Confirmed delivery from ${d.supplierName||'supplier'}${problems.length?` · ${problems.length} problem line(s)`:''}`}); }catch(e){}
    return saved;
  }

  async function reject(d, reason){
    await MKR.db.put('deliveries', {id:d.id, status:'rejected', note:reason, receivedBy:me(), confirmedAt:Date.now()});
    await MKR.alerts.raise({key:'delivery-rej-'+d.id, level:'red', type:'delivery',
      title:'Delivery rejected', desc:`${d.supplierName||'A supplier'} delivery was turned away — ${reason||'no reason given'}`});
    try{ await MKR.audit.log({action:'delivery.reject', desc:`Rejected delivery from ${d.supplierName||'supplier'}`}); }catch(e){}
  }

  // Waiting deliveries, a week at a time. "3 waiting" tells nobody whether to
  // be at the back door this morning or next Tuesday — a date does, and the
  // week it sits in is how a kitchen already thinks about the next fortnight.
  const MON = (ts)=>{ const d=new Date(ts); d.setHours(0,0,0,0); d.setDate(d.getDate()-((d.getDay()+6)%7)); return d.getTime(); };
  function weekLabel(mon, thisMon){
    const diff = Math.round((mon-thisMon)/(7*864e5));
    const end = mon + 6*864e5;
    const range = `${U.fmtDate(mon)} – ${U.fmtDate(end)}`;
    const name = diff<0 ? 'Overdue' : diff===0 ? 'This week' : diff===1 ? 'Next week' : `In ${diff} weeks`;
    return {name, range, late:diff<0};
  }
  function waitingWeeks(wait){
    if(!wait.length) return '';
    const thisMon = MON(Date.now()), today = U.isoDate();
    const byWeek = {};
    wait.forEach(d=>{
      const ts = d.dueTs || d.ts || Date.now();
      (byWeek[MON(ts)] = byWeek[MON(ts)] || []).push({d, ts});
    });
    const weeks = Object.keys(byWeek).map(Number).sort((a,b)=>a-b);
    return `<div class="card pad20 mt16">
      <div class="section-title">${MKR.ui.icon('calendar')}Coming up<span class="faint" style="font-size:12px;font-weight:500">what to expect at the back door, week by week</span></div>
      ${weeks.map(mon=>{
        const w = weekLabel(mon, thisMon);
        const list = byWeek[mon].sort((a,b)=>a.ts-b.ts);
        return `<div class="dlv-week">
          <div class="dlv-week-head${w.late?' late':''}"><b>${w.name}</b><span>${w.range}</span></div>
          ${list.map(({d,ts})=>{
            const iso = U.isoDate(ts);
            const when = iso===today ? 'Today' : new Date(ts).toLocaleDateString('en-AU',{weekday:'short', day:'numeric', month:'short'});
            return `<div class="li clickable" data-dlv="${d.id}">
              <div class="dlv-when${iso===today?' now':''}${iso<today?' late':''}">${when}${d.dueTime?`<i>${U.esc(d.dueTime)}</i>`:''}</div>
              <div class="meta"><b>${U.esc(d.supplierName||'Supplier')}${d.docketNo?' · '+U.esc(d.docketNo):''}</b>
                <span>${(d.lines||[]).length} line${(d.lines||[]).length===1?'':'s'} ordered · tap to check it in</span></div>
              <span class="pill ghost">${MKR.ui.icon('clock')} Expected</span></div>`;
          }).join('')}
        </div>`;
      }).join('')}
    </div>`;
  }

  // ---------------- page ----------------
  async function render(c){
    const [rows, sups, its, purch, clms] = await Promise.all([all(), MKR.stock.suppliers(), MKR.stock.items(), MKR.stock.purchases(), claims()]);
    const supName = id=>{ const s=sups.find(x=>x.id===id); return s?s.name:'—'; };
    const docketOf = (d)=> d.purchaseId ? purch.find(p=>p.id===d.purchaseId) || null : null;
    const claimOf  = (d)=> clms.find(x=>x.deliveryId===d.id) || null;
    const wait = rows.filter(d=>d.status==='expected');
    const probs = rows.filter(d=>d.status==='confirmed' && (d.lines||[]).some(l=>l.condition&&l.condition!=='ok')).length;
    // Only money still in play: settled and written-off claims are finished.
    const chasing = clms.filter(x=>x.status==='open'||x.status==='claimed');
    const owed = U.round2(chasing.reduce((t,x)=>t+(+x.amount||0),0));

    c.innerHTML = `
      <div class="section-head"><div><h2>Deliveries</h2><p>Check it at the back door, not after the invoice arrives</p></div>
        <button class="btn btn-dark btn-sm" id="dlvNew" data-new>${MKR.ui.icon('plus')} New delivery</button></div>
      <div class="statline">
        <span class="statcell"><b>${wait.length}</b><i>waiting</i></span>
        <span class="statcell"><b>${rows.filter(d=>d.status==='confirmed').length}</b><i>confirmed</i></span>
        <span class="statcell"${probs?' style="color:var(--red)"':''}><b>${probs}</b><i>problems</i></span>
        <span class="statcell"${owed?' style="color:var(--red)"':''}><b>${U.money0(owed)}</b><i>still to get back</i></span>
      </div>
      ${chasing.length?`<div class="alert amber mt16"><span>${MKR.ui.icon('receipt')}</span><div>
        <b>${chasing.length===1?'One claim is still open':`${chasing.length} claims are still open`}</b>
        <div class="faint">${chasing.slice(0,4).map(x=>`<div>${U.esc(x.supplierName||'Supplier')} ${U.money(x.amount)} · <span>${CLAIM[x.status].label}</span></div>`).join('')}</div>
        <div>Open the delivery to log what they said, or mark it settled once the credit lands.</div>
      </div></div>`:''}
      ${waitingWeeks(wait)}
      <div class="card pad20 mt16">
        <div class="section-title">Delivery log</div>
        ${rows.length? `<div class="list">${rows.map(d=>{
          const st=STATUS[d.status]||STATUS.expected;
          const bad=(d.lines||[]).filter(l=>l.condition&&l.condition!=='ok').length;
          const dk=docketOf(d), cl=claimOf(d);
          return `<div class="li clickable" data-dlv="${d.id}">
            <div class="ds-li-ic">${MKR.ui.icon(st.ic)}</div>
            <div class="meta"><b>${U.esc(d.supplierName||supName(d.supplierId))}${d.docketNo?' · '+U.esc(d.docketNo):''}</b>
              <span>${d.status==='expected'&&d.dueTs?'due '+U.fmtDate(d.dueTs)+(d.dueTime?' '+U.esc(d.dueTime):''):U.fmtDateTime(d.ts)} · ${(d.lines||[]).length} line${(d.lines||[]).length===1?'':'s'}${d.receivedBy?' · signed '+U.esc(d.receivedBy):''}${bad?` · ${bad} problem`:''}</span></div>
            ${dk?`<b class="dlv-amt">${U.money(dk.total)}</b>`:''}
            ${cl?`<span class="pill ${CLAIM[cl.status].pill}">${MKR.ui.icon(CLAIM[cl.status].ic)} ${cl.amount?U.money(cl.amount):CLAIM[cl.status].label}</span>`:''}
            <span class="pill ${st.pill}">${st.label}</span></div>`;
        }).join('')}</div>`
        : `<div class="empty"><div class="em">${MKR.ui.icon('truck')}</div><p>No deliveries logged yet. Create one when a driver pulls up — or ahead of time so whoever's on shift just has to tick it off.</p></div>`}
      </div>
      <div class="disclaimer mt16"><span>${MKR.ui.icon('pencil')}</span><div>Confirming a delivery is the whole job in one go: received quantities go into stock, the prices you were charged are recorded, and the docket files itself into Purchases. Short and damaged lines are flagged for you to chase.</div></div>`;

    U.qs('#dlvNew',c).onclick = ()=>{
      if(!its.length){ U.toast('Add some stock items first','amber'); return; }
      newModal(sups, its, ()=>render(c));
    };
    U.qsa('[data-dlv]',c).forEach(b=> b.onclick = ()=>{
      const d = rows.find(x=>x.id===b.dataset.dlv);
      d.status==='expected' ? confirmModal(d, its, ()=>render(c)) : detailModal(d, docketOf(d), sups, purch, claimOf(d), ()=>render(c));
    });
  }

  function newModal(sups, its, after){
    const opt = its.map(i=>`<option value="${i.id}">${U.esc(i.name)} (${U.esc(i.unit||'')})</option>`).join('');
    const lineHtml = ()=>`<tr class="dl-row">
      <td><select class="input dl-item">${opt}</select></td>
      <td class="num"><input class="input dl-ord" type="number" step="0.01" value="1" style="text-align:right"></td>
      <td class="num"><button class="btn btn-ghost btn-sm dl-del" aria-label="remove line">×</button></td></tr>`;
    const wrap = U.el(`<div>
      <div class="row"><div class="field grow"><label>Supplier</label><select class="input" id="d_sup">
        <option value="">— not recorded —</option>${sups.map(s=>`<option value="${s.id}">${U.esc(s.name)}</option>`).join('')}
      </select></div>
      <div class="field grow"><label>Docket / invoice no.</label><input class="input" id="d_doc" placeholder="optional"></div></div>
      <div class="row"><div class="field grow"><label>Expected on</label><input class="input" id="d_due" type="date" value="${U.todayISO()}"></div>
        <div class="field grow"><label>Expected time — optional</label><input class="input" id="d_dueT" type="time"></div></div>
      <div class="tablewrap"><table class="dtable">
        <thead><tr><th>Item</th><th class="num" style="width:110px">Ordered</th><th></th></tr></thead>
        <tbody id="d_lines">${lineHtml()}</tbody></table></div>
      <button class="btn btn-ghost btn-sm mt8" id="d_add">${MKR.ui.icon('plus')} Add line</button>
      <div class="disclaimer"><span>${MKR.ui.icon('clock')}</span>This creates an <b>expected</b> delivery. Whoever takes it in opens it and confirms what actually arrived.</div>
    </div>`);
    const body = U.qs('#d_lines',wrap);
    const bindRow = tr=>{ U.qs('.dl-del',tr).onclick=()=>{ if(U.qsa('.dl-row',body).length>1) tr.remove(); }; };
    U.qsa('.dl-row',body).forEach(bindRow);
    U.qs('#d_add',wrap).onclick = ()=>{ const tr=U.el(lineHtml()); body.appendChild(tr); bindRow(tr); };

    U.modal('New delivery', wrap, {actions:[
      {label:'Cancel', class:'btn-ghost', onClick:c=>c()},
      {label:'Create', class:'btn-dark', onClick:async(close)=>{
        const supId = U.qs('#d_sup',wrap).value||null;
        const lines = U.qsa('.dl-row',body).map(tr=>{
          const id=U.qs('.dl-item',tr).value; const it=its.find(i=>i.id===id)||{};
          return {itemId:id, name:it.name||'', unit:it.unit||'', ordered:Number(U.qs('.dl-ord',tr).value)||0,
                  received:null, unitPrice:it.price||0, condition:'ok', note:''};
        }).filter(l=>l.ordered>0);
        if(!lines.length){ U.toast('Add at least one line','red'); return; }
        const s = sups.find(x=>x.id===supId);
        const due = U.qs('#d_due',wrap).value, dueT = U.qs('#d_dueT',wrap).value;
        await save({supplierId:supId, supplierName:s?s.name:'', docketNo:U.qs('#d_doc',wrap).value.trim(), lines,
          dueTs: due ? new Date(due+'T'+(dueT||'00:00')).getTime() : Date.now(), dueTime: dueT||''});
        close(); U.toast('Delivery created','green'); after();
      }}
    ]});
  }

  function confirmModal(d, its, after){
    const condOpts = (sel)=> Object.entries(COND).map(([k,v])=>`<option value="${k}" ${sel===k?'selected':''}>${v.label}</option>`).join('');
    const hasPerishable = (d.lines||[]).some(l=>{ const it=its.find(i=>i.id===l.itemId); return it && it.kind==='perishable'; });

    // What the driver actually hands over is cartons, and the docket prices them
    // by the carton — so that is what this form lets you type. Items set up with
    // a pack default to counting in packs; everything is converted back to the
    // item's own unit before it reaches stock, so nothing downstream changes.
    const S = MKR.stock;
    const packOf = (l)=>{
      const it = its.find(i=>i.id===l.itemId);
      const n = S.packSizeOf(it);
      return n ? {size:n, label:S.packLabelOf(it), unit:S.unitOf(it)} : null;
    };
    const wrap = U.el(`<div>
      <div class="faint" style="font-size:12.5px;margin-bottom:10px">${U.esc(d.supplierName||'Supplier')}${d.docketNo?' · docket '+U.esc(d.docketNo):''} · raised ${U.fmtDateTime(d.ts)}</div>
      <div class="tablewrap"><table class="dtable">
        <thead><tr><th>Item</th><th class="num" style="width:78px">Ordered</th><th class="num" style="width:96px">Received</th><th class="num" style="width:104px">Price</th><th style="width:140px">Condition</th></tr></thead>
        <tbody>${(d.lines||[]).map((l,i)=>{
          const pk = packOf(l);
          const ord = +l.ordered||0;
          const rec0 = l.received!=null ? +l.received||0 : ord;              // always in the item's unit
          const recShown = pk ? U.round2(rec0/pk.size) : rec0;
          const prShown  = pk ? U.round2((+l.unitPrice||0)*pk.size) : (+l.unitPrice||0);
          return `<tr class="dc-row" data-i="${i}" data-pack="${pk?pk.size:''}" data-packlabel="${pk?U.esc(pk.label):''}" data-unit="${U.esc(pk?pk.unit:(l.unit||''))}" data-ord="${ord}">
          <td><b>${U.esc(l.name)}</b><div class="faint" style="font-size:11.5px">${U.esc(l.unit||'')}</div></td>
          <td class="num faint"><span class="dc-ord">${ord}</span></td>
          <td class="num"><input class="input dc-rec" type="number" step="0.01" value="${recShown}" style="text-align:right">
            ${pk?`<select class="input dc-basis" data-prev="pack" style="display:block;width:100%;margin-top:4px;font-size:11.5px;padding:2px 4px" aria-label="Count in packs or in ${U.esc(pk.unit)}">
              <option value="pack" selected>${U.esc(pk.label)}s</option>
              <option value="unit">${U.esc(pk.unit)}</option></select>`:''}</td>
          <td class="num"><input class="input dc-price" type="number" step="0.01" value="${prShown}" style="text-align:right">
            ${pk?`<div class="faint dc-conv" style="font-size:11px;margin-top:4px;text-align:right"></div>`:''}</td>
          <td><select class="input dc-cond">${condOpts(l.condition||'ok')}</select></td></tr>`;
        }).join('')}</tbody>
      </table></div>
      <div class="dkt-runtotal"><span>Docket total</span><b id="d_total">${U.money(0)}</b></div>

      <div class="row mt12"><div class="field grow"><label>Docket / invoice no.</label><input class="input" id="d_doc" value="${U.esc(d.docketNo||'')}" placeholder="what's printed on the paper"></div>
        <div class="field grow"><label>Paid by</label><select class="input" id="d_pay">
          <option value="">— not recorded —</option>${PAY.map(x=>`<option value="${x}">${x}</option>`).join('')}
        </select></div></div>
      <div class="row"><div class="field grow"><label>Freight / delivery fee</label><input class="input" id="d_fee" type="number" step="0.01" value="0"></div>
        <div class="field grow"><label>GST shown on the docket</label><input class="input" id="d_gst" type="number" step="0.01" value="0"></div></div>

      ${hasPerishable?`<div class="field"><label>Chilled/frozen temperature on arrival (°C)</label><input class="input" id="d_temp" type="number" step="0.1" placeholder="e.g. 3.5"></div>`:''}
      <div class="field"><label>Received by</label><input class="input" id="d_by" value="${U.esc(me())}"></div>
      <div class="field"><div class="row" style="justify-content:space-between;align-items:baseline">
          <label>Signature</label><button type="button" class="btn btn-ghost btn-sm" id="d_sigclr">Clear</button></div>
        <div class="sigpad" id="d_sig" aria-label="Sign here with your finger or mouse"><canvas></canvas></div></div>
      <div class="field"><label>Note (optional)</label><input class="input" id="d_note" placeholder="e.g. 2 boxes short, driver to redeliver Friday"></div>
      <div class="field"><label id="d_photoLabel">Photos of the docket or the problem</label>
        <div class="shots" id="d_shots"></div>
        <div class="row gap8 wrap mt8">
          <label class="btn btn-ghost btn-sm" style="cursor:pointer">${MKR.ui.icon('camera')} Add photos
            <input type="file" id="d_photo" accept="image/*" multiple hidden></label>
          <button type="button" class="btn btn-dark btn-sm" id="d_read" disabled>${MKR.ui.icon('sparkle')} <span id="d_readTxt">Read the docket</span></button>
        </div></div>
      <div class="disclaimer" id="d_photoWhy" hidden><span>${MKR.ui.icon('camera')}</span>A short or damaged line needs the photo. Suppliers refuse claims they can't see, and by the time anyone chases it the crate has been thrown out.</div>
      <div class="disclaimer mt12"><span>${MKR.ui.icon('receipt')}</span>Signing here files the docket as well: received quantities go into stock at the prices above, and the whole thing lands in Purchases. You never type it twice.</div>
    </div>`);
    // As many photos as the docket needs — a two-page invoice and a photo of the
    // broken crate are three pictures, and making someone choose one of them is
    // how the evidence for a claim goes missing. Each is kept twice: full size
    // for the record, and a small copy the reader can actually be sent.
    let shots=[];
    // A name in a box proves nothing to a supplier arguing about a short
    // delivery — the mark does. Same pad the complaint form signs on.
    const sig = U.signaturePad(U.qs('#d_sig',wrap));
    U.qs('#d_sigclr',wrap).onclick = ()=> sig.clear();

    // One reading of a row, in both currencies at once: what was typed, and what
    // that means in the item's own unit. Everything else on this form — the
    // running total, the short-delivery flag, what gets saved — goes through it,
    // so there is exactly one place the pack conversion can be wrong.
    function rowState(tr){
      const size   = Number(tr.dataset.pack)||0;
      const bs     = U.qs('.dc-basis',tr);
      const isPack = size>0 && (!bs || bs.value==='pack');
      const n = Number(U.qs('.dc-rec',tr).value)||0;
      const p = Number(U.qs('.dc-price',tr).value)||0;
      return { size, isPack, n, p,
        units:     isPack ? U.round2(n*size) : n,
        unitPrice: isPack ? U.round2(p/size) : p,
        // Packs × price-per-pack, or units × price-per-unit — the same product
        // either way, which is why the docket total needs no special case.
        amount: U.round2(n*p) };
    }

    // The total moves as they check the lines off, so what gets signed for is
    // what lands in the books.
    function recalc(){
      let sub = 0;
      U.qsa('.dc-row',wrap).forEach(tr=>{
        const st = rowState(tr);
        sub += st.amount;
        const unit = tr.dataset.unit||'';
        const conv = U.qs('.dc-conv',tr);
        // Spell the conversion out on the row. An owner signing for "3 × $60"
        // should be able to see it is $6.00/kg without doing it in their head.
        if(conv) conv.textContent = st.isPack
          ? `= ${st.units} ${unit} · ${U.money(st.unitPrice)}/${unit}`
          : `${U.money(st.unitPrice)}/${unit}`;
        const ordEl = U.qs('.dc-ord',tr);
        const ord = Number(tr.dataset.ord)||0;
        if(ordEl) ordEl.textContent = (st.isPack && st.size>0) ? U.round2(ord/st.size) : ord;
      });
      const total = sub + (Number(U.qs('#d_fee',wrap).value)||0) + (Number(U.qs('#d_gst',wrap).value)||0);
      U.qs('#d_total',wrap).textContent = U.money(total);
    }
    U.qsa('.dc-row',wrap).forEach(tr=>{
      U.qs('.dc-rec',tr).addEventListener('input', recalc);
      U.qs('.dc-price',tr).addEventListener('input', recalc);
      // Switching basis converts what is already typed rather than clearing it —
      // someone who typed 3 cartons and then realised they want kilos meant 30,
      // not 3, and retyping is where a wrong figure gets signed for.
      const bs = U.qs('.dc-basis',tr);
      if(bs) bs.onchange = ()=>{
        const size = Number(tr.dataset.pack)||0;
        const rec = U.qs('.dc-rec',tr), pr = U.qs('.dc-price',tr);
        if(size>0 && bs.dataset.prev!==bs.value){
          const toUnit = bs.value==='unit';
          rec.value = U.round2((Number(rec.value)||0) * (toUnit ? size : 1/size));
          pr.value  = U.round2((Number(pr.value)||0)  * (toUnit ? 1/size : size));
        }
        bs.dataset.prev = bs.value;
        recalc();
      };
    });
    ['#d_fee','#d_gst'].forEach(sel=> U.qs(sel,wrap).oninput = recalc);
    recalc();
    function drawShots(){
      const host = U.qs('#d_shots',wrap);
      host.innerHTML = shots.length
        ? shots.map((sh,i)=>`<div class="shot"><img src="${sh.big}" alt="">
            <button type="button" class="shot-x" data-shot="${i}" aria-label="Remove photo ${i+1}">×</button></div>`).join('')
        : `<div class="shot-empty">${MKR.ui.icon('camera')} No photos yet</div>`;
      U.qsa('[data-shot]',host).forEach(b=> b.onclick=()=>{ shots.splice(+b.dataset.shot,1); drawShots(); syncPhotoReq(); });
      U.qs('#d_read',wrap).disabled = !shots.length;
      syncPhotoReq();
    }
    U.qs('#d_photo',wrap).onchange=(e)=>{
      const files = Array.from(e.target.files||[]);
      e.target.value = '';
      files.forEach(f=>{
        const sh = {};
        // Full size stays legible enough to argue with a supplier about; the
        // small copy is what the reader accepts inline.
        U.readImage(f, (big)=>{ sh.big = big; shots.push(sh); drawShots(); });
        U.readImage(f, (small)=>{ sh.small = small; }, 800);
      });
    };

    // One tap: the paper the driver handed over, typed in for you. It fills the
    // form — it never saves. What gets signed for is still what the person at
    // the back door read off the docket and agreed with.
    const WANT = `{"docketNo":"","fee":0,"gst":0,"lines":[{"name":"","qty":0,"unitPrice":0}]}`;
    U.qs('#d_read',wrap).onclick = async()=>{
      const img = (shots.find(s=>s.small)||{}).small || (shots[0]||{}).big;
      if(!img) return;
      const btn = U.qs('#d_read',wrap), txt = U.qs('#d_readTxt',wrap);
      btn.disabled = true; txt.textContent = 'Reading…';
      const got = await MKR.assistant.readImage(img, WANT);
      btn.disabled = false; txt.textContent = 'Read the docket';
      let hits = 0;
      const doc = U.qs('#d_doc',wrap);
      if(got.docketNo && !doc.value.trim()){ doc.value = got.docketNo; hits++; }
      [['fee', got.fee], ['gst', got.gst]].forEach(([k,v])=>{
        const el = U.qs('#d_'+k,wrap);
        if(v>0 && !(Number(el.value)>0)){ el.value = U.round2(v); hits++; }
      });
      // Match on the name that is already on the row: the docket's wording and
      // the venue's own item names rarely agree word for word, so either one
      // containing the other is close enough to fill in — and the person is
      // looking straight at both.
      const norm = (x)=> String(x||'').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g,'');
      (got.lines||[]).forEach(l=>{
        const key = norm(l.name); if(!key) return;
        const tr = U.qsa('.dc-row',wrap).find(r=>{
          const n = norm(U.qs('b',r).textContent);
          return n && (n.includes(key) || key.includes(n));
        });
        if(!tr) return;
        if(l.qty>0){ U.qs('.dc-rec',tr).value = U.round2(l.qty); hits++; }
        if(l.unitPrice>0){ U.qs('.dc-price',tr).value = U.round2(l.unitPrice); hits++; }
      });
      recalc();
      U.toast(hits ? `Read ${hits} figure${hits===1?'':'s'} — check them against the paper`
                   : "Couldn't read that docket — type it in", hits?'green':'amber');
    };

    // The photo stays optional for a clean delivery — nobody needs a picture of
    // three good crates, and a form that demands one gets worked around. It
    // becomes required the moment a line is marked short, damaged or wrong,
    // because that is the moment it turns into money someone has to chase.
    const photoNeeded = ()=> U.qsa('.dc-row',wrap).some(tr=> U.qs('.dc-cond',tr).value!=='ok');
    function syncPhotoReq(){
      const need = photoNeeded();
      U.qs('#d_photoWhy',wrap).hidden = !need;
      const lbl = U.qs('#d_photoLabel',wrap);
      if(lbl) lbl.textContent = need
        ? 'Photo of the problem — at least one is required'
        : 'Photos of the docket or the problem (optional)';
      U.qs('#d_shots',wrap).classList.toggle('needs', need && !shots.length);
    }
    drawShots();          // after syncPhotoReq's own dependencies exist

    // Receiving less than ordered is the usual reason for a problem — pre-flag
    // it. Compared in the item's own unit, because the box on screen may be
    // counting cartons while `ordered` has always been in kilos.
    U.qsa('.dc-row',wrap).forEach((tr,i)=>{
      U.qs('.dc-rec',tr).addEventListener('input', ()=>{
        const sel=U.qs('.dc-cond',tr);
        if(sel.value==='ok' && rowState(tr).units < (+d.lines[i].ordered||0)) sel.value='short';
        syncPhotoReq();
      });
      U.qs('.dc-cond',tr).addEventListener('change', syncPhotoReq);
    });
    syncPhotoReq();

    U.modal('Confirm delivery', wrap, {actions:[
      {label:'Reject whole delivery', class:'btn-ghost', onClick:async(close)=>{
        const why = prompt('Why is this delivery being turned away?'); if(why==null) return;
        await reject(d, why.trim()); close(); U.toast('Delivery rejected','amber'); after();
      }},
      {label:'Confirm', class:'btn-dark', onClick:async(close)=>{
        const lines = U.qsa('.dc-row',wrap).map((tr,i)=>{
          const st = rowState(tr);
          // `received` and `unitPrice` are always the item's own unit, whichever
          // way the row was typed. The pack figures ride along beside them so
          // the docket can be shown back exactly as the paper was written.
          const out = { ...d.lines[i], received: st.units, unitPrice: st.unitPrice,
                        condition: U.qs('.dc-cond',tr).value };
          // Only when it was actually counted in packs. A line switched to the
          // item's own unit was weighed, not counted, and saying "2.67 crates"
          // on the docket would be inventing a sentence the supplier never wrote.
          if(st.size>0 && st.isPack){
            out.packSize  = st.size;
            out.packLabel = tr.dataset.packlabel||'pack';
            out.packQty   = st.n;
            out.packPrice = st.p;
          }
          return out;
        });
        const by = U.qs('#d_by',wrap).value.trim();
        if(!by){ U.toast('Who received this?','red'); return; }
        if(!sig.signed()){
          U.toast('Sign the docket — a name on its own is not a signature','red');
          U.qs('#d_sig',wrap).scrollIntoView({block:'center', behavior:'smooth'}); return;
        }
        // Checked against the lines being saved, not the form state, so this
        // can't be slipped past by changing a condition after the last redraw.
        if(lines.some(l=>l.condition && l.condition!=='ok') && !shots.length){
          U.toast('Add a photo of the problem — the claim needs it','red');
          U.qs('#d_shots',wrap).classList.add('needs');
          U.qs('#d_shots',wrap).scrollIntoView({block:'center', behavior:'smooth'});
          return;
        }
        const tempEl = U.qs('#d_temp',wrap);
        await confirm(d, {lines, receivedBy:by, signature:sig.data(), tempC:tempEl?tempEl.value:'',
          note:U.qs('#d_note',wrap).value.trim(),
          photo:(shots[0]||{}).big||null, photos:shots.map(x=>x.big).filter(Boolean),
          docketNo:U.qs('#d_doc',wrap).value.trim(), payMethod:U.qs('#d_pay',wrap).value,
          fee:Number(U.qs('#d_fee',wrap).value)||0, gst:Number(U.qs('#d_gst',wrap).value)||0});
        close(); U.toast('Signed · stock updated and the docket is filed','green'); after();
      }}
    ]});
  }

  // Chasing the money back. The amount is worked out from the docket rather than
  // typed, because the owner already told us what arrived and in what state —
  // asking again is how the number ends up wrong. It stays editable: suppliers
  // settle on round figures and part-credits all the time.
  function claimModal(d, claim, after){
    const cl = claimableOf(d);
    const cur = claim || {status:'open', amount:cl.amount, note:'', lines:cl.lines, history:[]};
    const wrap = U.el(`<div>
      <div class="faint" style="font-size:12.5px;margin-bottom:10px">${U.esc(d.supplierName||'Supplier')}${d.docketNo?' · '+U.esc(d.docketNo):''} · ${U.fmtDate(d.ts)}</div>

      ${cl.lines.length?`<div class="list">${cl.lines.map(l=>`<div class="li">
        <div class="meta"><b>${U.esc(l.name)}</b><span>${l.qty} ${U.esc(l.unit||'')} × ${U.money(l.unitPrice)} · <span>${U.esc((COND[l.condition]||{}).label||l.condition)}</span></span></div>
        <b>${U.money(l.amount)}</b></div>`).join('')}</div>`
      : `<div class="disclaimer"><span>ℹ️</span><div>Nothing on this docket was charged for and unusable, so there's no refund to ask for. Track it here anyway if they owe you a replacement.</div></div>`}

      ${cl.short.length?`<div class="alert info mt12"><span>${MKR.ui.icon('receipt')}</span><div>
        <b>${cl.short.length===1?'One line came up short':`${cl.short.length} lines came up short`}</b>
        <div class="faint">${cl.short.map(l=>`<div>${U.esc(l.name)} · <span>ordered ${l.ordered}, took ${l.received!=null?l.received:0}</span></div>`).join('')}</div>
        <div>You were only charged for what turned up, so there's nothing to refund here. Check their monthly statement bills it the same way.</div>
      </div></div>`:''}

      <div class="row mt12">
        <div class="field grow"><label>What you're chasing</label><input class="input" id="cl_amt" type="number" step="0.01" value="${cur.amount||0}"></div>
        <div class="field grow"><label>Where it's up to</label><select class="input" id="cl_st">
          ${Object.entries(CLAIM).map(([k,v])=>`<option value="${k}" ${cur.status===k?'selected':''}>${v.label}</option>`).join('')}
        </select></div>
      </div>
      <div class="field"><label>What they said</label><input class="input" id="cl_note" value="${U.esc(cur.note||'')}" placeholder="e.g. Kim will credit it on the next invoice"></div>

      ${(cur.history||[]).length>1?`<div class="list mt12">${cur.history.slice().reverse().map(h=>`<div class="li">
        <div class="meta"><b>${U.esc((CLAIM[h.status]||{}).label||h.status)}</b><span>${U.fmtDateTime(h.ts)} · ${U.esc(h.by||'—')}${h.note?' · '+U.esc(h.note):''}</span></div></div>`).join('')}</div>`:''}
    </div>`);

    U.modal('Chasing this delivery', wrap, {actions:[
      {label:'Cancel', class:'btn-ghost', onClick:c=>c()},
      {label:'Save', class:'btn-dark', onClick:async(close)=>{
        await saveClaim({id:claim?claim.id:undefined, deliveryId:d.id, supplierId:d.supplierId,
          supplierName:d.supplierName||'', lines:cl.lines,
          amount:Number(U.qs('#cl_amt',wrap).value)||0, status:U.qs('#cl_st',wrap).value,
          note:U.qs('#cl_note',wrap).value.trim()});
        close(); U.toast('Claim updated','green'); if(after) after();
      }}
    ]});
  }

  function detailModal(d, docket, sups, purch, claim, after){
    const st=STATUS[d.status]||STATUS.expected;
    const wrap = U.el(`<div>`+`
      <div class="faint" style="font-size:12.5px;margin-bottom:8px">${U.fmtDateTime(d.ts)}${d.docketNo?' · docket '+U.esc(d.docketNo):''} · <span class="pill ${st.pill}">${st.label}</span></div>
      ${d.status==='rejected' ? `<div class="alert red"><span>${MKR.ui.icon('warning')}</span><div>Turned away · ${U.esc(d.note||'no reason recorded')}</div></div>` : `
      <div class="tablewrap"><table class="dtable">
        <thead><tr><th>Item</th><th class="num">Ordered</th><th class="num">Received</th><th class="num">Unit price</th><th>Condition</th></tr></thead>
        <tbody>${(d.lines||[]).map(l=>{ const cd=COND[l.condition]||COND.ok;
          return `<tr><td>${U.esc(l.name)}</td><td class="num faint">${l.ordered}</td><td class="num"><b>${l.received!=null?l.received:'—'}</b></td>
            <td class="num">${U.money(l.unitPrice)}</td><td><span class="pill ${cd.pill}">${cd.label}</span></td></tr>`; }).join('')}</tbody>
      </table></div>
      <div class="list mt12">
        <div class="li"><div class="meta"><span>Received by</span><b>${U.esc(d.receivedBy||'—')}</b></div></div>
        ${d.signature?`<div class="li"><div class="meta"><span>Signature</span></div><img src="${d.signature}" alt="signature" style="height:44px;margin-left:auto"></div>`:''}
        ${d.tempC!=null&&d.tempC!==''?`<div class="li"><div class="meta"><span>Temperature on arrival</span><b>${U.esc(String(d.tempC))} °C</b></div></div>`:''}
        ${d.payMethod?`<div class="li"><div class="meta"><span>Paid by</span><b>${U.esc(d.payMethod)}</b></div></div>`:''}
        ${docket?`<div class="li"><div class="meta"><span>Filed as a docket</span><b>${U.esc(docket.invoiceNo||'no number')} · ${U.money(docket.total)}</b></div></div>`:''}
        ${claim?`<div class="li"><div class="meta"><span>Money being chased</span><b>${claim.amount?U.money(claim.amount):'nothing to refund'} · ${U.esc(CLAIM[claim.status].label)}</b></div></div>`:''}
        ${d.note?`<div class="li"><div class="meta"><span>Note</span><b>${U.esc(d.note)}</b></div></div>`:''}
      </div>
      ${claim && claim.note ? `<div class="disclaimer mt12"><span>${MKR.ui.icon(CLAIM[claim.status].ic)}</span><div>${U.esc(claim.note)}</div></div>`:''}
      ${(d.photos&&d.photos.length?d.photos:(d.photo?[d.photo]:[]))
        .map(src=>`<img src="${src}" style="max-width:100%;border-radius:12px;margin-top:12px">`).join('')}`}
    </div>`);

    // The delivery and the docket are two views of one event, so each opens the
    // other rather than making anyone go looking.
    const actions = [];
    const bad = (d.lines||[]).some(l=>l.condition && l.condition!=='ok');
    if(bad || claim) actions.push({label: claim?'Update the claim':'Chase it', class:'btn-ghost', onClick:(close)=>{
      close(); claimModal(d, claim, after);
    }});
    if(docket && MKR.stockReceipt) actions.push({label:'See the docket', class:'btn-dark', onClick:async(close)=>{
      close();
      let venue='My Kitchen';
      try{ const k=await MKR.db.get('kitchens',(MKR.auth.current()||{}).kitchenId||'k_main'); if(k&&k.name) venue=k.name; }catch(e){}
      MKR.stockReceipt.openReceipt(docket, (sups||[]).find(s=>s.id===d.supplierId)||null, venue, purch||[], d);
    }});
    U.modal(`Delivery · ${d.supplierName||'Supplier'}`, wrap, actions.length?{actions}:undefined);
  }

  MKR.deliveries = { COND, STATUS, CLAIM, all, pending, claims, claimableOf, saveClaim, save, confirm, reject, render };
})();
