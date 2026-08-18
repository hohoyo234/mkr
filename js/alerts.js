/* ===== Alert center (deduplicated) =====
   raise() checks for an existing unread alert with the same key before creating
   a new one, so the same issue doesn't spam the feed.
*/
window.MKR = window.MKR || {};
(function(){
  async function _raise({key, level='amber', type='', title, desc}){
    const all = await MKR.db.getAll('alerts');
    if(key && all.some(a=>a.key===key && !a.read)) return null;
    const saved = await MKR.db.put('alerts',{key, level, type, title, desc, read:false, ts:Date.now()});
    // Push to the owner proactively (received even when the app is closed; degrades silently with no backend)
    if(MKR.notify && MKR.notify.push) MKR.notify.push({role:'owner'}, (level==='red'?'🚨 ':'🔔 ')+(title||'Critical alert'), desc||'', 'al');
    return saved;
  }

  // The dashboard raises from several tiles at once, and the check above is a
  // read followed by a write: three concurrent callers each read "nothing like
  // this yet" and each wrote one. Raises go through one promise chain, so the
  // check always sees the write in front of it.
  let queue = Promise.resolve();

  MKR.alerts = {
    raise(opts){ const run = queue.then(()=>_raise(opts), ()=>_raise(opts)); queue = run.catch(()=>{}); return run; },

    // A shift's planned start timestamp (its week's matching weekday + HH:MM)
    shiftStartTs(shift){
      const base = MKR.roster.dayTs(MKR.roster.weekOf(shift), shift.day);
      const [h,m] = shift.start.split(':').map(Number);
      return base + (h*60+m)*60000;
    }
  };
})();
