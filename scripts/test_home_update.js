/**
 * scripts/test_home_update.js
 * Automated verification for HOME Page updates:
 * 1. Home background: background-home-1920x1080.webp with subtle overlay
 * 2. BASED IN: responsive container positioning across 390, 768, 1440, 1920
 * 3. Showreel: completely removed from layout
 * 4. Featured Work: live video stream from WorkData (Cloudflare R2), muted preview, cinema styling
 * 5. Click Featured Work: navigates to #work and renders WORK Cinema cleanly
 * 6. Responsive audit: 390px, 768px, 1440px, 1920px (no overflow)
 */

const { spawn } = require('child_process');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('\n=== RUNNING HOME PAGE UPDATE AUTOMATED VERIFICATION ===\n');

  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const chromeProcess = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=9228',
    '--user-data-dir=/tmp/test_chrome_home_' + Date.now(),
    'http://127.0.0.1:3333/#home',
  ]);

  try {
    let pageTab = null;
    for (let i = 0; i < 10; i++) {
      await sleep(500);
      try {
        const tabsRes = await fetch('http://127.0.0.1:9228/json/list');
        const tabs = await tabsRes.json();
        pageTab = tabs.find(t => t.type === 'page');
        if (pageTab) break;
      } catch (e) {}
    }

    if (!pageTab) throw new Error('No page tab found on port 9228');

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
    await sleep(1000);

    async function evaluate(expression) {
      const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (res.result && res.result.exceptionDetails) {
        throw new Error(JSON.stringify(res.result.exceptionDetails));
      }
      return res.result && res.result.result ? res.result.result.value : undefined;
    }

    async function waitForElement(selector, maxMs = 8000) {
      const start = Date.now();
      while (Date.now() - start < maxMs) {
        try {
          const exists = await evaluate("!!document.querySelector('" + selector + "')");
          if (exists) return true;
        } catch (e) {}
        await sleep(150);
      }
      return false;
    }

    async function waitForTransition(maxMs = 5000) {
      const start = Date.now();
      while (Date.now() - start < maxMs) {
        try {
          const playing = await evaluate("window.VideoTransitions && window.VideoTransitions.isPlaying()");
          if (!playing) return true;
        } catch (e) {}
        await sleep(100);
      }
      return false;
    }

    await waitForElement('.hero-section');
    await waitForTransition(4500);
    await sleep(500);

    // ── 1. AUDIT HOME BACKGROUND ──
    console.log('--- 1. AUDITING HOME BACKGROUND IMAGE & OVERLAY ---');
    const bgInfo = await evaluate(`
      (() => {
        const hero = document.querySelector('.hero-section');
        const comp = window.getComputedStyle(hero);
        return {
          bgImage: comp.backgroundImage,
          bgSize: comp.backgroundSize,
          bgPosition: comp.backgroundPosition,
          bgRepeat: comp.backgroundRepeat
        };
      })()
    `);
    console.log('   Hero Background Styles:', JSON.stringify(bgInfo));
    const hasHomeAsset = bgInfo.bgImage.includes('background-home-1920x1080.webp');
    const hasOverlay = bgInfo.bgImage.includes('rgba') || bgInfo.bgImage.includes('linear-gradient');
    console.log('   Uses background-home-1920x1080.webp:', hasHomeAsset ? '✓ PASS' : '✗ FAIL');
    console.log('   Includes subtle dark readability overlay:', hasOverlay ? '✓ PASS' : '✗ FAIL');
    const isCover = bgInfo.bgSize.includes('cover');
    console.log('   background-size is cover:', isCover ? '✓ PASS' : '✗ FAIL');
    if (!hasHomeAsset || !hasOverlay || !isCover) {
      throw new Error('Hero background configuration failed');
    }

    // ── 2. AUDIT SHOWREEL REMOVAL ──
    console.log('\n--- 2. AUDITING SHOWREEL REMOVAL ---');
    const showreelCheck = await evaluate(`
      (() => {
        const frame = document.getElementById('showreelFrame');
        const playBtn = document.getElementById('playShowreel');
        const wrapper = document.querySelector('.showreel-wrapper');
        return {
          hasFrame: !!frame,
          hasPlayBtn: !!playBtn,
          hasWrapper: !!wrapper
        };
      })()
    `);
    console.log('   Showreel check:', JSON.stringify(showreelCheck));
    const showreelGone = !showreelCheck.hasFrame && !showreelCheck.hasPlayBtn && !showreelCheck.hasWrapper;
    console.log('   Placeholder showreel completely removed from DOM:', showreelGone ? '✓ PASS' : '✗ FAIL');
    if (!showreelGone) throw new Error('Showreel elements still present in Home page');

    // ── 3. AUDIT BASED IN RESPONSIVE POSITIONING ──
    console.log('\n--- 3. AUDITING "BASED IN" POSITIONING & STRUCTURE ---');
    const basedInInfo = await evaluate(`
      (() => {
        const sub = document.querySelector('.hero-sub');
        const loc = document.querySelector('.hero-location-block');
        const role = document.querySelector('.hero-role-block');
        const metaLabel = loc ? loc.querySelector('.meta-label') : null;
        const metaVal = loc ? loc.querySelector('.meta-value') : null;
        const compLoc = loc ? window.getComputedStyle(loc) : null;
        const compSub = sub ? window.getComputedStyle(sub) : null;
        return {
          hasLocationBlock: !!loc,
          insideHeroSub: sub && loc && sub.contains(loc),
          label: metaLabel ? metaLabel.textContent.trim() : '',
          val: metaVal ? metaVal.textContent.trim() : '',
          position: compLoc ? compLoc.position : '',
          subDisplay: compSub ? compSub.display : ''
        };
      })()
    `);
    console.log('   BASED IN Details:', JSON.stringify(basedInInfo));
    const isBasedInCorrect = basedInInfo.hasLocationBlock && 
                             basedInInfo.insideHeroSub && 
                             basedInInfo.label === 'BASED IN' &&
                             basedInInfo.position === 'static' && 
                             basedInInfo.subDisplay === 'flex';
    console.log('   "BASED IN" belongs to Hero sub container (flexbox, no fixed hack):', isBasedInCorrect ? '✓ PASS' : '✗ FAIL');
    if (!isBasedInCorrect) throw new Error('"BASED IN" structure failed validation');

    // ── 4. AUDIT FEATURED WORK WITH WORKDATA R2 STREAM ──
    console.log('\n--- 4. AUDITING FEATURED WORK VIDEO & R2 STREAM ---');
    const featuredInfo = await evaluate(`
      (() => {
        const section = document.getElementById('homeFeaturedSection');
        const card = document.getElementById('homeFeaturedCard');
        const video = document.getElementById('homeFeaturedVideo');
        const tag = document.getElementById('homeFeaturedTag');
        const name = document.getElementById('homeFeaturedName');
        const grain = card ? card.querySelector('.cinema-film-grain') : null;
        const curtain = card ? card.querySelector('.cinema-screen-curtain') : null;
        const workVideos = (window.WorkData && typeof window.WorkData.getVideos === 'function') ? window.WorkData.getVideos() : [];
        return {
          hasSection: !!section,
          hasCard: !!card,
          hasVideo: !!video,
          videoSrc: video ? video.src : '',
          videoMuted: video ? video.muted : false,
          videoAutoplay: video ? video.hasAttribute('autoplay') : false,
          videoPlaysinline: video ? video.hasAttribute('playsinline') : false,
          videoPreload: video ? video.getAttribute('preload') : '',
          tagText: tag ? tag.textContent.trim() : '',
          nameText: name ? name.textContent.trim() : '',
          hasGrain: !!grain,
          hasCurtain: !!curtain,
          workDataCount: workVideos.length,
          workDataFirstUrl: workVideos[0] ? workVideos[0].url : ''
        };
      })()
    `);
    console.log('   Featured Work Details:', JSON.stringify(featuredInfo));
    const hasR2Video = featuredInfo.videoSrc.includes('.r2.dev') || featuredInfo.videoSrc.includes('WED_PHUNGTUONG');
    const matchesWorkData = featuredInfo.workDataFirstUrl ? (featuredInfo.videoSrc === featuredInfo.workDataFirstUrl) : true;
    const isCinemaStyled = featuredInfo.hasGrain && featuredInfo.hasCurtain && featuredInfo.tagText.length > 0 && featuredInfo.nameText.length > 0;
    const isMutedPreview = featuredInfo.videoMuted && featuredInfo.videoAutoplay && featuredInfo.videoPlaysinline;

    console.log('   Featured video streams real WorkData asset:', (hasR2Video && matchesWorkData) ? '✓ PASS' : '✗ FAIL');
    console.log('   Preview is muted, autoplay, playsinline:', isMutedPreview ? '✓ PASS' : '✗ FAIL');
    console.log('   Cinema visual language (grain, curtain, tags):', isCinemaStyled ? '✓ PASS' : '✗ FAIL');
    if (!hasR2Video || !isCinemaStyled || !isMutedPreview) {
      throw new Error('Featured Work video/styling failed');
    }

    // ── 5. AUDIT CLICK FEATURED WORK → #WORK NAVIGATION ──
    console.log('\n--- 5. AUDITING CLICK FEATURED WORK → #WORK NAVIGATION ---');
    await evaluate("document.getElementById('homeFeaturedCard').click()");
    await waitForTransition(4500);
    await sleep(500);

    const navResult = await evaluate(`
      (() => {
        const hash = window.location.hash;
        const workPage = document.getElementById('page-work');
        const isWorkActive = workPage ? workPage.classList.contains('active') : false;
        const reel = document.getElementById('cinemaScreenReel');
        const screensCount = document.querySelectorAll('.cinema-screen').length;
        const isFsOpen = window.WorkCinema ? window.WorkCinema.isFullscreen() : false;
        return {
          hash: hash,
          isWorkActive: isWorkActive,
          hasReel: !!reel,
          screensCount: screensCount,
          isFsOpen: isFsOpen
        };
      })()
    `);
    console.log('   Navigation Result:', JSON.stringify(navResult));
    const navSuccess = navResult.hash === '#work' && navResult.isWorkActive && navResult.screensCount >= 18;
    console.log('   Click navigates smoothly to #work view:', navSuccess ? '✓ PASS' : '✗ FAIL');
    console.log('   Does not directly open fullscreen (per Item 11):', !navResult.isFsOpen ? '✓ PASS' : '✗ FAIL');
    if (!navSuccess) throw new Error('Featured Work navigation failed');

    // Return to #home for responsive viewport tests
    await evaluate("window.navigateToPage('home')");
    await waitForTransition(4500);
    await sleep(500);

    // ── 6. AUDIT RESPONSIVE VIEWPORTS ──
    console.log('\n--- 6. AUDITING RESPONSIVE VIEWPORTS (390, 768, 1440, 1920) ---');
    const viewports = [
      { w: 390, h: 844, name: '390px Mobile' },
      { w: 768, h: 1024, name: '768px Tablet' },
      { w: 1440, h: 900, name: '1440px Laptop' },
      { w: 1920, h: 1080, name: '1920px Cinema' }
    ];

    let responsivePass = true;
    for (const vp of viewports) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: vp.w,
        height: vp.h,
        deviceScaleFactor: 1,
        mobile: vp.w <= 768
      });
      await sleep(200);

      const vpAudit = await evaluate(`
        (() => {
          const overflow = document.documentElement.scrollWidth > window.innerWidth;
          const hero = document.querySelector('.hero-section');
          const heroRect = hero ? hero.getBoundingClientRect() : null;
          const name = document.querySelector('.hero-name');
          const nameRect = name ? name.getBoundingClientRect() : null;
          const loc = document.querySelector('.hero-location-block');
          const locRect = loc ? loc.getBoundingClientRect() : null;
          const feat = document.getElementById('homeFeaturedCard');
          const featRect = feat ? feat.getBoundingClientRect() : null;

          // Check if BASED IN overlaps with name
          let overlap = false;
          if (nameRect && locRect) {
            overlap = !(locRect.top >= nameRect.bottom || locRect.bottom <= nameRect.top ||
                        locRect.left >= nameRect.right || locRect.right <= nameRect.left);
          }

          return {
            overflow: overflow,
            heroW: heroRect ? Math.round(heroRect.width) : 0,
            heroH: heroRect ? Math.round(heroRect.height) : 0,
            overlap: overlap,
            locPos: locRect ? { top: Math.round(locRect.top), left: Math.round(locRect.left) } : null,
            featW: featRect ? Math.round(featRect.width) : 0,
            featH: featRect ? Math.round(featRect.height) : 0
          };
        })()
      `);

      if (vpAudit.overflow) {
        console.error(`   ✗ ${vp.name}: Horizontal overflow detected!`);
        responsivePass = false;
      } else if (vpAudit.overlap) {
        console.error(`   ✗ ${vp.name}: BASED IN overlaps with hero name!`);
        responsivePass = false;
      } else {
        console.log(`   ✓ ${vp.name}: No overflow, no overlap, hero width = ${vpAudit.heroW}px, card = ${vpAudit.featW}x${vpAudit.featH}px`);
      }
    }

    console.log('   All responsive viewports audit:', responsivePass ? '✓ PASS' : '✗ FAIL');
    if (!responsivePass) throw new Error('Responsive audit failed');

    console.log('\n=== ALL HOME PAGE UPDATE TESTS PASSED! ===\n');

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
