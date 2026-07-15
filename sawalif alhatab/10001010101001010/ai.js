'use strict';
const https = require('https');

const GROQ_KEY = process.env.GROQ_API_KEY || '';
const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

function ask(prompt, context) {
    if (!GROQ_KEY) {
        console.error('[Groq] No API key set');
        return Promise.resolve(null);
    }
    const system = 'أنت مساعد ذكي لمقهى "سوالف على الحطب". جاوب بالعربية وباختصار.\n\nبيانات الموقع:\n' + JSON.stringify(context || {});
    console.log('[Groq] Sending prompt:', prompt.substring(0, 80));
    return new Promise((resolve) => {
        const body = JSON.stringify({
            model: MODEL,
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 400
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
                try {
                    const j = JSON.parse(data);
                    if (j.error) {
                        console.error('[Groq] API error:', j.error.message || JSON.stringify(j.error));
                        return resolve(null);
                    }
                    resolve(j.choices?.[0]?.message?.content || null);
                } catch (e) {
                    console.error('[Groq] Parse error:', e.message);
                    resolve(null);
                }
            });
        });
        req.on('error', e => {
            console.error('[Groq] Connection error:', e.message);
            resolve(null);
        });
        req.setTimeout(30000, () => {
            req.destroy();
            console.error('[Groq] Timeout');
            resolve(null);
        });
        req.write(body);
        req.end();
    });
}

module.exports = { ask };
