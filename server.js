'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const tg = require('./telegram');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT_DB = {
    prices: {
        shay: 1.5,
        dhrah: { 'كبير': 3.0, 'وسط': 2.0 },
        bushar: { 'كبير': 4.0, 'وسط': 3.0 }
    },
    stock: {
        shay: true,
        dhrah: { 'كبير': true, 'وسط': true },
        bushar: { 'كبير': true, 'وسط': true }
    },
    orders: [],
    telegramChatId: ''
};

let db = loadDB();
let writeTimer = null;

// Restore telegram chat_id from DB
if (db.telegramChatId) tg.setChatId(db.telegramChatId);

function loadDB() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
            if (!parsed.prices) parsed.prices = DEFAULT_DB.prices;
            if (!parsed.orders) parsed.orders = [];
            return parsed;
        }
    } catch (e) {
        console.error('DB load error:', e.message);
    }
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2));
    return JSON.parse(JSON.stringify(DEFAULT_DB));
}

function persist() {
    clearTimeout(writeTimer);
    writeTimer = setTimeout(() => {
        try {
            if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
            fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
        } catch (e) {
            console.error('DB save error:', e.message);
        }
    }, 200);
}

function uid() {
    return crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + crypto.randomBytes(8).toString('hex'));
}

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.mp4': 'video/mp4',
    '.svg': 'image/svg+xml',
    '.webmanifest': 'application/manifest+json',
    '.ico': 'image/x-icon'
};

function sendJSON(res, status, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', c => { data += c; if (data.length > 5e6) req.destroy(); });
        req.on('end', () => {
            if (!data) return resolve({});
            try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
        });
        req.on('error', reject);
    });
}

function serveStatic(req, res, filePath) {
    fs.stat(filePath, (err, stat) => {
        if (!err && stat.isFile()) {
            res.writeHead(200, {
                'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
                'Cache-Control': 'no-cache'
            });
            fs.createReadStream(filePath).pipe(res);
            return;
        }
        // SPA-ish fallback to index.html for unknown GET routes
        const indexFile = path.join(ROOT, 'index.html');
        if (fs.existsSync(indexFile)) {
            res.writeHead(200, { 'Content-Type': MIME['.html'] });
            fs.createReadStream(indexFile).pipe(res);
        } else {
            res.writeHead(404); res.end('Not found');
        }
    });
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;

    try {
        // ---- API ----
        if (pathname.startsWith('/api/')) {
            if (pathname === '/api/health' && req.method === 'GET') {
                return sendJSON(res, 200, { ok: true });
            }

            // Public products
            if (pathname === '/api/products' && req.method === 'GET') {
                return sendJSON(res, 200, { prices: db.prices, stock: db.stock });
            }

            // Update prices (admin via Telegram bot only)
            if (pathname === '/api/products' && req.method === 'PUT') {
                const body = await readBody(req);
                if (body.prices) db.prices = body.prices;
                if (body.stock) db.stock = body.stock;
                persist();
                tg.sendMessage(tg.priceUpdateMsg('admin', db.prices)).catch(() => {});
                return sendJSON(res, 200, { prices: db.prices, stock: db.stock });
            }

            // Create order (public)
            if (pathname === '/api/orders' && req.method === 'POST') {
                const body = await readBody(req);
                if (!body.name || !body.phone || !Array.isArray(body.items) || !body.items.length) {
                    return sendJSON(res, 400, { error: 'بيانات الطلب ناقصة' });
                }
                // Validate stock
                for (const it of body.items) {
                    const product = it.product;
                    const size = it.size;
                    let available = true;
                    if (product === 'shay') available = db.stock.shay;
                    else if (product === 'dhrah' || product === 'bushar') available = db.stock[product][size || 'كبير'];
                    if (!available) {
                        return sendJSON(res, 400, { error: 'المنتج غير متوفر حالياً: ' + (it.text || product) });
                    }
                }
                const order = {
                    id: uid(),
                    date: new Date().toISOString(),
                    name: String(body.name),
                    phone: String(body.phone),
                    address: String(body.address || ''),
                    location: String(body.location || ''),
                    items: body.items
                };
                db.orders.push(order);
                persist();
                tg.sendMessage(tg.orderMsg(order)).catch(() => {});
                return sendJSON(res, 200, { ok: true, id: order.id });
            }

            // List orders (public - for customer to see their own)
            if (pathname === '/api/orders' && req.method === 'GET') {
                return sendJSON(res, 200, { orders: db.orders });
            }

            // Delete order (admin via Telegram bot only)
            const delMatch = pathname.match(/^\/api\/orders\/([^/]+)$/);
            if (delMatch && req.method === 'DELETE') {
                const id = delMatch[1];
                db.orders = db.orders.filter(o => o.id !== id);
                persist();
                tg.sendMessage(tg.orderDeletedMsg(id)).catch(() => {});
                return sendJSON(res, 200, { ok: true });
            }

            return sendJSON(res, 404, { error: 'not found' });
        }

        // ---- Static files ----
        if (req.method === 'GET' || req.method === 'HEAD') {
            let rel = decodeURIComponent(pathname);
            if (rel === '/') rel = '/login.html';
            const filePath = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[\/\\])+/, ''));
            if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
            return serveStatic(req, res, filePath);
        }

        res.writeHead(405); res.end('Method not allowed');
    } catch (e) {
        console.error('Server error:', e);
        sendJSON(res, 500, { error: 'server error' });
    }
});

server.listen(PORT, () => {
    console.log('🔥 سوالف على الحطب — server running on http://localhost:' + PORT);
    tg.sendMessage(tg.serverStartMsg(PORT)).catch(() => {});
    startTelegramPolling();
});

// ===== Telegram Bot Polling =====
let tgOffset = 0;
async function startTelegramPolling() {
    if (!process.env.TELEGRAM_BOT_TOKEN) return;
    try {
        const data = await tg.getUpdates(tgOffset);
        for (const update of (data.result || [])) {
            tgOffset = update.update_id + 1;
            const msg = update.message || update.channel_post;
            if (!msg || !msg.text) continue;
            const chatId = msg.chat.id;
            const text = msg.text.trim();
            const from = msg.from || {};
            const firstName = from.first_name || '';
            const lastName = from.last_name || '';
            const username = from.username || '';

            if (text === '/start' || text === '/id') {
                tg.setChatId(chatId);
                tg.sendMessage('✅ تم الربط!\n\n聊天 ID: <code>' + chatId + '</code>\nالمستخدم: @' + (username || firstName)).catch(() => {});
                db.telegramChatId = String(chatId);
                persist();
            } else if (text === '/stats') {
                const totalOrders = db.orders.length;
                const today = new Date().toISOString().slice(0, 10);
                const todayOrders = db.orders.filter(o => o.date && o.date.startsWith(today)).length;
                const totalRevenue = db.orders.reduce((s, o) => s + (o.items || []).reduce((ss, i) => ss + (i.price || 0), 0), 0);
                tg.sendMessage('📊 <b>إحصائيات الموقع</b>\n\n📦 إجمالي الطلبات: ' + totalOrders + '\n📅 طلبات اليوم: ' + todayOrders + '\n💰 إجمالي الإيرادات: ' + totalRevenue + ' د.أ').catch(() => {});
            } else if (text === '/orders') {
                const recent = db.orders.slice(-5).reverse();
                if (recent.length === 0) {
                    tg.sendMessage('📦 لا توجد طلبات بعد.').catch(() => {});
                } else {
                    let msg2 = '📦 <b>آخر 5 طلبات:</b>\n\n';
                    recent.forEach((o, i) => {
                        msg2 += (i + 1) + '. ' + o.name + ' — ' + o.phone + ' (' + (o.items || []).length + ' منتجات)\n';
                    });
                    tg.sendMessage(msg2).catch(() => {});
                }
            } else if (text === '/prices') {
                const p = db.prices;
                let msg3 = '💰 <b>الأسعار الحالية:</b>\n\n';
                msg3 += '☕ شاي: ' + p.shay + ' د.أ\n';
                msg3 += '🌽 ذرة كبير: ' + (p.dhrah['كبير'] || 0) + ' | وسط: ' + (p.dhrah['وسط'] || 0) + ' د.أ\n';
                msg3 += '🍿 بوشار كبير: ' + (p.bushar['كبير'] || 0) + ' | وسط: ' + (p.bushar['وسط'] || 0) + ' د.أ\n';
                msg3 += '\n💡 للتعديل أرسل:\n/setprice shay 2.0\n/setprice dhrah كبير 3.5';
                tg.sendMessage(msg3).catch(() => {});
            } else if (text.startsWith('/setprice ')) {
                const parts = text.split(' ');
                if (parts.length < 3) {
                    tg.sendMessage('❌ الصيغة: /setprice [item] [size] [price]\nمثال: /setprice shay 2.0\nأو: /setprice dhrah كبير 3.5').catch(() => {});
                } else {
                    const item = parts[1];
                    let key, val;
                    if (item === 'shay') {
                        val = parseFloat(parts[2]);
                        if (isNaN(val)) { tg.sendMessage('❌ سعر غير صحيح').catch(() => {}); }
                        else { db.prices.shay = val; persist(); tg.sendMessage('✅ تم تحديث سعر الشاي إلى ' + val + ' د.أ').catch(() => {}); }
                    } else if ((item === 'dhrah' || item === 'bushar') && parts.length >= 4) {
                        key = parts[2];
                        val = parseFloat(parts[3]);
                        if (isNaN(val)) { tg.sendMessage('❌ سعر غير صحيح').catch(() => {}); }
                        else { db.prices[item][key] = val; persist(); tg.sendMessage('✅ تم تحديث سعر ' + item + ' (' + key + ') إلى ' + val + ' د.أ').catch(() => {}); }
                    } else {
                        tg.sendMessage('❌ الصيغة:\n/setprice shay 2.0\n/setprice dhrah كبير 3.5\n/setprice bushar وسط 2.5').catch(() => {});
                    }
                }
            } else if (text.startsWith('/delete ')) {
                const id = text.split(' ')[1];
                const before = db.orders.length;
                db.orders = db.orders.filter(o => o.id !== id);
                if (db.orders.length < before) {
                    persist();
                    tg.sendMessage('✅ تم حذف الطلب: ' + id).catch(() => {});
                } else {
                    tg.sendMessage('❌ الطلب غير موجود.').catch(() => {});
                }
            } else if (text === '/stock') {
                const s = db.stock;
                const mark = v => v ? '✅ متوفر' : '❌ غير متوفر';
                let msg4 = '📦 <b>توفر المنتجات:</b>\n\n';
                msg4 += '☕ شاي حطب: ' + mark(s.shay) + '\n';
                msg4 += '🌽 ذرة كبير: ' + mark(s.dhrah['كبير']) + '\n';
                msg4 += '🌽 ذرة وسط: ' + mark(s.dhrah['وسط']) + '\n';
                msg4 += '🍿 بوشار كبير: ' + mark(s.bushar['كبير']) + '\n';
                msg4 += '🍿 بوشار وسط: ' + mark(s.bushar['وسط']) + '\n';
                msg4 += '\n💡 للتعديل أرسل:\n/setstock shay off\n/setstock dhrah كبير on';
                tg.sendMessage(msg4).catch(() => {});
            } else if (text.startsWith('/setstock ')) {
                const parts = text.split(' ');
                if (parts.length < 4) {
                    tg.sendMessage('❌ الصيغة: /setstock [item] [size] [on|off]\nمثال: /setstock shay off\n/setstock dhrah كبير on').catch(() => {});
                } else {
                    const item = parts[1];
                    const size = parts[2];
                    const state = parts[3];
                    const val = (state === 'on' || state === '1' || state === 'true');
                    let ok = false;
                    if (item === 'shay') { db.stock.shay = val; ok = true; }
                    else if ((item === 'dhrah' || item === 'bushar') && db.stock[item][size] !== undefined) { db.stock[item][size] = val; ok = true; }
                    if (ok) {
                        persist();
                        tg.sendMessage('✅ تم تحديث التوفر: ' + item + (size ? ' (' + size + ')' : '') + ' — ' + (val ? 'متوفر ✅' : 'غير متوفر ❌')).catch(() => {});
                    } else {
                        tg.sendMessage('❌ منتج غير معروف. استخدم: shay / dhrah / bushar').catch(() => {});
                    }
                }
            } else if (text === '/help') {
                tg.sendMessage('🤖 <b>أوامر البوت:</b>\n\n/start — ربط المحادثة\n/stats — إحصائيات الموقع\n/orders — آخر الطلبات\n/prices — عرض الأسعار\n/setprice — تعديل السعر\n/stock — توفر المنتجات\n/setstock — تعديل التوفر\n/delete — حذف طلب\n/help — هذه القائمة').catch(() => {});
            }
        }
    } catch (e) { /* ignore */ }
    setTimeout(startTelegramPolling, 3000);
}
