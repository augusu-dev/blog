/* eslint-disable */
"use client";
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type Language = 'ja' | 'en' | 'zh';

export const TRANSLATIONS = {
    ja: {
        "Next Blog": "Next Blog",
        "✏ 記事を書く": "✏ 記事を書く",
        "マイページ": "マイページ",
        "ログイン": "ログイン",
        "思考と創造を共有するプラットフォーム。": "思考と創造を共有するプラットフォーム。",
        "ユーザーを検索...": "ユーザーを検索...",
        "検索": "検索",
        "最近の記事": "最近の記事",
        "まだ記事がありません。ログインして最初の記事を書きましょう。": "まだ記事がありません。ログインして最初の記事を書きましょう。",
        "プロダクト": "プロダクト",
        "設定": "設定",
        "プロフィール": "プロフィール",
        "ユーザー名": "ユーザー名",
        "プロフィール画像": "プロフィール画像",
        "画像を選択 (最大4.5MB)": "画像を選択 (最大4.5MB)",
        "画像をアップロード中...": "画像をアップロード中...",
        "ヘッダー画像": "ヘッダー画像",
        "ヘッダー画像をアップロード中...": "ヘッダー画像をアップロード中...",
        "未設定": "未設定",
        "自己紹介": "自己紹介",
        "自己紹介を入力": "自己紹介を入力",
        "SNSリンク": "SNSリンク",
        "ラベル (例: Twitter)": "ラベル (例: Twitter)",
        "URL (https://...)": "URL (https://...)",
        "追加": "追加",
        "おすすめの表示設定": "おすすめの表示設定",
        "あなたのプロフィールに「おすすめ」として表示されるコンテンツを選べます。": "あなたのプロフィールに「おすすめ」として表示されるコンテンツを選べます。",
        "（最大5つまで）": "（最大5つまで）",
        "データとバックアップ": "データとバックアップ",
        "あなたの全ての記事（下書き含む）、プロダクト、設定データをエクスポートできます。": "あなたの全ての記事（下書き含む）、プロダクト、設定データをエクスポートできます。",
        "データのエクスポート": "データのエクスポート",
        "エクスポート中...": "エクスポート中...",
        "言語設定": "言語設定",
        "ログアウト": "ログアウト",
        "アカウント削除": "アカウント削除",
        "本当にアカウントを削除しますか？\n※この操作は取り消せません。": "本当にアカウントを削除しますか？\n※この操作は取り消せません。",
        "削除する": "削除する",
        "下書き保存": "下書き保存",
        "公開する": "公開する",
        "保存中...": "保存中...",
        "📝 ブログ": "📝 ブログ",
        "🛠 プロダクト": "🛠 プロダクト",
        "+ 新規": "+ 新規",
        "まだ記事がありません。": "まだ記事がありません。",
        "おすすめ": "おすすめ",
        "Blog": "Blog",
        "メールアドレス": "メールアドレス",
        "メールアドレスは変更できません": "メールアドレスは変更できません",
        "自己紹介 (短め・ホーム用)": "自己紹介 (短め・ホーム用)",
        "一行から二行程度の自己紹介...": "一行から二行程度の自己紹介...",
        "About me (長めのプロフ・詳細用)": "About me (長めのプロフ・詳細用)",
        "自分について詳しく紹介してください...": "自分について詳しく紹介してください...",
        "リンク / SNS": "リンク / SNS",
        "URLを入力するとあなたのプロフィールに表示されます。クリックで新しいタブで開きます。": "URLを入力するとあなたのプロフィールに表示されます。クリックで新しいタブで開きます。",
        "名前 (例: GitHub)": "名前 (例: GitHub)",
        "＋ リンクを追加": "＋ リンクを追加",
        "最大5つまで": "最大5つまで",
        "おすすめ表示": "おすすめ表示",
        "公開済みの記事やプロダクトがありません。": "公開済みの記事やプロダクトがありません。",
        "危険な操作": "危険な操作",
        "アカウントを削除する": "アカウントを削除する",
        "アカウントを削除すると、すべての投稿データも完全に削除されます。": "アカウントを削除すると、すべての投稿データも完全に削除されます。",
        "設定を保存": "設定を保存",
        "データをエクスポート": "データをエクスポート",
        "翻訳に失敗しました": "翻訳に失敗しました",
        "翻訳エラーが発生しました": "翻訳エラーが発生しました",
        "設定を保存しました。": "設定を保存しました。",
        "保存に失敗しました。": "保存に失敗しました。",
        "エラーが発生しました。": "エラーが発生しました。",
        "すべての投稿データも削除されます。本当に削除しますか？": "すべての投稿データも削除されます。本当に削除しますか？",
        "アカウント削除に失敗しました。": "アカウント削除に失敗しました。",
        "おすすめは最大5つまでです": "おすすめは最大5つまでです",
        "読み込み中...": "読み込み中...",
        "4.5MB以下の画像を選択してください": "4.5MB以下の画像を選択してください",
        "アップロード失敗": "アップロード失敗",
        "予期せぬエラーが発生しました": "予期せぬエラーが発生しました",
        "あなたの設定、自己紹介、そしてこれまで投稿したすべての記事やプロダクトのデータをJSON形式でエクスポート（ダウンロード）できます。": "あなたの設定、自己紹介、そしてこれまで投稿したすべての記事やプロダクトのデータをJSON形式でエクスポート（ダウンロード）できます。"
    },
    en: {
        "Next Blog": "Next Blog",
        "✏ 記事を書く": "✏ Write Post",
        "マイページ": "My Page",
        "ログイン": "Login",
        "思考と創造を共有するプラットフォーム。": "A platform to share thoughts and creations.",
        "ユーザーを検索...": "Search users...",
        "検索": "Search",
        "最近の記事": "Recent Posts",
        "まだ記事がありません。ログインして最初の記事を書きましょう。": "No posts yet. Log in to write your first post.",
        "プロダクト": "Products",
        "設定": "Settings",
        "プロフィール": "Profile",
        "ユーザー名": "Username",
        "プロフィール画像": "Profile Image",
        "画像を選択 (最大4.5MB)": "Select Image (Max 4.5MB)",
        "画像をアップロード中...": "Uploading image...",
        "ヘッダー画像": "Header Image",
        "ヘッダー画像をアップロード中...": "Uploading header image...",
        "未設定": "Not set",
        "自己紹介": "Bio",
        "自己紹介を入力": "Enter your bio",
        "SNSリンク": "Social Links",
        "ラベル (例: Twitter)": "Label (e.g. Twitter)",
        "URL (https://...)": "URL (https://...)",
        "追加": "Add",
        "おすすめの表示設定": "Recommendation Settings",
        "あなたのプロフィールに「おすすめ」として表示されるコンテンツを選べます。": "Choose the content you want to display as 'Recommended' on your profile.",
        "（最大5つまで）": "(Maximum 5 items)",
        "データとバックアップ": "Data & Backup",
        "あなたの全ての記事（下書き含む）、プロダクト、設定データをエクスポートできます。": "You can export all your posts (including drafts), products, and setting data.",
        "データのエクスポート": "Export Data",
        "エクスポート中...": "Exporting...",
        "言語設定": "Language",
        "ログアウト": "Log Out",
        "アカウント削除": "Delete Account",
        "本当にアカウントを削除しますか？\n※この操作は取り消せません。": "Are you sure you want to delete your account?\n*This action cannot be undone.",
        "削除する": "Delete",
        "下書き保存": "Save Draft",
        "公開する": "Publish",
        "保存中...": "Saving...",
        "📝 ブログ": "📝 Blog",
        "🛠 プロダクト": "🛠 Product",
        "＋ 新規": "＋ New",
        "まだ記事がありません。": "No posts yet.",
        "おすすめ": "Featured",
        "Blog": "Blog",
        "メールアドレス": "Email",
        "メールアドレスは変更できません": "Email address cannot be changed.",
        "自己紹介 (短め・ホーム用)": "Bio (Short)",
        "一行から二行程度の自己紹介...": "One or two lines about yourself...",
        "About me (長めのプロフ・詳細用)": "About me (Detailed)",
        "自分について詳しく紹介してください...": "Introduce yourself in detail...",
        "リンク / SNS": "Links / Social Media",
        "URLを入力するとあなたのプロフィールに表示されます。クリックで新しいタブで開きます。": "Enter URLs to display on your profile. Opens in new tab.",
        "名前 (例: GitHub)": "Name (e.g. GitHub)",
        "＋ リンクを追加": "+ Add Link",
        "最大5つまで": "Max 5",
        "おすすめ表示": "Show as Featured",
        "公開済みの記事やプロダクトがありません。": "No published posts or products yet.",
        "危険な操作": "Danger Zone",
        "アカウントを削除する": "Delete Account",
        "アカウントを削除すると、すべての投稿データも完全に削除されます。": "Deleting your account will permanently delete all your posts.",
        "設定を保存": "Save Settings",
        "データをエクスポート": "Export Data",
        "翻訳に失敗しました": "Translation failed",
        "翻訳エラーが発生しました": "An error occurred while translating",
        "設定を保存しました。": "Settings saved successfully.",
        "保存に失敗しました。": "Failed to save settings.",
        "エラーが発生しました。": "An error occurred.",
        "すべての投稿データも削除されます。本当に削除しますか？": "All your post data will also be deleted. Are you sure you want to delete?",
        "アカウント削除に失敗しました。": "Failed to delete account.",
        "おすすめは最大5つまでです": "You can pin up to 5 items.",
        "読み込み中...": "Loading...",
        "4.5MB以下の画像を選択してください": "Please select an image under 4.5MB.",
        "アップロード失敗": "Upload failed",
        "予期せぬエラーが発生しました": "An unexpected error occurred.",
        "あなたの設定、自己紹介、そしてこれまで投稿したすべての記事やプロダクトのデータをJSON形式でエクスポート（ダウンロード）できます。": "You can export all your setting data, bio, and all posts and products you have published in JSON format."
    },
    zh: {
        "Next Blog": "Next Blog",
        "✏ 記事を書く": "✏ 写文章",
        "マイページ": "我的主页",
        "ログイン": "登录",
        "思考と創造を共有するプラットフォーム。": "分享思考与创造的平台。",
        "ユーザーを検索...": "搜索用户...",
        "検索": "搜索",
        "最近の記事": "最新文章",
        "まだ記事がありません。ログインして最初の記事を書きましょう。": "还没有文章。请登录并写下您的第一篇文章。",
        "プロダクト": "产品",
        "設定": "设置",
        "プロフィール": "个人资料",
        "ユーザー名": "用户名",
        "プロフィール画像": "头像",
        "画像を選択 (最大4.5MB)": "选择图片 (最大 4.5MB)",
        "画像をアップロード中...": "正在上传图片...",
        "ヘッダー画像": "主页背景图",
        "ヘッダー画像をアップロード中...": "正在上传背景图...",
        "未設定": "未设置",
        "自己紹介": "自我介绍",
        "自己紹介を入力": "输入自我介绍",
        "SNSリンク": "社交链接",
        "ラベル (例: Twitter)": "标签 (例如：Twitter)",
        "URL (https://...)": "网址 (https://...)",
        "追加": "添加",
        "おすすめの表示設定": "推荐显示设置",
        "あなたのプロフィールに「おすすめ」として表示されるコンテンツを選べます。": "您可以选择在您的主页上显示为“推荐”的内容。",
        "（最大5つまで）": "（最多5个）",
        "データとバックアップ": "数据及备份",
        "あなたの全ての記事（下書き含む）、プロダクト、設定データをエクスポートできます。": "您可以导出所有文章（包含草稿）、产品和设置数据。",
        "データのエクスポート": "导出数据",
        "エクスポート中...": "导出中...",
        "言語設定": "语言设置",
        "ログアウト": "退出登录",
        "アカウント削除": "注销账号",
        "本当にアカウントを削除しますか？\n※この操作は取り消せません。": "确实要删除账号吗？\n※该操作无法撤销。",
        "削除する": "删除",
        "下書き保存": "保存为草稿",
        "公開する": "发布",
        "保存中...": "保存中...",
        "📝 ブログ": "📝 博客",
        "🛠 プロダクト": "🛠 产品",
        "＋ 新規": "＋ 新建",
        "まだ記事がありません。": "还没有文章。",
        "おすすめ": "推荐",
        "Blog": "Blog",
        "メールアドレス": "电子邮件",
        "メールアドレスは変更できません": "电子邮箱地址无法更改",
        "自己紹介 (短め・ホーム用)": "个人简介（简短）",
        "一行から二行程度の自己紹介...": "用一两行介绍自己...",
        "About me (長めのプロフ・詳細用)": "详细介绍",
        "自分について詳しく紹介してください...": "详细介绍自己...",
        "リンク / SNS": "外部链接 / 社交媒体",
        "URLを入力するとあなたのプロフィールに表示されます。クリックで新しいタブで開きます。": "输入URL以在主页显示。点击在新标签页打开。",
        "名前 (例: GitHub)": "名称 (例如：GitHub)",
        "＋ リンクを追加": "＋ 添加链接",
        "最大5つまで": "最多 5 个",
        "おすすめ表示": "推荐显示",
        "公開済みの記事やプロダクトがありません。": "还没有已发布的文章或产品。",
        "危険な操作": "危险操作",
        "アカウントを削除する": "注销账号",
        "アカウントを削除すると、すべての投稿データも完全に削除されます。": "注销账号将永久删除您的所有文章数据。",
        "設定を保存": "保存设置",
        "データをエクスポート": "导出数据",
        "翻訳に失敗しました": "翻译失败",
        "翻訳エラーが発生しました": "翻译时出错",
        "設定を保存しました。": "设置保存成功。",
        "保存に失敗しました。": "设置保存失败。",
        "エラーが発生しました。": "发生错误。",
        "すべての投稿データも削除されます。本当に削除しますか？": "您的所有发帖数据也将被删除。确实要删除吗？",
        "アカウント削除に失敗しました。": "注销账号失败。",
        "おすすめは最大5つまでです": "最多推荐 5 个项目。",
        "読み込み中...": "加载中...",
        "4.5MB以下の画像を選択してください": "请选择4.5MB以下的图片。",
        "アップロード失敗": "上传失败",
        "予期せぬエラーが発生しました": "发生了意外错误。",
        "あなたの設定、自己紹介、そしてこれまで投稿したすべての記事やプロダクトのデータをJSON形式でエクスポート（ダウンロード）できます。": "您可以导出所有的设置数据、自我介绍，以及您发布的所有文章和产品（JSON格式）。"
    }
};

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
    const [language, setLanguageState] = useState<Language>('ja');
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
        const saved = localStorage.getItem('app-language');
        if (saved && ['ja', 'en', 'zh'].includes(saved)) {
            setLanguageState(saved as Language);
        }
    }, []);

    const setLanguage = (lang: Language) => {
        setLanguageState(lang);
        localStorage.setItem('app-language', lang);
    };

    const t = (key: string) => {
        // Only resolve translations safely
        const dict = TRANSLATIONS[language] as any;
        if (dict && dict[key]) {
            return dict[key];
        }
        return key;
    };

    // Render provider always to ensure useLanguage doesn't throw on server
    return (
        <LanguageContext.Provider value={{ language, setLanguage, t }}>
            {isClient ? children : <div style={{ visibility: 'hidden' }}>{children}</div>}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const context = useContext(LanguageContext);
    if (context === undefined) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
}
