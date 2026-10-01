/**
 * src/interactions/videoTransitions.js — Video-Based Cinematic Transition System
 *
 * "STATIC HOLD HANDOFF" MODEL (Strategy B)
 *
 * Architecture:
 *   PRE-RENDERED CINEMATIC VIDEO (MP4 / H.264) + PAGE ENTRANCE CHOREOGRAPHY
 *   The transition videos are intentionally designed with a STATIC FINAL FRAME.
 *   The static hold section is a deliberate handoff to hide the DOM swap and allow
 *   the target page's entrance choreography to begin running behind the static frame.
 *
 * Contract:
 *   - Container: MP4 (H.264, yuv420p, 1920x1080, 30fps, No Audio, Black background #000000, No Alpha)
 *   - Assets:
 *       assets/transitions/intro.mp4               (Intro Opening: 2.0-3.0s, holdDuration: 0.0s)
 *       assets/transitions/home-to-work.mp4        (HOME → WORK: 1.0-1.5s, holdDuration: 0.30s)
 *       assets/transitions/work-to-profile.mp4     (WORK → PROFILE: 1.0-1.5s, holdDuration: 0.30s)
 *       assets/transitions/profile-to-contact.mp4  (PROFILE → CONTACT: 1.0-1.5s, holdDuration: 0.30s)
 *       assets/transitions/contact-to-home.mp4     (CONTACT → HOME: 1.0-1.5s, holdDuration: 0.30s)
 *
 * Sequence (Strategy B):
 *   CURRENT PAGE active
 *   ↓
 *   PLAY TRANSITION VIDEO (fullscreen black overlay)
 *   ↓
 *   CINEMATIC MOTION
 *   ↓
 *   VIDEO REACHES STATIC HOLD SECTION (video.currentTime >= video.duration - holdDuration)
 *   ↓
 *   SWITCH TARGET PAGE (DOM update + scrollTo(0,0))
 *   ↓
 *   RUN TARGET PAGE ENTRANCE CHOREOGRAPHY (.enter-home, .enter-work, .enter-profile, .enter-contact)
 *   ↓
 *   VIDEO CONTINUES HOLDING STATIC FRAME (opacity: 1, visibility: visible, pointer-events: none)
 *   ↓
 *   VIDEO ENDS (video.ended event)
 *   ↓
 *   HIDE VIDEO (instant cut, no fade, no crossfade, no black gap)
 *   ↓
 *   TARGET PAGE REMAINS VISIBLE AND FULLY INTERACTIVE
 *
 * Fallback:
 *   If an MP4 asset is missing or fails to load, gracefully performs a short CSS fallback
 *   transition and logs: [TransitionVideo] Missing asset: <path>
 */

(function () {
  'use strict';

  // Configurable Transition Timing Model ("STATIC HOLD HANDOFF" - Strategy B)
  var TRANSITION_CONFIG = {
    'intro': {
      src: 'assets/transitions/intro.mp4',
      holdDuration: 0.0
    },
    'home-to-work': {
      src: 'assets/transitions/home-to-work.mp4',
      holdDuration: 0.0
    },
    'work-to-profile': {
      src: 'assets/transitions/work-to-profile.mp4',
      holdDuration: 0.0
    },
    'profile-to-contact': {
      src: 'assets/transitions/profile-to-contact.mp4',
      holdDuration: 0.0
    },
    'contact-to-home': {
      src: 'assets/transitions/contact-to-home.mp4',
      holdDuration: 0.0
    }
  };

  var overlayEl = null;
  var videoEl = null;
  var isTransitioning = false;
  var currentTransitionName = null;
  var hasSwitched = false;
  var animFrameId = null;
  var fallbackTimer = null;
  var hasIntroPlayed = false;

  function getElements() {
    if (!overlayEl) {
      overlayEl = document.getElementById('pageTransitionVideo');
    }
    if (!videoEl) {
      videoEl = document.getElementById('pageTransitionVideoElement');
    }
    return { overlay: overlayEl, video: videoEl };
  }

  /**
   * Helper to resolve transition config for any given page pair
   */
  function getRouteConfig(fromPage, toPage) {
    var key = (fromPage || 'home') + '-to-' + (toPage || 'work');
    if (TRANSITION_CONFIG[key]) {
      return { key: key, config: TRANSITION_CONFIG[key] };
    }

    // Default sequential loop mappings for non-adjacent transitions
    var fallbackMap = {
      'home-to-profile': 'home-to-work',
      'home-to-contact': 'contact-to-home',
      'work-to-home': 'contact-to-home',
      'work-to-contact': 'work-to-profile',
      'profile-to-home': 'contact-to-home',
      'profile-to-work': 'work-to-profile',
      'contact-to-work': 'home-to-work',
      'contact-to-profile': 'profile-to-contact'
    };

    var fallbackKey = fallbackMap[key] || 'home-to-work';
    return {
      key: key,
      config: TRANSITION_CONFIG[fallbackKey] || {
        src: 'assets/transitions/' + key + '.mp4',
        holdDuration: 0.30
      }
    };
  }

  /**
   * Preload transition video assets
   */
  function preloadAssets(routes) {
    var list = routes || ['intro', 'home-to-work'];
    list.forEach(function (name) {
      var item = TRANSITION_CONFIG[name];
      if (item && item.src) {
        var pre = document.createElement('link');
        pre.rel = 'preload';
        pre.as = 'video';
        pre.href = item.src;
        pre.type = 'video/mp4';
        document.head.appendChild(pre);
      }
    });
  }

  /**
   * Hide the video transition overlay cleanly and immediately at video.ended
   * (No crossfade, no fading out before video.ended, no black gap)
   */
  function hideOverlay(callback) {
    var els = getElements();
    if (els.overlay) {
      els.overlay.classList.remove('active');
      els.overlay.setAttribute('aria-hidden', 'true');
    }
    if (els.video) {
      try {
        els.video.pause();
      } catch (e) { }
    }
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    if (typeof callback === 'function') {
      callback();
    }
  }

  /**
   * Perform safe development fallback if asset is missing or fails to play
   */
  function executeFallback(src, onSwitchState, toPage, onDone) {
    console.warn('[TransitionVideo] Missing asset: ' + src);
    var els = getElements();

    if (els.overlay) {
      els.overlay.classList.add('active');
      els.overlay.setAttribute('aria-hidden', 'false');
    }

    // Short black screen transition (140ms)
    setTimeout(function () {
      if (typeof onSwitchState === 'function') {
        onSwitchState();
      }
      window.scrollTo(0, 0);

      // Start target page choreography
      if (window.PageTransitions && typeof window.PageTransitions.runEntrance === 'function') {
        window.PageTransitions.runEntrance(toPage);
      }

      // Clean reveal of target page
      setTimeout(function () {
        hideOverlay(function () {
          isTransitioning = false;
          currentTransitionName = null;
          hasSwitched = true;
          if (typeof onDone === 'function') {
            onDone();
          }
        });
      }, 140);

    }, 140);
  }

  /**
   * Play the mandatory initial intro opening video
   *
   * Intro sequence:
   *   Screen starts BLACK
   *   → play assets/transitions/intro.mp4
   *   → finish intro
   *   → reveal HOME
   *   → run HOME choreography
   */
  function playIntro(onDone, targetPage) {
    hasIntroPlayed = true;
    isTransitioning = false;
    currentTransitionName = null;

    var revealEl = document.getElementById('pageReveal');
    if (revealEl) {
      revealEl.classList.add('done');
    }
    document.body.classList.remove('loading');

    if (typeof onDone === 'function') {
      onDone();
    }
  }


  /**
   * Main Route Video Transition Player — "STATIC HOLD HANDOFF" (Strategy B)
   *
   * Flow:
   *   1. Video starts playing (fullscreen overlay active)
   *   2. At switchTime = duration - holdDuration:
   *      - Activate target page in DOM
   *      - Reset scroll to top
   *      - Trigger target page entrance choreography (.enter-work, .enter-profile, etc.)
   *   3. Video continues holding static frame (opacity 1, visibility visible)
   *   4. At video.ended:
   *      - Hide transition video cleanly (instant cut, no fade, no crossfade)
   *      - Release transition lock
   *      - Target page is revealed already mid-way or at intended entrance state
   *
   * @param {string} fromPage — Current page ID (e.g. 'home')
   * @param {string} toPage   — Target page ID (e.g. 'work')
   * @param {Function} onSwitchState — Callback to swap active views in DOM
   * @param {Function} onDone — Callback when transition finishes
   */
  function playTransition(fromPage, toPage, onSwitchState, onDone) {
    if (isTransitioning) {
      return false; // Transition Lock: ignore repeated clicks
    }

    isTransitioning = true;
    hasSwitched = false;

    var routeInfo = getRouteConfig(fromPage, toPage);
    var config = routeInfo.config;
    currentTransitionName = routeInfo.key;

    var els = getElements();
    if (!els.overlay || !els.video) {
      executeFallback(config.src, onSwitchState, toPage, onDone);
      return true;
    }

    var video = els.video;
    var overlay = els.overlay;
    var hasHandledError = false;

    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');

    function cleanupListeners() {
      video.removeEventListener('timeupdate', checkProgress);
      video.removeEventListener('ended', handleVideoEnd);
      video.removeEventListener('error', handleVideoError);
      if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
      }
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
    }

    /**
     * Switch target page and trigger entrance choreography BEHIND the static hold frame
     */
    function switchPageNow() {
      if (hasSwitched) return;
      hasSwitched = true;

      // 1. Switch active page in DOM
      if (typeof onSwitchState === 'function') {
        onSwitchState();
      }

      // 2. Reset scroll to top
      window.scrollTo(0, 0);

      // 3. Trigger target page entrance choreography behind static frame
      if (window.PageTransitions && typeof window.PageTransitions.runEntrance === 'function') {
        window.PageTransitions.runEntrance(toPage);
      }
    }

    function getSwitchTime() {
      var duration = video.duration || 0;
      var hold = typeof config.holdDuration === 'number' ? config.holdDuration : 0.30;
      return Math.max(0, duration - hold);
    }

    function checkProgress() {
      if (!hasSwitched && video.duration > 0) {
        var switchTime = getSwitchTime();
        if (video.currentTime >= switchTime) {
          switchPageNow();
        }
      }
    }

    // High precision frame tracking via requestAnimationFrame
    function trackFrames() {
      checkProgress();
      if (!video.paused && !video.ended) {
        animFrameId = requestAnimationFrame(trackFrames);
      }
    }

    /**
     * At video.ended:
     *   - Hide transition video (instant cut, no fade/crossfade)
     *   - Release transition lock
     *   - Target page remains visible and interactive
     */
    function handleVideoEnd() {
      cleanupListeners();
      switchPageNow(); // Ensure target page was activated

      hideOverlay(function () {
        isTransitioning = false;
        currentTransitionName = null;
        if (typeof onDone === 'function') {
          onDone();
        }
      });
    }

    function handleVideoError() {
      if (hasHandledError) return;
      hasHandledError = true;
      cleanupListeners();
      executeFallback(config.src, onSwitchState, toPage, onDone);
    }

    video.addEventListener('timeupdate', checkProgress);
    video.addEventListener('ended', handleVideoEnd);
    video.addEventListener('error', handleVideoError);

    // Development fallback timeout: if asset doesn't exist, trigger fallback safely
    fallbackTimer = setTimeout(function () {
      if (video.readyState < 1) {
        handleVideoError();
      }
    }, 600);

    video.src = config.src;
    video.currentTime = 0;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');

    var playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.then(function () {
        animFrameId = requestAnimationFrame(trackFrames);
      }).catch(function () {
        handleVideoError();
      });
    }

    return true;
  }

  // Diagnostics & Status API
  window.VideoTransitions = {
    playIntro: playIntro,
    play: playTransition,
    isPlaying: function () {
      return isTransitioning;
    },
    getCurrentTransition: function () {
      return currentTransitionName;
    },
    getCurrentTime: function () {
      return videoEl ? videoEl.currentTime : 0;
    },
    getDuration: function () {
      return videoEl ? videoEl.duration : 0;
    },
    getSwitchState: function () {
      return hasSwitched;
    },
    getStatus: function () {
      var currConfig = currentTransitionName ? TRANSITION_CONFIG[currentTransitionName] : null;
      var dur = videoEl ? videoEl.duration : 0;
      var hold = currConfig && typeof currConfig.holdDuration === 'number' ? currConfig.holdDuration : 0.30;
      return {
        isPlaying: isTransitioning,
        currentTransition: currentTransitionName,
        currentTime: videoEl ? videoEl.currentTime : 0,
        duration: dur,
        hasSwitched: hasSwitched,
        holdDuration: hold,
        switchTime: Math.max(0, dur - hold)
      };
    },
    getConfig: function () {
      return TRANSITION_CONFIG;
    },
    preload: preloadAssets
  };

})();
