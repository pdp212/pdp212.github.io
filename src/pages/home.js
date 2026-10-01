/**
 * src/pages/home.js — HOME Page View
 *
 * Implements Home Page content, responsive hero, and Featured Work:
 * - Full-bleed cinematic background image (background-home-1920x1080.webp) with subtle dark overlay
 * - Editorial Hero typography: Name, Role, Slogan, and properly anchored responsive "BASED IN" block
 * - Continuous infinite editorial ticker
 * - Showreel temporarily removed per spec (no empty box, clean layout pull-up)
 * - Single Featured Work preview stream directly sourced from WorkData (Cloudflare R2 manifest)
 * - Click anywhere on Featured Work smoothly navigates to #work
 */

(function () {
  'use strict';

  function getFeaturedVideo() {
    if (window.WorkData && typeof window.WorkData.getVideos === 'function') {
      var vids = window.WorkData.getVideos();
      if (vids && vids.length > 0) return vids[0];
    }
    if (window.WORK_VIDEOS && window.WORK_VIDEOS.length > 0) {
      return window.WORK_VIDEOS[0];
    }
    return {
      key: 'WED_PHUNGTUONG.mp4',
      tag: 'WED',
      name: 'PHUNGTUONG',
      url: 'https://pub-2cc56f19f7ba4dae92294d5baaa8cfc6.r2.dev/WED_PHUNGTUONG.wed.mp4'
    };
  }

  function renderHomePage() {
    var p = PORTFOLIO_DATA.profile;
    var container = el('page-home');
    if (!container) return;

    var featuredVideo = getFeaturedVideo();
    var displayTag = featuredVideo.tag || 'WED';
    var displayName = featuredVideo.name || 'PHUNGTUONG';
    var videoUrl = featuredVideo.url || 'https://pub-2cc56f19f7ba4dae92294d5baaa8cfc6.r2.dev/WED_PHUNGTUONG.wed.mp4';

    var tickerItems = [
      'CINEMATIC EDITING',
      'COLOR GRADING',
      'MOTION GRAPHICS',
      'VISUAL STORYTELLING',
      'BRAND FILMS',
      'DOCUMENTARY',
      'VFX COMPOSITING',
      'SOUND DESIGN',
      '4K WORKFLOW',
      'DAVINCI RESOLVE',
      'AFTER EFFECTS',
      'AI WORKFLOW',
      'AI PYTHON MANIM',
    ];
    var tickerText = tickerItems.concat(tickerItems);

    container.innerHTML = ''
      + '<section class="hero-section" aria-label="Hero">'
      + '<div class="hero-inner">'
      + '<div class="hero-top-bar fade-in" data-delay="0">'
      + '<p class="hero-eyebrow">PORTFOLIO ◆ 2026</p>'
      + '<div class="hero-availability">● AVAILABLE FOR PROJECTS</div>'
      + '</div>'
      + '<h1 class="hero-name fade-in" data-delay="100">'
      + '<span class="hero-name-line hero-line-solid">' + splitTextToSpans(p.nameLine1 || 'PHAN DUC') + '</span>'
      + '<span class="hero-name-line hero-line-stroke">' + splitTextToSpans(p.nameLine2 || 'PHAT') + '</span>'
      + '</h1>'
      + '<div class="hero-divider fade-in" data-delay="200" aria-hidden="true"></div>'
      + '<div class="hero-sub fade-in" data-delay="300">'
      + '<div class="hero-role-block">'
      + '<p class="hero-role">' + p.role + '</p>'
      + '<p class="hero-slogan" id="heroSlogan" data-slogan-text="' + (p.slogan || '') + '">' + (p.slogan || '') + '</p>'
      + '</div>'
      + '<div class="hero-location-block">'
      + '<span class="meta-label">BASED IN</span>'
      + '<span class="meta-value">' + p.location + '</span>'
      + '</div>'
      + '</div>'
      + '</div>'
      + '<div class="hero-vert-text" aria-hidden="true">' + (p.heroVertText || 'PRODUCTION SPECIALIST') + '</div>'
      + '</section>'
      + '<div class="ticker-strip fade-in" data-delay="400" aria-hidden="true">'
      + '<div class="ticker-inner">'
      + tickerText.map(function (item) { return '<span class="ticker-item">' + item + '</span>'; }).join('')
      + '</div>'
      + '</div>'
      + '<section class="section home-featured-section fade-in" id="homeFeaturedSection" data-delay="0" aria-label="Featured Work">'
      + '<div class="featured-header">'
      + '<div class="home-featured-heading-block">'
      + '<span class="section-number">01.</span>'
      + '<h2 class="featured-title">FEATURED WORK</h2>'
      + '</div>'
      + '<a href="#work" class="btn-outline view-all-btn" id="homeViewAllBtn">View All Projects → WORK</a>'
      + '</div>'
      + '<div class="home-featured-card" id="homeFeaturedCard" role="button" tabindex="0" aria-label="Featured screening: ' + displayTag + ' — ' + displayName + '. Click to enter WORK Cinema">'
      + '<div class="home-featured-media">'
      + '<video class="home-featured-video" id="homeFeaturedVideo" src="' + videoUrl + '" loop muted autoplay playsinline webkit-playsinline preload="metadata">'
      + '<source src="' + videoUrl + '" type="video/mp4">'
      + '</video>'
      + '<div class="cinema-film-grain" aria-hidden="true"></div>'
      + '<div class="cinema-screen-curtain" aria-hidden="true"></div>'
      + '<div class="home-featured-overlay" aria-hidden="true">'
      + '<span class="home-featured-overlay-badge">ENTER WORK CINEMA ↗</span>'
      + '</div>'
      + '</div>'
      + '<div class="cinema-screen-meta">'
      + '<span class="cinema-meta-tag" id="homeFeaturedTag">' + displayTag + '</span>'
      + '<span class="cinema-meta-name" id="homeFeaturedName">' + displayName + '</span>'
      + '</div>'
      + '</div>'
      + '<div class="home-cta-box">'
      + '<p class="home-cta-text">Explore the complete archive of cinematography, documentary, and motion design projects.</p>'
      + '<a href="#work" class="btn-accent" id="homeOpenArchiveBtn">Open Complete Portfolio Archive ↗</a>'
      + '</div>'
      + '</section>';

    // Attach click & keyboard navigation listener to Featured Work card
    var card = el('homeFeaturedCard');
    if (card) {
      function navigateToWork(e) {
        if (e) e.preventDefault();
        if (typeof window.navigateToPage === 'function') {
          window.navigateToPage('work');
        } else {
          window.location.hash = '#work';
        }
      }
      card.addEventListener('click', navigateToWork);
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          navigateToWork(e);
        }
      });
    }

    // Viewport IntersectionObserver to pause/play featured video
    if (typeof IntersectionObserver !== 'undefined') {
      var homeObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          var video = entry.target;
          if (!video) return;
          if (entry.isIntersecting) {
            var playPromise = video.play();
            if (playPromise !== undefined) playPromise.catch(function () { });
          } else {
            video.pause();
          }
        });
      }, { threshold: 0.15 });

      var fv = el('homeFeaturedVideo');
      if (fv) homeObserver.observe(fv);
    }

    if (typeof window.observeFadeElements === 'function') {
      window.observeFadeElements();
    }
  }

  // Dynamic sync with WorkData (production Cloudflare R2 manifest)
  if (window.WorkData && typeof window.WorkData.onUpdate === 'function') {
    window.WorkData.onUpdate(function (newVideos) {
      if (!newVideos || newVideos.length === 0) return;
      var first = newVideos[0];
      var videoEl = el('homeFeaturedVideo');
      var tagEl = el('homeFeaturedTag');
      var nameEl = el('homeFeaturedName');
      if (videoEl && first.url && videoEl.src !== first.url) {
        videoEl.src = first.url;
      }
      if (tagEl && first.tag) tagEl.textContent = first.tag;
      if (nameEl && first.name) nameEl.textContent = first.name;
    });
  }

  window.renderHomePage = renderHomePage;

})();
