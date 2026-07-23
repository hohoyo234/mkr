/* ===== ภาษาไทย dictionary =====
   Core daily-use UI (nav, roles, dashboard, stock, deliveries, training,
   roster). Anything not listed falls back to the English source. First-pass
   translation — have a native speaker review before production. */
(function(){
  if(!window.MKR || !MKR.i18n) return;
  const T = {
    // roles & nav
    "👑 Owner":"👑 เจ้าของร้าน", "📋 Manager":"📋 ผู้จัดการ", "🧑‍🍳 Staff":"🧑‍🍳 พนักงาน",
    "Owner":"เจ้าของร้าน", "Manager":"ผู้จัดการ", "Staff":"พนักงาน",
    "Today":"วันนี้", "Stock & costs":"สต๊อก & ต้นทุน", "Deliveries":"รับของ",
    "Training & SOP":"อบรม & SOP", "My training":"การอบรมของฉัน", "Rostering":"จัดกะ",
    "Training":"อบรม", "Stock":"สต๊อก", "Delivery":"รับของ", "Roster":"ตารางกะ",
    "Purchases":"การซื้อ", "Suppliers":"ซัพพลายเออร์", "Forecast":"พยากรณ์",
    "🚨 Alerts":"🚨 การแจ้งเตือน", "Settings":"ตั้งค่า", "Team":"ทีม",
    // dashboard tiles
    "On now":"กำลังเข้ากะ", "Rostered today":"มีกะวันนี้", "Clocked in":"ลงเวลาแล้ว",
    "Tasks done":"งานเสร็จ", "Stock value":"มูลค่าสต๊อก", "Low or expiring":"ใกล้หมด/ใกล้หมดอายุ",
    "Deliveries waiting":"รอยืนยันการรับของ", "Training outstanding":"อบรมค้างอยู่",
    "Wants a decision":"ต้องให้ตัดสินใจ", "On today":"วันนี้", "Roster warnings":"คำเตือนตารางกะ",
    "Today's checklist":"เช็กลิสต์วันนี้", "This week's roster":"ตารางกะสัปดาห์นี้",
    "Nothing needs you right now":"ตอนนี้ยังไม่มีอะไรต้องจัดการ",
    "Nothing outstanding. Go and run your restaurant.":"ไม่มีงานค้าง ไปดูแลร้านของคุณได้เลย",
    // stock
    "📦 Stock":"📦 สต๊อก", "🧾 Purchases":"🧾 การซื้อ", "🚚 Suppliers":"🚚 ซัพพลายเออร์", "📈 Forecast":"📈 พยากรณ์",
    "📦 Total stock value":"📦 มูลค่าสต๊อกรวม", "Total stock value":"มูลค่าสต๊อกรวม",
    "🥬 Perishable":"🥬 ของสด", "🥢 Non-perishable":"🥢 ของไม่เน่าเสีย",
    "Perishable":"ของสด", "Non-perishable":"ของไม่เน่าเสีย",
    "⚠️ Needs attention":"⚠️ ต้องดูแล", "Needs attention":"ต้องดูแล",
    "Item":"รายการ", "Qty":"จำนวน", "Unit":"หน่วย", "Unit price":"ราคาต่อหน่วย", "Amount":"จำนวนเงิน",
    "Price trend":"แนวโน้มราคา", "Supplier":"ซัพพลายเออร์", "Quantity on hand":"จำนวนคงเหลือ",
    "Reorder at":"สั่งซื้อเมื่อเหลือ", "Usual supplier":"ซัพพลายเออร์ประจำ", "Low":"ใกล้หมด", "Near expiry":"ใกล้หมดอายุ",
    "Stocktake":"เช็กสต๊อก", "🔢 Stocktake":"🔢 เช็กสต๊อก", "＋ Add item":"＋ เพิ่มรายการ", "Add stock item":"เพิ่มรายการสต๊อก",
    "Goes off — has a shelf life":"เน่าเสียได้ — มีอายุการเก็บ",
    "Doesn't go off — tools & consumables":"ไม่เน่าเสีย — อุปกรณ์ & ของใช้สิ้นเปลือง",
    // deliveries
    "🕒 Waiting to confirm":"🕒 รอยืนยัน", "✅ Confirmed":"✅ ยืนยันแล้ว", "⚠️ With problems":"⚠️ มีปัญหา",
    // training
    "📘 SOPs":"📘 SOP", "📝 Outstanding":"📝 ค้างอยู่", "⏰ Overdue":"⏰ เกินกำหนด",
    "📘 SOP library":"📘 คลัง SOP", "👥 Training status":"👥 สถานะการอบรม", "📝 Assigned training":"📝 การอบรมที่มอบหมาย",
    "📝 To do":"📝 ต้องทำ", "✅ Completed":"✅ เสร็จแล้ว",
    "SOP library":"คลัง SOP", "Assigned training":"การอบรมที่มอบหมาย", "To do":"ต้องทำ", "Completed":"เสร็จแล้ว", "Overdue":"เกินกำหนด",
    // roster
    "👥 People rostered":"👥 จำนวนคนจัดกะ", "📅 Shifts":"📅 กะ", "⏱️ Total hours":"⏱️ ชั่วโมงรวม", "⚠️ Warnings":"⚠️ คำเตือน",
    "Shifts":"กะ", "Total hours":"ชั่วโมงรวม", "Warnings":"คำเตือน", "Nobody rostered today":"วันนี้ยังไม่มีใครจัดกะ",
    // login / preview / settings
    "👀 Preview without an account":"👀 ดูตัวอย่างโดยไม่ต้องมีบัญชี", "Exit preview →":"ออกจากตัวอย่าง →", "Opening…":"กำลังเปิด…",
    "Language":"ภาษา", "System language":"ภาษาระบบ",
    "This app tracks your own operations only. It doesn't calculate pay, interpret awards, or talk to any government system.":
      "แอปนี้บันทึกเฉพาะการดำเนินงานของร้านคุณเท่านั้น ไม่คำนวณค่าจ้าง ไม่ตีความ award และไม่เชื่อมต่อกับระบบราชการใด ๆ",
  };
  MKR.i18n.register('th', { T: T, P: [] });
})();
