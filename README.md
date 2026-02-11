# Augusu Blog

## ファイル構成

```
├── index.html          ← サイト本体
├── posts.json          ← ★ 記事一覧
├── products.json       ← ★ プロダクト一覧
├── posts/              ← ★ 記事本文（Markdown）
└── images/
    ├── a.png           ← アイコン（左上ロゴ + About Me）
    └── b.png           ← Homeヘッダー背景
```

## 公開手順

1. https://github.com/new でリポジトリ作成（名前: `blog`、Public）
2. 「uploading an existing file」→ フォルダの中身すべてをドラッグ＆ドロップ → Commit
3. Settings → Pages → Branch: `main` / `/ (root)` → Save

## 記事追加（2ステップ）

**① `posts/` にMarkdownファイルを作る**
```markdown
# タイトル
本文。普通のMarkdown。
```

**② `posts.json` の先頭に1行追加**
```json
{ "id": "ファイル名", "title": "タイトル", "date": "2026-03-01", "tags": ["タグ"], "excerpt": "概要" }
```

## 編集箇所

| 変更内容 | ファイル | 検索ワード |
|---------|---------|-----------|
| 記事 | `posts.json` + `posts/*.md` | — |
| プロダクト | `products.json` | — |
| アイコン | `images/a.png` を上書き | — |
| ヘッダー画像 | `images/b.png` を上書き | — |
| サイト名 | `index.html` | `Augusu Blog` |
| 自己紹介 | `index.html` | `学ぶこと、作ること` |
| SNSリンク | `index.html` | `bsky.app` / `github.com` |
| 色テーマ | `index.html` | `:root` |
