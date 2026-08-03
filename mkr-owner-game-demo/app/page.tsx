"use client";

import { useEffect, useMemo, useState } from "react";

type Item = {
  id: string;
  icon: string;
  name: string;
  detail: string;
  price: number;
  qty: number;
  unit: string;
  selected: boolean;
  urgent?: boolean;
};

const initialItems: Item[] = [
  { id: "chicken", icon: "🍗", name: "Chicken thigh", detail: "周五前会用完", price: 7.8, qty: 20, unit: "kg", selected: true, urgent: true },
  { id: "rice", icon: "🍚", name: "Jasmine rice", detail: "只够用 3 天", price: 3.2, qty: 15, unit: "kg", selected: true },
  { id: "oil", icon: "🫗", name: "Canola oil", detail: "低于安全库存", price: 34, qty: 2, unit: "桶", selected: true },
  { id: "lime", icon: "🍋", name: "Fresh lime", detail: "周末预计多用 18%", price: 0.62, qty: 36, unit: "个", selected: false },
];

const zones = [
  { id: "front", icon: "🧾", name: "前台", note: "今日经营", count: 1, className: "front" },
  { id: "kitchen", icon: "🍳", name: "后厨", note: "明日备货", count: 2, className: "kitchen" },
  { id: "stock", icon: "📦", name: "仓库", note: "库存补货", count: 4, className: "stock" },
  { id: "delivery", icon: "🚚", name: "收货口", note: "确认到货", count: 1, className: "delivery" },
  { id: "team", icon: "👥", name: "员工区", note: "下周排班", count: 1, className: "team" },
  { id: "office", icon: "📈", name: "老板办公室", note: "本周总结", count: 1, className: "office" },
];

type ZoneId = "front" | "kitchen" | "stock" | "delivery" | "team" | "office";
type Activity = { id: number | string; zone: string; title: string; detail: string; amountCents?: number | null; createdAt: number };

const zoneDetails: Record<Exclude<ZoneId, "stock">, {
  title: string; subtitle: string; task: string; action: string; taskDetail: string;
  stats: { label: string; value: string; trend: string }[];
  history: { date: string; title: string; detail: string; value: string }[];
}> = {
  front: {
    title: "今天经营得怎么样", subtitle: "不用接管收银，只记录每天最重要的经营数字。",
    task: "登记今天的营业情况", action: "确认今日记录", taskDetail: "营业额 $3,860 · 142 单 · 客单价 $27.18",
    stats: [
      { label: "今日营业额", value: "$3,860", trend: "比上周五 +8%" },
      { label: "今日订单", value: "142", trend: "午餐高峰 12:30" },
      { label: "平均客单", value: "$27.18", trend: "过去 4 周 $25.90" },
    ],
    history: [
      { date: "上周五", title: "营业日结", detail: "131 单 · 客单价 $27.32", value: "$3,579" },
      { date: "两周前", title: "营业日结", detail: "128 单 · 客单价 $26.80", value: "$3,430" },
      { date: "三周前", title: "营业日结", detail: "136 单 · 客单价 $25.96", value: "$3,531" },
    ],
  },
  kitchen: {
    title: "准备明天要用的菜", subtitle: "根据过去用量、预订和天气，先算出建议备货量。",
    task: "确认明日备货清单", action: "确认备货量", taskDetail: "鸡肉 18kg · 米饭 12kg · 青菜 8kg · 酱料 6L",
    stats: [
      { label: "明日预订", value: "48 位", trend: "比上周六 +12%" },
      { label: "建议备货", value: "14 项", trend: "2 项需要加量" },
      { label: "上周浪费", value: "$86", trend: "比四周均值少 $23" },
    ],
    history: [
      { date: "上周六", title: "备货完成", detail: "14 项 · 剩余鸡肉 1.2kg", value: "$628" },
      { date: "上周五", title: "备货完成", detail: "12 项 · 青菜少备 2kg", value: "$517" },
      { date: "两周前", title: "周末备货", detail: "15 项 · 浪费记录 $112", value: "$694" },
    ],
  },
  delivery: {
    title: "确认今天收到的货", subtitle: "数量、温度、质量和照片都留在同一份记录里。",
    task: "验收 FreshPro 送货", action: "确认收货", taskDetail: "8 项全部到齐 · 冷藏温度 3.4°C · 包装正常",
    stats: [
      { label: "待验收", value: "1 批", trend: "FreshPro Foods" },
      { label: "本月准时率", value: "94%", trend: "共 17 次送货" },
      { label: "本月差异", value: "2 次", trend: "都已向供应商报备" },
    ],
    history: [
      { date: "7月29日", title: "FreshPro Foods", detail: "6 项到齐 · 3.1°C · Lily 签收", value: "$486" },
      { date: "7月27日", title: "Ocean Catch", detail: "三文鱼少 2kg · 已记差异", value: "$732" },
      { date: "7月25日", title: "FreshPro Foods", detail: "9 项到齐 · 3.6°C · Sam 签收", value: "$614" },
    ],
  },
  team: {
    title: "排好下周的人手", subtitle: "参考过去几周真实排班，老板只需要处理缺口。",
    task: "处理周六晚班缺口", action: "邀请合适员工", taskDetail: "向 Amy 和 Jordan 发出 17:00–22:00 可上班询问",
    stats: [
      { label: "下周班次", value: "38 个", trend: "已安排 37 个" },
      { label: "待处理缺口", value: "1 个", trend: "周六晚班" },
      { label: "预计工时", value: "214h", trend: "比上周少 6h" },
    ],
    history: [
      { date: "本周", title: "排班已发布", detail: "39 个班次 · 220 小时 · 1 次换班", value: "12 人" },
      { date: "上周", title: "排班已完成", detail: "37 个班次 · 211 小时 · 无缺勤", value: "11 人" },
      { date: "两周前", title: "排班已完成", detail: "41 个班次 · 229 小时 · 2 次换班", value: "12 人" },
    ],
  },
  office: {
    title: "老板的每周总结", subtitle: "把营业、库存、员工和异常放在一起看，不需要自己拼报表。",
    task: "确认本周经营总结", action: "保存本周总结", taskDetail: "营业额 +6.8% · 原料价格 +2.1% · 浪费减少 $47",
    stats: [
      { label: "本周营业额", value: "$24,680", trend: "比上周 +6.8%" },
      { label: "采购金额", value: "$7,420", trend: "占营业额 30.1%" },
      { label: "老板省时", value: "2.4h", trend: "完成 18 个经营任务" },
    ],
    history: [
      { date: "上周", title: "7月20–26日总结", detail: "营业额 $23,108 · 采购 $7,186", value: "+3.2%" },
      { date: "两周前", title: "7月13–19日总结", detail: "营业额 $22,392 · 采购 $7,044", value: "-1.1%" },
      { date: "三周前", title: "7月6–12日总结", detail: "营业额 $22,641 · 采购 $6,930", value: "+4.6%" },
    ],
  },
};

const stockHistory = [
  { date: "7月28日", title: "FreshPro Foods", detail: "鸡肉 18kg · 米 15kg · 食用油 2桶", value: "$387.40" },
  { date: "7月21日", title: "FreshPro Foods", detail: "鸡肉 22kg · 米 10kg · 青柠 30个", value: "$356.10" },
  { date: "7月14日", title: "FreshPro Foods", detail: "鸡肉 20kg · 食用油 2桶 · 青菜 8kg", value: "$402.80" },
  { date: "7月7日", title: "FreshPro Foods", detail: "鸡肉 17kg · 米 15kg · 青柠 24个", value: "$331.25" },
];

export default function Home() {
  const [screen, setScreen] = useState<"map" | "stock" | "zone" | "done" | "history">("map");
  const [items, setItems] = useState(initialItems);
  const [selectedZone, setSelectedZone] = useState<ZoneId>("front");
  const [records, setRecords] = useState<Activity[]>([]);
  const [completedZones, setCompletedZones] = useState<string[]>([]);
  const [language, setLanguage] = useState<"中文" | "EN">("中文");
  const [toast, setToast] = useState("");

  const chosen = items.filter((item) => item.selected);
  const total = useMemo(
    () => chosen.reduce((sum, item) => sum + item.price * item.qty, 0),
    [items]
  );

  useEffect(() => {
    fetch("/api/history")
      .then((response) => response.json())
      .then((data) => setRecords(Array.isArray(data.records) ? data.records : []))
      .catch(() => {});
  }, []);

  function openZone(id: string) {
    setSelectedZone(id as ZoneId);
    if (id === "stock") {
      setScreen("stock");
      return;
    }
    setScreen("zone");
  }

  async function saveActivity(zone: string, title: string, detail: string, amountCents?: number) {
    const optimistic: Activity = { id: `local-${Date.now()}`, zone, title, detail, amountCents, createdAt: Date.now() };
    setRecords((current) => [optimistic, ...current]);
    setCompletedZones((current) => current.includes(zone) ? current : [...current, zone]);
    try {
      const response = await fetch("/api/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ zone, title, detail, amountCents }),
      });
      if (response.ok) {
        const data = await response.json();
        setRecords((current) => current.map((record) => record.id === optimistic.id ? data.record : record));
      }
    } catch {}
  }

  function updateQty(id: string, amount: number) {
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, qty: Math.max(0, item.qty + amount) } : item
      )
    );
  }

  return (
    <main className="app-shell">
      {toast && <div className="toast">{toast}</div>}
      <header className="topbar">
        <button className="brand" onClick={() => setScreen("map")} aria-label="返回餐厅地图">
          <span className="brand-mark">M</span>
          <span><b>MKR</b><small>老板模式 · Demo</small></span>
        </button>
        <div className="top-actions">
          <div className="streak"><span>🔥</span><b>本周省下 2.4 小时</b></div>
          <button className="history-button" onClick={() => setScreen("history")}>🕘 全部记录</button>
          <button className="lang" onClick={() => setLanguage(language === "中文" ? "EN" : "中文")}>
            {language}
          </button>
          <button className="avatar">MZ</button>
        </div>
      </header>

      {screen === "map" && (
        <section className="map-screen">
          <div className="welcome">
            <div>
              <span className="eyebrow">FRIDAY · 2:35 PM</span>
              <h1>下午好，老板 👋</h1>
              <p>店里有 <b>4 件事</b>需要你决定，预计 6 分钟完成。</p>
            </div>
            <button className="primary" onClick={() => setScreen("stock")}>
              开始今日第一关 <span>→</span>
            </button>
          </div>

          <div className="progress-card">
            <div className="progress-copy">
              <span className="level">今日经营进度</span>
              <strong>2 / 6</strong>
            </div>
            <div className="progress-track"><span /></div>
            <div className="progress-goal">全部完成后，今晚不用再看后台</div>
          </div>

          <div className="restaurant">
            <div className="map-label">
              <span>你的餐厅</span>
              <small>点击有提醒的区域开始任务</small>
            </div>
            <div className="floor-pattern" />
            {zones.map((zone) => (
              <button
                key={zone.id}
                className={`zone ${zone.className} ${zone.count ? "active-zone" : ""} ${completedZones.includes(zone.id) ? "zone-complete" : ""}`}
                onClick={() => openZone(zone.id)}
              >
                {completedZones.includes(zone.id) ? <span className="bubble completed">✓</span> : zone.count > 0 && <span className="bubble">{zone.count}</span>}
                <span className="zone-icon">{zone.icon}</span>
                <b>{zone.name}</b>
                <small>{zone.note}</small>
                {zone.id === "stock" && !completedZones.includes("stock") && <em>先做这个</em>}
              </button>
            ))}
            <div className="owner-character" aria-label="老板角色">
              <span className="thought">先去看看库存</span>
              <div className="head">🙂</div>
              <div className="body">MKR</div>
              <div className="shadow" />
            </div>
            <div className="plant p1">🪴</div><div className="plant p2">🌿</div>
            <div className="table t1">🍽️</div><div className="table t2">🍽️</div>
          </div>

          <div className="insight-strip">
            <span className="insight-icon">✨</span>
            <div><b>MKR 正在替你看店</b><p>鸡肉可能在周五用完，供应商 FreshPro 的食用油本周涨了 $2。</p></div>
            <button onClick={() => setScreen("stock")}>处理库存 →</button>
          </div>
        </section>
      )}

      {screen === "zone" && selectedZone !== "stock" && (() => {
        const detail = zoneDetails[selectedZone];
        const zone = zones.find((item) => item.id === selectedZone)!;
        const saved = records.filter((record) => record.zone === selectedZone);
        return (
          <section className="mission-screen">
            <button className="back" onClick={() => setScreen("map")}>← 返回餐厅</button>
            <div className={`mission-head zone-head zone-head-${selectedZone}`}>
              <div className="mission-number">{zone.name} · 今天的任务</div>
              <div className="mission-title">
                <span className="mission-icon">{zone.icon}</span>
                <div><h1>{detail.title}</h1><p>{detail.subtitle}</p></div>
              </div>
              <div className="mission-time">系统保留每一次记录</div>
            </div>

            <div className="zone-dashboard">
              <div className="zone-main">
                <div className="metric-grid">
                  {detail.stats.map((stat) => (
                    <article className="metric-card" key={stat.label}>
                      <small>{stat.label}</small><strong>{stat.value}</strong><span>{stat.trend}</span>
                    </article>
                  ))}
                </div>
                <article className={`one-task ${completedZones.includes(selectedZone) ? "task-finished" : ""}`}>
                  <div className="task-check">{completedZones.includes(selectedZone) ? "✓" : zone.icon}</div>
                  <div><span>现在只做这一件事</span><h2>{detail.task}</h2><p>{detail.taskDetail}</p></div>
                  <button
                    disabled={completedZones.includes(selectedZone)}
                    onClick={async () => {
                      await saveActivity(selectedZone, detail.task, detail.taskDetail);
                      setToast("已完成，并保存到历史记录");
                      window.setTimeout(() => setToast(""), 1800);
                    }}
                  >{completedZones.includes(selectedZone) ? "今天已完成" : detail.action}</button>
                </article>
                <div className="memory-note"><span>🧠</span><p><b>MKR 会记住这次决定</b><br/>下周给建议时，会同时参考这次记录和过去几周的变化。</p></div>
              </div>

              <aside className="history-panel">
                <div className="history-title"><div><span>经营记忆</span><b>过去记录</b></div><button onClick={() => setScreen("history")}>查看全部</button></div>
                {saved.map((record) => (
                  <div className="history-row new-record" key={record.id}>
                    <span className="history-date">刚刚</span><div><b>{record.title}</b><p>{record.detail}</p></div><strong>已保存</strong>
                  </div>
                ))}
                {detail.history.map((row) => (
                  <div className="history-row" key={row.date}>
                    <span className="history-date">{row.date}</span><div><b>{row.title}</b><p>{row.detail}</p></div><strong>{row.value}</strong>
                  </div>
                ))}
              </aside>
            </div>
          </section>
        );
      })()}

      {screen === "stock" && (
        <section className="mission-screen">
          <button className="back" onClick={() => setScreen("map")}>← 返回餐厅</button>
          <div className="mission-head">
            <div className="mission-number">关卡 1 / 4</div>
            <div className="mission-title">
              <span className="mission-icon">📦</span>
              <div><h1>补齐周末库存</h1><p>MKR 根据最近用量和周末客流，找到了 4 样可能不够的东西。</p></div>
            </div>
            <div className="mission-time">⏱ 约 2 分钟</div>
          </div>

          <div className="mission-layout">
            <div className="stock-list">
              <div className="list-heading"><span>选择要购买的物品</span><small>点一下即可加入或移除</small></div>
              {items.map((item) => (
                <article className={`stock-item ${item.selected ? "selected" : ""}`} key={item.id}>
                  <button
                    className="check"
                    aria-label={`${item.selected ? "移除" : "加入"} ${item.name}`}
                    onClick={() => setItems((current) => current.map((row) => row.id === item.id ? { ...row, selected: !row.selected } : row))}
                  >{item.selected ? "✓" : ""}</button>
                  <span className="food-icon">{item.icon}</span>
                  <div className="food-copy">
                    <div><b>{item.name}</b>{item.urgent && <span className="urgent">优先</span>}</div>
                    <p>{item.detail} · ${item.price.toFixed(2)}/{item.unit}</p>
                  </div>
                  <div className="stepper">
                    <button onClick={() => updateQty(item.id, -1)}>−</button>
                    <b>{item.qty}<small>{item.unit}</small></b>
                    <button onClick={() => updateQty(item.id, 1)}>＋</button>
                  </div>
                </article>
              ))}
              <div className="ai-note"><span>✨</span><p><b>为什么是这些数量？</b><br/>按过去四周的平均用量，加上周末预计 12% 的客流增长计算。</p></div>
              <div className="inline-history">
                <div className="history-title"><div><span>系统参考了什么</span><b>过去 4 周采购记录</b></div><button onClick={() => setScreen("history")}>全部记录</button></div>
                {stockHistory.map((row) => (
                  <div className="history-row" key={row.date}>
                    <span className="history-date">{row.date}</span><div><b>{row.title}</b><p>{row.detail}</p></div><strong>{row.value}</strong>
                  </div>
                ))}
              </div>
            </div>

            <aside className="order-card">
              <div className="supplier">
                <span className="supplier-logo">F</span>
                <div><small>供应商</small><b>FreshPro Foods</b></div>
                <span className="trusted">常用</span>
              </div>
              <div className="order-lines">
                {chosen.map((item) => <div key={item.id}><span>{item.icon} {item.name}<small>{item.qty}{item.unit}</small></span><b>${(item.price * item.qty).toFixed(2)}</b></div>)}
              </div>
              <div className="order-total"><span>预计订单金额<small>含预估 GST</small></span><strong>${total.toFixed(2)}</strong></div>
              <button className="confirm" disabled={!chosen.length} onClick={async () => {
                await saveActivity("stock", "生成 FreshPro 采购订单", chosen.map((item) => `${item.name} ${item.qty}${item.unit}`).join(" · "), Math.round(total * 100));
                setScreen("done");
              }}>
                确认并生成订单 <span>→</span>
              </button>
              <p className="safe-note">🔒 这是 Demo，不会真的向供应商下单</p>
            </aside>
          </div>
        </section>
      )}

      {screen === "history" && (
        <section className="mission-screen">
          <button className="back" onClick={() => setScreen("map")}>← 返回餐厅</button>
          <div className="history-page-head">
            <div><span className="eyebrow">RESTAURANT MEMORY</span><h1>这家餐厅做过的事，都在这里</h1><p>采购、备货、营业、收货、排班和老板周报按时间留下记录，下一次建议会参考以前的数据。</p></div>
            <div className="memory-count"><strong>{32 + records.length}</strong><span>本月经营记录</span></div>
          </div>
          <div className="history-filter">
            {zones.map((zone) => <button key={zone.id} onClick={() => openZone(zone.id)}>{zone.icon} {zone.name}</button>)}
          </div>
          <div className="timeline">
            {records.map((record) => (
              <article className="timeline-row new-record" key={record.id}>
                <span className="timeline-icon">{zones.find((zone) => zone.id === record.zone)?.icon || "✓"}</span>
                <div><small>刚刚 · {zones.find((zone) => zone.id === record.zone)?.name}</small><b>{record.title}</b><p>{record.detail}</p></div>
                <strong>{record.amountCents ? `$${(record.amountCents / 100).toFixed(2)}` : "已完成"}</strong>
              </article>
            ))}
            {[
              { icon:"🚚", date:"7月29日 · 收货口", title:"FreshPro 送货验收", detail:"6 项到齐 · 冷藏 3.1°C · Lily 签收", value:"$486.00" },
              { icon:"📦", date:"7月28日 · 仓库", title:"生成每周采购订单", detail:"鸡肉 18kg · 米 15kg · 食用油 2桶", value:"$387.40" },
              { icon:"👥", date:"7月27日 · 员工区", title:"本周排班发布", detail:"39 个班次 · 220 小时 · 12 名员工", value:"已完成" },
              { icon:"🍳", date:"7月26日 · 后厨", title:"周六备货完成", detail:"14 项 · 剩余鸡肉 1.2kg · 浪费 $86", value:"$628.00" },
              { icon:"📈", date:"7月26日 · 老板办公室", title:"每周经营总结", detail:"营业额 $23,108 · 采购 $7,186 · 17 个任务", value:"+3.2%" },
              { icon:"🧾", date:"7月25日 · 前台", title:"营业日结", detail:"131 单 · 平均客单价 $27.32", value:"$3,579" },
            ].map((row) => (
              <article className="timeline-row" key={row.date}>
                <span className="timeline-icon">{row.icon}</span><div><small>{row.date}</small><b>{row.title}</b><p>{row.detail}</p></div><strong>{row.value}</strong>
              </article>
            ))}
          </div>
        </section>
      )}

      {screen === "done" && (
        <section className="done-screen">
          <div className="confetti c1">●</div><div className="confetti c2">◆</div><div className="confetti c3">▲</div><div className="confetti c4">●</div>
          <div className="done-badge"><span>✓</span></div>
          <span className="eyebrow">关卡完成</span>
          <h1>周末库存，搞定了！</h1>
          <p>订单草稿已经按供应商整理好。现实版本中，你可以直接发送给 FreshPro Foods。</p>
          <div className="impact">
            <div><span>⏱</span><b>约省 18 分钟</b><small>不用手动核对库存</small></div>
            <div><span>🛡️</span><b>降低缺货风险</b><small>鸡肉预计可用到下周二</small></div>
            <div><span>💰</span><b>${total.toFixed(2)}</b><small>本次订单预计金额</small></div>
          </div>
          <div className="next-mission"><span>下一关</span><b>🍳 确认明天的备货量</b><small>约 1 分钟</small></div>
          <div className="done-actions">
            <button className="secondary" onClick={() => setScreen("map")}>回到餐厅地图</button>
            <button className="primary" onClick={() => { setSelectedZone("kitchen"); setScreen("zone"); }}>继续下一关 →</button>
          </div>
        </section>
      )}
    </main>
  );
}
