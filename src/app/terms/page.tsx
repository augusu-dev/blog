import Link from "next/link";

export default function TermsPage() {
    return (
        <div className="editor-container" style={{ maxWidth: 760 }}>
            <div
                style={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 18,
                    padding: "28px 24px",
                }}
            >
                <h1
                    style={{
                        fontFamily: "var(--serif)",
                        fontSize: 34,
                        fontWeight: 400,
                        marginBottom: 20,
                        color: "var(--text)",
                    }}
                >
                    利用規約
                </h1>

                <p style={{ fontSize: 14, color: "var(--text-soft)", lineHeight: 1.9, marginBottom: 24 }}>
                    本利用規約（以下「本規約」といいます。）は、当サイトが提供するサービスの利用条件を定めるものです。ユーザーは、本規約の内容を確認し、同意した上で当サイトを利用するものとします。
                </p>

                <section style={{ marginBottom: 24 }}>
                    <h2 className="section-title" style={{ fontSize: 24, marginBottom: 10 }}>第1条（適用）</h2>
                    <p style={{ fontSize: 14, lineHeight: 1.9 }}>
                        本規約は、当サイトの利用に関する一切の関係において、ユーザーと当サイト運営者との間に適用されます。
                    </p>
                </section>

                <section style={{ marginBottom: 24 }}>
                    <h2 className="section-title" style={{ fontSize: 24, marginBottom: 10 }}>第2条（ユーザー登録）</h2>
                    <p style={{ fontSize: 14, lineHeight: 1.9, marginBottom: 10 }}>
                        当サイトのサービスを利用するためには、所定の方法によるユーザー登録が必要となります。
                    </p>
                    <p style={{ fontSize: 14, lineHeight: 1.9 }}>
                        登録にあたっては、ユーザーは正確かつ最新の情報を提供するものとします。
                    </p>
                </section>

                <section style={{ marginBottom: 24 }}>
                    <h2 className="section-title" style={{ fontSize: 24, marginBottom: 10 }}>第3条（禁止行為）</h2>
                    <p style={{ fontSize: 14, lineHeight: 1.9, marginBottom: 10 }}>
                        ユーザーは、当サイトの利用にあたり、以下の行為を行ってはなりません。
                    </p>
                    <ul style={{ paddingLeft: 20, lineHeight: 1.9, fontSize: 14 }}>
                        <li>法令または公序良俗に違反する行為</li>
                        <li>他のユーザーまたは第三者の権利や利益を侵害する行為</li>
                        <li>当サイトの運営やサービス提供を妨げる行為</li>
                        <li>故意に虚偽または不正確な情報を提供する行為</li>
                        <li>その他、当サイトが不適切と判断する行為</li>
                    </ul>
                </section>

                <section style={{ marginBottom: 24 }}>
                    <h2 className="section-title" style={{ fontSize: 24, marginBottom: 10 }}>第4条（著作権）</h2>
                    <p style={{ fontSize: 14, lineHeight: 1.9, marginBottom: 10 }}>
                        当サイトに投稿された文章、画像、その他のコンテンツの著作権は、原則として投稿したユーザーに帰属します。
                    </p>
                    <p style={{ fontSize: 14, lineHeight: 1.9 }}>
                        ただし、当サイトはサービスの運営・改善・宣伝等の目的の範囲内で、当該コンテンツを無償で利用できるものとします。
                    </p>
                </section>

                <section style={{ marginBottom: 24 }}>
                    <h2 className="section-title" style={{ fontSize: 24, marginBottom: 10 }}>第5条（免責事項）</h2>
                    <p style={{ fontSize: 14, lineHeight: 1.9, marginBottom: 10 }}>
                        当サイトは、本サービスの利用または利用不能に関連してユーザーに生じた損害について、当サイトに故意または重大な過失がある場合を除き、責任を負えない場合があります。
                    </p>
                    <p style={{ fontSize: 14, lineHeight: 1.9 }}>
                        また、ユーザー間またはユーザーと第三者との間で発生したトラブルについても、当サイトは原則として関与せず、責任を負わないものとします。
                    </p>
                </section>

                <section style={{ marginBottom: 24 }}>
                    <h2 className="section-title" style={{ fontSize: 24, marginBottom: 10 }}>第6条（規約の変更）</h2>
                    <p style={{ fontSize: 14, lineHeight: 1.9, marginBottom: 10 }}>
                        当サイトは、必要と判断した場合、本規約を随時変更することがあります。
                    </p>
                    <p style={{ fontSize: 14, lineHeight: 1.9 }}>
                        変更後の規約は、当サイト上に掲載された時点から効力を有するものとします。
                    </p>
                </section>

                <section style={{ marginBottom: 28 }}>
                    <h2 className="section-title" style={{ fontSize: 24, marginBottom: 10 }}>第7条（外部サービスの利用）</h2>
                    <p style={{ fontSize: 14, lineHeight: 1.9, marginBottom: 10 }}>
                        当サイトでは、ユーザーデータの管理に Supabase を利用しています。
                    </p>
                    <p style={{ fontSize: 14, lineHeight: 1.9 }}>
                        ユーザー様は、本サービスを利用すること、または利用を継続することにより、上記の内容に同意したものとみなされます。
                    </p>
                </section>

                <Link href="/" className="login-back" style={{ marginTop: 0 }}>
                    ← ブログに戻る
                </Link>
            </div>
        </div>
    );
}
