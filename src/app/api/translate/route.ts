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
        const safeText = text.substring(0, 4900);
        const suffix = text.length > 4900 ? `<br/><br/><em style="color:var(--text-soft);font-size:12px;">[Note: Text truncated due to translation length limits]</em>` : '';

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const translatedText = data[0].map((item: any) => item[0]).join('');

        return NextResponse.json({ translatedText: translatedText + suffix });
    } catch (e: unknown) {
        console.error("Translation api error", e);
        const errorMessage = e instanceof Error ? e.message : 'Translation failed';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
