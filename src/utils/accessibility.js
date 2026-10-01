/**
 * src/utils/accessibility.js — Accessibility & Keyboard Utilities
 */

/**
 * Check if the user has requested reduced motion
 * @returns {boolean}
 */
function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Trap focus within a container element
 * @param {HTMLElement} container
 * @param {KeyboardEvent} event
 */
function trapFocus(container, event) {
  if (event.key !== 'Tab') return;
  var focusable = container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (focusable.length === 0) return;
  var first = focusable[0];
  var last = focusable[focusable.length - 1];

  if (event.shiftKey) {
    if (document.activeElement === first) {
      event.preventDefault();
      last.focus();
    }
  } else {
    if (document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
