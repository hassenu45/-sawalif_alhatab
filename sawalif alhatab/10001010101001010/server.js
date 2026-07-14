'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const tg = require('./telegram');
const ai = require('./ai');
const chatbot = require('./chatbot');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT_DB = {
    prices: { shay: 1.5, dhrah: { '\u0643\u0628\u064a\u0631': 3.0, '\u0648\u0633\u0637': 2.0 }, bushar: { '\u0643\u0628\u064a\u0631': 4.0, '\u0648\u0633\u0637': 3.0 } },
    stock: { shay: true, dhrah: { '\u0643\u0628\u064a\u0631': true, '\u0648\u0633\u0637': true }, bushar: { '\u0643\u0628\u064a\u0631': true, '\u0648\u0633\u0637': true } },
    orders: [], complaints: [], dailyStats: {}, telegramChatId: ''
};

let db = loadDB();
let writeTimer = null;
if (process.env.TELEGRAM_CHAT_ID) {
    db.telegramChatId = String(process.env.TELEGRAM_CHAT_ID);
    persist();
}
if (db.telegramChatId) tg.setChatId(db.telegramChatId);

function loadDB() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
            if (!parsed.prices) parsed.prices = DEFAULT_DB.prices;
            if (!parsed.stock) parsed.stock = DEFAULT_DB.stock;
            if (!parsed.orders) parsed.orders = [];
            if (!parsed.complaints) parsed.complaints = [];
            if (!parsed.dailyStats) parsed.dailyStats = {};
            return parsed;
        }
    } catch (e) { console.error('DB load error:', e.message); }
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
        } catch (e) { console.error('DB save error:', e.message); }
    }, 200);
}

function uid() {
    return crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + crypto.randomBytes(8).toString('hex'));
}

const MIME = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.mp4': 'video/mp4', '.svg': 'image/svg+xml',
    '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon'
};

function sendJSON(res, status, obj) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(obj));
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', c => { data += c; if (data.length > 5e6) req.destroy(); });
        req.on('end', () => { if (!data) return resolve({}); try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
        req.on('error', reject);
    });
}

function serveStatic(req, res, filePath) {
    fs.stat(filePath, (err, stat) => {
        if (!err && stat.isFile()) {
            res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
            fs.createReadStream(filePath).pipe(res);
            return;
        }
        const indexFile = path.join(ROOT, 'index.html');
        if (fs.existsSync(indexFile)) { res.writeHead(200, { 'Content-Type': MIME['.html'] }); fs.createReadStream(indexFile).pipe(res); }
        else { res.writeHead(404); res.end('Not found'); }
    });
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;
    try {
        if (pathname.startsWith('/api/')) {
            if (pathname === '/api/health' && req.method === 'GET') return sendJSON(res, 200, { ok: true });
            if (pathname === '/api/products' && req.method === 'GET') return sendJSON(res, 200, { prices: db.prices, stock: db.stock });
            if (pathname === '/api/products' && req.method === 'PUT') {
                const body = await readBody(req);
                if (body.prices) db.prices = body.prices;
                if (body.stock) db.stock = body.stock;
                persist();
                tg.sendMessage(tg.priceUpdateMsg('admin', db.prices)).catch(() => {});
                return sendJSON(res, 200, { prices: db.prices, stock: db.stock });
            }
            if (pathname === '/api/orders' && req.method === 'POST') {
                const body = await readBody(req);
                if (!body.name || !body.phone || !Array.isArray(body.items) || !body.items.length) return sendJSON(res, 400, { error: 'bad data' });
                for (const it of body.items) {
                    let available = true;
                    if (it.product === 'shay') available = db.stock.shay;
                    else if (it.product === 'dhrah' || it.product === 'bushar') available = db.stock[it.product][it.size || '\u0643\u0628\u064a\u0631'];
                    if (!available) return sendJSON(res, 400, { error: 'out of stock: ' + (it.text || it.product) });
                }
                const order = { id: uid(), date: new Date().toISOString(), name: String(body.name), phone: String(body.phone), address: String(body.address || ''), location: String(body.location || ''), items: body.items };
                db.orders.push(order);
                const today = new Date().toISOString().slice(0, 10);
                if (!db.dailyStats[today]) db.dailyStats[today] = { visitors: 0, orders: 0, items: {} };
                db.dailyStats[today].orders++;
                for (const it of order.items) { const k = it.text || 'other'; db.dailyStats[today].items[k] = (db.dailyStats[today].items[k] || 0) + 1; }
                persist();
                tg.sendMessage(tg.orderMsg(order)).catch(() => {});
                return sendJSON(res, 200, { ok: true, id: order.id });
            }
            if (pathname === '/api/orders' && req.method === 'GET') return sendJSON(res, 200, { orders: db.orders });
            if (pathname === '/api/complaints' && req.method === 'POST') {
                const body = await readBody(req);
                if (!body.name || !body.message) return sendJSON(res, 400, { error: 'name and message required' });
                const complaint = { id: uid(), date: new Date().toISOString(), name: String(body.name), phone: String(body.phone || ''), message: String(body.message) };
                db.complaints.push(complaint);
                persist();
                tg.sendMessage(tg.complaintMsg(complaint)).catch(() => {});
                return sendJSON(res, 200, { ok: true });
            }
            if (pathname === '/api/visit' && req.method === 'POST') {
                const today = new Date().toISOString().slice(0, 10);
                if (!db.dailyStats[today]) db.dailyStats[today] = { visitors: 0, orders: 0, items: {} };
                db.dailyStats[today].visitors++;
                persist();
                return sendJSON(res, 200, { ok: true });
            }
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
        if (req.method === 'GET' || req.method === 'HEAD') {
            let rel = decodeURIComponent(pathname);
            if (rel === '/') rel = '/login.html';
            const filePath = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[\/\\])+/, ''));
            if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
            return serveStatic(req, res, filePath);
        }
        res.writeHead(405); res.end('Method not allowed');
    } catch (e) { console.error('Server error:', e); sendJSON(res, 500, { error: 'server error' }); }
});

server.listen(PORT, () => {
    console.log('server running on http://localhost:' + PORT);
    if (process.env.TELEGRAM_BOT_TOKEN) {
        tg.deleteWebhook().then(() => tg.clearUpdates()).catch(() => {});
        tg.sendMessage(tg.serverStartMsg(PORT)).catch(() => {});
        startTelegramPolling();
    } else {
        console.log('[TG] No TELEGRAM_BOT_TOKEN - bot disabled');
    }
    chatbot.start().catch(() => {});
});

function isOwner(chatId) { return String(chatId) === String(db.telegramChatId); }

function smartMatch(text, keywords) { return keywords.some(k => text.includes(k)); }

async function handleTgCommand(chatId, text) {
    const isOwn = isOwner(chatId);
    const t = text.replace(/[\/#!]/g, '').trim();

    // Arabic commands:
    if (t === 'start' || t === 'ابدأ' || t === 'ربط') {
        if (db.telegramChatId && String(chatId) !== db.telegramChatId &&
            String(chatId) !== (process.env.TELEGRAM_CHAT_ID || '')) {
            tg.sendMessage('\u274C \u0627\u0644\u0628\u0648\u062A \u0645\u0631\u062A\u0628\u0637 \u0628\u062D\u0633\u0627\u0628 \u0622\u062E\u0631.').catch(() => {});
            return;
        }
        tg.setChatId(chatId);
        tg.sendMessage('\u2705 \u0645\u0631\u062D\u0628\u0627! \u0627\u0644\u0622\u0646 \u0623\u0631\u0633\u0644 \u0623\u064A \u0634\u064A \u0648\u0627\u0644\u0628\u0648\u062A \u0633\u0648\u0641 \u064A\u0631\u062F \u2714\ufe0f').catch(() => {});
        db.telegramChatId = String(chatId);
        persist();
        return;
    }

    if (!isOwn) {
        tg.sendMessage('\uD83D\uDCE8 \u062a\u0645 \u0627\u0644\u0627\u0633\u062a\u0644\u0627\u0645 \u2714\ufe0f').catch(() => {});
        return;
    }

    // ===== Owner only below =====
    if (t === 'اليوم' || t === 'today' || smartMatch(t, ['احصائيات اليوم', 'كم طلب', 'شو صار', 'كم واحد'])) {
        const today = new Date().toISOString().slice(0, 10);
        tg.sendMessage(tg.todayStatsMsg(db.dailyStats[today])).catch(() => {});
        return;
    }
    if (t === 'تقرير' || t === 'report' || smartMatch(t, ['تقرير اسبوع', 'اخر اسبوع', 'الاسبوع'])) {
        tg.sendMessage(tg.reportMsg(db)).catch(() => {});
        return;
    }
    if (t === 'شكاوى' || t === 'شكوى' || t === 'complaints' || smartMatch(t, ['الشكاوى', 'الرسايل', 'رسايل'])) {
        tg.sendMessage(tg.complaintsListMsg(db.complaints)).catch(() => {});
        return;
    }
    if (t === 'عام' || t === 'stats' || t === 'كل' || smartMatch(t, ['احصائيات عامة', 'كل شي', 'كل البيانات'])) {
        const totalOrders = db.orders.length;
        const totalComplaints = db.complaints.length;
        const totalVisitors = Object.values(db.dailyStats).reduce((s, d) => s + (d.visitors || 0), 0);
        const totalRevenue = db.orders.reduce((s, o) => s + (o.items || []).reduce((ss, i) => ss + (i.price || 0), 0), 0);
        tg.sendMessage(tg.statsGeneralMsg(totalVisitors, totalOrders, totalRevenue, totalComplaints)).catch(() => {});
        return;
    }
    if (t === 'طلبات' || t === 'orders' || smartMatch(t, ['الطلبات', 'اوردرات', 'اخر الطلبات'])) {
        tg.sendMessage(tg.ordersListMsg(db.orders)).catch(() => {});
        return;
    }
    if (t === 'أسعار' || t === 'اسعار' || t === 'prices' || smartMatch(t, ['الأسعار', 'الاسعار', 'كم السعر'])) {
        tg.sendMessage(tg.pricesMsg(db.prices)).catch(() => {});
        return;
    }
    if (t === 'مخزون' || t === 'stock' || smartMatch(t, ['التوفر', 'المخزون', 'موجود', 'متوفر'])) {
        tg.sendMessage(tg.stockMsg(db.stock)).catch(() => {});
        return;
    }

    // Smart setprice: سعر شاي 2.0 or /سعر شاي 2.0
    if ((t.startsWith('سعر') || t.startsWith('سعر ') || t.startsWith('setprice')) && t.split(' ').length >= 3) {
        const parts = t.replace('سعر الشاي', 'shay').replace('سعر الذرة', 'dhrah').replace('سعر البوشار', 'bushar')
            .replace('سعر', '').trim().split(' ');
        let item = parts[0], val;
        if (item === 'شاي' || item === 'shay') {
            val = parseFloat(parts[1] || parts[0]);
            if (!isNaN(val)) { db.prices.shay = val; persist(); tg.sendMessage('\u2705 \u0634\u0627\u064a = ' + val + ' \u062f.\u0623').catch(() => {}); }
            else tg.sendMessage('\u274c \u0633\u0639\u0631 \u063a\u064a\u0631 \u0635\u062d\u064a\u062d').catch(() => {});
        } else if ((item === 'dhrah' || item === 'ذرة') && parts.length >= 2) {
            val = parseFloat(parts[1] || parts[2]);
            const key = parts[1] === 'كبير' || parts[1] === 'وسط' ? parts[1] : '\u0643\u0628\u064a\u0631';
            if (!isNaN(val)) { db.prices.dhrah[key] = val; persist(); tg.sendMessage('\u2705 \u0630\u0631\u0629 ' + key + ' = ' + val + ' \u062f.\u0623').catch(() => {}); }
            else tg.sendMessage('\u274c \u0633\u0639\u0631 \u063a\u064a\u0631 \u0635\u062d\u064a\u062d').catch(() => {});
        } else if ((item === 'bushar' || item === 'بوشار') && parts.length >= 2) {
            const key = parts[1] === 'كبير' || parts[1] === 'وسط' ? parts[1] : '\u0643\u0628\u064a\u0631';
            val = parseFloat(parts[2] || parts[1]);
            if (!isNaN(val)) { db.prices.bushar[key] = val; persist(); tg.sendMessage('\u2705 \u0628\u0648\u0634\u0627\u0631 ' + key + ' = ' + val + ' \u062f.\u0623').catch(() => {}); }
            else tg.sendMessage('\u274c \u0633\u0639\u0631 \u063a\u064a\u0631 \u0635\u062d\u064a\u062d').catch(() => {});
        } else tg.sendMessage('\u274c \u062c\u0631\u0628: \u0633\u0639\u0631 \u0634\u0627\u064a 2.0').catch(() => {});
        return;
    }

    // Smart setstock: وقف شاي or شغل ذرة كبير or /توفر شاي مقفول
    if (smartMatch(t, ['وقف ', 'شغل ', 'قفل ', 'فتح ', 'افتح ', 'setstock'])) {
        const parts = t.split(' ');
        const isOn = smartMatch(t, ['شغل', 'فتح', 'افتح', 'on']);
        const item = parts.find(p => ['شاي', 'shay', 'ذرة', 'dhrah', 'بوشار', 'bushar'].includes(p));
        const size = parts.find(p => ['كبير', 'وسط', 'big', 'small'].includes(p));
        let ok = false;
        if (item === 'شاي' || item === 'shay') { db.stock.shay = isOn; ok = true; }
        else if (item === 'ذرة' || item === 'dhrah') {
            const k = size || '\u0643\u0628\u064a\u0631';
            if (db.stock.dhrah[k] !== undefined) { db.stock.dhrah[k] = isOn; ok = true; }
        }
        else if (item === 'بوشار' || item === 'bushar') {
            const k = size || '\u0643\u0628\u064a\u0631';
            if (db.stock.bushar[k] !== undefined) { db.stock.bushar[k] = isOn; ok = true; }
        }
        if (ok) { persist(); tg.sendMessage('\u2705 \u062a\u0645 ' + (isOn ? '\u062a\u0634\u063a\u064a\u0644' : '\u0625\u064a\u0642\u0627\u0641') + ' \u0627\u0644\u0645\u0646\u062a\u062c').catch(() => {}); }
        else tg.sendMessage('\u274c \u0645\u0627 \u0641\u0647\u0645\u062a. \u062c\u0631\u0628: \u0648\u0642\u0641 \u0634\u0627\u064a').catch(() => {});
        return;
    }

    // حذف طلب: /حذف id or حذف الطلب id or delete id
    if (t.startsWith('حذف') || t.startsWith('delete')) {
        const parts = t.split(' ');
        const id = parts[parts.length - 1];
        const before = db.orders.length;
        db.orders = db.orders.filter(o => o.id !== id);
        if (db.orders.length < before) { persist(); tg.sendMessage('\u2705 \u062a\u0645 \u062d\u0630\u0641 \u0627\u0644\u0637\u0644\u0628').catch(() => {}); }
        else tg.sendMessage('\u274c \u0627\u0644\u0637\u0644\u0628 \u063a\u064a\u0631 \u0645\u0648\u062c\u0648\u062f').catch(() => {});
        return;
    }

    if (t === 'مساعدة' || t === 'help' || t === 'الأوامر' || t === 'اوامر' || smartMatch(t, ['شو تكتب', 'مساعده'])) {
        tg.sendMessage(tg.helpMsg()).catch(() => {});
        return;
    }

    // ===== Owner sends anything else = AI response =====
    const today = new Date().toISOString().slice(0, 10);
    const ts = db.dailyStats[today];
    const totalOrders = db.orders.length;
    const totalRevenue = db.orders.reduce((s, o) => s + (o.items || []).reduce((ss, i) => ss + (i.price || 0), 0), 0);
    const totalVisitors = Object.values(db.dailyStats).reduce((s, d) => s + (d.visitors || 0), 0);
    const context = {
        todayStats: ts || { visitors: 0, orders: 0, items: {} },
        totalVisitors,
        totalOrders,
        totalRevenue,
        prices: db.prices,
        stock: db.stock,
        recentOrders: db.orders.slice(-3).reverse(),
        recentComplaints: db.complaints.slice(-3).reverse()
    };
    tg.sendMessage('\u23F3 \u062C\u0627\u0631 \u0627\u0644\u062A\u0641\u0643\u064A\u0631...').catch(() => {});
    let reply = null;
    try { reply = await ai.ask(text, context); } catch (e) {}
    tg.sendMessage(reply || '\u274C \u062E\u0637\u0623 \u0641\u064A \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064A. \u062A\u0623\u0643\u062F \u0645\u0646 \u0645\u0641\u062A\u0627\u062D GROQ_API_KEY').catch(() => {});
}

let tgOffset = 0;
let tgRunning = false;
async function startTelegramPolling() {
    if (tgRunning) return;
    tgRunning = true;
    try {
        const data = await tg.getUpdates(tgOffset);
        for (const update of (data.result || [])) {
            tgOffset = update.update_id + 1;
            const msg = update.message || update.channel_post;
            if (!msg || !msg.text) continue;
            handleTgCommand(msg.chat.id, msg.text.trim()).catch(() => {});
        }
    } catch (e) { console.error('[TG] polling error:', e.message); }
    setTimeout(startTelegramPolling, 3000);
}
