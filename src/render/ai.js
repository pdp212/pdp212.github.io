/**
 * src/render/ai.js — AI Generative Section Enhancements
 * Interactive code copy, Manim snippet handling, pillar enhancements
 */

function renderAI() {
  var codeBlock = document.querySelector('.ai-code-block');
  if (!codeBlock) return;

  var header = codeBlock.querySelector('.code-header');
  if (header && !header.querySelector('.code-copy-btn')) {
    var copyBtn = document.createElement('button');
    copyBtn.className = 'code-copy-btn';
    copyBtn.setAttribute('aria-label', 'Copy code to clipboard');
    copyBtn.innerHTML = '<span>Copy</span>';
    copyBtn.style.cssText = [
      'margin-left:auto',
      'background:none',
      'border:1px solid rgba(255,255,255,0.15)',
      'color:var(--secondary)',
      'font-family:var(--font-mono)',
      'font-size:0.6rem',
      'letter-spacing:0.05em',
      'padding:2px 8px',
      'cursor:pointer',
      'border-radius:0',
      'transition:all 0.2s ease',
    ].join(';');

    copyBtn.addEventListener('click', function () {
      var code = codeBlock.querySelector('code');
      if (code) {
        var text = code.innerText || code.textContent;
        navigator.clipboard.writeText(text).then(function () {
          copyBtn.innerHTML = '<span style="color:#C5A880">Copied!</span>';
          setTimeout(function () {
            copyBtn.innerHTML = '<span>Copy</span>';
          }, 2000);
        }).catch(function () {
          copyBtn.innerHTML = '<span>Failed</span>';
        });
      }
    });

    header.appendChild(copyBtn);
  }
}
