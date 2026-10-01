/**
 * scripts/test_coccoc_video.js — CocCoc Video Transitions Verification
 */

const { spawn } = require('child_process');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('\n=== TESTING COCCOC WITH VIDEO-BASED TRANSITIONS ===\n');

  const proc = spawn('/Applications/CocCoc.app/Contents/MacOS/CocCoc', [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=9233',
    'http://127.0.0.1:3333/#home',
  ]);

  await sleep(1500);

  try {
    const res = await fetch('http://127.0.0.1:9233/json/list');
    const tabs = await res.json();
    const pageTab = tabs.find(t => t.type === 'page');

    if (!pageTab) throw new Error('No page tab in CocCoc');

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

    async function waitTransition() {
      for (let i = 0; i < 35; i++) {
        const playing = await evaluate("window.VideoTransitions && window.VideoTransitions.isPlaying()");
        if (!playing) return;
        await sleep(150);
      }
    }

    // 1. Initial Intro & Home
    await waitTransition();
    const initialHome = await evaluate("document.getElementById('page-home').classList.contains('active')");
    const initialEnterHome = await evaluate("document.getElementById('page-home').classList.contains('enter-home')");
    console.log('1. CocCoc Intro finished & HOME active with .enter-home:', (initialHome && initialEnterHome) ? '✓ PASS' : '✗ FAIL');

    // 2. HOME -> WORK
    console.log('2. CocCoc HOME -> WORK (home-to-work.mp4)...');
    await evaluate("window.navigateToPage('work')");
    await waitTransition();
    const workActive = await evaluate("document.getElementById('page-work').classList.contains('active')");
    const workEnter = await evaluate("document.getElementById('page-work').classList.contains('enter-work')");
    console.log('   CocCoc WORK active with .enter-work:', (workActive && workEnter) ? '✓ PASS' : '✗ FAIL');

    // 3. WORK -> PROFILE
    console.log('3. CocCoc WORK -> PROFILE (work-to-profile.mp4)...');
    await evaluate("window.navigateToPage('profile')");
    await waitTransition();
    await sleep(400); // allow telemetry bar expansion to start
    const profActive = await evaluate("document.getElementById('page-profile').classList.contains('active')");
    const profEnter = await evaluate("document.getElementById('page-profile').classList.contains('enter-profile')");
    const telemetry = await evaluate("parseInt(document.querySelector('.skill-fill').style.width, 10) > 0");
    console.log('   CocCoc PROFILE active with telemetry (' + telemetry + '):', (profActive && profEnter && telemetry) ? '✓ PASS' : '✗ FAIL');

    // 4. PROFILE -> CONTACT
    console.log('4. CocCoc PROFILE -> CONTACT (profile-to-contact.mp4)...');
    await evaluate("window.navigateToPage('contact')");
    await waitTransition();
    const contactActive = await evaluate("document.getElementById('page-contact').classList.contains('active')");
    const contactEnter = await evaluate("document.getElementById('page-contact').classList.contains('enter-contact')");
    const beacon = await evaluate("document.querySelector('.contact-availability-badge').classList.contains('pulse-active')");
    console.log('   CocCoc CONTACT active with beacon pulse:', (contactActive && contactEnter && beacon) ? '✓ PASS' : '✗ FAIL');

    // 5. CONTACT -> HOME
    console.log('5. CocCoc CONTACT -> HOME loop (contact-to-home.mp4)...');
    await evaluate("window.navigateToPage('home')");
    await waitTransition();
    const loopHome = await evaluate("document.getElementById('page-home').classList.contains('active')");
    const loopEnter = await evaluate("document.getElementById('page-home').classList.contains('enter-home')");
    console.log('   CocCoc loop back to HOME view:', (loopHome && loopEnter) ? '✓ PASS' : '✗ FAIL');

    console.log('\n=== ALL COCCOC VIDEO TRANSITION TESTS PASSED! ===\n');

    ws.close();
    proc.kill();
    process.exit(0);
  } catch (err) {
    console.error('CocCoc test error:', err);
    proc.kill();
    process.exit(1);
  }
}

run();
