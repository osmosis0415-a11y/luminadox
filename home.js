'use strict';

function legacyEditorRoute(href) {
  const url = new URL(href);
  const editorOnly = ['doc', 'new', 'version'].some(key => url.searchParams.has(key));
  if (!editorOnly && url.hash !== '#editor') return null;
  return new URL('./docs.html' + url.search + url.hash, url).href;
}

if (typeof module !== 'undefined') module.exports = { legacyEditorRoute };

if (typeof window !== 'undefined') {
  const editor = legacyEditorRoute(location.href);
  if (editor) location.replace(editor);
  if ('serviceWorker' in navigator && window.isSecureContext && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}
