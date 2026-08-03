/* ===== Stock · Shelf view (the room, not the table) =====
   Exactly the same MKR.stock data as the list — drawn as the space the owner
   actually walks. A cold room and a dry store, every item standing on a shelf,
   and how full the jar is IS the quantity. An empty-looking jar is the alert;
   nobody has to read a number to see it.

   Deliberately NOT a game: no levels, no points, no score, no character to walk
   around. Walking is what games do to spend your time, and the whole product
   exists to give time back. The picture is the interface, that is all.

   The loop is: see the empty jar → tap it → it lands in the basket → the basket
   becomes the order. One screen covers stocktake, reorder and purchase.
*/
window.MKR = window.MKR || {};
(function(){
  const U = MKR.util;
  const S = ()=>MKR.stock;
  const BKEY = 'mkr_shelf_basket';

  // ---------- basket ----------
  // {itemId: qty}. Kept on the device so wandering off to another page and back
  // doesn't lose a half-built order.
  function readBasket(){ try{ return JSON.parse(localStorage.getItem(BKEY)||'{}')||{}; }catch(e){ return {}; } }
  function writeBasket(b){ try{ localStorage.setItem(BKEY, JSON.stringify(b)); }catch(e){} }
  function basketQty(id){ return +readBasket()[id] || 0; }
  function setBasket(id, qty){
    const b = readBasket();
    if(!(qty>0)) delete b[id]; else b[id] = U.round2(qty);
    writeBasket(b); return b;
  }

  // ---------- what "a full jar" means ----------
  // Same target the forecast page orders to: enough to cover the delivery lead
  // time plus a week. With no usage history yet, twice the reorder point.
  function fullOf(r){
    const t = r.daily>0 ? r.daily*((+r.leadTimeDays||2)+7) : (+r.safety||0)*2;
    return Math.max(t, +r.qty||0, 0.01);
  }
  function suggestOf(r){
    const q = U.round2(fullOf(r) - (+r.qty||0));
    return q>0 ? q : 1;
  }
  function fillPct(r){
    const p = (+r.qty||0) / fullOf(r) * 100;
    if(p<=0) return 0;
    return Math.max(7, Math.min(100, Math.round(p)));   // a sliver still reads as "some left"
  }
  function stateOf(r){
    if(r.low || r.short || r.expiring) return 'low';
    if(fillPct(r) < 45) return 'warn';
    return 'ok';
  }
  const STATE_LABEL = {low:'Running out', warn:'Getting low', ok:'Well stocked'};

  // ---------- one glance = one picture ----------
  // Names are typed by the owner in whatever language they think in, so match
  // English and Chinese both. Falls back to the item kind.
  const EM = [
    [/tomato|番茄|西红柿/i,'🍅'], [/potato|土豆|薯仔/i,'🥔'], [/onion|洋葱/i,'🧅'],
    [/garlic|大蒜|蒜/i,'🧄'], [/carrot|胡萝卜/i,'🥕'], [/ginger|生姜|姜/i,'🫚'],
    [/lettuce|cabbage|salad|greens|白菜|生菜|青菜|菜心/i,'🥬'], [/mushroom|蘑菇|香菇/i,'🍄'],
    [/chilli|chili|pepper|capsicum|辣椒|青椒/i,'🌶️'], [/cucumber|黄瓜/i,'🥒'],
    [/corn|玉米/i,'🌽'], [/broccoli|西兰花/i,'🥦'], [/eggplant|aubergine|茄子/i,'🍆'],
    [/avocado|牛油果/i,'🥑'], [/lemon|lime|柠檬/i,'🍋'], [/apple|苹果/i,'🍎'],
    [/beef|steak|牛肉|牛排/i,'🥩'], [/pork|bacon|猪肉|培根|五花/i,'🥓'],
    [/chicken|poultry|鸡肉|鸡/i,'🍗'], [/lamb|羊肉/i,'🍖'], [/duck|鸭/i,'🦆'],
    [/fish|salmon|鱼|三文鱼/i,'🐟'], [/prawn|shrimp|虾/i,'🍤'], [/squid|calamari|鱿鱼/i,'🦑'],
    [/crab|蟹/i,'🦀'], [/oyster|scallop|蚝|生蚝|扇贝/i,'🦪'],
    [/egg|鸡蛋|蛋/i,'🥚'], [/milk|cream|牛奶|奶油|淡奶/i,'🥛'], [/cheese|芝士|奶酪/i,'🧀'],
    [/butter|黄油/i,'🧈'], [/tofu|豆腐/i,'🍢'],
    // noodles before rice: "rice noodles" is a noodle, not a bowl of rice
    [/noodle|udon|ramen|vermicelli|面条|拉面|米粉|河粉/i,'🍜'], [/pasta|spaghetti|意面/i,'🍝'],
    [/rice|米|饭/i,'🍚'],
    [/flour|面粉/i,'🌾'], [/bread|bun|toast|面包|馒头/i,'🍞'], [/dumpling|饺子|包子/i,'🥟'],
    [/oil|油/i,'🫒'], [/soy|sauce|vinegar|酱油|醋|酱/i,'🍶'], [/salt|盐/i,'🧂'],
    [/sugar|糖/i,'🍬'], [/honey|蜂蜜/i,'🍯'], [/spice|powder|香料|粉/i,'🫙'],
    [/wine|酒/i,'🍷'], [/beer|啤酒/i,'🍺'], [/coffee|咖啡/i,'☕'], [/tea|茶/i,'🍵'],
    [/water|水/i,'💧'], [/ice|冰/i,'🧊'],
    [/chopstick|筷/i,'🥢'], [/glove|手套/i,'🧤'], [/container|box|takeaway|打包|餐盒|盒/i,'🥡'],
    [/bag|袋/i,'🛍️'], [/napkin|tissue|paper|纸巾|纸/i,'🧻'], [/clean|detergent|soap|清洁|洗洁精/i,'🧴'],
    [/foil|wrap|保鲜膜|锡纸/i,'🧾'], [/cup|杯/i,'🥤'], [/plate|bowl|碟|碗|盘/i,'🍽️'],
    [/knife|刀/i,'🔪'], [/towel|sponge|抹布|海绵/i,'🧽'], [/straw|吸管/i,'🥤'],
  ];
  function emojiFor(r){
    const n = String(r.name||'');
    for(const [re, em] of EM) if(re.test(n)) return em;
    return (S().KIND[r.kind]||{}).em || '📦';
  }

  // ---------- pieces ----------
  // Where the reorder point sits on the glass, as a percentage of a full jar.
  // Drawing it is the difference between "that jar looks lowish" and "that jar
  // is under the line" — the same judgement, made for you.
  function markPct(r){
    const s = +r.safety||0; if(!(s>0)) return null;
    const p = s / fullOf(r) * 100;
    return (p<3 || p>97) ? null : Math.round(p);
  }

  function jarHtml(r, big){
    const st = stateOf(r), pct = fillPct(r), mk = markPct(r);
    const cover = r.cover==null ? '' : `<span class="gv-cover">${Math.floor(r.cover)}d</span>`;
    return `<span class="gv-jar st-${st}${big?' big':''}">
        ${cover}
        <span class="gv-em">${emojiFor(r)}</span>
        <span class="gv-glass">
          <span class="gv-fill" style="height:${pct}%"></span>
          ${mk!=null?`<span class="gv-mark" style="bottom:${mk}%" title="Reorder at ${r.safety} ${U.esc(r.unit||'')}"></span>`:''}
          <span class="gv-qty">${U.esc(String(r.qty))}<i>${U.esc(r.unit||'')}</i></span>
        </span>
      </span>`;
  }

  function slotHtml(r){
    const inb = basketQty(r.id);
    // The badge is a glance, not a spec — whole numbers once we're past 1.
    const badge = inb ? (inb>=1 ? Math.round(inb) : inb) : '+';
    const st = stateOf(r);
    return `<div class="gv-slot" data-slot="${r.id}">
      <button class="gv-tap" data-open="${r.id}" aria-label="${U.esc(r.name)} — ${r.qty} ${U.esc(r.unit||'')}, ${STATE_LABEL[st]}">${jarHtml(r)}</button>
      <button class="gv-add${inb?' on':''}" data-add="${r.id}" aria-label="Add ${U.esc(r.name)} to the basket">${badge}</button>
      <span class="gv-tag st-${st}"><b>${U.esc(r.name)}</b><i>${U.money(r.price)}/${U.esc(r.unit||'unit')}</i></span>
    </div>`;
  }

  // Worst first. A shelf sorted alphabetically makes you read every jar; a shelf
  // sorted by how empty it is means the answer is always in the top-left corner.
  const RANK = {low:0, warn:1, ok:2};
  const byUrgency = (a,b)=> (RANK[stateOf(a)]-RANK[stateOf(b)]) || (fillPct(a)-fillPct(b))
                            || String(a.name).localeCompare(String(b.name));

  function zoneHtml(key, title, hint, list){
    return `<section class="gv-room ${key}">
      <header class="gv-room-head"><b>${title}</b><span>${hint}</span></header>
      ${list.length
        ? `<div class="gv-shelf">${list.slice().sort(byUrgency).map(slotHtml).join('')}</div>`
        : `<div class="gv-empty">Nothing on this shelf yet — add an item and it shows up here.</div>`}
    </section>`;
  }

  // ---------- render ----------
  // opts: {rows, reload, onEdit}
  async function render(c, opts){
    const o = opts||{};
    const rows = o.rows || await S().overview();
    const perish = rows.filter(r=>r.kind==='perishable');
    const durable = rows.filter(r=>r.kind!=='perishable');
    const needs = rows.filter(r=>stateOf(r)==='low');
    const value = rows.reduce((t,r)=>t+r.value,0);

    // Naming the items that need topping up beats a number that makes you go
    // hunting for them — and each name is the tap that orders it.
    // …and each one says why it's in the strip, because "about to go off" and
    // "about to run out" are different problems with different answers.
    const why = (r)=> r.expiring ? `use it — ${r.shelfLifeDays}-day life almost up`
                    : r.low      ? `${r.qty} ${r.unit||''} left · reorder at ${r.safety}`
                    : r.cover!=null ? `${r.cover.toFixed(1)} days left`
                    : `${r.qty} ${r.unit||''} left`;
    const needStrip = needs.length ? `<div class="gv-needs">
        <span class="gv-needs-h">Needs you today</span>
        ${needs.slice().sort(byUrgency).map(r=>`<button class="chip chip-hot" data-need="${r.id}">
          ${emojiFor(r)} ${U.esc(r.name)} <i>${U.esc(why(r))}</i></button>`).join('')}
        <button class="btn btn-dark btn-sm" id="gvFill">🧺 Basket the lot</button>
      </div>` : '';

    c.innerHTML = `
      <div class="gv">
        <div class="gv-top">
          <div class="gv-top-num ${needs.length?'hot':''}"><b>${needs.length}</b><i>need topping up</i></div>
          <div class="gv-top-num"><b>${U.money0(value)}</b><i>on the shelves</i></div>
          ${needs.length?'':`<button class="btn btn-ghost btn-sm" id="gvFill">🧺 Fill the basket for me</button>`}
        </div>
        ${needStrip}
        ${zoneHtml('cold','🧊 Cold room','fresh food — the clock is running', perish)}
        ${zoneHtml('dry','🧺 Dry store','tools and consumables — counted, never goes off', durable)}
        <div class="gv-hint">Tap a jar to look at it · tap <b>+</b> to drop it straight in the basket</div>
        <div class="gv-bar" id="gvBar" hidden>
          <span class="gv-bar-txt"><b id="gvBarN">0</b> <i>in the basket</i></span>
          <span class="gv-bar-sum" id="gvBarSum">$0.00</span>
          <button class="btn btn-dark btn-sm" id="gvBarGo">Open the order →</button>
        </div>
      </div>`;

    const byId = id=> rows.find(r=>r.id===id);

    // Repaint one slot in place — a tap should feel instant, not like a reload.
    function syncSlot(id){
      const slot = U.qs(`[data-slot="${id}"]`, c);
      const r = byId(id);
      if(slot && r) slot.outerHTML = slotHtml(r);
      bindSlots();
    }
    function syncBar(){
      const b = readBasket();
      const lines = Object.keys(b).map(id=>({r:byId(id), q:b[id]})).filter(x=>x.r);
      const n = lines.length;
      const sum = lines.reduce((t,x)=>t+S().lineAmount(x.q, x.r.price), 0);
      const bar = U.qs('#gvBar', c);
      bar.hidden = !n;
      // On a phone the basket bar and the assistant bubble want the same corner.
      document.body.classList.toggle('gv-basket', !!n);
      U.qs('#gvBarN', c).textContent = n;
      U.qs('#gvBarSum', c).textContent = U.money(sum);
    }
    function bindSlots(){
      U.qsa('[data-open]', c).forEach(b=> b.onclick = ()=> itemSheet(byId(b.dataset.open), {syncSlot, syncBar, reload:o.reload, onEdit:o.onEdit}));
      U.qsa('[data-add]', c).forEach(b=> b.onclick = ()=>{
        const r = byId(b.dataset.add);
        const have = basketQty(r.id);
        setBasket(r.id, have ? have + suggestOf(r) : suggestOf(r));
        syncSlot(r.id); syncBar();
        U.toast(`${r.name} → basket`, 'green');
      });
    }

    bindSlots(); syncBar();

    // A name in the "running out" strip is a shortcut into the basket.
    U.qsa('[data-need]', c).forEach(b=> b.onclick = ()=>{
      const r = byId(b.dataset.need); if(!r) return;
      setBasket(r.id, suggestOf(r));
      syncSlot(r.id); syncBar();
      U.toast(`${r.name} → basket`, 'green');
    });

    U.qs('#gvFill', c).onclick = ()=>{
      const low = rows.filter(r=>stateOf(r)==='low');
      if(!low.length){ U.toast('Nothing needs topping up','green'); return; }
      low.forEach(r=> setBasket(r.id, suggestOf(r)));
      low.forEach(r=> syncSlot(r.id));
      syncBar();
      U.toast(`${low.length} item(s) in the basket`, 'green');
    };
    U.qs('#gvBarGo', c).onclick = ()=> basketSheet(rows, o.reload);
  }

  // ---------- one item ----------
  function itemSheet(r, h){
    if(!r) return;
    const st = stateOf(r);
    const row = (k,v)=>`<div class="li"><div class="meta"><span>${k}</span><b>${v}</b></div></div>`;
    const wrap = U.el(`<div class="gv-sheet">
      <div class="gv-sheet-top">
        ${jarHtml(r, true)}
        <div class="gv-sheet-meta">
          <span class="pill ${st==='low'?'danger':(st==='warn'?'warn':'ok')}">${STATE_LABEL[st]}</span>
          <p>${U.esc(String(r.qty))} ${U.esc(r.unit||'')} on the shelf · reorder at ${r.safety} ${U.esc(r.unit||'')}</p>
          ${r.expiring?`<p class="gv-warnline">⚠️ Near the end of its ${r.shelfLifeDays}-day shelf life</p>`:''}
        </div>
      </div>
      <div class="list mt12">
        ${row('Days of cover', r.cover==null ? 'needs 2 stocktakes' : r.cover.toFixed(1)+' days')}
        ${row('Used per day', r.daily ? r.daily.toFixed(2)+' '+U.esc(r.unit||'') : '—')}
        ${row('Last price paid', U.money(r.price)+' / '+U.esc(r.unit||'unit')+' &nbsp;'+S().moveBadge(r))}
        ${row('Supplier', r.supplier ? U.esc(r.supplier.name)+(r.supplier.phone?` · <a href="tel:${U.esc(r.supplier.phone)}">${U.esc(r.supplier.phone)}</a>`:'') : '<span class="faint">not set</span>')}
      </div>

      <div class="gv-order">
        <label>Order how much?</label>
        <div class="gv-step">
          <button class="gv-step-b" data-step="-1" aria-label="less">−</button>
          <input class="input" id="gv_q" type="number" step="0.01" value="${basketQty(r.id) || suggestOf(r)}">
          <span class="gv-step-u">${U.esc(r.unit||'')}</span>
          <button class="gv-step-b" data-step="1" aria-label="more">+</button>
        </div>
        <p class="faint">Suggested ${suggestOf(r)} ${U.esc(r.unit||'')} — enough to cover the ${r.leadTimeDays||2}-day delivery plus a week.</p>
      </div>

      <div class="gv-order">
        <label>Or just counted it? Type what's really there</label>
        <div class="gv-step">
          <input class="input" id="gv_c" type="number" step="0.01" placeholder="${U.esc(String(r.qty))}">
          <span class="gv-step-u">${U.esc(r.unit||'')}</span>
          <button class="btn btn-ghost btn-sm" id="gv_csave">Save count</button>
        </div>
        <p class="faint">Counting is the only place usage comes from — there's no till in this app.</p>
      </div>
    </div>`);

    U.qsa('[data-step]', wrap).forEach(b=> b.onclick = ()=>{
      const i = U.qs('#gv_q', wrap);
      const step = Math.max(0.5, U.round2(suggestOf(r)/4));
      i.value = Math.max(0, U.round2((Number(i.value)||0) + step*Number(b.dataset.step)));
    });

    const actions = [
      {label:'Edit item', class:'btn-ghost', onClick:(close)=>{ close(); if(h.onEdit) h.onEdit(r); }},
      {label:'Put in the basket', class:'btn-dark', onClick:(close)=>{
        const q = Number(U.qs('#gv_q', wrap).value)||0;
        setBasket(r.id, q);
        close(); h.syncSlot(r.id); h.syncBar();
        U.toast(q>0 ? `${r.name} → basket` : 'Removed from the basket', q>0?'green':'amber');
      }},
    ];

    U.modal(`${emojiFor(r)} ${r.name}`, wrap, {actions});

    U.qs('#gv_csave', wrap).onclick = async()=>{
      const v = U.qs('#gv_c', wrap).value;
      if(v===''){ U.toast('Type what you counted','amber'); return; }
      await S().saveStocktake([{itemId:r.id, counted:Number(v)}], 'counted on the shelf');
      U.toast('Stocktake saved','green');
      const back = wrap.closest('.modal-back'); if(back) back.remove();
      if(h.reload) h.reload();
    };
  }

  // ---------- the basket becomes the order ----------
  function basketSheet(rows, reload){
    const b = readBasket();
    let lines = Object.keys(b).map(id=>({r:rows.find(x=>x.id===id), q:+b[id]})).filter(x=>x.r && x.q>0);
    if(!lines.length){ U.toast('The basket is empty','amber'); return; }

    // Grouped by supplier, because that's how you actually ring an order through.
    const groups = [];
    lines.forEach(l=>{
      const key = (l.r.supplier && l.r.supplier.id) || '';
      let g = groups.find(x=>x.key===key);
      if(!g){ g = {key, sup:l.r.supplier||null, lines:[]}; groups.push(g); }
      g.lines.push(l);
    });

    const total = ()=> lines.reduce((t,x)=>t+S().lineAmount(x.q, x.r.price), 0);
    const wrap = U.el(`<div>
      ${groups.map(g=>`<div class="gv-group">
        <div class="gv-group-head">🚚 ${g.sup?U.esc(g.sup.name):'No supplier set'}${g.sup&&g.sup.phone?` <a class="linkish" href="tel:${U.esc(g.sup.phone)}">${U.esc(g.sup.phone)}</a>`:''}</div>
        <div class="list">${g.lines.map(l=>`
          <div class="li" data-line="${l.r.id}">
            <div class="ds-li-ic">${emojiFor(l.r)}</div>
            <div class="meta"><b>${U.esc(l.r.name)}</b><span>${U.money(l.r.price)} / ${U.esc(l.r.unit||'unit')}</span></div>
            <div class="gv-step tight">
              <button class="gv-step-b" data-dec="${l.r.id}" aria-label="less">−</button>
              <input class="input" type="number" step="0.01" data-q="${l.r.id}" value="${l.q}">
              <button class="gv-step-b" data-inc="${l.r.id}" aria-label="more">+</button>
            </div>
            <b class="gv-line-amt" data-amt="${l.r.id}">${U.money(S().lineAmount(l.q,l.r.price))}</b>
          </div>`).join('')}</div>
      </div>`).join('')}
      <div class="cart-total mt8"><span>Estimated cost</span><span class="v" id="gv_total">${U.money(total())}</span></div>
      <div class="disclaimer"><span>🚚</span><div>Two ways out of here. <b>Expect it at the back door</b> when you've just placed the order — whoever takes the delivery counts it off the truck, and the docket files itself. <b>Already arrived</b> is for stock that's standing in front of you right now.</div></div>
    </div>`);

    function recalc(){
      lines.forEach(l=>{
        const amt = S().lineAmount(l.q, l.r.price);
        const el = U.qs(`[data-amt="${l.r.id}"]`, wrap);
        if(el) el.textContent = U.money(amt);
      });
      U.qs('#gv_total', wrap).textContent = U.money(total());
    }
    function bump(id, dir){
      const l = lines.find(x=>x.r.id===id); if(!l) return;
      const step = Math.max(0.5, U.round2(suggestOf(l.r)/4));
      l.q = Math.max(0, U.round2(l.q + step*dir));
      U.qs(`[data-q="${id}"]`, wrap).value = l.q;
      setBasket(id, l.q); recalc();
    }
    U.qsa('[data-inc]', wrap).forEach(b=> b.onclick = ()=> bump(b.dataset.inc, 1));
    U.qsa('[data-dec]', wrap).forEach(b=> b.onclick = ()=> bump(b.dataset.dec, -1));
    U.qsa('[data-q]', wrap).forEach(i=> i.oninput = ()=>{
      const l = lines.find(x=>x.r.id===i.dataset.q); if(!l) return;
      l.q = Math.max(0, Number(i.value)||0); setBasket(l.r.id, l.q); recalc();
    });

    U.modal('🧺 The basket', wrap, {actions:[
      {label:'Empty it', class:'btn-ghost', onClick:async(close)=>{
        if(!(await U.confirm('Empty the basket', 'Clear everything you picked off the shelves?', {ok:'Empty it', danger:true}))) return;
        writeBasket({}); close(); U.toast('Basket emptied','amber'); if(reload) reload();
      }},
      {label:'Export CSV', class:'btn-ghost', onClick:(close)=>{
        const out = [['Supplier','Contact','Phone','Item','Order qty','Unit','Unit price','Est. cost']];
        groups.forEach(g=> g.lines.filter(l=>l.q>0).forEach(l=> out.push([
          g.sup?g.sup.name:'', g.sup?(g.sup.contact||''):'', g.sup?(g.sup.phone||''):'',
          l.r.name, l.q, l.r.unit||'', (+l.r.price||0).toFixed(2), S().lineAmount(l.q,l.r.price).toFixed(2)
        ])));
        if(out.length===1){ U.toast('Nothing to export','amber'); return; }
        U.downloadCSV(`order-${U.todayISO()}.csv`, out); close(); U.toast('Exported','green');
      }},
      {label:'Already arrived', class:'btn-ghost', onClick:async(close)=>{
        const live = groups.map(g=>({g, ls:g.lines.filter(l=>l.q>0)})).filter(x=>x.ls.length);
        if(!live.length){ U.toast('Nothing in the basket','amber'); return; }
        if(!(await U.confirm('Already arrived', 'This adds these quantities to your stock and logs the spend against each supplier. Only do it once the delivery is actually in.', {ok:'Record it'}))) return;
        for(const {g, ls} of live){
          await S().savePurchase({
            supplierId: g.sup ? g.sup.id : null,
            note: 'picked off the shelf view',
            lines: ls.map(l=>({itemId:l.r.id, name:l.r.name, unit:l.r.unit||'', qty:l.q, unitPrice:l.r.price||0})),
          });
        }
        writeBasket({}); close(); U.toast('Purchase recorded · stock topped up','green'); if(reload) reload();
      }},
      // The order you just placed becomes the delivery someone will take in —
      // so the same list gets checked off at the back door instead of typed out
      // a second time.
      {label:'🚚 Expect it at the back door', class:'btn-dark', onClick:async(close)=>{
        const live = groups.map(g=>({g, ls:g.lines.filter(l=>l.q>0)})).filter(x=>x.ls.length);
        if(!live.length){ U.toast('Nothing in the basket','amber'); return; }
        if(!MKR.deliveries){ U.toast('Deliveries are switched off','amber'); return; }
        for(const {g, ls} of live){
          await MKR.deliveries.save({
            supplierId: g.sup ? g.sup.id : null, supplierName: g.sup ? g.sup.name : '',
            lines: ls.map(l=>({itemId:l.r.id, name:l.r.name, unit:l.r.unit||'', ordered:l.q,
                               received:null, unitPrice:l.r.price||0, condition:'ok', note:''})),
          });
        }
        writeBasket({}); close();
        U.toast(`${live.length} delivery(ies) waiting at the back door`,'green');
        if(reload) reload();
      }},
    ]});
  }

  // Leaving the page takes the basket bar with it, so drop the body flag too.
  window.addEventListener('hashchange', ()=> document.body.classList.remove('gv-basket'));

  MKR.stockGame = { render, emojiFor, stateOf, fillPct, suggestOf, readBasket, writeBasket };
})();
