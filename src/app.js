/**
 * src/app.js — Core Entry Point
 * Renders all 4 page views (Home, Work, Profile, Contact) and initializes Page Reveal
 */
(function () {
  'use strict';

  // ── Render Global SEO & Meta ──
  if (typeof renderMeta === 'function') {
    renderMeta();
  }

  // ── Render 4 SPA Page Views ──
  if (typeof renderHomePage === 'function') {
    renderHomePage();
  }
  if (typeof renderWorkPage === 'function') {
    if (window.WorkData && typeof window.WorkData.ready === 'function') {
      window.WorkData.ready().then(function () {
        renderWorkPage('all');
      });
    } else {
      renderWorkPage('all');
    }
  }
  if (typeof renderProfilePage === 'function') {
    renderProfilePage();
  }
  if (typeof renderContactPage === 'function') {
    renderContactPage();
  }

  // ── Page Reveal Animation ──
  var revealEl = el('pageReveal');
  if (revealEl) {
    setTimeout(function () {
      revealEl.classList.add('done');
      document.body.classList.remove('loading');
    }, 1200);
  } else {
    document.body.classList.remove('loading');
  }

})();
