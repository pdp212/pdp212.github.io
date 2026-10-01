/**
 * scripts/test_production_live.js
 * Automated smoke test against LIVE GitHub Pages production: https://pdp212.github.io/
 */

const { spawn } = require('child_process');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('\n=== RUNNING PRODUCTION LIVE SMOKE TEST (https://pdp212.github.io/) ===\n');

  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const chromeProcess = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=9240',
    '--user-data-dir=/tmp/test_chrome_prod_' + Date.now(),
    'https://pdp212.github.io/#home',
  ]);

  let ws = null;
  try {
    let pageTab = null;
    for (let i = 0; i < 20; i++) {
      await sleep(400);
      try {
        const tabsRes = await fetch('http://127.0.0.1:9240/json/list');
        const tabs = await tabsRes.json();
        pageTab = tabs.find(t => t.type === 'page');
        if (pageTab) break;
      } catch (e) {}
    }

    if (!pageTab) throw new Error('No page tab found on port 9240');

    ws = new WebSocket(pageTab.webSocketDebuggerUrl);
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
    const failedUrls = [];

    ws.addEventListener('message', (event) => {
      const data = JSON.parse(event.data);
      if (data.method === 'Console.messageAdded' && data.params.message.level === 'error') {
        consoleErrors.push(data.params.message.text);
      }
      if (data.method === 'Network.responseReceived') {
        const status = data.params.response.status;
        const url = data.params.response.url;
        if (status >= 400 && !url.includes('favicon')) {
          failedUrls.push({ url, status });
        }
      }
    });

    async function evaluate(expression) {
      const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (res.result && res.result.exceptionDetails) {
        throw new Error(JSON.stringify(res.result.exceptionDetails));
      }
      return res.result && res.result.result ? res.result.result.value : undefined;
    }

    async function waitTransition(maxMs = 5000) {
      const start = Date.now();
      while (Date.now() - start < maxMs) {
        try {
          const playing = await evaluate('!(window.VideoTransitions && window.VideoTransitions.isPlaying())');
          if (playing) break;
        } catch (e) {}
        await sleep(100);
      }
      await sleep(300);
    }

    await waitTransition();
    await sleep(1000);

    // ── 1. AUDIT HOME PAGE ──
    console.log('--- 1. AUDITING LIVE HOME VIEW ---');
    const homeAudit = await evaluate(`
      (() => {
        const title = document.title;
        const roleEl = document.querySelector('.hero-role');
        const role = roleEl ? roleEl.textContent.trim() : '';
        const roleWeight = roleEl ? parseInt(window.getComputedStyle(roleEl).fontWeight, 10) : 0;
        const sloganEl = document.getElementById('heroSlogan');
        const slogan = sloganEl ? sloganEl.textContent.trim() : '';
        const bgComp = window.getComputedStyle(document.querySelector('.hero-section'));
        const featVid = document.getElementById('homeFeaturedVideo');
        return {
          title,
          role,
          roleWeight,
          slogan,
          hasBg: bgComp.backgroundImage.includes('background-home-1920x1080.webp'),
          featSrc: featVid ? featVid.src : ''
        };
      })()
    `);

    console.log('   Document Title:', homeAudit.title);
    console.log('   Hero Role:', homeAudit.role);
    console.log('   Hero Role Font-Weight:', homeAudit.roleWeight);
    console.log('   Hero Slogan:', homeAudit.slogan);
    console.log('   Background Home WebP active:', homeAudit.hasBg ? '✓ PASS' : '✗ FAIL');
    console.log('   Featured Video URL:', homeAudit.featSrc);

    if (homeAudit.roleWeight < 600) throw new Error('Live Hero Role font-weight is not >= 600: got ' + homeAudit.roleWeight);
    if (!homeAudit.slogan.includes('Technical precision. Cinematic vision. Elevating every frame.')) {
      throw new Error('Live Hero Slogan mismatch: got ' + homeAudit.slogan);
    }
    if (!homeAudit.hasBg) throw new Error('Live background image missing');
    if (!homeAudit.featSrc.includes('.r2.dev')) throw new Error('Featured video not streaming from Cloudflare R2');

    // ── 2. AUDIT WORK CINEMA ──
    console.log('\n--- 2. AUDITING LIVE WORK VIEW (#work) ---');
    await evaluate('window.navigateToPage ? window.navigateToPage("work") : (window.location.hash = "#work")');
    await waitTransition();
    await sleep(600);

    const workAudit = await evaluate(`
      (() => {
        const workView = document.getElementById('page-work');
        const isActive = workView && workView.classList.contains('active');
        const screens = document.querySelectorAll('.cinema-screen');
        const firstVid = screens[0] ? screens[0].querySelector('video') : null;
        return {
          isActive,
          screensCount: screens.length,
          firstVidSrc: firstVid ? firstVid.src : ''
        };
      })()
    `);
    console.log('   WORK view active:', workAudit.isActive ? '✓ PASS' : '✗ FAIL');
    console.log('   Cinema screens mounted:', workAudit.screensCount, workAudit.screensCount >= 1 ? '✓ PASS' : '✗ FAIL');
    console.log('   Reel stream asset:', workAudit.firstVidSrc);

    if (!workAudit.isActive || workAudit.screensCount < 1) throw new Error('Live WORK view failed to render');

    // ── 3. AUDIT PROFILE VIEW ──
    console.log('\n--- 3. AUDITING LIVE PROFILE VIEW (#profile) ---');
    await evaluate('window.navigateToPage ? window.navigateToPage("profile") : (window.location.hash = "#profile")');
    await waitTransition();
    await sleep(600);

    const profileAudit = await evaluate(`
      (() => {
        const view = document.getElementById('page-profile');
        const isActive = view && view.classList.contains('active');
        const header = view ? view.querySelector('.section-header') : null;
        const secNum = header ? header.querySelector('.section-number') : null;
        const dataNum = header ? header.getAttribute('data-num') : null;
        const title = view ? view.querySelector('.section-title') : null;
        return {
          isActive,
          hasNumber: !!secNum || !!dataNum,
          titleText: title ? title.textContent.trim() : ''
        };
      })()
    `);
    console.log('   PROFILE view active:', profileAudit.isActive ? '✓ PASS' : '✗ FAIL');
    console.log('   Section 03 completely removed:', !profileAudit.hasNumber ? '✓ PASS' : '✗ FAIL');
    console.log('   Profile Title Text:', profileAudit.titleText);

    if (!profileAudit.isActive || profileAudit.hasNumber || profileAudit.titleText !== 'Profile') {
      throw new Error('Live Profile view failed audit');
    }

    // ── 4. AUDIT CONTACT VIEW ──
    console.log('\n--- 4. AUDITING LIVE CONTACT VIEW (#contact) ---');
    await evaluate('window.navigateToPage ? window.navigateToPage("contact") : (window.location.hash = "#contact")');
    await waitTransition();
    await sleep(600);

    const contactAudit = await evaluate(`
      (() => {
        const view = document.getElementById('page-contact');
        const isActive = view && view.classList.contains('active');
        const header = view ? view.querySelector('.section-header') : null;
        const secNum = header ? header.querySelector('.section-number') : null;
        const dataNum = header ? header.getAttribute('data-num') : null;
        const title = view ? view.querySelector('.section-title') : null;
        const email = document.getElementById('contactEmail');
        return {
          isActive,
          hasNumber: !!secNum || !!dataNum,
          titleText: title ? title.textContent.trim() : '',
          email: email ? email.textContent.trim() : ''
        };
      })()
    `);
    console.log('   CONTACT view active:', contactAudit.isActive ? '✓ PASS' : '✗ FAIL');
    console.log('   Section 04 completely removed:', !contactAudit.hasNumber ? '✓ PASS' : '✗ FAIL');
    console.log('   Contact Title Text:', contactAudit.titleText);
    console.log('   Contact Email:', contactAudit.email);

    if (!contactAudit.isActive || contactAudit.hasNumber || contactAudit.titleText !== 'Contact') {
      throw new Error('Live Contact view failed audit');
    }

    // ── 5. RESPONSIVE VIEWPORTS AUDIT (Samsung S25 360px, 390px, 768px, 1440px) ──
    console.log('\n--- 5. AUDITING RESPONSIVE VIEWPORTS ON LIVE SITE ---');
    const viewports = [
      { name: 'Samsung S25', w: 360, h: 780, mobile: true },
      { name: 'Mobile 390px', w: 390, h: 844, mobile: true },
      { name: 'Tablet 768px', w: 768, h: 1024, mobile: false },
      { name: 'Desktop 1440px', w: 1440, h: 900, mobile: false }
    ];

    for (const vp of viewports) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: vp.w,
        height: vp.h,
        deviceScaleFactor: 1,
        mobile: vp.mobile
      });
      await sleep(300);

      const metrics = await evaluate(`
        (() => {
          const docW = document.documentElement.offsetWidth;
          const scrollW = document.documentElement.scrollWidth;
          const activeView = document.querySelector('.page-view.active');
          const header = activeView ? activeView.querySelector('.section-header') : null;
          const hRect = header ? header.getBoundingClientRect() : null;
          const nav = document.getElementById('navbar');
          const nRect = nav ? nav.getBoundingClientRect() : null;
          return {
            overflow: scrollW > docW + 1,
            clearance: (hRect && nRect) ? (hRect.top - nRect.bottom) : 999
          };
        })()
      `);

      if (metrics.overflow) throw new Error('Horizontal overflow detected at ' + vp.name);
      if (vp.mobile && metrics.clearance < 15) throw new Error('Header overlap detected at ' + vp.name + ': clearance=' + metrics.clearance);

      console.log('   ✓ ' + vp.name + ': No overflow, clean clearance (' + Math.round(metrics.clearance) + 'px below navbar)');
    }

    // ── 6. NETWORK ASSET 404 & CONSOLE ERRORS ──
    console.log('\n--- 6. AUDITING NETWORK REQUESTS & CONSOLE LOGS ---');
    console.log('   Failed network requests (404/500):', failedUrls.length);
    if (failedUrls.length > 0) {
      console.error('   Failed URLs:', JSON.stringify(failedUrls));
      throw new Error('HTTP asset loading errors on production');
    }
    console.log('   All production assets loaded successfully (HTTP 200): ✓ PASS');

    console.log('   Total console errors:', consoleErrors.length);
    if (consoleErrors.length > 0) {
      console.error('   Console errors:', consoleErrors);
      throw new Error('Console errors encountered on production');
    }
    console.log('   Zero console errors: ✓ PASS');

    console.log('\n=== ALL PRODUCTION LIVE CHECKS PASSED FLAWLESSLY! ===\n');
    process.exit(0);

  } catch (err) {
    console.error('\n✗ PRODUCTION SMOKE TEST FAILED:', err);
    process.exit(1);
  } finally {
    try {
      if (ws) ws.close();
      chromeProcess.kill('SIGKILL');
    } catch (e) {}
  }
}

run();
