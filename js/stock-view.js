/* ===== Stock page (owner + manager) =====
   Four tabs over MKR.stock: Stock · Purchases · Suppliers · Forecast.
   Everything here is purchase cost — no sales, no payroll, no reconciliation.
*/
window.MKR = window.MKR || {};
(function(){
  const U = MKR.util;
  const S = ()=>MKR.stock;
  const TABS = [
    {id:'stock',    label:'Stock',     ic:'box'},
    {id:'purchases',label:'Purchases', ic:'receipt'},
    {id:'prices',   label:'Prices',    ic:'ticket'},
    {id:'suppliers',label:'Suppliers', ic:'truck'},
    {id:'forecast', label:'Forecast',  ic:'trend'},
  ];
  let tab = 'stock';

  // How much to order: enough to cover the delivery lead time plus a week, less
  // whatever is already on the shelf. One definition, used by the forecast, the
  // supplier order sheets and the shelf's basket — three screens that would
  // otherwise quietly disagree about the same number.
  const suggestQty = (r)=>{
    const target = r.daily>0 ? r.daily*((+r.leadTimeDays||2)+7) : (+r.safety||0)*2;
    return Math.max(0, U.round2(target - (+r.qty||0)));
  };

  // The Stock tab draws the same data two ways: the shelf (a picture of the room)
  // or the list (the table). Shelf is the default — it's what an owner who never
  // reads a spreadsheet can act on — and the choice sticks per device.
  const VKEY = 'mkr_stock_view';
  let view = (function(){ try{ return localStorage.getItem(VKEY)==='list' ? 'list' : 'shelf'; }catch(e){ return 'shelf'; } })();
  const viewSwitch = ()=> `<div class="viewswitch" role="group" aria-label="How to show stock">
      <button class="${view==='shelf'?'on':''}" data-view="shelf">${MKR.ui.icon('inbox')}Shelf</button>
      <button class="${view==='list'?'on':''}" data-view="list">${MKR.ui.icon('list')}List</button>
    </div>`;

  async function render(c){
    // Any re-render tears the shelf's basket bar down; the shelf puts this back
    // when it draws one again.
    document.body.classList.remove('gv-basket');
    c.innerHTML = `
      <div class="section-head"><div><h2>Stock &amp; costs</h2><p>Ingredients and tools · what you hold, what it cost, who you buy it from</p></div>
        <div class="row gap8 wrap" id="stockActions"></div></div>
      <div class="tabbar" id="stockTabs">${TABS.map(t=>`<button class="tab ${t.id===tab?'active':''}" data-tab="${t.id}">${MKR.ui.icon(t.ic)}${t.label}</button>`).join('')}</div>
      <div id="stockBody"></div>`;
    U.qsa('[data-tab]',c).forEach(b=> b.onclick = ()=>{ tab=b.dataset.tab; render(c); });
    const body = U.qs('#stockBody',c), actions = U.qs('#stockActions',c);
    if(tab==='stock')     return stockTab(body, actions, ()=>render(c));
    if(tab==='purchases') return purchasesTab(body, actions, ()=>render(c));
    if(tab==='prices')    return MKR.stockPrices.tab(body, actions, ()=>render(c));
    if(tab==='suppliers') return suppliersTab(body, actions, ()=>render(c));
    if(tab==='forecast')  return forecastTab(body, actions, ()=>render(c));
  }

  // ---------------- Stock ----------------
  // Which shelf is being looked at. '' means all of them; UNCAT is the bucket
  // for items nobody has filed yet — it only appears when something is in it,
  // so a venue that never uses categories never sees the concept at all.
  const UNCAT = '__uncat__';
  const CKEY = 'mkr_stock_cat';
  let cat = (function(){ try{ return localStorage.getItem(CKEY)||''; }catch(e){ return ''; } })();
  const catOf = (r)=> (r.category||'').trim();
  const inCat = (r)=> !cat || (cat===UNCAT ? !catOf(r) : catOf(r).toLowerCase()===cat.toLowerCase());

  async function stockTab(c, actions, reload){
    const all = await S().overview();
    const cats = await S().categories();
    // A category the owner deleted from the list but that items still point at
    // would otherwise make those items unreachable — no tab, and filtered out
    // of every other tab. Show it rather than hiding stock.
    const orphan = [...new Set(all.map(catOf).filter(Boolean))]
      .filter(x=>!cats.some(y=>y.toLowerCase()===x.toLowerCase()));
    const shelves = [...cats, ...orphan];
    if(cat && cat!==UNCAT && !shelves.some(x=>x.toLowerCase()===cat.toLowerCase())) cat = '';

    const rows = all.filter(inCat);
    const total = rows.reduce((t,r)=>t+r.value,0);
    const perish = rows.filter(r=>r.kind==='perishable'), durable = rows.filter(r=>r.kind!=='perishable');
    const flagged = rows.filter(r=>r.low||r.expiring).length;

    const countIn = (name)=> all.filter(r=> name===UNCAT ? !catOf(r) : catOf(r).toLowerCase()===name.toLowerCase()).length;
    const chip = (id, label, n)=> `<button class="catchip ${cat===id?'on':''}" data-cat="${U.esc(id)}">${U.esc(label)}<span class="catchip-n">${n}</span></button>`;
    const uncatN = all.filter(r=>!catOf(r)).length;
    const catBar = (shelves.length || uncatN) ? `<div class="catbar" role="group" aria-label="Filter by category">
        ${chip('', 'All', all.length)}
        ${shelves.map(s=>chip(s, s, countIn(s))).join('')}
        ${uncatN ? chip(UNCAT, 'Unfiled', uncatN) : ''}
        <button class="catchip ghost" id="catEdit" title="Add, rename or remove categories">＋ Edit</button>
      </div>` : `<div class="catbar"><button class="catchip ghost" id="catEdit">＋ Add categories</button></div>`;

    // The primary action leads and the occasional ones fold into a menu. Five
    // buttons of equal weight wrapping over two rows told the owner nothing
    // about which one they open every day (Add items) and which one they open
    // once a month (Export CSV).
    actions.innerHTML = `${viewSwitch()}
      <button class="btn btn-dark btn-sm" id="stkAdd">${MKR.ui.icon('plus')} Add items</button>
      <details class="omenu"><summary class="btn btn-ghost btn-sm" aria-label="More stock actions">${MKR.ui.icon('dots')}</summary>
        <div class="omenu-pop">
          <button id="stkCount">${MKR.ui.icon('checksq')} Stocktake</button>
          <button id="stkWaste">${MKR.ui.icon('warning')} Threw it out</button>
          <button id="stkCsv">${MKR.ui.icon('download')} Export CSV</button>
        </div>
      </details>`;

    U.qsa('[data-view]',actions).forEach(b=> b.onclick = ()=>{
      view = b.dataset.view;
      try{ localStorage.setItem(VKEY, view); }catch(e){}
      reload();
    });

    // The icon is a separate argument, not baked into `title`: the title runs
    // through U.esc (and through the translator), and neither should be handed
    // markup.
    const group = (ic, title, hint, list)=>`
      <div class="card pad20 mt16">
        <div class="section-title">${MKR.ui.icon(ic)}${U.esc(title)}<span class="faint" style="font-size:12px;font-weight:500">${U.esc(hint)}</span></div>
        ${list.length?`<div class="tablewrap"><table class="dtable">
          <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th><th>Price trend</th><th>Supplier</th><th></th></tr></thead>
          <tbody>${list.map(rowHtml).join('')}</tbody></table></div>`
          :`<div class="empty" style="padding:18px"><div class="em">${MKR.ui.icon('box')}</div><p>Nothing here yet</p></div>`}
      </div>`;

    if(view==='shelf' && MKR.stockGame){
      await MKR.stockGame.render(c, {rows, reload, onEdit:(r)=> itemModal(r, reload)});
      // The shelf paints the whole pane itself, so the category bar goes back on
      // top of it afterwards rather than being handed in.
      c.insertAdjacentHTML('afterbegin', catBar);
    } else {
      c.innerHTML = `${catBar}
        <div class="statline">
          <span class="statcell"><b>${U.money(total)}</b><i>stock value</i></span>
          <span class="statcell"><b>${U.money(perish.reduce((t,r)=>t+r.value,0))}</b><i>perishable</i></span>
          <span class="statcell"><b>${U.money(durable.reduce((t,r)=>t+r.value,0))}</b><i>non-perishable</i></span>
          <span class="statcell"${flagged?' style="color:var(--amber-ink)"':''}><b>${flagged}</b><i>needs attention</i></span>
        </div>
        ${group('clock', 'Perishable · goes off', 'shelf life tracked from the last delivery', perish)}
        ${group('utensils', 'Non-perishable · tools & consumables', 'chopsticks, containers, gloves — counted, never expires', durable)}
        <div class="disclaimer mt16"><span>ℹ️</span>Amount = quantity × the last price you actually paid. Price trend compares your two most recent purchase prices for that item.</div>`;

      U.qsa('[data-edit]',c).forEach(b=> b.onclick=()=>{ const r=rows.find(x=>x.id===b.dataset.edit); itemModal(r, reload); });
      U.qsa('[data-hist]',c).forEach(b=> b.onclick=()=>{ const r=rows.find(x=>x.id===b.dataset.hist); historyModal(r); });
    }

    U.qsa('[data-cat]',c).forEach(b=> b.onclick = ()=>{
      cat = b.dataset.cat;
      try{ localStorage.setItem(CKEY, cat); }catch(e){}
      reload();
    });
    const editBtn = U.qs('#catEdit',c);
    if(editBtn) editBtn.onclick = ()=> categoryModal(shelves, all, reload);

    U.qs('#stkAdd',actions).onclick   = ()=> bulkAddModal(reload);
    U.qs('#stkCount',actions).onclick = ()=> stocktakeModal(rows, reload);
    U.qs('#stkWaste',actions).onclick = ()=> wasteModal(rows, reload);
    U.qs('#stkCsv',actions).onclick   = ()=>{
      const out=[['Item','Category','Kind','Qty','Unit','Unit price','Amount','Reorder at','Supplier','Last price change']];
      rows.forEach(r=>out.push([r.name, catOf(r)||'—', S().KIND[r.kind].label, r.qty, r.unit||'', (+r.price||0).toFixed(2),
        r.value.toFixed(2), r.safety, (r.supplier&&r.supplier.name)||'', r.move.ts?U.fmtDate(r.move.ts):'']));
      out.push([], ['Total stock value','','','','', total.toFixed(2)]);
      U.downloadCSV(`stock-${U.todayISO()}.csv`, out); U.toast('Exported','green');
    };
  }

  function rowHtml(r){
    const flags = [
      r.low ? '<span class="pill warn">Low</span>' : '',
      r.expiring ? '<span class="pill danger">Near expiry</span>' : '',
    ].join(' ');
    return `<tr>
      <td><b>${U.esc(r.name)}</b> ${flags}<div class="faint" style="font-size:11.5px">reorder at ${r.safety} ${U.esc(r.unit||'')}${r.kind==='perishable'&&r.shelfLifeDays?` · ${r.shelfLifeDays}-day shelf life`:''}</div></td>
      <td class="num">${r.qty}<small class="faint"> ${U.esc(r.unit||'')}</small></td>
      <td class="num">${U.money(r.price)}</td>
      <td class="num"><b>${U.money(r.value)}</b></td>
      <td><button class="linkish" data-hist="${r.id}">${S().moveBadge(r)}</button></td>
      <td>${r.supplier?U.esc(r.supplier.name):'<span class="faint">—</span>'}</td>
      <td class="num"><button class="btn btn-ghost btn-sm" data-edit="${r.id}">Edit</button></td>
    </tr>`;
  }

  function historyModal(r){
    const h = (r.priceHistory||[]).slice().reverse();
    U.modal(`Price history · ${r.name}`, h.length? `<div class="list">${h.map((p,i)=>{
      const prev=h[i+1];
      const pct = prev&&prev.price ? (p.price-prev.price)/prev.price*100 : 0;
      const badge = !prev ? '<span class="pill ghost">first</span>'
        : pct>0 ? `<span class="pill danger">▲ ${pct.toFixed(1)}%</span>`
        : pct<0 ? `<span class="pill ok">▼ ${Math.abs(pct).toFixed(1)}%</span>` : '<span class="pill ghost">—</span>';
      return `<div class="li"><div class="meta"><b>${U.money(p.price)} / ${U.esc(r.unit||'unit')}</b><span>${U.fmtDateTime(p.ts)}${p.note?' · '+U.esc(p.note):''}</span></div>${badge}</div>`;
    }).join('')}</div>` : `<div class="empty"><div class="em">${MKR.ui.icon('ticket')}</div><p>No price recorded yet — it fills in as you log purchases.</p></div>`);
  }

  // Add, rename, remove — and move items in one go, because "make a Seafood
  // shelf" and "put the prawns on it" are the same thought, and a screen that
  // only does the first half sends the owner to edit nine items one at a time.
  function categoryModal(shelves, allRows, after){
    let list = shelves.slice();
    const wrap = U.el(`<div>
      <div class="field"><label>Add a category</label>
        <div class="row gap6"><input class="input grow" id="cm_new" placeholder="e.g. Seafood / Dry store / Packaging">
          <button class="btn btn-dark btn-sm" id="cm_add">Add</button></div></div>
      <div id="cm_list"></div>
      <div class="section-title mt16">Move items</div>
      <div class="faint" style="font-size:12.5px;margin-bottom:8px">Tick what belongs on a shelf, pick it below, and they all move together.</div>
      <div class="tablewrap" style="max-height:260px;overflow:auto"><table class="dtable">
        <tbody id="cm_items"></tbody></table></div>
      <div class="row gap6 mt12"><select class="input grow" id="cm_target"></select>
        <button class="btn btn-ghost btn-sm" id="cm_move">Move ticked</button></div>
      <div class="disclaimer mt12"><span>ℹ️</span>Removing a category never removes stock — those items just go back to Unfiled.</div>
    </div>`);

    const drawList = ()=>{
      U.qs('#cm_list',wrap).innerHTML = list.length ? list.map(s=>`
        <div class="li"><div class="meta"><b>${U.esc(s)}</b>
          <span>${allRows.filter(r=>(r.category||'').toLowerCase()===s.toLowerCase()).length} item(s)</span></div>
          <div class="row gap6">
            <button class="btn btn-ghost btn-sm" data-ren="${U.esc(s)}">Rename</button>
            <button class="btn btn-ghost btn-sm" data-del="${U.esc(s)}">Remove</button>
          </div></div>`).join('')
        : `<div class="empty" style="padding:14px"><p>No categories yet</p></div>`;
      U.qsa('[data-ren]',wrap).forEach(b=> b.onclick = async()=>{
        const from=b.dataset.ren, to=prompt('Rename category', from);
        if(to==null || !to.trim() || to.trim()===from) return;
        await S().renameCategory(from, to.trim());
        list = await S().categories(); drawList(); drawTarget();
      });
      U.qsa('[data-del]',wrap).forEach(b=> b.onclick = async()=>{
        const name=b.dataset.del;
        const n=allRows.filter(r=>(r.category||'').toLowerCase()===name.toLowerCase()).length;
        if(!(await U.confirm('Remove category', n?`${n} item(s) go back to Unfiled. The stock itself is untouched.`:`Remove "${name}"?`, {ok:'Remove', danger:true}))) return;
        await S().renameCategory(name, '');
        list = await S().categories(); drawList(); drawTarget();
      });
    };
    const drawTarget = ()=>{
      U.qs('#cm_target',wrap).innerHTML =
        `<option value="">— Unfiled —</option>` + list.map(s=>`<option value="${U.esc(s)}">${U.esc(s)}</option>`).join('');
    };
    U.qs('#cm_items',wrap).innerHTML = allRows.map(r=>`<tr>
      <td style="width:34px"><input type="checkbox" data-pick="${r.id}"></td>
      <td><b>${U.esc(r.name)}</b></td>
      <td class="faint">${U.esc((r.category||'').trim()||'Unfiled')}</td></tr>`).join('');

    U.qs('#cm_add',wrap).onclick = async()=>{
      const v=U.qs('#cm_new',wrap).value.trim(); if(!v) return;
      list = await S().saveCategories([...list, v]);
      U.qs('#cm_new',wrap).value=''; drawList(); drawTarget();
    };
    U.qs('#cm_move',wrap).onclick = async()=>{
      const ids = U.qsa('[data-pick]',wrap).filter(i=>i.checked).map(i=>i.dataset.pick);
      if(!ids.length){ U.toast('Tick some items first','amber'); return; }
      await S().moveToCategory(ids, U.qs('#cm_target',wrap).value);
      U.toast(`Moved ${ids.length} item(s)`,'green');
      after();
    };
    drawList(); drawTarget();
    U.modal('Categories', wrap, {actions:[{label:'Done', class:'btn-dark', onClick:(close)=>{ close(); after(); }}]});
  }

  async function itemModal(r, after){
    const sups = await S().suppliers();
    const cats = await S().categories();
    const isNew = !r;
    r = r || {kind:'perishable', unit:'kg', qty:0, safety:0, price:0, leadTimeDays:2,
              // A new item added while a shelf is being viewed belongs on that
              // shelf — asking again is a question the screen already answered.
              category: (cat && cat!==UNCAT) ? cat : ''};
    // An item pointing at a category the owner has since deleted must still show
    // its own value, or saving the form would silently refile it.
    const catOpts = [...cats];
    const own = (r.category||'').trim();
    if(own && !catOpts.some(x=>x.toLowerCase()===own.toLowerCase())) catOpts.push(own);
    const wrap = U.el(`<div>
      <div class="field"><label>Name</label><input class="input" id="i_n" value="${U.esc(r.name||'')}" placeholder="e.g. Tomatoes / Chopsticks"></div>
      <div class="field"><label>Type</label><select class="input" id="i_k">
        ${Object.entries(S().KIND).map(([k,v])=>`<option value="${k}" ${r.kind===k?'selected':''}>${v.label} — ${v.hint}</option>`).join('')}
      </select></div>
      <div class="row"><div class="field grow"><label>Quantity on hand</label><input class="input" id="i_q" type="number" step="0.01" value="${r.qty||0}"></div>
        <div class="field grow"><label>Unit</label><input class="input" id="i_u" value="${U.esc(r.unit||'')}" placeholder="kg / box / pcs"></div></div>
      <div class="row"><div class="field grow"><label>Unit price paid (AUD)</label><input class="input" id="i_p" type="number" step="0.01" value="${r.price||0}"></div>
        <div class="field grow"><label>Reorder at</label><input class="input" id="i_s" type="number" step="0.01" value="${r.safety||0}"></div></div>
      <div class="row"><div class="field grow"><label>Category</label>
          <select class="input" id="i_cat">
            <option value="">— Unfiled —</option>
            ${catOpts.map(s=>`<option value="${U.esc(s)}" ${own.toLowerCase()===s.toLowerCase()?'selected':''}>${U.esc(s)}</option>`).join('')}
            <option value="__new">+ New category…</option>
          </select></div>
        <div class="field grow" id="i_catNewWrap" style="display:none"><label>New category name</label>
          <input class="input" id="i_catNew" placeholder="e.g. Seafood"></div></div>
      <div class="row"><div class="field grow"><label>Supplier sells it by the…</label><input class="input" id="i_pl" value="${U.esc(r.packLabel||'')}" placeholder="carton / box / bag — leave blank if none"></div>
        <div class="field grow"><label>How much is in one</label><input class="input" id="i_ps" type="number" step="0.01" min="0" value="${r.packSize||''}" placeholder="e.g. 10"></div></div>
      <div class="disclaimer"><span>${MKR.ui.icon('box')}</span><span id="i_packTxt"></span></div>
      <div class="row"><div class="field grow"><label>Usual supplier</label><select class="input" id="i_sup">
          <option value="">— none —</option>
          ${sups.map(s=>`<option value="${s.id}" ${r.supplierId===s.id?'selected':''}>${U.esc(s.name)}</option>`).join('')}
        </select></div>
        <div class="field grow"><label>Delivery lead time (days)</label><input class="input" id="i_lt" type="number" step="1" value="${r.leadTimeDays||2}"></div></div>
      <div class="field" id="i_slWrap"><label>Shelf life (days) — perishable only</label><input class="input" id="i_sl" type="number" step="1" value="${r.shelfLifeDays||''}" placeholder="e.g. 5"></div>
      <div class="disclaimer"><span>${MKR.ui.icon('sparkle')}</span>Changing the unit price here records a price change, so it shows up in the ▲▼ trend.</div>
    </div>`);
    const syncKind=()=>{ U.qs('#i_slWrap',wrap).style.display = U.qs('#i_k',wrap).value==='perishable'?'':'none'; };
    U.qs('#i_k',wrap).onchange=syncKind; syncKind();

    // The pack never becomes a second unit of account — it only changes what the
    // back door is allowed to type. Say that in the form, because an owner who
    // thinks the pack replaces the unit will enter carton prices everywhere.
    const syncPack=()=>{
      const size  = Number(U.qs('#i_ps',wrap).value)||0;
      const label = U.qs('#i_pl',wrap).value.trim() || 'pack';
      const unit  = U.qs('#i_u',wrap).value.trim() || 'units';
      U.qs('#i_packTxt',wrap).innerHTML = size>0
        ? `1 ${U.esc(label)} = <b>${U.round2(size)} ${U.esc(unit)}</b>. Deliveries can be counted in ${U.esc(label)}s and the app converts — stock, price history and the price page all stay in ${U.esc(unit)}.`
        : `Leave this blank if you buy in ${U.esc(unit)}. Fill it in and the back door counts ${U.esc(label)}s instead of weighing every delivery.`;
    };
    ['#i_ps','#i_pl','#i_u'].forEach(s=>{ U.qs(s,wrap).oninput = syncPack; });
    syncPack();

    const syncCat=()=>{
      const isNewCat = U.qs('#i_cat',wrap).value==='__new';
      U.qs('#i_catNewWrap',wrap).style.display = isNewCat ? '' : 'none';
      if(isNewCat) U.qs('#i_catNew',wrap).focus();
    };
    U.qs('#i_cat',wrap).onchange = syncCat; syncCat();

    const actions = [{label:'Save', class:'btn-dark', onClick:async(close)=>{
      const name=U.qs('#i_n',wrap).value.trim();
      if(!name){ U.toast('Enter a name','red'); return; }
      const price=Number(U.qs('#i_p',wrap).value)||0;
      const kind=U.qs('#i_k',wrap).value;
      const patch={
        id:r.id, name, kind, unit:U.qs('#i_u',wrap).value.trim()||'units',
        qty:Number(U.qs('#i_q',wrap).value)||0, safety:Number(U.qs('#i_s',wrap).value)||0,
        price, supplierId:U.qs('#i_sup',wrap).value||null,
        leadTimeDays:Number(U.qs('#i_lt',wrap).value)||2,
        shelfLifeDays: kind==='perishable' ? (Number(U.qs('#i_sl',wrap).value)||null) : null,
        // A label with no size is meaningless and a size with no label reads as
        // "10 of what?" — an incomplete pair is stored as no pack at all.
        packSize: (Number(U.qs('#i_ps',wrap).value)||0) > 0 ? U.round2(Number(U.qs('#i_ps',wrap).value)) : null,
        packLabel: (Number(U.qs('#i_ps',wrap).value)||0) > 0 ? (U.qs('#i_pl',wrap).value.trim()||'pack') : '',
      };
      const picked = U.qs('#i_cat',wrap).value;
      patch.category = picked==='__new' ? U.qs('#i_catNew',wrap).value.trim() : picked;
      if(!r.id || U.round2(r.price)!==U.round2(price)) patch.priceHistory = pushPriceLocal(r, price);
      await S().saveItem(patch);
      // A category typed here has to join the venue's list, or it exists on one
      // item and nowhere in the picker — invisible the moment you look away.
      if(patch.category){
        const list = await S().categories();
        if(!list.some(x=>x.toLowerCase()===patch.category.toLowerCase())) await S().saveCategories([...list, patch.category]);
      }
      close(); U.toast(isNew?'Item added':'Saved','green'); after();
    }}];
    if(!isNew) actions.unshift({label:'Delete', class:'btn-ghost', onClick:async(close)=>{
      if(!(await U.confirm('Delete item', `Remove ${r.name} from stock?`, {ok:'Delete', danger:true}))) return;
      await S().removeItem(r.id); close(); U.toast('Deleted','amber'); after();
    }});
    U.modal(isNew?'Add stock item':'Edit '+r.name, wrap, {actions});
  }
  // Mirrors MKR.stock's internal price-history append for manual price edits.
  function pushPriceLocal(r, price){
    const h=(r.priceHistory||[]).slice(); const p=U.round2(price);
    const last=h[h.length-1];
    if(!last || U.round2(last.price)!==p) h.push({ts:Date.now(), price:p, note:'manual edit'});
    return h.slice(-40);
  }

  /* ---------------- Adding stock: write the list, not the form ----------------
     Setting a kitchen up one modal at a time is the fastest way to make someone
     give up on the whole app. Nobody has forty ingredients in their head as
     forty forms — they have them as a list, usually already written on paper or
     in a phone note.

     So: paste the list. One thing per line, in whatever shape it was written —
     "Tomatoes 6 kg 5.80", "番茄 6kg", or just "Tomatoes". Everything parsed out
     is shown as an editable table before anything is saved, because a guess you
     can see and correct is useful and a guess you can't is not.               */
  // "Non-perishable" means it doesn't go off — the tools and consumables, plus
  // the dry-store staples that sit there quite happily. Every guess is a
  // dropdown in the preview, so being wrong here costs one tap.
  const DURABLE_RE = /chopstick|glove|container|takeaway|box|bag|napkin|tissue|paper|towel|foil|wrap|cup|straw|plate|bowl|knife|sponge|detergent|clean|soap|oil|salt|sugar|vinegar|soy|sauce|flour|spice|筷|手套|餐盒|打包|袋|纸|紙|保鲜膜|保鮮膜|锡纸|錫紙|杯|碗|碟|盘|盤|刀|抹布|洗洁精|洗潔精|清洁|清潔|油|盐|鹽|糖|醋|酱油|醬油|面粉|麵粉|香料/i;
  const LIQUID_RE  = /oil|sauce|vinegar|wine|milk|water|juice|油|酱|醬|醋|酒|奶|水|汁/i;

  // Common lines, so a venue that is starting from nothing has something to
  // start from. Tapping one appends it to the list — it's a shortcut, not a
  // template: everything stays editable.
  const COMMON = [
    ['Fresh', ['Tomatoes 5 kg','Onions 10 kg','Garlic 3 kg','Ginger 2 kg','Lettuce 4 kg','Fresh herbs 6 bunch','Mushrooms 3 kg','Chilli 2 kg']],
    ['Protein', ['Beef brisket 10 kg','Chicken thigh 10 kg','Pork belly 8 kg','Prawns 4 kg','Fish fillet 5 kg','Eggs 12 dozen','Tofu 6 kg']],
    ['Dry store', ['Rice 25 kg','Rice noodles 15 kg','Flour 10 kg','Cooking oil 20 L','Soy sauce 12 L','Salt 5 kg','Sugar 5 kg','Spice mix 2 kg']],
    ['Consumables', ['Chopsticks 2000 pairs','Takeaway containers 1000 pcs','Food-prep gloves 5 box','Napkins 2000 pcs','Cling wrap 6 roll','Bin bags 200 pcs']],
  ];

  // One typed line → one draft item. Deliberately forgiving: commas or spaces,
  // dollar signs or not, "6kg" glued or "6 kg" apart, English or Chinese.
  function parseLine(line){
    const raw = String(line||'').replace(/[，、]/g,',').replace(/[$￥]/g,' ').trim();
    if(!raw) return null;
    const s = raw.replace(/,/g,' ').replace(/\s+/g,' ').trim();
    const parts = s.split(' ');

    // The name runs until the first token that starts with a digit.
    const nameParts = [];
    let i = 0;
    for(; i<parts.length; i++){ if(/^\d/.test(parts[i])) break; nameParts.push(parts[i]); }
    const rest = parts.slice(i);

    const nums = [], words = [];
    rest.forEach(t=>{
      const m = t.match(/^([\d.]+)(.*)$/);
      if(m && m[1]!=='.'){ nums.push(Number(m[1])); if(m[2]) words.push(m[2]); }
      else words.push(t);
    });

    const name = nameParts.join(' ').trim();
    const qty  = nums[0]!=null ? nums[0] : 0;
    const price= nums[1]!=null ? nums[1] : 0;
    const kind = DURABLE_RE.test(name) ? 'durable' : 'perishable';
    const unit = (words[0]||'').replace(/^x$/i,'') ||
                 (kind==='durable' ? 'pcs' : (LIQUID_RE.test(name) ? 'L' : 'kg'));
    return {
      name, kind, qty, unit, price,
      // A starting reorder point of about a third of what you hold is a guess,
      // and it's labelled as one — but a zero would mean nothing ever warns.
      safety: U.round2(qty*0.3),
      bad: !name,
      raw,
    };
  }

  function bulkAddModal(after){
    let drafts = [];
    const wrap = U.el(`<div class="bulk">
      <p class="muted" style="font-size:13.5px">One thing per line, however you'd write it on paper. Quantity, unit and price are optional — <b>Tomatoes 6 kg 5.80</b>, <b>番茄 6kg</b>, or just <b>Tomatoes</b>. You get to check everything before it saves.</p>
      <textarea class="input bulk-ta" id="b_txt" rows="7" placeholder="Tomatoes 6 kg 5.80&#10;Beef brisket 12 kg 18.90&#10;Chopsticks 1400 pairs&#10;Fresh herbs"></textarea>
      <div class="bulk-prev" id="b_prev"></div>
      <details class="bulk-common">
        <summary>Or tap a common one to add it to the list</summary>
        ${COMMON.map(([group, items])=>`<div class="bulk-group"><span>${group}</span>
          ${items.map(x=>`<button type="button" class="chip" data-add="${U.esc(x)}">${U.esc(x.replace(/\s+[\d.].*$/,''))}</button>`).join('')}
        </div>`).join('')}
      </details>
    </div>`);

    const ta = U.qs('#b_txt', wrap), prev = U.qs('#b_prev', wrap);

    function parseAll(){
      drafts = ta.value.split('\n').map(parseLine).filter(Boolean);
      drawPreview();
    }
    function drawPreview(){
      if(!drafts.length){ prev.innerHTML = ''; return; }
      const ok = drafts.filter(d=>!d.bad).length;
      prev.innerHTML = `
        <div class="section-title mt16">Check before it saves
          <span class="faint" style="font-size:12px;font-weight:500">${ok} item${ok===1?'':'s'} ready${drafts.length-ok?` · ${drafts.length-ok} need a name`:''}</span></div>
        <div class="tablewrap"><table class="dtable">
          <thead><tr><th>Name</th><th>Type</th><th class="num" style="width:84px">Qty</th><th style="width:78px">Unit</th><th class="num" style="width:92px">Price</th><th class="num" style="width:92px">Reorder at</th><th></th></tr></thead>
          <tbody>${drafts.map((d,i)=>`<tr${d.bad?' class="bulk-bad"':''}>
            <td><input class="input" data-f="name" data-i="${i}" value="${U.esc(d.name)}" placeholder="needs a name"></td>
            <td><select class="input" data-f="kind" data-i="${i}">
              ${Object.entries(S().KIND).map(([k,v])=>`<option value="${k}" ${d.kind===k?'selected':''}>${v.label}</option>`).join('')}
            </select></td>
            <td><input class="input num" type="number" step="0.01" data-f="qty" data-i="${i}" value="${d.qty}"></td>
            <td><input class="input" data-f="unit" data-i="${i}" value="${U.esc(d.unit)}"></td>
            <td><input class="input num" type="number" step="0.01" data-f="price" data-i="${i}" value="${d.price}"></td>
            <td><input class="input num" type="number" step="0.01" data-f="safety" data-i="${i}" value="${d.safety}"></td>
            <td class="num"><button class="btn btn-ghost btn-sm" data-del="${i}" aria-label="drop this line">×</button></td>
          </tr>`).join('')}</tbody>
        </table></div>
        <div class="kv-hint" style="text-align:left">Reorder point is a starting guess (about a third of what you're holding) — change it here or later, it's what decides when an item turns red.</div>`;

      U.qsa('[data-f]', prev).forEach(inp=> inp.oninput = inp.onchange = ()=>{
        const d = drafts[+inp.dataset.i]; if(!d) return;
        const f = inp.dataset.f;
        d[f] = (f==='qty'||f==='price'||f==='safety') ? (Number(inp.value)||0) : inp.value;
        if(f==='name') d.bad = !inp.value.trim();
      });
      U.qsa('[data-del]', prev).forEach(b=> b.onclick = ()=>{
        drafts.splice(+b.dataset.del, 1);
        // The list is the source of truth for the textarea too, so rebuild it.
        ta.value = drafts.map(d=>d.raw).join('\n');
        drawPreview();
      });
    }

    ta.oninput = parseAll;
    U.qsa('[data-add]', wrap).forEach(b=> b.onclick = ()=>{
      ta.value = (ta.value.trim() ? ta.value.replace(/\s*$/,'') + '\n' : '') + b.dataset.add;
      parseAll(); ta.focus();
    });

    U.modal('Add stock items', wrap, {actions:[
      {label:'One at a time instead', class:'btn-ghost', onClick:(close)=>{ close(); itemModal(null, after); }},
      {label:'Add them', class:'btn-dark', onClick:async(close)=>{
        const good = drafts.filter(d=>d.name && d.name.trim());
        if(!good.length){ U.toast('Type a list first — one thing per line','amber'); return; }
        for(const d of good){
          await S().saveItem({
            name:d.name.trim(), kind:d.kind, qty:d.qty, unit:d.unit.trim()||'units',
            price:d.price, safety:d.safety, leadTimeDays:2,
            shelfLifeDays: d.kind==='perishable' ? null : null,
            priceHistory: d.price>0 ? [{ts:Date.now(), price:U.round2(d.price), note:'added by hand'}] : [],
          });
        }
        close(); U.toast(`${good.length} item${good.length===1?'':'s'} added`,'green'); after();
      }},
    ]});
  }

  function stocktakeModal(rows, after){
    if(!rows.length){ U.toast('Add some stock items first','amber'); return; }
    const wrap = U.el(`<div>
      <p class="muted" style="font-size:13.5px">Walk the shelves and type what you actually count. Anything you leave blank is skipped. Counting regularly is what makes the usage forecast work — it's the only place usage comes from.</p>
      <div class="tablewrap mt12"><table class="dtable entry">
        <thead><tr><th>Item</th><th class="num">System count</th><th class="num" style="width:120px">Counted</th></tr></thead>
        <tbody>${rows.map(r=>`<tr><td><b>${U.esc(r.name)}</b><div class="faint" style="font-size:11.5px">${MKR.ui.icon(S().KIND[r.kind].ic)} ${U.esc(r.unit||'')}</div></td>
          <td class="num faint"><span class="cell-l">System count</span>${r.qty}</td>
          <td class="num"><span class="cell-l">Counted</span><input class="input" type="number" min="0" step="0.01" data-count="${r.id}" placeholder="—" style="text-align:right"></td></tr>`).join('')}</tbody>
      </table></div>
      <div class="field mt12"><label>Note (optional)</label><input class="input" id="stk_note" placeholder="e.g. Monday morning count"></div>
    </div>`);
    U.modal('Stocktake', wrap, {actions:[
      {label:'Cancel', class:'btn-ghost', onClick:c=>c()},
      {label:'Save count', class:'btn-dark', onClick:async(close)=>{
        const lines = U.qsa('[data-count]',wrap).map(i=>({itemId:i.dataset.count, counted:i.value===''?null:Number(i.value)}));
        const saved = await S().saveStocktake(lines, U.qs('#stk_note',wrap).value.trim());
        if(!saved){ U.toast('Nothing counted','amber'); return; }
        if(saved.error==='negative'){ U.toast(`A count can't be negative — check ${saved.lines.map(l=>l.name).join(', ')}`,'red'); return; }
        close(); U.toast(`Counted ${saved.lines.length} item(s)`,'green'); after();
      }}
    ]});
  }

  // Recording the bin. Same shape as a stocktake — type quantities against the
  // shelf list — because it's the same job done at the same moment, usually with
  // the bin lid still open.
  function wasteModal(rows, after){
    if(!rows.length){ U.toast('Add some stock items first','amber'); return; }
    const R = S().WASTE_REASONS;
    const wrap = U.el(`<div>
      <p class="muted" style="font-size:13.5px">Write down what went in the bin and why. This takes it off your stock straight away, and it's the only way the forecast can tell what you cooked from what you threw away.</p>
      <div class="field mt12"><label>Why</label><select class="input" id="wst_why">
        ${Object.entries(R).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')}
      </select></div>
      <div class="tablewrap mt12"><table class="dtable entry">
        <thead><tr><th>Item</th><th class="num">On shelf</th><th class="num" style="width:110px">Binned</th></tr></thead>
        <tbody>${rows.map(r=>`<tr><td><b>${U.esc(r.name)}</b><div class="faint" style="font-size:11.5px">${MKR.ui.icon(S().KIND[r.kind].ic)} ${U.esc(r.unit||'')} · ${U.money(r.price)}<span data-wamt="${r.id}"></span></div></td>
          <td class="num faint"><span class="cell-l">On shelf</span>${r.qty}</td>
          <td class="num"><span class="cell-l">Binned</span><input class="input" type="number" step="0.01" min="0" data-waste="${r.id}" data-price="${+r.price||0}" placeholder="—" style="text-align:right"></td></tr>`).join('')}</tbody>
      </table></div>
      <div class="dkt-runtotal"><span>What it cost you</span><b id="wst_total">${U.money(0)}</b></div>
      <div class="field mt12"><label>Note (optional)</label><input class="input" id="wst_note" placeholder="e.g. fridge door left open overnight"></div>
    </div>`);

    // The running cost is the point of the screen: nobody bins $80 of fish on
    // purpose, they do it because the number was never in front of them.
    function recalc(){
      let t=0;
      U.qsa('[data-waste]',wrap).forEach(i=>{
        const amt = S().lineAmount(i.value, i.dataset.price);
        // Appended to the item's own sub-line rather than given a column: on a
        // 375px phone a fourth column pushes the input the user is typing into
        // off the edge of the screen.
        U.qs(`[data-wamt="${i.dataset.waste}"]`,wrap).textContent = (+i.value||0)>0 ? ` · −${U.money(amt)}` : '';
        t += amt;
      });
      U.qs('#wst_total',wrap).textContent = U.money(t);
    }
    U.qsa('[data-waste]',wrap).forEach(i=> i.oninput = recalc);

    U.modal('Threw it out', wrap, {actions:[
      {label:'Cancel', class:'btn-ghost', onClick:c=>c()},
      // Not "Record it" — the order sheet already owns that exact string, and a
      // shared one-word key can only be translated right in one of the two.
      {label:'Record the waste', class:'btn-dark', onClick:async(close)=>{
        const lines = U.qsa('[data-waste]',wrap).map(i=>({itemId:i.dataset.waste, qty:i.value===''?0:Number(i.value)}));
        const saved = await S().saveWaste(lines, U.qs('#wst_why',wrap).value, U.qs('#wst_note',wrap).value.trim());
        if(!saved){ U.toast('Nothing recorded','amber'); return; }
        close(); U.toast(`Binned ${saved.lines.length} item(s) · ${U.money(saved.cost)}`,'amber'); after();
      }}
    ]});
  }

  // ---------------- Purchases ----------------
  // The dockets themselves live in js/stock-receipt.js — a receipt is a thing
  // you look at, not a row you read, and that file is where it's drawn.
  const purchasesTab = (c, actions, reload)=> MKR.stockReceipt.tab(c, actions, reload);

  // ---------------- Suppliers ----------------
  // A supplier card is the page you'd open standing at the back door with the
  // phone in your hand: who to ring, when they deliver, what you owe them, what
  // they normally bring — and the order you're about to place, ready to send.
  const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  // Only ever open a plain http(s) address, and never one typed as javascript:.
  function webURL(raw){
    const s = String(raw||'').trim(); if(!s) return null;
    const url = /^https?:\/\//i.test(s) ? s : 'https://'+s;
    try{ const u = new URL(url); return (u.protocol==='http:'||u.protocol==='https:') ? u.href : null; }
    catch(e){ return null; }
  }
  const webLabel = (href)=>{ try{ return new URL(href).hostname.replace(/^www\./,''); }catch(e){ return href; } };

  async function suppliersTab(c, actions, reload){
    const [sups, purch, rows, recs] = await Promise.all([S().suppliers(), S().purchases(), S().overview(), S().reconciliations()]);
    actions.innerHTML = `<button class="btn btn-dark btn-sm" id="supAdd">${MKR.ui.icon('plus')} Add supplier</button>`;
    // Months with dockets but no signed-off statement check — the number that
    // makes the button worth pressing.
    const todo = (id)=> Array.from(new Set(purch.filter(p=>p.supplierId===id).map(p=>S().periodOf(p.ts))))
      .filter(k=>!recs.some(r=>r.supplierId===id && r.period===k)).length;

    const card = (s)=>{
      const mine  = purch.filter(p=>p.supplierId===s.id);
      const spend = mine.reduce((t,p)=>t+(p.total||0),0);
      const last  = mine[0];
      const buys  = rows.filter(i=>i.supplierId===s.id);
      const short = buys.filter(i=>i.low||i.short).length;
      const href  = webURL(s.website);
      const days  = (s.deliveryDays||[]).map(d=>DOW[d]).filter(Boolean);
      // How many of their lines have gone up in the last month — and only the
      // last month, or a rise from spring is still on the card in winter.
      const up = buys.filter(i=> i.move && i.move.dir==='up' && i.move.ts > Date.now()-30*864e5).length;

      const fact = (k,v)=> v ? `<div class="sup-fact"><span>${k}</span><b>${v}</b></div>` : '';
      return `<div class="card pad20 sup-card">
        <div class="section-title">${MKR.ui.icon('truck')} ${U.esc(s.name)}<button class="btn btn-ghost btn-sm" data-sup="${s.id}">Edit</button></div>

        <div class="sup-links">
          ${s.phone?`<a class="btn btn-ghost btn-sm" href="tel:${U.esc(s.phone)}">${MKR.ui.icon('phone')} ${U.esc(s.phone)}</a>`:''}
          ${s.email?`<a class="btn btn-ghost btn-sm" href="mailto:${U.esc(s.email)}">${MKR.ui.icon('mail')} Email</a>`:''}
          ${href?`<a class="btn btn-ghost btn-sm" href="${U.esc(href)}" target="_blank" rel="noopener noreferrer">${MKR.ui.icon('globe')} ${U.esc(webLabel(href))} ↗</a>`:''}
        </div>

        <div class="sup-facts">
          ${fact('Who you ask for', U.esc(s.contact||''))}
          ${fact('Delivers', days.length ? U.esc(days.join(' · ')) : '')}
          ${fact('Order by', U.esc(s.cutoff||''))}
          ${fact('Minimum order', +s.minOrder ? U.money0(s.minOrder) : '')}
          ${fact('Payment terms', U.esc(s.terms||''))}
          ${fact('Account no.', U.esc(s.account||''))}
          ${fact('ABN', U.esc(s.abn||''))}
          ${fact('Address', U.esc(s.address||''))}
        </div>

        <div class="sup-stats">
          <span><b>${mine.length}</b><i>dockets</i></span>
          <span><b>${U.money0(spend)}</b><i>spent with them</i></span>
          <span><b>${last?U.fmtDate(last.ts):'—'}</b><i>last delivery</i></span>
          <span${up?' class="hot"':''}><b>${up}</b><i>dearer this month</i></span>
        </div>

        ${buys.length?`<div class="sup-items">
          <div class="sup-items-h${short?' pw-worse':''}">${short?`What they bring · ${short} to order`:'What they bring'}</div>
          ${buys.map(i=>`<button class="chip${i.low||i.short?' chip-hot':''}" data-item="${i.id}">${U.esc(i.name)} <i>${U.money(i.price)}/${U.esc(i.unit||'')}</i></button>`).join('')}
        </div>`:`<p class="faint" style="font-size:12.5px;margin-top:12px">No stock items point at this supplier yet — set one on the item and it shows up here.</p>`}

        ${s.note?`<p class="muted" style="font-size:13px;margin-top:12px">${U.esc(s.note)}</p>`:''}

        <div class="row gap8 wrap mt12 sup-actions">
          <button class="btn btn-ghost btn-sm" data-dockets="${s.id}">${MKR.ui.icon('receipt')} Their dockets (${mine.length})</button>
          ${mine.length?`<button class="btn btn-ghost btn-sm${todo(s.id)?' chip-hot':''}" data-stmt="${s.id}">${MKR.ui.icon('checksq')} Check their statement${todo(s.id)?` (${todo(s.id)})`:''}</button>`:''}
          <button class="btn btn-dark btn-sm" data-order="${s.id}">${MKR.ui.icon('inbox')} Build their order</button>
        </div>
      </div>`;
    };

    c.innerHTML = sups.length
      ? `<div class="sup-grid mt16">${sups.map(card).join('')}</div>`
      : `<div class="empty mt16"><div class="em">${MKR.ui.icon('truck')}</div><p>No suppliers yet. Add the people you actually ring when you need stock — name, phone, what they bring and when they deliver.</p></div>`;

    U.qs('#supAdd',actions).onclick = ()=> supplierModal(null, reload);
    U.qsa('[data-sup]',c).forEach(b=> b.onclick=()=> supplierModal(sups.find(x=>x.id===b.dataset.sup), reload));
    U.qsa('[data-item]',c).forEach(b=> b.onclick=()=> itemModal(rows.find(x=>x.id===b.dataset.item), reload));
    U.qsa('[data-dockets]',c).forEach(b=> b.onclick=()=> dockets(sups.find(x=>x.id===b.dataset.dockets), purch));
    U.qsa('[data-stmt]',c).forEach(b=> b.onclick=()=> statementModal(sups.find(x=>x.id===b.dataset.stmt), purch, recs, reload));
    U.qsa('[data-order]',c).forEach(b=> b.onclick=()=> orderSheet(sups.find(x=>x.id===b.dataset.order), rows));
  }

  // Every docket from one supplier, newest first — the drawer, filtered.
  async function dockets(s, purch){
    const mine = purch.filter(p=>p.supplierId===s.id);
    if(!mine.length){ U.toast('No dockets from '+s.name+' yet','amber'); return; }
    let venue='My Kitchen';
    try{ const k=await MKR.db.get('kitchens',(MKR.auth.current()||{}).kitchenId||'k_main'); if(k&&k.name) venue=k.name; }catch(e){}
    const wrap = U.el(`<div class="dkt-wall">${mine.map(p=>`<button class="dkt-card" data-d="${p.id}">
      ${MKR.stockReceipt.receiptHtml(p,{sup:s, venue, purch, compact:true})}</button>`).join('')}</div>`);
    U.modal(`${s.name} · ${mine.length} docket${mine.length===1?'':'s'}`, wrap);
    U.qsa('[data-d]',wrap).forEach(b=> b.onclick=()=>{
      MKR.stockReceipt.openReceipt(mine.find(x=>x.id===b.dataset.d), s, venue, purch);
    });
  }

  // Checking a monthly statement against your own dockets.
  //
  // Tick what appears on their statement, type their total, and the two numbers
  // that matter fall out: what they've billed that you can't account for (chase
  // it before you pay) and what you hold that they haven't billed yet (don't
  // pay it twice next month). Everything is per supplier per month, and the
  // verdict is saved so next month you know July is done.
  async function statementModal(s, purch, recs, after){
    const periods = await S().statementPeriods(s.id, purch, recs);
    if(!periods.length){ U.toast('No dockets from '+s.name+' yet','amber'); return; }

    const wrap = U.el(`<div>
      <div class="field"><label>Which month</label><select class="input" id="st_per">
        ${periods.map(p=>`<option value="${p.period}">${U.esc(monthLabel(p.period))} · ${p.dockets} docket${p.dockets===1?'':'s'} · ${U.money(p.ourTotal)}${p.saved?' (saved)':''}</option>`).join('')}
      </select></div>
      <div id="st_body"></div>
    </div>`);
    const body = U.qs('#st_body',wrap);

    async function draw(){
      const period = U.qs('#st_per',wrap).value;
      const st = await S().statementFor(s.id, period, purch, recs);
      const savedIds = st.saved ? (st.saved.matched||[]) : null;
      body.innerHTML = `
        <p class="muted" style="font-size:13px;margin-top:12px">Tick every docket that appears on their statement. Leave the ones they haven't billed yet.</p>
        <div class="list">${st.dockets.map(p=>`<label class="li clickable">
          <input type="checkbox" data-tick="${p.id}" ${!savedIds || savedIds.includes(p.id) ? 'checked':''}>
          <div class="meta"><b>${U.esc(p.invoiceNo||'no number')}</b>
            <span>${U.fmtDate(p.ts)} · ${(p.lines||[]).length} line${(p.lines||[]).length===1?'':'s'}</span></div>
          <b>${U.money(p.total)}</b></label>`).join('')}</div>
        <div class="field mt12"><label>What their statement says</label>
          <input class="input" id="st_total" type="number" step="0.01" value="${st.saved?st.saved.statementTotal:''}" placeholder="the one total on their paperwork"></div>
        <div id="st_verdict"></div>
        <div class="field mt12"><label>Note (optional)</label><input class="input" id="st_note" value="${U.esc(st.saved?st.saved.note:'')}" placeholder="e.g. rang Kim, credit coming for the short crate"></div>
        ${st.saved?`<div class="disclaimer mt8"><span>${MKR.ui.icon('check')}</span><div>Checked ${U.fmtDate(st.saved.ts)} by ${U.esc(st.saved.by||'—')}. Saving again replaces it.</div></div>`:''}`;

      const ticks = U.qsa('[data-tick]',body);
      function verdict(){
        const on  = ticks.filter(t=>t.checked).map(t=>t.dataset.tick);
        const off = st.dockets.filter(p=>!on.includes(p.id));
        const matched = U.round2(st.dockets.filter(p=>on.includes(p.id)).reduce((t,p)=>t+(+p.total||0),0));
        const notBilled = U.round2(off.reduce((t,p)=>t+(+p.total||0),0));
        const claimed = Number(U.qs('#st_total',body).value);
        const has = U.qs('#st_total',body).value !== '' && !isNaN(claimed);
        const gap = has ? U.round2(claimed - matched) : 0;
        U.qs('#st_verdict',body).innerHTML = `
          <div class="cart-total mt8"><span>Your dockets, ticked</span><span class="v">${U.money(matched)}</span></div>
          ${notBilled?`<div class="alert info mt8"><span>${MKR.ui.icon('receipt')}</span><div>
            <b>${U.money(notBilled)}</b> <b>of your dockets isn't on their statement</b>
            <div class="faint">${off.map(p=>U.esc(p.invoiceNo||'no number')+' '+U.money(p.total)).join(' · ')}</div>
            <div>Not an error — they usually catch up next month. Worth knowing so you don't pay it twice when they do.</div>
          </div></div>`:''}
          ${!has ? `<div class="disclaimer mt8"><span>⌨️</span><div>Type their total above and the gap appears here.</div></div>`
            : Math.abs(gap) < 0.005
              ? `<div class="alert green mt8"><span>${MKR.ui.icon('checkcircle')}</span><div><b>Matches to the cent.</b> <div>Nothing to chase — this month is clean.</div></div></div>`
              : `<div class="alert ${gap>0?'red':'amber'} mt8"><span>${MKR.ui.icon(gap>0?'warning':'search')}</span><div>
                  <b>${U.money(Math.abs(gap))}</b> <b>${gap>0?'they have billed that you have no docket for':'on your dockets that their statement is under'}</b>
                  <div>${gap>0
                    ? 'Ring them before this gets paid. Usually a delivery nobody wrote down, or a docket billed at a different price than the one on the paper.'
                    : "They've undercharged against what you ticked. Check you ticked the right dockets before you celebrate."}</div>
                </div></div>`}`;
      }
      ticks.forEach(t=> t.onchange = verdict);
      U.qs('#st_total',body).oninput = verdict;
      verdict();
    }
    U.qs('#st_per',wrap).onchange = draw;
    await draw();

    U.modal(`${s.name} · statement check`, wrap, {actions:[
      {label:'Close', class:'btn-ghost', onClick:c=>c()},
      {label:'Save the check', class:'btn-dark', onClick:async(close)=>{
        const period = U.qs('#st_per',wrap).value;
        const el = U.qs('#st_total',body);
        if(el.value===''){ U.toast("Type what their statement says first",'amber'); return; }
        const st = await S().statementFor(s.id, period, purch, recs);
        const on = U.qsa('[data-tick]',body).filter(t=>t.checked).map(t=>t.dataset.tick);
        const matched = U.round2(st.dockets.filter(p=>on.includes(p.id)).reduce((t,p)=>t+(+p.total||0),0));
        const claimed = Number(el.value)||0;
        await S().saveReconciliation({supplierId:s.id, period, statementTotal:claimed,
          matchedTotal:matched, ourTotal:st.ourTotal, gap:U.round2(claimed-matched),
          matched:on, note:U.qs('#st_note',body).value.trim()});
        close(); U.toast('Statement check saved','green'); after();
      }}
    ]});
  }
  const monthLabel = (key)=>{ const [y,m]=key.split('-');
    return new Date(+y, +m-1, 1).toLocaleDateString('en-AU',{month:'long', year:'numeric'}); };

  // The order you're about to place with this supplier — same suggestion the
  // forecast makes, narrowed to their lines, in a form you can send them.
  async function orderSheet(s, rows){
    const mine = rows.filter(r=>r.supplierId===s.id);
    const list = mine.map(r=>({r, q:suggestQty(r)})).filter(x=>x.q>0);
    if(!list.length){ U.toast(`Nothing to order from ${s.name} right now`,'green'); return; }

    let venue={name:'My Kitchen'};
    try{ const k=await MKR.db.get('kitchens',(MKR.auth.current()||{}).kitchenId||'k_main'); if(k) venue=k; }catch(e){}

    // Ordered in the units the supplier sells in. Asking a greengrocer for
    // "9 kg" of something they only sell by the 3 kg crate makes them guess, and
    // they round the way that suits them.
    const packOf = (r)=>{
      const n = S().packSizeOf(r);
      return n ? {label:S().packLabelOf(r), size:n} : null;
    };
    // Nobody sends 6.14 crates. An order in packs is whole packs, rounded UP —
    // rounding down would order less than the shelf needs, which is the one
    // direction that costs a service. The unit figure is then restated from the
    // rounded packs, or the sheet would ask for 7 crates and 18.42 kg in the
    // same breath and the driver would have to decide which one is real.
    const ordered = ({r,q})=>{
      const p = packOf(r);
      if(!p) return {packs:null, label:null, qty:q};
      const packs = Math.max(1, Math.ceil(q / p.size));
      return {packs, label:p.label, qty:U.round2(packs * p.size)};
    };
    const plural = (n,w)=> `${n} ${w}${n===1?'':'s'}`;

    // Costed on what is actually being ordered — whole packs — not on the raw
    // suggestion, or the estimate quietly under-reads every packed line.
    const total = list.reduce((t,x)=>t+S().lineAmount(ordered(x).qty, x.r.price), 0);

    const text = [`Order for ${s.name} — ${venue.name||'My Kitchen'}`,
      ...list.map(x=>{
        const o = ordered(x);
        return o.packs ? `- ${x.r.name}: ${plural(o.packs,o.label)} (${o.qty} ${x.r.unit||''})`
                       : `- ${x.r.name}: ${o.qty} ${x.r.unit||''}`;
      })].join('\n');

    // What travels in the link. Quantities and who is asking — never prices.
    // An order is "send me these", not a disclosure of what the venue thinks it
    // pays, and the link is going to somebody outside the business.
    const payload = {
      v: venue.name||'', s: s.name||'', d: U.fmtDate(Date.now()),
      acc: s.account||'', ph: venue.phone||'',
      l: list.map(x=>{
        const o = ordered(x);
        return {n:x.r.name, q:o.qty, u:x.r.unit||'', ...(o.packs?{pq:o.packs, pl:o.label}:{})};
      }),
      n: s.cutoff ? `Please deliver on your usual run. We order by ${s.cutoff}.` : '',
    };
    const shareLink = ()=>{
      const json = JSON.stringify(payload);
      const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)))
        .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      return location.origin + location.pathname.replace(/[^/]*$/, '') + 'order.html#d=' + b64;
    };
    const printSheet = ()=>{
      const row = (x)=>{
        const o = ordered(x);
        return `<tr><td style="padding:9px 0;border-bottom:1px solid #E4DED6"><b>${U.esc(x.r.name)}</b></td>
          <td style="padding:9px 0;border-bottom:1px solid #E4DED6;text-align:right;font-weight:700;white-space:nowrap">
            ${o.packs?`${plural(o.packs,U.esc(o.label))}<div style="color:#6B6560;font-size:12.5px;font-weight:500">${o.qty} ${U.esc(x.r.unit||'')}</div>`
                     :`${o.qty} ${U.esc(x.r.unit||'')}`}</td></tr>`;
      };
      return `<div style="font-family:Inter,system-ui,sans-serif;color:#211E1B;padding:24px;max-width:640px">
        <h2 style="margin:0 0 2px;font-size:20px">Order from ${U.esc(venue.name||'My Kitchen')}</h2>
        <div style="color:#6B6560;font-size:13.5px;margin-bottom:18px">For ${U.esc(s.name)}${s.contact?' · attn '+U.esc(s.contact):''}</div>
        <div style="display:flex;gap:22px;padding:12px 0;border-top:1px solid #E4DED6;border-bottom:1px solid #E4DED6;margin-bottom:16px;font-size:13.5px">
          <div><div style="color:#6B6560;font-size:11px;text-transform:uppercase">Ordered</div><b>${U.fmtDate(Date.now())}</b></div>
          ${s.account?`<div><div style="color:#6B6560;font-size:11px;text-transform:uppercase">Account</div><b>${U.esc(s.account)}</b></div>`:''}
          ${venue.phone?`<div><div style="color:#6B6560;font-size:11px;text-transform:uppercase">Call us on</div><b>${U.esc(venue.phone)}</b></div>`:''}
          ${s.cutoff?`<div><div style="color:#6B6560;font-size:11px;text-transform:uppercase">Cut-off</div><b>${U.esc(s.cutoff)}</b></div>`:''}
        </div>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr>
            <th style="text-align:left;font-size:11px;text-transform:uppercase;color:#6B6560;padding-bottom:6px;border-bottom:1px solid #E4DED6">Item</th>
            <th style="text-align:right;font-size:11px;text-transform:uppercase;color:#6B6560;padding-bottom:6px;border-bottom:1px solid #E4DED6">Quantity</th>
          </tr></thead>
          <tbody>${list.map(row).join('')}</tbody>
        </table>
        <div style="margin-top:20px;color:#6B6560;font-size:12px">No prices on this sheet — please invoice at your usual rates.</div>
      </div>`;
    };
    const wrap = U.el(`<div>
      <div class="list">${list.map(x=>{ const o=ordered(x), r=x.r; return `<div class="li">
        <div class="ds-li-ic">${MKR.stockGame?MKR.stockGame.emojiFor(r):MKR.ui.icon('box')}</div>
        <div class="meta"><b>${U.esc(r.name)} · ${o.packs?plural(o.packs,U.esc(o.label)):`${o.qty} ${U.esc(r.unit||'')}`}</b>
          <span>${o.packs?`${o.qty} ${U.esc(r.unit||'')} · `:''}${r.cover!=null?`${r.cover.toFixed(1)} days left`:'no usage data yet'} · last paid ${U.money(r.price)}</span></div>
        <b>${U.money(S().lineAmount(o.qty,r.price))}</b></div>`; }).join('')}</div>
      <div class="cart-total mt8"><span>Estimated cost</span><span class="v">${U.money(total)}</span></div>
      ${s.minOrder && total < +s.minOrder ? `<div class="alert amber mt12"><span>${MKR.ui.icon('warning')}</span><div>Their minimum order is ${U.money0(s.minOrder)} — this comes to ${U.money(total)}.</div></div>`:''}
      ${s.cutoff?`<div class="disclaimer"><span>${MKR.ui.icon('clock')}</span>Order by ${U.esc(s.cutoff)}${(s.deliveryDays||[]).length?` · delivers ${(s.deliveryDays||[]).map(d=>DOW[d]).join(' & ')}`:''}</div>`:''}
    </div>`);
    U.modal(`Order for ${s.name}`, wrap, {wide:true, actions:[
      {label:'Copy as a message', class:'btn-ghost', onClick:async(close)=>{
        try{ await navigator.clipboard.writeText(text); U.toast('Copied — paste it into a text or email','green'); }
        catch(e){ U.toast('Could not copy on this device','amber'); }
      }},
      {label:'Print / PDF', class:'btn-ghost', onClick:(close)=>{
        // The browser's own print dialog has "Save as PDF" on every platform
        // this runs on, so there is no PDF library to ship or keep patched.
        close(); U.printHTML(printSheet());
      }},
      {label:'Copy link', class:'btn-ghost', onClick:async(close)=>{
        const url = shareLink();
        // Some messaging apps truncate very long links. Better to say so here
        // than to have the supplier open a half-order.
        if(url.length > 1800){ U.toast('Too many lines to fit in a link — send the PDF instead','amber'); return; }
        try{ await navigator.clipboard.writeText(url); U.toast('Link copied — they can open it without an account','green'); }
        catch(e){ U.toast('Could not copy on this device','amber'); }
      }},
      {label:'Export CSV', class:'btn-ghost', onClick:(close)=>{
        const out=[['Item','Packs','Pack','Order qty','Unit','Last price paid','Est. cost']];
        list.forEach(x=>{ const o=ordered(x);
          out.push([x.r.name, o.packs||'', o.packs?o.label:'', o.qty, x.r.unit||'',
                    (+x.r.price||0).toFixed(2), S().lineAmount(o.qty,x.r.price).toFixed(2)]); });
        U.downloadCSV(`order-${s.name.replace(/\W+/g,'-').toLowerCase()}-${U.todayISO()}.csv`, out);
        close(); U.toast('Exported','green');
      }},
      // Once it's been rung through, the same list becomes what the back door
      // checks off — nobody types these items again.
      {label:'Expect it at the back door', class:'btn-dark', onClick:async(close)=>{
        if(!MKR.deliveries){ U.toast('Deliveries are switched off','amber'); return; }
        await MKR.deliveries.save({
          supplierId:s.id, supplierName:s.name,
          // The back door checks off the same quantities that were ordered, so a
          // line reads "ordered 21 kg" and not a figure nobody sent anyone.
          lines:list.map(x=>({itemId:x.r.id, name:x.r.name, unit:x.r.unit||'', ordered:ordered(x).qty,
                              received:null, unitPrice:x.r.price||0, condition:'ok', note:''})),
        });
        close(); U.toast(`Waiting at the back door for ${s.name}`,'green');
      }},
    ]});
  }

  function supplierModal(s, after){
    const isNew=!s; s=s||{};
    const days = s.deliveryDays||[];
    const wrap = U.el(`<div>
      <div class="field"><label>Business name</label><input class="input" id="s_n" value="${U.esc(s.name||'')}" placeholder="e.g. Vic Fresh Produce"></div>
      <div class="row"><div class="field grow"><label>Who you contact</label><input class="input" id="s_c" value="${U.esc(s.contact||'')}" placeholder="e.g. Tony (driver)"></div>
        <div class="field grow"><label>Phone</label><input class="input" id="s_p" value="${U.esc(s.phone||'')}"></div></div>
      <div class="row"><div class="field grow"><label>Email</label><input class="input" id="s_e" value="${U.esc(s.email||'')}"></div>
        <div class="field grow"><label>Website</label><input class="input" id="s_w" value="${U.esc(s.website||'')}" placeholder="vicfreshproduce.com.au"></div></div>
      <div class="field"><label>Address</label><input class="input" id="s_a" value="${U.esc(s.address||'')}" placeholder="where you'd send someone to pick up"></div>

      <div class="field"><label>Delivery days</label>
        <div class="daypick" id="s_days">${DOW.map((d,i)=>`<button type="button" class="chip${days.includes(i)?' on':''}" data-day="${i}">${d}</button>`).join('')}</div></div>
      <div class="row"><div class="field grow"><label>Order by (cut-off)</label><input class="input" id="s_cut" value="${U.esc(s.cutoff||'')}" placeholder="e.g. 15:00"></div>
        <div class="field grow"><label>Minimum order (AUD)</label><input class="input" id="s_min" type="number" step="1" value="${+s.minOrder||0}"></div></div>
      <div class="row"><div class="field grow"><label>Payment terms</label><input class="input" id="s_t" value="${U.esc(s.terms||'')}" placeholder="e.g. 30 days"></div>
        <div class="field grow"><label>Your account no.</label><input class="input" id="s_acc" value="${U.esc(s.account||'')}"></div></div>
      <div class="field"><label>ABN</label><input class="input" id="s_abn" value="${U.esc(s.abn||'')}" placeholder="so it's on hand at invoice time"></div>
      <div class="field"><label>Notes</label><input class="input" id="s_note" value="${U.esc(s.note||'')}" placeholder="e.g. ring Tony directly if the truck is late"></div>
      <div class="disclaimer"><span>${MKR.ui.icon('link')}</span>Point your stock items at a supplier and the two link up: their card lists what they bring, and every order groups itself by who to ring.</div>
    </div>`);

    const picked = days.slice();
    U.qsa('[data-day]',wrap).forEach(b=> b.onclick = ()=>{
      const d = +b.dataset.day, i = picked.indexOf(d);
      if(i>-1) picked.splice(i,1); else picked.push(d);
      b.classList.toggle('on', i===-1);
    });

    const actions=[{label:'Save', class:'btn-dark', onClick:async(close)=>{
      const name=U.qs('#s_n',wrap).value.trim(); if(!name){ U.toast('Enter a name','red'); return; }
      await MKR.db.put('suppliers',{id:s.id||U.uid('sup'), name,
        contact:U.qs('#s_c',wrap).value.trim(), phone:U.qs('#s_p',wrap).value.trim(),
        email:U.qs('#s_e',wrap).value.trim(), website:U.qs('#s_w',wrap).value.trim(),
        address:U.qs('#s_a',wrap).value.trim(), deliveryDays:picked.slice().sort(),
        cutoff:U.qs('#s_cut',wrap).value.trim(), minOrder:Number(U.qs('#s_min',wrap).value)||0,
        terms:U.qs('#s_t',wrap).value.trim(), account:U.qs('#s_acc',wrap).value.trim(),
        abn:U.qs('#s_abn',wrap).value.trim(), note:U.qs('#s_note',wrap).value.trim(),
        kitchenId:(MKR.auth.current()||{}).kitchenId||'k_main'});
      close(); U.toast('Saved','green'); after();
    }}];
    if(!isNew) actions.unshift({label:'Delete', class:'btn-ghost', onClick:async(close)=>{
      if(!(await U.confirm('Delete supplier', `Remove ${s.name}? Their past dockets stay in your records.`, {ok:'Delete', danger:true}))) return;
      await MKR.db.put('suppliers',{id:s.id, archived:true}); close(); U.toast('Deleted','amber'); after();
    }});
    U.modal(isNew?'Add supplier':'Edit supplier', wrap, {actions});
  }

  // ---------------- Forecast ----------------
  // Nothing on this page is a projection of the future. It is arithmetic on
  // what already happened, and the page says so — including the working, per
  // item, so an owner can check it against their own notebook and either trust
  // it or tell us where it's wrong.
  async function forecastTab(c, actions, reload){
    const rows = await S().overview();
    const [takes, purch, wst] = await Promise.all([S().stocktakes(), S().purchases(), S().wastes()]);
    const bin = await S().wasteSince(30, wst);
    const known = rows.filter(r=>r.usageSamples>0);
    actions.innerHTML = `<button class="btn btn-ghost btn-sm" id="fcList">${MKR.ui.icon('inbox')} Build order list</button>
      <button class="btn btn-dark btn-sm" id="fcAsk">${MKR.ui.icon('sparkle')} Ask AI</button>`;

    const suggest = suggestQty;
    const lastCount = takes.length ? takes[0].ts : null;

    // The explanation is worth more with the venue's own numbers in it, so pick
    // the item with the most history and show its actual sum.
    const star = known.slice().sort((a,b)=>b.usageSamples-a.usageSamples)[0];
    let worked = '';
    if(star){
      const iv = (await S().usageIntervals(star.id, takes, purch, wst)).filter(x=>!x.skip).slice(-1)[0];
      if(iv) worked = `<div class="fc-worked">
        <b>${U.esc(star.name)}, most recently:</b>
        <div class="fc-sum">
          <span><i>counted ${U.fmtDate(iv.fromTs)}</i><b>${iv.before} ${U.esc(star.unit||'')}</b></span>
          <em>+</em>
          <span><i>arrived on ${iv.deliveries} docket${iv.deliveries===1?'':'s'}</i><b>${iv.bought} ${U.esc(star.unit||'')}</b></span>
          <em>−</em>
          <span><i>counted ${U.fmtDate(iv.toTs)}</i><b>${iv.now} ${U.esc(star.unit||'')}</b></span>
          <em>=</em>
          <span class="hot"><i>used over ${iv.days} days</i><b>${iv.used} ${U.esc(star.unit||'')}</b></span>
        </div>
        <p>That week worked out at ${iv.daily} ${U.esc(star.unit||'')} a day. Averaged with every other count, it settles at ${star.daily.toFixed(2)} a day — at ${star.qty} ${U.esc(star.unit||'')} on the shelf, that's ${star.cover!=null?star.cover.toFixed(1):'—'} days before it runs out.</p>
        ${iv.wasted>0?`<p>Of that ${iv.used} ${U.esc(star.unit||'')}, <b>${iv.wasted}</b> went in the bin and ${iv.cooked} was cooked. You still have to buy both — but only one of them earns anything.</p>`:''}
      </div>`;
    }

    c.innerHTML = `
      <div class="alert info mt16"><span>${MKR.ui.icon('bars')}</span><div>
        <b>Nothing here is guessed — it's your stocktakes, added up.</b>
        <div>There's no till in this app, so nobody can deduct an ingredient per dish. Instead usage is what the shelf actually shows:</div>
        <code class="fc-formula">counted last time + everything the dockets brought in − counted this time = used</code>
        <div>Divide by the days between the two counts and you have a daily rate. Two counts is the minimum; more counts, steadier number.</div>
        <div>${lastCount?`Your last count was ${U.fmtDate(lastCount)} · ${takes.length} count${takes.length===1?'':'s'} on file.`:`No stocktakes yet — that's the one thing this page needs from you.`}</div>
      </div></div>
      ${bin.rows.length ? `<div class="alert amber mt16"><span>${MKR.ui.icon('trash')}</span><div>
        <b>${U.money(bin.cost)}</b> <b>went in the bin in the last 30 days</b>
        <div>${bin.byItem.slice(0,3).map(b=>`${U.esc(b.name)} ${U.money(b.cost)}`).join(' · ')}${bin.byItem.length>3?` · +${bin.byItem.length-3} more`:''}</div>
        <div class="faint">That's stock you paid for and sold none of. It's inside the usage figures below, not on top of them.</div>
      </div></div>` : ''}
      ${worked}
      <div class="card pad20 mt16">
        <div class="section-title">${MKR.ui.icon('trend')} Usage &amp; days of cover<span class="faint" style="font-size:12px;font-weight:500">tap a row to see its working</span></div>
        ${rows.length?`<div class="tablewrap"><table class="dtable">
          <thead><tr><th>Item</th><th class="num">On hand</th><th class="num">Used / day</th><th class="num">Days of cover</th><th class="num">Suggest order</th><th class="num">Est. cost</th></tr></thead>
          <tbody>${rows.map(r=>{
            const sg = suggest(r), cost = S().lineAmount(sg, r.price);
            const cover = r.cover==null ? '<span class="faint">needs 2 counts</span>'
              : `<b style="color:${r.short?'var(--red)':'inherit'}">${r.cover.toFixed(1)}</b>`;
            return `<tr class="clickable" data-why="${r.id}"><td><b>${U.esc(r.name)}</b> ${r.low?'<span class="pill warn">Low</span>':''}<div class="faint" style="font-size:11.5px">${MKR.ui.icon(S().KIND[r.kind].ic)} ${r.usageSamples?`measured across ${r.usageSamples} stretch${r.usageSamples===1?'':'es'} between counts`:'no usage data yet'}</div></td>
              <td class="num">${r.qty} <small class="faint">${U.esc(r.unit||'')}</small></td>
              <td class="num">${r.daily?r.daily.toFixed(2):'—'}</td>
              <td class="num">${cover}</td>
              <td class="num">${sg?`<b>${sg}</b> <small class="faint">${U.esc(r.unit||'')}</small>`:'—'}</td>
              <td class="num">${sg?U.money(cost):'—'}</td></tr>`;
          }).join('')}</tbody></table></div>`
          :`<div class="empty" style="padding:18px"><div class="em">${MKR.ui.icon('trend')}</div><p>No stock items yet</p></div>`}
        <div class="kv-hint" style="text-align:left;margin-top:12px">Suggested order = enough to cover the delivery lead time plus a week, less what's already on the shelf. With no usage history yet it falls back to twice your reorder point.</div>
      </div>
      <div class="card pad20 mt16"><div class="section-title">${MKR.ui.icon('sparkle')} What the assistant says</div><div id="fcAi"><p class="muted" style="font-size:13.5px">Tap Ask AI for a plain-English read on what to order and what's creeping up in price.</p></div></div>`;

    U.qsa('[data-why]',c).forEach(tr=> tr.onclick = async()=>{
      const r = rows.find(x=>x.id===tr.dataset.why);
      const iv = await S().usageIntervals(r.id, takes, purch, wst);
      const good = iv.filter(x=>!x.skip);
      const used = good.reduce((t,x)=>t+x.used,0), dys = good.reduce((t,x)=>t+x.days,0);
      const binned = good.reduce((t,x)=>t+x.wasted,0);
      U.modal(`How ${r.name} was worked out`, `
        ${iv.length ? `<div class="tablewrap"><table class="dtable">
          <thead><tr><th>Between two counts</th><th class="num">Counted</th><th class="num">Bought</th><th class="num">Counted</th><th class="num">Used</th><th class="num">Per day</th></tr></thead>
          <tbody>${iv.map(x=>`<tr${x.skip?' style="opacity:.55"':''}>
            <td><b>${U.fmtDate(x.fromTs)} → ${U.fmtDate(x.toTs)}</b><div class="faint" style="font-size:11.5px">${x.days} days · ${x.deliveries} ${x.deliveries===1?'delivery':'deliveries'}${x.skip?` · <span class="pw-worse">skipped: ${U.esc(x.skip)}</span>`:''}</div></td>
            <td class="num">${x.before}</td><td class="num">+ ${x.bought}</td><td class="num">− ${x.now}</td>
            <td class="num"><b>${x.used}</b>${x.wasted>0?`<div class="faint" style="font-size:11.5px"><span class="pw-worse">${x.wasted} binned</span></div>`:''}</td>
            <td class="num">${x.skip?'—':x.daily}</td></tr>`).join('')}</tbody>
          ${good.length?`<tfoot><tr><td class="num"><b>Averaged</b></td><td colspan="3" class="num faint">${dys.toFixed(1)} days counted</td>
            <td class="num"><b>${U.round2(used)}</b>${binned>0?`<div class="faint" style="font-size:11.5px"><span class="pw-worse">${U.round2(binned)} binned</span></div>`:''}</td><td class="num"><b>${r.daily.toFixed(2)}</b></td></tr></tfoot>`:''}
        </table></div>
        ${binned>0?`<div class="disclaimer mt12"><span>${MKR.ui.icon('warning')}</span><div>
          <b>${U.round2(binned)} ${U.esc(r.unit||'')} · ${U.money(S().lineAmount(binned, r.price))}</b>
          <div>went in the bin rather than into a dish. The daily rate above deliberately still counts it — you have to buy it either way.</div>
        </div></div>`:''}
        ${good.length?`<div class="disclaimer mt12"><span>${MKR.ui.icon('bars')}</span>${r.qty} ${U.esc(r.unit||'')} on the shelf ÷ ${r.daily.toFixed(2)} a day = <b>${r.cover!=null?r.cover.toFixed(1):'—'} days of cover</b>. Order lead time is ${r.leadTimeDays||2} day${(r.leadTimeDays||2)===1?'':'s'}, so the suggestion is ${suggest(r)} ${U.esc(r.unit||'')}.</div>`
          :`<div class="alert amber mt12"><span>${MKR.ui.icon('warning')}</span><div>Every interval had to be skipped, so there's no usable rate yet. The reasons are listed above.</div></div>`}`
        : `<div class="empty"><div class="em">${MKR.ui.icon('checksq')}</div><p>${r.name} has been counted ${takes.filter(t=>(t.lines||[]).some(l=>l.itemId===r.id)).length} time(s). Two counts of the same item is the minimum — count it again next week and the rate appears here.</p></div>`}`);
    });

    U.qs('#fcList',actions).onclick = ()=>{
      const list = rows.map(r=>({r, q:suggestQty(r)})).filter(x=>x.q>0);
      if(!list.length){ U.toast('Nothing needs ordering','green'); return; }
      U.modal('Order list', `<div class="list">${list.map(({r,q})=>`
        <div class="li"><div class="ds-li-ic">${MKR.ui.icon(S().KIND[r.kind].ic)}</div>
          <div class="meta"><b>${U.esc(r.name)} · ${q} ${U.esc(r.unit||'')}</b>
            <span>${r.supplier?U.esc(r.supplier.name)+(r.supplier.phone?' · '+U.esc(r.supplier.phone):''):'no supplier set'}</span></div>
          <b>${U.money(S().lineAmount(q,r.price))}</b></div>`).join('')}</div>
        <div class="cart-total mt8"><span>Estimated cost</span><span class="v">${U.money(list.reduce((t,x)=>t+S().lineAmount(x.q,x.r.price),0))}</span></div>`,
        {actions:[{label:'Export CSV', class:'btn-dark', onClick:(close)=>{
          const out=[['Item','Order qty','Unit','Supplier','Contact','Phone','Est. cost']];
          list.forEach(({r,q})=>out.push([r.name,q,r.unit||'',(r.supplier&&r.supplier.name)||'',(r.supplier&&r.supplier.contact)||'',(r.supplier&&r.supplier.phone)||'',S().lineAmount(q,r.price).toFixed(2)]));
          U.downloadCSV(`order-list-${U.todayISO()}.csv`, out); close(); U.toast('Exported','green');
        }}]});
    };

    U.qs('#fcAsk',actions).onclick = async()=>{
      const box=U.qs('#fcAi',c); box.innerHTML=`<p class="muted">Thinking…</p>`;
      const lines = rows.slice(0,25).map(r=>{
        const m=r.move;
        return `${r.name} (${r.kind}): ${r.qty}${r.unit||''} on hand, ${r.daily?r.daily.toFixed(2)+'/day used':'usage unknown'}, `
             + `${r.cover!=null?r.cover.toFixed(1)+' days cover':'no cover estimate'}, last price $${(+r.price||0).toFixed(2)}`
             + `${m.dir!=='flat'?`, price ${m.dir} ${Math.abs(m.pct).toFixed(1)}%`:''}`;
      }).join('\n');
      const q = `Here is my restaurant's current stock position:\n${lines}\n\n`
              + `In 4-6 short bullet points: what should I order in the next few days, what is at risk of running out or going off, and which ingredient prices are creeping up? Keep it practical for a small restaurant owner. Do not give financial or legal advice.`;
      let out=null;
      try{ out = MKR.assistant && MKR.assistant.llm ? await MKR.assistant.llm(q,{role:'owner'}) : null; }catch(e){}
      box.innerHTML = out || `<div class="alert amber"><span>${MKR.ui.icon('warning')}</span><div>The AI assistant isn't reachable right now. The table above still tells you what's short — sort by days of cover.</div></div>`;
    };
  }

  MKR.stockView = { render };
})();
