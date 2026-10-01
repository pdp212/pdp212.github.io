/**
 * src/interactions/scroll.js — Fade-in Observer, Skill Bar Observer, Parallax
 */
(function () {
  'use strict';

  // ── Scroll Fade-In ──
  var fadeObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        fadeObserver.unobserve(entry.target);
      }
    });
  }, { rootMargin: '0px 0px 50px 0px', threshold: 0.01 });

  function observeFadeElements() {
    document.querySelectorAll('.fade-in:not(.visible)').forEach(function (elem) {
      fadeObserver.observe(elem);
    });
  }
  window.observeFadeElements = observeFadeElements;
  observeFadeElements();

  // ── Skill Bar Animation ──
  var skillObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('animated');
        skillObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.2 });

  function observeSkillBars() {
    document.querySelectorAll('.skill-fill:not(.animated)').forEach(function (fill) {
      skillObserver.observe(fill);
    });
  }
  window.observeSkillBars = observeSkillBars;
  observeSkillBars();

  // ── Hero Parallax ──
  var heroPTicking = false;
  window.addEventListener('scroll', function () {
    var heroName = document.querySelector('.hero-name');
    var heroTopBar = document.querySelector('.hero-top-bar');
    if (!heroPTicking) {
      requestAnimationFrame(function () {
        var sy = window.scrollY;
        if (sy < window.innerHeight) {
          var p = sy * 0.12;
          if (heroName) heroName.style.transform = 'translateY(' + p + 'px)';
          if (heroTopBar) heroTopBar.style.opacity = Math.max(0, 1 - sy / (window.innerHeight * 0.5));
        }
        heroPTicking = false;
      });
      heroPTicking = true;
    }
  }, { passive: true });

})();
