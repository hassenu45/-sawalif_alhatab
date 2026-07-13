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

function errorMsg(err) {
    return '🚨 <b>خطأ في السيرفر!</b>\n\n' + String(err);
}

function adminLoginMsg(ip) {
    return '🔐 <b>دخول لوحة الإدارة</b>\n\n' + '📡 IP: ' + (ip || 'غير معروف');
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

module.exports = { sendMessage, getUpdates, setChatId, getChatId, orderMsg, errorMsg, adminLoginMsg, priceUpdateMsg, orderDeletedMsg, stockUpdateMsg, serverStartMsg };
