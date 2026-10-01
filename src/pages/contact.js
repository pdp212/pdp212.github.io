/**
 * src/pages/contact.js — CONTACT Page View
 * Dedicated contact page with communication channels, social platforms, direct CTA, and footer
 */

function renderContactPage() {
  var c = PORTFOLIO_DATA.contact;
  var p = PORTFOLIO_DATA.profile;
  var container = el('page-contact');
  if (!container) return;

  var phoneDisplay = c.phone.replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3');
  var icons = c.icons || {};

  container.innerHTML = ''
    + '<section class="section contact-section" aria-label="Contact Information">'
    +   '<div class="section-header fade-in">'
    +     '<div class="section-header-line-left" aria-hidden="true"></div>'
    +     '<h2 class="section-title">Contact</h2>'
    +     '<div class="section-header-line" aria-hidden="true"></div>'
    +   '</div>'
    +   '<div class="contact-layout">'
    +     '<div class="contact-headline fade-in" data-delay="0">'
    +       '<h3 class="contact-big">Let\'s create<br/><em>something</em><br/>extraordinary.</h3>'
    +       '<div class="contact-availability-badge">● CURRENTLY OPEN FOR PRODUCTION &amp; FREELANCE</div>'
    +       '<p class="contact-subtext">Available for commercial cinematography, post-production supervision, documentary editing, and motion design worldwide.</p>'
    +       '<div class="contact-action-box">'
    +         '<a href="mailto:' + c.email + '?subject=Project%20Inquiry%20%E2%80%94%20PDP%20Portfolio" class="btn-accent contact-cta-btn">Send Project Inquiry ↗</a>'
    +       '</div>'
    +     '</div>'
    +     '<div class="contact-info fade-in" data-delay="200" id="contactInfo">'
    +       '<div class="contact-row">'
    +         '<span class="contact-label">'
    +           (icons.email ? '<img src="' + icons.email + '" class="contact-icon" alt="" style="width:22px;height:22px;vertical-align:middle;margin-right:12px;opacity:0.85;">' : '')
    +           'Email</span>'
    +         '<a href="mailto:' + c.email + '" class="contact-value" id="contactEmail">' + c.email + '</a>'
    +       '</div>'
    +       '<div class="contact-divider" aria-hidden="true"></div>'
    +       '<div class="contact-row">'
    +         '<span class="contact-label">Hotline</span>'
    +         '<a href="tel:+84' + c.phone.replace(/^0/, '') + '" class="contact-value" id="contactPhone">' + phoneDisplay + '</a>'
    +       '</div>'
    +       '<div class="contact-divider" aria-hidden="true"></div>'
    +       '<div class="contact-row">'
    +         '<span class="contact-label">'
    +           (icons.location ? '<img src="' + icons.location + '" class="contact-icon" alt="" style="width:22px;height:22px;vertical-align:middle;margin-right:12px;opacity:0.85;">' : '')
    +           'Location</span>'
    +         '<span class="contact-value">' + c.location + '</span>'
    +       '</div>'
    +       '<div class="contact-divider" aria-hidden="true"></div>'
    +       '<div class="contact-links">'
    +         (c.socials.linkedin ? '<a href="' + c.socials.linkedin + '" target="_blank" rel="noopener noreferrer" class="contact-platform-link" id="linkedinLink">' + (icons.linkedin ? '<img src="' + icons.linkedin + '" class="social-icon" alt="" style="width:30px;height:30px;vertical-align:middle;margin-right:8px;">' : '') + 'LinkedIn ↗</a>' : '')
    +         (c.socials.behance  ? '<a href="' + c.socials.behance  + '" target="_blank" rel="noopener noreferrer" class="contact-platform-link" id="behanceLink">'  + (icons.behance  ? '<img src="' + icons.behance  + '" class="social-icon" alt="" style="width:30px;height:30px;vertical-align:middle;margin-right:8px;">' : '') + 'Behance ↗</a>'  : '')
    +       '</div>'
    +     '</div>'
    +   '</div>'
    +   '<footer class="site-footer" role="contentinfo">'
    +     '<div class="footer-inner">'
    +       '<p class="footer-name">' + p.fullName + '</p>'
    +       '<p class="footer-copy">© ' + (c.copyrightYear || 2026) + ' · All rights reserved · ' + p.location + '</p>'
    +       '<p class="footer-slogan">' + p.slogan + '</p>'
    +     '</div>'
    +   '</footer>'
    + '</section>';
}
