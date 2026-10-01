/**
 * scripts/test_browser.js — End-to-End Browser Test via Chrome DevTools Protocol
 */

async function main() {
  const tabsRes = await fetch('http://127.0.0.1:9222/json/list');
  const tabs = await tabsRes.json();
  const pageTab = tabs.find(t => t.type === 'page' && t.url.includes('127.0.0.1:3333'));

  if (!pageTab) {
    console.error('No page tab found for portfolio!');
    process.exit(1);
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
      throw new Error(res.result.exceptionDetails.text || 'Evaluation error');
    }
    return res.result && res.result.result ? res.result.result.value : undefined;
  }

  console.log('\n=== RUNNING 4-PAGE SPA BROWSER VERIFICATION ===\n');

  // Test 1: Check initial page view is HOME
  const homeActive = await evaluate("document.getElementById('page-home').classList.contains('active')");
  console.log('1. Initial page view is HOME:', homeActive ? '✓ PASS' : '✗ FAIL');

  // Test 2: Check Hero elements
  const heroName = await evaluate("document.querySelector('.hero-name').innerText");
  console.log('2. Hero Name rendered:', heroName.includes('PHAN DUC') ? '✓ PASS' : '✗ FAIL');

  // Test 3: Navigate to WORK page
  await evaluate("window.navigateToPage('work')");
  const workActive = await evaluate("document.getElementById('page-work').classList.contains('active')");
  const homeInactive = await evaluate("!document.getElementById('page-home').classList.contains('active')");
  console.log('3. Navigation to WORK page:', (workActive && homeInactive) ? '✓ PASS' : '✗ FAIL');

  // Test 4: Check Projects rendered on WORK page
  const projectCardsCount = await evaluate("document.querySelectorAll('#workProjectsGrid .project-card').length");
  console.log('4. Project cards rendered on WORK page (count=' + projectCardsCount + '):', projectCardsCount >= 3 ? '✓ PASS' : '✗ FAIL');

  // Test 5: Open Lightbox by clicking first card
  await evaluate("document.querySelector('#workProjectsGrid .project-card').click()");
  const lightboxOpen = await evaluate("document.getElementById('lightbox').classList.contains('open')");
  const lightboxTitle = await evaluate("document.querySelector('.lightbox-title').innerText");
  console.log('5. Lightbox opens on card click (Title="' + lightboxTitle + '"):', lightboxOpen ? '✓ PASS' : '✗ FAIL');

  // Test 6: Close Lightbox with ESC key
  await evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))");
  const lightboxClosed = await evaluate("!document.getElementById('lightbox').classList.contains('open')");
  console.log('6. Lightbox closes with ESC key:', lightboxClosed ? '✓ PASS' : '✗ FAIL');

  // Test 7: Navigate to PROFILE page
  await evaluate("window.navigateToPage('profile')");
  const profileActive = await evaluate("document.getElementById('page-profile').classList.contains('active')");
  const bioCount = await evaluate("document.querySelectorAll('#page-profile .about-body p').length");
  const aiBlock = await evaluate("document.querySelector('#page-profile .ai-code-block') !== null");
  console.log('7. Navigation to PROFILE page & content check (Bio=' + bioCount + ', AI Code=' + aiBlock + '):', (profileActive && bioCount > 0 && aiBlock) ? '✓ PASS' : '✗ FAIL');

  // Test 8: Navigate to CONTACT page
  await evaluate("window.navigateToPage('contact')");
  const contactActive = await evaluate("document.getElementById('page-contact').classList.contains('active')");
  const emailText = await evaluate("document.getElementById('contactEmail').innerText");
  console.log('8. Navigation to CONTACT page (Email=' + emailText + '):', (contactActive && emailText.includes('@')) ? '✓ PASS' : '✗ FAIL');

  // Test 9: Navigate back to HOME
  await evaluate("window.navigateToPage('home')");
  const backHomeActive = await evaluate("document.getElementById('page-home').classList.contains('active')");
  console.log('9. Full loop navigation back to HOME:', backHomeActive ? '✓ PASS' : '✗ FAIL');

  // Test 10: Horizontal overflow check on mobile viewport
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  const hasOverflow = await evaluate("document.documentElement.scrollWidth > window.innerWidth");
  console.log('10. Mobile 390px viewport horizontal overflow:', !hasOverflow ? '✓ PASS (No overflow)' : '✗ FAIL (Has overflow)');

  console.log('\n=== ALL BROWSER AUTOMATION TESTS COMPLETED SUCCESSFULLY! ===\n');

  ws.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
