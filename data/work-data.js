/**
 * data/work-data.js — Production Data Layer for WORK Cinema
 *
 * Implements Cloudflare R2 Manifest ingestion with transparent R2 fallback:
 * - Fetches manifest JSON from public endpoint (Cloudflare R2 or Worker)
 * - Schema conforming to:
 *     {
 *       key: "WED_PHUNGTUONG.mp4",
 *       url: "https://<public-domain>/WED_PHUNGTUONG.mp4",
 *       tag: "WED",
 *       name: "PHUNGTUONG"
 *     }
 * - If tag/name are missing, automatically parses from key:
 *     TAG  = characters before first underscore
 *     NAME = remainder before file extension
 * - Zero hardcoded credentials (no access key, secret key, or account ID)
 * - Automatic R2 fallback on network error, CORS, 404, or invalid JSON
 */

(function () {
  'use strict';

  var DEFAULT_MANIFEST_URL = 'https://pub-2cc56f19f7ba4dae92294d5baaa8cfc6.r2.dev/work-manifest.json';
  var PRODUCTION_R2_STREAM_URL = 'https://pub-2cc56f19f7ba4dae92294d5baaa8cfc6.r2.dev/WED_PHUNGTUONG.wed.mp4';

  // R2 Fallback: streams directly from Cloudflare R2 — zero local Git MP4 dependency
  var R2_FALLBACK_VIDEOS = [
    {
      key: 'WED_PHUNGTUONG.wed.mp4',
      url: PRODUCTION_R2_STREAM_URL,
      tag: 'WED',
      name: 'PHUNGTUONG'
    }
  ];

  /**
   * Parse tag and name from filename key according to promt spec:
   * "tách tại dấu _ đầu tiên; phần trước là tag, phần còn lại trước extension là name"
   */
  function parseKey(key) {
    if (!key) return { tag: 'FILM', name: 'UNTITLED' };
    var lastDot = key.lastIndexOf('.');
    var base = lastDot !== -1 ? key.substring(0, lastDot) : key;
    var firstUnderscore = base.indexOf('_');
    if (firstUnderscore === -1) {
      return { tag: 'FILM', name: base };
    }
    return {
      tag: base.substring(0, firstUnderscore),
      name: base.substring(firstUnderscore + 1)
    };
  }

  /**
   * Normalize any raw item to strict schema
   */
  function normalizeItem(raw, index) {
    if (!raw) return null;
    var key = raw.key || ('video-' + (index + 1) + '.mp4');
    var parsed = parseKey(key);
    var tag = raw.tag || parsed.tag || 'FILM';
    var name = raw.name || parsed.name || 'UNTITLED';
    var url = raw.url || ('https://pub-2cc56f19f7ba4dae92294d5baaa8cfc6.r2.dev/' + key);

    return {
      id: 'work-' + (index + 1),
      key: key,
      tag: tag,
      name: name,
      url: url
    };
  }

  // Active state (null during initial load to prevent premature mock render)
  var currentItems = null;
  var currentSource = 'loading'; // 'loading' | 'production_manifest' | 'r2_fallback'
  var currentStatus = 'loading'; // 'loading' | 'loaded' | 'error'
  var listeners = [];
  var initialLoadPromise = null;

  window.__WORK_DATA_SOURCE = currentSource;

  function notifyListeners() {
    listeners.forEach(function (listener) {
      try {
        listener(currentItems, currentSource);
      } catch (e) {
        console.error('[WORK DATA] Listener error:', e);
      }
    });
  }

  /**
   * Load manifest from remote endpoint with graceful fallback
   */
  function loadVideos(customUrl) {
    var targetUrl = customUrl || window.WORK_MANIFEST_URL || DEFAULT_MANIFEST_URL;
    currentStatus = 'loading';

    console.log('[WORK DATA] manifest URL:', targetUrl);

    var promise = fetch(targetUrl, { cache: 'no-cache' })
      .then(function (res) {
        console.log('[WORK DATA] HTTP status:', res.status, res.statusText);
        if (!res.ok) {
          throw new Error('HTTP ' + res.status + ' ' + res.statusText);
        }
        return res.json();
      })
      .then(function (data) {
        if (!Array.isArray(data) || data.length === 0) {
          throw new Error('Manifest payload is empty or not an array');
        }

        var parsed = data.map(normalizeItem).filter(Boolean);
        if (parsed.length === 0) {
          throw new Error('No valid items found in manifest');
        }

        currentItems = parsed;
        currentSource = 'production_manifest';
        currentStatus = 'loaded';

        window.__WORK_DATA_SOURCE = 'production_manifest';
        console.log('[WORK DATA] source:', 'production_manifest');
        console.log('[WORK DATA] videos:', currentItems);
        console.log('[WORK DATA] manifest URL:', targetUrl);
        console.log('[WORK DATA] first video URL:', currentItems[0] ? currentItems[0].url : 'none');
        console.log('[WORK DATA] parsed videos:', parsed);
        console.log('[WORK DATA] final video URLs:', parsed.map(function (v) { return v.url; }));

        // Keep global bridges in sync
        window.WORK_VIDEOS = currentItems;
        window.WORK_MOCK_VIDEOS = currentItems;

        notifyListeners();
        return currentItems;
      })
      .catch(function (err) {
        var reason = err.message || String(err);
        console.error('[WORK DATA] FALLBACK ROOT CAUSE: Manifest load failed from ' + targetUrl + '. Reason:', reason);
        currentItems = R2_FALLBACK_VIDEOS.map(normalizeItem);
        currentSource = 'r2_fallback';
        currentStatus = 'error';

        window.__WORK_DATA_SOURCE = 'r2_fallback';
        window.__WORK_DATA_FALLBACK_REASON = reason;
        console.log('[WORK DATA] source:', 'r2_fallback');
        console.log('[WORK DATA] videos:', currentItems);
        console.log('[WORK DATA] manifest URL:', targetUrl);
        console.log('[WORK DATA] first video URL:', currentItems[0] ? currentItems[0].url : 'none');
        console.log('[WORK DATA] final video URLs:', currentItems.map(function (v) { return v.url; }));

        window.WORK_VIDEOS = currentItems;
        window.WORK_MOCK_VIDEOS = currentItems;

        notifyListeners();
        return currentItems;
      });

    return promise;
  }

  // Public WorkData API
  window.WorkData = {
    loadVideos: loadVideos,
    getVideos: function () {
      return currentItems;
    },
    getMockVideos: function () {
      return R2_FALLBACK_VIDEOS.map(normalizeItem);
    },
    getSource: function () {
      return currentSource;
    },
    getStatus: function () {
      return currentStatus;
    },
    getManifestUrl: function () {
      return window.WORK_MANIFEST_URL || DEFAULT_MANIFEST_URL;
    },
    parseKey: parseKey,
    ready: function () {
      return initialLoadPromise;
    },
    onUpdate: function (cb) {
      if (typeof cb === 'function') {
        listeners.push(cb);
        // Only fire immediately if already settled (not in initial loading)
        if (currentStatus === 'loaded' || currentStatus === 'error') {
          cb(currentItems, currentSource);
        }
      }
    }
  };

  // Compatibility bridges
  window.WORK_VIDEOS = currentItems;
  window.WORK_MOCK_VIDEOS = currentItems;
  window.parseVideoFilename = parseKey;

  // Immediately initiate load on script parse
  initialLoadPromise = loadVideos();
})();
