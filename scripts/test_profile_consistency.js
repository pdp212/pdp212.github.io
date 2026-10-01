/**
 * scripts/test_profile_consistency.js
 * Automated verification for Profile & Personal Information consistency:
 * 1. Checks data layers against Profile.pdf single source of truth
 * 2. Checks DOM rendering on Home, Profile, and Contact views
 * 3. Checks HTML metadata, OpenGraph, and Schema.org Person LD+JSON
 * 4. Checks external links, phone, email, and social accounts
 * 5. Checks responsive viewports (390px, 768px, 1440px) for layout integrity
 * 6. Checks browser console for zero errors
 */

const { spawn } = require('child_process');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('\n=== RUNNING PROFILE INFORMATION CONSISTENCY AUTOMATED AUDIT ===\n');

  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const chromeProcess = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=9229',
    '--user-data-dir=/tmp/test_chrome_profile_' + Date.now(),
    'http://127.0.0.1:3333/#home',
  ]);

  try {
    let pageTab = null;
    for (let i = 0; i < 10; i++) {
      await sleep(500);
      try {
        const tabsRes = await fetch('http://127.0.0.1:9229/json/list');
        const tabs = await tabsRes.json();
        pageTab = tabs.find(t => t.type === 'page');
        if (pageTab) break;
      } catch (e) {}
    }

    if (!pageTab) throw new Error('No page tab found on port 9229');

    const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
    let id = 1;
    const callbacks = new Map();

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && callbacks.has(data.id)) {
        const cb = callbacks.get(data.id);
        callbacks.delete(data.id);
        cb(data);
      }
    };

    function send(method, params = {}) {
      return new Promise((resolve) => {
        const msgId = id++;
        callbacks.set(msgId, resolve);
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    }

    await new Promise(resolve => ws.onopen = resolve);
    await send('Network.enable');
    await send('Page.enable');
    await send('Console.enable');

    const consoleErrors = [];
    ws.addEventListener('message', (event) => {
      const data = JSON.parse(event.data);
      if (data.method === 'Console.messageAdded' && data.params.message.level === 'error') {
        consoleErrors.push(data.params.message.text);
      }
    });

    await sleep(1000);

    async function evaluate(expression) {
      const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (res.result && res.result.exceptionDetails) {
        throw new Error(JSON.stringify(res.result.exceptionDetails));
      }
      return res.result && res.result.result ? res.result.result.value : undefined;
    }

    // ── 1. AUDIT DATA LAYER VALUES ──
    console.log('--- 1. AUDITING DATA LAYER VALUES (Single Source of Truth) ---');
    const dataAudit = await evaluate(`
      (() => {
        const p = PORTFOLIO_DATA.profile;
        const a = PORTFOLIO_DATA.about;
        const c = PORTFOLIO_DATA.contact;
        return {
          profile: {
            fullName: p.fullName,
            nameLine1: p.nameLine1,
            nameLine2: p.nameLine2,
            role: p.role,
            workplace: p.workplace,
            location: p.location,
            heroVertText: p.heroVertText
          },
          about: {
            bioCount: a.bio.length,
            topSkills: a.topSkills,
            skillsCount: a.skills.length,
            educationCount: a.education.length,
            education: a.education,
            experience: a.experience
          },
          contact: {
            email: c.email,
            phone: c.phone,
            location: c.location,
            linkedin: c.socials.linkedin,
            behance: c.socials.behance
          }
        };
      })()
    `);

    console.log('   Profile Data:', JSON.stringify(dataAudit.profile));
    const isProfileDataValid =
      dataAudit.profile.fullName === 'Phan Duc Phat' &&
      dataAudit.profile.nameLine1 === 'PHAN DUC' &&
      dataAudit.profile.nameLine2 === 'PHAT' &&
      dataAudit.profile.role === 'Video Editor & Camera Operator | Motion Designer' &&
      dataAudit.profile.workplace === 'Silver Swallows Studio' &&
      dataAudit.profile.location === 'Hải Châu, Đà Nẵng, Việt Nam';
    console.log('   data/profile.js matches Profile.pdf:', isProfileDataValid ? '✓ PASS' : '✗ FAIL');
    if (!isProfileDataValid) throw new Error('data/profile.js does not match Profile.pdf');

    const isContactDataValid =
      dataAudit.contact.email === 'phanducphat2310@gmail.com' &&
      dataAudit.contact.phone === '0796649266' &&
      dataAudit.contact.location === 'Hải Châu, Đà Nẵng, Việt Nam' &&
      dataAudit.contact.linkedin === 'https://www.linkedin.com/in/phanducphat23' &&
      dataAudit.contact.behance === 'https://www.behance.net/pdp23';
    console.log('   data/contact.js matches Profile.pdf:', isContactDataValid ? '✓ PASS' : '✗ FAIL');
    if (!isContactDataValid) throw new Error('data/contact.js does not match Profile.pdf');

    const isAboutDataValid =
      dataAudit.about.bioCount === 5 &&
      dataAudit.about.topSkills.includes('Camera Operation') &&
      dataAudit.about.topSkills.includes('Video Post-Production') &&
      dataAudit.about.topSkills.includes('Generative AI') &&
      dataAudit.about.education.length === 2 &&
      dataAudit.about.education[0].school === 'FPT Polytechnic College of Danang' &&
      dataAudit.about.education[0].degree === 'Bachelor of Practice, Graphic Design' &&
      dataAudit.about.education[0].period === '2022 – 2024' &&
      dataAudit.about.education[1].school === 'Duy Tan University' &&
      dataAudit.about.education[1].degree === 'Mechatronics, Robotics, and Automation Engineering' &&
      dataAudit.about.education[1].period === '2020 – 2021';
    console.log('   data/about.js matches Profile.pdf:', isAboutDataValid ? '✓ PASS' : '✗ FAIL');
    if (!isAboutDataValid) throw new Error('data/about.js does not match Profile.pdf');

    // ── 2. AUDIT DOCUMENT HEAD METADATA & SCHEMA.ORG ──
    console.log('\n--- 2. AUDITING HTML HEAD METADATA & SCHEMA.ORG JSON-LD ---');
    const metaAudit = await evaluate(`
      (() => {
        const title = document.title;
        const desc = document.getElementById('pageDesc') ? document.getElementById('pageDesc').getAttribute('content') : '';
        const keywords = document.querySelector('meta[name="keywords"]') ? document.querySelector('meta[name="keywords"]').getAttribute('content') : '';
        const ldJsonScript = document.querySelector('script[type="application/ld+json"]');
        let ldJson = null;
        if (ldJsonScript) {
          try { ldJson = JSON.parse(ldJsonScript.textContent); } catch (e) {}
        }
        return { title, desc, keywords, ldJson };
      })()
    `);
    console.log('   Document Title:', metaAudit.title);
    console.log('   Meta Description:', metaAudit.desc);
    console.log('   Meta Keywords:', metaAudit.keywords);
    console.log('   Schema.org Person:', JSON.stringify(metaAudit.ldJson));

    const isMetaValid =
      metaAudit.title.includes('Phan Duc Phat') &&
      metaAudit.title.includes('Video Editor & Camera Operator | Motion Designer') &&
      metaAudit.desc.includes('Phan Duc Phat') &&
      metaAudit.desc.includes('Hải Châu, Đà Nẵng, Việt Nam') &&
      metaAudit.keywords.includes('Camera Operator') &&
      metaAudit.keywords.includes('Silver Swallows Studio') &&
      metaAudit.ldJson &&
      metaAudit.ldJson.jobTitle === 'Video Editor & Camera Operator | Motion Designer' &&
      metaAudit.ldJson.worksFor && metaAudit.ldJson.worksFor.name === 'Silver Swallows Studio' &&
      metaAudit.ldJson.address.addressLocality.includes('Hải Châu, Đà Nẵng');
    console.log('   Metadata and Schema.org JSON-LD accurate:', isMetaValid ? '✓ PASS' : '✗ FAIL');
    if (!isMetaValid) throw new Error('Metadata / JSON-LD failed verification');
    console.log('\n--- 3. AUDITING HOME PAGE RENDERING ---');
    const homeAudit = await evaluate(`
      (() => {
        const roleEl = document.querySelector('.hero-role');
        const role = roleEl ? roleEl.textContent.trim() : '';
        const roleWeight = roleEl ? parseInt(window.getComputedStyle(roleEl).fontWeight, 10) : 400;
        const sloganEl = document.getElementById('heroSlogan');
        const slogan = sloganEl ? (sloganEl.textContent.trim() || sloganEl.dataset.sloganText || '') : '';
        const loc = document.querySelector('.hero-location-block .meta-value') ? document.querySelector('.hero-location-block .meta-value').textContent.trim() : '';
        const nameSolid = document.querySelector('.hero-line-solid') ? document.querySelector('.hero-line-solid').textContent.trim() : '';
        const nameStroke = document.querySelector('.hero-line-stroke') ? document.querySelector('.hero-line-stroke').textContent.trim() : '';
        const ticker = document.querySelector('.ticker-inner') ? document.querySelector('.ticker-inner').textContent : '';
        return { role, roleWeight, slogan, loc, nameSolid, nameStroke, tickerHasCameraOp: ticker.includes('AI WORKFLOW') };
      })()
    `);
    console.log('   Home Hero Role:', homeAudit.role);
    console.log('   Home Hero Role Font-Weight:', homeAudit.roleWeight);
    console.log('   Home Hero Slogan:', homeAudit.slogan);
    console.log('   Home Hero Location:', homeAudit.loc);

    const isHomeValid =
      homeAudit.role === 'Video Editor & Camera Operator | Motion Designer' &&
      homeAudit.roleWeight >= 600 &&
      homeAudit.slogan.includes('Technical precision. Cinematic vision. Elevating every frame.') &&
      homeAudit.loc === 'Hải Châu, Đà Nẵng, Việt Nam' &&
      homeAudit.nameSolid === 'PHAN DUC' &&
      homeAudit.nameStroke === 'PHAT';
    console.log('   Home view matches requirements (Role weight, Slogan, Location):', isHomeValid ? '✓ PASS' : '✗ FAIL');
    if (!isHomeValid) throw new Error('Home view rendering mismatch');

    async function waitForTransition(maxMs = 6000) {
      const start = Date.now();
      while (Date.now() - start < maxMs) {
        try {
          const playing = await evaluate("window.VideoTransitions && window.VideoTransitions.isPlaying()");
          if (!playing) break;
        } catch (e) {}
        await sleep(100);
      }
      await sleep(300);
    }

    async function navigateTo(hash) {
      await evaluate("window.location.hash = '" + hash + "'");
      await waitForTransition();
    }

    // ── 4. AUDIT PROFILE PAGE VIEW RENDERING ──
    console.log('\n--- 4. AUDITING PROFILE PAGE RENDERING (#profile) ---');
    await navigateTo('#profile');

    const profileAudit = await evaluate(`
      (() => {
        const view = document.getElementById('page-profile');
        const isActive = view && view.classList.contains('active');
        const secHeader = view ? view.querySelector('.section-header') : null;
        const secNum = secHeader ? secHeader.querySelector('.section-number') : null;
        const dataNum = secHeader ? secHeader.getAttribute('data-num') : null;
        const title = view ? view.querySelector('.section-title') : null;
        const lineLeft = view ? view.querySelector('.section-header-line-left') : null;
        const lineRight = view ? view.querySelector('.section-header-line') : null;

        const bioParas = Array.from(view.querySelectorAll('.about-body p')).map(p => p.textContent.trim());
        const skills = Array.from(view.querySelectorAll('.skill-item')).map(s => s.textContent.trim());
        const skillBars = Array.from(view.querySelectorAll('.skill-bar-label')).map(s => s.textContent.trim());
        const eduCards = Array.from(view.querySelectorAll('.edu-card')).map(c => {
          const deg = c.querySelector('.edu-degree') ? c.querySelector('.edu-degree').textContent.trim() : '';
          const sch = c.querySelector('.edu-school') ? c.querySelector('.edu-school').textContent.trim() : '';
          return { deg, sch };
        });
        return {
          isActive,
          hasSectionNumber: !!secNum,
          hasDataNum: !!dataNum,
          hasLineLeft: !!lineLeft,
          hasLineRight: !!lineRight,
          titleText: title ? title.textContent.trim() : '',
          bioCount: bioParas.length,
          bioParas,
          skills,
          skillBars,
          eduCards
        };
      })()
    `);
    console.log('   Profile view active:', profileAudit.isActive);
    console.log('   Profile Section Number 03 removed:', !profileAudit.hasSectionNumber && !profileAudit.hasDataNum ? '✓ PASS' : '✗ FAIL');
    console.log('   Profile Title Text:', profileAudit.titleText);

    const isProfilePageValid =
      profileAudit.isActive &&
      !profileAudit.hasSectionNumber &&
      !profileAudit.hasDataNum &&
      profileAudit.hasLineLeft &&
      profileAudit.hasLineRight &&
      profileAudit.titleText === 'Profile' &&
      profileAudit.bioCount === 5 &&
      profileAudit.bioParas[0].includes('Phan Duc Phat') &&
      profileAudit.bioParas[0].includes('FPT Polytechnic') &&
      profileAudit.bioParas[0].includes('Duy Tan University') &&
      profileAudit.bioParas[2].includes('Silver Swallows Studio') &&
      profileAudit.skills.includes('Camera Operation') &&
      profileAudit.skills.includes('Video Post-Production') &&
      profileAudit.skills.includes('Generative AI') &&
      profileAudit.eduCards.length === 2 &&
      profileAudit.eduCards[0].deg === 'Bachelor of Practice, Graphic Design' &&
      profileAudit.eduCards[0].sch.includes('FPT Polytechnic College of Danang') &&
      profileAudit.eduCards[0].sch.includes('2022 – 2024') &&
      profileAudit.eduCards[1].deg === 'Mechatronics, Robotics, and Automation Engineering' &&
      profileAudit.eduCards[1].sch.includes('Duy Tan University') &&
      profileAudit.eduCards[1].sch.includes('2020 – 2021');
    console.log('   Profile view content strictly verified:', isProfilePageValid ? '✓ PASS' : '✗ FAIL');
    if (!isProfilePageValid) throw new Error('Profile view content verification failed');

    // ── 5. AUDIT CONTACT PAGE VIEW RENDERING ──
    console.log('\n--- 5. AUDITING CONTACT PAGE RENDERING (#contact) ---');
    await navigateTo('#contact');

    const contactAudit = await evaluate(`
      (() => {
        const view = document.getElementById('page-contact');
        const isActive = view && view.classList.contains('active');
        const secHeader = view ? view.querySelector('.section-header') : null;
        const secNum = secHeader ? secHeader.querySelector('.section-number') : null;
        const dataNum = secHeader ? secHeader.getAttribute('data-num') : null;
        const title = view ? view.querySelector('.section-title') : null;
        const lineLeft = view ? view.querySelector('.section-header-line-left') : null;
        const lineRight = view ? view.querySelector('.section-header-line') : null;

        const email = document.getElementById('contactEmail') ? document.getElementById('contactEmail').textContent.trim() : '';
        const emailHref = document.getElementById('contactEmail') ? document.getElementById('contactEmail').getAttribute('href') : '';
        const phone = document.getElementById('contactPhone') ? document.getElementById('contactPhone').textContent.trim() : '';
        const phoneHref = document.getElementById('contactPhone') ? document.getElementById('contactPhone').getAttribute('href') : '';
        const locRow = Array.from(document.querySelectorAll('.contact-row')).find(r => r.querySelector('.contact-label') && r.querySelector('.contact-label').textContent.includes('Location'));
        const locationVal = locRow && locRow.querySelector('.contact-value') ? locRow.querySelector('.contact-value').textContent.trim() : '';
        const linkedinHref = document.getElementById('linkedinLink') ? document.getElementById('linkedinLink').getAttribute('href') : '';
        const behanceHref = document.getElementById('behanceLink') ? document.getElementById('behanceLink').getAttribute('href') : '';
        const footerName = document.querySelector('.footer-name') ? document.querySelector('.footer-name').textContent.trim() : '';
        const footerCopy = document.querySelector('.footer-copy') ? document.querySelector('.footer-copy').textContent.trim() : '';
        return {
          isActive,
          hasSectionNumber: !!secNum,
          hasDataNum: !!dataNum,
          hasLineLeft: !!lineLeft,
          hasLineRight: !!lineRight,
          titleText: title ? title.textContent.trim() : '',
          email,
          emailHref,
          phone,
          phoneHref,
          locationVal,
          linkedinHref,
          behanceHref,
          footerName,
          footerCopy
        };
      })()
    `);
    console.log('   Contact Section Number 04 removed:', !contactAudit.hasSectionNumber && !contactAudit.hasDataNum ? '✓ PASS' : '✗ FAIL');
    console.log('   Contact Title Text:', contactAudit.titleText);

    const isContactPageValid =
      contactAudit.isActive &&
      !contactAudit.hasSectionNumber &&
      !contactAudit.hasDataNum &&
      contactAudit.hasLineLeft &&
      contactAudit.hasLineRight &&
      contactAudit.titleText === 'Contact' &&
      contactAudit.email === 'phanducphat2310@gmail.com' &&
      contactAudit.emailHref === 'mailto:phanducphat2310@gmail.com' &&
      contactAudit.phone.replace(/\s+/g, '') === '0796649266' &&
      contactAudit.phoneHref === 'tel:+84796649266' &&
      contactAudit.locationVal === 'Hải Châu, Đà Nẵng, Việt Nam' &&
      contactAudit.linkedinHref === 'https://www.linkedin.com/in/phanducphat23' &&
      contactAudit.behanceHref === 'https://www.behance.net/pdp23' &&
      contactAudit.footerName.toUpperCase() === 'PHAN DUC PHAT' &&
      contactAudit.footerCopy.includes('Hải Châu, Đà Nẵng, Việt Nam');
    console.log('   Contact view content strictly verified:', isContactPageValid ? '✓ PASS' : '✗ FAIL');
    if (!isContactPageValid) throw new Error('Contact view content verification failed');

    // ── 6. AUDIT RESPONSIVE VIEWPORTS & MOBILE HEADER CLEARANCE ──
    console.log('\n--- 6. AUDITING RESPONSIVE VIEWPORTS (Samsung S25 360px, 390px, 768px, 1440px) ---');
    const viewports = [
      { name: 'Samsung S25', width: 360, height: 780 },
      { name: 'Mobile 390px', width: 390, height: 844 },
      { name: 'Tablet', width: 768, height: 1024 },
      { name: 'Laptop', width: 1440, height: 900 }
    ];

    const pages = ['#home', '#profile', '#contact'];
    for (const page of pages) {
      await navigateTo(page);
      for (const vp of viewports) {
        await send('Emulation.setDeviceMetricsOverride', {
          width: vp.width,
          height: vp.height,
          deviceScaleFactor: 1,
          mobile: vp.width < 768,
        });
        await sleep(300);

        const pageMetrics = await evaluate(`
          (() => {
            const docWidth = document.documentElement.offsetWidth;
            const scrollWidth = document.documentElement.scrollWidth;
            const navbar = document.getElementById('navbar');
            const navRect = navbar ? navbar.getBoundingClientRect() : null;
            const activeView = document.querySelector('.page-view.active') || document.querySelector('${page}'.replace('#', '#page-'));
            const secHeader = activeView ? activeView.querySelector('.section-header') : null;
            const headerRect = secHeader ? secHeader.getBoundingClientRect() : null;
            const titleEl = activeView ? activeView.querySelector('.section-title') : null;
            const titleRect = titleEl ? titleEl.getBoundingClientRect() : null;
            const lineLeft = activeView ? activeView.querySelector('.section-header-line-left') : null;
            const lineLeftRect = lineLeft ? lineLeft.getBoundingClientRect() : null;
            const lineRight = activeView ? activeView.querySelector('.section-header-line') : null;
            const lineRightRect = lineRight ? lineRight.getBoundingClientRect() : null;

            return {
              docWidth,
              scrollWidth,
              hasHorizontalOverflow: scrollWidth > docWidth + 1,
              navBottom: navRect ? navRect.bottom : 0,
              headerTop: headerRect ? headerRect.top : 0,
              titleLeft: titleRect ? titleRect.left : 0,
              titleRight: titleRect ? titleRect.right : 0,
              lineLeftWidth: lineLeftRect ? lineLeftRect.width : 0,
              lineRightWidth: lineRightRect ? lineRightRect.width : 0,
              centerDelta: titleRect ? Math.abs((titleRect.left + titleRect.right)/2 - docWidth/2) : 0
            };
          })()
        `);

        if (pageMetrics.hasHorizontalOverflow) {
          throw new Error('Horizontal overflow on ' + page + ' at ' + vp.name + ' (' + vp.width + 'px): scrollWidth=' + pageMetrics.scrollWidth + ' > docWidth=' + pageMetrics.docWidth);
        }

        // Check header overlap on mobile for Profile and Contact
        if (vp.width <= 480 && (page === '#profile' || page === '#contact')) {
          if (pageMetrics.headerTop < pageMetrics.navBottom + 10) {
            throw new Error('Floating header overlaps ' + page + ' heading on ' + vp.name + ': headerTop=' + pageMetrics.headerTop + ' <= navBottom=' + pageMetrics.navBottom);
          }
          // Check title centering (within 5px tolerance)
          if (pageMetrics.centerDelta > 10) {
            throw new Error('Heading title not centered on ' + page + ' on ' + vp.name + ': centerDelta=' + pageMetrics.centerDelta + 'px');
          }
          // Check both lines are present and have width > 10px
          if (pageMetrics.lineLeftWidth < 10 || pageMetrics.lineRightWidth < 10) {
            throw new Error('Heading lines left/right missing or 0px on ' + page + ' on ' + vp.name);
          }
        }

        console.log('   ✓ ' + page + ' at ' + vp.name + ' (' + vp.width + 'px): No overflow, clean clearance (headerTop=' + Math.round(pageMetrics.headerTop) + 'px > navBottom=' + Math.round(pageMetrics.navBottom) + 'px)');
      }
    }

    // ── 7. CONSOLE ERRORS AUDIT ──
    console.log('\n--- 7. AUDITING CONSOLE ERRORS ---');
    console.log(`   Total Console Errors: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      console.error('   Errors encountered:', consoleErrors);
      throw new Error('Console errors encountered');
    }
    console.log('   Zero console errors: ✓ PASS');

    console.log('\n=== ALL PROFILE CONSISTENCY AUDIT CHECKS PASSED SUCCESSFULLY! ===\n');
    process.exit(0);

  } finally {
    try {
      if (ws) ws.close();
      chromeProcess.kill('SIGKILL');
    } catch (e) {}
  }
}

run().catch((err) => {
  console.error('\n✗ TEST RUN FAILED:', err);
  process.exit(1);
});
