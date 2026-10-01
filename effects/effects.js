/* ══════════════════════════════════════════════════════════════════
   effects/effects.js — Cinematic Visual Effects Engine
   Editorial brutalism micro-interactions:
     • Live real-time clock (ICT timezone / Da Nang)
     • Viewfinder crosshair indicator
     • Kinetic jitter on hero typography
     • Subtle magnetic CTA feedback
   ══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // Check reduced motion preference
  var isReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.addEventListener('DOMContentLoaded', function () {
    initLiveClock();
    initCrosshair();
    if (!isReducedMotion) {
      initJitter();
      initMagneticButtons();
    }
  });

  /* ══════════════════════════════════════════════════════════════════
     1. LIVE REAL-TIME CLOCK — bottom right corner
     Cinematic studio production timecode
  ══════════════════════════════════════════════════════════════════ */
  function initLiveClock() {
    if (document.getElementById('live-clock')) return;

    var clock = document.createElement('div');
    clock.id = 'live-clock';
    clock.setAttribute('aria-hidden', 'true');
    clock.style.cssText = [
      'position:fixed',
      'bottom:20px',
      'right:24px',
      'z-index:500',
      'font-family:var(--font-mono, monospace)',
      'font-size:0.58rem',
      'letter-spacing:0.14em',
      'color:rgba(255,255,255,0.35)',
      'pointer-events:none',
      'user-select:none',
      'text-transform:uppercase',
      'line-height:1.6',
      'text-align:right',
    ].join(';');

    document.body.appendChild(clock);

    function updateClock() {
      var now = new Date();
      var hh = String(now.getHours()).padStart(2, '0');
      var mm = String(now.getMinutes()).padStart(2, '0');
      var ss = String(now.getSeconds()).padStart(2, '0');
      clock.innerHTML = '<span style="color:#C5A880">REC</span> ' + hh + ':' + mm + ':' + ss + ' ICT<br>DA NANG · 16°04\'N 108°13\'E';
    }

    updateClock();
    setInterval(updateClock, 1000);
  }

  /* ══════════════════════════════════════════════════════════════════
     2. CROSSHAIR INDICATOR — bottom center
     Cinematic camera viewfinder reticle
  ══════════════════════════════════════════════════════════════════ */
  function initCrosshair() {
    if (document.getElementById('crosshair-indicator')) return;

    var ch = document.createElement('div');
    ch.id = 'crosshair-indicator';
    ch.setAttribute('aria-hidden', 'true');
    ch.innerHTML = [
      '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">',
      '  <line x1="10" y1="0" x2="10" y2="7" stroke="currentColor" stroke-width="0.8"/>',
      '  <line x1="10" y1="13" x2="10" y2="20" stroke="currentColor" stroke-width="0.8"/>',
      '  <line x1="0" y1="10" x2="7" y2="10" stroke="currentColor" stroke-width="0.8"/>',
      '  <line x1="13" y1="10" x2="20" y2="10" stroke="currentColor" stroke-width="0.8"/>',
      '  <circle cx="10" cy="10" r="2" stroke="currentColor" stroke-width="0.8"/>',
      '</svg>',
    ].join('');
    ch.style.cssText = [
      'position:fixed',
      'bottom:16px',
      'left:50%',
      'transform:translateX(-50%)',
      'z-index:500',
      'color:rgba(255,255,255,0.25)',
      'pointer-events:none',
      'user-select:none',
      'animation:crosshairPulse 4s ease-in-out infinite',
    ].join(';');

    document.body.appendChild(ch);

    if (!document.getElementById('crosshair-style')) {
      var s = document.createElement('style');
      s.id = 'crosshair-style';
      s.textContent = [
        '@keyframes crosshairPulse{',
        '0%,100%{opacity:0.25;transform:translateX(-50%) scale(1);}',
        '50%{opacity:0.6;transform:translateX(-50%) scale(1.1);}',
        '}',
      ].join('');
      document.head.appendChild(s);
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     3. JITTER EFFECT — hero typography kinetic micro-animation
  ══════════════════════════════════════════════════════════════════ */
  function initJitter() {
    if (!document.getElementById('jitter-style')) {
      var s = document.createElement('style');
      s.id = 'jitter-style';
      s.textContent = [
        '@keyframes jittery{',
        '10%{transform:translate(-0.5px,-0.5px);}',
        '20%{transform:translate(0.5px,0.5px);}',
        '30%{transform:translate(-0.8px,-0.8px);}',
        '40%{transform:translate(0.3px,0.4px);}',
        '50%{transform:translate(-0.2px,-0.2px);}',
        '60%{transform:translate(0,0.3px);}',
        '70%{transform:translate(-0.3px,-0.4px);}',
        '80%{transform:translate(0.4px,0.5px);}',
        '90%{transform:translate(-0.5px,-0.3px);}',
        '100%{transform:translate(0.3px,0.1px);}',
        '}',
        '.hero-name:hover .hero-char{',
        '  animation:jittery 0.25s ease-in-out infinite;',
        '  color: var(--accent);',
        '}',
        '.hero-name:hover .hero-char:nth-child(odd){animation-delay:0.04s;}',
        '.hero-name:hover .hero-char:nth-child(3n){animation-delay:0.08s;}',
      ].join('');
      document.head.appendChild(s);
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     4. MAGNETIC FEEDBACK ON BUTTONS
  ══════════════════════════════════════════════════════════════════ */
  function initMagneticButtons() {
    function attachMagnetic(el) {
      if (el.dataset.magneticInit) return;
      el.dataset.magneticInit = 'true';

      el.addEventListener('mousemove', function (e) {
        var rect = el.getBoundingClientRect();
        var cx = rect.left + rect.width / 2;
        var cy = rect.top + rect.height / 2;
        var dx = (e.clientX - cx) * 0.2;
        var dy = (e.clientY - cy) * 0.2;
        el.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      });

      el.addEventListener('mouseleave', function () {
        el.style.transform = '';
        el.style.transition = 'transform 0.4s cubic-bezier(0.25,0.46,0.45,0.94)';
        setTimeout(function () { el.style.transition = ''; }, 400);
      });
    }

    var targets = document.querySelectorAll('.btn-outline, .btn-accent, .nav-logo');
    targets.forEach(attachMagnetic);

    var observer = new MutationObserver(function () {
      var newTargets = document.querySelectorAll('.btn-outline:not([data-magnetic-init]), .btn-accent:not([data-magnetic-init])');
      newTargets.forEach(attachMagnetic);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

})();
