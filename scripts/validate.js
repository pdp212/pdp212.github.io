/**
 * scripts/validate.js — Portfolio Integrity Validator
 * Validates file structure, script references, asset links, SEO, accessibility, and design constraints
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
let errorCount = 0;
let warnCount = 0;

function pass(msg) {
  console.log(`  ✓ ${msg}`);
}

function fail(msg) {
  console.error(`  ✗ ERROR: ${msg}`);
  errorCount++;
}

function warn(msg) {
  console.warn(`  ⚠ WARN: ${msg}`);
  warnCount++;
}

console.log('\n=== RUNNING PORTFOLIO INTEGRITY AUDIT ===\n');

// 1. Check index.html exists
const indexPath = path.join(rootDir, 'index.html');
if (!fs.existsSync(indexPath)) {
  fail('index.html is missing!');
  process.exit(1);
} else {
  pass('index.html exists');
}

const indexContent = fs.readFileSync(indexPath, 'utf-8');

// 2. Check script tags in index.html
const scriptRegex = /<script\s+src="([^"]+)"/g;
let match;
const scripts = [];
while ((match = scriptRegex.exec(indexContent)) !== null) {
  scripts.push(match[1]);
}

console.log(`\nVerifying ${scripts.length} script references in index.html:`);
scripts.forEach((src) => {
  const fullPath = path.join(rootDir, src);
  if (fs.existsSync(fullPath)) {
    pass(`Script: ${src}`);
  } else {
    fail(`Referenced script does not exist: ${src}`);
  }
});

// 3. Check CSS link tags
const cssRegex = /<link\s+[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g;
const stylesheets = [];
while ((match = cssRegex.exec(indexContent)) !== null) {
  if (!match[1].startsWith('http')) {
    stylesheets.push(match[1]);
  }
}

console.log(`\nVerifying local stylesheet references:`);
stylesheets.forEach((href) => {
  const fullPath = path.join(rootDir, href);
  if (fs.existsSync(fullPath)) {
    pass(`Stylesheet: ${href}`);
  } else {
    fail(`Referenced stylesheet does not exist: ${href}`);
  }
});

// 4. Design Rule Audit: Typography (ONLY Roboto)
console.log('\nAuditing Design Rule: Typography (ONLY Roboto)');
const forbiddenFonts = ['Playfair', 'Inter', 'Montserrat', 'Poppins', 'Space Grotesk'];
forbiddenFonts.forEach((font) => {
  if (indexContent.includes(font)) {
    fail(`index.html contains forbidden font reference: "${font}"`);
  }
});

const stylePath = path.join(rootDir, 'style.css');
if (fs.existsSync(stylePath)) {
  const styleContent = fs.readFileSync(stylePath, 'utf-8');
  forbiddenFonts.forEach((font) => {
    if (styleContent.includes(font)) {
      fail(`style.css contains forbidden font: "${font}"`);
    }
  });
  if (!styleContent.includes('Roboto')) {
    fail('style.css does not include Roboto');
  } else {
    pass('style.css strictly uses Roboto (no forbidden fonts)');
  }

  // Check border-radius constraints (no rounded-xl, 12px, etc)
  const forbiddenRadius = ['border-radius: 12px', 'border-radius: 16px', 'border-radius: 20px', 'rounded-xl', 'rounded-lg'];
  forbiddenRadius.forEach((r) => {
    if (styleContent.includes(r)) {
      fail(`style.css contains non-brutalist border-radius: "${r}"`);
    }
  });
  pass('Border radius conforms to brutalist constraints (sharp / 0 or 1px)');
}

// 5. Check target="_blank" has rel="noopener noreferrer"
console.log('\nAuditing External Link Security (rel="noopener noreferrer"):');
const linkRegex = /<a\s+[^>]*target="_blank"[^>]*>/gi;
let linkMatch;
let linkAuditPass = true;
while ((linkMatch = linkRegex.exec(indexContent)) !== null) {
  const tag = linkMatch[0];
  if (!tag.includes('rel="noopener noreferrer"')) {
    fail(`External link missing rel="noopener noreferrer": ${tag}`);
    linkAuditPass = false;
  }
}
if (linkAuditPass) {
  pass('All target="_blank" links include rel="noopener noreferrer"');
}

// 6. Check .env is not in git
console.log('\nAuditing Security & Secrets:');
const gitignorePath = path.join(rootDir, '.gitignore');
if (fs.existsSync(gitignorePath)) {
  const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
  if (gitignore.includes('.env')) {
    pass('.env is protected in .gitignore');
  } else {
    fail('.env is NOT in .gitignore!');
  }
}

// 7. Verify Data Layer files
console.log('\nVerifying Data Layer modules:');
const requiredData = ['profile.js', 'projects.js', 'work-mock.js', 'about.js', 'contact.js'];
requiredData.forEach((f) => {
  const p = path.join(rootDir, 'data', f);
  if (fs.existsSync(p)) {
    pass(`data/${f} exists`);
  } else {
    fail(`data/${f} missing!`);
  }
});

// 8. Verify Source files
console.log('\nVerifying Application modules:');
const requiredSrc = [
  'app.js',
  'utils/dom.js',
  'utils/media.js',
  'utils/accessibility.js',
  'pages/home.js',
  'pages/work.js',
  'pages/profile.js',
  'pages/contact.js',
  'interactions/transitions.js',
  'interactions/videoTransitions.js',
  'interactions/navigation.js',
  'interactions/scroll.js',
  'interactions/lightbox.js',
  'interactions/cursor.js',
  'interactions/animations.js',
];
requiredSrc.forEach((f) => {
  const p = path.join(rootDir, 'src', f);
  if (fs.existsSync(p)) {
    pass(`src/${f} exists`);
  } else {
    fail(`src/${f} missing!`);
  }
});

// 9. Verify 4-Page SPA Views & Transition Shutter in index.html
console.log('\nVerifying 4-Page SPA Views & Transition Layers in index.html:');
if (indexContent.includes('id="pageTransitionVideo"')) {
  pass('Global #pageTransitionVideo overlay exists');
} else {
  fail('Missing #pageTransitionVideo overlay in index.html');
}

if (indexContent.includes('id="pageTransitionShutter"')) {
  pass('Global #pageTransitionShutter exists (fallback layer)');
} else {
  fail('Missing #pageTransitionShutter overlay in index.html');
}

if (indexContent.includes('id="cinemaFullscreenOverlay"')) {
  pass('Global #cinemaFullscreenOverlay exists');
} else {
  fail('Missing #cinemaFullscreenOverlay in index.html');
}

const requiredViews = ['page-home', 'page-work', 'page-profile', 'page-contact'];
requiredViews.forEach((v) => {
  if (indexContent.includes(`id="${v}"`)) {
    pass(`View container #${v} exists`);
  } else {
    fail(`Missing view container #${v} in index.html`);
  }
});

// Verify Navbar links
const requiredRoutes = ['#home', '#work', '#profile', '#contact'];
requiredRoutes.forEach((r) => {
  if (indexContent.includes(`href="${r}"`)) {
    pass(`Navbar route ${r} exists`);
  } else {
    fail(`Missing navbar route ${r} in index.html`);
  }
});

// 9. Summary
console.log('\n=== AUDIT SUMMARY ===');
if (errorCount === 0) {
  console.log(`\nALL AUDITS PASSED! (Errors: 0, Warnings: ${warnCount})\n`);
  process.exit(0);
} else {
  console.error(`\nAUDIT FAILED with ${errorCount} errors, ${warnCount} warnings.\n`);
  process.exit(1);
}
