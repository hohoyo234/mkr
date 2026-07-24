/* ===== System language (English / 简体中文) =====
   Adds a bilingual layer on top of the (English-source) UI.

   How it works:
   - The whole app renders in English as the source of truth.
   - When the language is set to 中文, a MutationObserver walks the DOM and
     translates static text nodes + placeholder/title/aria-label attributes by
     EXACT match against the dictionary below. Exact match means dynamic values
     (money, names, IDs, interpolated strings) never get touched.
   - Because toasts / modals / confirmations all render through innerHTML, they
     get translated automatically too — no need to wrap every call site.

   To extend coverage: add `"English source": "中文"` pairs to T below.
*/
window.MKR = window.MKR || {};
(function(){
  const STORE='mkr_lang';
  // Every language the app can switch to. English is the source of truth (no
  // dictionary); each other code is filled in by a js/lang/<code>.js file that
  // calls MKR.i18n.register(). Add a language = add a file + a row here.
  const LANGS = [
    {code:'en',      label:'English'},
    {code:'zh-Hans', label:'简体中文'},
    {code:'zh-Hant', label:'繁體中文'},
    {code:'vi',      label:'Tiếng Việt'},
    {code:'ko',      label:'한국어'},
    {code:'th',      label:'ภาษาไทย'},
  ];
  const CODES = LANGS.map(l=>l.code);
  // Maps our code to the value we put on <html lang>, which is what the CSS
  // per-language font stacks key off (so Traditional never borrows a Simplified font).
  const HTML_LANG = {'en':'en','zh-Hans':'zh-CN','zh-Hant':'zh-TW','vi':'vi','ko':'ko','th':'th'};
  function normalize(l){ if(l==='zh') return 'zh-Hans'; return CODES.includes(l) ? l : 'en'; }
  let lang = normalize((function(){ try{ return localStorage.getItem(STORE)||'en'; }catch(e){ return 'en'; } })());

  // ---- Dictionary: exact English source -> 简体中文 ----
  const T = {
    // Roles / nav / subtitles
    // -- local preview entry --
    "👀 Preview without an account":"👀 不用账号，直接预览",
    "Opens the app on this device with sample data only. No cloud sign-in, and nothing you do here is saved to the venue's real records.":"用本机的示例数据打开，不需要云端登录；在预览里做的任何操作都不会写入真实门店数据。",
    "👑 Owner":"👑 老板", "📋 Manager":"📋 经理", "🧑‍🍳 Staff":"🧑‍🍳 员工",
    "Opening…":"正在打开…", "Exit preview →":"退出预览 →",
    "None overdue yet ›":"暂无逾期 ›", "All signed off ›":"全部已签字 ›",
    // Emoji-prefixed labels — the translator matches whole text nodes, so the
    // stat cards and tabs need their own keys including the leading emoji.
    "📦 Stock":"📦 库存", "🧾 Purchases":"🧾 采购", "🚚 Suppliers":"🚚 供应商", "📈 Forecast":"📈 预测",
    "📦 Total stock value":"📦 库存总金额", "🥬 Perishable":"🥬 易腐（会坏）", "🥢 Non-perishable":"🥢 耐用（不会坏）",
    "⚠️ Needs attention":"⚠️ 需要关注",
    "🧾 Purchases logged":"🧾 采购笔数", "💵 Spent · last 30 days":"💵 近 30 天支出", "🚚 Suppliers used":"🚚 合作供应商",
    "🕒 Waiting to confirm":"🕒 待确认", "✅ Confirmed":"✅ 已确认", "⚠️ With problems":"⚠️ 有问题",
    "📘 SOPs":"📘 SOP 数", "📝 Outstanding":"📝 未完成", "⏰ Overdue":"⏰ 已逾期",
    "📘 SOP library":"📘 SOP 库", "👥 Training status":"👥 培训进度", "📝 Assigned training":"📝 已派培训",
    "📝 To do":"📝 待完成", "✅ Completed":"✅ 已完成", "📚 All SOPs — look anything up":"📚 全部 SOP —— 随时查",
    "👥 People rostered":"👥 已排班人数", "📅 Shifts":"📅 班次数", "⏱️ Total hours":"⏱️ 总工时", "⚠️ Warnings":"⚠️ 提醒",
    "📈 Usage & days of cover":"📈 用量与可用天数", "✨ What the assistant says":"✨ 助手怎么说",
    "✅ Wants a decision":"✅ 需要你决定", "👥 On today":"👥 今天在岗", "🚨 Alerts":"🚨 提醒",
    "⚠️ Roster warnings":"⚠️ 排班提醒", "📘 Training & SOP":"📘 培训与 SOP",
    "🥬 Perishable · goes off":"🥬 易腐 · 会坏",
    "🥢 Non-perishable · tools & consumables":"🥢 耐用 · 工具与耗材",
    "⚠️ Worth a look — none of this blocks anything":"⚠️ 值得看一眼 —— 这些都不会挡住你",
    "✨ Why it planned it this way":"✨ 为什么这样排",
    "⚖️ Optional Australian add-ons":"⚖️ 澳洲可选附加功能",
    "📤 Data export":"📤 数据导出",
    "🏪 Restaurant profile":"🏪 餐厅资料",
    // ===== Time-saving back-of-house rebuild (stock · deliveries · training · AI rostering) =====
    // -- portal subtitles + nav --
    "Fewer hours on admin — the app only asks when it has to":"少花时间做行政 —— 有事才找你",
    "Run the floor · roster / stock / deliveries / team":"日常运营 · 排班 / 库存 / 送货 / 团队",
    "Today":"今天", "Stock & costs":"库存与成本", "Deliveries":"送货", "Training & SOP":"培训与 SOP",
    "My training":"我的培训", "Rostering":"排班", "Training":"培训",
    "Stock":"库存", "Delivery":"送货", "Roster":"排班",
    "Runs quietly — it only asks for you when something actually needs you":"安静运行 —— 只有真的需要你时才提醒",
    "Nothing needs you right now":"现在没有需要你处理的事",
    "Nothing outstanding. Go and run your restaurant.":"没有待办了，安心去做生意吧。",
    // -- simplified "Today" home --
    "Needs you now":"现在需要你处理", "Deliveries to confirm":"待确认的送货", "Check them at the back door":"在后门点收一下",
    "Stock running low":"库存快没了", "Training overdue":"培训逾期了", "Waiting to be signed off":"还没签字确认",
    "Roster is short today":"今天排班人手不够", "Fewer people on than you planned":"上班人数比计划少",
    "Unread alerts":"未读提醒", "Tap to review":"点开看看",
    "Everything else is running fine":"其他都正常，不用管", "This week":"本周",
    "No shift today":"今天不用上班", "Enjoy your day off.":"好好休息。", "Just today this week.":"本周只有今天这一班。",
    "No shifts rostered this week":"本周没有排班", "Clock in":"打卡上班", "Clocked in":"已打卡", "Drop":"转班",
    "rostered":"已排", "shifts":"班次", "total":"合计", "warnings":"提醒", "all clear":"一切正常",
    "stock value":"库存价值", "perishable":"易腐", "non-perishable":"耐用", "needs attention":"需关注",
    "purchases":"采购笔数", "spent · 30d":"近30天支出", "suppliers":"供应商",
    "waiting":"待确认", "confirmed":"已确认", "problems":"有问题",
    "SOPs":"SOP 数", "outstanding":"未完成", "overdue":"已逾期",
    // button labels (icons replaced the emoji prefixes, so the plain text needs its own key)
    "Stocktake":"盘点", "Export CSV":"导出 CSV", "Add item":"添加物品", "Record purchase":"录入采购",
    "Add line":"加一行", "Add supplier":"添加供应商", "Ask AI":"问 AI", "New delivery":"新建送货",
    "Assign training":"派培训", "New SOP":"新建 SOP", "Preferences":"偏好设置", "Export":"导出", "AI auto-roster":"AI 自动排班",
    "Today's checklist":"今日清单", "This week's roster":"本周排班",
    "On now":"当前在岗", "Rostered today":"今天排班", "Clocked in":"已打卡", "Tasks done":"任务完成",
    "Stock value":"库存价值", "Low or expiring":"偏低或临期", "Deliveries waiting":"待确认送货", "Training outstanding":"待完成培训",
    "Wants a decision":"需要你决定", "On today":"今天在岗", "Roster warnings":"排班提醒",
    "Nothing short ›":"没有告急 ›", "None pending ›":"没有待办 ›", "All on track ›":"都在正轨 ›",
    "items tracked":"项在册", "Scheduled":"已排班", "Nobody rostered today":"今天没有人排班",
    "Advisory only — nothing here blocks a roster.":"仅供参考 —— 这些都不会阻止排班。",
    "Nothing flagged on this week's roster":"本周排班没有需要注意的",
    "This app tracks your own operations only. It doesn't calculate pay, interpret awards, or talk to any government system.":"本系统只记录你自己的运营数据。不计算工资、不解读 Award、不与任何政府系统对接。",

    // -- stock --
    "Ingredients and tools · what you hold, what it cost, who you buy it from":"原料与工具 · 有多少、花了多少、从谁那买的",
    "Purchases":"采购", "Suppliers":"供应商", "Forecast":"预测",
    "🔢 Stocktake":"🔢 盘点", "Stocktake":"盘点", "＋ Add item":"＋ 添加物品", "Add stock item":"添加库存物品",
    "⬇️ Export CSV":"⬇️ 导出 CSV", "Total stock value":"库存总金额",
    "Perishable":"易腐（会坏）", "Non-perishable":"耐用（不会坏）",
    "Goes off — has a shelf life":"会坏 —— 有保质期",
    "Doesn't go off — tools & consumables":"不会坏 —— 工具与耗材",
    "🥬 Perishable · goes off":"🥬 易腐 · 会坏",
    "🥢 Non-perishable · tools & consumables":"🥢 耐用 · 工具与耗材",
    "shelf life tracked from the last delivery":"保质期从最近一次到货开始算",
    "chopsticks, containers, gloves — counted, never expires":"筷子、餐盒、手套 —— 只需盘点，不会过期",
    "Needs attention":"需要关注", "low or near expiry":"偏低或临期",
    "Item":"物品", "Qty":"数量", "Unit price":"单价", "Amount":"金额", "Price trend":"价格涨跌", "Supplier":"供应商",
    "Quantity on hand":"当前数量", "Unit":"单位", "Unit price paid (AUD)":"采购单价（澳元）",
    "Reorder at":"补货线", "Usual supplier":"常用供应商", "Delivery lead time (days)":"送货周期（天）",
    "Shelf life (days) — perishable only":"保质期（天）—— 仅易腐品",
    "Low":"偏低", "Near expiry":"临期", "steady":"持平", "first":"首次",
    "Amount = quantity × the last price you actually paid. Price trend compares your two most recent purchase prices for that item.":"金额 = 数量 × 最近一次实际采购单价。价格涨跌对比该物品最近两次的采购价。",
    "Changing the unit price here records a price change, so it shows up in the ▲▼ trend.":"在这里改单价会记录一次价格变动，会显示在 ▲▼ 涨跌里。",
    "No price recorded yet — it fills in as you log purchases.":"还没有价格记录 —— 录入采购后会自动累积。",
    "Walk the shelves and type what you actually count. Anything you leave blank is skipped. Counting regularly is what makes the usage forecast work — it's the only place usage comes from.":"到货架前点一遍，把实际数到的填进去，留空的会跳过。用量预测完全依赖盘点 —— 这是唯一的数据来源。",
    "System":"系统数", "Counted":"实盘数", "Save count":"保存盘点",
    "＋ Record purchase":"＋ 录入采购", "Record a purchase":"录入一笔采购",
    "Purchases logged":"采购笔数", "Spent · last 30 days":"近 30 天支出", "Suppliers used":"合作供应商",
    "Purchase history":"采购历史", "Invoice / docket no.":"发票 / 送货单号", "＋ Add line":"＋ 加一行", "Save purchase":"保存采购",
    "Saving adds these quantities to stock and updates each item's unit price.":"保存后会把数量加入库存，并更新各物品的单价。",
    "No purchases recorded yet. Log one and the price trend and usage forecast start filling in.":"还没有采购记录。录入一笔后，价格涨跌和用量预测就会开始有数据。",
    "＋ Add supplier":"＋ 添加供应商", "Add supplier":"添加供应商", "Edit supplier":"编辑供应商",
    "Business name":"公司名称", "Who you contact":"联系人", "Notes":"备注",
    "No suppliers yet. Add the people you actually ring when you need stock — name, phone, what they supply.":"还没有供应商。把你缺货时真正会打电话的人加进来 —— 名字、电话、供什么。",
    "🛒 Build order list":"🛒 生成订货清单", "Order list":"订货清单", "Estimated cost":"预计花费",
    "✨ Ask AI":"✨ 问 AI", "What the assistant says":"助手怎么说",
    "Usage & days of cover":"用量与可用天数",
    "On hand":"现有", "Used / day":"每日用量", "Days of cover":"可用天数", "Suggest order":"建议订货", "Est. cost":"预计花费",
    "needs 2 counts":"需要两次盘点", "no usage data yet":"暂无用量数据",
    "Usage is measured, not guessed.":"用量是量出来的，不是猜的。",
    "Tap Ask AI for a plain-English read on what to order and what's creeping up in price.":"点「问 AI」，用大白话告诉你该订什么、什么在涨价。",

    // -- deliveries --
    "Check it at the back door, not after the invoice arrives":"在后门就点清楚，别等收到发票才发现",
    "＋ New delivery":"＋ 新建送货", "New delivery":"新建送货", "Confirm delivery":"确认送货",
    "Waiting to confirm":"待确认", "Confirmed":"已确认", "With problems":"有问题",
    "short, damaged or wrong":"缺货、破损或送错", "Delivery log":"送货记录",
    "Expected":"待收货", "Rejected":"已拒收", "Good":"完好", "Short delivered":"少送", "Damaged":"破损", "Wrong item":"送错货",
    "Ordered":"订购", "Received":"实收", "Condition":"状态", "Received by":"收货人",
    "Docket / invoice no.":"送货单 / 发票号",
    "Chilled/frozen temperature on arrival (°C)":"到货时冷藏/冷冻温度（°C）",
    "Temperature on arrival":"到货温度",
    "Reject whole delivery":"整单拒收", "✍️ Confirm":"✍️ 确认收货",
    "Received quantities go into stock at the unit prices above — check the prices against the docket before you sign.":"实收数量会按上面的单价入库 —— 签字前请核对单价和送货单是否一致。",
    "This creates an expected delivery. Whoever takes it in opens it and confirms what actually arrived.":"这会建立一张待收货单。谁收货就谁打开，确认实际到了多少。",
    "Confirming a delivery adds the received quantities to stock and records the unit prices you were charged. Short and damaged lines are flagged for you to chase.":"确认收货会把实收数量入库，并记录对方收你的单价。缺货和破损会标记出来方便你去追。",
    "No deliveries logged yet. Create one when a driver pulls up — or ahead of time so whoever's on shift just has to tick it off.":"还没有送货记录。司机到了就建一张，或者提前建好，让当班的人打勾就行。",

    // -- training --
    "Write it once, assign it, see who's actually read it":"写一次、派下去、看谁真的读了",
    "＋ New SOP":"＋ 新建 SOP", "New SOP":"新建 SOP", "Edit SOP":"编辑 SOP",
    "👥 Assign training":"👥 派培训", "Assign training":"派培训", "Assign":"派发",
    "SOP library":"SOP 库", "Training status":"培训进度", "Assigned training":"已派培训",
    "Outstanding":"未完成", "Overdue":"已逾期", "Due soon":"即将到期", "Assigned":"已派发", "Done":"已完成",
    "Person":"人员", "Due":"截止", "Status":"状态", "Signed off":"签字确认", "Remove":"移除",
    "Why it matters (one line)":"为什么重要（一句话）", "Steps — one per line":"步骤 —— 每行一条",
    "Why it matters:":"为什么重要：",
    "Sign off — type your name to confirm you've read and understood this":"签字 —— 输入你的名字，确认已阅读并理解",
    "✅ I have read and understood":"✅ 我已阅读并理解",
    "Read it, then sign it off — takes a couple of minutes":"读完签个字就行 —— 两分钟",
    "To do":"待完成", "Completed":"已完成", "All SOPs — look anything up":"全部 SOP —— 随时查",
    "No SOPs yet. Start with the three things new starters always get wrong.":"还没有 SOP。先把新人最容易做错的三件事写下来。",
    "Nothing outstanding — you're up to date.":"没有待完成的 —— 你已经跟上了。",
    "Skills drive the plan — someone with 🔑 gets the early shift, 🍳 keeps the kitchen covered.":"技能决定排班 —— 有 🔑 的人排早班，🍳 保证厨房有人。",

    // -- rostering --
    "AI plans it from availability, skills and your own history · you stay in charge":"AI 根据可用时间、技能和你自己的历史来排 · 你说了算",
    "✨ AI auto-roster":"✨ AI 自动排班", "⚙️ Preferences":"⚙️ 偏好设置",
    "This week":"本周", "Next week":"下周", "Last week":"上周", "‹ Previous":"‹ 上一周", "Next ›":"下一周 ›",
    "People rostered":"已排班人数", "Shifts":"班次数", "Total hours":"总工时", "Warnings":"提醒",
    "advisory only · view ›":"仅供参考 · 查看 ›", "nothing flagged":"没有需要注意的",
    "Worth a look — none of this blocks anything":"值得看一眼 —— 这些都不会挡住你",
    "These are your own preferences talking back to you. Change what you're warned about in ⚙️ Preferences.":"这些提醒来自你自己设的偏好。想改提醒条件，去 ⚙️ 偏好设置。",
    "Team roster":"团队排班表",
    "Tap an empty cell to add a shift · drag a shift to move or reassign it · tap × to remove":"点空格加班次 · 拖动班次改日期或换人 · 点 × 删除",
    "Why it planned it this way":"为什么这样排",
    "Every item here is advisory. Nothing in this app stops you publishing a roster — these are the things you asked to be told about.":"这里每一条都只是提醒。本系统不会阻止你发布排班 —— 这些只是你要求被告知的事。",
    "How do you like your roster?":"你希望怎么排班？", "Rostering preferences":"排班偏好",
    "Save & roster":"保存并排班",
    "Before the AI rosters anything, tell it how you like to run the place. You can change all of this later.":"在 AI 开始排班前，先告诉它你的店怎么运作。这些以后随时能改。",
    "How many people do you want on?":"每个时段想要几个人？",
    "Day-part":"时段",
    "Keep learning from my history":"继续参考我的历史",
    "What should it optimise for?":"优先照顾什么？",
    "Spread hours evenly":"工时尽量平均",
    "When should it warn you?":"什么时候提醒你？",
    "Who can do what?":"谁能做什么？",
    "Can open":"会开店", "Can close":"会关店", "Kitchen":"厨房", "Front of house":"前厅", "Coffee / bar":"咖啡 / 吧台", "Can run a shift":"能带班",
    "Add shift":"添加班次", "Nothing to export":"没有可导出的内容",
    "Adding a shift outside someone's availability is allowed — you'll just get a warning.":"排在别人空闲时间之外也可以 —— 只会给你一个提醒。",
    "This replaces the shifts already on this week. Continue?":"这会覆盖本周已有的班次。继续吗？",
    "Planning…":"正在排班…", "Thinking…":"思考中…",

    // -- optional AU add-ons --
    "Optional Australian add-ons":"澳洲可选附加功能",
    "⚖️ Awards help":"⚖️ Award 咨询", "🛂 Check work rights":"🛂 查工作权利",
    "Awards help":"Award 咨询", "Work rights check":"查工作权利",
    "Australian awards — get proper advice":"澳洲 Award —— 找专业的人问",
    "Check work rights (VEVO)":"查工作权利（VEVO）",
    "Open lawyer →":"打开律师页面 →", "Open VEVO →":"打开 VEVO →",
    "Partner lawyer":"合作律师", "✏️ Partner lawyer details":"✏️ 合作律师信息",
    "Firm / lawyer name":"律所 / 律师名称", "Link":"链接",
    "This app never interprets awards, calculates pay or checks work rights itself. Turn these on and it will simply hand you to someone who does — your call, every time.":"本系统从不自行解读 Award、计算工资或核查工作权利。打开这两项后，它只会把你转给专业的人 —— 每次都由你决定。",
    "My Kitchen Rules does not calculate award rates, penalty rates or entitlements, and nothing in this app is legal advice. If you need a real answer, we hand you to a qualified employment lawyer.":"本系统不计算 Award 工资、加班倍率或各类权益，App 里的任何内容都不构成法律意见。需要确切答案时，我们会把你转给专业的劳动法律师。",
    "Work rights are checked on the Department of Home Affairs' own VEVO service — not here. You'll need the person's consent plus their passport / visa details.":"工作权利请在内政部官方的 VEVO 系统上查 —— 不在这里查。你需要本人同意以及护照 / 签证信息。",
    "This app stores no visa data and applies no visa hour limits. Rostering only shows you warnings; what you do with them is your call.":"本系统不保存任何签证数据，也不设签证工时上限。排班只给提醒，怎么处理由你决定。",
    "Where should the \"Awards help\" button send you? Leave it blank until you've picked a firm.":"「Award 咨询」按钮要跳到哪里？还没选定律所就先留空。",

    // -- pay / government: what this app deliberately does not do --
    "Pay, tax, super and bank details are deliberately not held here — this app doesn't run payroll or talk to any government system.":"这里刻意不保存工资、税务、退休金和银行信息 —— 本系统不做工资单，也不与任何政府系统对接。",
    "This app doesn't handle pay — no rates, no award calculations, no payslips. It only tracks the hours you're rostered. For anything about what you're paid, talk to your employer directly.":"本系统不处理工资 —— 没有费率、不算 Award、不出工资单，只记录你被排的工时。工资相关的事情请直接找雇主。",
    "Emergency contact":"紧急联系人", "Work details":"工作信息", "Skills":"技能",
    "ID / passport no.":"证件 / 护照号", "Passport / ID document":"证件 / 护照文件",
    "Onboarding":"入职", "Hours this week":"本周工时",
    "Skills — what this person can be rostered onto":"技能 —— 这个人可以被排到哪些岗位",
    "Skills — what they can be rostered onto":"技能 —— 他能被排到哪些岗位",
    "Your own operational records, exported for your use.":"这是你自己的运营记录，导出给你自己用。",
    "These are your own records, exported for you. Nothing is filed or sent anywhere.":"这些是你自己的记录，导出给你自己用。不会申报、也不会发给任何人。",
    "Data export":"数据导出",
    "Owner":"老板", "Manager":"经理", "Staff":"员工",
    "Simple execution · shifts / clock-in / claim":"简单执行 · 班次 / 打卡 / 抢班",
    "Dashboard":"工作台", "AI Assistant":"全能助手", "Daily report":"每日报告", "Alerts":"提醒", "Audit log":"审计日志",
    "Labor cost":"人力成本", "Team":"团队", "Super Admin":"超级管理员", "Compliance":"合规",
    // Mobile bottom-nav short labels
    "Dash":"工作台", "Report":"报告", "Audit":"审计", "Labor":"人力", "Comply":"合规",
    "Reviews":"评价", "Switch":"切换", "Settings":"设置", "Branches":"分店",
    // Sold-out / 86
    "⛔ Sold out":"⛔ 沽清", "↩︎ Back in stock":"↩︎ 恢复供应", "Sold out":"沽清",
    // Bookings & queue
    "Bookings":"预订", "Bookings & queue":"预订与排队",
    "Table reservations and the live walk-in waitlist":"桌位预订与实时叫号排队",
    "📅 Upcoming bookings":"📅 即将到店", "⏳ Waiting now":"⏳ 当前等位", "🔔 Called":"🔔 已叫号",
    "📅 Reservations":"📅 桌位预订", "⏳ Walk-in queue":"⏳ 叫号排队",
    "＋ New booking":"＋ 新建预订", "＋ Add to queue":"＋ 加入排队", "Add to queue":"加入排队",
    "No upcoming bookings":"暂无即将到店预订", "Queue is empty":"排队为空",
    "Seat":"入座", "No-show":"未到", "🔔 Call":"🔔 叫号", "Left":"离开", "Today":"今天",
    "New booking":"新建预订", "Guest name":"客人姓名", "Party size":"人数",
    "Note (optional)":"备注（可选）", "Add booking":"添加预订", "e.g. window seat, birthday":"例如：靠窗、生日",
    "Name (optional)":"姓名（可选）", "Walk-in name":"到店客人姓名", "Optional · for SMS":"可选 · 用于短信",
    "Booking added":"预订已添加", "Called":"已叫号", "Seated":"已入座", "Removed from queue":"已移出排队",
    "Seated booking":"已为预订入座", "Marked no-show":"已标记未到", "Cancelled booking":"已取消预订",
    // Audit search
    "Search actions, people, details…":"搜索操作、人员、详情…", "No matching actions":"无匹配的操作", "No actions recorded yet":"暂无操作记录",
    // Inventory
    "Inventory":"库存", "Stock":"库存", "Inventory & stock":"库存与备货",
    // Alerts auto-clean
    "Auto-clear after":"超过此天数自动清理", "Never":"不清理", "3 days":"3 天", "7 days":"7 天", "14 days":"14 天", "30 days":"30 天",
    "🗑️ Clear read":"🗑️ 清除已读", "Auto-clear setting saved":"自动清理设置已保存",
    "Clear read alerts":"清除已读提醒", "Delete all alerts already marked read?":"删除所有已标为已读的提醒？", "Clear":"清除",
    // Owner-page feature toggles (Settings)
    "Owner · AI Assistant":"老板 · 全能助手", "Owner · Analytics":"老板 · 经营分析", "Owner · Labor cost":"老板 · 人力成本",
    "Owner · Team":"老板 · 团队", "Owner · Performance":"老板 · 绩效", "Owner · Membership":"老板 · 会员",
    "Owner · Branches":"老板 · 分店", "Owner · Feedback":"老板 · 顾客反馈",
    // Audit action labels (new)
    "Sold-out change":"沽清调整", "Booking update":"预订更新", "New member":"新会员",
    "Member top-up":"会员充值", "Adjust points":"调整积分", "Issue coupon":"发放优惠券", "Staff reward":"员工奖励",
    // Refund approval
    "Manager approval":"经理审批", "Manager username":"经理用户名", "Manager password":"经理密码",
    "Approve refund":"批准退款", "Wrong manager username or password":"经理用户名或密码错误",
    // Receipt
    "Receipt":"小票", "🖨️ Print / Save PDF":"🖨️ 打印 / 存为 PDF", "Done":"完成",
    "Tax invoice (indicative)":"税务发票（参考）", "Total":"合计",
    "Cash":"现金", "Card":"刷卡", "Stored value":"储值", "Paid":"已付",
    "Thank you — see you again!":"谢谢惠顾，欢迎再来！",
    // CSV export
    "⬇️ Export orders (CSV)":"⬇️ 导出订单 (CSV)", "⬇️ Export members":"⬇️ 导出会员", "⬇️ Export wages":"⬇️ 导出工资",
    "Orders exported":"订单已导出", "Members exported":"会员已导出", "Wages exported":"工资已导出",
    "No orders today to export":"今日无订单可导出", "No members to export":"暂无会员可导出", "No rostered shifts to export":"暂无排班可导出",
    // Customer self-service rewards (#/points)
    "⭐ My rewards":"⭐ 我的会员", "Look up my rewards":"查询我的会员权益",
    "⭐ Points":"⭐ 积分", "💰 Balance":"💰 余额", "🎟️ My coupons":"🎟️ 我的优惠券",
    "No active coupons":"暂无可用优惠券", "Looking…":"查询中…", "Not available offline":"离线不可用",
    "This feature isn’t enabled yet — please ask staff.":"此功能尚未开启 —— 请咨询店员。",
    "No member found for that phone or code.":"未找到该电话或编号对应的会员。",
    "Show this screen at the counter, or give your phone number when you order.":"在柜台出示此页，或点餐时报手机号即可。",
    "Feedback":"顾客反馈", "Switch view":"切换视图", "Settings":"设置",
    "Rostering":"排班", "Add Users":"添加员工", "Menu & Items":"菜单与菜品",
    "Tasks":"任务", "Swaps / SOS":"换班 / SOS", "POS":"收银", "Kitchen":"后厨", "Table QR":"桌台二维码",
    "My shifts":"我的班次", "Availability":"可用时间", "Today's tasks":"今日任务",
    "Swap market":"换班市场", "My profile":"我的资料",
    "Log out":"退出登录", "Connected":"已连接", "+ shift":"+ 班次",

    // Network status (net.js)
    "Cloud connected":"云端已连接", "Connected (local)":"已连接（本地）",
    "⚠️ Network lost · running in offline-safe mode — keep working, it will sync automatically when back online":"⚠️ 网络中断 · 已进入离线安全模式 — 可继续操作，恢复网络后自动同步",
    "Back online — syncing in the background…":"已恢复在线 — 正在后台同步…",
    "All data synced to the cloud":"所有数据已同步到云端",
    "Network lost · switched to offline-safe mode — keep working":"网络中断 · 已切换到离线安全模式 — 可继续操作",
    "Back to Owner →":"返回老板视图 →",

    // ---- Login ----
    "Restaurant manager · Secure login":"餐厅管理系统 · 安全登录",
    "Username or ID":"用户名或 ID", "Password":"密码", "Sign in":"登录",
    "or":"或", "Continue with Google":"使用 Google 登录",
    "Demo accounts (tap a role to fill):":"演示账号（点击角色自动填充）：",
    "Each account is separate and isolated by role; access is revoked instantly on offboarding.":"每个账号独立、按角色隔离；离职后即时收回访问权限。",
    "Signing in…":"正在登录…", "Loading…":"加载中…", "Redirecting to Google…":"正在跳转到 Google…",
    "Google sign-in is not enabled for this project yet.":"本项目尚未启用 Google 登录。",
    "Language":"语言",

    // ---- Owner: Feedback ----
    "Customer feedback":"顾客反馈",
    "Bad reviews kept internal (1-3★) for you to handle; 4-5★ sent to Google":"差评（1-3★）仅内部保留供你处理；好评（4-5★）引导至 Google",
    "⭐ Average rating":"⭐ 平均评分", "😟 Bad (1-3★)":"😟 差评（1-3★）", "🔔 Urges today":"🔔 今日催单",
    "kept internal":"仅内部可见", "No customer reviews yet":"暂无顾客评价",
    "1-3★ reviews are never public — shown only here so you can reach out privately; 4-5★ guests are guided to Google to boost public reputation.":"1-3★ 评价不会公开 — 仅在此显示，方便你私下跟进；4-5★ 顾客被引导到 Google 以提升公开口碑。",
    "Bad":"差评", "Good":"好评",

    // ---- Owner: Switch view ----
    "The owner can preview any portal and see exactly what staff / managers see":"老板可预览任意端，看到员工 / 经理所见的界面",
    "Dashboard · your current portal":"工作台 · 你当前所在端",
    "Manager · Roster":"经理 · 排班", "Smart rostering / add users / review":"智能排班 / 添加员工 / 审核",
    "Menu & Items":"菜单与菜品", "Add dishes / upload photos":"添加菜品 / 上传图片",
    "Ordering · blind drop":"点单 · 盲投对账",
    "Kitchen KDS":"后厨 KDS", "Live tickets":"实时出单",
    "Staff · Shifts":"员工 · 班次", "Clock-in / availability / claim":"打卡 / 可用时间 / 抢班",
    "Staff · Availability":"员工 · 可用时间", "When staff can work":"员工可上班的时间",
    "Inside another portal the top shows an \"Owner preview\" banner — tap \"Back to Owner\" to return.":"进入其他端时顶部会显示「老板预览」横幅 — 点击「返回老板视图」即可返回。",

    // ---- Owner: Settings ----
    "Toggle modules · control which roles can access each one":"开关各模块 · 控制每个模块对哪些角色开放",
    "Save settings":"保存设置",
    "Disabled features disappear from the matching portal's nav and direct access is blocked; saving applies to every device in the venue. Owner core (dashboard / audit / compliance / settings) is always available.":"关闭的功能会从对应端的导航中消失并禁止直接访问；保存后对门店所有设备生效。老板核心功能（工作台 / 审计 / 合规 / 设置）始终可用。",
    "On":"开启", "Off":"关闭", "Enabled":"启用",
    "Settings saved across the venue":"设置已在全店保存",
    "System language":"系统语言", "English / 简体中文":"English / 简体中文",

    // ---- Owner: Dashboard ----
    "Runs quietly — only pings you when something's wrong":"安静运行 — 只在出问题时提醒你",
    "Today's revenue":"今日营业额", "Cash variance":"现金差异", "Unread alerts":"未读提醒",
    "📈 Today's revenue":"📈 今日营业额", "💵 Blind-drop variance":"💵 盲投差异",
    "🧾 Today's orders":"🧾 今日订单", "🚨 Unread alerts":"🚨 未读提醒",
    "Not reconciled":"未对账", "Normal":"正常", "Over threshold":"超出阈值",
    "Needs attention ›":"需关注 ›", "All good ›":"一切正常 ›",
    "Live ›":"实时 ›", "Not reconciled ›":"未对账 ›", "Normal ›":"正常 ›",
    "Over threshold ›":"超阈值 ›", "View report ›":"查看报告 ›", "orders":"单",
    "🚨 Alerts · only when it matters":"🚨 提醒 · 仅在关键时刻", "All →":"全部 →",
    "📩 Today at a glance":"📩 今日概览", "Full report →":"完整报告 →",
    "Cash blind-drop variance":"现金盲投差异", "Tomorrow's bookings (demo)":"明日预订（演示）",
    "This system aggregates and exports data; it does not connect to the ATO or give tax advice — final tax figures are confirmed by your accountant.":"本系统仅汇总与导出数据；不连接 ATO，也不提供税务建议 — 最终税务数字由你的会计确认。",
    "No issues — running quietly":"没有问题 — 安静运行中",

    // ---- Owner: Daily report ----
    "Daily smart report":"每日智能报告",
    "Auto-pushed at close — the whole picture without logging in":"打烊时自动推送 — 不登录也能掌握全局",
    "My Kitchen manager":"My Kitchen 管家", "Revenue":"营业额", "Orders":"订单",
    "📲 Re-push to my phone":"📲 重新推送到我的手机",
    "Report pushed (demo — not actually sent)":"报告已推送（演示 — 未实际发送）",

    // ---- Owner: Alerts ----
    "Critical alerts":"关键提醒",
    "Mark all read":"全部标为已读", "No alerts — all good":"暂无提醒 — 一切正常",
    "Read":"已读", "Mark read":"标为已读",

    // ---- Owner: Audit ----
    "Sensitive-action audit":"敏感操作审计",
    "Edits / cancels / discounts / refunds fully tracked · append-only, tamper-proof":"改单 / 取消 / 折扣 / 退款全程记录 · 仅追加、防篡改",
    "No actions recorded yet":"暂无操作记录",
    "The audit log is append-only — there is no delete or edit path anywhere in the system.":"审计日志仅可追加 — 系统中任何地方都没有删除或修改入口。",
    "System":"系统",
    // audit action labels (audit.js)
    "Cancel order":"取消订单", "Manual discount":"手动折扣", "Refund":"退款",
    "New order":"新订单", "Edit order":"修改订单", "Blind drop":"盲投对账",
    "Offboard staff":"员工离职", "Hire / onboard":"入职 / 招聘", "Reveal TFN":"查看 TFN",
    "Add shift":"添加班次", "Remove shift":"删除班次", "Approve labor cost":"批准人力成本",
    "Reject labor cost":"驳回人力成本", "Post SOS shift":"发布 SOS 班次", "Approve swap":"批准换班",
    "Sign in":"登录", "Export data":"导出数据", "Super reminder":"养老金提醒",
    "Add menu item":"新增菜品", "Edit menu item":"编辑菜品", "Remove menu item":"删除菜品",
    "Update settings":"更新设置", "Create kitchen":"创建门店", "Approve kitchen":"批准门店",

    // ---- Owner: Labor ----
    "Labor cost approval":"人力成本审批",
    "Forecasts next week's revenue and labor ratio; auto-flags overruns in red":"预测下周营业额与人力占比；超标自动标红",
    "Forecast revenue (next week)":"预测营业额（下周）", "Rostered wages (ref.)":"排班工资（参考）",
    "Labor ratio":"人力占比",
    "Labor ratio is healthy — nothing to action.":"人力占比健康 — 无需处理。",
    "Approve this week's roster cost":"批准本周排班成本",
    "Wage figures are an award-based <b>indicative</b> calculation — please review before confirming.":"工资数字基于行业标准（Award）的<b>参考</b>计算 — 请确认前先核对。",
    "Approve":"批准", "Reject · request changes":"驳回 · 要求修改",
    "Figures are indicative; the employer confirms. This system gives no tax advice and does no filing.":"数字仅供参考，由雇主确认。本系统不提供税务建议、不代为申报。",
    "Approved":"已批准", "Rejected — the manager has been notified":"已驳回 — 已通知经理",

    // ---- Owner: Super Admin / Kitchens ----
    "Super Admin · Kitchens":"超级管理员 · 门店",
    "Master dashboard — full visibility and provisioning across every venue (tenant)":"总控台 — 对每个门店（租户）全可见并可开通",
    "＋ Create kitchen":"＋ 创建门店",
    "🏢 Kitchens":"🏢 门店", "✅ Active":"✅ 已启用", "⏳ Pending approval":"⏳ 待审批", "👥 Total users":"👥 用户总数",
    "Each kitchen is an isolated tenant. From here you have global visibility into every kitchen's data, configuration and users, and you approve or onboard new ones.":"每个门店都是独立租户。在此你可全局查看每个门店的数据、配置与用户，并审批 / 开通新门店。",
    "Active":"已启用", "Pending":"待审批", "Primary":"主店",
    "View ›":"查看 ›", "← Back to kitchens":"← 返回门店列表",
    "Approve & provision":"批准并开通",
    "Kitchen / venue name":"门店 / 场所名称", "Location":"位置",
    "New kitchens start as <b>Pending</b> until you approve them from this dashboard.":"新门店初始为<b>待审批</b>，需你在此控台批准后启用。",
    "Create a new kitchen":"创建新门店", "Create (pending)":"创建（待审批）",
    "Please enter a name":"请输入名称",
    "Kitchen created — pending approval":"门店已创建 — 待审批",
    "Kitchen approved & provisioned":"门店已批准并开通", "Kitchen approved":"门店已批准",
    "👑 Owners":"👑 老板", "📋 Managers":"📋 经理", "🧑‍🍳 Staff":"🧑‍🍳 员工", "🍽️ Menu items":"🍽️ 菜品数",
    "Hierarchy & unique IDs":"层级与唯一 ID", "Owners":"老板", "Managers":"经理",
    "⚙️ Configuration snapshot":"⚙️ 配置快照", "None":"无",
    "Operating hours":"营业时间", "Labor ratio red line":"人力占比红线",
    "Cash variance threshold":"现金差异阈值", "Student-visa fortnight cap":"学签两周上限",
    "Every user has a unique ID for signing into their customised portal. Tap a person to open their full profile.":"每位用户都有唯一 ID 登录其专属端。点击某人可打开其完整档案。",
    "Offboarded":"已离职",

    // ---- Owner: Team & staff profile ----
    "Tap a staff member for the full, editable profile (phone / email / passport / visa / contract / bank / TFN)":"点击员工查看可编辑的完整档案（电话 / 邮箱 / 护照 / 签证 / 合同 / 银行 / TFN）",
    "Only the owner role can reveal a TFN / passport (each reveal is audited); offboarded staff data is encrypted and retained for 7 years for audit.":"仅老板角色可查看 TFN / 护照（每次查看都会审计）；离职员工数据加密保存 7 年以备审计。",
    "Staff member not found":"未找到该员工", "← Back to team":"← 返回团队",
    "Basic info":"基本信息", "Phone":"电话", "Email":"邮箱", "Position":"职位", "Age":"年龄",
    "Start date":"入职日期", "Address":"地址", "Emergency contact":"紧急联系人",
    "Visa & compliance":"签证与合规", "Visa type":"签证类型", "Visa expiry":"签证到期",
    "Fortnight hours":"两周工时", "Contract type":"合同类型", "Passport no.":"护照号",
    "Reveal":"查看", "Not provided":"未提供", "Uploaded":"已上传", "View":"查看",
    "Pay · bank · tax":"工资 · 银行 · 税务", "Base rate (ref.)":"基础时薪（参考）",
    "Super fund":"养老金账户", "Bank BSB / acct":"银行 BSB / 账号", "TFN":"税号 TFN",
    "(not submitted)":"（未提交）",
    "Onboarding documents":"入职文件", "Passport / ID":"护照 / 证件",
    "TFN declaration form":"TFN 申报表", "Super choice form":"养老金选择表",
    "Onboarding":"入职", "Complete":"已完成",
    "Offboard archive":"离职归档", "Offboarded on":"离职日期", "Retained until":"保留至",
    "TFN / passport are encrypted separately and only the owner can reveal them; each reveal is written to the audit log.":"TFN / 护照单独加密，仅老板可查看；每次查看都会写入审计日志。",
    "✏️ Edit profile":"✏️ 编辑档案", "Reactivate":"重新启用", "Offboard":"离职处理",
    "Document":"文件",
    "Visa type":"签证类型", "None / citizen / PR":"无 / 公民 / PR", "Student visa":"学生签证",
    "Work visa":"工作签证", "PR":"PR", "Australian citizen":"澳大利亚公民",
    "Casual":"临时工", "Part-time":"兼职", "Full-time":"全职",
    "Base rate AUD":"基础时薪 AUD", "Bank BSB":"银行 BSB", "Account number":"账号",
    "Save profile":"保存资料", "Cancel":"取消",
    "Passport / TFN are AES-encrypted and stored separately — only the owner can reveal them.":"护照 / TFN 采用 AES 加密并单独存储 — 仅老板可查看。",
    "Profile saved":"档案已保存",
    "Instant offboard cut-off":"即时离职断权",
    "Confirm offboard":"确认离职",

    // ---- Owner: Compliance ----
    "Super reminder · visa hours · food-safety audit report":"养老金提醒 · 签证工时 · 食品安全审计报告",
    "💼 Super reminder":"💼 养老金提醒",
    "Confirm Super is paid before this quarter's deadline to avoid late penalties.":"请在本季度截止前确认已缴养老金，以免滞纳金。",
    "Mark as reminded":"标记为已提醒", "Recorded":"已记录",
    "🛂 Visa-hours overview":"🛂 签证工时概览", "No student-visa staff":"暂无学签员工",
    "📋 Food-safety audit report (one-tap export)":"📋 食品安全审计报告（一键导出）",
    "📄 Export today's food-safety log":"📄 导出今日食品安全记录",
    "📊 Export sales / wages CSV":"📊 导出销售 / 工资 CSV",
    "🗄️ Offboarded staff data retention (7 years)":"🗄️ 离职员工数据留存（7 年）",
    "Offboarded staff records are not deleted — per Australian audit requirements they are encrypted and retained for 7 years; sensitive fields like TFN remain owner-only.":"离职员工记录不会被删除 —— 按澳大利亚审计要求加密保存 7 年；TFN 等敏感字段仅老板可见。",
    "No offboard archive":"暂无离职归档",
    "This system aggregates and exports data; it does not connect to the ATO or give tax advice — final wage / tax figures are confirmed by the accountant / employer.":"本系统仅汇总与导出数据；不连接 ATO，也不提供税务建议 — 最终工资 / 税务数字由会计 / 雇主确认。",
    "↺ Reset demo data":"↺ 重置演示数据", "Reset demo data":"重置演示数据",
    "This clears all local data and reloads the demo accounts. Continue?":"这将清除所有本地数据并重新加载演示账号。是否继续？",
    "Reset":"重置", "CSV exported":"CSV 已导出",

    // ---- Manager: Menu ----
    "Add new dishes and upload product images — changes show instantly on POS and table ordering":"添加新菜品并上传图片 — 改动会即时显示在收银与桌台点单",
    "＋ Add dish":"＋ 添加菜品",
    "🍽️ Total dishes":"🍽️ 菜品总数", "🗂️ Categories":"🗂️ 分类", "📷 With photo":"📷 有图片",
    "Edit":"编辑", "Dish name":"菜品名称", "Category":"分类", "Price (AUD)":"价格（AUD）",
    "Product image":"菜品图片",
    "Edit dish":"编辑菜品", "Add new dish":"添加新菜品",
    "Save changes":"保存修改", "Add to menu":"加入菜单",
    "Please enter a dish name":"请输入菜品名称", "Please enter a valid price":"请输入有效价格",
    "Dish updated":"菜品已更新", "Dish added":"菜品已添加", "Dish removed":"菜品已删除",
    "Remove dish":"删除菜品", "Remove":"删除",
    "Mains":"主菜", "Snacks":"小吃", "Drinks":"饮品", "Desserts":"甜点", "Sides":"配菜", "Other":"其他",

    // ---- Manager: Rostering ----
    "Smart rostering":"智能排班",
    "Auto-roster from availability · drag to adjust · student-visa hours hard-capped":"按可用时间自动排班 · 拖拽调整 · 学签工时硬性封顶",
    "⚙️ Shift settings":"⚙️ 班次设置", "⚡ Auto-roster":"⚡ 自动排班",
    "👥 Total staff":"👥 员工总数", "on the roster":"在排班中",
    "💰 This week's wages":"💰 本周工资", "indicative · confirm before pay":"参考值 · 发薪前确认",
    "📊 % of forecast revenue":"📊 占预测营业额",
    "Everyone's weekly hours":"全员本周工时", "No staff yet":"暂无员工",
    "Operating hours":"营业时间", "Opening time":"开店时间", "Closing time":"关店时间",
    "Shift slots (flexible)":"班次时段（灵活）", "＋ Add slot":"＋ 添加时段",
    "Roles / departments":"角色 / 部门", "Custom roles (comma separated)":"自定义角色（逗号分隔）",
    "Role-based fixed shifts":"按角色固定班次",
    "Departments that run fixed hours (e.g. Kitchen) are placed at these exact times by the auto-roster.":"固定工时的部门（如后厨）会被自动排班放在这些固定时间。",
    "Add roles above to configure fixed hours.":"在上方添加角色以配置固定工时。",
    "Shift settings":"班次设置",
    "Shift slots saved":"班次设置已保存", "Shift settings saved":"班次设置已保存",
    "Auto-roster":"自动排班",
    "This clears this week's roster and regenerates it from staff availability. Continue?":"这将清空本周排班并根据员工可用时间重新生成。是否继续？",
    "Generate":"生成",
    "Staff":"员工", "Quick slot":"快速时段", "Custom":"自定义", "Start":"开始", "End":"结束",
    "Save shift":"保存班次", "End time must be after start":"结束时间必须晚于开始时间",
    "Got it":"知道了", "Shift saved":"班次已保存",

    // ---- Manager: Add Users ----
    "One-Click Add Users":"一键添加员工",
    "Enter a phone number + employment type — the system creates a compliant onboarding link to send the new starter":"输入电话 + 雇佣类型 — 系统会生成合规的入职链接发给新员工",
    "New starter's phone":"新员工电话", "Name (optional)":"姓名（可选）",
    "Employment type":"雇佣类型", "Role":"角色",
    "Holds a student visa?":"是否持学生签证？", "No":"否", "Yes · student visa (enable hours cap)":"是 · 学生签证（启用工时上限）",
    "📩 Create account & send link":"📩 创建账号并发送链接",
    "The onboarding pack includes the TFN declaration, Super choice and bank details forms (Fair Work / Privacy Act).":"入职资料包含 TFN 申报、养老金选择与银行信息表（符合 Fair Work / 隐私法）。",
    "Pending / onboarding":"待入职 / 入职中", "No new starters waiting":"没有等待中的新员工",
    "Copy link":"复制链接", "Onboarding link copied":"入职链接已复制",
    "Please enter a phone number":"请输入电话号码", "Creating account…":"正在创建账号…",
    "Send these details to the new starter":"将以下信息发给新员工",
    "After signing in to the Staff portal, they complete onboarding (Passport / TFN / Super / bank) under \"My profile\".":"登录员工端后，他们在「我的资料」中完成入职（护照 / TFN / 养老金 / 银行）。",
    "Done":"完成", "Kitchen":"后厨", "Front of House":"前厅", "Cashier":"收银", "Dishwasher":"洗碗", "Head Chef":"主厨",

    // ---- Manager: Tasks ----
    "Daily task checklist":"每日任务清单",
    "Publish cleaning / prep / temperature checks · review the digital logs and photos staff submit":"发布清洁 / 备料 / 测温 · 查看员工提交的电子记录与照片",
    "+ Add task":"+ 添加任务", "Today's progress":"今日进度", "Waiting on staff":"等待员工",
    "No photo":"无照片", "Submitted photo":"提交的照片",
    "Add task":"添加任务", "Task name":"任务名称", "Publish":"发布", "Task published":"任务已发布",

    // ---- Manager: Swaps / SOS ----
    "Swaps / SOS dispatch":"换班 / SOS 调度",
    "Approve swap requests · post a rewarded urgent cover shift when it gets slammed":"审批换班申请 · 忙不过来时发布带奖励的紧急补班",
    "🆘 Post SOS cover":"🆘 发布 SOS 补班",
    "Swap requests to approve":"待审批的换班申请", "Active SOS cover":"进行中的 SOS 补班",
    "No swaps to approve":"没有待审批的换班", "Reject":"驳回",
    "No active SOS":"没有进行中的 SOS", "Covered":"已补上", "Recruiting":"招募中",
    "Time / description":"时间 / 描述", "Reward":"奖励",
    "🆘 Post urgent SOS cover":"🆘 发布紧急 SOS 补班", "Push to available staff":"推送给可用员工",
    "Approved — posted to the swap market":"已批准 — 已发布到换班市场",
    "SOS pushed to all available staff":"SOS 已推送给所有可用员工",

    // ---- Manager: Table QR ----
    "Table QR ordering":"桌台二维码点单",
    "Stick a QR on each table — guests scan to order without signing in, straight to the kitchen":"在每张桌子贴上二维码 — 顾客扫码即可免登录点单，直达后厨",
    "Tables":"桌数", "Preview order page ↗":"预览点单页 ↗",

    // ---- Staff: Availability ----
    "Pick the times you can work each day — the manager's auto-roster prioritises what you fill in":"选择你每天可上班的时间 — 经理的自动排班会优先按你填写的来",
    "Save":"保存",
    "This is just your availability — the final roster is set by your manager.":"这只是你的可用时间 — 最终排班由经理决定。",
    "Morning 09-15":"早班 09-15", "Evening 15-22":"晚班 15-22", "All day 09-22":"全天 09-22",
    "Availability saved":"可用时间已保存",
    "My availability":"我的可用时间", "Custom":"自定义", "no shifts":"无班次",
    "Roster by role · 按角色班表":"按角色班表 · Roster by role",
    "Tap a quick slot, or set your own start/end time per day. The owner/auto-roster uses this to schedule you — managers can be rostered just like staff.":"点快捷时段，或自己设每天的起止时间。老板/自动排班会据此给你排班 —— 经理也能像员工一样被排班。",
    "Tap a quick slot, or set your own start/end time per day. The final roster is set by your manager.":"点快捷时段，或自己设每天的起止时间。最终排班由你的经理确定。",
    "Pick the times you can work each day — the auto-roster uses this to schedule you too":"选择你每天可上班的时段 —— 自动排班会据此把你也排进去",
    "Set your availability so the owner/auto-roster can put you on the right shifts. Managers can be rostered just like staff.":"填好可用时间，老板/自动排班就能把你排到合适的班次。经理也能像员工一样被排班。",

    // ---- Staff: My shifts ----
    "One-tap clock-in on the day · drop a shift if something comes up":"当天一键打卡 · 有事可放出班次",
    "this week":"本周", "No shifts rostered this week":"本周暂无排班",
    "Clock in":"打卡上班", "Drop":"放班", "Today":"今天",
    "Drop to the swap market":"放到换班市场", "Reason (optional)":"原因（可选）", "Confirm drop":"确认放班",
    "Submitted — waiting on manager approval, then it goes to the swap market":"已提交 — 等待经理批准后进入换班市场",

    // ---- Staff: Today's tasks ----
    "Today's task checklist":"今日任务清单",
    "Tick when done and upload a photo · temperature checks need a value":"完成后勾选并上传照片 · 测温需填写数值",
    "Progress":"进度", "Tap the box on the left to complete":"点击左侧方框完成",
    "Fridge temperature check":"冰箱测温", "Record temperature (°C)":"记录温度（°C）",
    "Record & complete":"记录并完成", "Photo uploaded":"照片已上传",

    // ---- Staff: Swap market ----
    "Swap market · claim shifts":"换班市场 · 抢班",
    "Pick up a colleague's dropped shift · claim an urgent SOS cover in one tap":"接手同事放出的班次 · 一键认领紧急 SOS 补班",
    "🆘 Urgent cover (with reward)":"🆘 紧急补班（带奖励）",
    "🔁 Shifts colleagues dropped":"🔁 同事放出的班次",
    "No urgent cover right now":"暂时没有紧急补班", "Claim":"认领", "You got it":"已被你认领",
    "No shifts to claim":"没有可认领的班次", "Take it":"接班",
    "Taken — the shift is now on your roster":"已接班 — 该班次已加入你的排班",

    // ---- Staff: My profile / onboarding ----
    "Edit your details and complete the documents your manager requires":"编辑你的信息并完成经理要求的文件",
    "Onboarding complete":"入职已完成", "Onboarding in progress":"入职进行中",
    "Onboarding checklist":"入职清单", "Personal details":"个人信息",
    "Full name":"姓名", "Add":"添加", "Update":"更新", "Upload":"上传", "Fill in":"填写",
    "Save profile":"保存资料", "🗓️ Set my availability":"🗓️ 设置我的可用时间",
    "Bank details":"银行信息", "Submit onboarding":"提交入职",
    "I confirm the above is true and accurate":"我确认以上信息真实准确",
    "Confirm & submit":"确认并提交", "Please tick the confirmation":"请勾选确认项",
    "Passport saved":"护照已保存", "Super choice saved":"养老金选择已保存",
    "Bank details saved":"银行信息已保存", "Your staff ID":"你的员工 ID",
    "Member number (optional)":"会员号（可选）", "Super fund name":"养老金账户名称",

    // ---- POS ----
    "POS / Ordering":"收银 / 点单",
    "Fast ordering · change & receipts · closing blind drop":"快速点单 · 找零与小票 · 打烊盲投",
    "🥁 Blind drop":"🥁 盲投对账", "📋 Today's orders":"📋 今日订单",
    "All":"全部", "Current order":"当前订单", "Subtotal":"小计", "Discount":"折扣",
    "Total due":"应收合计", "💳 Pay & send":"💳 收款并下单", "Clear":"清空",
    "Cancels, discounts and refunds are all written to the tamper-proof audit log.":"取消、折扣与退款都会写入防篡改的审计日志。",
    "No items yet — add dishes in Menu & Items":"暂无菜品 — 请在「菜单与菜品」中添加",
    "Tap a dish on the left to start an order":"点击左侧菜品开始点单",
    "+ Add note":"+ 添加备注", "Save":"保存",
    "Manual discount":"手动折扣", "Discount percent %":"折扣百分比 %", "Apply":"应用",
    "Clear order":"清空订单", "Clear the current order?":"确定清空当前订单吗？",
    "Restored your last unfinished order":"已恢复你上次未完成的订单",
    "Payment":"付款", "Confirm payment · send to kitchen":"确认付款 · 送往后厨",
    "💵 Cash":"💵 现金", "💳 Card":"💳 刷卡", "Cash received":"实收现金", "Change":"找零",
    "Closing blind drop":"打烊盲投",
    "The expected total is hidden. First <b>blind-count the drawer cash</b> and enter it; the system then compares and generates a variance report.":"应收金额已隐藏。请先<b>盲点钱箱现金</b>并录入；系统随后比对并生成差异报告。",
    "Tap note / coin counts":"点选纸币 / 硬币数量", "Blind-counted total":"盲点合计",
    "Submit reconciliation":"提交对账", "Reconciliation result":"对账结果",
    "No orders yet today":"今天还没有订单", "Today's orders":"今日订单",
    "Cooking":"制作中", "Refunded":"已退款", "Cancelled":"已取消",
    "Confirm refund":"确认退款", "Refunded and logged":"已退款并记录",

    // ---- KDS ----
    "Kitchen Display (KDS)":"后厨显示屏（KDS）",
    "Live large tickets · tap when done · instant front/back sync":"实时大字出单 · 完成即点 · 前后台即时同步",
    "Handled":"已处理", "Served":"已出餐", "✓ Mark served":"✓ 标记已出餐",

    // ---- Customer ----
    "Loading menu…":"正在加载菜单…",
    "Menu can't be loaded right now":"暂时无法加载菜单",
    "Please call a server or try again shortly":"请呼叫服务员或稍后再试",
    "Send to kitchen":"送往后厨", "Order more":"继续点单", "Retry":"重试",
    "🔔 Hurry up":"🔔 催一下", "Kitchen notified ✓":"已通知后厨 ✓",
    "How was your meal?":"用餐体验如何？", "Send feedback":"提交反馈",
    "Order failed":"下单失败", "Network issue — please call a server or retry":"网络异常 — 请呼叫服务员或重试",

    // ---- Days ----
    "Mon":"周一","Tue":"周二","Wed":"周三","Thu":"周四","Fri":"周五","Sat":"周六","Sun":"周日",

    // ---- Feature module labels (features.js) ----
    "POS / Ordering":"收银 / 点单", "Kitchen Display":"后厨显示屏",
    "Smart rostering":"智能排班", "One-Click Add Users":"一键添加员工",
    "Task checklist":"任务清单", "Swap / SOS approval":"换班 / SOS 审批",
    "Staff swap market":"员工换班市场", "Staff availability":"员工可用时间",
    "Table QR ordering":"桌台二维码点单", "Notifications & nudges":"通知与提醒",

    // ---- Batch-1 additions: live dashboard, roster compliance, new charts ----
    "🟢 On shift now":"🟢 当前在岗", "Busiest 15-min":"最忙 15 分钟",
    "Visa-hours breach — must fix before publishing":"签证工时超标 —— 发布前必须修正",
    "Best-seller trend · 14 days":"热卖趋势 · 14 天", "Foot traffic by hour · 30 days":"分时客流 · 30 天",

    // ---- Batch-2: phone-pairing join + manager approval ----
    "Request to join the team":"申请加入团队",
    "🧑‍🍳 Joining a team? Request to join by phone →":"🧑‍🍳 想加入团队？用手机号申请 →",
    "Your name":"你的姓名", "Phone number":"电话号码", "Choose a password":"设置密码",
    "🙋 Join requests · approval needed":"🙋 加入申请 · 待审批",
    "Approve phone join requests, or add a new starter directly by phone":"审批手机加入申请，或直接用手机号添加新员工",
    "✅ Request sent":"✅ 申请已提交",
    "Reject request":"驳回申请", "Reject and remove this join request?":"驳回并删除此加入申请？",
    "Approved — they can sign in now":"已批准 —— 对方现在可以登录", "Request rejected":"申请已驳回",
    "Join request approved":"加入申请已批准",

    // ---- Analytics ----
    "Analytics":"经营分析",
    "What's making money — last 30 days of sales, sellers and patterns":"看清赚钱点 — 近 30 天的销售、热卖与规律",
    "Revenue (30 days)":"营业额（30 天）", "Orders (30 days)":"订单（30 天）", "Busiest period":"最旺时段",
    "Revenue · last 14 days":"营业额 · 近 14 天",
    "Top sellers · 30 days":"热卖榜 · 30 天", "Slow movers":"滞销品",
    "Revenue by time of day":"各时段营业额", "Payment mix":"支付方式占比",
    "Morning":"早市", "Lunch":"午市", "Afternoon":"下午", "Dinner":"晚市", "Late night":"夜宵",
    "Avg order value":"客单价",
    "Figures cover paid orders across your venues for the last 30 days. Use them to plan menu, staffing and promotions — they don't constitute financial advice.":"数据涵盖近 30 天各门店的已付订单，可用于菜单、排班与促销规划 — 不构成财务建议。",

    // ---- Branches (multi-venue) ----
    "Branches":"分店",
    "All your venues at a glance — compare today's performance, then switch in to manage one":"一览你的所有门店 — 对比今日业绩，点进去管理单店",
    "＋ Add branch":"＋ 添加分店", "Add branch":"添加分店", "Add a branch":"添加分店",
    "Revenue today (all)":"今日营业额（全部）", "Orders today (all)":"今日订单（全部）", "People (all)":"员工（全部）",
    "Revenue today by branch":"各分店今日营业额", "No branches yet":"暂无分店",
    "Current":"当前", "Top today":"今日最佳", "Branch name":"分店名称",
    "Adds a new venue you own. Switch to it to set up its team, menu and features.":"新增一家你拥有的门店。切换进去即可设置其团队、菜单与功能。",
    "Branch added — switch to it to set it up":"分店已添加 — 切换进去进行设置",
    "Switching a branch changes which venue's team, menu and settings you manage. The current branch is highlighted and its logo/name shows on the sign-in page.":"切换分店会改变你管理的门店（团队、菜单与设置）。当前分店会高亮，其 logo / 名称显示在登录页。",

    // ---- Rostering extras ----
    "· shift slots:":"· 班次时段：",
    "Award pay auto-calculated":"工资按行业标准自动计算",
    "· split by age + employment type across weekday / Saturday / Sunday / public holiday.":"· 按年龄 + 雇佣类型，分平日 / 周六 / 周日 / 公共假期计算。",
    "Indicative — the employer confirms before pay runs.":"仅供参考 —— 发薪前由雇主确认。",

    // ---- Table QR ----
    "Guests scan to open":"顾客扫码打开",
    "; orders flow live into the kitchen KDS. Print and stick a code on every table.":"；订单实时进入后厨 KDS。请为每张桌子打印并张贴二维码。",
    "Table":"桌号",

    // ---- Staff onboarding extras ----
    "Before your first shift, please complete the required documents below:":"首班之前，请完成以下必需文件：",
    "Passport":"护照", "and":"和", "Super choice":"养老金选择", "TFN declaration":"TFN 申报",
    "Upload a photo of your passport or ID":"上传护照或证件照片",
    "Enter your Tax File Number + declaration":"填写你的税号 TFN + 申报",
    "Choose your super fund / upload the form":"选择养老金账户 / 上传表格",
    "Add your BSB + account (for pay)":"添加 BSB + 账号（用于发薪）",
    "Complete required documents first":"请先完成必需文件",
    "Uploaded · encrypted":"已上传 · 已加密",
    "Submitted · encrypted (owner-only)":"已提交 · 已加密（仅老板可见）",
    "📷 Photo":"📷 照片",

    // ---- Login: apply for a restaurant ----
    "Apply for a new restaurant system":"申请开通新餐厅系统",
    "Apply to run your restaurant on My Kitchen. Only business owners may apply — a Super Admin reviews every request before your system is provisioned.":"申请在 My Kitchen 上运营你的餐厅。仅店主可申请 —— 超级管理员会先审核每个请求再开通系统。",
    "Restaurant name":"餐厅名称", "Restaurant address":"餐厅地址", "Website (optional)":"网站（可选）",
    "Contact phone":"联系电话", "Contact email":"联系邮箱",
    "Owner login (for after approval)":"店主登录（审批通过后使用）",
    "Choose a username":"设置用户名", "Choose a password":"设置密码",
    "📩 Submit application":"📩 提交申请", "Submitting…":"提交中…",
    "Application submitted!":"申请已提交！", "Your login username":"你的登录用户名", "Status":"状态",
    "Pending approval":"待审批", "Restaurants on My Kitchen":"My Kitchen 上的餐厅",
    "Your application is still pending approval":"你的申请仍在等待审批",
    "Your restaurant is still pending approval":"你的餐厅仍在等待审批",
    "Wrong username/email or password":"用户名 / 邮箱或密码错误",
    "Wrong Super Admin password":"超级管理员密码错误",

    // ---- Super Admin portal ----
    "System administrator — approve venues & oversee every restaurant":"系统管理员 —— 审批门店并监管所有餐厅",
    "Applications":"申请", "Restaurants":"餐厅",
    "Restaurant applications":"餐厅申请",
    "Review and approve new restaurants before their system is provisioned":"在开通系统前审核并批准新餐厅",
    "⏳ Pending approval":"⏳ 待审批", "Recently decided":"近期已处理",
    "No pending applications":"暂无待审批申请", "Nothing decided yet":"暂无处理记录",
    "✓ Approve":"✓ 批准", "Reject":"驳回", "Rejected":"已驳回",
    "Approved & provisioned — the owner can now sign in":"已批准并开通 —— 店主现在可以登录了",
    "Application rejected":"申请已驳回", "Reject application":"驳回申请",
    "All restaurants":"所有餐厅",
    "Global visibility across every venue (tenant), their users and configuration":"全局查看每个门店（租户）及其用户与配置",
    "＋ Create restaurant":"＋ 创建餐厅", "🏢 Restaurants":"🏢 餐厅", "⏳ Pending":"⏳ 待审批",
    "Each restaurant is an isolated tenant. You have full visibility into every venue's users, data and configuration here.":"每个餐厅都是独立租户。你在此可全面查看每个门店的用户、数据与配置。",
    "Create a restaurant":"创建餐厅", "Create (active)":"创建（启用）", "Restaurant created":"餐厅已创建",
    "Step into any restaurant and see exactly what its owner, manager or staff see":"进入任意餐厅，查看其店主 / 经理 / 员工所见的界面",
    "A banner at the top lets you return to the Super Admin console at any time.":"顶部横幅可让你随时返回超级管理员控制台。",
    "No active restaurants":"暂无已启用的餐厅",
    "👁 Enter as…":"👁 以…身份进入", "Approve & provision":"批准并开通",
    "← Back to restaurants":"← 返回餐厅列表",
    "Hierarchy & unique IDs":"层级与唯一 ID", "⚙️ Configuration snapshot":"⚙️ 配置快照",
    "Setup complete":"已完成设置", "Contact":"联系方式", "Status":"状态",

    // ---- Owner: setup wizard ----
    "1 · Restaurant logo":"1 · 餐厅 Logo", "2 · Choose your features":"2 · 选择功能",
    "Your logo appears on the sign-in page and in every portal.":"你的 Logo 会显示在登录页和各个端。",
    "🏪 Restaurant profile":"🏪 餐厅资料",
    "Your logo and name appear in the sidebar, on the sign-in page and across every portal.":"你的 Logo 和名称会显示在侧边栏、登录页以及各个端。",
    "📷 Tap to upload":"📷 点击上传", "Your restaurant name":"你的餐厅名称",
    "Save profile":"保存资料", "Remove logo":"移除 Logo",
    "Restaurant profile saved":"餐厅资料已保存",
    "Image too large — please use one under 2 MB":"图片过大 —— 请使用 2 MB 以内的图片",
    "Display name":"显示名称",
    "Tick the modules you want. Unticked ones are hidden from your team.":"勾选你需要的模块，未勾选的将对团队隐藏。",
    "✅ Finish setup":"✅ 完成设置",
    "You can revisit Settings anytime to toggle features or switch language.":"你可随时在「设置」中开关功能或切换语言。",
    "Setup complete — welcome aboard! 🎉":"设置完成 —— 欢迎加入！🎉",

    // ---- Owner: team & roles ----
    "Your managers and staff · tap anyone to open their profile or change their role":"你的经理与员工 · 点击任意成员查看资料或调整身份",
    "🔗 Manager join link":"🔗 经理加入链接", "👥 Total people":"👥 总人数",
    "No managers yet — share the join link":"暂无经理 —— 分享加入链接",
    "Invite a manager":"邀请经理", "Manager join link":"经理加入链接", "Copy link":"复制链接", "Join link copied":"加入链接已复制",
    "Share this link with a manager. They open it, create their login, and instantly join this restaurant.":"把此链接发给经理。他们打开后创建登录账号，即可立即加入本餐厅。",
    "Change role":"调整身份", "Save role":"保存身份",
    "Change role":"调整身份",

    // ---- Manager join page ----
    "Join the team":"加入团队", "Invalid invite link":"邀请链接无效",
    "Your name":"你的姓名",
    "This invite link is invalid or the restaurant isn't active yet. Please check with the owner.":"此邀请链接无效，或餐厅尚未启用。请与店主确认。",
    "← Back to sign in":"← 返回登录",
    "Go to sign in":"前往登录",

    // ---- Pay rate settings (owner-configurable) ----
    "⚙️ Pay rates":"⚙️ 薪资费率", "Pay rate settings":"薪资费率设置", "Save rates":"保存费率", "Pay rates saved":"薪资费率已保存",
    "Set the award multipliers used for indicative wage calculations across rostering, labor cost and compliance. The employer still confirms before pay runs.":"设置用于排班、人力成本与合规中工资参考计算的 Award 费率。发薪前仍由雇主确认。",
    "Day-type rates":"按日类型费率", "Weekday (Mon–Fri)":"平日（周一至周五）", "Public holiday":"公众假期",
    "Saturday":"周六", "Sunday":"周日",
    "Junior rates (share of adult rate by age)":"未成年费率（按年龄占成人费率比例）",
    "Age 16 & under":"16 岁及以下", "Age 17":"17 岁", "Age 18":"18 岁", "Age 19":"19 岁", "Age 20":"20 岁",
    "Age 21+ is paid the full adult rate (100%).":"21 岁及以上按成人全额费率（100%）计算。",

    // ---- Rostering stat detail modals ----
    "on the roster · view ›":"在排班中 · 查看 ›", "indicative · breakdown ›":"参考值 · 明细 ›",
    "This week's wages":"本周工资", "Total (indicative)":"合计（参考）",
    "Award-based indicative figures; the employer confirms before pay runs.":"基于 Award 的参考数字；发薪前由雇主确认。",
    "Labor cost ratio":"人力成本占比", "Rostered wages (this week)":"本周排班工资", "Forecast revenue":"预测营业额",
    "Labor ratio":"人力占比", "Red line":"红线",
    "Over the red line — synced to the owner for approval.":"超出红线 —— 已同步给老板审批。",
    "Within the healthy range.":"在健康范围内。",
    "Student-visa hours":"学生签证工时", "No student-visa staff":"暂无学签员工",
    "No shifts rostered":"暂无排班", "No staff yet":"暂无员工",

    // ---- Blind drop: open + close ----
    "Cash count":"现金清点", "🌅 Opening float":"🌅 开店备用金", "🌙 Closing count":"🌙 打烊清点",
    "Enter note / coin counts (tap ± or type)":"录入纸币 / 硬币数量（点 ± 或直接输入）",
    "Opening float total":"开店备用金合计", "Blind-counted total":"盲点合计",
    "Count the cash going into the drawer to start the day — recorded as today's opening float (no comparison).":"清点开店放入钱箱的现金 —— 记录为今日开店备用金（不做比对）。",
    "The expected total is hidden. Blind-count the drawer cash; the system compares it and generates a variance report.":"应收金额已隐藏。请盲点钱箱现金；系统会比对并生成差异报告。",
    "Submit":"提交", "Opening float recorded":"开店备用金已记录",
    "At close, run the closing count to reconcile the drawer.":"打烊时，运行打烊清点以对账钱箱。",
    "Reconciliation result":"对账结果",

    // ---- KDS serving time ----
    "⏱ Serving time":"⏱ 出餐时间", "KDS serving time":"KDS 出餐时间",
    "Set how long an order can wait before the kitchen ticket warns (amber) and then flags overdue (red). No fixed default — tune it to your kitchen.":"设置订单等待多久后出单变橙（提醒）、再变红（超时）。无固定默认值 —— 按你的后厨调整。",
    "Warn after (min)":"提醒阈值（分钟）", "Overdue / red after (min)":"超时变红（分钟）", "Serving time saved":"出餐时间已保存",

    // ---- Staff: own sensitive info ----
    "Your TFN is encrypted at rest. You can see your own here; for other staff, only the owner can reveal it (Privacy Act TFN Rule).":"你的 TFN 静态加密存储。你可在此查看自己的；其他员工的仅老板可查看（隐私法 TFN 规则）。",
    "All set — your documents are encrypted and stored. Tap any item above to view or update.":"已就绪 —— 你的文件已加密存储。点击上方任一项即可查看或更新。",

    // ---- AI assistant ----
    "🤖 Assistant":"🤖 智能助手", "Ask about a feature or your shifts…":"问我功能或你的班次…",
    "What are my shifts?":"我的班次是？", "How many hours this week?":"本周多少工时？",
    "My pay estimate":"我的薪资预估", "How do I clock in?":"怎么打卡？", "My TFN":"我的税号 TFN",
    "How do I roster the team?":"怎么给团队排班？", "How do I add a user?":"怎么添加员工？",
    "This week's wages":"本周工资", "Post an SOS cover":"发布 SOS 补班",
    "Today's revenue":"今日营业额", "How many staff?":"有多少员工？", "Add a branch":"添加分店",
    "Set pay rates":"设置薪资费率", "How does compliance work?":"合规怎么用？",
    "Pending applications":"待审批申请", "How do I approve a restaurant?":"怎么审批餐厅？",
    "Switch into a venue":"进入某个门店", "How do I sign in?":"怎么登录？",
    "What is this app?":"这个系统是什么？", "Switch to 中文":"切换到中文",

    // ---- Manager: My shifts ----
    "My shifts":"我的班次",
    "Your own roster · clock in on the day · add a shift for yourself":"你的个人排班 · 当天打卡 · 可为自己加班次",
    "＋ Add my shift":"＋ 为我加班次", "Add my shift":"为我加班次",
    "No shifts rostered for you this week — tap “Add my shift”.":"本周暂无你的排班 —— 点「为我加班次」。",
    "The owner can also place your shifts. Anything here syncs with the team roster.":"老板也可为你排班。此处的改动会与团队排班同步。",
    "Shift added to your roster":"班次已加入你的排班", "Day":"星期",

    // ---- Owner: Branches ----
    "Branches":"分店",
    "Your venues — add a new branch and switch between them to manage each one":"你的门店 —— 添加新分店并在它们之间切换以分别管理",
    "＋ Add branch":"＋ 添加分店", "Add a branch":"添加分店", "Add branch":"添加分店",
    "🏢 Branches":"🏢 分店", "📍 Current":"📍 当前", "👥 People (current)":"👥 人数（当前）",
    "Current":"当前", "Branch name":"分店名称",
    "No branches yet":"暂无分店",
    "Switching a branch changes which venue's team, menu and settings you manage. Your current branch is highlighted and its logo/name shows on the sign-in page.":"切换分店会改变你所管理门店的团队、菜单与设置。当前分店会高亮，其 Logo/名称会显示在登录页。",
    "Adds a new venue you own. Switch to it to set up its team, menu and features.":"添加一个你拥有的新门店。切换到它即可设置其团队、菜单与功能。",
    "Branch added — switch to it to set it up":"分店已添加 —— 切换过去即可设置",

    // ---- Owner: Staff performance points (Batch 3) ----
    "Performance":"绩效", "Perform":"绩效",
    "Staff performance":"员工绩效",
    "⚙️ Points settings":"⚙️ 积分设置", "Points settings":"积分设置",
    "Points are an internal incentive metric over the last 30 days — not a formal performance review.":"积分是过去 30 天的内部激励指标 —— 并非正式绩效考核。",
    "No staff yet":"暂无员工",
    "Points per order served":"每出一单积分", "Points per on-time clock-in":"每次准时打卡积分",
    "Points per task done":"每完成一项任务积分", "Penalty per refund / cancel":"每次退款/取消扣分",
    "Points settings saved":"积分设置已保存",
    "🎁 Reward":"🎁 奖励", "Reward":"奖励", "Give reward":"发放奖励",
    "Reward / recognition":"奖励 / 表彰",
    "e.g. $50 bonus · Employee of the month":"例如：$50 奖金 · 月度最佳员工",
    "Enter a reward":"请填写奖励内容", "Reward recorded 🎁":"奖励已记录 🎁",
    "rewarded":"已奖励", "Bonus points (optional)":"奖励积分（可选）",

    // ---- Owner: Membership / loyalty / coupons (Batch 4) ----
    "Membership":"会员", "Members":"会员",
    "🪪 Members":"🪪 会员", "🔁 Repurchase rate":"🔁 复购率",
    "⭐ Points outstanding":"⭐ 未兑积分", "💰 Stored value":"💰 储值余额",
    "⚙️ Loyalty settings":"⚙️ 会员设置", "Loyalty settings":"会员积分设置", "Loyalty settings saved":"会员设置已保存",
    "🔁 Frequently bought together":"🔁 常一起购买", "💎 Top members by spend":"💎 消费最高会员",
    "Not enough order history yet":"订单数据不足", "No members yet":"暂无会员", "No coupons yet":"暂无优惠券",
    "🎟️ Coupons":"🎟️ 优惠券", "＋ Issue coupon":"＋ 发放优惠券",
    "🪪 Members":"🪪 会员", "Search name / phone / code":"搜索 姓名 / 电话 / 编号",
    "No members yet — add them at checkout in POS":"暂无会员 —— 在 POS 收银台结账时添加",
    "Points earned per $1 spent":"每消费 $1 获得积分", "Redemption value — cents per point":"兑换价值 —— 每积分多少分",
    "1 = 100 pts worth $1":"1 = 100 积分价值 $1", "Sign-up bonus points":"注册赠送积分",
    "Issue coupons":"发放优惠券", "Issue member coupon":"发放会员优惠券", "Issue":"发放",
    "% off":"% 折扣", "$ off":"$ 折扣", "Percent off":"折扣百分比", "Amount off ($)":"减免金额（$）",
    "Minimum spend (optional)":"最低消费（可选）", "Expiry date (optional)":"有效期（可选）", "How many codes":"生成数量",
    "Points":"积分", "Balance":"余额", "Visits":"到店次数", "Spent":"累计消费",
    "💰 Top up":"💰 充值", "⭐ Adjust points":"⭐ 调整积分", "🎟️ Give coupon":"🎟️ 赠送优惠券",
    "Recent activity":"近期记录", "No activity yet":"暂无记录",
    "Top-up amount":"充值金额", "Add to balance":"充入余额", "Enter an amount":"请输入金额",
    "Points (use − to deduct)":"积分（用 − 扣除）", "e.g. goodwill, correction":"例如：好评回馈、修正",
    "Points adjusted":"积分已调整", "Topped up":"充值成功",
    "Active":"有效", "Used":"已使用", "public":"公开",
    // ---- POS: member checkout / coupons ----
    "👤 Add member · phone or QR":"👤 添加会员 · 电话或二维码", "Coupon":"优惠券", "Points redeemed":"积分抵扣",
    "🎟️ Coupon":"🎟️ 优惠券", "⭐ Redeem points":"⭐ 积分抵扣", "💰 Balance":"💰 余额",
    "Add member":"添加会员", "Phone or member code":"电话或会员编号", "Phone or member QR code":"电话或会员二维码",
    "Member name":"会员姓名", "Create member":"创建会员", "Member added":"会员已添加", "New member created":"新会员已创建",
    "Insufficient balance":"余额不足", "Apply coupon":"使用优惠券", "Coupon code":"优惠券码", "Coupon applied":"优惠券已使用",
    "Redeem points":"积分抵扣", "No member found.":"未找到会员。",
    "No such coupon":"优惠券不存在", "Coupon already used":"优惠券已使用", "Coupon expired":"优惠券已过期",
    "Coupon belongs to another member":"该优惠券属于其他会员",
  };

  // Templated strings (numbers / names interpolated) — exact match can't catch
  // these, so match by pattern and re-insert the captured dynamic bits.
  const PATTERNS = [
    // Stock / training / roster counts
    [/^(\d+) items? on hand$/, m => `${m[1]} 项在册`],
    [/^(\d+) items?$/, m => `${m[1]} 项`],
    [/^reorder at ([\d.]+) ?(\S*)$/, m => `补货线 ${m[1]} ${m[2]}`],
    [/^(\d+) shifts?$/, m => `${m[1]} 个班次`],
    [/^(\d+)\/(\d+) done$/, m => `${m[1]}/${m[2]} 已完成`],
    [/^(\d+) step(?:s)?$/, m => `${m[1]} 个步骤`],
    [/^due (\d{4}-\d{2}-\d{2})$/, m => `截止 ${m[1]}`],
    [/^signed off (.+)$/, m => `${m[1]} 已签字`],
    [/^(\d+) reviews$/, "$1 条评价"],
    [/^(\d+) orders? today · live$/, "今日 $1 单 · 实时"],
    [/^(\d+) active · (\d+) total$/, "$1 在职 · 共 $2 人"],
    [/^🔒 Append-only · (\d+) entries$/, "🔒 仅追加 · 共 $1 条"],
    [/^Append-only · (\d+) entries$/, "仅追加 · 共 $1 条"],
    [/^Aggregates staff fridge-temperature logs and hygiene tasks into a Council food-safety audit format\. Today: (\d+)\/(\d+) logged\.$/, "汇总员工冰箱测温记录与卫生任务，生成市政食品安全审计格式。今日：已记录 $1/$2。"],
    [/^Student visa · fortnight cap (\d+)h$/, "学生签证 · 两周上限 $1h"],
    [/^([\d.]+ h) this week$/, "本周 $1"],
    // Staff list / overview rows (embedded id + data) — translate the label parts.
    [/^· onboarded$/, "· 已入职"],
    [/^· pending$/, "· 待入职"],
    [/^ID (\S+) · (.+?) · student visa$/, m => `ID ${m[1]} · ${tr(m[2])} · 学生签证`],
    [/^ID (\S+) · (.+?) · (onboarded|pending)$/, m => `ID ${m[1]} · ${tr(m[2])} · ${m[3]==='onboarded'?'已入职':'待入职'}`],
    [/^(.+?) · (\d+) shifts?$/, m => `${tr(m[1])} · ${m[2]} 个班次`],
    // New-feature templated strings
    [/^Total staff · (\d+)$/, "员工总数 · $1"],
    [/^Your TFN: (.+)$/, "你的 TFN：$1"],
    [/^Student-visa hours are hard-capped at (\d+)h\/fortnight to protect employer compliance\.$/, "学生签证工时硬性封顶为每两周 $1 小时，以保障雇主合规。"],
    [/^Opening float (\$[\d,]+\.\d{2}) recorded for (.+)\.$/, m => `开店备用金 ${m[1]} 已记录于 ${m[2]}。`],
    // Audit log: "<action label> · $<amount>"
    [/^(.+?) · (\$[\d,]+\.\d{2})$/, m => `${tr(m[1])} · ${m[2]}`],
    // Compliance super reminder: "est. at X% · due YYYY-MM-DD"
    [/^est\. at ([\d.]+%) · due (.+)$/, m => `预计 ${m[1]} · 截止 ${m[2]}`],
    // Super Admin kitchen row: "<loc> · N manager(s) · M staff · ID xxx"
    [/^(.+) · (\d+) manager\(s\) · (\d+) staff · ID (.+)$/, m => `${m[1]} · ${m[2]} 名经理 · ${m[3]} 名员工 · ID ${m[4]}`],
    // Labor cost
    [/^red line ([\d.]+%)$/, "红线 $1"],
    [/^You approved this week's roster on (.+)\.$/, m => `你已于 ${m[1]} 批准本周排班。`],
    // Daily report summary line
    [/^Today's revenue (.+) across (\d+) orders; cash variance (.+); tomorrow (\d+) bookings\.$/,
      m => `今日营业额 ${m[1]}，共 ${m[2]} 单；现金差异 ${m[3]==='not reconciled'?'未对账':m[3]}；明日 ${m[4]} 桌预订。`],
    // KDS ticket / QR / rostering / onboarding companions
    [/^#(\w+) · table (.+)$/, m => `#${m[1]} · 桌 ${m[2]}`],
    [/^Table (\d+)$/, "桌 $1"],
    [/^🛂 Student-visa hours \(\/(\d+)h\)$/, "🛂 学生签证工时（/$1h）"],
    [/^Morning (\d\d:\d\d-\d\d:\d\d)$/, "早班 $1"],
    [/^Evening (\d\d:\d\d-\d\d:\d\d)$/, "晚班 $1"],
    [/^Welcome aboard, (.*)!$/, m => `欢迎加入，${m[1]}！`],
    [/^(\d+)\/(\d+) required$/, "$1/$2 项必需"],
    [/^Passport \/ TFN are encrypted \((AES-GCM|local cipher)\) and can only be revealed by the owner\. This system aggregates data only and does not file with the ATO\.$/,
      m => `护照 / TFN 已加密（${m[1]}），仅老板可查看。本系统仅汇总数据，不向 ATO 申报。`],
    // Customer self-order page
    [/^🪑 Table (.+) · self-order$/, "🪑 桌 $1 · 自助点单"],
    [/^Table (.+) · confirm order$/, "桌 $1 · 确认订单"],
    // Staff performance leaderboard rows
    [/^(\d+) orders · (\d+) on-time · (\d+) tasks · ~(\d+)m prep$/, m => `${m[1]} 单 · ${m[2]} 次准时 · ${m[3]} 项任务 · 约 ${m[4]} 分钟出餐`],
    [/^(\d+) orders · (\d+) on-time · (\d+) tasks ·$/, m => `${m[1]} 单 · ${m[2]} 次准时 · ${m[3]} 项任务 ·`],
    [/^(\d+) orders · (\d+) on-time · (\d+) tasks$/, m => `${m[1]} 单 · ${m[2]} 次准时 · ${m[3]} 项任务`],
    [/^(\d+) errors$/, "$1 个失误"],
    [/^· ~(\d+)m prep$/, "· 约 $1 分钟出餐"],
    [/^🎁 Reward (.+)$/, m => `🎁 奖励 ${m[1]}`],
    // Sold-out toasts
    [/^“(.+)” marked sold out$/, m => `“${m[1]}” 已沽清`],
    [/^“(.+)” back in stock$/, m => `“${m[1]}” 已恢复供应`],
    // Bookings & queue dynamic lines
    [/^Today (\d{2}:\d{2}) · (\d+) ppl(.*)$/, m => `今天 ${m[1]} · ${m[2]} 人${m[3]}`],
    [/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) · (\d+) ppl(.*)$/, m => `${m[1]} ${m[2]} · ${m[3]} 人${m[4]}`],
    [/^(\d+) ppl(.*) · waiting (.+)$/, m => `${m[1]} 人${m[2]} · 已等 ${m[3]}`],
    [/^Added · ticket #(\d+)$/, "已加入 · 号码 #$1"],
    // Refund approval
    [/^Refunds need a manager's approval\. Ask a manager to sign off on refunding #(\w+) \((.+)\)\.$/,
      m => `退款需经理审批。请经理确认为订单 #${m[1]}（${m[2]}）退款。`],
    [/^Refund #(\w+) · approved by (.+)$/, m => `退款 #${m[1]} · 由 ${m[2]} 批准`],
    // Customer rewards greeting
    [/^Hi (.+) — here are your rewards\.$/, m => `你好 ${m[1]} —— 这是你的会员权益。`],
    // Receipt dynamic lines
    [/^Served by (.+)$/, m => `服务员：${m[1]}`],
    [/^Discount (\d+)%$/, "折扣 $1%"],
    [/^Coupon ([A-Z0-9]+)$/, "优惠券 $1"],
    [/^Points redeemed \((\d+)\)$/, "积分抵扣（$1）"],
    [/^⭐ (.+) · \+(\d+) pts · (\d+) pts total · Balance (.+)$/, m => `⭐ ${m[1]} · +${m[2]} 分 · 共 ${m[3]} 分 · 余额 ${m[4]}`],
    [/^⭐ (.+) · (\d+) pts total · Balance (.+)$/, m => `⭐ ${m[1]} · 共 ${m[2]} 分 · 余额 ${m[3]}`],
    // Membership (Batch 4) templated strings
    [/^Loyalty points, stored value and e-coupons — plus repurchase & combo analysis\. (.+) pt \/ \$1 · 100 pts = (.+)\.$/,
      m => `会员积分、储值与电子优惠券 —— 含复购与搭配分析。每 $1 得 ${m[1]} 分 · 100 分 = ${m[2]}。`],
    [/^(\d+) returning$/, "$1 位回头客"],
    [/^· (\d+) active$/, "· $1 张有效"],
    [/^min (\$[\d,]+\.\d{2}) · (.+)$/, m => `最低 ${m[1]} · ${m[2]==='public'?'公开':m[2]}`],
    [/^member (M[A-Z0-9]{6})$/, "会员 $1"],
    [/^member (M[A-Z0-9]{6}) · exp (.+)$/, m => `会员 ${m[1]} · 到期 ${m[2]}`],
    [/^public · exp (.+)$/, "公开 · 到期 $1"],
    [/^(\d+)% off$/, "$1% 折扣"],
    [/^(\$[\d,]+\.\d{2}) off$/, "$1 折扣"],
    [/^(\d+) visits · ⭐ (\d+) pts$/, "到店 $1 次 · ⭐ $2 分"],
    [/^⭐ (\d+) pts · 💰 (.+) · (\d+) visits$/, m => `⭐ ${m[1]} 分 · 💰 ${m[2]} · 到店 ${m[3]} 次`],
    [/^⭐ (\d+) pts · 💰 (.+) · (\d+) visits · (.+)$/, m => `⭐ ${m[1]} 分 · 💰 ${m[2]} · 到店 ${m[3]} 次 · ${m[4]}`],
    [/^⭐ (\d+) pts · 💰 (.+?)( · .+)?$/, m => `⭐ ${m[1]} 分 · 💰 ${m[2]}${m[3]?' · '+m[3].replace(/^ · /,''):''}`],
    [/^(.+) will earn (\d+) points on this order$/, m => `${m[1]} 本单可获得 ${m[2]} 积分`],
    [/^Pay (.+) from balance · remaining (.+)$/, m => `用余额支付 ${m[1]} · 剩余 ${m[2]}`],
    [/^(.+) has (\d+) points · worth up to (.+) here$/, m => `${m[1]} 有 ${m[2]} 积分 · 此单最多可抵 ${m[3]}`],
    [/^Points to redeem \(max (\d+)\)$/, "抵扣积分（最多 $1）"],
    [/^No member found\. Create one with this phone\?$/, "未找到会员。用此电话创建一个？"],
    [/^Issued to member (M[A-Z0-9]{6})$/, "发放给会员 $1"],
    [/^Top up (.+)$/, m => `充值 ${m[1]}`],
    [/^Adjust points · (.+)$/, m => `调整积分 · ${m[1]}`],
    [/^Minimum spend (\$[\d,]+\.\d{2})$/, "最低消费 $1"],
    [/^Topped up (\$[\d,]+\.\d{2})$/, "已充值 $1"],
    // Owner preview banners (role name already translated inside the capture)
    [/^👁 Owner preview · (.+)$/, m => `👁 老板预览 · ${tr(m[1].trim())}`],
    [/^Owner · previewing (.+)$/, m => `老板 · 预览${tr(m[1])}`],
  ];

  // ---- multi-language registry ----
  // The built-in 简体中文 dictionary lives above (T + PATTERNS). Every other
  // language registers its own dictionary from js/lang/<code>.js, which loads
  // after this file.
  const DICTS = { 'zh-Hans': { T: T, P: PATTERNS } };
  let active = DICTS[lang] || null;          // null for English (source of truth)
  function register(code, d){
    DICTS[code] = { T: (d && d.T) || {}, P: (d && d.P) || [] };
    if(code === lang){ active = DICTS[code]; if(lang !== 'en') schedule(); }
  }

  function trKey(key){
    if(!active) return null;
    if(active.T[key]) return active.T[key];
    for(const [re, rep] of active.P){
      const m = key.match(re);
      if(m) return typeof rep === 'function' ? rep(m) : key.replace(re, rep);
    }
    return null;
  }

  function tr(s){
    if(s==null) return s;
    const key = String(s).trim();
    return trKey(key) || s;
  }

  // ---- DOM translation ----
  const ATTRS = ['placeholder','title','aria-label'];
  let applying = false, scheduled = false;

  function translateTextNode(node){
    const raw = node.nodeValue;
    if(!raw) return;
    const key = raw.trim();
    if(!key) return;
    const hit = trKey(key);
    if(hit && hit!==key){
      const lead = raw.match(/^\s*/)[0];
      const trail = raw.match(/\s*$/)[0];
      node.nodeValue = lead + hit + trail;
    }
  }

  function translateEl(el){
    for(const a of ATTRS){
      if(el.hasAttribute && el.hasAttribute(a)){
        const v = el.getAttribute(a);
        const hit = T[(v||'').trim()];
        if(hit && hit!==v) el.setAttribute(a, hit);
      }
    }
  }

  function apply(root){
    if(lang==='en' || !active || !root) return;
    applying = true;
    try{
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
        acceptNode(n){
          if(n.nodeType===Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
          const tag = n.tagName;
          if(tag==='SCRIPT' || tag==='STYLE' || tag==='TEXTAREA') return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      // Translate the root element's own attributes too
      if(root.nodeType===Node.ELEMENT_NODE) translateEl(root);
      let n;
      while((n = walker.nextNode())){
        if(n.nodeType===Node.TEXT_NODE) translateTextNode(n);
        else translateEl(n);
      }
    }finally{ applying = false; }
  }

  function schedule(){
    if(scheduled) return;
    scheduled = true;
    // setTimeout (not rAF) so translation still fires when the tab is backgrounded.
    setTimeout(()=>{ scheduled = false; apply(document.body); }, 0);
  }

  function startObserver(){
    if(!('MutationObserver' in window) || !document.body) return;
    const obs = new MutationObserver((muts)=>{
      if(applying || lang==='en') return;
      schedule();
    });
    obs.observe(document.body, { subtree:true, childList:true, characterData:true });
  }

  async function set(l){
    lang = normalize(l);
    active = DICTS[lang] || null;
    try{ localStorage.setItem(STORE, lang); }catch(e){}
    document.documentElement.lang = HTML_LANG[lang] || 'en';
    // Re-render the current route from the English source, then translate.
    try{ if(MKR.router && MKR.router.render) await MKR.router.render(); }catch(e){}
    if(lang!=='en') apply(document.body);
  }

  // Language selector (used by login + settings). A <select> so it scales to
  // every registered language, not just two.
  function switcher(){
    const opts = LANGS.map(L=>`<option value="${L.code}"${L.code===lang?' selected':''}>${L.label}</option>`).join('');
    return `<select class="lang-select" aria-label="Language">${opts}</select>`;
  }
  // Wire up any rendered selectors within `root`
  function bindSwitchers(root){
    (root||document).querySelectorAll('.lang-select').forEach(s=>{
      s.value = lang;
      s.onchange = ()=> set(s.value);
    });
  }

  MKR.i18n = { get lang(){ return lang; }, LANGS, set, register, t:tr, apply, switcher, bindSwitchers };

  document.documentElement.lang = HTML_LANG[lang] || 'en';
  startObserver();
  if(lang!=='en') apply(document.body);
})();
