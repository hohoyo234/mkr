/* ===== Home tiles — the owner's own springboard =====
   Every page in the app as a tile, and the owner decides which ones sit on their
   home screen and in what order. Long-press or hit Edit to rearrange, pull one
   off, or add one back. Same idea as the home screen on a tablet: the tools you
   actually use are one tap away, the rest are still in the menu.

   The catalogue is generated from the portal's own nav, so a tile can never
   point at a page the venue has switched off — the feature flags are honoured
   in exactly one place.

   Layout lives on the device (localStorage), keyed by role: two owners sharing a
   tablet get the same tiles, the same owner on their phone can order them
   differently. Nothing here is business data, so none of it goes to the cloud.
*/
window.MKR = window.MKR || {};
(function(){
  const U = MKR.util;
  const KEY = (role)=> 'mkr_tiles_'+role;

  // Pages that live in another portal but are part of the owner's daily round.
  // Kept out of the nav on purpose (they belong to the manager) but worth a tile.
  const EXTRA = {
    owner: [
      {id:'x_schedule', href:'#/manager/schedule', label:'Rostering',   icon:'calendar'},
      {id:'x_tasks',    href:'#/manager/tasks',    label:'Daily tasks', icon:'checksq'},
    ],
  };

  // Tiles you'd want on day one, in the order an owner actually works.
  const DEFAULTS = {
    owner:   ['stock','deliveries','x_tasks','x_schedule','training','alerts'],
    manager: ['schedule','tasks','stock','deliveries','training','swaps'],
    staff:   ['my','tasks','training','deliveries'],
  };

  function catalogue(role){
    const portal = MKR.portals[role];
    if(!portal) return [];
    const can = (n)=> !n.feature || (MKR.features && MKR.features.can(n.feature, role));
    // `icon` is the nav id: MKR.ui maps ids to the same icon the sidebar uses, so
    // a tile and its menu row can never drift apart.
    const fromNav = portal.nav.filter(n=> n.id!=='dashboard' && can(n)).map(n=>({
      id:n.id, href:`#/${role}/${n.id}`, label:n.label, icon:n.id, badgeKey:n.id,
    }));
    return fromNav.concat(EXTRA[role]||[]);
  }

  // A tile's number has to be the same number the restaurant floor puts on the
  // matching room, or the two home screens contradict each other. So take them
  // from the same place: the floor's own counts, topped up with whatever the
  // portal already publishes for the sidebar.
  const FLOOR_TO_TILE = {
    stock:'stock', delivery:'deliveries', kitchen:'x_tasks',
    team:'x_schedule', training:'training', office:'alerts',
  };
  async function badgesFor(role, portal){
    let b = {};
    try{ b = portal && portal.badges ? await portal.badges() : {}; }catch(e){}
    if(role==='owner' && MKR.gameMap){
      try{
        const rooms = (await MKR.gameMap.counts()).rooms || {};
        Object.keys(FLOOR_TO_TILE).forEach(k=>{
          const n = rooms[k] && rooms[k].n;
          if(n) b[FLOOR_TO_TILE[k]] = n; else delete b[FLOOR_TO_TILE[k]];
        });
      }catch(e){}
    }
    return b;
  }

  function readLayout(role, cat){
    let ids = null;
    try{ ids = JSON.parse(localStorage.getItem(KEY(role))||'null'); }catch(e){}
    if(!Array.isArray(ids)) ids = (DEFAULTS[role]||[]).slice();
    // Drop anything that no longer exists — a switched-off feature leaves the
    // catalogue, so its tile has to leave the home screen with it.
    return ids.filter(id=> cat.some(t=>t.id===id));
  }
  function writeLayout(role, ids){ try{ localStorage.setItem(KEY(role), JSON.stringify(ids)); }catch(e){} }

  // Nav ids get the sidebar's icon; the cross-portal extras name theirs directly.
  const iconOf = (t)=> MKR.ui.NAV[t.icon] ? MKR.ui.navIcon(t.icon) : MKR.ui.icon(t.icon);

  // Nav tiles carry the nav id as their badge key; the cross-portal extras are
  // keyed by their own id (that's what FLOOR_TO_TILE writes), so fall back to it
  // — otherwise the kitchen's 5 jobs show on the floor and nowhere here.
  const badgeOf = (t, badges)=> badges[t.badgeKey || t.id];

  function tileHtml(t, badge, editing){
    const label = U.esc(t.label);
    return `<a class="tile" data-tile="${t.id}" ${editing?'':`href="${t.href}"`} aria-label="${label}">
      ${editing?`<button class="tile-x" data-off="${t.id}" aria-label="Take ${label} off the home screen">−</button>`:''}
      <span class="tile-ic">${iconOf(t)}${badge?`<span class="tile-badge">${badge}</span>`:''}</span>
      <span class="tile-label">${label}</span>
    </a>`;
  }

  // opts: {role}
  async function render(host, opts){
    const role = (opts&&opts.role) || 'owner';
    const portal = MKR.portals[role];
    const cat = catalogue(role);
    let ids = readLayout(role, cat);
    let editing = false;

    const badges = await badgesFor(role, portal);

    function draw(){
      const tiles = ids.map(id=>cat.find(t=>t.id===id)).filter(Boolean);
      host.innerHTML = `
        <div class="tiles-wrap${editing?' tiles-edit':''}">
          <div class="tiles-head">
            <div><b>Your home screen</b><span>${editing?'Drag to move · − to take one off':'The pages you use, one tap away'}</span></div>
            <button class="btn ${editing?'btn-dark':'btn-ghost'} btn-sm" id="tilesEdit">${editing?'Done':'Edit'}</button>
          </div>
          <div class="tiles-grid" id="tilesGrid">
            ${tiles.map(t=>tileHtml(t, badgeOf(t, badges), editing)).join('')}
            ${editing?`<button class="tile tile-add" id="tileAdd" aria-label="Add a tile"><span class="tile-ic">${MKR.ui.icon('plus')}</span><span class="tile-label">Add</span></button>`:''}
          </div>
          ${tiles.length?'':`<div class="tiles-empty">No tiles yet — hit Edit and add the pages you open most.</div>`}
          <div class="kv-hint">${editing?'This layout is saved on this device only — nothing goes to the cloud.':'Tap Edit to add, drop or re-order the blocks.'}</div>
        </div>`;
      bind();
    }

    function bind(){
      U.qs('#tilesEdit', host).onclick = ()=>{ editing = !editing; draw(); };

      // Not editing, a tile is a real <a href> — so the back button, middle-click
      // and "open in new tab" all behave the way they do everywhere else. Nothing
      // to wire up for that case.
      U.qsa('[data-off]', host).forEach(b=> b.onclick = (e)=>{
        e.stopPropagation();
        ids = ids.filter(x=>x!==b.dataset.off);
        writeLayout(role, ids); draw();
      });

      const add = U.qs('#tileAdd', host);
      if(add) add.onclick = ()=> addSheet();

      if(editing) enableDrag();
    }

    // Pointer-based so the same code handles a mouse and a thumb; HTML5 drag
    // events never fire on touch.
    //
    // The move/up listeners sit on the window, not on the tile: dropping a tile
    // into a new slot means moving the element itself in the DOM, and a moved
    // element loses its pointer capture — so a tile listening for its own
    // pointerup would stop hearing it the moment it changed places, and the new
    // order would never get saved.
    function enableDrag(){
      const grid = U.qs('#tilesGrid', host);
      let drag = null;

      function onMove(e){
        if(!drag) return;
        const el = drag.el;
        if(!drag.moved){ drag.moved = true; el.classList.add('tile-dragging'); }
        // The tile stays in the grid and the others slide around it: whichever
        // tile the finger is over, swap into its slot. Steadier than a
        // free-floating ghost and it lands exactly where you can see it will.
        const over = document.elementFromPoint(e.clientX, e.clientY);
        const target = over && over.closest ? over.closest('.tile[data-tile]') : null;
        if(target && target!==el && target.parentNode===grid){
          const list = U.qsa('.tile[data-tile]', grid);
          const from = list.indexOf(el), to = list.indexOf(target);
          if(from>-1 && to>-1) grid.insertBefore(el, from<to ? target.nextSibling : target);
        }
      }

      function onEnd(){
        if(!drag) return;
        drag.el.classList.remove('tile-dragging');
        if(drag.moved){
          ids = U.qsa('.tile[data-tile]', grid).map(x=>x.dataset.tile);
          writeLayout(role, ids);
        }
        drag = null;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onEnd);
        window.removeEventListener('pointercancel', onEnd);
      }

      U.qsa('.tile[data-tile]', grid).forEach(el=>{
        el.addEventListener('pointerdown', (e)=>{
          if(e.target.closest('.tile-x')) return;
          drag = {el, moved:false};
          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onEnd);
          window.addEventListener('pointercancel', onEnd);
        });
      });
    }

    function addSheet(){
      const missing = cat.filter(t=> !ids.includes(t.id));
      if(!missing.length){ U.toast('Every page is already on your home screen','green'); return; }
      const wrap = U.el(`<div class="tiles-pick">
        ${missing.map(t=>`<button class="tile" data-add="${t.id}">
          <span class="tile-ic">${iconOf(t)}</span>
          <span class="tile-label">${U.esc(t.label)}</span>
        </button>`).join('')}
      </div>`);
      U.modal('Add a tile', wrap);
      U.qsa('[data-add]', wrap).forEach(b=> b.onclick = ()=>{
        ids = ids.concat([b.dataset.add]);
        writeLayout(role, ids);
        const back = wrap.closest('.modal-back'); if(back) back.remove();
        U.toast('Added to your home screen','green');
        draw();
      });
    }

    draw();
  }

  MKR.tiles = { render, catalogue, DEFAULTS };
})();
