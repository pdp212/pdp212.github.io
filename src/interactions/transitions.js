/**
 * src/interactions/transitions.js — Cross-Browser Cinematic Page Transitions
 *
 * Implements four visually distinct cinematic entrance choreographies:
 *   - HOME:    "Cinematic Aperture & Viewfinder Focus"
 *   - WORK:    "Filmstrip Gate & Slate Roll"
 *   - PROFILE: "Editorial Dossier & Technical Telemetry"
 *   - CONTACT: "Transmission Frequency & Studio Telemetry"
 *
 * Visual Sequence (Section 3 of Specification):
 *   old page active
 *   → old page exit (120ms)
 *   → shutter blade wipe-in (130ms)
 *   → midpoint DOM switch & target active
 *   → target entrance choreography begins
 *   → shutter reveals target (140ms wipe-out)
 *   → target settles (400–750ms)
 */

(function () {
  'use strict';

  var isTransitioning = false;
  var shutterEl = null;

  function getShutter() {
    if (!shutterEl) {
      shutterEl = document.getElementById('pageTransitionShutter');
    }
    return shutterEl;
  }

  /**
   * Only bypass animation when prefers-reduced-motion media query matches
   * (Section 9 Specification). Also supports ?motion=full override.
   */
  function isReducedMotion() {
    if (window.__forceFullMotion === true) return false;
    if (window.__forceReducedMotion === true) return true;
    if (window.location.search.indexOf('motion=full') !== -1) return false;
    if (window.location.hash.indexOf('motion=full') !== -1) return false;
    if (window.location.search.indexOf('reduced_motion=1') !== -1) return true;
    if (window.location.hash.indexOf('reduced_motion=1') !== -1) return true;
    if (localStorage.getItem('pdp_motion') === 'full') return false;
    if (localStorage.getItem('pdp_motion') === 'reduced') return true;

    var mq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
    return !!(mq && mq.matches);
  }

  /**
   * Reset and animate profile skill telemetry bars & percentage counters
   * Visual count-up synchronized with expanding progress bar
   */
  function runProfileSkillTelemetry() {
    var profileView = document.getElementById('page-profile');
    if (!profileView) return;

    var barItems = profileView.querySelectorAll('.skill-bar-item');
    barItems.forEach(function (item, idx) {
      var percentEl = item.querySelector('.skill-bar-percent');
      var fillEl = item.querySelector('.skill-fill');
      if (!percentEl || !fillEl) return;

      var targetLevel = parseInt(fillEl.style.getPropertyValue('--fill') || percentEl.textContent, 10) || 80;

      if (isReducedMotion()) {
        fillEl.style.width = targetLevel + '%';
        percentEl.textContent = targetLevel + '%';
        return;
      }

      // Reset to 0 initially
      fillEl.style.transition = 'none';
      fillEl.style.width = '0%';
      percentEl.textContent = '0%';

      // Start stagger animation as right dossier panel settles
      var delay = 240 + idx * 70;
      setTimeout(function () {
        fillEl.style.transition = 'width 0.8s cubic-bezier(0.16, 1, 0.3, 1)';
        fillEl.style.width = targetLevel + '%';

        // Count up numbers in sync with bar expansion
        var startTime = performance.now();
        var duration = 800;

        function updateCounter(now) {
          var elapsed = now - startTime;
          var progress = Math.min(elapsed / duration, 1);
          // Cubic ease-out
          var ease = 1 - Math.pow(1 - progress, 3);
          var currentVal = Math.round(targetLevel * ease);
          percentEl.textContent = currentVal + '%';

          if (progress < 1) {
            requestAnimationFrame(updateCounter);
          } else {
            percentEl.textContent = targetLevel + '%';
          }
        }

        requestAnimationFrame(updateCounter);
      }, delay);
    });
  }

  /**
   * Trigger entrance choreography specific to the activated page
   */
  function runPageEntranceChoreography(pageId) {
    var view = document.getElementById('page-' + pageId);
    if (!view) return;

    // Clean previous entrance classes across all views
    ['home', 'work', 'profile', 'contact'].forEach(function (p) {
      var v = document.getElementById('page-' + p);
      if (v) {
        v.classList.remove('enter-home', 'enter-work', 'enter-profile', 'enter-contact');
      }
    });

    // Ensure the target view is marked active and renderable
    view.classList.add('active');
    view.setAttribute('aria-hidden', 'false');

    // Force DOM reflow to ensure keyframe animations reliably restart across all engines
    void view.offsetWidth;

    // Add unique entrance class to active view
    var enterClass = 'enter-' + pageId;
    view.classList.add(enterClass);

    // Work Cinema Lifecycle Management
    if (pageId === 'work') {
      if (window.WorkCinema && typeof window.WorkCinema.onEnterWork === 'function') {
        window.WorkCinema.onEnterWork();
      }
    } else {
      if (window.WorkCinema && typeof window.WorkCinema.onExitWork === 'function') {
        window.WorkCinema.onExitWork();
      }
    }

    // Page-specific JS hooks
    if (pageId === 'home') {
      // Typewriter starts after hero identity & showreel settle (~700ms)
      if (typeof initTypewriter === 'function') {
        setTimeout(initTypewriter, isReducedMotion() ? 0 : 700);
      }
    } else if (pageId === 'profile') {
      // Skill telemetry animation
      runProfileSkillTelemetry();
    } else if (pageId === 'work') {
      // Re-observe fade elements if any
      if (typeof observeFadeElements === 'function') {
        setTimeout(observeFadeElements, 50);
      }
    } else if (pageId === 'contact') {
      // Trigger radar pulse on status beacon
      var badge = view.querySelector('.contact-availability-badge');
      if (badge) {
        badge.classList.remove('pulse-active');
        void badge.offsetWidth;
        badge.classList.add('pulse-active');
      }
    }
  }

  /**
   * Main Page Transition Orchestrator
   */
  function executePageTransition(fromPageId, toPageId, onSwitchState, onDone) {
    if (isTransitioning) {
      return false; // Prevent double transitions
    }

    // Direct bypass for reduced motion (Section 9 Specification)
    if (isReducedMotion()) {
      var currentView = fromPageId ? document.getElementById('page-' + fromPageId) : null;
      if (currentView) {
        currentView.classList.remove('active', 'page-exit');
        currentView.setAttribute('aria-hidden', 'true');
      }
      if (typeof onSwitchState === 'function') {
        onSwitchState();
      }
      window.scrollTo(0, 0);
      runPageEntranceChoreography(toPageId);
      if (typeof onDone === 'function') onDone();
      return true;
    }

    isTransitioning = true;
    var shutter = getShutter();
    var currentView = fromPageId ? document.getElementById('page-' + fromPageId) : null;

    // STEP 1: Current Page Exit Animation (~120ms)
    if (currentView && currentView.classList.contains('active')) {
      currentView.classList.add('page-exit');
    }

    setTimeout(function () {
      // STEP 2: Shutter Blade Sweep-In (~130ms)
      if (shutter) {
        shutter.classList.remove('wipe-out');
        shutter.classList.add('wipe-in');
      }

      setTimeout(function () {
        // STEP 3: Midpoint Switch — Hide old view, activate target view, scroll top
        if (currentView) {
          currentView.classList.remove('active', 'page-exit');
          currentView.setAttribute('aria-hidden', 'true');
        }

        if (typeof onSwitchState === 'function') {
          onSwitchState();
        }

        window.scrollTo(0, 0);

        var targetView = document.getElementById('page-' + toPageId);
        if (targetView) {
          targetView.classList.add('active');
          targetView.setAttribute('aria-hidden', 'false');
          void targetView.offsetWidth; // Force reflow
        }

        // STEP 4: Shutter Blade Sweep-Out (~140ms)
        // Reveals the target page as it enters and settles
        if (shutter) {
          shutter.classList.remove('wipe-in');
          shutter.classList.add('wipe-out');
        }

        // STEP 5: Trigger Page-Specific Entrance Choreography
        // Runs concurrently with shutter sweep-out so elements are visibly moving and settling
        runPageEntranceChoreography(toPageId);

        setTimeout(function () {
          // Cleanup shutter classes
          if (shutter) {
            shutter.classList.remove('wipe-out');
          }
          isTransitioning = false;
          if (typeof onDone === 'function') onDone();
        }, 160);

      }, 130);

    }, 120);

    return true;
  }

  // Export public transition API
  window.PageTransitions = {
    execute: executePageTransition,
    runEntrance: runPageEntranceChoreography,
    isTransitioning: function () {
      return isTransitioning;
    },
    runProfileTelemetry: runProfileSkillTelemetry,
    isReducedMotion: isReducedMotion,
  };

})();
