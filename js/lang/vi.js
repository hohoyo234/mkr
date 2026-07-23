/* ===== Tiếng Việt dictionary =====
   Core daily-use UI (nav, roles, dashboard, stock, deliveries, training,
   roster). Anything not listed falls back to the English source. First-pass
   translation — have a native speaker review before production. */
(function(){
  if(!window.MKR || !MKR.i18n) return;
  const T = {
    // roles & nav
    "👑 Owner":"👑 Chủ quán", "📋 Manager":"📋 Quản lý", "🧑‍🍳 Staff":"🧑‍🍳 Nhân viên",
    "Owner":"Chủ quán", "Manager":"Quản lý", "Staff":"Nhân viên",
    "Today":"Hôm nay", "Stock & costs":"Kho & chi phí", "Deliveries":"Giao hàng",
    "Training & SOP":"Đào tạo & SOP", "My training":"Đào tạo của tôi", "Rostering":"Xếp ca",
    "Training":"Đào tạo", "Stock":"Kho", "Delivery":"Giao hàng", "Roster":"Lịch ca",
    "Purchases":"Mua hàng", "Suppliers":"Nhà cung cấp", "Forecast":"Dự báo",
    "🚨 Alerts":"🚨 Cảnh báo", "Settings":"Cài đặt", "Team":"Đội ngũ",
    // dashboard tiles
    "On now":"Đang làm", "Rostered today":"Có ca hôm nay", "Clocked in":"Đã chấm công",
    "Tasks done":"Việc đã xong", "Stock value":"Giá trị kho", "Low or expiring":"Sắp hết / sắp hết hạn",
    "Deliveries waiting":"Giao hàng chờ xác nhận", "Training outstanding":"Đào tạo chưa xong",
    "Wants a decision":"Cần bạn quyết định", "On today":"Hôm nay", "Roster warnings":"Cảnh báo lịch ca",
    "Today's checklist":"Danh sách việc hôm nay", "This week's roster":"Lịch ca tuần này",
    "Nothing needs you right now":"Hiện chưa có việc cần bạn",
    "Nothing outstanding. Go and run your restaurant.":"Không còn việc tồn. Cứ lo việc quán của bạn.",
    // stock
    "📦 Stock":"📦 Kho", "🧾 Purchases":"🧾 Mua hàng", "🚚 Suppliers":"🚚 Nhà cung cấp", "📈 Forecast":"📈 Dự báo",
    "📦 Total stock value":"📦 Tổng giá trị kho", "Total stock value":"Tổng giá trị kho",
    "🥬 Perishable":"🥬 Dễ hư", "🥢 Non-perishable":"🥢 Không hư",
    "Perishable":"Dễ hư", "Non-perishable":"Không hư",
    "⚠️ Needs attention":"⚠️ Cần chú ý", "Needs attention":"Cần chú ý",
    "Item":"Mặt hàng", "Qty":"SL", "Unit":"Đơn vị", "Unit price":"Đơn giá", "Amount":"Thành tiền",
    "Price trend":"Xu hướng giá", "Supplier":"Nhà cung cấp", "Quantity on hand":"Số lượng tồn",
    "Reorder at":"Đặt lại khi còn", "Usual supplier":"Nhà cung cấp quen", "Low":"Sắp hết", "Near expiry":"Sắp hết hạn",
    "Stocktake":"Kiểm kho", "🔢 Stocktake":"🔢 Kiểm kho", "＋ Add item":"＋ Thêm mặt hàng", "Add stock item":"Thêm mặt hàng kho",
    "Goes off — has a shelf life":"Sẽ hư — có hạn sử dụng",
    "Doesn't go off — tools & consumables":"Không hư — dụng cụ & vật tư",
    // deliveries
    "🕒 Waiting to confirm":"🕒 Chờ xác nhận", "✅ Confirmed":"✅ Đã xác nhận", "⚠️ With problems":"⚠️ Có vấn đề",
    // training
    "📘 SOPs":"📘 SOP", "📝 Outstanding":"📝 Chưa xong", "⏰ Overdue":"⏰ Quá hạn",
    "📘 SOP library":"📘 Thư viện SOP", "👥 Training status":"👥 Tình trạng đào tạo", "📝 Assigned training":"📝 Đào tạo đã giao",
    "📝 To do":"📝 Cần làm", "✅ Completed":"✅ Hoàn thành",
    "SOP library":"Thư viện SOP", "Assigned training":"Đào tạo đã giao", "To do":"Cần làm", "Completed":"Hoàn thành", "Overdue":"Quá hạn",
    // roster
    "👥 People rostered":"👥 Số người xếp ca", "📅 Shifts":"📅 Ca", "⏱️ Total hours":"⏱️ Tổng giờ", "⚠️ Warnings":"⚠️ Cảnh báo",
    "Shifts":"Ca", "Total hours":"Tổng giờ", "Warnings":"Cảnh báo", "Nobody rostered today":"Hôm nay chưa xếp ai",
    // login / preview / settings
    "👀 Preview without an account":"👀 Xem thử không cần tài khoản", "Exit preview →":"Thoát xem thử →", "Opening…":"Đang mở…",
    "Language":"Ngôn ngữ", "System language":"Ngôn ngữ hệ thống",
    "This app tracks your own operations only. It doesn't calculate pay, interpret awards, or talk to any government system.":
      "Ứng dụng này chỉ theo dõi hoạt động của riêng bạn. Nó không tính lương, không diễn giải award, và không kết nối với bất kỳ hệ thống chính phủ nào.",
    // simplified "Today" home
    "Needs you now":"Cần bạn ngay", "Deliveries to confirm":"Giao hàng cần xác nhận", "Check them at the back door":"Kiểm tại cửa sau",
    "Stock running low":"Kho sắp hết", "Training overdue":"Đào tạo quá hạn", "Waiting to be signed off":"Chờ ký xác nhận",
    "Roster is short today":"Hôm nay thiếu người", "Fewer people on than you planned":"Ít người hơn dự kiến",
    "Unread alerts":"Cảnh báo chưa đọc", "Tap to review":"Chạm để xem",
    "Everything else is running fine":"Mọi thứ khác đều ổn", "This week":"Tuần này",
    "No shift today":"Hôm nay không có ca", "Enjoy your day off.":"Chúc bạn ngày nghỉ vui vẻ.", "Just today this week.":"Tuần này chỉ có hôm nay.",
    "No shifts rostered this week":"Tuần này chưa xếp ca", "Clock in":"Chấm công", "Clocked in":"Đã chấm công", "Drop":"Nhường ca",
    "rostered":"đã xếp", "shifts":"ca", "total":"tổng", "warnings":"cảnh báo", "all clear":"đều ổn",
    "stock value":"giá trị kho", "perishable":"dễ hư", "non-perishable":"không hư", "needs attention":"cần chú ý",
    "purchases":"lần mua", "spent · 30d":"chi · 30 ngày", "suppliers":"nhà cung cấp",
    "waiting":"chờ xác nhận", "confirmed":"đã xác nhận", "problems":"có vấn đề",
    "SOPs":"SOP", "outstanding":"chưa xong", "overdue":"quá hạn",
  };
  MKR.i18n.register('vi', { T: T, P: [] });
})();
