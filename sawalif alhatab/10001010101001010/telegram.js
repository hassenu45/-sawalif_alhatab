'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
let CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

function sendMessage(text) {
    if (!BOT_TOKEN) { console.error('[TG] No BOT_TOKEN set'); return Promise.resolve(); }
    if (!CHAT_ID) { console.error('[TG] No CHAT_ID set - send /start to bot first'); return Promise.resolve(); }
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({ chat_id: CHAT_ID, text: String(text), parse_mode: 'HTML' });
        const req = https.request({
            hostname: 'api.telegram.org',
            path: '/bot' + BOT_TOKEN + '/sendMessage',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        }, res => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                try {
                    const j = JSON.parse(body);
                    if (!j.ok) console.error('[TG] send error:', j.description);
                    resolve(j);
                } catch (e) { resolve({}); }
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

function getUpdates(offset) {
    if (!BOT_TOKEN) return Promise.resolve({ result: [] });
    return new Promise((resolve, reject) => {
        const path = '/bot' + BOT_TOKEN + '/getUpdates?offset=' + (offset || 0) + '&timeout=5&allowed_updates=%5B%22message%22%5D';
        https.get({ hostname: 'api.telegram.org', path }, res => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { resolve({ result: [] }); } });
        }).on('error', e => { console.error('[TG] getUpdates error:', e.message); reject(e); });
    });
}

function clearUpdates() {
    return getUpdates(-1).catch(() => {});
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

function setChatId(id) { CHAT_ID = String(id); }
function getChatId() { return CHAT_ID; }

function sendTo(chatId, text) {
    if (!BOT_TOKEN) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({ chat_id: String(chatId), text: String(text), parse_mode: 'HTML' });
        const req = https.request({
            hostname: 'api.telegram.org',
            path: '/bot' + BOT_TOKEN + '/sendMessage',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        }, res => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => { try { const j = JSON.parse(body); if (!j.ok) console.error('[TG] send error:', j.description); resolve(j); } catch (e) { resolve({}); } });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

function escape(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sendDocument(chatId, filePath, caption) {
    if (!BOT_TOKEN) { console.error('[TG] No BOT_TOKEN set'); return Promise.resolve(); }
    if (!fs.existsSync(filePath)) { console.error('[TG] file not found:', filePath); return Promise.resolve(); }
    return new Promise((resolve, reject) => {
        const fileData = fs.readFileSync(filePath);
        const fileName = path.basename(filePath);
        const boundary = '----formdata' + Date.now();
        const head = Buffer.from(
            '--' + boundary + '\r\n' +
            'Content-Disposition: form-data; name="chat_id"\r\n\r\n' + String(chatId) + '\r\n' +
            '--' + boundary + '\r\n' +
            'Content-Disposition: form-data; name="caption"\r\n\r\n' + (caption || '') + '\r\n' +
            '--' + boundary + '\r\n' +
            'Content-Disposition: form-data; name="document"; filename="' + fileName + '"\r\n' +
            'Content-Type: application/vnd.android.package-archive\r\n\r\n'
        );
        const tail = Buffer.from('\r\n--' + boundary + '--\r\n');
        const body = Buffer.concat([head, fileData, tail]);
        const req = https.request({
            hostname: 'api.telegram.org',
            path: '/bot' + BOT_TOKEN + '/sendDocument',
            method: 'POST',
            headers: {
                'Content-Type': 'multipart/form-data; boundary=' + boundary,
                'Content-Length': Buffer.byteLength(body)
            }
        }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => { try { const j = JSON.parse(data); if (!j.ok) console.error('[TG] sendDocument error:', j.description); resolve(j); } catch (e) { resolve({}); } });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// ===== Message Builders =====
function orderMsg(order) {
    const items = (order.items || []).map((i, n) =>
        '  ' + (n + 1) + '. ' + (i.text || '') + (i.note ? ' [' + i.note + ']' : '') + ' — ' + (i.price || 0) + ' \u062f.\u0623'
    ).join('\n');
    const total = (order.items || []).reduce((s, i) => s + (i.price || 0), 0);
    return '\uD83D\uDE9C <b>\u0637\u0644\u0628 \u062c\u062f\u064a\u062f!</b>\n\n' +
        '\uD83D\uDC64 <b>\u0627\u0644\u0627\u0633\u0645:</b> ' + (order.name || '') + '\n' +
        '\uD83D\uDCDE <b>\u0627\u0644\u0647\u0627\u062a\u0641:</b> ' + (order.phone || '') + '\n' +
        '\uD83D\uDCCD <b>\u0627\u0644\u0639\u0646\u0648\u0627\u0646:</b> ' + (order.address || '') + '\n' +
        (order.location ? '\uD83D\uDCCD <b>\u0627\u0644\u0645\u0648\u0642\u0639:</b> <a href="' + order.location + '">\u0627\u0641\u062a\u062d \u0639\u0644\u0649 \u0627\u0644\u062e\u0631\u064a\u0637\u0629</a>\n' : '') +
        '\n\uD83D\uDCE6 <b>\u0627\u0644\u0645\u0646\u062a\u062c\u0627\u062a:</b>\n' + items + '\n\n' +
        '\uD83D\uDCB0 <b>\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a:</b> ' + total + ' \u062f.\u0623';
}

function complaintMsg(c) {
    return '\uD83D\uDCE9 <b>\u0634\u0643\u0648\u0649 / \u0631\u0633\u0627\u0644\u0629 \u0645\u0646 \u0639\u0645\u064a\u0644!</b>\n\n' +
        '\uD83D\uDC64 <b>\u0627\u0644\u0627\u0633\u0645:</b> ' + (c.name || '') + '\n' +
        '\uD83D\uDCDE <b>\u0627\u0644\u0647\u0627\u062a\u0641:</b> ' + (c.phone || '\u063a\u064a\u0631 \u0645\u062a\u0648\u0641\u0631') + '\n' +
        '\uD83D\uDCAC <b>\u0627\u0644\u0631\u0633\u0627\u0644\u0629:</b>\n' + (c.message || '');
}

function ratingMsg(r) {
    const stars = '\u2B50'.repeat(Math.min(5, Math.max(1, r.score))) + '\u2606'.repeat(Math.max(0, 5 - r.score));
    return '\uD83D\uDCCA <b>\u062a\u0642\u064a\u064a\u0645 \u062c\u062f\u064a\u062f \u0645\u0646 \u0639\u0645\u064a\u0644!</b>\n\n' +
        '\uD83D\uDC64 <b>\u0627\u0644\u0627\u0633\u0645:</b> ' + (r.name || '') + '\n' +
        '\u2B50 <b>\u0627\u0644\u062a\u0642\u064a\u064a\u0645:</b> ' + stars + ' (' + r.score + '/5)\n' +
        (r.review ? '\uD83D\uDCAC <b>\u0631\u0623\u064a\u0647:</b>\n' + r.review : '');
}

function todayStatsMsg(s) {
    if (!s) return '\uD83D\uDCCA <b>\u0625\u062d\u0635\u0627\u0626\u064a\u0627\u062a \u0627\u0644\u064a\u0648\u0645:</b>\n\n\u0644\u0627 \u062a\u0648\u062c\u062f \u0628\u064a\u0627\u0646\u0627\u062a \u0628\u0639\u062f.';
    const items = s.items || {};
    const sorted = Object.entries(items).sort((a, b) => b[1] - a[1]);
    const topItem = sorted.length > 0 ? sorted[0][0] : '\u0644\u0627 \u064a\u0648\u062c\u062f';
    const topCount = sorted.length > 0 ? sorted[0][1] : 0;
    const itemsList = sorted.map(([name, count], i) => '  ' + (i + 1) + '. ' + name + ' — ' + count + ' \u0645\u0631\u0629').join('\n');
    return '\uD83D\uDCCA <b>\u0625\u062d\u0635\u0627\u0626\u064a\u0627\u062a \u0627\u0644\u064a\u0648\u0645:</b>\n\n' +
        '\uD83D\uDC40 <b>\u0627\u0644\u0632\u0648\u0627\u0631:</b> ' + (s.visitors || 0) + '\n' +
        '\uD83D\uDE9C <b>\u0627\u0644\u0637\u0644\u0628\u0627\u062a:</b> ' + (s.orders || 0) + '\n' +
        '\uD83C\uDFC6 <b>\u0623\u0643\u062b\u0631 \u0645\u0646\u062a\u062c \u0637\u0644\u0628:</b> ' + topItem + ' (' + topCount + ' \u0645\u0631\u0629)\n\n' +
        (itemsList ? '\uD83D\uDCCB <b>\u062a\u0641\u0627\u0635\u064a\u0644 \u0627\u0644\u0637\u0644\u0628\u0627\u062a:</b>\n' + itemsList : '');
}

function reportMsg(db) {
    const keys = Object.keys(db.dailyStats || {}).sort().reverse().slice(0, 7);
    if (keys.length === 0) return '\uD83D\uDCCA <b>\u0627\u0644\u062a\u0642\u0631\u064a\u0631:</b>\n\n\u0644\u0627 \u062a\u0648\u062c\u062f \u0628\u064a\u0627\u0646\u0627\u062a.';
    let report = '\uD83D\uDCCA <b>\u062a\u0642\u0631\u064a\u0631 \u0622\u062e\u0631 ' + keys.length + ' \u0623\u064a\u0627\u0645:</b>\n\n';
    let tv = 0, to = 0;
    keys.forEach(day => {
        const s = db.dailyStats[day];
        tv += s.visitors || 0;
        to += s.orders || 0;
        report += '\uD83D\uDCC5 <b>' + day + '</b>\n';
        report += '  \uD83D\uDC40 \u0632\u0648\u0627\u0631: ' + (s.visitors || 0) + ' | \uD83D\uDE9C \u0637\u0644\u0628\u0627\u062a: ' + (s.orders || 0) + '\n\n';
    });
    report += '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n';
    report += '\uD83D\uDCC8 <b>\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a:</b>\n';
    report += '  \uD83D\uDC40 \u0632\u0648\u0627\u0631: ' + tv + '\n';
    report += '  \uD83D\uDE9C \u0637\u0644\u0628\u0627\u062a: ' + to + '\n';
    return report;
}

function complaintsListMsg(complaints) {
    if (!complaints || complaints.length === 0) return '\uD83D\uDCE9 <b>\u0627\u0644\u0634\u0643\u0627\u0648\u064a:</b>\n\n\u0644\u0627 \u062a\u0648\u062c\u062f \u0634\u0643\u0627\u0648\u064a.';
    const recent = complaints.slice(-10).reverse();
    let msg = '\uD83D\uDCE9 <b>\u0622\u062e\u0631 ' + recent.length + ' \u0634\u0643\u0627\u0648\u064a:</b>\n\n';
    recent.forEach((c, i) => {
        msg += (i + 1) + '. <b>' + c.name + '</b>';
        if (c.phone) msg += ' — \uD83D\uDCDE ' + c.phone;
        msg += '\n  \uD83D\uDCAC ' + c.message + '\n  \uD83D\uDCC5 ' + new Date(c.date).toLocaleString('ar-EG') + '\n\n';
    });
    return msg;
}

function statsGeneralMsg(v, o, rev, c) {
    return '\uD83D\uDCCA <b>\u0625\u062d\u0635\u0627\u0626\u064a\u0627\u062a \u0639\u0627\u0645\u0629:</b>\n\n' +
        '\uD83D\uDC40 \u0625\u062c\u0645\u0627\u0644\u064a \u0627\u0644\u0632\u0648\u0627\u0631: ' + v + '\n' +
        '\uD83D\uDE9C \u0625\u062c\u0645\u0627\u0644\u064a \u0627\u0644\u0637\u0644\u0628\u0627\u062a: ' + o + '\n' +
        '\uD83D\uDCB0 \u0625\u062c\u0645\u0627\u0644\u064a \u0627\u0644\u0625\u064a\u0631\u0627\u062f\u0627\u062a: ' + rev + ' \u062f.\u0623\n' +
        '\uD83D\uDCE9 \u0625\u062c\u0645\u0627\u0644\u064a \u0627\u0644\u0634\u0643\u0627\u0648\u064a: ' + c;
}

function ordersListMsg(orders) {
    const recent = orders.slice(-5).reverse();
    if (recent.length === 0) return '\uD83D\uDE9C \u0644\u0627 \u062a\u0648\u062c\u062f \u0637\u0644\u0628\u0627\u062a \u0628\u0639\u062f.';
    let msg = '\uD83D\uDE9C <b>\u0622\u062e\u0631 5 \u0637\u0644\u0628\u0627\u062a:</b>\n\n';
    recent.forEach((o, i) => { msg += (i + 1) + '. ' + o.name + ' — ' + o.phone + ' (' + (o.items || []).length + ' \u0645\u0646\u062a\u062c\u0627\u062a)\n'; });
    return msg;
}

function pricesMsg(p) {
    return '\uD83D\uDCB0 <b>\u0627\u0644\u0623\u0633\u0639\u0627\u0631 \u0627\u0644\u062d\u0627\u0644\u064a\u0629:</b>\n\n' +
        '\u2615 \u0634\u0627\u064a: ' + p.shay + ' \u062f.\u0623\n' +
        '\uD83C\uDF3D \u0630\u0631\u0629 \u0643\u0628\u064a\u0631: ' + (p.dhrah['\u0643\u0628\u064a\u0631'] || 0) + ' | \u0648\u0633\u0637: ' + (p.dhrah['\u0648\u0633\u0637'] || 0) + ' \u062f.\u0623\n' +
        '\uD83C\uDF7F \u0628\u0648\u0634\u0627\u0631 \u0643\u0628\u064a\u0631: ' + (p.bushar['\u0643\u0628\u064a\u0631'] || 0) + ' | \u0648\u0633\u0637: ' + (p.bushar['\u0648\u0633\u0637'] || 0) + ' \u062f.\u0623\n' +
        '\n\uD83D\uDCA1 /setprice shay 2.0';
}

function stockMsg(s) {
    const mark = v => v ? '\u2705' : '\u274C';
    return '\uD83D\uDCE6 <b>\u062a\u0648\u0641\u0631 \u0627\u0644\u0645\u0646\u062a\u062c\u0627\u062a:</b>\n\n' +
        '\u2615 \u0634\u0627\u064a: ' + mark(s.shay) + '\n' +
        '\uD83C\uDF3D \u0630\u0631\u0629 \u0643\u0628\u064a\u0631: ' + mark(s.dhrah['\u0643\u0628\u064a\u0631']) + ' | \u0648\u0633\u0637: ' + mark(s.dhrah['\u0648\u0633\u0637']) + '\n' +
        '\uD83C\uDF7F \u0628\u0648\u0634\u0627\u0631 \u0643\u0628\u064a\u0631: ' + mark(s.bushar['\u0643\u0628\u064a\u0631']) + ' | \u0648\u0633\u0637: ' + mark(s.bushar['\u0648\u0633\u0637']) + '\n' +
        '\n\uD83D\uDCA1 /setstock shay off';
}

function helpMsg() {
    return '\uD83E\uDD16 <b>\u0645\u0633\u0627\u0639\u062F\u0643 \u0627\u0644\u0630\u0643\u064A</b>\n\n' +
        '\u0623\u0646\u0627 \u0623\u062D\u0644\u0644 \u0644\u0643 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0648\u0642\u0639 \u0648\u0623\u0633\u0627\u0639\u062F\u0643 \u0628\u0627\u0644\u062A\u062D\u0644\u064A\u0644 \u0648\u0627\u0644\u0627\u0642\u062A\u0631\u0627\u062D\u0627\u062A.\n\n' +
        '\u0627\u0633\u0623\u0644\u0646\u064A \u0628\u0627\u0644\u0639\u0631\u0628\u064A\u060C \u0645\u062B\u0644\u064B\u0627\u064B:\n' +
        '\u2022 \u0643\u0645 \u0632\u0627\u0626\u0631 \u0632\u0631\u0646\u0627 \u0627\u0644\u064A\u0648\u0645\u061F\n' +
        '\u2022 \u0643\u0645 \u0637\u0644\u0628 \u0648\u0635\u0644 \u0647\u0627\u0644\u0623\u0633\u0628\u0648\u0639\u061F\n' +
        '\u2022 \u0634\u0648 \u0623\u0643\u062B\u0631 \u0645\u0646\u062A\u062C \u0627\u0644\u0646\u0627\u0633 \u062A\u0637\u0644\u0628\u0647\u061F\n' +
        '\u2022 \u0643\u0645 \u0634\u0643\u0648\u0649 \u0648\u062C\u0646\u0627 \u0648\u0645\u0627 \u062A\u0642\u064A\u064A\u0645\u0627\u062A \u0627\u0644\u0639\u0645\u0644\u0627\u0621\u061F\n' +
        '\u2022 \u0648\u0634 \u0627\u0642\u062A\u0631\u0627\u062D\u0643 \u0644\u062A\u0637\u0648\u064A\u0631 \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A\u061F\n' +
        '\u2022 \u062D\u0644\u0644 \u0644\u064A \u0648\u0636\u0639 \u0627\u0644\u0633\u0648\u0642 \u0628\u0634\u0643\u0644 \u062F\u0628\u0644\u0648\u0645\u0627\u0633\u064A\n\n' +
        '\uD83D\uDD27 <b>\u0627\u0644\u0623\u0648\u0627\u0645\u0631 \u0627\u0644\u0633\u0631\u064A\u0639\u0629:</b>\n' +
        '\u2022 /stats \u200F— \u0625\u062D\u0635\u0627\u0626\u064A\u0627\u062A \u0639\u0627\u0645\u0629 \u0648\u062A\u0642\u0631\u064A\u0631 \u0622\u062E\u0631 \u0623\u064A\u0627\u0645\n' +
        '\u2022 /stock \u200F— \u062A\u0648\u0641\u0631 \u0627\u0644\u0645\u0646\u062A\u062C\u0627\u062A\n' +
        '\u2022 /prices \u200F— \u0627\u0644\u0623\u0633\u0639\u0627\u0631 \u0627\u0644\u062D\u0627\u0644\u064A\u0629\n' +
        '\u2022 /help \u200F— \u0647\u0630\u0627 \u0627\u0644\u062F\u0644\u064A\u0644\n' +
        '\u2022 \u0623\u0631\u0633\u0644 \u00AB\u062A\u0637\u0628\u064A\u0642 326\u00BB \u200F— \u064A\u0628\u0639\u062B\u0644\u0643 \u0622\u062E\u0631 \u0645\u0644\u0641 APK \u0644\u0644\u0623\u0646\u062F\u0631\u0648\u064A\u062F\n' +
        '\u2022 \u0623\u0648 \u0627\u0633\u0623\u0644 \u0628\u0627\u0644\u0639\u0631\u0628\u064A \u0645\u0628\u0627\u0634\u0631\u0629 (\u0645\u062B\u0644 \u00AB\u0627\u0642\u062A\u0631\u062D \u0644\u064A \u062E\u0637\u0647\u00BB \u0623\u0648 \u00AB\u062D\u0644\u0644 \u0644\u064A \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A\u00BB)\n\n' +
        '\u0648\u0623\u064A \u0631\u0633\u0627\u0644\u0629 \u062A\u0635\u0644\u0646\u064A \u0645\u0646 \u0632\u0628\u0648\u0646 \u0628\u062A\u0648\u0635\u0644\u0643 \u0643\u0634\u0643\u0648\u0649 \u0641\u0648\u0631\u064B\u0627\u064B \uD83D\uDC47';
}

function serverStartMsg(port) {
    return '\uD83D\uDD25 <b>\u0627\u0644\u0633\u064a\u0631\u0641\u0631 \u0634\u063a\u0651\u0627\u0644!</b>\n\n' + '\uD83C\uDF10 \u0627\u0644\u0645\u0646\u0641\u0630: ' + port;
}

module.exports = {
    sendMessage, sendTo, sendDocument, getUpdates, clearUpdates, deleteWebhook, setChatId, getChatId, escape,
    orderMsg, complaintMsg, ratingMsg, todayStatsMsg, reportMsg, complaintsListMsg, statsGeneralMsg,
    ordersListMsg, pricesMsg, stockMsg, helpMsg, serverStartMsg
};
