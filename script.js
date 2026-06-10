/* ══════════════════════════════════════════════════════════════════
   PHAN ĐỨC PHÁT — PORTFOLIO INTERACTIONS
   ══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ─── NAVBAR: Hide on scroll down, show on scroll up ─────────────
  const navbar = document.getElementById('navbar');
  let lastScrollY = 0;
  let ticking = false;

  function updateNavbar() {
    const scrollY = window.scrollY;
    if (scrollY > lastScrollY && scrollY > 80) {
      navbar.classList.add('hidden');
    } else {
      navbar.classList.remove('hidden');
    }
    lastScrollY = scrollY;
    ticking = false;
  }

  window.addEventListener('scroll', function () {
    if (!ticking) {
      requestAnimationFrame(updateNavbar);
      ticking = true;
    }
  }, { passive: true });

  // ─── NAVBAR: Active link highlight ──────────────────────────────
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-link');

  const sectionObserver = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          const id = entry.target.getAttribute('id');
          navLinks.forEach(function (link) {
            link.classList.remove('active');
            if (link.getAttribute('href') === '#' + id) {
              link.classList.add('active');
            }
          });
        }
      });
    },
    { rootMargin: '-40% 0px -55% 0px', threshold: 0 }
  );

  sections.forEach(function (section) {
    sectionObserver.observe(section);
  });

  // ─── MOBILE BURGER MENU ──────────────────────────────────────────
  const burger = document.getElementById('navBurger');
  const mobileMenu = document.getElementById('navMobile');

  if (burger && mobileMenu) {
    burger.addEventListener('click', function () {
      const isOpen = mobileMenu.classList.toggle('open');
      burger.setAttribute('aria-expanded', isOpen.toString());
      mobileMenu.setAttribute('aria-hidden', (!isOpen).toString());

      // Animate burger lines
      const spans = burger.querySelectorAll('span');
      if (isOpen) {
        spans[0].style.transform = 'translateY(6px) rotate(45deg)';
        spans[1].style.opacity = '0';
        spans[2].style.transform = 'translateY(-6px) rotate(-45deg)';
      } else {
        spans[0].style.transform = '';
        spans[1].style.opacity = '';
        spans[2].style.transform = '';
      }
    });

    // Close mobile menu on link click
    document.querySelectorAll('.nav-mobile-link').forEach(function (link) {
      link.addEventListener('click', function () {
        mobileMenu.classList.remove('open');
        burger.setAttribute('aria-expanded', 'false');
        mobileMenu.setAttribute('aria-hidden', 'true');
        const spans = burger.querySelectorAll('span');
        spans[0].style.transform = '';
        spans[1].style.opacity = '';
        spans[2].style.transform = '';
      });
    });
  }

  // ─── SCROLL FADE-IN ANIMATIONS ──────────────────────────────────
  const fadeElements = document.querySelectorAll('.fade-in');

  const fadeObserver = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          fadeObserver.unobserve(entry.target);
        }
      });
    },
    { rootMargin: '0px 0px -60px 0px', threshold: 0.1 }
  );

  fadeElements.forEach(function (el) {
    fadeObserver.observe(el);
  });

  // ─── SKILL BAR ANIMATIONS ────────────────────────────────────────
  const skillFills = document.querySelectorAll('.skill-fill');

  const skillObserver = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('animated');
          skillObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.3 }
  );

  skillFills.forEach(function (fill) {
    skillObserver.observe(fill);
  });

  // ─── LIGHTBOX ────────────────────────────────────────────────────
  const lightbox = document.getElementById('lightbox');
  const lightboxBackdrop = document.getElementById('lightboxBackdrop');
  const lightboxClose = document.getElementById('lightboxClose');
  const lightboxVisual = document.getElementById('lightboxVisual');
  const lightboxCategory = document.getElementById('lightboxCategory');
  const lightboxTitle = document.getElementById('lightboxTitle');
  const lightboxDesc = document.getElementById('lightboxDesc');
  const lightboxTags = document.getElementById('lightboxTags');
  const lightboxLink = document.getElementById('lightboxLink');

  // Gradient classes for lightbox visual
  const gradientMap = {
    'pv-gradient-1': 'linear-gradient(135deg, #1a1207 0%, #2d1f0a 40%, #0d0d0d 100%)',
    'pv-gradient-2': 'linear-gradient(135deg, #070d1a 0%, #0a1a2d 40%, #0d0d0d 100%)',
    'pv-gradient-3': 'linear-gradient(135deg, #0d0a1a 0%, #1a0d2d 40%, #0d0d0d 100%)',
    'pv-gradient-4': 'linear-gradient(135deg, #0a1207 0%, #0d1a0a 40%, #0d0d0d 100%)',
    'pv-gradient-5': 'linear-gradient(135deg, #1a0707 0%, #2d0a0a 40%, #0d0d0d 100%)',
  };

  function openLightbox(card) {
    const title = card.dataset.title || '';
    const desc = card.dataset.desc || '';
    const tags = card.dataset.tags || '';
    const link = card.dataset.link || 'https://www.behance.net/pdp23';

    // Get gradient from visual element
    const visualEl = card.querySelector('.project-visual');
    let bg = '#1a1a1a';
    if (visualEl) {
      const cls = Array.from(visualEl.classList).find(c => c.startsWith('pv-gradient'));
      if (cls && gradientMap[cls]) bg = gradientMap[cls];
    }

    // Get category text
    const catEl = card.querySelector('.project-category');
    const cat = catEl ? catEl.textContent : '';

    // Populate lightbox
    lightboxVisual.style.background = bg;
    lightboxVisual.style.display = 'flex';
    lightboxVisual.style.alignItems = 'center';
    lightboxVisual.style.justifyContent = 'center';
    lightboxVisual.innerHTML = '<svg viewBox="0 0 60 60" fill="none" style="width:64px;height:64px;opacity:0.4;"><circle cx="30" cy="30" r="29" stroke="#C5A880" stroke-width="1"/><polygon points="24,18 44,30 24,42" fill="#C5A880"/></svg>';

    lightboxCategory.textContent = cat;
    lightboxTitle.textContent = title;
    lightboxDesc.textContent = desc;
    lightboxTags.textContent = tags;
    lightboxLink.href = link;

    lightbox.classList.add('open');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // Focus trap
    lightboxClose.focus();
  }

  function closeLightbox() {
    lightbox.classList.remove('open');
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  // Open on project card click (card or CTA button)
  document.querySelectorAll('.project-card').forEach(function (card) {
    card.addEventListener('click', function (e) {
      openLightbox(card);
    });
  });

  if (lightboxClose) {
    lightboxClose.addEventListener('click', closeLightbox);
  }

  if (lightboxBackdrop) {
    lightboxBackdrop.addEventListener('click', closeLightbox);
  }

  // Escape key
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && lightbox.classList.contains('open')) {
      closeLightbox();
    }
  });

  // ─── SHOWREEL PLACEHOLDER INTERACTION ───────────────────────────
  const playBtn = document.getElementById('playShowreel');
  const showreelFrame = document.getElementById('showreelFrame');

  if (playBtn && showreelFrame) {
    function activateShowreel() {
      // If user provides a YouTube link, replace placeholder with iframe
      // For now, show a visual pulse effect as placeholder
      playBtn.style.animation = 'none';
      const placeholder = showreelFrame.querySelector('.showreel-placeholder');
      if (placeholder) {
        placeholder.style.transition = 'opacity 0.3s';
        placeholder.style.opacity = '0.6';
        setTimeout(function () {
          placeholder.style.opacity = '1';
        }, 300);
      }
    }

    playBtn.addEventListener('click', activateShowreel);
    playBtn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activateShowreel();
      }
    });
  }

  // ─── SMOOTH SCROLL for anchor links ─────────────────────────────
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        const navH = navbar ? navbar.offsetHeight : 64;
        const targetY = target.getBoundingClientRect().top + window.scrollY - navH - 20;
        window.scrollTo({ top: targetY, behavior: 'smooth' });
      }
    });
  });

  // ─── CURSOR GLOW EFFECT (subtle) ────────────────────────────────
  const glow = document.createElement('div');
  glow.style.cssText = [
    'position:fixed',
    'width:400px',
    'height:400px',
    'border-radius:50%',
    'background:radial-gradient(circle, rgba(197,168,128,0.04) 0%, transparent 70%)',
    'pointer-events:none',
    'z-index:0',
    'transform:translate(-50%,-50%)',
    'transition:left 0.5s ease, top 0.5s ease',
    'left:50%',
    'top:50%',
  ].join(';');
  document.body.appendChild(glow);

  let glowTicking = false;
  document.addEventListener('mousemove', function (e) {
    if (!glowTicking) {
      requestAnimationFrame(function () {
        glow.style.left = e.clientX + 'px';
        glow.style.top = e.clientY + 'px';
        glowTicking = false;
      });
      glowTicking = true;
    }
  }, { passive: true });

  // ─── TYPEWRITER for hero slogan ─────────────────────────────────
  const slogan = document.querySelector('.hero-slogan');
  if (slogan) {
    const text = slogan.textContent;
    slogan.textContent = '';
    slogan.style.opacity = '1';

    let charIdx = 0;
    function typeChar() {
      if (charIdx < text.length) {
        slogan.textContent += text[charIdx];
        charIdx++;
        setTimeout(typeChar, 38);
      }
    }

    // Start typewriter after hero fade-in
    setTimeout(typeChar, 900);
  }

  // ─── PROJECT CARD: Stop CTA click from double-triggering ────────
  document.querySelectorAll('.project-cta').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      const card = btn.closest('.project-card');
      if (card) openLightbox(card);
    });
  });

})();
