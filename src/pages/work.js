/**
 * src/pages/work.js — WORK Cinema / Screening Room View
 *
 * Implements the Dark Cinema / Screening Room UI/UX specification (info/promt):
 * - Continuous moving vertical video wall where adjacent video screens visually touch (0 gap, 0 margin)
 * - Minimalist film archive labels: TAG (top-left) & NAME (bottom-right)
 * - Smooth auto-scroll loop (0.25–0.45 px/frame)
 * - User scroll / wheel / touch intervention (temporary pause + gentle auto-resume)
 * - Click video -> Minimalist Fullscreen Screening Mode (dominant video, audio unmuted)
 * - Text-only BACK control at right-center with large touch target
 * - Full keyboard (ESC, TAB, ENTER, SPACE) & safe-area touch a11y
 * - Respects prefers-reduced-motion
 */

(function () {
  'use strict';

  // ── Configurable Parameters (info/promt Section 6, 7, 19) ──
  var WORK_AUTO_SCROLL_SPEED    = 0.35; // px / frame (normalized 60fps)
  var WORK_SCROLL_RESUME_DELAY  = 2000; // ms of inactivity before auto-scroll resumes
  var WORK_ENTRANCE_SETTLE_DELAY = 850;  // ms before auto-scroll starts after entrance reveal

  // State Management
  var isWorkPageActive = false;
  var isFullscreenOpen = false;
  var isUserInteracting = false;
  var userInteractionTimer = null;
  var entranceSettleTimer = null;
  var animFrameId = null;
  var lastFrameTime = performance.now();
  var currentScrollY = 0;
  var savedScrollY = 0;
  var lastActiveScreenEl = null;

  // DOM references for Fullscreen
  var fsOverlay = null;
  var fsVideo = null;
  var fsBackBtn = null;

  function isReducedMotion() {
    if (window.__forceFullMotion === true) return false;
    if (window.__forceReducedMotion === true) return true;
    if (window.PageTransitions && typeof window.PageTransitions.isReducedMotion === 'function') {
      return window.PageTransitions.isReducedMotion();
    }
    var mq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
    return !!(mq && mq.matches);
  }

  function getWorkVideos() {
    if (window.WorkData && typeof window.WorkData.getVideos === 'function') {
      var dataVideos = window.WorkData.getVideos();
      if (dataVideos && dataVideos.length > 0) return dataVideos;
    }
    if (window.WORK_VIDEOS && window.WORK_VIDEOS.length > 0) {
      return window.WORK_VIDEOS;
    }
    if (window.WORK_MOCK_VIDEOS && window.WORK_MOCK_VIDEOS.length > 0) {
      return window.WORK_MOCK_VIDEOS;
    }
    return [
      { id: 'mock-1', key: 'WED_PHUNGTUONG.mp4', tag: 'WED', name: 'PHUNGTUONG', url: 'assets/videos/projects/WED_PHUNGTUONG.mp4' },
      { id: 'mock-2', key: 'MOTION_BRAND_FILM.mp4', tag: 'MOTION', name: 'BRAND_FILM', url: 'assets/videos/projects/MOTION_BRAND_FILM.mp4' },
      { id: 'mock-3', key: 'MV_SUMMER_NIGHT.mp4', tag: 'MV', name: 'SUMMER_NIGHT', url: 'assets/videos/projects/MV_SUMMER_NIGHT.mp4' },
      { id: 'mock-4', key: 'DOC_STREET_DN.mp4', tag: 'DOC', name: 'STREET_DN', url: 'assets/videos/projects/DOC_STREET_DN.mp4' }
    ];
  }

  // ── Render Cinema Screening Room ──
  function renderWorkPage() {
    var container = el('page-work');
    if (!container) return;

    // Architecture Flow #8: If WorkData is still loading, wait for ready() before rendering
    if (window.WorkData && window.WorkData.getStatus() === 'loading' && !window.WorkData.getVideos()) {
      window.WorkData.ready().then(function () {
        renderWorkPage();
        if (isWorkPageActive) {
          ensureSet1Position();
        }
      });
      return;
    }

    var workItems = getWorkVideos();
    if (!workItems || workItems.length === 0) return;

    // 1 Base set contains at least 6 screens
    var baseSet = [];
    while (baseSet.length < 6) {
      baseSet = baseSet.concat(workItems);
    }

    // 3-Set Infinite Reel Architecture: Set 0 (Top buffer), Set 1 (Active middle set), Set 2 (Bottom buffer)
    var reelItems = baseSet.concat(baseSet, baseSet);

    var screensHtml = '';
    reelItems.forEach(function (item, index) {
      var displayTag = item.tag || 'FILM';
      var displayName = item.name || 'UNTITLED';
      var screenId = 'cinema-screen-' + index;

      screensHtml += ''
        + '<article class="cinema-screen work-cinema-screen" id="' + screenId + '" data-index="' + index + '" data-url="' + item.url + '" data-tag="' + displayTag + '" data-name="' + displayName + '" tabindex="0" role="button" aria-label="Screening: ' + displayTag + ' — ' + displayName + '. Click to enter fullscreen screening">'
        +   '<div class="cinema-screen-media">'
        +     '<video class="cinema-screen-video" src="' + item.url + '" loop muted autoplay playsinline webkit-playsinline preload="metadata">'
        +       '<source src="' + item.url + '" type="video/mp4">'
        +     '</video>'
        +     '<div class="cinema-film-grain" aria-hidden="true"></div>'
        +     '<div class="cinema-screen-curtain" aria-hidden="true"></div>'
        +   '</div>'
        +   '<div class="cinema-screen-meta">'
        +     '<span class="cinema-meta-tag">' + displayTag + '</span>'
        +     '<span class="cinema-meta-name">' + displayName + '</span>'
        +   '</div>'
        + '</article>';
    });

    container.innerHTML = ''
      + '<section class="work-cinema-room" id="workCinemaRoom" aria-label="Dark Cinema Screening Room">'
      +   '<div class="cinema-micro-annotation" aria-hidden="true">'
      +     '<span class="cinema-anno-left">[ PDP ARCHIVE ]</span>'
      +     '<span class="cinema-anno-right"><span class="cinema-anno-dot"></span> CONTINUOUS REEL</span>'
      +   '</div>'
      +   '<div class="cinema-screen-reel" id="cinemaScreenReel" role="feed" aria-label="Continuous video screening reel">'
      +     screensHtml
      +   '</div>'
      + '</section>';

    // Cache fullscreen elements
    fsOverlay = el('cinemaFullscreenOverlay');
    fsVideo   = el('cinemaFullscreenVideo');
    fsBackBtn = el('cinemaBackBtn');

    // Attach IntersectionObserver for viewport video autoplay/pause
    initScreenVideoObserver();

    // Attach Interaction Listeners
    initCinemaEventListeners();

    if (isWorkPageActive) {
      ensureSet1Position();
    }
  }

  // ── Intersection Observer for Cinema Reel Videos ──
  var screenObserver = null;
  function initScreenVideoObserver() {
    if (typeof IntersectionObserver === 'undefined') return;

    if (screenObserver) {
      screenObserver.disconnect();
    }

    screenObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var video = entry.target.querySelector('video');
        if (!video) return;

        if (entry.isIntersecting) {
          // Play muted preview in reel
          var playPromise = video.play();
          if (playPromise !== undefined) {
            playPromise.catch(function () {
              // Silently handle autoplay restrictions
            });
          }
        } else {
          video.pause();
        }
      });
    }, {
      rootMargin: '100px 0px 100px 0px',
      threshold: 0.15
    });

    var screens = document.querySelectorAll('.cinema-screen');
    screens.forEach(function (screen) {
      screenObserver.observe(screen);
    });
  }

  // ── Fullscreen Screening Actions (info/promt Section 9, 10, 11, 12, 13) ──
  function openFullscreenScreening(screenEl) {
    if (!screenEl || isFullscreenOpen) return;

    var videoUrl = screenEl.getAttribute('data-url');
    if (!videoUrl) return;

    lastActiveScreenEl = screenEl;
    savedScrollY = window.scrollY;
    isFullscreenOpen = true;
    isUserInteracting = true; // Freeze auto-scroll

    if (!fsOverlay || !fsVideo || !fsBackBtn) {
      fsOverlay = el('cinemaFullscreenOverlay');
      fsVideo   = el('cinemaFullscreenVideo');
      fsBackBtn = el('cinemaBackBtn');
    }

    if (!fsOverlay || !fsVideo) return;

    // 1. Reset playback to 00:00 & set source
    fsVideo.pause();
    fsVideo.currentTime = 0;
    fsVideo.src = videoUrl;
    fsVideo.load();

    // 2. Open overlay
    fsOverlay.classList.add('active');
    fsOverlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // 3. Audio & Playback: reset currentTime = 0, muted = false, volume = 1, then play()
    fsVideo.currentTime = 0;
    fsVideo.muted = false;
    fsVideo.volume = 1;
    var playPromise = fsVideo.play();
    if (playPromise !== undefined) {
      playPromise.catch(function (err) {
        // Autoplay policy fallback: try muted then let user know or keep playing
        console.warn('[Work Cinema] Unmuted playback prevented by browser policy, falling back to muted:', err);
        fsVideo.muted = true;
        fsVideo.play().catch(function () {});
      });
    }

    // 4. Focus BACK control for keyboard accessibility
    setTimeout(function () {
      if (fsBackBtn) fsBackBtn.focus();
    }, 100);
  }

  function closeFullscreenScreening() {
    if (!isFullscreenOpen) return;

    if (fsVideo) {
      fsVideo.pause();
      fsVideo.removeAttribute('src');
      fsVideo.load();
    }

    if (fsOverlay) {
      fsOverlay.classList.remove('active');
      fsOverlay.setAttribute('aria-hidden', 'true');
    }

    document.body.style.overflow = '';
    isFullscreenOpen = false;

    // Restore previous reel scroll position instantly without jump
    window.scrollTo({
      top: savedScrollY,
      behavior: 'instant'
    });
    currentScrollY = savedScrollY;

    // Restore focus to previously clicked screen without hijacking scroll
    if (lastActiveScreenEl && typeof lastActiveScreenEl.focus === 'function') {
      try {
        lastActiveScreenEl.focus({ preventScroll: true });
      } catch (e) {
        lastActiveScreenEl.focus();
      }
    }

    // Resume auto-scroll immediately upon return to reel
    isUserInteracting = false;
    lastFrameTime = performance.now();
    startAutoScrollLoop();
  }

  // ── 3-Set Infinite Reel Boundary Wrap Engine ──
  var isBoundaryShifting = false;

  function ensureSet1Position() {
    var reel = el('cinemaScreenReel');
    if (!reel) return;
    var totalH = reel.offsetHeight;
    if (totalH <= 0) return;
    var setH = totalH / 3;
    if (setH <= 0) return;
    if (window.scrollY < setH || window.scrollY >= setH * 2) {
      try {
        window.scrollTo({ top: setH, behavior: 'instant' });
      } catch (e) {
        window.scrollTo(0, setH);
      }
      currentScrollY = setH;
    }
  }

  function checkInfiniteScrollBoundary() {
    if (!isWorkPageActive || isFullscreenOpen || isBoundaryShifting) return;
    var reel = el('cinemaScreenReel');
    if (!reel) return;
    var totalH = reel.offsetHeight;
    if (totalH <= 0) return;
    var setH = totalH / 3;
    if (setH <= 0) return;

    var currentY = window.scrollY;

    // Scrolling DOWN past Set 1 into Set 2: Seamlessly shift back by 1 set (into Set 1)
    if (currentY >= setH * 2) {
      isBoundaryShifting = true;
      var targetY = currentY - setH;
      try {
        window.scrollTo({ top: targetY, behavior: 'instant' });
      } catch (e) {
        window.scrollTo(0, targetY);
      }
      currentScrollY = targetY;
      requestAnimationFrame(function () {
        isBoundaryShifting = false;
      });
    }
    // Scrolling UP past Set 1 into Set 0: Seamlessly shift forward by 1 set (into Set 1)
    else if (currentY < setH) {
      isBoundaryShifting = true;
      var targetY = currentY + setH;
      try {
        window.scrollTo({ top: targetY, behavior: 'instant' });
      } catch (e) {
        window.scrollTo(0, targetY);
      }
      currentScrollY = targetY;
      requestAnimationFrame(function () {
        isBoundaryShifting = false;
      });
    }
  }

  // ── Auto-Scroll Engine (info/promt Section 6, 7) ──
  function handleUserInteraction() {
    if (!isWorkPageActive || isFullscreenOpen) return;

    isUserInteracting = true;
    currentScrollY = window.scrollY;

    if (userInteractionTimer) {
      clearTimeout(userInteractionTimer);
    }

    userInteractionTimer = setTimeout(function () {
      isUserInteracting = false;
      currentScrollY = window.scrollY;
      lastFrameTime = performance.now();
    }, WORK_SCROLL_RESUME_DELAY);
  }

  function startAutoScrollLoop() {
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    lastFrameTime = performance.now();
    currentScrollY = window.scrollY;

    function step(now) {
      var dt = (now - lastFrameTime) / (1000 / 60); // Normalize to 60fps
      lastFrameTime = now;

      // Cap dt to prevent leap jumps if tab was backgrounded
      if (dt > 3) dt = 3;

      if (isWorkPageActive && !isFullscreenOpen && !isUserInteracting && !window.__forceReducedMotion) {
        currentScrollY += WORK_AUTO_SCROLL_SPEED * dt;

        var reel = el('cinemaScreenReel');
        if (reel) {
          var totalH = reel.offsetHeight;
          var setH = totalH / 3;
          if (setH > 0) {
            if (currentScrollY >= setH * 2) {
              // Seamless infinite wrap to Set 1
              currentScrollY -= setH;
            } else if (currentScrollY < setH) {
              currentScrollY += setH;
            }
          }
        }

        window.scrollTo({
          top: currentScrollY,
          behavior: 'instant'
        });
      }

      if (isWorkPageActive) {
        animFrameId = requestAnimationFrame(step);
      } else {
        animFrameId = null;
      }
    }

    animFrameId = requestAnimationFrame(step);
  }

  function stopAutoScrollLoop() {
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
  }

  // ── Event Listeners ──
  var isEventsInitialized = false;
  function initCinemaEventListeners() {
    var reel = el('cinemaScreenReel');
    if (!reel) return;

    // Click / Enter on Cinema Screen
    reel.addEventListener('click', function (e) {
      var screen = e.target.closest('.cinema-screen');
      if (screen) {
        openFullscreenScreening(screen);
      }
    });

    reel.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        var screen = e.target.closest('.cinema-screen');
        if (screen) {
          e.preventDefault();
          openFullscreenScreening(screen);
        }
      }
    });

    if (isEventsInitialized) return;
    isEventsInitialized = true;

    // BACK button click
    if (fsBackBtn) {
      fsBackBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        closeFullscreenScreening();
      });
    }

    // Global Keydown (ESC to close fullscreen)
    document.addEventListener('keydown', function (e) {
      if (isFullscreenOpen && e.key === 'Escape') {
        e.preventDefault();
        closeFullscreenScreening();
      }
    });

    // User Scroll Intervention: genuine manual scrolling (wheel, touch drag, keyboard scroll)
    window.addEventListener('wheel', function () {
      handleUserInteraction();
      checkInfiniteScrollBoundary();
    }, { passive: true });

    window.addEventListener('touchmove', function () {
      handleUserInteraction();
      checkInfiniteScrollBoundary();
    }, { passive: true });

    window.addEventListener('keydown', function (e) {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].indexOf(e.key) !== -1) {
        if (!isFullscreenOpen) {
          handleUserInteraction();
          checkInfiniteScrollBoundary();
        }
      }
    });

    // Detect native scrollbar drag without false-triggering on auto-scroll
    window.addEventListener('scroll', function () {
      if (!isWorkPageActive || isFullscreenOpen) return;
      var diff = Math.abs(window.scrollY - currentScrollY);
      // Auto-scroll moves ~0.35px per frame. If diff > 8px, user manually scrolled / dragged scrollbar.
      if (diff > 8) {
        handleUserInteraction();
      }
      checkInfiniteScrollBoundary();
    }, { passive: true });
  }

  // ── Route & Lifecycle Hooks ──
  function onEnterWork() {
    isWorkPageActive = true;
    isUserInteracting = false;
    document.documentElement.style.scrollBehavior = 'auto';
    document.body.style.scrollBehavior = 'auto';

    if (entranceSettleTimer) {
      clearTimeout(entranceSettleTimer);
      entranceSettleTimer = null;
    }
    if (userInteractionTimer) {
      clearTimeout(userInteractionTimer);
      userInteractionTimer = null;
    }

    // Always re-render with latest WorkData videos upon entering Work page
    renderWorkPage();

    // Position in Set 1 (middle set) so user can immediately scroll both UP and DOWN seamlessly
    ensureSet1Position();
    currentScrollY = window.scrollY;

    // Start auto-scroll loop immediately (info/promt Section 6)
    startAutoScrollLoop();

    // Re-check videos in viewport
    setTimeout(function () {
      if (screenObserver) {
        var screens = document.querySelectorAll('.cinema-screen');
        screens.forEach(function (screen) {
          screenObserver.observe(screen);
        });
      }
    }, 100);
  }

  function onExitWork() {
    isWorkPageActive = false;
    stopAutoScrollLoop();
    document.documentElement.style.scrollBehavior = '';
    document.body.style.scrollBehavior = '';

    if (isFullscreenOpen) {
      closeFullscreenScreening();
    }

    if (screenObserver) {
      screenObserver.disconnect();
    }

    // Pause all reel videos
    var videos = document.querySelectorAll('.cinema-screen-video');
    videos.forEach(function (v) {
      v.pause();
    });
  }

  // ── WorkData Manifest Dynamic Sync ──
  if (window.WorkData && typeof window.WorkData.onUpdate === 'function') {
    window.WorkData.onUpdate(function (newVideos, source) {
      // Re-render whenever new videos arrive as long as fullscreen overlay is not open
      if (!isFullscreenOpen) {
        renderWorkPage();
      }
    });
  }

  // ── Public API ──
  window.renderWorkPage = renderWorkPage;
  window.WorkCinema = {
    render: renderWorkPage,
    onEnterWork: onEnterWork,
    onExitWork: onExitWork,
    openFullscreen: openFullscreenScreening,
    closeFullscreen: closeFullscreenScreening,
    isFullscreen: function () { return isFullscreenOpen; },
    isAutoScrolling: function () { return !isUserInteracting && isWorkPageActive && !isFullscreenOpen; },
    getAutoScrollSpeed: function () { return WORK_AUTO_SCROLL_SPEED; },
    setAutoScrollSpeed: function (s) { WORK_AUTO_SCROLL_SPEED = s; }
  };

})();
