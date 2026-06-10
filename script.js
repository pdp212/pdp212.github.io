/* ════════════════════════════════════════════════════════════════════
   script.js — ENGINE RENDER + INTERACTIONS v2 (Enhanced)
   Portfolio: pdp212.github.io
   ════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ══════════════════════════════════════════════════════════════════
  //  PHẦN 1: RENDER DỮ LIỆU TỪ data.js
  //  Chạy ngay khi trang tải xong
  // ══════════════════════════════════════════════════════════════════

  /**
   * Hàm tiện ích: lấy phần tử theo id, không báo lỗi nếu không tìm thấy
   */
  function el(id) {
    return document.getElementById(id);
  }

  /**
   * Hàm tiện ích: chuyển **text** → <strong>, *text* → <em> trong chuỗi
   * Dùng để render các đoạn bio có định dạng đơn giản
   */
  function parseMarkdown(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');
  }

  /**
   * Hàm tiện ích: tạo icon SVG "play button" cho card dự án
   */
  function svgPlayIcon(size) {
    var s = size || 40;
    var r = s / 2 - 1;
    var cx = s / 2;
    var cy = s / 2;
    return '<svg viewBox="0 0 ' + s + ' ' + s + '" fill="none">'
      + '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" stroke="#F5F5F7" stroke-width="0.8"/>'
      + '<polygon points="' + (cx-4) + ',' + (cy-8) + ' ' + (cx+8) + ',' + cy + ' ' + (cx-4) + ',' + (cy+8) + '" fill="#F5F5F7"/>'
      + '</svg>';
  }

  // ── 1.1 SEO & META ──────────────────────────────────────────────
  function renderMeta() {
    var p = PORTFOLIO_DATA.profile;
    var title = p.fullName + ' — ' + 'Video Editor & Motion Designer';
    document.title = title;
    var metaDesc = 'Portfolio của ' + p.fullName + ' — Professional Video Editor, Cameraman & Motion Designer tại Silver Swallows Studio, Đà Nẵng.';
    var descEl = document.getElementById('pageDesc');
    if (descEl) descEl.setAttribute('content', metaDesc);
    var ogTitleEl = document.getElementById('ogTitle');
    if (ogTitleEl) ogTitleEl.setAttribute('content', title);
  }

  // Helper: split text to spans for hover effect
  function splitTextToSpans(text) {
    if (!text) return '';
    return text.split('').map(function (char) {
      if (char === ' ') return ' ';
      return '<span class="hero-char">' + char + '</span>';
    }).join('');
  }

  // ── 1.2 HERO SECTION ────────────────────────────────────────────
  function renderHero() {
    var p = PORTFOLIO_DATA.profile;

    if (el('heroLocation'))  el('heroLocation').textContent  = p.location;
    if (el('heroRole'))      el('heroRole').textContent      = p.role;
    if (el('heroWorkplace')) el('heroWorkplace').textContent = p.workplace;
    if (el('heroVertText'))  el('heroVertText').textContent  = p.heroVertText;

    if (el('heroNameLine1')) el('heroNameLine1').innerHTML = splitTextToSpans(p.nameLine1);
    if (el('heroNameLine2')) el('heroNameLine2').innerHTML = splitTextToSpans(p.nameLine2);

    // Slogan: lưu nội dung để typewriter hiệu ứng dùng sau
    var sloganEl = el('heroSlogan');
    if (sloganEl) {
      sloganEl.dataset.sloganText = p.slogan;
      // Giữ trống để typewriter điền dần
    }
  }

  // ── 1.3 SHOWREEL ────────────────────────────────────────────────
  function renderShowreel() {
    var sr = PORTFOLIO_DATA.showreel;
    var frame = el('showreelFrame');
    if (!frame) return;

    if (sr.embedUrl) {
      // Có link video → nhúng iframe thực
      var iframe = document.createElement('iframe');
      iframe.src = sr.embedUrl;
      iframe.frameBorder = '0';
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      iframe.allowFullscreen = true;
      iframe.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:none;';
      frame.style.position = 'relative';
      frame.appendChild(iframe);
    } else {
      // Chưa có video → hiển thị placeholder đẹp
      frame.innerHTML = ''
        + '<div class="showreel-placeholder">'
        +   '<div class="play-button" id="playShowreel" role="button" tabindex="0" aria-label="Play showreel">'
        +     '<svg viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
        +       '<circle cx="30" cy="30" r="29" stroke="#C5A880" stroke-width="1"/>'
        +       '<polygon points="24,18 44,30 24,42" fill="#C5A880"/>'
        +     '</svg>'
        +   '</div>'
        +   '<div class="showreel-text">'
        +     '<p class="showreel-title">' + (sr.placeholderTitle || 'SHOWREEL') + '</p>'
        +     '<p class="showreel-sub">'   + (sr.placeholderSub   || '')         + '</p>'
        +   '</div>'
        +   '<div class="showreel-corner top-left"    aria-hidden="true"></div>'
        +   '<div class="showreel-corner top-right"   aria-hidden="true"></div>'
        +   '<div class="showreel-corner bottom-left" aria-hidden="true"></div>'
        +   '<div class="showreel-corner bottom-right"aria-hidden="true"></div>'
        +   '<div class="showreel-counter" aria-hidden="true">01 · 00:00:00 · REC</div>'
        + '</div>';
    }
  }

  // ── 1.4 TICKER STRIP ────────────────────────────────────────────
  function renderTicker() {
    var ticker = el('tickerStrip');
    if (!ticker) return;

    var p = PORTFOLIO_DATA.profile;
    var items = [
      p.role,
      p.workplace,
      p.location,
      'Cinematography',
      'Color Grading',
      'Motion Design',
      'AI Workflow',
      'Python · Manim',
      'DaVinci Resolve',
      'After Effects',
    ];

    // Duplicate for seamless loop
    var all = items.concat(items);
    var html = '<div class="ticker-inner" aria-hidden="true">';
    all.forEach(function (item) {
      html += '<span class="ticker-item">' + item + '</span>';
    });
    html += '</div>';
    ticker.innerHTML = html;
  }

  // ── 1.5 PROJECTS GRID ───────────────────────────────────────────
  var sizeClassMap = { large: 'card-large', medium: 'card-medium', small: 'card-small' };
  var delayList = [0, 100, 150, 200, 250, 300, 350, 400];

  function renderProjects() {
    var grid = el('projectsGrid');
    if (!grid) return;

    var projects = PORTFOLIO_DATA.projects;
    var html = '';

    projects.forEach(function (proj, idx) {
      var sizeClass = sizeClassMap[proj.size] || 'card-medium';
      var delay     = delayList[idx] || 0;

      var visualContent = '';
      if (proj.thumbnail) {
        visualContent = '<img src="' + proj.thumbnail + '" alt="' + proj.title + '" loading="lazy" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;">';
      }

      html += ''
        + '<article'
        +   ' class="project-card ' + sizeClass + ' fade-in"'
        +   ' data-delay="' + delay + '"'
        +   ' data-id="' + proj.id + '"'
        +   ' role="listitem" tabindex="0"'
        +   ' aria-label="Dự án: ' + proj.title + '"'
        + '>'
        +   '<div class="project-visual ' + proj.gradientClass + '">'
        +     visualContent
        +     '<div class="project-overlay">'
        +       '<span class="overlay-category">' + proj.category + '</span>'
        +       '<span class="overlay-title">'    + proj.title    + '</span>'
        +       '<span class="overlay-cta">Open Project ↗</span>'
        +       '<div class="project-play-icon" aria-hidden="true">' + svgPlayIcon(40) + '</div>'
        +     '</div>'
        +     '<div class="project-grain" aria-hidden="true"></div>'
        +   '</div>'
        +   '<div class="project-info">'
        +     '<p class="project-category">' + proj.category + '</p>'
        +     '<h3 class="project-title">'   + proj.title    + '</h3>'
        +     '<p class="project-tags">'     + proj.tags     + '</p>'
        +     '<button class="project-cta" aria-label="Xem dự án ' + proj.title + '">View Project ↗</button>'
        +   '</div>'
        + '</article>';
    });

    grid.innerHTML = html;

    // Update CTA button icons if available
    var ctaBehance  = el('ctaBehance');
    var ctaLinkedIn = el('ctaLinkedIn');
    var socials = PORTFOLIO_DATA.contact.socials;
    var icons = PORTFOLIO_DATA.contact.icons;
    if (ctaBehance && socials && socials.behance && icons && icons.behance) {
      ctaBehance.innerHTML = '<img src="' + icons.behance + '" alt="" style="width:20px;height:20px;vertical-align:middle;margin-right:10px;filter:brightness(0) invert(1);"> View Full Portfolio on Behance ↗';
    }
    if (ctaLinkedIn && socials && socials.linkedin && icons && icons.linkedin) {
      ctaLinkedIn.innerHTML = '<img src="' + icons.linkedin + '" alt="" style="width:20px;height:20px;vertical-align:middle;margin-right:10px;filter:brightness(0) invert(1);"> LinkedIn Profile ↗';
    }
  }

  // ── 1.5 ABOUT SECTION ───────────────────────────────────────────
  function renderAbout() {
    var a = PORTFOLIO_DATA.about;

    // Eyebrow & headline
    if (el('aboutEyebrow')) el('aboutEyebrow').textContent = a.eyebrow;
    if (el('aboutHeadline')) {
      el('aboutHeadline').innerHTML =
        a.headlineLine1 + '<br/><em>' + a.headlineLine2 + '</em>';
    }

    // Bio paragraphs
    var bodyEl = el('aboutBody');
    if (bodyEl) {
      bodyEl.innerHTML = a.bio.map(function (para) {
        return '<p>' + parseMarkdown(para) + '</p>';
      }).join('');
    }

    // Skills text (dạng text | text | text)
    var skillsEl = el('skillsText');
    if (skillsEl) {
      var skillHtml = '';
      a.skills.forEach(function (skill, i) {
        skillHtml += '<span class="skill-item" role="listitem">' + skill + '</span>';
        if (i < a.skills.length - 1) {
          skillHtml += '<span class="skill-sep" aria-hidden="true">|</span>';
        }
      });
      skillsEl.innerHTML = skillHtml;
    }

    // Skill bars với phần trăm
    var barsEl = el('skillsGrid');
    if (barsEl) {
      barsEl.innerHTML = a.skillBars.map(function (bar) {
        return ''
          + '<div class="skill-bar-item">'
          +   '<div class="skill-bar-header">'
          +     '<span class="skill-bar-label">' + bar.label + '</span>'
          +     '<span class="skill-bar-percent">' + bar.level + '%</span>'
          +   '</div>'
          +   '<div class="skill-bar">'
          +     '<div class="skill-fill" style="--fill:' + bar.level + '%"></div>'
          +   '</div>'
          + '</div>';
      }).join('');
    }

    // Education cards
    var eduEl = el('educationCards');
    if (eduEl) {
      eduEl.innerHTML = a.education.map(function (edu) {
        var iconHtml = edu.icon 
          ? '<img src="' + edu.icon + '" alt="icon" class="edu-icon-img" style="width:54px;height:36px;object-fit:contain;opacity:0.9;margin-right:4px;">' 
          : '<span class="edu-icon" aria-hidden="true">◈</span>';
        return ''
          + '<div class="edu-card">'
          +   iconHtml
          +   '<div>'
          +     '<p class="edu-degree">' + edu.degree + '</p>'
          +     '<p class="edu-school">' + edu.school + '</p>'
          +   '</div>'
          + '</div>';
      }).join('');
    }
  }

  // ── 1.6 CONTACT & FOOTER ────────────────────────────────────────
  function renderContact() {
    var c = PORTFOLIO_DATA.contact;
    var p = PORTFOLIO_DATA.profile;

    // 1. Info list
    var infoEl = el('contactInfo');
    if (infoEl) {
      var phoneDisplay = c.phone.replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3');
      var icons = c.icons || {};
      infoEl.innerHTML = ''
        + '<div class="contact-row">'
        +   '<span class="contact-label">'
        +     (icons.email ? '<img src="' + icons.email + '" class="contact-icon" alt="" style="width:22px;height:22px;vertical-align:middle;margin-right:12px;opacity:0.85;">' : '')
        +     'Email</span>'
        +   '<a href="mailto:' + c.email + '" class="contact-value" id="contactEmail">' + c.email + '</a>'
        + '</div>'
        + '<div class="contact-divider" aria-hidden="true"></div>'
        + '<div class="contact-row">'
        +   '<span class="contact-label">Hotline</span>'
        +   '<a href="tel:+84' + c.phone.replace(/^0/, '') + '" class="contact-value" id="contactPhone">' + phoneDisplay + '</a>'
        + '</div>'
        + '<div class="contact-divider" aria-hidden="true"></div>'
        + '<div class="contact-row">'
        +   '<span class="contact-label">'
        +     (icons.location ? '<img src="' + icons.location + '" class="contact-icon" alt="" style="width:22px;height:22px;vertical-align:middle;margin-right:12px;opacity:0.85;">' : '')
        +     'Location</span>'
        +   '<span class="contact-value">' + c.location + '</span>'
        + '</div>'
        + '<div class="contact-divider" aria-hidden="true"></div>'
        + '<div class="contact-links">'
        +   (c.socials.linkedin ? '<a href="' + c.socials.linkedin + '" target="_blank" rel="noopener noreferrer" class="contact-platform-link" id="linkedinLink">' + (icons.linkedin ? '<img src="' + icons.linkedin + '" class="social-icon" alt="" style="width:20px;height:20px;vertical-align:middle;margin-right:8px;">' : '') + 'LinkedIn ↗</a>' : '')
        +   (c.socials.behance  ? '<a href="' + c.socials.behance  + '" target="_blank" rel="noopener noreferrer" class="contact-platform-link" id="behanceLink">' + (icons.behance ? '<img src="' + icons.behance + '" class="social-icon" alt="" style="width:20px;height:20px;vertical-align:middle;margin-right:8px;">' : '') + 'Behance ↗</a>'  : '')
        + '</div>';
    }

    // Footer
    var footerEl = el('footerInner');
    if (footerEl) {
      footerEl.innerHTML = ''
        + '<p class="footer-name">' + p.fullName + '</p>'
        + '<p class="footer-copy">© ' + (PORTFOLIO_DATA.contact.copyrightYear || new Date().getFullYear()) + ' · All rights reserved · ' + p.location + '</p>'
        + '<p class="footer-slogan">' + p.slogan + '</p>';
    }
  }

  // ── 1.8 CHẠY TẤT CẢ RENDER ──────────────────────────────────────
  function renderAll() {
    renderMeta();
    renderHero();
    renderShowreel();
    renderTicker();
    renderProjects();
    renderAbout();
    renderContact();
  }

  renderAll();

  // ── 1.9 PAGE REVEAL ──────────────────────────────────────────────
  var revealEl = el('pageReveal');
  if (revealEl) {
    setTimeout(function () {
      revealEl.classList.add('done');
      document.body.classList.remove('loading');
    }, 1400);
  } else {
    document.body.classList.remove('loading');
  }


  // ══════════════════════════════════════════════════════════════════
  //  PHẦN 2: TƯƠNG TÁC (Interactions)
  //  Sau khi render xong mới bind events
  // ══════════════════════════════════════════════════════════════════

  // ── 2.1 NAVBAR: Ẩn/hiện khi scroll ─────────────────────────────
  var navbar = el('navbar');
  var lastScrollY = 0;
  var navTicking  = false;

  function updateNavbar() {
    var scrollY = window.scrollY;
    if (scrollY > lastScrollY && scrollY > 80) {
      navbar.classList.add('hidden');
    } else {
      navbar.classList.remove('hidden');
    }
    lastScrollY = scrollY;
    navTicking = false;
  }

  window.addEventListener('scroll', function () {
    if (!navTicking) {
      requestAnimationFrame(updateNavbar);
      navTicking = true;
    }
    // Scrolled class for navbar background
    if (navbar) {
      if (window.scrollY > 20) navbar.classList.add('scrolled');
      else navbar.classList.remove('scrolled');
    }
  }, { passive: true });

  // ── HERO PARALLAX on scroll ──────────────────────────────────────
  var heroName = document.querySelector('.hero-name');
  var heroMeta = document.querySelector('.hero-meta');
  var heroPTicking = false;

  window.addEventListener('scroll', function () {
    if (!heroPTicking) {
      requestAnimationFrame(function () {
        var sy = window.scrollY;
        if (sy < window.innerHeight) {
          var p = sy * 0.15;
          if (heroName) heroName.style.transform = 'translateY(' + p + 'px)';
          if (heroMeta) heroMeta.style.opacity = 1 - sy / (window.innerHeight * 0.6);
        }
        heroPTicking = false;
      });
      heroPTicking = true;
    }
  }, { passive: true });

  // ── 2.2 NAVBAR: Active link theo section đang xem ───────────────
  var sections = document.querySelectorAll('section[id]');
  var navLinks = document.querySelectorAll('.nav-link');

  var sectionObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        var id = entry.target.getAttribute('id');
        navLinks.forEach(function (link) {
          link.classList.remove('active');
          if (link.getAttribute('href') === '#' + id) link.classList.add('active');
        });
      }
    });
  }, { rootMargin: '-40% 0px -55% 0px', threshold: 0 });

  sections.forEach(function (s) { sectionObserver.observe(s); });

  // ── 2.3 MOBILE BURGER MENU ──────────────────────────────────────
  var burger     = el('navBurger');
  var mobileMenu = el('navMobile');

  function closeMobileMenu() {
    mobileMenu.classList.remove('open');
    burger.setAttribute('aria-expanded', 'false');
    mobileMenu.setAttribute('aria-hidden', 'true');
    var spans = burger.querySelectorAll('span');
    spans[0].style.transform = '';
    spans[1].style.opacity   = '';
    spans[2].style.transform = '';
  }

  if (burger && mobileMenu) {
    burger.addEventListener('click', function () {
      var isOpen = mobileMenu.classList.toggle('open');
      burger.setAttribute('aria-expanded', isOpen.toString());
      mobileMenu.setAttribute('aria-hidden', (!isOpen).toString());
      var spans = burger.querySelectorAll('span');
      if (isOpen) {
        spans[0].style.transform = 'translateY(6px) rotate(45deg)';
        spans[1].style.opacity   = '0';
        spans[2].style.transform = 'translateY(-6px) rotate(-45deg)';
      } else {
        closeMobileMenu();
      }
    });

    document.querySelectorAll('.nav-mobile-link').forEach(function (link) {
      link.addEventListener('click', closeMobileMenu);
    });
  }

  // ── 2.4 SCROLL FADE-IN ANIMATION ────────────────────────────────
  var fadeObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        fadeObserver.unobserve(entry.target);
      }
    });
  }, { rootMargin: '0px 0px -60px 0px', threshold: 0.1 });

  // Observe tất cả fade-in (kể cả những phần tử vừa được render động)
  function observeFadeElements() {
    document.querySelectorAll('.fade-in').forEach(function (el) {
      fadeObserver.observe(el);
    });
  }
  observeFadeElements();

  // ── 2.5 SKILL BAR ANIMATION ─────────────────────────────────────
  var skillObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('animated');
        skillObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });

  function observeSkillBars() {
    document.querySelectorAll('.skill-fill').forEach(function (fill) {
      skillObserver.observe(fill);
    });
  }
  observeSkillBars();

  // ── 2.6 LIGHTBOX ────────────────────────────────────────────────
  var lightbox         = el('lightbox');
  var lightboxBackdrop = el('lightboxBackdrop');
  var lightboxClose    = el('lightboxClose');
  var lightboxVisual   = el('lightboxVisual');
  var lightboxCategory = el('lightboxCategory');
  var lightboxTitle    = el('lightboxTitle');
  var lightboxDesc     = el('lightboxDesc');
  var lightboxTags     = el('lightboxTags');
  var lightboxLink     = el('lightboxLink');

  // Map gradient class → màu nền
  var gradientMap = {
    'pv-gradient-1': 'linear-gradient(135deg, #1a1207 0%, #2d1f0a 40%, #0d0d0d 100%)',
    'pv-gradient-2': 'linear-gradient(135deg, #070d1a 0%, #0a1a2d 40%, #0d0d0d 100%)',
    'pv-gradient-3': 'linear-gradient(135deg, #0d0a1a 0%, #1a0d2d 40%, #0d0d0d 100%)',
    'pv-gradient-4': 'linear-gradient(135deg, #0a1207 0%, #0d1a0a 40%, #0d0d0d 100%)',
    'pv-gradient-5': 'linear-gradient(135deg, #1a0707 0%, #2d0a0a 40%, #0d0d0d 100%)',
  };

  function openLightbox(card) {
    // Lấy id dự án từ data attribute, tra cứu trong PORTFOLIO_DATA
    var projId = card.dataset.id;
    var proj   = PORTFOLIO_DATA.projects.find(function (p) { return p.id === projId; });
    if (!proj) return;

    // Điền nội dung lightbox
    lightboxCategory.textContent = proj.category;
    lightboxTitle.textContent    = proj.title;
    lightboxDesc.textContent     = proj.desc;
    lightboxTags.textContent     = proj.tags;
    lightboxLink.href            = proj.linkBehance || '#';

    // Phần visual: iframe video hoặc gradient
    if (proj.embedUrl) {
      lightboxVisual.innerHTML = ''
        + '<iframe src="' + proj.embedUrl + '" frameborder="0"'
        + ' allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"'
        + ' allowfullscreen style="width:100%;height:100%;border:none;"></iframe>';
    } else {
      var bg = gradientMap[proj.gradientClass] || '#1a1a1a';
      lightboxVisual.style.background = bg;
      lightboxVisual.innerHTML = ''
        + '<svg viewBox="0 0 60 60" fill="none" style="width:64px;height:64px;opacity:0.4;">'
        +   '<circle cx="30" cy="30" r="29" stroke="#C5A880" stroke-width="1"/>'
        +   '<polygon points="24,18 44,30 24,42" fill="#C5A880"/>'
        + '</svg>';
      lightboxVisual.style.display        = 'flex';
      lightboxVisual.style.alignItems     = 'center';
      lightboxVisual.style.justifyContent = 'center';
    }

    lightbox.classList.add('open');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    lightboxClose.focus();
  }

  function closeLightbox() {
    lightbox.classList.remove('open');
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    // Dừng video nếu có iframe
    var iframe = lightboxVisual.querySelector('iframe');
    if (iframe) { iframe.src = iframe.src; } // reload để dừng audio
  }

  // Bind click cho project cards (dùng event delegation vì cards render động)
  var grid = el('projectsGrid');
  if (grid) {
    grid.addEventListener('click', function (e) {
      var card = e.target.closest('.project-card');
      if (card) openLightbox(card);
    });
    grid.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        var card = e.target.closest('.project-card');
        if (card) { e.preventDefault(); openLightbox(card); }
      }
    });
  }

  if (lightboxClose)    lightboxClose.addEventListener('click', closeLightbox);
  if (lightboxBackdrop) lightboxBackdrop.addEventListener('click', closeLightbox);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && lightbox.classList.contains('open')) closeLightbox();
  });

  // ── 2.7 SHOWREEL PLACEHOLDER (khi chưa có video) ────────────────
  // Dùng event delegation vì showreel render sau
  var showreelFrame = el('showreelFrame');
  if (showreelFrame) {
    showreelFrame.addEventListener('click', function (e) {
      var playBtn = e.target.closest('#playShowreel');
      if (playBtn) {
        var placeholder = showreelFrame.querySelector('.showreel-placeholder');
        if (placeholder) {
          placeholder.style.transition = 'opacity 0.3s';
          placeholder.style.opacity    = '0.6';
          setTimeout(function () { placeholder.style.opacity = '1'; }, 300);
        }
      }
    });
    showreelFrame.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.id === 'playShowreel') {
        e.preventDefault();
        e.target.click();
      }
    });
  }

  // ── 2.8 SMOOTH SCROLL ───────────────────────────────────────────
  document.addEventListener('click', function (e) {
    var anchor = e.target.closest('a[href^="#"]');
    if (!anchor) return;
    var targetId = anchor.getAttribute('href');
    if (targetId === '#') return;
    var target = document.querySelector(targetId);
    if (target) {
      e.preventDefault();
      var navH    = navbar ? navbar.offsetHeight : 64;
      var targetY = target.getBoundingClientRect().top + window.scrollY - navH - 20;
      window.scrollTo({ top: targetY, behavior: 'smooth' });
      // Đóng mobile menu nếu đang mở
      if (mobileMenu && mobileMenu.classList.contains('open')) closeMobileMenu();
    }
  });

  // ── 2.9 CURSOR GLOW ─────────────────────────────────────────────
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

  // ── 2.10 TYPEWRITER EFFECT cho Slogan ───────────────────────────
  var sloganEl = el('heroSlogan');
  if (sloganEl) {
    var text    = sloganEl.dataset.sloganText || '';
    var charIdx = 0;
    sloganEl.textContent = '';

    function typeChar() {
      if (charIdx < text.length) {
        sloganEl.textContent += text[charIdx];
        charIdx++;
        setTimeout(typeChar, 38);
      }
    }
    // Bắt đầu sau khi hero fade-in xong
    setTimeout(typeChar, 900);
  }

})();
