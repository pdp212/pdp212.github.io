/**
 * src/interactions/navigation.js — 4-Page SPA Router & Navigation
 * Routes:
 *   #home    → HOME view (Identity, Ticker, Showreel, Featured Work)
 *   #work    → WORK view (Selected Works, Category filters, Project Grid)
 *   #profile → PROFILE view (Bio, Skills, Education, AI Generative Pipeline)
 *   #contact → CONTACT view (Channels, Availability, Socials, Footer)
 *
 * Supports browser back/forward, direct URL refresh, mobile menu, and keyboard a11y.
 */

(function () {
  'use strict';

  var VALID_PAGES = ['home', 'work', 'profile', 'contact'];
  var navbar     = el('navbar');
  var burger     = el('navBurger');
  var mobileMenu = el('navMobile');
  var currentPage = null;

  // ── Helper: Update Nav Links Active States ──
  function updateNavLinks(target) {
    var allNavLinks = document.querySelectorAll('.nav-link, .nav-mobile-link');
    allNavLinks.forEach(function (link) {
      var href = link.getAttribute('href') || '';
      var linkTarget = href.replace(/^#/, '');
      if (linkTarget === target) {
        link.classList.add('active');
        link.setAttribute('aria-current', 'page');
      } else {
        link.classList.remove('active');
        link.removeAttribute('aria-current');
      }
    });
  }

  // ── Router: Switch Active Page View with Cinematic Transition ──
  function navigateTo(pageId, isHistoryNavigation) {
    var target = (pageId || '').toLowerCase().replace(/^#/, '');
    if (VALID_PAGES.indexOf(target) === -1) {
      target = 'home';
    }

    // Ignore redundant navigation to the same page
    if (currentPage === target) {
      return;
    }

    // Transition Lock: Prevent double transition if already transitioning
    if ((window.VideoTransitions && window.VideoTransitions.isPlaying()) ||
        (window.PageTransitions && window.PageTransitions.isTransitioning())) {
      return;
    }

    var expectedHash = '#' + target;

    function applyActiveView(activePage) {
      VALID_PAGES.forEach(function (p) {
        var view = el('page-' + p);
        if (view) {
          if (p === activePage) {
            view.classList.add('active');
            view.setAttribute('aria-hidden', 'false');
            void view.offsetWidth; // Reflow
          } else {
            view.classList.remove('active');
            view.setAttribute('aria-hidden', 'true');
          }
        }
      });
      updateNavLinks(activePage);
      currentPage = activePage;
    }

    // FIRST BOOT / INITIAL LOAD (Intro Opening → HOME)
    if (currentPage === null) {
      currentPage = target;
      if (window.location.hash !== expectedHash) {
        window.location.hash = expectedHash;
      }

      function finishInitialBoot() {
        applyActiveView(target);
        if (window.PageTransitions && typeof window.PageTransitions.runEntrance === 'function') {
          window.PageTransitions.runEntrance(target);
        } else if (target === 'home' && typeof initTypewriter === 'function') {
          setTimeout(initTypewriter, 200);
        }
      }

      // Deterministic stable initial boot (visual stability from first rendered frame)
      finishInitialBoot();
      return;
    }

    // SUBSEQUENT NAVIGATION: Run Route Video Transition
    var fromPage = currentPage;

    function onSwitchState() {
      if (window.location.hash !== expectedHash) {
        window.location.hash = expectedHash;
      }
      applyActiveView(target);
      closeMobileMenu();
    }

    function onDone() {
      closeMobileMenu();
    }

    // 1. Primary: Video-based cinematic transition
    if (window.VideoTransitions && typeof window.VideoTransitions.play === 'function') {
      window.VideoTransitions.play(fromPage, target, onSwitchState, onDone);
    } else if (window.PageTransitions && typeof window.PageTransitions.execute === 'function') {
      // 2. Fallback: CSS blade transition
      window.PageTransitions.execute(fromPage, target, onSwitchState, onDone);
    } else {
      // 3. Raw Fallback
      onSwitchState();
      window.scrollTo(0, 0);
      if (window.PageTransitions && typeof window.PageTransitions.runEntrance === 'function') {
        window.PageTransitions.runEntrance(target);
      }
      onDone();
    }
  }

  // Handle Hash Changes (Back / Forward)
  function onHashChange() {
    var hash = (window.location.hash || '#home').replace(/^#/, '');
    if (hash !== currentPage) {
      navigateTo(hash, true);
    }
  }

  window.addEventListener('hashchange', onHashChange);

  // Global header remains permanently stationary as floating typography (info/promt specification)

  // ── Mobile Burger Menu ──
  function closeMobileMenu() {
    if (!mobileMenu || !burger) return;
    mobileMenu.classList.remove('open');
    burger.setAttribute('aria-expanded', 'false');
    mobileMenu.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    var spans = burger.querySelectorAll('span');
    if (spans.length >= 3) {
      spans[0].style.transform = '';
      spans[1].style.opacity   = '';
      spans[2].style.transform = '';
    }
  }

  if (burger && mobileMenu) {
    burger.addEventListener('click', function () {
      var isOpen = mobileMenu.classList.toggle('open');
      burger.setAttribute('aria-expanded', isOpen.toString());
      mobileMenu.setAttribute('aria-hidden', (!isOpen).toString());
      document.body.style.overflow = isOpen ? 'hidden' : '';
      var spans = burger.querySelectorAll('span');
      if (spans.length >= 3) {
        if (isOpen) {
          spans[0].style.transform = 'translateY(6px) rotate(45deg)';
          spans[1].style.opacity   = '0';
          spans[2].style.transform = 'translateY(-6px) rotate(-45deg)';
        } else {
          closeMobileMenu();
        }
      }
    });

    document.querySelectorAll('.nav-mobile-link').forEach(function (link) {
      link.addEventListener('click', closeMobileMenu);
    });

    // ESC to close mobile menu
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && mobileMenu.classList.contains('open')) {
        closeMobileMenu();
        burger.focus();
      }
    });
  }

  // Intercept anchor clicks to navigate cleanly
  document.addEventListener('click', function (e) {
    var anchor = e.target.closest('a[href^="#"]');
    if (!anchor) return;
    var href = anchor.getAttribute('href');
    if (!href || href === '#') return;
    var target = href.replace(/^#/, '');
    if (VALID_PAGES.indexOf(target) !== -1) {
      e.preventDefault();
      navigateTo(target);
    }
  });

  // Initial Route Dispatch
  var initialPage = (window.location.hash || '#home').replace(/^#/, '');
  navigateTo(initialPage);

  // Expose global router helper
  window.navigateToPage = navigateTo;

})();
