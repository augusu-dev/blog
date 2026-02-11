#!/bin/bash
# feed.xmlをposts.jsonから自動生成するスクリプト
# 使い方: bash generate-feed.sh
# 記事を追加した後に実行すると、RSSフィードが自動更新されます

SITE_URL="https://augusu-dev.github.io/blog"

echo '<?xml version="1.0" encoding="UTF-8"?>' > feed.xml
echo '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">' >> feed.xml
echo '  <channel>' >> feed.xml
echo "    <title>Augusu Blog</title>" >> feed.xml
echo "    <link>${SITE_URL}/</link>" >> feed.xml
echo '    <description>学び、作り、考える。日々の記録。</description>' >> feed.xml
echo '    <language>ja</language>' >> feed.xml
echo "    <atom:link href=\"${SITE_URL}/feed.xml\" rel=\"self\" type=\"application/rss+xml\"/>" >> feed.xml

# posts.jsonから各記事を読み取り
python3 -c "
import json, sys
from datetime import datetime

with open('posts.json', 'r') as f:
    posts = json.load(f)

for p in posts[:20]:
    d = datetime.strptime(p['date'], '%Y-%m-%d')
    pub = d.strftime('%a, %d %b %Y 00:00:00 +0900')
    print(f'''    <item>
      <title>{p['title']}</title>
      <link>${SITE_URL}/#{p['id']}</link>
      <description>{p['excerpt']}</description>
      <pubDate>{pub}</pubDate>
      <guid>{p['id']}</guid>
    </item>''')
" >> feed.xml

echo '  </channel>' >> feed.xml
echo '</rss>' >> feed.xml

echo "✅ feed.xml を更新しました（$(grep -c '<item>' feed.xml) 記事）"
