/**
 * src/render/hero.js — Hero, Meta, Showreel, Ticker
 */
function renderMeta() {
  var p = PORTFOLIO_DATA.profile;
  var title = p.fullName + ' — ' + p.role;
  document.title = title;
  var metaDesc = 'Portfolio của ' + p.fullName + ' — ' + p.role + ' tại ' + p.location + '.';
  var descEl = el('pageDesc');
  if (descEl) descEl.setAttribute('content', metaDesc);
  var ogTitleEl = el('ogTitle');
  if (ogTitleEl) ogTitleEl.setAttribute('content', title);
}

function renderHero() {
  var p = PORTFOLIO_DATA.profile;

  if (el('heroLocation'))  el('heroLocation').textContent  = p.location;
  if (el('heroRole'))      el('heroRole').textContent      = p.role;
  if (el('heroWorkplace')) el('heroWorkplace').textContent = p.workplace;
  if (el('heroVertText'))  el('heroVertText').textContent  = p.heroVertText;

  if (el('heroNameLine1')) el('heroNameLine1').innerHTML = splitTextToSpans(p.nameLine1);
  if (el('heroNameLine2')) el('heroNameLine2').innerHTML = splitTextToSpans(p.nameLine2);

  var sloganEl = el('heroSlogan');
  if (sloganEl) {
    sloganEl.dataset.sloganText = p.slogan;
    // Fallback text for accessibility / no-JS
    sloganEl.textContent = p.slogan;
  }
}

function renderShowreel() {
  var sr = PORTFOLIO_DATA.showreel;
  var frame = el('showreelFrame');
  if (!frame) return;

  if (sr.embedUrl) {
    var iframe = document.createElement('iframe');
    iframe.src = sr.embedUrl;
    iframe.frameBorder = '0';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    iframe.allowFullscreen = true;
    iframe.loading = 'lazy';
    iframe.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:none;';
    frame.style.position = 'relative';
    frame.appendChild(iframe);
  } else {
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

function renderTicker() {
  var ticker = el('tickerStrip');
  if (!ticker) return;

  var p = PORTFOLIO_DATA.profile;
  var items = [
    p.role,
    p.workplace,
    p.location,
    'Camera Operation',
    'Color Grading',
    'Motion Design',
    'AI Workflow',
    'Python · Manim',
    'DaVinci Resolve',
    'After Effects',
  ];

  var all = items.concat(items);
  var html = '<div class="ticker-inner" aria-hidden="true">';
  all.forEach(function (item) {
    html += '<span class="ticker-item">' + item + '</span>';
  });
  html += '</div>';
  ticker.innerHTML = html;
}
