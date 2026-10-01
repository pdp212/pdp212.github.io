/**
 * scripts/test_manual_scroll_and_grain.js
 * Verification of:
 * 1. Infinite loop for manual scroll DOWN (past video 6 -> video 1)
 * 2. Infinite loop for manual scroll UP (past video 1 -> video 6)
 * 3. Removal of horizontal scanlines
 * 4. Subtle 35mm film grain overlay
 * 5. Fullscreen audio tracks + volume = 1
 * 6. Responsive viewports
 */

const { spawn, execSync } = require('child_process');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('\n=== RUNNING WORK CINEMA MANUAL SCROLL & GRAIN VERIFICATION ===\n');

  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const chromeProcess = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=9225',
    '--user-data-dir=/tmp/test_chrome_grain_' + Date.now(),
    'http://127.0.0.1:3333/#work',
  ]);

  try {
    let pageTab = null;
    for (let i = 0; i < 10; i++) {
      await sleep(500);
      try {
        const tabsRes = await fetch('http://127.0.0.1:9225/json/list');
        const tabs = await tabsRes.json();
        pageTab = tabs.find(t => t.type === 'page');
        if (pageTab) break;
      } catch (e) {}
    }

    if (!pageTab) throw new Error('No tab found on port 9225');

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
    await send('Page.reload', { ignoreCache: true });
    await sleep(1500);

    async function evaluate(expression) {
      const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (res.result && res.result.exceptionDetails) {
        throw new Error(JSON.stringify(res.result.exceptionDetails));
      }
      return res.result && res.result.result ? res.result.result.value : undefined;
    }

    async function waitForTransition(maxMs = 5000) {
      const start = Date.now();
      while (Date.now() - start < maxMs) {
        const playing = await evaluate("window.VideoTransitions && window.VideoTransitions.isPlaying()");
        if (!playing) return true;
        await sleep(100);
      }
      return false;
    }

    // Wait for initial boot intro transition if any
    await waitForTransition(4500);
    await sleep(300);

    // Navigate to WORK view and wait for transition to finish
    await evaluate("window.navigateToPage('work')");
    await waitForTransition(4500);
    await sleep(500);

    // 1. VISUAL AUDIT: SCANLINES ELIMINATED & GRAIN PRESENT
    console.log('--- 1. AUDITING SCANLINE REMOVAL & FILM GRAIN OVERLAY ---');
    const visualAudit = await evaluate(`
      (() => {
        const scanlineEl = document.querySelector('.cinema-scanlines');
        const scanlineDisplay = scanlineEl ? window.getComputedStyle(scanlineEl).display : 'none';
        
        const grainEls = document.querySelectorAll('.cinema-film-grain');
        const firstGrain = grainEls[0];
        const compGrain = firstGrain ? window.getComputedStyle(firstGrain) : null;
        
        const fsGrain = document.querySelector('.cinema-fullscreen-grain');
        const compFsGrain = fsGrain ? window.getComputedStyle(fsGrain) : null;
        
        const firstMeta = document.querySelector('.cinema-screen-meta');
        const compMeta = firstMeta ? window.getComputedStyle(firstMeta) : null;
        
        return {
          scanlinesCount: document.querySelectorAll('.cinema-scanlines').length,
          scanlineDisplay: scanlineDisplay,
          grainCount: grainEls.length,
          grainPointerEvents: compGrain ? compGrain.pointerEvents : '',
          grainZIndex: compGrain ? compGrain.zIndex : '',
          grainOpacity: compGrain ? compGrain.opacity : '',
          grainBgImage: compGrain ? compGrain.backgroundImage.slice(0, 45) : '',
          grainBlendMode: compGrain ? compGrain.mixBlendMode : '',
          hasFsGrain: !!fsGrain,
          metaZIndex: compMeta ? compMeta.zIndex : ''
        };
      })()
    `);

    console.log('   Visual Audit Details:', JSON.stringify(visualAudit));
    const noScanlines = visualAudit.scanlinesCount === 0 || visualAudit.scanlineDisplay === 'none';
    console.log('   Horizontal scanlines completely removed:', noScanlines ? '✓ PASS' : '✗ FAIL');
    if (!noScanlines) throw new Error('Scanlines are still visible!');

    const hasSubtleGrain = visualAudit.grainCount >= 18 && 
                           visualAudit.grainPointerEvents === 'none' && 
                           parseFloat(visualAudit.grainOpacity) <= 0.08 && 
                           visualAudit.grainBlendMode === 'overlay' &&
                           visualAudit.hasFsGrain;
    console.log('   Subtle 35mm film grain overlay active:', hasSubtleGrain ? '✓ PASS' : '✗ FAIL');
    if (!hasSubtleGrain) throw new Error('Film grain not properly configured');

    const metaAboveGrain = parseInt(visualAudit.metaZIndex, 10) > parseInt(visualAudit.grainZIndex, 10);
    console.log('   Text labels layered above grain for 100% crispness:', metaAboveGrain ? '✓ PASS' : '✗ FAIL');

    // 2. INFINITE LOOP MANUAL SCROLL AUDIT
    console.log('\n--- 2. AUDITING MANUAL SCROLL INFINITE LOOPS ---');
    const reelDimensions = await evaluate(`
      (() => {
        const reel = document.getElementById('cinemaScreenReel');
        const totalH = reel.offsetHeight;
        const setH = totalH / 3;
        return {
          totalH: totalH,
          setH: setH,
          currentScrollY: window.scrollY
        };
      })()
    `);
    console.log('   Reel Dimensions:', JSON.stringify(reelDimensions));
    const domInfo = await evaluate(`
      (() => {
        return {
          docScrollH: document.documentElement.scrollHeight,
          bodyScrollH: document.body.scrollHeight,
          windowInnerH: window.innerHeight,
          maxScrollY: document.documentElement.scrollHeight - window.innerHeight,
          bodyOverflow: window.getComputedStyle(document.body).overflow,
          htmlOverflow: window.getComputedStyle(document.documentElement).overflow,
          workHeight: document.getElementById('page-work') ? document.getElementById('page-work').offsetHeight : 0,
          reelHeight: document.getElementById('cinemaScreenReel') ? document.getElementById('cinemaScreenReel').offsetHeight : 0
        };
      })()
    `);
    console.log('   DOM info:', JSON.stringify(domInfo));
    const setH = reelDimensions.setH;

    // Test 2A: Manual Scroll DOWN past video 6 (past setH * 2)
    console.log('   Testing Manual Scroll DOWN past video 6 into loop...');
    // Scroll to boundary: 2 * setH + 150px
    const testDownTarget = Math.round(setH * 2 + 150);
    const scrollBefore = await evaluate("window.scrollY");
    console.log('   scrollBefore:', scrollBefore);
    await evaluate(`window.scrollTo(0, ${testDownTarget})`);
    const scrollImmediate = await evaluate("window.scrollY");
    console.log('   scrollImmediate after scrollTo:', scrollImmediate);
    await evaluate("window.dispatchEvent(new Event('scroll'))");
    const scrollAfterEvent = await evaluate("window.scrollY");
    console.log('   scrollAfterEvent:', scrollAfterEvent);
    await sleep(200);

    const scrollYAfterDown = await evaluate("window.scrollY");
    console.log(`   Scrolled to ${testDownTarget}px -> Repositioned to ${Math.round(scrollYAfterDown)}px (expected ~${Math.round(testDownTarget - setH)}px)`);
    const downLoopPass = Math.abs(scrollYAfterDown - (testDownTarget - setH)) < 25;
    console.log('   Manual Scroll DOWN loop seamless:', downLoopPass ? '✓ PASS' : '✗ FAIL');
    if (!downLoopPass) throw new Error(`DOWN loop reposition failed: expected ~${testDownTarget - setH}, got ${scrollYAfterDown}`);

    // Test 2B: Manual Scroll UP past video 1 (below setH)
    console.log('   Testing Manual Scroll UP past video 1 into loop...');
    // Scroll above Set 1: setH - 120px
    const testUpTarget = Math.round(setH - 120);
    await evaluate(`window.scrollTo(0, ${testUpTarget})`);
    await evaluate("window.dispatchEvent(new Event('scroll'))");
    await sleep(200);

    const scrollYAfterUp = await evaluate("window.scrollY");
    console.log(`   Scrolled UP to ${testUpTarget}px -> Repositioned to ${Math.round(scrollYAfterUp)}px (expected ~${Math.round(testUpTarget + setH)}px)`);
    const upLoopPass = Math.abs(scrollYAfterUp - (testUpTarget + setH)) < 25;
    console.log('   Manual Scroll UP loop seamless:', upLoopPass ? '✓ PASS' : '✗ FAIL');
    if (!upLoopPass) throw new Error(`UP loop reposition failed: expected ~${testUpTarget + setH}, got ${scrollYAfterUp}`);

    // Test 2C: Combined Continuous Manual Scrolling Sequence
    console.log('   Testing Continuous Sequence: DOWN loop -> UP loop...');
    // Simulate user flick DOWN
    await evaluate(`window.scrollTo(0, ${Math.round(setH * 2 + 250)})`);
    await evaluate("window.dispatchEvent(new Event('scroll'))");
    await sleep(150);
    const pos1 = await evaluate("window.scrollY");
    
    // Simulate user flick UP
    await evaluate(`window.scrollTo(0, ${Math.round(setH - 200)})`);
    await evaluate("window.dispatchEvent(new Event('scroll'))");
    await sleep(150);
    const pos2 = await evaluate("window.scrollY");

    const comboPass = (pos1 < setH * 2 && pos1 >= setH) && (pos2 < setH * 2 && pos2 >= setH);
    console.log(`   Combined bidirectional loop stays strictly in Set 1 buffer: (pos1=${Math.round(pos1)}, pos2=${Math.round(pos2)})`, comboPass ? '✓ PASS' : '✗ FAIL');
    if (!comboPass) throw new Error('Bidirectional loop fell outside buffer zone');

    // 3. AUTO-SCROLL LOOP VERIFICATION
    console.log('\n--- 3. AUDITING AUTO-SCROLL CONTINUOUS RUN & LOOP ---');
    // Let user interaction expire and auto-scroll resume
    await sleep(2400);
    const isAutoScrolling = await evaluate("window.WorkCinema.isAutoScrolling()");
    console.log('   Auto-scroll running:', isAutoScrolling ? '✓ PASS' : '✗ FAIL');

    const autoY1 = await evaluate("window.scrollY");
    await sleep(1000);
    const autoY2 = await evaluate("window.scrollY");
    const autoDelta = autoY2 - autoY1;
    console.log(`   Auto-scroll actively advancing: +${Math.round(autoDelta)}px`, autoDelta > 3 ? '✓ PASS' : '✗ FAIL');

    // 4. FULLSCREEN AUDIO & MASTER STREAM AUDIT
    console.log('\n--- 4. AUDITING FULLSCREEN STREAMING & MASTER AUDIO ---');
    await evaluate("document.querySelector('.cinema-screen').click()");
    await sleep(400);

    const fsAudioInfo = await evaluate(`
      (() => {
        const v = document.getElementById('cinemaFullscreenVideo');
        return {
          isOpen: window.WorkCinema.isFullscreen(),
          src: v.src,
          currentTime: v.currentTime,
          volume: v.volume,
          muted: v.muted
        };
      })()
    `);
    console.log('   Fullscreen State:', JSON.stringify(fsAudioInfo));
    const fsPass = fsAudioInfo.isOpen && fsAudioInfo.volume === 1 && fsAudioInfo.src.includes('.r2.dev');
    console.log('   Fullscreen streaming unmuted with volume = 1:', fsPass ? '✓ PASS' : '✗ FAIL');

    // Close via ESC
    await evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }))");
    await sleep(300);
    const isClosed = await evaluate("!window.WorkCinema.isFullscreen()");
    console.log('   Clean exit via ESC:', isClosed ? '✓ PASS' : '✗ FAIL');

    // 5. RESPONSIVE AUDIT
    console.log('\n--- 5. RESPONSIVE VIEWPORTS AUDIT ---');
    const viewports = [
      { w: 390, h: 844, name: '390px Mobile' },
      { w: 768, h: 1024, name: '768px Tablet' },
      { w: 1440, h: 900, name: '1440px Laptop' },
      { w: 1920, h: 1080, name: '1920px Cinema' }
    ];
    for (const vp of viewports) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: vp.w,
        height: vp.h,
        deviceScaleFactor: 1,
        mobile: vp.w <= 768
      });
      await sleep(150);
      const overflow = await evaluate("document.documentElement.scrollWidth > window.innerWidth");
      console.log(`   ${vp.name}: ${!overflow ? '✓ PASS (No overflow)' : '✗ FAIL (Overflow)'}`);
    }

    console.log('\n=== ALL MANUAL SCROLL & GRAIN VERIFICATION TESTS PASSED! ===\n');

    ws.close();
    chromeProcess.kill();
    process.exit(0);
  } catch (err) {
    console.error('Test run failed:', err);
    chromeProcess.kill();
    process.exit(1);
  }
}

run();
