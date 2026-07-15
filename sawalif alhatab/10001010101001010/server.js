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
                tg.sendMessage(tg.orderDeletedMsg(id)).catch(() => {});
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
        tg.sendMessage('\u2705 \u0645\u0631\u062D\u0628\u0627! \u0623\u0646\u0627 \u0645\u0633\u0627\u0639\u062F\u0643 \u0627\u0644\u0630\u0643\u064A. \u0627\u0633\u0623\u0644\u0646\u064A \u0639\u0646 \u0623\u064A \u0634\u064A \u0628\u0627\u0644\u0645\u0648\u0642\u0639 \u0648\u0627\u0644\u0625\u062D\u0635\u0627\u0626\u064A\u0627\u062A \u0648\u0623\u0646\u0627 \u0623\u062D\u0644\u0644 \u0644\u0643 \u0648\u0623\u0642\u062F\u0645 \u0627\u0644\u0627\u0642\u062A\u0631\u0627\u062D\u0627\u062A \u2714\ufe0f').catch(() => {});
        db.telegramChatId = String(chatId);
        persist();
        return;
    }

    if (!isOwn) {
        // Customer message → forward to owner as a problem/complaint
        const complaint = { id: uid(), date: new Date().toISOString(), name: '\u0632\u0628\u0648\u0646 \u0639\u0628\u0631 \u062a\u0644\u0642\u0631\u0627\u0645', phone: String(chatId), message: text };
        db.complaints.push(complaint);
        persist();
        tg.sendMessage(tg.complaintMsg(complaint)).catch(() => {});
        tg.sendTo(chatId, '\u0634\u0643\u0631\u064b\u0627 \u062a\u0648\u0627\u0635\u0644\u0643 \u0645\u0639 \u0633\u0648\u0627\u0644\u0641 \u0639\u0644\u0649 \u0627\u0644\u062d\u0637\u0628 \uD83C\uDF32\n\u062a\u0645 \u0627\u0633\u062a\u0644\u0627\u0645 \u0631\u0633\u0627\u0644\u062a\u0643 \u0648\u0633\u064a\u062a\u0648\u0627\u0635\u0644 \u0645\u0639\u0643 \u0635\u0627\u062d\u0628 \u0627\u0644\u0645\u0642\u0647\u0649 \u0642\u0631\u064a\u0628\u064b\u0627.').catch(() => {});
        return;
    }

    // ===== Owner: send latest Android APK =====
    if (smartMatch(t, ['تطبيق', 'apk', 'تحديث التطبيق', 'برنامج']) || /تطبيق\s*\d+/.test(text)) {
        return sendAndroidUpdate(chatId, text);
    }

    // ===== Owner: smart AI chat about the site =====
    const today = new Date().toISOString().slice(0, 10);
    const ts = db.dailyStats[today] || { visitors: 0, orders: 0, items: {} };
    const totalOrders = db.orders.length;
    const totalRevenue = db.orders.reduce((s, o) => s + (o.items || []).reduce((ss, i) => ss + (i.price || 0), 0), 0);
    const totalVisitors = Object.values(db.dailyStats).reduce((s, d) => s + (d.visitors || 0), 0);
    const totalComplaints = db.complaints.length;

    const productCounts = {};
    for (const o of db.orders) for (const it of (o.items || [])) {
        const k = it.text || it.product || '\u0645\u0646\u062a\u062c';
        productCounts[k] = (productCounts[k] || 0) + 1;
    }

    const ratingsAvg = db.ratings.length ? (db.ratings.reduce((s, r) => s + (r.score || 0), 0) / db.ratings.length) : 0;
    const recentRatings = db.ratings.slice(-5).reverse();

    const context = {
        today: { visitors: ts.visitors || 0, orders: ts.orders || 0, topItems: ts.items || {} },
        totals: {
            visitors: totalVisitors,
            orders: totalOrders,
            revenue: totalRevenue,
            complaints: totalComplaints,
            ratingsCount: db.ratings.length,
            ratingsAverage: Number(ratingsAvg.toFixed(2))
        },
        productOrderCounts: productCounts,
        prices: db.prices,
        stock: db.stock,
        recentOrders: db.orders.slice(-3).reverse(),
        recentComplaints: db.complaints.slice(-3).reverse(),
        recentRatings: recentRatings,
        recentRatingsText: recentRatings.map(r => '(' + r.score + '/5) ' + (r.review || r.name))
    };
    // ===== Owner commands =====
    if (t === 'help' || t === 'مساعدة' || t === 'أوامر' || t === 'اوامر') {
        tg.sendMessage(tg.helpMsg()).catch(() => {});
        return;
    }
    if (t === 'stats' || t === 'إحصائيات' || t === 'تقرير' || t === 'احصائيات') {
        tg.sendMessage(tg.statsGeneralMsg(totalVisitors, totalOrders, totalRevenue, totalComplaints) + '\n\n' + tg.reportMsg(db)).catch(() => {});
        return;
    }
    if (t === 'stock' || t === 'توفر' || t === 'المخزون' || t === 'مخزون') {
        tg.sendMessage(tg.stockMsg(db.stock)).catch(() => {});
        return;
    }
    if (t === 'prices' || t === 'الأسعار' || t === 'الاسعار' || t === 'السعر') {
        tg.sendMessage(tg.pricesMsg(db.prices)).catch(() => {});
        return;
    }

    // ===== Consulting modes (plan / analyze / general) =====
    let prompt = text;
    if (smartMatch(t, ['خطه', 'خطط', 'خطة', 'اقتراح', 'اقتراحات', 'خططه', 'plan', 'تطوير'])) {
        prompt = 'بصفتي صاحب المقهى، أريد منك خطة عمل واقتراحات عملية ومحددة لتطوير المبيعات وتحسين الأداء بناءً على البيانات أدناه. رتّبها كخطوات:\n\n' + text;
    } else if (smartMatch(t, ['تحليل', 'analyze', 'حلل', 'وضع'])) {
        prompt = 'حلل لي وضع المقهى بشكل دبلوماسي وتحليلي بناءً على البيانات أدناه، واذكر نقاط القوة والضعف:\n\n' + text;
    }

    tg.sendMessage('\u23F3 \u062C\u0627\u0631 \u0627\u0644\u062A\u0641\u0643\u064A\u0631...').catch(() => {});
    let reply = null;
    try { reply = await ai.ask(prompt, context); } catch (e) {}
    if (!reply) reply = '❌ لم أتمكن من الرد. تأكد أن Ollama شغّال على ' + (process.env.OLLAMA_URL || 'http://localhost:11434') + ' أو أن مفتاح GROQ_API_KEY معيّن.';
    tg.sendMessage(reply).catch(() => {});
}

let tgOffset = 0;
let tgRunning = false;

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

function sendAndroidUpdate(chatId, text) {
    const apk = findLatestApk();
    if (!apk) {
        tg.sendMessage('\u274C \u0645\u0627 \u0644\u0642\u064A\u062A \u0645\u0644\u0641 APK \u062F\u0627\u062E\u0644 \u0645\u062C\u0644\u062F android. \u062D\u0637 \u0627\u0644\u0645\u0644\u0641 \u0641\u064A \u0645\u0643\u0627\u0646 \u0645\u062B\u0644 android/app/release/app-release.apk').catch(() => {});
        return Promise.resolve();
    }
    const m = text.match(/(\d+)/);
    const ver = m ? m[1] : '';
    const caption = '\uD83C\uDCF1 \u062A\u062D\u062F\u064A\u062B \u062A\u0637\u0628\u064A\u0642 \u0623\u0646\u062F\u0631\u0648\u064A\u062F' + (ver ? ' (\u0628\u0646\u0627\u0621 ' + ver + ')' : '') + '\n\uD83D\uDCE6 ' + path.basename(apk);
    tg.sendMessage('\uD83D\uDCE4 \u062C\u0627\u0631 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0645\u0644\u0641...').catch(() => {});
    return tg.sendDocument(chatId, apk, caption).catch(() => {
        tg.sendMessage('\u274C \u062A\u0639\u0630\u0631 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0645\u0644\u0641. \u062D\u062F \u062A\u0644\u0642\u0631\u0627\u0645 \u0644\u0644\u0645\u0644\u0641\u0627\u062A 50MB \u0648\u0627\u0644\u0645\u0633\u0627\u0631: ' + apk).catch(() => {});
    });
}
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
