/* ══════════════════════════════════════════════════════════════════
   effects.js — Visual Effects Engine v1.0
   Inspired by: antiantiart.com + henryjeff/portfolio-website
   Features:
     • Custom magnetic cursor
     • Live real-time clock (ICT timezone)
     • Crosshair indicator
     • BIOS-style loading screen
     • Jitter effect on hero name
   ══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ─── WAIT FOR DOM ─────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    initBIOSLoader();
    initCustomCursor();
    initLiveClock();
    initCrosshair();
    initJitter();
    initMagneticButtons();
  });

  /* ══════════════════════════════════════════════════════════════════
     1. BIOS-STYLE LOADING SCREEN
     Inspired by henryjeff's LoadingScreen.tsx
  ══════════════════════════════════════════════════════════════════ */
  function initBIOSLoader() {
    var overlay = document.getElementById('pageReveal');
    if (!overlay) return;

    var lines = [
      'PDP PORTFOLIO SYSTEM  v2.0',
      'Copyright (C) 2024 Phan Duc Phat. All Rights Reserved.',
      '',
      'CPU: Creative Processing Unit @ 24fps',
      'Memory Test : 8192K OK',
      '',
      'Detecting video hardware...',
      'CINEMATIC ENGINE ......... [OK]',
      'MOTION DESIGN MODULE ..... [OK]',
      'AI WORKFLOW INIT ......... [OK]',
      '',
      'Loading portfolio assets...',
    ];

    // Replace inner content with BIOS terminal
    overlay.innerHTML = '';
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'background:#000',
      'z-index:10000',
      'display:flex',
      'flex-direction:column',
      'justify-content:center',
      'align-items:center',
      'font-family:"SF Mono","Fira Code","Consolas",monospace',
      'font-size:clamp(0.6rem,1.2vw,0.85rem)',
      'letter-spacing:0.05em',
      'transition:opacity 0.6s ease',
    ].join(';');

    var terminal = document.createElement('div');
    terminal.style.cssText = [
      'width:min(680px,90vw)',
      'color:#00ff41',
      'line-height:1.9',
    ].join(';');

    var cursor = document.createElement('span');
    cursor.className = 'bios-cursor';
    cursor.textContent = '█';

    overlay.appendChild(terminal);
    overlay.appendChild(cursor);

    var lineIndex = 0;
    var charIndex = 0;
    var currentEl = null;

    function nextChar() {
      if (lineIndex >= lines.length) {
        // Done — fade out after brief pause
        setTimeout(function () {
          overlay.style.opacity = '0';
          setTimeout(function () {
            overlay.style.display = 'none';
            document.body.classList.remove('loading');
          }, 600);
        }, 500);
        return;
      }

      var line = lines[lineIndex];

      if (charIndex === 0) {
        currentEl = document.createElement('div');
        // Style certain lines differently
        if (line.indexOf('[OK]') !== -1) {
          currentEl.style.color = '#00ff41';
        } else if (line === '') {
          currentEl.innerHTML = '&nbsp;';
          terminal.appendChild(currentEl);
          lineIndex++;
          charIndex = 0;
          setTimeout(nextChar, 40);
          return;
        } else if (lineIndex === 0) {
          currentEl.style.cssText = 'color:#fff;font-weight:700;font-size:1.1em;margin-bottom:4px;';
        } else if (line.indexOf('Copyright') !== -1) {
          currentEl.style.color = '#888';
        } else if (line.indexOf('Loading') !== -1) {
          currentEl.style.color = '#C5A880';
        }
        terminal.appendChild(currentEl);
      }

      if (charIndex < line.length) {
        currentEl.textContent = line.substring(0, charIndex + 1);
        charIndex++;
        var delay = line.indexOf('...') !== -1 ? 60 : 18;
        setTimeout(nextChar, delay);
      } else {
        lineIndex++;
        charIndex = 0;
        setTimeout(nextChar, lineIndex < 3 ? 80 : 35);
      }
    }

    // Small delay before starting
    setTimeout(nextChar, 200);
  }

  /* ══════════════════════════════════════════════════════════════════
     2. CUSTOM MAGNETIC CURSOR
     Smooth-lagged dot that follows the mouse
  ══════════════════════════════════════════════════════════════════ */
  function initCustomCursor() {
    // Don't show on touch devices
    if (window.matchMedia('(pointer: coarse)').matches) return;

    var dot = document.createElement('div');
    dot.id = 'cursor-dot';
    dot.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'width:8px',
      'height:8px',
      'background:#fff',
      'border-radius:50%',
      'pointer-events:none',
      'z-index:99999',
      'transform:translate(-50%,-50%)',
      'transition:transform 0.15s ease,width 0.3s ease,height 0.3s ease,background 0.3s ease,opacity 0.3s ease',
      'opacity:0',
      'mix-blend-mode:difference',
    ].join(';');

    var ring = document.createElement('div');
    ring.id = 'cursor-ring';
    ring.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'width:36px',
      'height:36px',
      'border:1px solid rgba(255,255,255,0.5)',
      'border-radius:50%',
      'pointer-events:none',
      'z-index:99998',
      'transform:translate(-50%,-50%)',
      'transition:width 0.3s ease,height 0.3s ease,border-color 0.3s ease,opacity 0.3s ease',
      'opacity:0',
    ].join(';');

    document.body.appendChild(dot);
    document.body.appendChild(ring);

    // Hide default cursor
    document.body.style.cursor = 'none';
    document.querySelectorAll('a,button,[role="button"]').forEach(function (el) {
      el.style.cursor = 'none';
    });

    var mouseX = 0, mouseY = 0;
    var ringX = 0, ringY = 0;
    var visible = false;

    document.addEventListener('mousemove', function (e) {
      mouseX = e.clientX;
      mouseY = e.clientY;

      dot.style.left = mouseX + 'px';
      dot.style.top = mouseY + 'px';

      if (!visible) {
        dot.style.opacity = '1';
        ring.style.opacity = '1';
        visible = true;
      }
    });

    document.addEventListener('mouseleave', function () {
      dot.style.opacity = '0';
      ring.style.opacity = '0';
      visible = false;
    });

    // Cursor expand on interactive elements
    var interactiveEls = 'a,button,[role="button"],.project-card,.btn-outline,.btn-accent';
    document.querySelectorAll(interactiveEls).forEach(attachCursorExpand);

    // MutationObserver for dynamically added elements
    var mo = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (node) {
          if (node.nodeType === 1) {
            node.querySelectorAll && node.querySelectorAll(interactiveEls).forEach(attachCursorExpand);
            if (node.matches && node.matches(interactiveEls)) attachCursorExpand(node);
          }
        });
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });

    function attachCursorExpand(el) {
      el.addEventListener('mouseenter', function () {
        dot.style.width = '12px';
        dot.style.height = '12px';
        ring.style.width = '56px';
        ring.style.height = '56px';
        ring.style.borderColor = 'rgba(197,168,128,0.7)';
      });
      el.addEventListener('mouseleave', function () {
        dot.style.width = '8px';
        dot.style.height = '8px';
        ring.style.width = '36px';
        ring.style.height = '36px';
        ring.style.borderColor = 'rgba(255,255,255,0.5)';
      });
    }

    // Smooth ring lag animation
    (function animateRing() {
      ringX += (mouseX - ringX) * 0.12;
      ringY += (mouseY - ringY) * 0.12;
      ring.style.left = ringX + 'px';
      ring.style.top = ringY + 'px';
      requestAnimationFrame(animateRing);
    })();

    // Click ripple
    document.addEventListener('click', function (e) {
      var ripple = document.createElement('div');
      ripple.style.cssText = [
        'position:fixed',
        'left:' + e.clientX + 'px',
        'top:' + e.clientY + 'px',
        'width:4px',
        'height:4px',
        'border:1px solid rgba(255,255,255,0.6)',
        'border-radius:50%',
        'pointer-events:none',
        'z-index:99997',
        'transform:translate(-50%,-50%)',
        'animation:cursorRipple 0.5s ease-out forwards',
      ].join(';');
      document.body.appendChild(ripple);
      setTimeout(function () { ripple.remove(); }, 500);
    });

    // Inject ripple keyframe
    if (!document.getElementById('cursor-ripple-style')) {
      var s = document.createElement('style');
      s.id = 'cursor-ripple-style';
      s.textContent = '@keyframes cursorRipple{to{width:48px;height:48px;opacity:0;}}';
      document.head.appendChild(s);
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     3. LIVE REAL-TIME CLOCK — bottom right corner
     Inspired by antiantiart.com's ICT live clock
  ══════════════════════════════════════════════════════════════════ */
  function initLiveClock() {
    var clock = document.createElement('div');
    clock.id = 'live-clock';
    clock.style.cssText = [
      'position:fixed',
      'bottom:20px',
      'right:24px',
      'z-index:500',
      'font-family:"SF Mono","Fira Code","Consolas",monospace',
      'font-size:0.58rem',
      'letter-spacing:0.12em',
      'color:rgba(142,142,147,0.5)',
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
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'ICT';
      var tzShort = tz.split('/').pop() || tz;
      clock.innerHTML = hh + ':' + mm + ':' + ss + ' ' + tzShort
        + '<br>DA NANG — VN';
    }

    updateClock();
    setInterval(updateClock, 1000);
  }

  /* ══════════════════════════════════════════════════════════════════
     4. CROSSHAIR INDICATOR — bottom center
     Inspired by antiantiart.com's crosshair / tâm ngắm
  ══════════════════════════════════════════════════════════════════ */
  function initCrosshair() {
    var ch = document.createElement('div');
    ch.id = 'crosshair-indicator';
    ch.innerHTML = [
      '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">',
      '  <line x1="10" y1="0" x2="10" y2="7" stroke="currentColor" stroke-width="1"/>',
      '  <line x1="10" y1="13" x2="10" y2="20" stroke="currentColor" stroke-width="1"/>',
      '  <line x1="0" y1="10" x2="7" y2="10" stroke="currentColor" stroke-width="1"/>',
      '  <line x1="13" y1="10" x2="20" y2="10" stroke="currentColor" stroke-width="1"/>',
      '  <circle cx="10" cy="10" r="2.5" stroke="currentColor" stroke-width="1"/>',
      '</svg>',
    ].join('');
    ch.style.cssText = [
      'position:fixed',
      'bottom:16px',
      'left:50%',
      'transform:translateX(-50%)',
      'z-index:500',
      'color:rgba(142,142,147,0.35)',
      'pointer-events:none',
      'user-select:none',
      'animation:crosshairPulse 4s ease-in-out infinite',
    ].join(';');

    document.body.appendChild(ch);

    // Inject keyframe
    if (!document.getElementById('crosshair-style')) {
      var s = document.createElement('style');
      s.id = 'crosshair-style';
      s.textContent = [
        '@keyframes crosshairPulse{',
        '0%,100%{opacity:0.35;transform:translateX(-50%) scale(1);}',
        '50%{opacity:0.7;transform:translateX(-50%) scale(1.15);}',
        '}',
      ].join('');
      document.head.appendChild(s);
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     5. JITTER EFFECT — hero name on hover
     Directly adapted from henryjeff's @keyframes jittery
  ══════════════════════════════════════════════════════════════════ */
  function initJitter() {
    if (!document.getElementById('jitter-style')) {
      var s = document.createElement('style');
      s.id = 'jitter-style';
      s.textContent = [
        '@keyframes jittery{',
        '10%{transform:translate(-0.5px,-0.75px);}',
        '20%{transform:translate(0.75px,0.5px);}',
        '30%{transform:translate(-1px,-1.25px);}',
        '40%{transform:translate(0.25px,0.5px);}',
        '50%{transform:translate(-0.125px,-0.25px);}',
        '60%{transform:translate(0,0.375px);}',
        '70%{transform:translate(-0.375px,-0.5px);}',
        '80%{transform:translate(0.375px,0.625px);}',
        '90%{transform:translate(-0.625px,-0.375px);}',
        '100%{transform:translate(0.375px,0.125px);}',
        '}',
        '.hero-name:hover .hero-char{',
        '  animation:jittery 0.25s ease-in-out infinite;',
        '}',
        '.hero-name:hover .hero-char:nth-child(odd){animation-delay:0.05s;}',
        '.hero-name:hover .hero-char:nth-child(3n){animation-delay:0.1s;}',
      ].join('');
      document.head.appendChild(s);
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     6. MAGNETIC BUTTONS
     Subtle magnetic pull on buttons / nav links
  ══════════════════════════════════════════════════════════════════ */
  function initMagneticButtons() {
    var targets = document.querySelectorAll('.btn-outline,.btn-accent,.nav-logo');

    targets.forEach(function (el) {
      el.addEventListener('mousemove', function (e) {
        var rect = el.getBoundingClientRect();
        var cx = rect.left + rect.width / 2;
        var cy = rect.top + rect.height / 2;
        var dx = (e.clientX - cx) * 0.25;
        var dy = (e.clientY - cy) * 0.25;
        el.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      });
      el.addEventListener('mouseleave', function () {
        el.style.transform = '';
        el.style.transition = 'transform 0.5s cubic-bezier(0.25,0.46,0.45,0.94)';
        setTimeout(function () { el.style.transition = ''; }, 500);
      });
    });

    // MutationObserver for dynamically rendered buttons
    var mo = new MutationObserver(function () {
      document.querySelectorAll('.btn-outline:not([data-mag]),.btn-accent:not([data-mag])').forEach(function (el) {
        el.setAttribute('data-mag', '1');
        el.addEventListener('mousemove', function (e) {
          var rect = el.getBoundingClientRect();
          var cx = rect.left + rect.width / 2;
          var cy = rect.top + rect.height / 2;
          el.style.transform = 'translate(' + (e.clientX - cx) * 0.25 + 'px,' + (e.clientY - cy) * 0.25 + 'px)';
        });
        el.addEventListener('mouseleave', function () {
          el.style.transform = '';
        });
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

})();
