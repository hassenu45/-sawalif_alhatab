'use strict';
const https = require('https');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
let CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

function sendMessage(text) {
    if (!BOT_TOKEN || !CHAT_ID) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' });
        const req = https.request({
            hostname: 'api.telegram.org',
            path: '/bot' + BOT_TOKEN + '/sendMessage',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        }, res => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { resolve({}); } });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

function getUpdates(offset) {
    if (!BOT_TOKEN) return Promise.resolve({ result: [] });
    return new Promise((resolve, reject) => {
        const path = '/bot' + BOT_TOKEN + '/getUpdates?offset=' + (offset || 0) + '&timeout=5';
        https.get({ hostname: 'api.telegram.org', path }, res => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { resolve({ result: [] }); } });
        }).on('error', reject);
    });
}

function setChatId(id) { CHAT_ID = String(id); }
function getChatId() { return CHAT_ID; }

// ===== Message Builders =====
function orderMsg(order) {
    let items = (order.items || []).map((i, n) =>
        '  ' + (n + 1) + '. ' + (i.text || '') + (i.note ? ' [' + i.note + ']' : '') + ' — ' + (i.price || 0) + ' د.أ'
    ).join('\n');
    let total = (order.items || []).reduce((s, i) => s + (i.price || 0), 0);
    return '🛒 <b>طلب جديد!</b>\n\n' +
        '👤 <b>الاسم:</b> ' + (order.name || '') + '\n' +
        '📞 <b>الهاتف:</b> ' + (order.phone || '') + '\n' +
        '📍 <b>العنوان:</b> ' + (order.address || '') + '\n' +
        (order.location ? '🗺️ <b>الموقع:</b> <a href="' + order.location + '">افتح على الخريطة</a>\n' : '') +
        '\n📦 <b>المنتجات:</b>\n' + items + '\n\n' +
        '💰 <b>الإجمالي:</b> ' + total + ' د.أ';
}

function complaintMsg(complaint) {
    return '📩 <b>شكاوى / رسالة من عميل!</b>\n\n' +
        '👤 <b>الاسم:</b> ' + (complaint.name || '') + '\n' +
        '📞 <b>الهاتف:</b> ' + (complaint.phone || 'غير متوفر') + '\n' +
        '💬 <b>الرسالة:</b>\n' + (complaint.message || '');
}

function todayStatsMsg(stats) {
    if (!stats) return '📊 <b>إحصائيات اليوم:</b>\n\nلا توجد بيانات بعد.';
    const items = stats.items || {};
    const sorted = Object.entries(items).sort((a, b) => b[1] - a[1]);
    const topItem = sorted.length > 0 ? sorted[0][0] : 'لا يوجد';
    const topCount = sorted.length > 0 ? sorted[0][1] : 0;
    let itemsList = sorted.map(([name, count], i) => '  ' + (i + 1) + '. ' + name + ' — ' + count + ' مرة').join('\n');
    return '📊 <b>إحصائيات اليوم:</b>\n\n' +
        '👀 <b>الزوار:</b> ' + (stats.visitors || 0) + '\n' +
        '🛒 <b>الطلبات:</b> ' + (stats.orders || 0) + '\n' +
        '🏆 <b>أكثر منتج طلب:</b> ' + topItem + ' (' + topCount + ' مرة)\n\n' +
        (itemsList ? '📋 <b>تفاصيل الطلبات:</b>\n' + itemsList : '');
}

function reportMsg(db) {
    const keys = Object.keys(db.dailyStats || {}).sort().reverse().slice(0, 7);
    if (keys.length === 0) return '📊 <b>التقرير:</b>\n\nلا توجد بيانات.';
    let report = '📊 <b>تقرير آخر ' + keys.length + ' أيام:</b>\n\n';
    let totalVisitors = 0, totalOrders = 0;
    keys.forEach(day => {
        const s = db.dailyStats[day];
        totalVisitors += s.visitors || 0;
        totalOrders += s.orders || 0;
        report += '📅 <b>' + day + '</b>\n';
        report += '  👀 زوار: ' + (s.visitors || 0) + ' | 🛒 طلبات: ' + (s.orders || 0) + '\n\n';
    });
    report += '━━━━━━━━━━━━━━━━\n';
    report += '📈 <b>الإجمالي:</b>\n';
    report += '  👀 زوار: ' + totalVisitors + '\n';
    report += '  🛒 طلبات: ' + totalOrders + '\n';
    return report;
}

function complaintsListMsg(complaints) {
    if (!complaints || complaints.length === 0) return '📩 <b>الشكاوى:</b>\n\nلا توجد شكاوى.';
    const recent = complaints.slice(-10).reverse();
    let msg = '📩 <b>آخر ' + recent.length + ' شكاوى:</b>\n\n';
    recent.forEach((c, i) => {
        msg += (i + 1) + '. <b>' + c.name + '</b>';
        if (c.phone) msg += ' — 📞 ' + c.phone;
        msg += '\n  💬 ' + c.message + '\n  📅 ' + new Date(c.date).toLocaleString('ar-EG') + '\n\n';
    });
    return msg;
}

function errorMsg(err) {
    return '🚨 <b>خطأ في السيرفر!</b>\n\n' + String(err);
}

function priceUpdateMsg(admin, prices) {
    return '💰 <b>تحديث الأسعار</b>\n\n' +
        '👤 بواسطة: ' + (admin || 'مجهول') + '\n' +
        '📊 الأسعار الجديدة:\n' +
        JSON.stringify(prices, null, 2);
}

function orderDeletedMsg(id) {
    return '🗑️ <b>حذف طلب</b>\n\n' + '📋 رقم الطلب: ' + id;
}

function stockUpdateMsg(item, size, available) {
    return '📦 <b>تحديث التوفر</b>\n\n' +
        '🏷️ المنتج: ' + item + (size ? ' (' + size + ')' : '') + '\n' +
        '📊 الحالة: ' + (available ? '✅ متوفر' : '❌ غير متوفر');
}

function serverStartMsg(port) {
    return '🔥 <b>السيرفر شغّال!</b>\n\n' + '🌐 المنفذ: ' + port;
}

function statsGeneralMsg(visitors, orders, revenue, complaints) {
    return '📊 <b>إحصائيات عامة:</b>\n\n' +
        '👀 إجمالي الزوار: ' + visitors + '\n' +
        '🛒 إجمالي الطلبات: ' + orders + '\n' +
        '💰 إجمالي الإيرادات: ' + revenue + ' د.أ\n' +
        '📩 إجمالي الشكاوى: ' + complaints;
}

function ordersListMsg(orders) {
    const recent = orders.slice(-5).reverse();
    if (recent.length === 0) return '📦 لا توجد طلبات بعد.';
    let msg = '📦 <b>آخر 5 طلبات:</b>\n\n';
    recent.forEach((o, i) => {
        msg += (i + 1) + '. ' + o.name + ' — ' + o.phone + ' (' + (o.items || []).length + ' منتجات)\n';
    });
    return msg;
}

function pricesMsg(prices) {
    return '💰 <b>الأسعار الحالية:</b>\n\n' +
        '☕ شاي: ' + prices.shay + ' د.أ\n' +
        '🌽 ذرة كبير: ' + (prices.dhrah['\u0643\u0628\u064a\u0631'] || 0) + ' | وسط: ' + (prices.dhrah['\u0648\u0633\u0637'] || 0) + ' د.أ\n' +
        '🍿 بوشار كبير: ' + (prices.bushar['\u0643\u0628\u064a\u0631'] || 0) + ' | وسط: ' + (prices.bushar['\u0648\u0633\u0637'] || 0) + ' د.أ\n' +
        '\n💡 /setprice shay 2.0';
}

function stockMsg(stock) {
    const mark = v => v ? '✅' : '❌';
    return '📦 <b>توفر المنتجات:</b>\n\n' +
        '☕ شاي: ' + mark(stock.shay) + '\n' +
        '🌽 ذرة كبير: ' + mark(stock.dhrah['\u0643\u0628\u064a\u0631']) + ' | وسط: ' + mark(stock.dhrah['\u0648\u0633\u0637']) + '\n' +
        '🍿 بوشار كبير: ' + mark(stock.bushar['\u0643\u0628\u064a\u0631']) + ' | وسط: ' + mark(stock.bushar['\u0648\u0633\u0637']) + '\n' +
        '\n💡 /setstock shay off';
}

function helpMsg() {
    return '🤖 <b>أوامر البوت:</b>\n\n' +
        '/start — ربط المحادثة\n\n' +
        '📊 <b>الإحصائيات:</b>\n' +
        '/today — إحصائيات اليوم\n' +
        '/report — تقرير آخر أسبوع\n' +
        '/stats — إحصائيات عامة\n' +
        '/orders — آخر الطلبات\n\n' +
        '⚙️ <b>الإعدادات:</b>\n' +
        '/prices — عرض الأسعار\n' +
        '/setprice — تعديل السعر\n' +
        '/stock — توفر المنتجات\n' +
        '/setstock — تعديل التوفر\n' +
        '/delete — حذف طلب\n\n' +
        '📩 <b>العملاء:</b>\n' +
        '/complaints — الشكاوى والرسائل';
}

module.exports = {
    sendMessage, getUpdates, setChatId, getChatId,
    orderMsg, complaintMsg, todayStatsMsg, reportMsg, complaintsListMsg, statsGeneralMsg,
    ordersListMsg, pricesMsg, stockMsg, helpMsg,
    errorMsg, priceUpdateMsg, orderDeletedMsg, stockUpdateMsg, serverStartMsg
};
