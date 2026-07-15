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
    return 'أنت مستشار ذكي لمقهى "سوالف على الحطب" في الأردن. جاوب بالعربية.';
}

function ask(prompt, data) {
    const system = buildSystem(data);
    console.log('[AI] Provider:', PROVIDER, '| Prompt:', prompt.substring(0, 80));
    if (PROVIDER === 'groq' && GROQ_KEY) return askGroq(prompt, system);
    if (PROVIDER === 'ollama') {
        return askOllama(prompt, system).then(r => {
            if (r) return r;
            if (GROQ_KEY) return askGroq(prompt, system);
            return null;
        });
    }
    if (GROQ_KEY) return askGroq(prompt, system);
    console.log('[AI] No provider configured');
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
                    if (j.error) { console.error('[Ollama] error:', j.error); return resolve(null); }
                    resolve(j.message && j.message.content ? j.message.content : null);
                } catch (e) { console.error('[Ollama] parse error:', e.message); resolve(null); }
            });
        });
        req.on('error', e => { console.error('[Ollama] connection error:', e.message); resolve(null); });
        req.setTimeout(30000, () => { req.destroy(); console.error('[Ollama] timeout'); resolve(null); });
        req.write(body);
        req.end();
    });
}

function askGroq(prompt, system) {
    if (!GROQ_KEY) { console.error('[Groq] No API key'); return Promise.resolve(null); }
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
                try {
                    const j = JSON.parse(data);
                    if (j.error) { console.error('[Groq] API error:', j.error.message || JSON.stringify(j.error)); return resolve(null); }
                    resolve(j.choices?.[0]?.message?.content || null);
                } catch (e) { console.error('[Groq] parse error:', e.message); resolve(null); }
            });
        });
        req.on('error', (e) => { console.error('[Groq] connection error:', e.message); resolve(null); });
        req.setTimeout(30000, () => { req.destroy(); console.error('[Groq] timeout'); resolve(null); });
        req.write(body);
        req.end();
    });
}

module.exports = { ask };
