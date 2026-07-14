'use strict';
const https = require('https');
const ai = require('./ai');

const BOT_TOKEN = process.env.CLIENT_BOT_TOKEN || '';
const WEBSITE_URL = 'https://' + (process.env.WEBSITE_DOMAIN || 'sawalif-alhatab.onrender.com');

let offset = 0;
let running = false;

const MENU_INFO = {
    shay: { name: 'شاي على الحطب', price: '1.5 د.أ' },
    dhrah_k: { name: 'ذرة كبير', price: '3.0 د.أ' },
    dhrah_m: { name: 'ذرة وسط', price: '2.0 د.أ' },
    bushar_k: { name: 'بوشار كبير', price: '4.0 د.أ' },
    bushar_m: { name: 'بوشار وسط', price: '3.0 د.أ' }
};

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
    console.log('[CBot] Started');
    poll();
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

            if (text === '/start' || text === 'ابدأ' || text === 'help' || text === 'مساعدة') {
                await sendMsg(chatId, helpMsg());
                continue;
            }

            await sendMsg(chatId, '\u23F3 \u062C\u0627\u0631 \u0627\u0644\u062A\u0641\u0643\u064A\u0631...');
            const context = {
                menu: Object.values(MENU_INFO),
                website: WEBSITE_URL,
                about: 'مقهى "سوالف على الحطب" يقدم شاي على الحطب، ذرة، وبوشار. التوصيل متاح.'
            };
            const system = 'You are a friendly Arabic customer service bot for "Sawalif Alhatab" cafe (سوالف على الحطب).\n' +
                'Always respond in Arabic. Be warm and helpful.\n\n' +
                'Cafe info:\n' + JSON.stringify(context, null, 2) + '\n\n' +
                'Answer questions about the menu, prices, location, and hours naturally. Do not make up information.';
            let reply = null;
            try { reply = await ai.ask(text, { system }); } catch (e) {}
            await sendMsg(chatId, reply || '\u0639\u0630\u0631\u0627\u064B \u062D\u062F\u062B \u062E\u0637\u0623. \u062C\u0631\u0628 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649.');
        }
    } catch (e) { console.error('[CBot] error:', e.message); }
    setTimeout(poll, 3000);
}

function helpMsg() {
    return '\uD83E\uDD16 <b>\u0645\u0631\u062D\u0628\u0627\u064B \u0628\u0643 \u0641\u064A \u0633\u0648\u0627\u0644\u0641 \u0639\u0644\u0649 \u0627\u0644\u062D\u0637\u0628!</b>\n\n' +
        '\u0623\u0646\u0627 \u0645\u0633\u0627\u0639\u062F \u0630\u0643\u064A. \u0627\u0633\u0623\u0644\u0646\u064A \u0639\u0646 \u0627\u0644\u0642\u0627\u0626\u0645\u0629\u060C \u0627\u0644\u0623\u0633\u0639\u0627\u0631\u060C \u0623\u0648 \u0623\u064A \u0634\u064A \u0639\u0646 \u0627\u0644\u0645\u0642\u0647\u0649!\n\n' +
        '\uD83D\uDCAC <b>\u0642\u0648\u0644 \u0644\u064A \u0645\u062B\u0644\u0627\u064B:</b>\n' +
        '\" \u0634\u0648 \u0639\u0646\u062F\u0643\u0645 \u0645\u0646 \u0645\u0634\u0631\u0648\u0628\u0627\u062A \u061F \"\n' +
        '\" \u0643\u0645 \u0633\u0639\u0631 \u0627\u0644\u0630\u0631\u0629 \u0627\u0644\u0643\u0628\u064A\u0631 \u061F \"\n' +
        '\" \u0648\u064A\u0646 \u0645\u0648\u0642\u0639\u0643\u0645 \u061F \"\n' +
        '\" \u0623\u0631\u064A\u062F \u0623\u0646 \u0623\u0637\u0644\u0628 \u0627\u0644\u0622\u0646 \"\n\n' +
        '\uD83C\uDF10 ' + WEBSITE_URL;
}

module.exports = { start };
