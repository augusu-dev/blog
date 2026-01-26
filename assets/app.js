const main = document.getElementById('main');
const nav = document.getElementById('nav');

function setActive(view){
  [...nav.querySelectorAll('a[data-link]')].forEach(a=>{
    const u = new URL(a.href, location.href);
    const v = u.searchParams.get('view') || '';
    a.classList.toggle('active', v === view);
  });
}

async function loadPosts(){
  const res = await fetch('./posts/index.json', { cache:'no-store' });
  if(!res.ok) throw new Error('posts/index.json not found');
  return await res.json();
}

function escapeHtml(s){
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#39;");
}

function renderPostList(posts){
  return `
    <ul class="post-list">
      ${posts.map(p=>`
        <li>
          <div class="post-title">
            <a href="./?view=post&slug=${encodeURIComponent(p.slug)}" data-link>${escapeHtml(p.title)}</a>
            <span class="post-date">${escapeHtml(p.date)}</span>
          </div>
          ${p.excerpt ? `<div class="post-excerpt">${escapeHtml(p.excerpt)}</div>` : ``}
        </li>
      `).join('')}
    </ul>
  `;
}

async function renderHome(){
  setActive('');
  const posts = await loadPosts();
  const mainPosts = posts.filter(p => (p.section || 'main') === 'main');
  main.innerHTML = renderPostList(mainPosts);
}

async function renderArchives(){
  setActive('archives');
  const posts = await loadPosts();
  const mainPosts = posts.filter(p => (p.section || 'main') === 'main');

  const byYear = new Map();
  for(const p of mainPosts){
    const y = (p.date || '').slice(0,4) || '----';
    if(!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(p);
  }
  const years = [...byYear.keys()].sort((a,b)=> b.localeCompare(a));
  years.forEach(y => byYear.get(y).sort((a,b)=> (b.date||'').localeCompare(a.date||'')));

  main.innerHTML = `
    <h1>Archives</h1>
    ${years.map(y=>`
      <div style="margin:14px 0 6px; font-weight:700;">${escapeHtml(y)}</div>
      ${renderPostList(byYear.get(y)).replace('<ul class="post-list">','<ul class="post-list">')}
    `).join('')}
  `;
}

async function renderOther(){
  setActive('other');
  const posts = await loadPosts();
  const otherPosts = posts.filter(p => (p.section || 'main') === 'other');
  main.innerHTML = `
    <h1>その他</h1>
    <p style="margin:0 0 14px; color:var(--muted);">Archivesに残したくない記事置き場</p>
    ${renderPostList(otherPosts)}
  `;
}

async function renderSearch(){
  setActive('search');
  const posts = await loadPosts();
  const q0 = new URL(location.href).searchParams.get('q') || '';

  main.innerHTML = `
    <h1>Search</h1>
    <input id="q" type="search" placeholder="タイトル/概要で検索" value="${escapeHtml(q0)}">
    <div style="margin-top:12px; color:var(--muted); font-size:13px;">検索結果</div>
    <div id="results" style="margin-top:8px;"></div>
  `;

  const q = document.getElementById('q');
  const results = document.getElementById('results');

  const run = () => {
    const term = q.value.trim().toLowerCase();
    const filtered = term
      ? posts.filter(p =>
          (p.title||'').toLowerCase().includes(term) ||
          (p.excerpt||'').toLowerCase().includes(term)
        )
      : posts;

    results.innerHTML = renderPostList(filtered);
  };

  q.addEventListener('input', ()=>{
    const u = new URL(location.href);
    u.searchParams.set('view','search');
    if(q.value.trim()) u.searchParams.set('q', q.value.trim());
    else u.searchParams.delete('q');
    history.replaceState({}, '', u);
    run();
  });

  run();
}

async function renderAbout(){
  setActive('about');
  const res = await fetch('./pages/about.md', { cache:'no-store' });
  const md = res.ok ? await res.text() : '# About Me\n\n`pages/about.md` がありません。';
  main.innerHTML = window.marked.parse(md, { mangle:false, headerIds:true });
}

async function renderPost(slug){
  setActive('');

  const posts = await loadPosts();
  const post = posts.find(p => p.slug === slug);

  if(!post){
    main.innerHTML = `<h1>Not Found</h1><p>記事が見つかりません。</p>`;
    return;
  }

  document.title = `アウグス - ${post.title}`;

  // ★ HTMLファイル（ゲームなど）の場合
  if(post.file.endsWith('.html')){
    main.innerHTML = `
      <div style="color:var(--muted); font-size:12px; margin-bottom:6px;">${escapeHtml(post.date)}</div>
      <h1>${escapeHtml(post.title)}</h1>
      <p style="margin:16px 0;">
        <a href="./posts/${post.file}" target="_blank" style="font-size:15px;">🎮 別タブで開く</a>
        　
        <a href="./posts/${post.file}" style="font-size:15px;">▶ このタブで開く</a>
      </p>
      <hr style="border:none; border-top:1px solid var(--border); margin:16px 0;">
    `;
    return;
  }

  // ★ MDファイルの場合
  const res = await fetch(`./posts/${post.file}`, { cache:'no-store' });
  const md = res.ok ? await res.text() : '# Markdown not found';
  const html = window.marked.parse(md, { mangle:false, headerIds:true });

  main.innerHTML = `
    <div style="color:var(--muted); font-size:12px; margin-bottom:6px;">${escapeHtml(post.date)}</div>
    ${html}
    <hr style="border:none; border-top:1px solid var(--border); margin:16px 0;">
    <div style="color:var(--muted); font-size:13px;">
      （ここに後で：絵文字投票 / コメント（Utterances or Isso）を埋め込み可能）
    </div>
  `;
}

async function route(){
  const u = new URL(location.href);
  const view = u.searchParams.get('view') || '';
  const slug = u.searchParams.get('slug') || '';

  if(view === '') return await renderHome();
  if(view === 'about') return await renderAbout();
  if(view === 'search') return await renderSearch();
  if(view === 'archives') return await renderArchives();
  if(view === 'other') return await renderOther();
  if(view === 'post') return await renderPost(slug);

  return await renderHome();
}

document.addEventListener('click', (e)=>{
  const a = e.target.closest('a[data-link]');
  if(!a) return;
  e.preventDefault();
  history.pushState({}, '', a.getAttribute('href'));
  route();
});

window.addEventListener('popstate', route);

route().catch(err=>{
  main.innerHTML = `<h1>Error</h1><pre>${escapeHtml(err?.message || String(err))}</pre>`;
});
