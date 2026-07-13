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
    prices: { shay: 1.5, dhrah: { '\u0643\u0628\u064a\u0631': 3.0, '\u0648\u0633\u0637': 2.0 }, bushar: { '\u0643\u0628\u064a\u0631': 4.0, '\u0648\u0633\u0637': 3.0 } },
    stock: { shay: true, dhrah: { '\u0643\u0628\u064a\u0631': true, '\u0648\u0633\u0637': true }, bushar: { '\u0643\u0628\u064a\u0631': true, '\u0648\u0633\u0637': true } },
    orders: [], complaints: [], dailyStats: {}, telegramChatId: ''
};

let db = loadDB();
let writeTimer = null;
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
    tg.sendMessage(tg.serverStartMsg(PORT)).catch(() => {});
    startTelegramPolling();
});

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
            const username = from.username || '';

            if (text === '/start' || text === '/id') {
                tg.setChatId(chatId);
                tg.sendMessage('\u2705 Done! ID: <code>' + chatId + '</code>').catch(() => {});
                db.telegramChatId = String(chatId);
                persist();
            } else if (text === '/today') {
                const today = new Date().toISOString().slice(0, 10);
                tg.sendMessage(tg.todayStatsMsg(db.dailyStats[today])).catch(() => {});
            } else if (text === '/report') {
                tg.sendMessage(tg.reportMsg(db)).catch(() => {});
            } else if (text === '/complaints') {
                tg.sendMessage(tg.complaintsListMsg(db.complaints)).catch(() => {});
            } else if (text === '/stats') {
                const totalOrders = db.orders.length;
                const totalComplaints = db.complaints.length;
                const totalVisitors = Object.values(db.dailyStats).reduce((s, d) => s + (d.visitors || 0), 0);
                const totalRevenue = db.orders.reduce((s, o) => s + (o.items || []).reduce((ss, i) => ss + (i.price || 0), 0), 0);
                tg.sendMessage(tg.statsGeneralMsg(totalVisitors, totalOrders, totalRevenue, totalComplaints)).catch(() => {});
            } else if (text === '/orders') {
                tg.sendMessage(tg.ordersListMsg(db.orders)).catch(() => {});
            } else if (text === '/prices') {
                tg.sendMessage(tg.pricesMsg(db.prices)).catch(() => {});
            } else if (text.startsWith('/setprice ')) {
                const parts = text.split(' ');
                const item = parts[1];
                if (item === 'shay' && parts.length >= 3) {
                    const val = parseFloat(parts[2]);
                    if (!isNaN(val)) { db.prices.shay = val; persist(); tg.sendMessage('\u2705 shay = ' + val).catch(() => {}); }
                    else tg.sendMessage('\u274c bad price').catch(() => {});
                } else if ((item === 'dhrah' || item === 'bushar') && parts.length >= 4) {
                    const key = parts[2], val = parseFloat(parts[3]);
                    if (!isNaN(val)) { db.prices[item][key] = val; persist(); tg.sendMessage('\u2705 ' + item + ' ' + key + ' = ' + val).catch(() => {}); }
                    else tg.sendMessage('\u274c bad price').catch(() => {});
                } else tg.sendMessage('\u274c usage: /setprice shay 2.0\n/setprice dhrah \u0643\u0628\u064a\u0631 3.5').catch(() => {});
            } else if (text === '/stock') {
                tg.sendMessage(tg.stockMsg(db.stock)).catch(() => {});
            } else if (text.startsWith('/setstock ')) {
                const parts = text.split(' ');
                if (parts.length < 4) { tg.sendMessage('\u274c usage: /setstock item size on|off').catch(() => {}); }
                else {
                    const item = parts[1], size = parts[2], val = (parts[3] === 'on');
                    let ok = false;
                    if (item === 'shay') { db.stock.shay = val; ok = true; }
                    else if ((item === 'dhrah' || item === 'bushar') && db.stock[item][size] !== undefined) { db.stock[item][size] = val; ok = true; }
                    if (ok) { persist(); tg.sendMessage('\u2705 ' + item + ' ' + (size || '') + ' = ' + (val ? 'available' : 'unavailable')).catch(() => {}); }
                    else tg.sendMessage('\u274c unknown product').catch(() => {});
                }
            } else if (text.startsWith('/delete ')) {
                const id = text.split(' ')[1];
                const before = db.orders.length;
                db.orders = db.orders.filter(o => o.id !== id);
                if (db.orders.length < before) { persist(); tg.sendMessage('\u2705 deleted').catch(() => {}); }
                else tg.sendMessage('\u274c not found').catch(() => {});
            } else if (text === '/help') {
                tg.sendMessage(tg.helpMsg()).catch(() => {});
            }
        }
    } catch (e) { /* ignore */ }
    setTimeout(startTelegramPolling, 3000);
}
