/* ============================================================
   【使用方法】
   1. posts/ フォルダに YYYY-MM-DD-タイトル.md を作成
      フロントマターに author を追加:
        ---
        title: タイトル
        date: 2026-05-10
        category: 開発
        author: zukki        ← zukki / Takasou / neo / zari
        thumbnail: images/xxx.jpg
        ---
   2. posts/index.json に1行追加（author フィールドも任意で追加可）
   3. コミット＆プッシュするだけ！
   ============================================================ */

(function () {
  'use strict';

  const POSTS_PER_PAGE = 12;

  const SUPABASE_URL  = 'https://xtbjbnifcxurudzbgoxk.supabase.co';
  const SUPABASE_ANON = 'sb_publishable_uL-wGAOMd5STLBLZgzXqvw_Q6cV1Pjh';

  const useSupabase = !!(SUPABASE_URL && SUPABASE_ANON);

  /* ── メンバー定義 ── */
  const MEMBERS = {
    zukki:   { name: 'zukki',   role: '回路設計 / LEADER',         initials: 'ZK' },
    Takasou: { name: 'Takasou', role: '機械設計',                  initials: 'TK' },
    neo:     { name: 'neo',     role: '制御 - ALGORITHM',          initials: 'NO' },
    zari:    { name: 'zari',    role: '制御 - CAMERA & WIRELESS',  initials: 'ZR' },
  };

  /* ── DOM 参照 ── */
  const listView       = document.getElementById('listView');
  const articleView    = document.getElementById('articleView');
  const blogGrid       = document.getElementById('blogGrid');
  const filterBar      = document.getElementById('filterBar');
  const postCount      = document.getElementById('postCount');
  const articleMeta    = document.getElementById('articleMeta');
  const articleBody    = document.getElementById('articleBody');
  const articleNav     = document.getElementById('articleNav');
  const articleActions = document.getElementById('articleActions');
  const backBtn        = document.getElementById('backBtn');
  const sortKeyEl      = document.getElementById('sortKey');
  const sortDirEl      = document.getElementById('sortDir');

  /* ── 状態 ── */
  let allPosts     = [];
  let currentCat   = 'all';
  let currentPage  = 1;
  let currentIndex = -1;
  let sortKey      = 'date';
  let sortDir      = 'desc';

  /* ── Supabase カウントキャッシュ ── */
  const statsCache = {};  // { [file]: { views, likes } }

  /* ============================================================
     Supabase ヘルパー
     ============================================================ */
  async function sbFetch(path, opts = {}) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...opts,
      headers: {
        'apikey':        SUPABASE_ANON,
        'Authorization': `Bearer ${SUPABASE_ANON}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=representation',
        ...(opts.headers || {}),
      },
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}`);
    return res.json();
  }

  /* 全記事のカウントを一括取得してキャッシュ */
  async function sbBatchLoad(files) {
    if (!files.length) return;
    try {
      const filter = files.map(f => `"${f}"`).join(',');
      const rows = await sbFetch(
        `blog_stats?file=in.(${filter})&select=file,views,likes`
      );
      rows.forEach(r => { statsCache[r.file] = { views: r.views, likes: r.likes }; });
    } catch (e) { console.warn('Supabase batch load failed:', e.message); }
  }

  /* upsert（INSERT or UPDATE） */
  async function sbUpsert(file, views, likes) {
    statsCache[file] = { views, likes };
    try {
      await sbFetch('blog_stats', {
        method:  'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
        body:    JSON.stringify({ file, views, likes }),
      });
    } catch (e) { console.warn('Supabase upsert failed:', e.message); }
  }

  /* ============================================================
     localStorage フォールバック
     ============================================================ */
  const LS_KEY = 'thrcot_blog';

  function lsLoad()    { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; } }
  function lsSave(d)   { try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch {} }
  function lsGet(file) { return lsLoad()[file] || { views: 0, likes: 0, liked: false }; }
  function lsSet(file, patch) {
    const s = lsLoad();
    s[file] = { ...lsGet(file), ...patch };
    lsSave(s);
  }

  /* ── いいね済みフラグは常に localStorage ── */
  function isLiked(file)     { return lsGet(file).liked; }
  function setLiked(file, v) { lsSet(file, { liked: v }); }

  /* ── カウント取得（Supabase or localStorage） ── */
  function getStats(file) {
    if (useSupabase) return statsCache[file] || { views: 0, likes: 0 };
    const r = lsGet(file);
    return { views: r.views, likes: r.likes };
  }

  /* ── 閲覧数インクリメント ── */
  async function incrementViews(file) {
    const sessionKey = 'thrcot_viewed_' + file;
    if (sessionStorage.getItem(sessionKey)) return;  // 同セッション重複防止
    sessionStorage.setItem(sessionKey, '1');

    if (useSupabase) {
      const cur = statsCache[file] || { views: 0, likes: 0 };
      const newViews = cur.views + 1;
      await sbUpsert(file, newViews, cur.likes);
    } else {
      const r = lsGet(file);
      lsSet(file, { views: r.views + 1 });
    }
  }

  /* ── いいね切り替え ── */
  async function toggleLike(file) {
    const nowLiked = !isLiked(file);
    setLiked(file, nowLiked);

    if (useSupabase) {
      const cur = statsCache[file] || { views: 0, likes: 0 };
      const newLikes = Math.max(0, cur.likes + (nowLiked ? 1 : -1));
      await sbUpsert(file, cur.views, newLikes);
      return { liked: nowLiked, likes: newLikes };
    } else {
      const r = lsGet(file);
      const newLikes = Math.max(0, r.likes + (nowLiked ? 1 : -1));
      lsSet(file, { likes: newLikes });
      return { liked: nowLiked, likes: newLikes };
    }
  }

  /* ============================================================
     フロントマター解析
     ============================================================ */
  function parseFrontmatter(raw) {
    const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
    if (!match) return { meta: {}, body: raw };
    const meta = {};
    match[1].split('\n').forEach(line => {
      const [key, ...rest] = line.split(':');
      if (key) meta[key.trim()] = rest.join(':').trim();
    });
    return { meta, body: match[2] };
  }

  /* ============================================================
     ユーティリティ
     ============================================================ */
  function formatDate(str) {
    const d = new Date(str);
    if (isNaN(d)) return str;
    return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function fmtNum(n) {
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
  }

  /* ============================================================
     SVG アイコン
     ============================================================ */
  const ICONS = {
    heart: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`,
    eye:   `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`,
    /* 公式 X (Twitter) ロゴ */
    xLogo: `<svg viewBox="0 0 1200 1227" xmlns="http://www.w3.org/2000/svg"><path d="M714.163 519.284 1160.89 0h-105.86L667.137 450.887 357.328 0H0l468.492 681.821L0 1226.37h105.866l409.625-476.152 327.181 476.152H1200L714.137 519.284zM569.165 687.828l-47.468-67.894-377.686-540.24h162.604l304.797 435.991 47.468 67.894 396.2 566.721H892.476L569.165 687.854z"/></svg>`,
  };

  /* ============================================================
     著者バッジ HTML
     ============================================================ */
  function authorBadgeHtml(authorKey) {
    const m = MEMBERS[authorKey];
    if (!m) return '';
    return `
      <div class="author-badge">
        <div class="author-initial">${m.initials}</div>
        <div class="author-info">
          <div class="author-name">${m.name}</div>
          <div class="author-role">${m.role}</div>
        </div>
      </div>`;
  }

  /* カード用著者チップ */
  function authorChipHtml(authorKey) {
    const m = MEMBERS[authorKey];
    if (!m) return '';
    return `<div class="blog-card-author">
      <span class="card-author-initial">${m.initials}</span>
      <span class="card-author-name">${m.name}</span>
    </div>`;
  }

  /* ============================================================
     フィルターボタン生成
     ============================================================ */
  function buildFilters(posts) {
    const cats = [...new Set(posts.map(p => p.category).filter(Boolean))];
    cats.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'filter-btn';
      btn.dataset.cat = cat;
      btn.textContent = cat;
      btn.addEventListener('click', () => setFilter(cat));
      filterBar.appendChild(btn);
    });
  }

  function setFilter(cat) {
    currentCat  = cat;
    currentPage = 1;
    document.querySelectorAll('.filter-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.cat === cat);
    });
    renderList();
  }

  /* ============================================================
     並べ替え（Supabase時はキャッシュ値、localStorage時はlsから）
     ============================================================ */
  function getSortedFiltered() {
    let posts = currentCat === 'all'
      ? [...allPosts]
      : allPosts.filter(p => p.category === currentCat);

    posts.sort((a, b) => {
      let va, vb;
      if (sortKey === 'date') {
        va = new Date(a.date).getTime();
        vb = new Date(b.date).getTime();
      } else {
        va = getStats(a.file)[sortKey] || 0;
        vb = getStats(b.file)[sortKey] || 0;
      }
      return sortDir === 'desc' ? vb - va : va - vb;
    });
    return posts;
  }

  /* ============================================================
     記事一覧レンダリング
     ============================================================ */
  function renderList() {
    const filtered   = getSortedFiltered();
    const totalPages = Math.ceil(filtered.length / POSTS_PER_PAGE);

    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = Math.max(1, totalPages);

    const start = (currentPage - 1) * POSTS_PER_PAGE;
    const paged = filtered.slice(start, start + POSTS_PER_PAGE);

    postCount.textContent = `${filtered.length} POST${filtered.length !== 1 ? 'S' : ''}`;
    blogGrid.innerHTML = '';

    if (filtered.length === 0) {
      blogGrid.innerHTML = '<div class="blog-empty">記事がありません</div>';
      renderPagination(0, 1);
      return;
    }

    paged.forEach((post, i) => {
      const realIndex = allPosts.indexOf(post);
      const st = getStats(post.file);
      const authorKey = post.author || '';

      const card = document.createElement('div');
      card.className = 'blog-card fade';
      card.innerHTML = `
        <div class="blog-card-thumb">
          ${post.thumbnail
            ? `<img src="${post.thumbnail}" alt="${post.title}"
                    onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
            : ''}
          <div class="blog-card-thumb-placeholder"
               style="display:${post.thumbnail ? 'none' : 'flex'}">NO IMAGE</div>
        </div>
        <div class="blog-card-body">
          <div class="blog-card-meta">
            ${post.category ? `<span class="blog-card-cat">${post.category}</span>` : ''}
            <span class="blog-card-date">${formatDate(post.date)}</span>
          </div>
          ${authorChipHtml(authorKey)}
          <div class="blog-card-title">${post.title}</div>
          <div class="blog-card-stats">
            <span class="stat-chip">${ICONS.eye}${fmtNum(st.views)}</span>
            <span class="stat-chip">${ICONS.heart}${fmtNum(st.likes)}</span>
          </div>
          <div class="blog-card-arrow">READ MORE →</div>
        </div>`;
      card.addEventListener('click', () => openArticle(realIndex));
      blogGrid.appendChild(card);

      requestAnimationFrame(() => setTimeout(() => card.classList.add('visible'), i * 60));
    });

    renderPagination(totalPages, currentPage);
  }

  /* ============================================================
     ページネーション
     ============================================================ */
  function renderPagination(totalPages, page) {
    const old = document.getElementById('pagination');
    if (old) old.remove();
    if (totalPages <= 1) return;

    const nav = document.createElement('div');
    nav.className = 'pagination';
    nav.id = 'pagination';

    const prev = makePageBtn('←', page <= 1, () => { currentPage--; renderList(); });
    prev.classList.add('page-arrow');
    nav.appendChild(prev);

    buildPageNumbers(page, totalPages).forEach(p => {
      if (p === '...') {
        const el = document.createElement('div');
        el.className = 'page-btn'; el.textContent = '…'; el.style.cursor = 'default';
        nav.appendChild(el);
      } else {
        const btn = makePageBtn(p, false, () => { currentPage = p; renderList(); });
        if (p === page) btn.classList.add('active');
        nav.appendChild(btn);
      }
    });

    const next = makePageBtn('→', page >= totalPages, () => { currentPage++; renderList(); });
    next.classList.add('page-arrow');
    nav.appendChild(next);
    blogGrid.parentNode.insertBefore(nav, blogGrid.nextSibling);
  }

  function makePageBtn(label, disabled, onClick) {
    const btn = document.createElement('button');
    btn.className = 'page-btn'; btn.textContent = label; btn.disabled = disabled;
    if (!disabled) btn.addEventListener('click', onClick);
    return btn;
  }

  function buildPageNumbers(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages = [];
    if (current <= 4) {
      for (let i = 1; i <= 5; i++) pages.push(i); pages.push('...'); pages.push(total);
    } else if (current >= total - 3) {
      pages.push(1); pages.push('...');
      for (let i = total - 4; i <= total; i++) pages.push(i);
    } else {
      pages.push(1); pages.push('...');
      for (let i = current - 1; i <= current + 1; i++) pages.push(i);
      pages.push('...'); pages.push(total);
    }
    return pages;
  }

  /* ============================================================
     記事を開く
     ============================================================ */
  async function openArticle(index) {
    currentIndex = index;
    const post = allPosts[index];

    listView.style.display    = 'none';
    articleView.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });

    articleBody.innerHTML    = '<p style="color:#888;font-family:Rajdhani,sans-serif;letter-spacing:.15em;">LOADING...</p>';
    articleMeta.innerHTML    = '';
    articleNav.innerHTML     = '';
    articleActions.innerHTML = '';

    await incrementViews(post.file);

    try {
      const res = await fetch(`posts/${post.file}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.text();
      const { meta, body } = parseFrontmatter(raw);

      // authorはMDフロントマター優先、なければindex.jsonの値を使用
      const authorKey = meta.author || post.author || '';

      articleMeta.innerHTML = `
        ${meta.category ? `<div class="art-cat">${meta.category}</div>` : ''}
        <div class="art-title">${meta.title || post.title}</div>
        <div class="art-meta-row">
          <span class="art-date">${formatDate(meta.date || post.date)}</span>
          ${authorKey ? `<span class="art-meta-sep">／</span>${authorBadgeHtml(authorKey)}` : ''}
        </div>`;

      articleBody.innerHTML = marked.parse(body);
      renderArticleActions(post, meta, authorKey);
      renderArticleNav(index);

    } catch (e) {
      articleBody.innerHTML = `<p style="color:#c00">記事の読み込みに失敗しました：${e.message}</p>`;
    }
  }

  /* ============================================================
     記事アクションバー（閲覧数・いいね・Xシェア）
     ============================================================ */
  function renderArticleActions(post, meta, authorKey) {
    const st    = getStats(post.file);
    const liked = isLiked(post.file);
    const title = encodeURIComponent(`${meta.title || post.title} - THRCOT ROBOTICS™ @Thrcot_RCJ`);
    const url   = encodeURIComponent(location.href);
    const tweetUrl = `https://twitter.com/intent/tweet?text=${title}%0a&url=${url}`;

    articleActions.innerHTML = `
      <span class="action-stat">${ICONS.eye}<span id="viewCount">${fmtNum(st.views)}</span> VIEWS</span>
      <div class="action-sep"></div>
      <span class="action-stat">${ICONS.heart}<span id="likeCount">${fmtNum(st.likes)}</span> LIKES</span>
      <div class="action-spacer"></div>
      <button class="like-btn${liked ? ' liked' : ''}" id="likeBtn" aria-label="いいね">
        <svg class="like-heart" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
        </svg>
        <span class="like-label">${liked ? 'LIKED' : 'LIKE'}</span>
      </button>
      <a class="share-btn" href="${tweetUrl}" target="_blank" rel="noopener" aria-label="Xでシェア">
        <svg class="share-x-icon" viewBox="0 0 1200 1227" xmlns="http://www.w3.org/2000/svg">
          <path d="M714.163 519.284 1160.89 0h-105.86L667.137 450.887 357.328 0H0l468.492 681.821L0 1226.37h105.866l409.625-476.152 327.181 476.152H1200L714.137 519.284zM569.165 687.828l-47.468-67.894-377.686-540.24h162.604l304.797 435.991 47.468 67.894 396.2 566.721H892.476L569.165 687.854z"/>
        </svg>
        SHARE
      </a>`;

    const likeBtn   = document.getElementById('likeBtn');
    const likeCount = document.getElementById('likeCount');
    const viewCount = document.getElementById('viewCount');

    viewCount.textContent = fmtNum(getStats(post.file).views);

    likeBtn.addEventListener('click', async () => {
      likeBtn.disabled = true;
      try {
        const result = await toggleLike(post.file);
        likeBtn.classList.toggle('liked', result.liked);
        likeBtn.classList.remove('pop');
        void likeBtn.offsetWidth;
        likeBtn.classList.add('pop');
        likeBtn.querySelector('.like-label').textContent = result.liked ? 'LIKED' : 'LIKE';
        likeCount.textContent = fmtNum(result.likes);
      } finally {
        likeBtn.disabled = false;
      }
    });
  }

  /* ============================================================
     前後記事ナビ
     ============================================================ */
  function renderArticleNav(index) {
    const prev = index + 1 < allPosts.length ? allPosts[index + 1] : null;
    const next = index - 1 >= 0             ? allPosts[index - 1] : null;

    articleNav.innerHTML = `
      <div class="art-nav-item prev" style="${prev ? '' : 'opacity:.3;pointer-events:none;'}">
        <div class="art-nav-dir">← PREV</div>
        <div class="art-nav-title">${prev ? prev.title : ''}</div>
      </div>
      <div class="art-nav-item next" style="${next ? '' : 'opacity:.3;pointer-events:none;'}">
        <div class="art-nav-dir">NEXT →</div>
        <div class="art-nav-title">${next ? next.title : ''}</div>
      </div>`;

    if (prev) articleNav.querySelector('.prev').addEventListener('click', () => openArticle(index + 1));
    if (next) articleNav.querySelector('.next').addEventListener('click', () => openArticle(index - 1));
  }

  /* ============================================================
     一覧に戻る
     ============================================================ */
  backBtn.addEventListener('click', () => {
    articleView.style.display = 'none';
    listView.style.display    = 'block';
    renderList();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* ============================================================
     並べ替えコントロール
     ============================================================ */
  sortKeyEl.addEventListener('change', () => { sortKey = sortKeyEl.value; currentPage = 1; renderList(); });
  sortDirEl.addEventListener('click', () => {
    sortDir = sortDir === 'desc' ? 'asc' : 'desc';
    sortDirEl.dataset.dir = sortDir;
    sortDirEl.classList.toggle('asc', sortDir === 'asc');
    sortDirEl.title = sortDir === 'desc' ? '降順' : '昇順';
    currentPage = 1;
    renderList();
  });

  /* ============================================================
     初期化
     ============================================================ */
  async function init() {
    blogGrid.innerHTML = '<div class="blog-loading">LOADING POSTS...</div>';
    try {
      const res = await fetch('posts/index.json');
      if (!res.ok) throw new Error(`posts/index.json を読み込めません (HTTP ${res.status})`);
      allPosts = await res.json();

      buildFilters(allPosts);

      // Supabase から全記事カウントを一括取得
      if (useSupabase) {
        await sbBatchLoad(allPosts.map(p => p.file));
      }

      renderList();

      const hash  = location.hash;
      const match = hash.match(/^#post-(\d+)$/);
      if (match) {
        const i = parseInt(match[1]);
        if (i >= 0 && i < allPosts.length) openArticle(i);
      }

    } catch (e) {
      blogGrid.innerHTML = `<div class="blog-empty">
        記事一覧の読み込みに失敗しました。<br>
        <code style="font-size:.8em;color:#c00">${e.message}</code><br><br>
        <span style="font-size:.8em">posts/index.json が存在するか確認してください。</span>
      </div>`;
    }
  }

  init();
})();