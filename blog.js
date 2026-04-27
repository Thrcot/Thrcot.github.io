/* ============================================================
   blog.js — Thrcot Robotics Blog

   【記事の追加方法】
   1. posts/ フォルダに YYYY-MM-DD-タイトル.md を作成
   2. posts/index.json に1行追加
   3. コミット＆プッシュするだけ！
   ============================================================ */

(function () {
  'use strict';

  const POSTS_PER_PAGE = 12; // 1ページあたりの記事数

  /* ── DOM 参照 ── */
  const listView    = document.getElementById('listView');
  const articleView = document.getElementById('articleView');
  const blogGrid    = document.getElementById('blogGrid');
  const filterBar   = document.getElementById('filterBar');
  const postCount   = document.getElementById('postCount');
  const articleMeta = document.getElementById('articleMeta');
  const articleBody = document.getElementById('articleBody');
  const articleNav  = document.getElementById('articleNav');
  const backBtn     = document.getElementById('backBtn');

  /* ── 状態 ── */
  let allPosts     = [];
  let currentCat   = 'all';
  let currentPage  = 1;
  let currentIndex = -1;

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
     日付フォーマット
     ============================================================ */
  function formatDate(str) {
    const d = new Date(str);
    if (isNaN(d)) return str;
    return d.toLocaleDateString('ja-JP', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
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
     フィルター済み記事取得
     ============================================================ */
  function getFiltered() {
    return currentCat === 'all'
      ? allPosts
      : allPosts.filter(p => p.category === currentCat);
  }

  /* ============================================================
     記事一覧レンダリング（ページネーション付き）
     ============================================================ */
  function renderList() {
    const filtered   = getFiltered();
    const totalPages = Math.ceil(filtered.length / POSTS_PER_PAGE);

    // ページ範囲補正
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = Math.max(1, totalPages);

    const start  = (currentPage - 1) * POSTS_PER_PAGE;
    const paged  = filtered.slice(start, start + POSTS_PER_PAGE);

    postCount.textContent = `${filtered.length} POST${filtered.length !== 1 ? 'S' : ''}`;

    // グリッドをクリアして再描画
    blogGrid.innerHTML = '';

    if (filtered.length === 0) {
      blogGrid.innerHTML = '<div class="blog-empty">記事がありません</div>';
      renderPagination(0, 1);
      return;
    }

    paged.forEach((post, i) => {
      const realIndex = allPosts.indexOf(post);
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
          <div class="blog-card-title">${post.title}</div>
          <div class="blog-card-arrow">READ MORE →</div>
        </div>`;
      card.addEventListener('click', () => openArticle(realIndex));
      blogGrid.appendChild(card);

      // フェードイン
      requestAnimationFrame(() => {
        setTimeout(() => card.classList.add('visible'), i * 60);
      });
    });

    renderPagination(totalPages, currentPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ============================================================
     ページネーション描画
     ============================================================ */
  function renderPagination(totalPages, page) {
    // 既存のページネーションを削除
    const old = document.getElementById('pagination');
    if (old) old.remove();

    if (totalPages <= 1) return; // 1ページ以下は表示しない

    const nav = document.createElement('div');
    nav.className = 'pagination';
    nav.id = 'pagination';

    // ← 前へ
    const prevBtn = makePageBtn('←', page <= 1, () => {
      currentPage--;
      renderList();
    });
    prevBtn.classList.add('page-arrow');
    nav.appendChild(prevBtn);

    // ページ番号ボタン
    // 多い場合は省略記号を使う（最大7ボタン）
    const pages = buildPageNumbers(page, totalPages);
    pages.forEach(p => {
      if (p === '...') {
        const ellipsis = document.createElement('div');
        ellipsis.className = 'page-btn';
        ellipsis.textContent = '…';
        ellipsis.style.cursor = 'default';
        nav.appendChild(ellipsis);
      } else {
        const btn = makePageBtn(p, false, () => {
          currentPage = p;
          renderList();
        });
        if (p === page) btn.classList.add('active');
        nav.appendChild(btn);
      }
    });

    // → 次へ
    const nextBtn = makePageBtn('→', page >= totalPages, () => {
      currentPage++;
      renderList();
    });
    nextBtn.classList.add('page-arrow');
    nav.appendChild(nextBtn);

    // グリッドの後に挿入
    blogGrid.parentNode.insertBefore(nav, blogGrid.nextSibling);
  }

  function makePageBtn(label, disabled, onClick) {
    const btn = document.createElement('button');
    btn.className = 'page-btn';
    btn.textContent = label;
    btn.disabled = disabled;
    if (!disabled) btn.addEventListener('click', onClick);
    return btn;
  }

  // 表示するページ番号の配列を生成（省略あり）
  function buildPageNumbers(current, total) {
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    const pages = [];
    if (current <= 4) {
      for (let i = 1; i <= 5; i++) pages.push(i);
      pages.push('...');
      pages.push(total);
    } else if (current >= total - 3) {
      pages.push(1);
      pages.push('...');
      for (let i = total - 4; i <= total; i++) pages.push(i);
    } else {
      pages.push(1);
      pages.push('...');
      for (let i = current - 1; i <= current + 1; i++) pages.push(i);
      pages.push('...');
      pages.push(total);
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

    articleBody.innerHTML = '<p style="color:#888;font-family:Rajdhani,sans-serif;letter-spacing:.15em;">LOADING...</p>';
    articleMeta.innerHTML = '';
    articleNav.innerHTML  = '';

    try {
      const res = await fetch(`posts/${post.file}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.text();
      const { meta, body } = parseFrontmatter(raw);

      articleMeta.innerHTML = `
        ${meta.category ? `<div class="art-cat">${meta.category}</div>` : ''}
        <div class="art-title">${meta.title || post.title}</div>
        <div class="art-date">${formatDate(meta.date || post.date)}</div>`;

      articleBody.innerHTML = marked.parse(body);
      renderArticleNav(index);

    } catch (e) {
      articleBody.innerHTML = `<p style="color:#c00">記事の読み込みに失敗しました：${e.message}</p>`;
    }
  }

  /* ============================================================
     前後記事ナビ
     ============================================================ */
  function renderArticleNav(index) {
    const prev = index + 1 < allPosts.length ? allPosts[index + 1] : null;
    const next = index - 1 >= 0             ? allPosts[index - 1] : null;

    articleNav.innerHTML = `
      <div class="art-nav-item prev"
           style="${prev ? '' : 'opacity:.3;pointer-events:none;'}">
        <div class="art-nav-dir">← PREV</div>
        <div class="art-nav-title">${prev ? prev.title : ''}</div>
      </div>
      <div class="art-nav-item next"
           style="${next ? '' : 'opacity:.3;pointer-events:none;'}">
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
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