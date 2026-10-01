/**
 * src/utils/media.js — Media Utilities
 * Lazy loading, responsive embed handling, video/image helpers
 */

/**
 * Validate and format embed URL (YouTube, Vimeo, etc.)
 * @param {string} url 
 * @returns {string|null}
 */
function getEmbedUrl(url) {
  if (!url) return null;
  // Convert standard YouTube watch URLs to embed URLs if needed
  if (url.includes('youtube.com/watch?v=')) {
    var videoId = url.split('watch?v=')[1].split('&')[0];
    return 'https://www.youtube-nocookie.com/embed/' + videoId + '?autoplay=1&rel=0';
  }
  if (url.includes('youtu.be/')) {
    var id = url.split('youtu.be/')[1].split('?')[0];
    return 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0';
  }
  if (url.includes('vimeo.com/') && !url.includes('player.vimeo.com')) {
    var vimeoId = url.split('vimeo.com/')[1].split('?')[0];
    return 'https://player.vimeo.com/video/' + vimeoId + '?autoplay=1';
  }
  return url;
}

/**
 * Create a responsive video iframe with proper security attributes
 * @param {string} src 
 * @param {string} title 
 * @returns {HTMLIFrameElement}
 */
function createVideoIframe(src, title) {
  var iframe = document.createElement('iframe');
  iframe.src = getEmbedUrl(src);
  iframe.title = title || 'Video player';
  iframe.frameBorder = '0';
  iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  iframe.allowFullscreen = true;
  iframe.loading = 'lazy';
  iframe.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:none;';
  return iframe;
}
