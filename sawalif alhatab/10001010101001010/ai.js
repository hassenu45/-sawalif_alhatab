'use strict';
const https = require('https');

const API_KEY = process.env.GROQ_API_KEY || '';
const MODEL = 'llama-3.3-70b-versatile';

function ask(prompt, context) {
    if (!API_KEY) return Promise.resolve(null);
    const system = 'You are a smart assistant for "Sawalif Alhatab" cafe (سوالف على الحطب).\n' +
        'IMPORTANT: Always respond in Arabic (العربية). Be natural and friendly.\n\n' +
        'Current website data:\n' + JSON.stringify(context, null, 2) + '\n\n' +
        'Answer questions about stats, orders, prices, stock, and complaints using the data above. Do not make up information. If asked about something not in the data, say you don\'t know.';

    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            model: MODEL,
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
                'Authorization': 'Bearer ' + API_KEY,
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
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

module.exports = { ask };
