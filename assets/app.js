// /blog/assets/app.js
const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];

export async function loadIndex(){
  // /blog 配下運用なので相対パス
  const res = await fetch('./posts/index.json', { cache: 'no-store' });
  if(!res.ok) throw new Error('posts/index.json not found');
  return await res.json();
}

export function renderPostList(listEl, posts){
  listEl.innerHTML = posts.map(p => `
    <li>
      <div class="post-title">
        <a href="./post.html?slug=${encodeURIComponent(p.slug)}">${escapeHtml(p.title)}</a>
        <span class="post-date">${escapeHtml(p.date)}</span>
      </div>
      ${p.excerpt ? `<div class="post-excerpt">${escapeHtml(p.excerpt)}</div>` : ``}
    </li>
  `).join('');
}

export async function loadAndRenderMarkdown(articleEl, mdPath){
  // marked は post.html で読み込む
  const res = await fetch(mdPath, { cache: 'no-store' });
  if(!res.ok) throw new Error('Markdown not found: ' + mdPath);
  const md = await res.text();
  articleEl.innerHTML = window.marked.parse(md, { mangle:false, headerIds:true });
}

export function getQuery(name){
  const u = new URL(location.href);
  return u.searchParams.get(name);
}

export function setActiveNav(path){

  $$('.nav a').forEach(a=>{
    if(a.getAttribute('href') === path) a.style.fontWeight = '700';
  });
}

// ========== Reactions ==========
const REACTIONS = [
  { key:'upvote', emoji:'👍', label:'Upvote' },
  { key:'funny',  emoji:'😆', label:'Funny'  },
  { key:'love',   emoji:'😍', label:'Love'   },
  { key:'wow',    emoji:'😮', label:'Surprised' },
  { key:'angry',  emoji:'😠', label:'Angry'  },
  { key:'sad',    emoji:'😢', label:'Sad'    },
];

function storageKey(slug){ return `augusu_reacted_${slug}`; }

// options: { apiBase?: string } 例: https://api.example.com
export async function initReactions(rootEl, slug, options={}){
  rootEl.innerHTML = `
    <h3>What do you think?</h3>
    <div class="reaction-row">
      ${REACTIONS.map(r=>`
        <button class="react" data-key="${r.key}" type="button" aria-label="${r.label}">
          <div class="emoji">${r.emoji}</div>
          <div class="label">${r.label}</div>
          <div class="count" data-count="${r.key}">0</div>
        </button>
      `).join('')}
    </div>
  `;

  // 初期表示
  const counts = await fetchCounts(slug, options.apiBase);
  for(const r of REACTIONS){
    const el = rootEl.querySelector(`[data-count="${r.key}"]`);
    if(el) el.textContent = String(counts[r.key] ?? 0);
  }

  // 1絵文字につき1回（ローカルで管理）
  const reacted = getReactedMap(slug);

  rootEl.addEventListener('click', async (e)=>{
    const btn = e.target.closest('.react');
    if(!btn) return;
    const key = btn.dataset.key;

    if(reacted[key]) return;

    reacted[key] = true;
    setReactedMap(slug, reacted);

    // 先にUIを+1
    const cEl = rootEl.querySelector(`[data-count="${key}"]`);
    if(cEl) cEl.textContent = String((Number(cEl.textContent)||0) + 1);

    try{
      await postReaction(slug, key, options.apiBase);
    }catch(err){
      console.warn('reaction post failed', err);
    }
  });
}

function getReactedMap(slug){
  try{ return JSON.parse(localStorage.getItem(storageKey(slug)) || '{}'); }
  catch{ return {}; }
}
function setReactedMap(slug, obj){
  localStorage.setItem(storageKey(slug), JSON.stringify(obj));
}

async function fetchCounts(slug, apiBase){
  if(!apiBase) return {};
  const res = await fetch(`${apiBase}/reactions?slug=${encodeURIComponent(slug)}`, { cache:'no-store' });
  if(!res.ok) throw new Error('fetchCounts failed');
  return await res.json();
}

async function postReaction(slug, key, apiBase){
  if(!apiBase) return;
  const res = await fetch(`${apiBase}/reactions`, {
    method:'POST',
    headers:{ 'content-type':'application/json' },
    body: JSON.stringify({ slug, key })
  });
  if(!res.ok) throw new Error('postReaction failed');
}

function escapeHtml(s){
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#39;");
}
