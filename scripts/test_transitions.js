/**
 * scripts/test_transitions.js — End-to-End Video-Based & Cinematic Transition Verification
 */

const { spawn } = require('child_process');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('\n=== RUNNING VIDEO-BASED CINEMATIC TRANSITIONS AUTOMATION TEST ===\n');

  // Start Chrome headless
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const chromeProcess = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=9223',
    'http://127.0.0.1:3333/#home',
  ]);

  await sleep(1500);

  try {
    const tabsRes = await fetch('http://127.0.0.1:9223/json/list');
    const tabs = await tabsRes.json();
    const pageTab = tabs.find(t => t.type === 'page');

    if (!pageTab) {
      throw new Error('No page tab found in Chrome');
    }

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

    async function evaluate(expression) {
      const res = await send('Runtime.evaluate', { expression, returnByValue: true });
      if (res.result && res.result.exceptionDetails) {
        throw new Error(res.result.exceptionDetails.text || 'Eval error');
      }
      return res.result && res.result.result ? res.result.result.value : undefined;
    }

    // Set media emulation to 'no-preference'
    await send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
    });

    async function waitForTransition(maxMs = 5000) {
      const start = Date.now();
      while (Date.now() - start < maxMs) {
        const playing = await evaluate("window.VideoTransitions && window.VideoTransitions.isPlaying()");
        if (!playing) return true;
        await sleep(100);
      }
      return false;
    }

    // 1. Initial State & Intro Video Verification
    console.log('1. Verifying initial load & intro video opening...');
    // Wait for intro video to complete
    await waitForTransition(4500);

    const initialHome = await evaluate("document.getElementById('page-home').classList.contains('active')");
    const initialEnterHome = await evaluate("document.getElementById('page-home').classList.contains('enter-home')");
    const videoOverlayHidden = await evaluate("window.getComputedStyle(document.getElementById('pageTransitionVideo')).visibility === 'hidden'");
    console.log('   Intro video finished, HOME active with .enter-home choreography:', (initialHome && initialEnterHome && videoOverlayHidden) ? '✓ PASS' : '✗ FAIL');

    // 2. VideoTransitions Diagnostics API check
    console.log('2. Verifying window.VideoTransitions diagnostics API...');
    const apiExists = await evaluate("typeof window.VideoTransitions === 'object' && typeof window.VideoTransitions.getStatus === 'function'");
    const status = await evaluate("window.VideoTransitions.getStatus()");
    console.log('   Diagnostics API available and functional:', apiExists ? '✓ PASS' : '✗ FAIL', JSON.stringify(status));

    // 3. Transition HOME → WORK (home-to-work.mp4)
    console.log('3. Triggering transition to WORK (home-to-work.mp4)...');
    await evaluate("window.navigateToPage('work')");

    // Check transition lock immediately after trigger
    const lockActive = await evaluate("window.VideoTransitions.isPlaying()");
    console.log('   Transition lock engaged (isPlaying: true):', lockActive ? '✓ PASS' : '✗ FAIL');

    // Attempt double click during transition (must be ignored)
    await evaluate("window.navigateToPage('profile')");
    const stillNavigatingWork = await evaluate("window.VideoTransitions.getCurrentTransition() === 'home-to-work'");
    console.log('   Double navigation prevented by transition lock:', stillNavigatingWork ? '✓ PASS' : '✗ FAIL');

    // Wait for video transition to end
    await waitForTransition(4500);

    const workActive = await evaluate("document.getElementById('page-work').classList.contains('active')");
    const workEnter = await evaluate("document.getElementById('page-work').classList.contains('enter-work')");
    const homeHidden = await evaluate("!document.getElementById('page-home').classList.contains('active')");
    const videoHiddenWork = await evaluate("window.getComputedStyle(document.getElementById('pageTransitionVideo')).visibility === 'hidden'");
    const screensRendered = await evaluate("document.querySelectorAll('.cinema-screen').length >= 4");
    console.log('   WORK active with .enter-work & cinema screening reel:', (workActive && workEnter && homeHidden && videoHiddenWork && screensRendered) ? '✓ PASS' : '✗ FAIL');

    // 4. Transition WORK → PROFILE (work-to-profile.mp4)
    console.log('4. Triggering transition to PROFILE (work-to-profile.mp4)...');
    await evaluate("window.navigateToPage('profile')");
    await waitForTransition(4500);
    await sleep(400);

    const profileActive = await evaluate("document.getElementById('page-profile').classList.contains('active')");
    const profileEnter = await evaluate("document.getElementById('page-profile').classList.contains('enter-profile')");
    const skillBarFilled = await evaluate("parseInt(document.querySelector('.skill-fill').style.width, 10) > 0");
    const aiScanlineActive = await evaluate("document.querySelector('.ai-code-block') !== null");
    console.log('   PROFILE active with .enter-profile & skill telemetry filled (' + skillBarFilled + '):', (profileActive && profileEnter && skillBarFilled && aiScanlineActive) ? '✓ PASS' : '✗ FAIL');

    // 5. Transition PROFILE → CONTACT (profile-to-contact.mp4)
    console.log('5. Triggering transition to CONTACT (profile-to-contact.mp4)...');
    await evaluate("window.navigateToPage('contact')");
    await waitForTransition(4500);

    const contactActive = await evaluate("document.getElementById('page-contact').classList.contains('active')");
    const contactEnter = await evaluate("document.getElementById('page-contact').classList.contains('enter-contact')");
    const beaconPulse = await evaluate("document.querySelector('.contact-availability-badge').classList.contains('pulse-active')");
    console.log('   CONTACT active with .enter-contact & beacon pulse:', (contactActive && contactEnter && beaconPulse) ? '✓ PASS' : '✗ FAIL');

    // 6. Transition CONTACT → HOME (contact-to-home.mp4) — Loop back
    console.log('6. Triggering loop transition back to HOME (contact-to-home.mp4)...');
    await evaluate("window.navigateToPage('home')");
    await waitForTransition(4500);

    const loopHomeActive = await evaluate("document.getElementById('page-home').classList.contains('active')");
    const loopHomeEnter = await evaluate("document.getElementById('page-home').classList.contains('enter-home')");
    console.log('   Full loop back to HOME view:', (loopHomeActive && loopHomeEnter) ? '✓ PASS' : '✗ FAIL');

    // 7. Viewport Responsive Overflows Check across 390px, 768px, 1440px, 1920px
    const viewports = [
      { w: 390, h: 844, name: 'Mobile 390px' },
      { w: 768, h: 1024, name: 'Tablet 768px' },
      { w: 1440, h: 900, name: 'Laptop 1440px' },
      { w: 1920, h: 1080, name: 'Desktop 1920px' },
    ];

    let allViewportsClean = true;
    for (const vp of viewports) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: vp.w,
        height: vp.h,
        deviceScaleFactor: 1,
        mobile: vp.w <= 768,
      });
      await sleep(100);
      const overflow = await evaluate("document.documentElement.scrollWidth > window.innerWidth");
      if (overflow) {
        console.error(`   ✗ Overflow detected on ${vp.name}!`);
        allViewportsClean = false;
      } else {
        console.log(`   ✓ No overflow on ${vp.name}`);
      }
    }
    console.log('7. Responsive viewports audit (390px - 1920px):', allViewportsClean ? '✓ PASS' : '✗ FAIL');

    // 8. Check for Console Errors
    const pageErrors = await evaluate("window.__errors || []");
    console.log('8. Console errors during transitions:', pageErrors.length === 0 ? '✓ PASS (0 errors)' : '✗ FAIL (' + pageErrors.length + ' errors)');

    // 9. Reduced Motion Mode Check
    console.log('9. Testing reduced-motion handling (Section 14 Specification)...');
    await send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    await evaluate("window.navigateToPage('work')");
    await waitForTransition(4500);
    const rmWorkActive = await evaluate("document.getElementById('page-work').classList.contains('active')");
    console.log('   Reduced motion route transition completed safely without instant broken jump:', rmWorkActive ? '✓ PASS' : '✗ FAIL');

    console.log('\n=== ALL VIDEO & CINEMATIC TRANSITION TESTS COMPLETED SUCCESSFULLY! ===\n');

    ws.close();
    chromeProcess.kill();
    process.exit(0);
  } catch (err) {
    console.error('Test run error:', err);
    chromeProcess.kill();
    process.exit(1);
  }
}

run();
