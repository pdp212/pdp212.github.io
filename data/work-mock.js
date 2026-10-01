/**
 * data/work-mock.js — Legacy Bridge / Mock Data for WORK Cinema
 * Provides local mock data and delegates to WorkData if available.
 */

(function () {
  'use strict';

  function parseVideoFilename(filename) {
    if (!filename) return { tag: 'FILM', name: 'UNTITLED' };
    var base = filename.replace(/\.[^/.]+$/, '');
    var firstUnderscore = base.indexOf('_');
    if (firstUnderscore === -1) {
      return { tag: 'FILM', name: base };
    }
    var tag = base.substring(0, firstUnderscore);
    var name = base.substring(firstUnderscore + 1);
    return { tag: tag, name: name };
  }

  var rawMockFilenames = [
    'WED_PHUNGTUONG.mp4',
    'MOTION_BRAND_FILM.mp4',
    'MV_SUMMER_NIGHT.mp4',
    'DOC_STREET_DN.mp4'
  ];

  var mockVideos = rawMockFilenames.map(function (filename, index) {
    var parsed = parseVideoFilename(filename);
    return {
      id: 'mock-cinema-' + (index + 1),
      key: filename,
      tag: parsed.tag,
      name: parsed.name,
      url: 'assets/videos/projects/' + filename
    };
  });

  if (!window.WorkData) {
    window.WORK_MOCK_VIDEOS = mockVideos;
    window.WORK_VIDEOS = mockVideos;
  }
  window.parseVideoFilename = parseVideoFilename;
})();
