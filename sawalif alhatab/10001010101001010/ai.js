'use strict';
const http = require('http');
const https = require('https');

const GROQ_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3';
const PROVIDER = (process.env.AI_PROVIDER || 'ollama').toLowerCase();

function buildSystem(data) {
    if (data && data.system) return data.system;
    return 'أنت "مستشار ذكي" لمقهى "سوالف على الحطب" (شاي وذرة وبوشار على الحطب) في الأردن.\n' +
        'مهمتك: تحليل بيانات الموقع والرد على صاحب المقهى بأسلوب ذكي، وديبلوماسي، وتحليلي.\n\n' +
        'القواعد:\n' +
        '1. دائماً تجاوب بالعربية الفصحى الرصينة أو العامية الأردنية الراقية.\n' +
        '2. استخدم الأرقام من البيانات أدناه بدقة ولا تخترع معلومات.\n' +
        '3. عند السؤال عن الإحصائيات (زوار/طلبات/شكاوى/تقييمات/طلبات كل منتج) استخرجها من البيانات.\n' +
        '4. قدّم اقتراحات وتحليلاً دبلماسياً للأسواق (المنافسة، الأسعار، التسويق) بحكمة وهدوء.\n' +
        '5. كن شريكاً استراتيجياً: حلّل الوضع، واقترح خطوات عملية، ولا تكن مجرد روبوت.\n\n' +
        'بيانات الموقع الآن:\n' + JSON.stringify(data || {}, null, 2) + '\n\n' +
        'إن لم توجد معلومة محددة، قل ذلك بصراحة واقترح كيف نجمعها.';
}

function ask(prompt, data) {
    const system = buildSystem(data);
    if (PROVIDER === 'groq' && GROQ_KEY) return askGroq(prompt, system);
    if (PROVIDER === 'ollama') {
        return askOllama(prompt, system).then(r => {
            if (r) return r;
            if (GROQ_KEY) return askGroq(prompt, system); // fallback
            return null;
        });
    }
    if (GROQ_KEY) return askGroq(prompt, system);
    return Promise.resolve(null);
}

function askOllama(prompt, system) {
    return new Promise((resolve) => {
        let url;
        try { url = new URL(OLLAMA_URL + '/api/chat'); } catch (e) { return resolve(null); }
        const body = JSON.stringify({
            model: OLLAMA_MODEL,
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: prompt }
            ],
            stream: false
        });
        const req = http.request({
            hostname: url.hostname,
            port: url.port || 80,
            path: '/api/chat',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    const j = JSON.parse(data);
                    if (j.error) { console.error('[Ollama]', j.error); return resolve(null); }
                    resolve(j.message && j.message.content ? j.message.content : null);
                } catch (e) { resolve(null); }
            });
        });
        req.on('error', e => { console.error('[Ollama] connection error:', e.message); resolve(null); });
        req.setTimeout(60000, () => { req.destroy(); resolve(null); });
        req.write(body);
        req.end();
    });
}

function askGroq(prompt, system) {
    if (!GROQ_KEY) return Promise.resolve(null);
    return new Promise((resolve) => {
        const body = JSON.stringify({
            model: GROQ_MODEL,
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 500
        });
        const req = https.request({
            hostname: 'api.groq.com',
            path: '/openai/v1/chat/completions',
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + GROQ_KEY,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { const j = JSON.parse(data); resolve(j.choices?.[0]?.message?.content || null); }
                catch (e) { resolve(null); }
            });
        });
        req.on('error', () => resolve(null));
        req.write(body);
        req.end();
    });
}

module.exports = { ask };
