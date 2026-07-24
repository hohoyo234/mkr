/* ===== 한국어 dictionary =====
   Core daily-use UI (nav, roles, dashboard, stock, deliveries, training,
   roster). Anything not listed falls back to the English source. First-pass
   translation — have a native speaker review before production. */
(function(){
  if(!window.MKR || !MKR.i18n) return;
  const T = {
    // roles & nav
    "👑 Owner":"👑 사장님", "📋 Manager":"📋 매니저", "🧑‍🍳 Staff":"🧑‍🍳 직원",
    "Owner":"사장님", "Manager":"매니저", "Staff":"직원",
    "Today":"오늘", "Stock & costs":"재고 & 비용", "Deliveries":"입고",
    "Training & SOP":"교육 & SOP", "My training":"내 교육", "Rostering":"근무 배정",
    "Training":"교육", "Stock":"재고", "Delivery":"입고", "Roster":"근무표",
    "Purchases":"구매", "Suppliers":"거래처", "Forecast":"예측",
    "🚨 Alerts":"🚨 알림", "Settings":"설정", "Team":"팀",
    // dashboard tiles
    "On now":"근무 중", "Rostered today":"오늘 근무", "Clocked in":"출근함",
    "Tasks done":"완료한 업무", "Stock value":"재고 금액", "Low or expiring":"부족/유통기한 임박",
    "Deliveries waiting":"확인 대기 입고", "Training outstanding":"미완료 교육",
    "Wants a decision":"결정 필요", "On today":"오늘 근무", "Roster warnings":"근무표 경고",
    "Today's checklist":"오늘 체크리스트", "This week's roster":"이번 주 근무표",
    "Nothing needs you right now":"지금은 처리할 일이 없습니다",
    "Nothing outstanding. Go and run your restaurant.":"남은 일이 없습니다. 가게 운영에 집중하세요.",
    // stock
    "📦 Stock":"📦 재고", "🧾 Purchases":"🧾 구매", "🚚 Suppliers":"🚚 거래처", "📈 Forecast":"📈 예측",
    "📦 Total stock value":"📦 총 재고 금액", "Total stock value":"총 재고 금액",
    "🥬 Perishable":"🥬 신선품", "🥢 Non-perishable":"🥢 비신선품",
    "Perishable":"신선품", "Non-perishable":"비신선품",
    "⚠️ Needs attention":"⚠️ 확인 필요", "Needs attention":"확인 필요",
    "Item":"품목", "Qty":"수량", "Unit":"단위", "Unit price":"단가", "Amount":"금액",
    "Price trend":"가격 추세", "Supplier":"거래처", "Quantity on hand":"현재 수량",
    "Reorder at":"재주문 기준", "Usual supplier":"주 거래처", "Low":"부족", "Near expiry":"유통기한 임박",
    "Stocktake":"재고 실사", "🔢 Stocktake":"🔢 재고 실사", "＋ Add item":"＋ 품목 추가", "Add stock item":"재고 품목 추가",
    "Goes off — has a shelf life":"상함 — 유통기한 있음",
    "Doesn't go off — tools & consumables":"안 상함 — 도구 & 소모품",
    // deliveries
    "🕒 Waiting to confirm":"🕒 확인 대기", "✅ Confirmed":"✅ 확인됨", "⚠️ With problems":"⚠️ 문제 있음",
    // training
    "📘 SOPs":"📘 SOP", "📝 Outstanding":"📝 미완료", "⏰ Overdue":"⏰ 기한 초과",
    "📘 SOP library":"📘 SOP 라이브러리", "👥 Training status":"👥 교육 현황", "📝 Assigned training":"📝 배정된 교육",
    "📝 To do":"📝 할 일", "✅ Completed":"✅ 완료",
    "SOP library":"SOP 라이브러리", "Assigned training":"배정된 교육", "To do":"할 일", "Completed":"완료", "Overdue":"기한 초과",
    // roster
    "👥 People rostered":"👥 배정 인원", "📅 Shifts":"📅 근무", "⏱️ Total hours":"⏱️ 총 근무시간", "⚠️ Warnings":"⚠️ 경고",
    "Shifts":"근무", "Total hours":"총 근무시간", "Warnings":"경고", "Nobody rostered today":"오늘 배정된 사람이 없습니다",
    // login / preview / settings
    "👀 Preview without an account":"👀 계정 없이 미리보기", "Exit preview →":"미리보기 종료 →", "Opening…":"여는 중…",
    "Language":"언어", "System language":"시스템 언어",
    "This app tracks your own operations only. It doesn't calculate pay, interpret awards, or talk to any government system.":
      "이 앱은 매장 자체 운영만 기록합니다. 급여를 계산하거나 award를 해석하거나 정부 시스템과 연동하지 않습니다.",
    // simplified "Today" home
    "Needs you now":"지금 확인 필요", "Deliveries to confirm":"확인할 입고", "Check them at the back door":"뒷문에서 확인하세요",
    "Stock running low":"재고 부족", "Training overdue":"교육 기한 초과", "Waiting to be signed off":"서명 대기 중",
    "Roster is short today":"오늘 인원 부족", "Fewer people on than you planned":"계획보다 인원이 적음",
    "Unread alerts":"읽지 않은 알림", "Tap to review":"눌러서 확인",
    "Everything else is running fine":"나머지는 모두 정상", "This week":"이번 주",
    "No shift today":"오늘 근무 없음", "Enjoy your day off.":"즐거운 휴무 되세요.", "Just today this week.":"이번 주는 오늘 하루뿐입니다.",
    "No shifts rostered this week":"이번 주 배정된 근무 없음", "Clock in":"출근 체크", "Clocked in":"출근함", "Drop":"근무 넘기기",
    "rostered":"배정", "shifts":"근무", "total":"합계", "warnings":"경고", "all clear":"모두 정상",
    "stock value":"재고 금액", "perishable":"신선품", "non-perishable":"비신선품", "needs attention":"확인 필요",
    "purchases":"구매 건수", "spent · 30d":"지출 · 30일", "suppliers":"거래처",
    "waiting":"확인 대기", "confirmed":"확인됨", "problems":"문제",
    "SOPs":"SOP", "outstanding":"미완료", "overdue":"기한 초과",
    "Stocktake":"재고 실사", "Export CSV":"CSV 내보내기", "Add item":"품목 추가", "Record purchase":"구매 기록",
    "Add line":"줄 추가", "Add supplier":"거래처 추가", "Ask AI":"AI에게 묻기", "New delivery":"새 입고",
    "Assign training":"교육 배정", "New SOP":"새 SOP", "Preferences":"환경설정", "Export":"내보내기", "AI auto-roster":"AI 자동 배정",
  };
  MKR.i18n.register('ko', { T: T, P: [] });
})();
