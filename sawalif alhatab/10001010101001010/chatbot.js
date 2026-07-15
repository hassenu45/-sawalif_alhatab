'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');
const ai = require('./ai');

const BOT_TOKEN = process.env.CLIENT_BOT_TOKEN || '';
const DB_FILE = path.join(__dirname, 'data', 'db.json');

let offset = 0;
let running = false;

function loadDB() {
    try {
        if (fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {}
    return { prices: { shay: 1.5, dhrah: { كبير: 3.0, وسط: 2.0 }, bushar: { كبير: 4.0, وسط: 3.0 } }, stock: { shay: true, dhrah: { كبير: true, وسط: true }, bushar: { كبير: true, وسط: true } }, orders: [], complaints: [], ratings: [], dailyStats: {} };
}

function sendMsg(chatId, text) {
    if (!BOT_TOKEN) return Promise.resolve();
    return new Promise(resolve => {
        const payload = JSON.stringify({ chat_id: chatId, text: String(text), parse_mode: 'HTML' });
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
        req.on('error', () => resolve({}));
        req.write(payload);
        req.end();
    });
}

function deleteWebhook() {
    if (!BOT_TOKEN) return Promise.resolve();
    return new Promise(resolve => {
        https.get({ hostname: 'api.telegram.org', path: '/bot' + BOT_TOKEN + '/deleteWebhook?drop_pending_updates=true' }, res => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { resolve({}); } });
        }).on('error', () => resolve({}));
    });
}

function getUpdates() {
    if (!BOT_TOKEN) return Promise.resolve({ result: [] });
    return new Promise(resolve => {
        https.get({ hostname: 'api.telegram.org', path: '/bot' + BOT_TOKEN + '/getUpdates?offset=' + offset + '&timeout=5&allowed_updates=%5B%22message%22%5D' }, res => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { resolve({ result: [] }); } });
        }).on('error', () => resolve({ result: [] }));
    });
}

async function start() {
    if (!BOT_TOKEN) { console.log('[CBot] No CLIENT_BOT_TOKEN set, skipping'); return; }
    await deleteWebhook();
    console.log('[CBot] Started as management bot');
    poll();
}

function menuText(p) {
    return '☕ شاي على الحطب: ' + p.shay + ' د.أ\n🌽 ذرة كبير: ' + p.dhrah.كبير + ' | وسط: ' + p.dhrah.وسط + ' د.أ\n🍿 بوشار كبير: ' + p.bushar.كبير + ' | وسط: ' + p.bushar.وسط + ' د.أ';
}

function stockText(s) {
    const ok = v => v ? '✅ متوفر' : '❌ غير متوفر';
    return '☕ شاي: ' + ok(s.shay) + '\n🌽 ذرة كبير: ' + ok(s.dhrah.كبير) + ' | وسط: ' + ok(s.dhrah.وسط) + '\n🍿 بوشار كبير: ' + ok(s.bushar.كبير) + ' | وسط: ' + ok(s.bushar.وسط);
}

async function poll() {
    try {
        const data = await getUpdates();
        for (const update of (data.result || [])) {
            offset = update.update_id + 1;
            const msg = update.message || update.channel_post;
            if (!msg || !msg.text) continue;
            const text = msg.text.trim();
            const chatId = msg.chat.id;
            const db = loadDB();
            const p = db.prices, s = db.stock;

            if (text === '/start' || text === 'ابدأ' || text === 'help' || text === 'مساعدة') {
                await sendMsg(chatId, '🎛 <b>بوت إدارة سوالف على الحطب</b>\n\n/price - الأسعار\n/stock - المخزون\n/stats - الإحصائيات\n/setprice منتج سعر - تعديل السعر\n/setstock منتج on/off - تعديل التوفر\nأو اسأل أي سؤال للمساعد الذكي');
                continue;
            }
            if (text === '/price' || text === 'price' || text === 'الأسعار' || text === 'القائمة' || text === 'المنيو') {
                await sendMsg(chatId, '📋 الأسعار:\n' + menuText(p));
                continue;
            }
            if (text === '/stock' || text === 'stock' || text === 'المخزون' || text === 'التوفر') {
                await sendMsg(chatId, '📦 المخزون:\n' + stockText(s));
                continue;
            }
            if (text === '/stats' || text === 'stats' || text === 'إحصائيات' || text === 'احصائيات') {
                const today = new Date().toISOString().slice(0, 10);
                const ts = db.dailyStats[today] || { visitors: 0, orders: 0 };
                const totalV = Object.values(db.dailyStats).reduce((a, d) => a + (d.visitors || 0), 0);
                const avg = db.ratings.length ? (db.ratings.reduce((a, r) => a + r.score, 0) / db.ratings.length).toFixed(1) : 0;
                await sendMsg(chatId, '📊 الإحصائيات:\n👀 زوار: ' + totalV + '\n🛵 طلبات: ' + db.orders.length + '\n💬 شكاوي: ' + db.complaints.length + '\n⭐ تقييمات: ' + db.ratings.length + ' (معدل: ' + avg + '/5)\n📅 اليوم: زوار ' + ts.visitors + ' | طلبات ' + ts.orders);
                continue;
            }
            if (text.startsWith('/setprice') || text.startsWith('setprice') || text.startsWith('سعر') || text.startsWith('/سعر')) {
                const parts = text.replace('/', '').split(/\s+/);
                if (parts.length < 3) { await sendMsg(chatId, 'مثال: setprice shay 2.0'); continue; }
                const name = parts[1];
                const val = parseFloat(parts[parts.length - 1]);
                if (isNaN(val) || val <= 0) { await sendMsg(chatId, 'السعر غير صالح'); continue; }
                if (name === 'shay' || name === 'شاي') p.shay = val;
                else if (name === 'dhrah_k' || name === 'ذرة_ك' || name === 'ذرة كبير') p.dhrah.كبير = val;
                else if (name === 'dhrah_m' || name === 'ذرة_و' || name === 'ذرة وسط') p.dhrah.وسط = val;
                else if (name === 'bushar_k' || name === 'بوشار_ك' || name === 'بوشار كبير') p.bushar.كبير = val;
                else if (name === 'bushar_m' || name === 'بوشار_و' || name === 'بوشار وسط') p.bushar.وسط = val;
                else { await sendMsg(chatId, 'منتج غير معروف\nالمنتجات: shay, dhrah_k, dhrah_m, bushar_k, bushar_m'); continue; }
                try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); } catch (e) {}
                await sendMsg(chatId, '✅ تم تحديث السعر\n' + menuText(p));
                continue;
            }
            if (text.startsWith('/setstock') || text.startsWith('setstock') || text.startsWith('توفر') || text.startsWith('/توفر')) {
                const parts = text.replace('/', '').split(/\s+/);
                if (parts.length < 3) { await sendMsg(chatId, 'مثال: setstock shay on'); continue; }
                const name = parts[1];
                const val = parts[parts.length - 1] === 'on' || parts[parts.length - 1] === 'true' || parts[parts.length - 1] === 'متوفر';
                if (name === 'shay' || name === 'شاي') s.shay = val;
                else if (name === 'dhrah_k' || name === 'ذرة_ك') s.dhrah.كبير = val;
                else if (name === 'dhrah_m' || name === 'ذرة_و') s.dhrah.وسط = val;
                else if (name === 'bushar_k' || name === 'بوشار_ك') s.bushar.كبير = val;
                else if (name === 'bushar_m' || name === 'بوشار_و') s.bushar.وسط = val;
                else { await sendMsg(chatId, 'منتج غير معروف'); continue; }
                try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); } catch (e) {}
                await sendMsg(chatId, '✅ تم تحديث التوفر\n' + stockText(s));
                continue;
            }

            // AI fallback
            await sendMsg(chatId, '⏳ جار التفكير...');
            const ctx = { prices: p, stock: s, totalOrders: db.orders.length, totalComplaints: db.complaints.length, totalRatings: db.ratings.length };
            let reply = null;
            try { reply = await ai.ask(text, ctx); } catch (e) {}
            await sendMsg(chatId, reply || '❌ لم أتمكن من الرد حالياً');
        }
    } catch (e) { console.error('[CBot] error:', e.message); }
    setTimeout(poll, 3000);
}

module.exports = { start };
