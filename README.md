# Augusu Blog

薄いあずき色をベースにした個人ブログサイトです。

## ファイル構成

```
site/
├── index.html          ← メインページ
├── posts.json          ← 記事の一覧（これを編集して記事を管理）
├── products.json       ← プロダクト一覧
├── posts/              ← Markdown記事ファイル
│   ├── ai-creativity.md
│   ├── threejs-universe.md
│   └── ...
├── images/
│   └── avatar.jpeg
└── README.md
```

## GitHub Pagesで公開する手順

### 1. GitHubでリポジトリを作成

1. [github.com/new](https://github.com/new) にアクセス
2. Repository name に `blog`（または `<ユーザー名>.github.io`）を入力
3. **Public** を選択
4. 「Create repository」をクリック

### 2. ファイルをアップロード

**方法A: ブラウザだけでやる（CLIなし）**

1. 作成したリポジトリのページで「uploading an existing file」リンクをクリック
2. この `site/` フォルダの **中身すべて** をドラッグ＆ドロップ
3. 「Commit changes」をクリック

**方法B: ターミナル（CLI）を使う**

```bash
cd site
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/<ユーザー名>/<リポジトリ名>.git
git push -u origin main
```

### 3. GitHub Pagesを有効にする

1. リポジトリの **Settings** → **Pages**
2. Source: 「Deploy from a branch」
3. Branch: `main` / `/ (root)`
4. 「Save」

数分後にサイトが公開されます：
- リポジトリ名が `blog` の場合 → `https://<ユーザー名>.github.io/blog/`
- リポジトリ名が `<ユーザー名>.github.io` の場合 → `https://<ユーザー名>.github.io/`

---

## 記事を追加する方法

たった2ステップです。

### ステップ1: Markdownファイルを作成

`posts/` フォルダに `.md` ファイルを作成します。

例: `posts/new-article.md`

```markdown
# 記事のタイトル

ここに本文を書きます。

## 見出し

通常のMarkdown記法が使えます。

- リスト
- **太字**
- `コード`

コードブロックも使えます：

\```javascript
console.log("Hello!");
\```
```

### ステップ2: posts.jsonの先頭に1行追加

`posts.json` を開いて、配列の **先頭** に新しいエントリを追加します：

```json
[
  {
    "id": "new-article",
    "title": "記事のタイトル",
    "date": "2026-03-01",
    "tags": ["タグ1", "タグ2"],
    "excerpt": "記事の概要を1〜2文で。"
  },
  ...既存の記事...
]
```

| フィールド | 説明 |
|-----------|------|
| `id` | ファイル名（拡張子なし）。`posts/` 内の `.md` ファイル名と一致させる |
| `title` | 記事タイトル |
| `date` | 日付 `YYYY-MM-DD` 形式 |
| `tags` | タグの配列。Homeやリストで色分け表示される |
| `excerpt` | 一覧に表示される概要文 |

### ステップ3: push（またはGitHubで直接編集）

```bash
git add .
git commit -m "新しい記事を追加"
git push
```

**GitHubのWebエディタでも直接編集・追加できます。**

---

## プロダクトを追加する

`products.json` を編集します：

```json
{ "id": 17, "name": "ツール名", "desc": "説明", "color": "#e8d5d0" }
```

`color` はサムネイル背景のグラデーション色です。

---

## カスタマイズ

| 項目 | 場所 |
|------|------|
| サイト名・自己紹介 | `index.html` 内のHTML |
| 色テーマ | `index.html` の `:root` CSS変数 |
| SNSリンク | `index.html` の Contact セクション |
| アバター画像 | `images/avatar.jpeg` を差し替え |
| タグの色 | `index.html` 内の `TAG_COLORS` オブジェクト |
