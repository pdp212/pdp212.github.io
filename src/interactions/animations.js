/**
 * src/interactions/animations.js — Typewriter Effect
 */
(function () {
  'use strict';

  var typewriterTimeout = null;
  var typewriterStartTimeout = null;

  function stopTypewriter() {
    if (typewriterStartTimeout) {
      clearTimeout(typewriterStartTimeout);
      typewriterStartTimeout = null;
    }
    if (typewriterTimeout) {
      clearTimeout(typewriterTimeout);
      typewriterTimeout = null;
    }
  }

  function initTypewriter() {
    stopTypewriter();

    var sloganEl = el('heroSlogan');
    if (!sloganEl) return;

    var p = (window.PORTFOLIO_DATA && window.PORTFOLIO_DATA.profile) || {};
    var text = p.slogan || sloganEl.dataset.sloganText || sloganEl.textContent || '';
    if (!text) return;

    // Respect reduced motion
    if (typeof prefersReducedMotion === 'function' && prefersReducedMotion()) {
      sloganEl.textContent = text;
      return;
    }

    sloganEl.textContent = '';
    var charIdx = 0;

    function typeChar() {
      if (charIdx < text.length) {
        sloganEl.textContent += text[charIdx];
        charIdx++;
        typewriterTimeout = setTimeout(typeChar, 32);
      } else {
        typewriterTimeout = null;
      }
    }

    typewriterStartTimeout = setTimeout(typeChar, 300);
  }

  window.initTypewriter = initTypewriter;
  window.stopTypewriter = stopTypewriter;

  // Initial trigger after page reveal
  setTimeout(initTypewriter, 1200);

})();
