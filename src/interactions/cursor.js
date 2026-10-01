/**
 * src/interactions/cursor.js — Cursor Glow Effect
 */
(function () {
  'use strict';

  // Skip on touch devices
  if ('ontouchstart' in window) return;

  var glow = document.createElement('div');
  glow.style.cssText = [
    'position:fixed', 'width:400px', 'height:400px', 'border-radius:50%',
    'background:radial-gradient(circle, rgba(197,168,128,0.04) 0%, transparent 70%)',
    'pointer-events:none', 'z-index:0', 'transform:translate(-50%,-50%)',
    'transition:left 0.5s ease, top 0.5s ease', 'left:50%', 'top:50%',
  ].join(';');
  document.body.appendChild(glow);

  var glowTicking = false;
  document.addEventListener('mousemove', function (e) {
    if (!glowTicking) {
      requestAnimationFrame(function () {
        glow.style.left = e.clientX + 'px';
        glow.style.top  = e.clientY + 'px';
        glowTicking = false;
      });
      glowTicking = true;
    }
  }, { passive: true });
})();
