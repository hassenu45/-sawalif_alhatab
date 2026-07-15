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
    prices: { shay: 1.5, dhrah: { كبير: 3.0, وسط: 2.0 }, bushar: { كبير: 4.0, وسط: 3.0 } },
    stock: { shay: true, dhrah: { كبير: true, وسط: true }, bushar: { كبير: true, وسط: true } },
    orders: [], complaints: [], ratings: [], dailyStats: {}, telegramChatId: ''
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
            if (!parsed.ratings) parsed.ratings = [];
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

// ===================== HTTP Server =====================
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
                tg.sendMessage('✅ تم تحديث الأسعار/المخزون').catch(() => {});
                return sendJSON(res, 200, { prices: db.prices, stock: db.stock });
            }
            if (pathname === '/api/orders' && req.method === 'POST') {
                const body = await readBody(req);
                if (!body.name || !body.phone || !Array.isArray(body.items) || !body.items.length) return sendJSON(res, 400, { error: 'bad data' });
                for (const it of body.items) {
                    let available = true;
                    if (it.product === 'shay') available = db.stock.shay;
                    else if (it.product === 'dhrah' || it.product === 'bushar') available = db.stock[it.product][it.size || 'كبير'];
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
            if (pathname === '/api/ratings' && req.method === 'POST') {
                const body = await readBody(req);
                const score = Number(body.score);
                if (!score || score < 1 || score > 5) return sendJSON(res, 400, { error: 'rating 1-5 required' });
                const rating = { id: uid(), date: new Date().toISOString(), name: String(body.name || 'زبون'), score, review: String(body.review || '') };
                db.ratings.push(rating);
                persist();
                tg.sendMessage(tg.ratingMsg(rating)).catch(() => {});
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
                tg.sendMessage('🗑 تم حذف الطلب: ' + id).catch(() => {});
                return sendJSON(res, 200, { ok: true });
            }
            if (pathname === '/api/android-update' && req.method === 'GET') {
                const apk = findLatestApk();
                if (!apk) return sendJSON(res, 404, { error: 'no apk' });
                const ver = getAndroidVersion();
                const stat = fs.statSync(apk);
                const base = process.env.WEBSITE_DOMAIN ? 'https://' + process.env.WEBSITE_DOMAIN : '';
                return sendJSON(res, 200, {
                    versionCode: ver.versionCode,
                    versionName: ver.versionName,
                    downloadUrl: base + '/api/android-apk',
                    size: stat.size,
                    updatedAt: new Date(stat.mtimeMs).toISOString()
                });
            }
            if (pathname === '/api/android-apk' && req.method === 'GET') {
                const apk = findLatestApk();
                if (!apk) { res.writeHead(404); return res.end('not found'); }
                res.writeHead(200, {
                    'Content-Type': 'application/vnd.android.package-archive',
                    'Content-Disposition': 'attachment; filename="app-release.apk"',
                    'Content-Length': fs.statSync(apk).size
                });
                fs.createReadStream(apk).pipe(res);
                return;
            }
            if (pathname === '/api/ai' && req.method === 'POST') {
                const body = await readBody(req);
                if (!body.question) return sendJSON(res, 400, { error: 'question required' });
                const ctx = buildContext();
                const reply = await ai.ask(body.question, ctx);
                if (!reply) return sendJSON(res, 500, { error: 'AI غير متاح حالياً' });
                return sendJSON(res, 200, { reply });
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
        tg.deleteWebhook()
            .then(() => tg.clearUpdates())
            .then(() => {
                tg.sendMessage(tg.serverStartMsg(PORT)).catch(() => {});
                startTelegramPolling();
            })
            .catch(() => {
                tg.sendMessage(tg.serverStartMsg(PORT)).catch(() => {});
                startTelegramPolling();
            });
    } else {
        console.log('[TG] No TELEGRAM_BOT_TOKEN - bot disabled');
    }
    // chatbot.start().catch(() => {}); // Disabled - AI is now manager-only via website
});

// ===================== Telegram Bot =====================
function smartMatch(text, keywords) {
    return keywords.some(k => text.includes(k));
}

function buildContext() {
    const today = new Date().toISOString().slice(0, 10);
    const ts = db.dailyStats[today] || { visitors: 0, orders: 0, items: {} };
    const totalVisitors = Object.values(db.dailyStats).reduce((s, d) => s + (d.visitors || 0), 0);
    const productCounts = {};
    for (const o of db.orders) for (const it of (o.items || [])) {
        const k = it.text || it.product || 'منتج';
        productCounts[k] = (productCounts[k] || 0) + 1;
    }
    const avg = db.ratings.length ? (db.ratings.reduce((s, r) => s + r.score, 0) / db.ratings.length).toFixed(1) : 0;
    return {
        today: { visitors: ts.visitors || 0, orders: ts.orders || 0, topItems: ts.items || {} },
        totals: {
            visitors: totalVisitors,
            orders: db.orders.length,
            complaints: db.complaints.length,
            ratings: db.ratings.length,
            ratingsAvg: avg
        },
        productOrderCounts: productCounts,
        prices: db.prices,
        stock: db.stock
    };
}

function menuText() {
    const p = db.prices;
    return '☕ شاي على الحطب: ' + p.shay + ' د.أ\n' +
        '🌽 ذرة كبير: ' + p.dhrah.كبير + ' | وسط: ' + p.dhrah.وسط + ' د.أ\n' +
        '🍿 بوشار كبير: ' + p.bushar.كبير + ' | وسط: ' + p.bushar.وسط + ' د.أ';
}

function stockText() {
    const ok = s => s ? '✅ متوفر' : '❌ غير متوفر';
    const s = db.stock;
    return '☕ شاي: ' + ok(s.shay) + '\n' +
        '🌽 ذرة كبير: ' + ok(s.dhrah.كبير) + ' | وسط: ' + ok(s.dhrah.وسط) + '\n' +
        '🍿 بوشار كبير: ' + ok(s.bushar.كبير) + ' | وسط: ' + ok(s.bushar.وسط);
}

function statsText() {
    const ctx = buildContext();
    return '📊 إحصائيات:\n' +
        '👀 زوار: ' + ctx.totals.visitors + '\n' +
        '🛵 طلبات: ' + ctx.totals.orders + '\n' +
        '💬 شكاوي: ' + ctx.totals.complaints + '\n' +
        '⭐ تقييمات: ' + ctx.totals.ratings + ' (معدل: ' + ctx.totals.ratingsAvg + '/5)\n' +
        '📅 اليوم: زوار ' + ctx.today.visitors + ' | طلبات ' + ctx.today.orders;
}

async function handleTgCommand(chatId, text) {
    console.log('[Bot] From', chatId, ':', text.substring(0, 100));
    const t = text.replace(/[\/#!]/g, '').trim();
    const send = (msg) => tg.sendTo(chatId, msg).catch(e => console.error('[Bot] send err:', e.message));

    try {
        if (t === 'start' || t === 'ابدأ' || t === 'ربط') {
            return send('✅ مرحبا! أنا مساعدك الذكي.\n\nالأوامر:\n/menu - القائمة والأسعار\n/stock - التوفر\n/stats - الإحصائيات\n/setprice منتج سعر - تعديل سعر\n/setstock منتج on/off - تعديل التوفر\nأرسل "تطبيق" لتحميل APK\nأو أي سؤال للذكاء الاصطناعي');
        }

        if (t === 'menu' || t === 'القائمة' || t === 'المنيو' || t === 'الأسعار') {
            return send('📋 القائمة:\n' + menuText());
        }

        if (t === 'stock' || t === 'توفر' || t === 'المخزون') {
            return send('📦 المخزون:\n' + stockText());
        }

        if (t === 'stats' || t === 'إحصائيات' || t === 'تقرير' || t === 'احصائيات') {
            return send(statsText());
        }

        if (t.startsWith('setprice') || t.startsWith('سعر')) {
            const parts = t.split(/\s+/);
            if (parts.length < 3) return send('مثال: setprice shay 2.0');
            const name = parts[1];
            const val = parseFloat(parts[2]);
            if (isNaN(val) || val <= 0) return send('السعر غير صالح');
            if (name === 'shay' || name === 'شاي') { db.prices.shay = val; }
            else if (name === 'dhrah_k' || name === 'ذرة ك' || name === 'ذرة كبير') { db.prices.dhrah.كبير = val; }
            else if (name === 'dhrah_m' || name === 'ذرة و' || name === 'ذرة وسط') { db.prices.dhrah.وسط = val; }
            else if (name === 'bushar_k' || name === 'بوشار ك' || name === 'بوشار كبير') { db.prices.bushar.كبير = val; }
            else if (name === 'bushar_m' || name === 'بوشار و' || name === 'بوشار وسط') { db.prices.bushar.وسط = val; }
            else return send('منتج غير معروف: ' + name + '\nالمنتجات: shay, dhrah_k, dhrah_m, bushar_k, bushar_m');
            persist();
            return send('✅ تم تحديث السعر\n' + menuText());
        }

        if (t.startsWith('setstock') || t.startsWith('توفر')) {
            const parts = t.split(/\s+/);
            if (parts.length < 3) return send('مثال: setstock shay off');
            const name = parts[1];
            const val = parts[2] === 'on' || parts[2] === 'true' || parts[2] === 'متوفر';
            if (name === 'shay' || name === 'شاي') { db.stock.shay = val; }
            else if (name === 'dhrah_k' || name === 'ذرة ك') { db.stock.dhrah.كبير = val; }
            else if (name === 'dhrah_m' || name === 'ذرة و') { db.stock.dhrah.وسط = val; }
            else if (name === 'bushar_k' || name === 'بوشار ك') { db.stock.bushar.كبير = val; }
            else if (name === 'bushar_m' || name === 'بوشار و') { db.stock.bushar.وسط = val; }
            else return send('منتج غير معروف');
            persist();
            return send('✅ تم تحديث التوفر\n' + stockText());
        }

        if (smartMatch(t, ['تطبيق', 'apk', 'تحديث']) || /تطبيق\s*\d+/.test(text)) {
            const apk = findLatestApk();
            if (!apk) return send('❌ ما لقيت ملف APK');
            const m = text.match(/(\d+)/);
            const ver = m ? m[1] : '';
            const caption = '📱 تحديث أندرويد' + (ver ? ' (بناء ' + ver + ')' : '') + '\n📦 ' + path.basename(apk);
            send('📤 جار الإرسال...');
            return tg.sendDocument(chatId, apk, caption).catch(() => send('❌ فشل الإرسال'));
        }

        // === AI reply ===
        send('⏳ جار التفكير...');
        console.log('[Bot] Calling Groq...');
        const reply = await ai.ask(text, buildContext());
        console.log('[Bot] Reply:', reply ? reply.substring(0, 80) : 'null');
        send(reply || '❌ لم أتمكن من الرد حالياً');
    } catch (e) {
        console.error('[Bot] CRASH:', e.message, e.stack);
        send('🚨 خطأ: ' + e.message);
    }
}

// ===================== APK helpers =====================
function findLatestApk() {
    const apkDir = path.join(ROOT, 'android');
    let apk = null, latest = 0;
    const skip = new Set(['node_modules', '.gradle', '.idea', 'build', '.git']);
    const walk = (dir) => {
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
        for (const e of entries) {
            const fp = path.join(dir, e.name);
            if (e.isDirectory()) { if (skip.has(e.name)) continue; walk(fp); }
            else if (e.name.toLowerCase().endsWith('.apk')) {
                try { const m = fs.statSync(fp).mtimeMs; if (m > latest) { latest = m; apk = fp; } } catch (e) {}
            }
        }
    };
    if (fs.existsSync(apkDir)) walk(apkDir);
    return apk;
}

function getAndroidVersion() {
    try {
        const gradle = fs.readFileSync(path.join(ROOT, 'android', 'app', 'build.gradle'), 'utf8');
        const vc = (gradle.match(/versionCode\s+(\d+)/) || [])[1] || '0';
        const vn = (gradle.match(/versionName\s+"([^"]+)"/) || [])[1] || '';
        return { versionCode: parseInt(vc, 10) || 0, versionName: vn };
    } catch (e) { return { versionCode: 0, versionName: '' }; }
}

// ===================== Polling =====================
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
    } catch (e) { console.error('[Bot] Polling error:', e.message); }
    setTimeout(startTelegramPolling, 3000);
}
