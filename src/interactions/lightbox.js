/**
 * src/interactions/lightbox.js — Lightbox: Editorial Project Detail View
 * Full metadata: Visual, Category, Title, Year, Client, Role, Tools, Desc, Challenge, Process, Result, Tags, Links
 * Focus trap, ESC close, scroll lock, video cleanup
 */
(function () {
  'use strict';

  var lightbox         = el('lightbox');
  var lightboxBackdrop = el('lightboxBackdrop');
  var lightboxClose    = el('lightboxClose');
  var lightboxVisual   = el('lightboxVisual');
  var lightboxInfo     = document.querySelector('.lightbox-info');

  var GRADIENT_MAP = {
    'pv-gradient-1': 'linear-gradient(135deg, #1e1508 0%, #3a2910 35%, #110d04 70%, #080808 100%)',
    'pv-gradient-2': 'linear-gradient(135deg, #08101e 0%, #0d1f3a 35%, #04080d 70%, #080808 100%)',
    'pv-gradient-3': 'linear-gradient(135deg, #10081e 0%, #1e0d3a 35%, #08040d 70%, #080808 100%)',
    'pv-gradient-4': 'linear-gradient(135deg, #081408 0%, #0d2010 35%, #040804 70%, #080808 100%)',
    'pv-gradient-5': 'linear-gradient(135deg, #1e0808 0%, #3a1010 35%, #0d0404 70%, #080808 100%)',
  };

  var triggerElement = null;

  function renderProjectDetails(proj) {
    if (!lightboxInfo) return;

    var metaRows = '';
    if (proj.client) {
      metaRows += '<div class="lightbox-meta-item"><span class="meta-label">Client</span><span class="meta-value">' + proj.client + '</span></div>';
    }
    if (proj.year) {
      metaRows += '<div class="lightbox-meta-item"><span class="meta-label">Year</span><span class="meta-value">' + proj.year + '</span></div>';
    }
    if (proj.role) {
      metaRows += '<div class="lightbox-meta-item"><span class="meta-label">Role</span><span class="meta-value">' + proj.role + '</span></div>';
    }
    if (proj.tools) {
      metaRows += '<div class="lightbox-meta-item"><span class="meta-label">Tools</span><span class="meta-value">' + proj.tools + '</span></div>';
    }

    var storyBlocks = '';
    if (proj.challenge) {
      storyBlocks += '<div class="lightbox-story-block"><h4 class="story-label">Challenge</h4><p class="story-text">' + proj.challenge + '</p></div>';
    }
    if (proj.process) {
      storyBlocks += '<div class="lightbox-story-block"><h4 class="story-label">Process & Approach</h4><p class="story-text">' + proj.process + '</p></div>';
    }
    if (proj.result) {
      storyBlocks += '<div class="lightbox-story-block"><h4 class="story-label">Result</h4><p class="story-text">' + proj.result + '</p></div>';
    }

    var linkHtml = '';
    if (proj.linkBehance) {
      linkHtml = '<a href="' + proj.linkBehance + '" class="btn-accent" id="lightboxLink" target="_blank" rel="noopener noreferrer">View Full Project on Behance ↗</a>';
    }

    lightboxInfo.innerHTML = ''
      + '<p class="lightbox-category">' + (proj.category || '') + '</p>'
      + '<h3 class="lightbox-title">'   + (proj.title || '')    + '</h3>'
      + (metaRows ? '<div class="lightbox-meta-grid">' + metaRows + '</div>' : '')
      + '<p class="lightbox-desc">'     + (proj.desc || '')     + '</p>'
      + (storyBlocks ? '<div class="lightbox-story-grid">' + storyBlocks + '</div>' : '')
      + (proj.tags ? '<p class="lightbox-tags">' + proj.tags + '</p>' : '')
      + linkHtml;
  }

  function openLightbox(card) {
    var projId = card.dataset.id;
    var proj = PORTFOLIO_DATA.projects.find(function (p) { return p.id === projId; });
    if (!proj) return;

    triggerElement = card;
    renderProjectDetails(proj);

    if (proj.embedUrl) {
      lightboxVisual.innerHTML = ''
        + '<iframe src="' + proj.embedUrl + '" frameborder="0"'
        + ' allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"'
        + ' allowfullscreen style="width:100%;height:100%;border:none;"></iframe>';
    } else if (proj.thumbnail) {
      lightboxVisual.style.background = '#0a0a0a';
      lightboxVisual.innerHTML = '<img src="' + proj.thumbnail + '" alt="' + proj.title + '" style="width:100%;height:100%;object-fit:cover;">';
    } else {
      var bg = GRADIENT_MAP[proj.gradientClass] || '#1a1a1a';
      lightboxVisual.style.background = bg;
      lightboxVisual.innerHTML = ''
        + '<div class="lightbox-visual-placeholder">'
        +   '<svg viewBox="0 0 60 60" fill="none" style="width:64px;height:64px;opacity:0.4;">'
        +     '<circle cx="30" cy="30" r="29" stroke="#C5A880" stroke-width="1"/>'
        +     '<polygon points="24,18 44,30 24,42" fill="#C5A880"/>'
        +   '</svg>'
        +   '<span class="film-indicator">CINEMATIC 4K · 24FPS</span>'
        + '</div>';
      lightboxVisual.style.display        = 'flex';
      lightboxVisual.style.alignItems     = 'center';
      lightboxVisual.style.justifyContent = 'center';
    }

    lightbox.classList.add('open');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    if (lightboxClose) lightboxClose.focus();
  }

  function closeLightbox() {
    if (!lightbox) return;
    lightbox.classList.remove('open');
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';

    // Stop video cleanly
    var iframe = lightboxVisual.querySelector('iframe');
    if (iframe) {
      iframe.src = 'about:blank';
      lightboxVisual.innerHTML = '';
    }

    // Restore focus
    if (triggerElement) {
      triggerElement.focus();
      triggerElement = null;
    }
  }

  // ── Global Event Delegation for Project Cards (Home & Work) ──
  document.addEventListener('click', function (e) {
    var card = e.target.closest('.project-card');
    if (card) openLightbox(card);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      var card = e.target.closest('.project-card');
      if (card && !e.target.closest('button:not(.project-cta), a')) {
        e.preventDefault();
        openLightbox(card);
      }
    }
  });

  if (lightboxClose)    lightboxClose.addEventListener('click', closeLightbox);
  if (lightboxBackdrop) lightboxBackdrop.addEventListener('click', closeLightbox);

  // ESC to close
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && lightbox && lightbox.classList.contains('open')) {
      closeLightbox();
    }
  });

  // Focus trap
  if (lightbox) {
    lightbox.addEventListener('keydown', function (e) {
      trapFocus(lightbox, e);
    });
  }

  // ── Showreel Placeholder Click ──
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

})();
