/**
 * src/utils/dom.js — DOM Utilities
 */
function el(id) {
  return document.getElementById(id);
}

function parseMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

function svgPlayIcon(size) {
  var s = size || 40;
  var r = s / 2 - 1;
  var cx = s / 2;
  var cy = s / 2;
  return '<svg viewBox="0 0 ' + s + ' ' + s + '" fill="none">'
    + '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" stroke="#F5F5F7" stroke-width="0.8"/>'
    + '<polygon points="' + (cx-4) + ',' + (cy-8) + ' ' + (cx+8) + ',' + cy + ' ' + (cx-4) + ',' + (cy+8) + '" fill="#F5F5F7"/>'
    + '</svg>';
}

function splitTextToSpans(text) {
  if (!text) return '';
  var words = text.split(' ');
  return words.map(function (word) {
    var chars = word.split('').map(function (char) {
      return '<span class="hero-char">' + char + '</span>';
    }).join('');
    return '<span class="hero-word">' + chars + '</span>';
  }).join(' ');
}
