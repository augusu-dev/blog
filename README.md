# Augusu Blog

薄いあずき色ベースの個人ブログサイト（GitHub Pages用）

## ファイル構成

```
├── index.html          ← サイト本体（基本触らない）
├── posts.json          ← ★ 記事一覧（ここを編集）
├── products.json       ← ★ プロダクト一覧（ここを編集）
├── posts/              ← ★ 記事の本文（Markdown）
│   ├── ai-creativity.md
│   └── ...
└── images/
    ├── a.png           ← アイコン画像（左上ロゴ + About Me）
    └── b.png           ← Homeのヘッダー背景画像
```

**普段触るファイルは `posts.json` と `posts/` フォルダだけ。**

---

## GitHub Pagesで公開する

### ステップ1: GitHubでリポジトリ作成
1. https://github.com/new を開く
2. Repository nameに `blog` と入力
3. **Public** を選択 → 「Create repository」

### ステップ2: ファイルをアップロード
1. 作成したリポジトリのページで「uploading an existing file」をクリック
2. この **フォルダの中身すべて** をドラッグ＆ドロップ（フォルダ自体ではなく中身）
3. 「Commit changes」をクリック

### ステップ3: Pages を有効にする
1. リポジトリの **Settings** → **Pages**
2. Branch: `main` / `/ (root)` を選択 → **Save**
3. 数分後に `https://augusu-dev.github.io/blog/` で公開

---

## 記事を追加する

### 1. Markdownファイルを作る

`posts/` に `.md` ファイルを追加。ファイル名 = 記事のID。

例: `posts/new-article.md`
```markdown
# タイトル

本文をここに書く。普通のMarkdownが使える。

## 見出し

- リスト
- **太字**
- `コード`
```

### 2. posts.json の先頭に追加

```json
[
  {
    "id": "new-article",         ← ファイル名と同じ（.mdなし）
    "title": "記事タイトル",
    "date": "2026-03-01",        ← YYYY-MM-DD形式
    "tags": ["タグ1", "タグ2"],
    "excerpt": "一覧に出る概要文"
  },
  ... 既存の記事 ...
]
```

### 3. GitHubにアップロード

**方法A: ブラウザで直接編集**
- GitHubのリポジトリページで `posts.json` をクリック → 鉛筆アイコンで編集
- `posts/` フォルダ内で「Add file」→ 「Create new file」でMDを追加

**方法B: ターミナル**
```bash
git add .
git commit -m "新しい記事を追加"
git push
```

---

## プロダクトを追加する

`products.json` に追加：
```json
{ "id": 17, "name": "ツール名", "desc": "説明文", "color": "#e8d5d0" }
```
`color` はサムネイル背景色。

---

## 画像を変更する

| 画像 | ファイル | 使われる場所 |
|------|---------|-------------|
| アイコン | `images/a.png` | 左上ロゴ、About Meのアバター |
| ヘッダー背景 | `images/b.png` | Homeのヒーロー画像 |

同じファイル名で上書きアップロードすれば差し替わる。

---

## index.html を編集する場所

基本的にはJSONとMDだけで運用できるが、以下は `index.html` を直接編集する：

| 変えたいもの | 検索ワード | 場所 |
|-------------|-----------|------|
| サイト名 | `Augusu Blog` | hero内のh1 |
| サブタイトル | `学び、作り、考える` | hero内のp |
| 自己紹介文 | `学ぶこと、作ること` | about-bio内 |
| 肩書き | `開発者 / 思考する人` | about-role |
| スキルタグ | `skill-tag` | skill-tags内 |
| Blueskyリンク | `bsky.app` | contact-link内のhref |
| GitHubリンク | `github.com` | contact-link内のhref |
| 色テーマ | `:root` | CSS変数（ファイル上部） |
| タグの色 | `TAG_COLORS` | script内のオブジェクト |

---

## RSSを後から追加したくなったら

GitHub Actionsで自動化できる。以下のファイルをリポジトリに作成：

`.github/workflows/rss.yml`
```yaml
name: Generate RSS
on:
  push:
    paths: ['posts.json']
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          python3 -c "
          import json
          from datetime import datetime
          with open('posts.json') as f: posts = json.load(f)
          items = ''
          for p in posts[:20]:
              d = datetime.strptime(p['date'], '%Y-%m-%d')
              items += f'<item><title>{p[\"title\"]}</title><description>{p[\"excerpt\"]}</description><pubDate>{d.strftime(\"%a, %d %b %Y 00:00:00 +0900\")}</pubDate><guid>{p[\"id\"]}</guid></item>\n'
          rss = f'<?xml version=\"1.0\" encoding=\"UTF-8\"?><rss version=\"2.0\"><channel><title>Augusu Blog</title>{items}</channel></rss>'
          with open('feed.xml', 'w') as f: f.write(rss)
          "
      - run: |
          git config user.name github-actions
          git config user.email github-actions@github.com
          git add feed.xml
          git diff --cached --quiet || git commit -m "Update RSS feed"
          git push
```

`posts.json` をpushすると自動で `feed.xml` が生成される。
その後 `index.html` の `<head>` に以下を1行追加：
```html
<link rel="alternate" type="application/rss+xml" title="Augusu Blog RSS" href="feed.xml">
```
