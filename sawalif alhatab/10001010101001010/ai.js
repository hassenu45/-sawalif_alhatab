'use strict';
const https = require('https');

const API_KEY = process.env.GROQ_API_KEY || '';
const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

function ask(prompt, data) {
    if (!API_KEY) return Promise.resolve(null);
    let system;
    if (data && data.system) {
        system = data.system;
    } else {
        system = 'أنت "مستشار ذكي" لمقهى "سوالف على الحطب" (شاي وذرة وبوشار على الحطب) في الأردن.\n' +
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
