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

if (typeof document !== 'undefined') {
  const carousel = document.querySelector('.bento-slides');
  const dots = [...document.querySelectorAll('.bento-pagination button')];
  const slides = [...carousel.children];

  function selectSlide(index) {
    carousel.scrollTo({
      left: carousel.clientWidth * index,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
    });
  }

  dots.forEach((dot, index) => dot.addEventListener('click', () => selectSlide(index)));
  carousel.addEventListener('keydown', event => {
    if (event.target !== carousel) return;
    const current = Math.round(carousel.scrollLeft / carousel.clientWidth);
    const steps = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: slides.length - 1 };
    if (!Object.hasOwn(steps, event.key)) return;
    event.preventDefault();
    selectSlide(Math.max(0, Math.min(slides.length - 1, steps[event.key])));
  });

  carousel.addEventListener('scroll', () => {
    const current = Math.round(carousel.scrollLeft / carousel.clientWidth);
    dots.forEach((dot, index) => {
      if (index === current) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
  }, { passive: true });

  slides.forEach((slide, index) => {
    slide.addEventListener('focusin', () => {
      carousel.scrollTo({ left: carousel.clientWidth * index, behavior: 'instant' });
    });
  });
}
