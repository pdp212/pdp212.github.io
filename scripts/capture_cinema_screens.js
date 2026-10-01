/**
 * scripts/capture_cinema_screens.js — Capture visual screenshots of WORK Cinema
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const artifactDir = '/Users/sss-phat/.gemini/antigravity-ide/brain/1a557d0e-fb79-4069-9963-8dd4e0769ce1';

async function run() {
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const chromeProcess = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=9225',
    '--user-data-dir=/tmp/test_chrome_screen_' + Date.now(),
    'http://127.0.0.1:3333/#work',
  ]);

  await sleep(1500);

  try {
    const tabsRes = await fetch('http://127.0.0.1:9225/json/list');
    const tabs = await tabsRes.json();
    const pageTab = tabs.find(t => t.type === 'page');

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
    await send('Network.setCacheDisabled', { cacheDisabled: true });
    await send('Page.reload', { ignoreCache: true });
    await sleep(2000);

    // Set 1920x1080
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: false,
    });

    async function evaluate(expression) {
      const res = await send('Runtime.evaluate', { expression, returnByValue: true });
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

    await evaluate("window.navigateToPage('work')");
    await waitForTransition(5000);
    await sleep(800);

    // 1. Capture Desktop Cinema Reel with Floating Header
    const resReel = await send('Page.captureScreenshot', { format: 'png' });
    const reelPath = path.join(artifactDir, 'work_cinema_desktop_reel.png');
    const headerWorkPath = path.join(artifactDir, 'floating_header_work.png');
    fs.writeFileSync(reelPath, Buffer.from(resReel.result.data, 'base64'));
    fs.writeFileSync(headerWorkPath, Buffer.from(resReel.result.data, 'base64'));
    console.log('Saved:', reelPath);
    console.log('Saved:', headerWorkPath);

    // 2. Open Fullscreen Mode
    await evaluate("document.querySelector('.cinema-screen').click()");
    await sleep(600);

    const resFs = await send('Page.captureScreenshot', { format: 'png' });
    const fsPath = path.join(artifactDir, 'work_cinema_fullscreen.png');
    fs.writeFileSync(fsPath, Buffer.from(resFs.result.data, 'base64'));
    console.log('Saved:', fsPath);

    // 3. Close Fullscreen and Return
    await evaluate("document.getElementById('cinemaBackBtn').click()");
    await sleep(400);

    // 4. Navigate to HOME to capture floating header over HOME view
    await evaluate("window.navigateToPage('home')");
    await waitForTransition(5000);
    await sleep(800);
    const resHome = await send('Page.captureScreenshot', { format: 'png' });
    const homePath = path.join(artifactDir, 'floating_header_home.png');
    fs.writeFileSync(homePath, Buffer.from(resHome.result.data, 'base64'));
    console.log('Saved:', homePath);

    // 5. Navigate back to WORK on Mobile 390px to capture mobile cinema composition
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await sleep(400);
    await evaluate("window.navigateToPage('work')");
    await waitForTransition(5000);
    await sleep(800);

    const resMobile = await send('Page.captureScreenshot', { format: 'png' });
    const mobilePath = path.join(artifactDir, 'floating_header_mobile.png');
    const mobileCinemaPath = path.join(artifactDir, 'work_cinema_mobile_reel.png');
    fs.writeFileSync(mobilePath, Buffer.from(resMobile.result.data, 'base64'));
    fs.writeFileSync(mobileCinemaPath, Buffer.from(resMobile.result.data, 'base64'));
    console.log('Saved:', mobilePath);
    console.log('Saved:', mobileCinemaPath);

    ws.close();
    chromeProcess.kill();
    console.log('Visual screenshot captures complete!');
  } catch (err) {
    console.error(err);
    chromeProcess.kill();
  }
}

run();
