'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin1234';
const SECRET = process.env.SECRET || crypto.randomBytes(16).toString('hex');
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT_DB = {
    prices: {
        shay: 1.5,
        dhrah: { 'كبير': 3.0, 'وسط': 2.0 },
        bushar: { 'كبير': 4.0, 'وسط': 3.0 }
    },
    orders: []
};

let db = loadDB();
let writeTimer = null;

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

function makeToken() {
    return crypto.createHash('sha256').update(ADMIN_PASSWORD + '|' + SECRET).digest('hex');
}

function isAuthed(req) {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    return token === makeToken();
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
            // Admin login
            if (pathname === '/api/admin/login' && req.method === 'POST') {
                const body = await readBody(req);
                if (body.password === ADMIN_PASSWORD) return sendJSON(res, 200, { token: makeToken() });
                return sendJSON(res, 401, { error: 'كلمة المرور غير صحيحة' });
            }

            if (pathname === '/api/health' && req.method === 'GET') {
                return sendJSON(res, 200, { ok: true });
            }

            // Public products
            if (pathname === '/api/products' && req.method === 'GET') {
                return sendJSON(res, 200, { prices: db.prices });
            }

            // Update prices (admin)
            if (pathname === '/api/products' && req.method === 'PUT') {
                if (!isAuthed(req)) return sendJSON(res, 401, { error: 'unauthorized' });
                const body = await readBody(req);
                if (body.prices) db.prices = body.prices;
                persist();
                return sendJSON(res, 200, { prices: db.prices });
            }

            // Create order (public)
            if (pathname === '/api/orders' && req.method === 'POST') {
                const body = await readBody(req);
                if (!body.name || !body.phone || !Array.isArray(body.items) || !body.items.length) {
                    return sendJSON(res, 400, { error: 'بيانات الطلب ناقصة' });
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
                return sendJSON(res, 200, { ok: true, id: order.id });
            }

            // List orders (admin)
            if (pathname === '/api/orders' && req.method === 'GET') {
                if (!isAuthed(req)) return sendJSON(res, 401, { error: 'unauthorized' });
                return sendJSON(res, 200, { orders: db.orders });
            }

            // Delete order (admin)
            const delMatch = pathname.match(/^\/api\/orders\/([^/]+)$/);
            if (delMatch && req.method === 'DELETE') {
                if (!isAuthed(req)) return sendJSON(res, 401, { error: 'unauthorized' });
                const id = delMatch[1];
                db.orders = db.orders.filter(o => o.id !== id);
                persist();
                return sendJSON(res, 200, { ok: true });
            }

            return sendJSON(res, 404, { error: 'not found' });
        }

        // ---- Static files ----
        if (req.method === 'GET' || req.method === 'HEAD') {
            let rel = decodeURIComponent(pathname);
            if (rel === '/') rel = '/index.html';
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
    console.log('   Admin password: ' + ADMIN_PASSWORD + '  (set ADMIN_PASSWORD env to change)');
});
