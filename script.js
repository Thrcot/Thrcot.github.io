/* ============================================================
   script.js — Thrcot Robotics
   ============================================================ */

/* ── スクロール時フェードイン ── */
const fades = document.querySelectorAll('.fade');

const fadeObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
    }
  });
}, { threshold: 0.12 });

fades.forEach(el => fadeObserver.observe(el));


/* ── ヘッダーのスクロール影 ── */
const header = document.getElementById('header');

window.addEventListener('scroll', () => {
  header.classList.toggle('scrolled', window.scrollY > 40);
}, { passive: true });


/* ── ハンバーガーメニュー ── */
const navToggle = document.getElementById('navToggle');
const globalNav = document.getElementById('globalNav');

navToggle.addEventListener('click', () => {
  const isOpen = navToggle.classList.toggle('open');
  globalNav.classList.toggle('open', isOpen);
  navToggle.setAttribute('aria-label', isOpen ? 'メニューを閉じる' : 'メニューを開く');
});

/* ナビのリンクをクリックしたらメニューを閉じる */
globalNav.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    navToggle.classList.remove('open');
    globalNav.classList.remove('open');
    navToggle.setAttribute('aria-label', 'メニューを開く');
  });
});

/* 画面幅が広がったらドロワーを自動で閉じる */
window.addEventListener('resize', () => {
  if (window.innerWidth > 768) {
    navToggle.classList.remove('open');
    globalNav.classList.remove('open');
  }
}, { passive: true });