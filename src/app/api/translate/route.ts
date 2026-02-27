import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const { text, targetLang } = await req.json();

        if (!text) {
            return NextResponse.json({ error: 'Text required' }, { status: 400 });
        }

        // Google Translate uses 'zh-CN' for simplified Chinese generally, our app uses 'zh'
        const tl = targetLang === 'zh' ? 'zh-CN' : targetLang;

        // The free Google Translate API has a soft limit of around 5000 chars per request.
        let safeText = text.substring(0, 4900);
        let suffix = text.length > 4900 ? `<br/><br/><em style="color:var(--text-soft);font-size:12px;">[Note: Text truncated due to translation length limits]</em>` : '';

        const q = 'q=' + encodeURIComponent(safeText);

        const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${tl}&dt=t`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: q,
        });

        if (!res.ok) {
            throw new Error(`Translation failed with status: ${res.status}`);
        }

        const data = await res.json();
        const translatedText = data[0].map((item: any) => item[0]).join('');

        return NextResponse.json({ translatedText: translatedText + suffix });
    } catch (e: any) {
        console.error("Translation api error", e);
        return NextResponse.json({ error: e.message || 'Translation failed' }, { status: 500 });
    }
}
