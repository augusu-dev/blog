import Link from "next/link";

export default function VerifyPage() {
    return (
        <div className="login-container">
            <div className="login-card">
                <h1 className="login-title">メールを確認</h1>
                <div className="login-message">
                    <strong>✉️ ログインリンクを送信しました</strong><br />
                    <span style={{ fontSize: 13 }}>
                        メールボックスを確認して、ログインリンクをクリックしてください。<br />
                        メールが届かない場合は、迷惑メールフォルダもご確認ください。
                    </span>
                </div>
                <Link href="/login" className="login-back">
                    ← ログインページに戻る
                </Link>
            </div>
        </div>
    );
}
