/**
 * scripts/verify_runtime_diagnostics.js
 * Inspects cold boot runtime behavior at http://127.0.0.1:3333/#work
 * Logs all network requests, console messages, WorkData states, and DOM video elements.
 */

const { spawn } = require('child_process');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('=== RUNNING LIVE BROWSER RUNTIME DIAGNOSTIC ===\n');

  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const chromeProcess = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=9225',
    '--user-data-dir=/tmp/test_chrome_diag_' + Date.now(),
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

    if (!pageTab) throw new Error('No page tab found in Chrome on port 9225');

    const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
    let id = 1;
    const callbacks = new Map();
    const networkRequests = [];
    const consoleLogs = [];

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && callbacks.has(data.id)) {
        const cb = callbacks.get(data.id);
        callbacks.delete(data.id);
        cb(data);
      }

      if (data.method === 'Network.requestWillBeSent') {
        const url = data.params.request.url;
        if (url.includes('manifest') || url.includes('.mp4')) {
          networkRequests.push({ type: 'request', url, timestamp: Date.now() });
        }
      }
      if (data.method === 'Network.responseReceived') {
        const url = data.params.response.url;
        if (url.includes('manifest') || url.includes('.mp4')) {
          networkRequests.push({
            type: 'response',
            url,
            status: data.params.response.status,
            statusText: data.params.response.statusText,
            headers: data.params.response.headers
          });
        }
      }
      if (data.method === 'Runtime.consoleAPICalled') {
        const args = data.params.args.map(a => a.value !== undefined ? a.value : (a.description || ''));
        consoleLogs.push(args.join(' '));
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
    await send('Runtime.enable');
    await send('Page.enable');

    // Reload cold without cache
    await send('Network.setCacheDisabled', { cacheDisabled: true });
    await send('Page.reload', { ignoreCache: true });

    // Wait 3.5 seconds for initial boot & video transitions
    await sleep(3500);

    async function evaluate(expression) {
      const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      return res.result && res.result.result ? res.result.result.value : undefined;
    }

    const state = await evaluate(`
      (() => {
        const screens = Array.from(document.querySelectorAll('.cinema-screen'));
        const screenVideos = screens.map(s => {
          const v = s.querySelector('video');
          return {
            id: s.id,
            tag: s.getAttribute('data-tag'),
            name: s.getAttribute('data-name'),
            dataUrl: s.getAttribute('data-url'),
            videoSrc: v ? v.src : '',
            videoCurrentSrc: v ? v.currentSrc : '',
            sourceChildSrc: (v && v.querySelector('source')) ? v.querySelector('source').src : ''
          };
        });

        const fsVideo = document.getElementById('cinemaFullscreenVideo');

        return {
          workDataSourceGlobal: window.__WORK_DATA_SOURCE,
          workDataObj: !!window.WorkData,
          workDataStatus: window.WorkData ? window.WorkData.getStatus() : null,
          workDataSource: window.WorkData ? window.WorkData.getSource() : null,
          workDataVideos: window.WorkData ? window.WorkData.getVideos() : null,
          totalScreens: screens.length,
          screenVideos: screenVideos,
          fsVideoSrc: fsVideo ? fsVideo.src : ''
        };
      })()
    `);

    console.log('--- CONSOLE LOGS CAPTURED ---');
    consoleLogs.forEach(log => console.log('   [CONSOLE]', log));

    console.log('\n--- NETWORK REQUESTS CAPTURED ---');
    networkRequests.forEach(req => console.log('   [NET]', JSON.stringify(req)));

    console.log('\n--- RUNTIME STATE EVALUATION ---');
    console.log('window.__WORK_DATA_SOURCE:', state.workDataSourceGlobal);
    console.log('WorkData.getStatus():', state.workDataStatus);
    console.log('WorkData.getSource():', state.workDataSource);
    console.log('WorkData.getVideos():', JSON.stringify(state.workDataVideos, null, 2));
    console.log('Total reel screens mounted:', state.totalScreens);
    console.log('First reel screen video:', JSON.stringify(state.screenVideos[0], null, 2));

    ws.close();
    chromeProcess.kill();
    process.exit(0);
  } catch (e) {
    console.error('Diagnostic error:', e);
    chromeProcess.kill();
    process.exit(1);
  }
}

run();
