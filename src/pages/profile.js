/**
 * src/pages/profile.js — PROFILE Page View
 * Comprehensive profile combining creative biography, education, competencies, and AI generative pipeline
 */

function renderProfilePage() {
  var a = PORTFOLIO_DATA.about;
  var container = el('page-profile');
  if (!container) return;

  var bioHtml = a.bio.map(function (para) {
    return '<p>' + parseMarkdown(para) + '</p>';
  }).join('');

  var skillHtml = a.skills.map(function (skill, i) {
    return '<span class="skill-item" role="listitem">' + skill + '</span>'
      + (i < a.skills.length - 1 ? '<span class="skill-sep" aria-hidden="true">|</span>' : '');
  }).join('');

  var barsHtml = a.skillBars.map(function (bar) {
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

  var eduHtml = a.education.map(function (edu) {
    var iconHtml = edu.icon
      ? '<img src="' + edu.icon + '" alt="" class="edu-icon-img" loading="lazy" style="width:70px;height:70px;object-fit:contain;opacity:0.9;margin-right:4px;">'
      : '<span class="edu-icon" aria-hidden="true">◈</span>';
    var periodStr = edu.period ? ' · ' + edu.period : '';
    return ''
      + '<div class="edu-card">'
      +   iconHtml
      +   '<div>'
      +     '<p class="edu-degree">' + edu.degree + '</p>'
      +     '<p class="edu-school">' + edu.school + periodStr + '</p>'
      +   '</div>'
      + '</div>';
  }).join('');

  container.innerHTML = ''
    + '<section class="section about-section" aria-label="Profile and Background">'
    +   '<div class="section-header fade-in">'
    +     '<div class="section-header-line-left" aria-hidden="true"></div>'
    +     '<h2 class="section-title">Profile</h2>'
    +     '<div class="section-header-line" aria-hidden="true"></div>'
    +   '</div>'
    +   '<div class="about-layout">'
    +     '<div class="about-text fade-in" data-delay="0">'
    +       '<p class="about-eyebrow">' + a.eyebrow + '</p>'
    +       '<h3 class="about-headline">' + a.headlineLine1 + '<br/><em>' + a.headlineLine2 + '</em></h3>'
    +       '<div class="about-body">' + bioHtml + '</div>'
    +     '</div>'
    +     '<div class="about-skills fade-in" data-delay="200">'
    +       '<p class="skills-eyebrow">Core Competencies</p>'
    +       '<div class="skills-text" role="list">' + skillHtml + '</div>'
    +       '<div class="skills-grid" aria-hidden="true">' + barsHtml + '</div>'
    +       '<div class="education-cards">' + eduHtml + '</div>'
    +     '</div>'
    +   '</div>'
    +   '<div class="profile-ai-divider" aria-hidden="true"></div>'
    +   '<div class="ai-layout">'
    +     '<div class="ai-intro fade-in" data-delay="0">'
    +       '<p class="ai-eyebrow">The Next Layer of Production</p>'
    +       '<h3 class="ai-headline">Where Human Craft<br/><em>Meets Machine Intelligence</em></h3>'
    +       '<p class="ai-body">'
    +         'I integrate Generative AI tools and Workflow Automation directly into the post-production pipeline — not to replace creativity, but to amplify it.'
    +       '</p>'
    +     '</div>'
    +     '<div class="ai-pillars">'
    +       '<div class="ai-pillar fade-in" data-delay="0">'
    +         '<div class="ai-pillar-number" aria-hidden="true">I</div>'
    +         '<div class="ai-pillar-content">'
    +           '<h4 class="ai-pillar-title">AI Workflow Automation</h4>'
    +           '<p class="ai-pillar-desc">Automate repetitive post-production tasks such as auto-transcription, smart cutting, scene detection, and batch exporting — reducing post-production time by up to 60% while maintaining cinematic quality.</p>'
    +         '</div>'
    +       '</div>'
    +       '<div class="ai-pillar fade-in" data-delay="100">'
    +         '<div class="ai-pillar-number" aria-hidden="true">II</div>'
    +         '<div class="ai-pillar-content">'
    +           '<h4 class="ai-pillar-title">Generative AI Tools</h4>'
    +           '<p class="ai-pillar-desc">Leverage Generative AI models such as Midjourney, Runway, and ElevenLabs for concept art, B-roll generation, and voice synthesis — expanding production capabilities without increasing the budget.</p>'
    +         '</div>'
    +       '</div>'
    +       '<div class="ai-pillar fade-in" data-delay="200">'
    +         '<div class="ai-pillar-number" aria-hidden="true">III</div>'
    +         '<div class="ai-pillar-content">'
    +           '<h4 class="ai-pillar-title">Vibe Coding — Python &amp; Manim</h4>'
    +           '<p class="ai-pillar-desc">Using “Vibe Coding” with the Python Manim library to create mathematically precise motion: data visualization, kinetic typography, and technical motion graphics.</p>'
    +         '</div>'
    +       '</div>'
    +     '</div>'
    +     '<div class="ai-code-block fade-in" data-delay="300" role="img" aria-label="Python Manim code example">'
    +       '<div class="code-header">'
    +         '<span class="code-dot red"    aria-hidden="true"></span>'
    +         '<span class="code-dot yellow" aria-hidden="true"></span>'
    +         '<span class="code-dot green"  aria-hidden="true"></span>'
    +         '<span class="code-filename">enzyme_action.py — Manim Scene</span>'
    +       '</div>'
    +       '<pre class="code-body"><code><span class="code-kw">from</span> manim <span class="code-kw">import</span> *'
    + '\n\n<span class="code-kw">class</span> <span class="code-fn">CinematicTitle</span>(Scene):'
    + '\n    <span class="code-kw">def</span> <span class="code-fn">construct</span>(self):'
    + '\n        title = Text('
    + '\n            <span class="code-str">"PHAN DUC PHAT"</span>,'
    + '\n            font=<span class="code-str">"Roboto"</span>,'
    + '\n            color=<span class="code-str">"#C5A880"</span>'
    + '\n        )'
    + '\n        line = Line(LEFT*<span class="code-num">3</span>, RIGHT*<span class="code-num">3</span>)'
    + '\n        line.set_color(<span class="code-str">"#8E8E93"</span>)'
    + '\n\n        self.play(Write(title), run_time=<span class="code-num">2</span>)'
    + '\n        self.play(Create(line))'
    + '\n        self.wait(<span class="code-num">1</span>)</code></pre>'
    +     '</div>'
    +     '<div class="ai-quote fade-in" data-delay="400">'
    +       '<blockquote>'
    +         '<p>"Code is just another brush. Logic is just another lens."</p>'
    +         '<cite>— P.Đ.Phát</cite>'
    +       '</blockquote>'
    +     '</div>'
    +   '</div>'
    + '</section>';

  // Enhance code copy button
  if (typeof renderAI === 'function') renderAI();
}
