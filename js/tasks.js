/* ===== Daily task checklist — one list, one set of rules =====
   Three screens show today's tasks (the staff phone, the manager's kitchen map
   and the manager's plain list) and they used to each hold their own copy of
   "what is today" and "what does a tick require". They disagreed. Everything
   about a task now goes through here.
*/
window.MKR = window.MKR || {};
(function(){
  const U = MKR.util;

  // Above this a fridge is a food-safety problem someone has to be told about
  // tonight, not at the next audit. A frozen delivery reads −18 and passes it
  // on the way through, so one number covers both boxes.
  const MAX_C = 5;

  const needsValue = (t)=> /temperature|温度|溫度/i.test(String(t.name||''));
  const needsPhoto = (t)=> /photo|照片|拍照/i.test(String(t.name||''));

  // Today's checklist, republished from the template when the day turns over.
  // Without that the only task rows in the database are the ones written on
  // install day, and every morning after the first opens an empty list.
  async function today(){
    const date = U.todayISO();
    let list = (await MKR.db.getAll('tasks')).filter(t=>t.date===date);
    if(!list.length){
      const names = ((await MKR.db.meta('settings')) || {}).dailyTasks || [];
      // Ids derived from the date, so two screens opening at the same moment
      // publish one list rather than two.
      list = [];
      for(let i=0;i<names.length;i++)
        list.push(await MKR.db.put('tasks', {id:`t_${date}_${i}`, name:names[i], date, done:false, photo:null, by:null}));
    }
    return list;
  }

  // Tick it off. Returns {ok:false,msg} when the task asks for something the
  // caller hasn't got yet — the checklists show that as a toast.
  async function complete(t, {value, photo}={}){
    if(needsValue(t) && (value==null || value==='')) return {ok:false, msg:'Type the reading first'};
    if(needsPhoto(t) && !(photo || t.photo))         return {ok:false, msg:'This one needs the photo before it can be ticked'};
    const patch = {id:t.id, done:true, by:(MKR.auth.current()||{}).name || ''};
    if(value!=null && value!=='') patch.value = value+'°C';
    if(photo) patch.photo = photo;
    const saved = await MKR.db.put('tasks', patch);
    if(needsValue(t)) await checkTemp(value, t.name);
    return {ok:true, task:saved};
  }

  const uncomplete = (t)=> MKR.db.put('tasks', {id:t.id, done:false, by:null});

  // A reading that was only ever filed is not a check. Raised from the
  // checklist and from the back door, because a reading is a reading.
  async function checkTemp(c, where, max=MAX_C){
    const n = Number(c);
    if(!isFinite(n) || n<=max) return null;
    return MKR.alerts.raise({ key:`temp-${where}-${U.todayISO()}`, level:'red', type:'food-safety',
      title:'Temperature out of range',
      desc:`${where} read ${n}°C — above the ${max}°C limit. Check the unit and move the stock before it becomes a health issue.`});
  }

  MKR.tasks = { MAX_C, today, complete, uncomplete, checkTemp, needsValue, needsPhoto };
})();
