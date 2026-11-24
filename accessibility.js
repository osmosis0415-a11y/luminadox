(function(){
  'use strict';
  let lastFocused = null;
  const labelFrom = el => el.getAttribute('title') || el.textContent.trim().replace(/\s+/g,' ') || el.id.replace(/[-_]/g,' ');
  function enhance(){
    if(!document.querySelector('.skip-link')){
      const skip=document.createElement('a'); skip.className='skip-link'; skip.href='#editor'; skip.textContent='Skip to document editor'; document.body.prepend(skip);
    }
    const editor=document.getElementById('editor');
    if(editor){ editor.setAttribute('role','textbox'); editor.setAttribute('aria-multiline','true'); editor.setAttribute('aria-label','Document editor'); editor.setAttribute('tabindex','0'); }
    document.querySelectorAll('button:not([aria-label])').forEach(el=>{ const label=labelFrom(el); if(label) el.setAttribute('aria-label',label); });
    document.querySelectorAll('input:not([aria-label]),select:not([aria-label]),textarea:not([aria-label])').forEach(el=>{
      if(el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return;
      const label=el.placeholder || el.title || el.id?.replace(/[-_]/g,' '); if(label) el.setAttribute('aria-label',label);
    });
    document.querySelectorAll('[id$="-modal"]').forEach(modal=>{
      modal.setAttribute('role','dialog'); modal.setAttribute('aria-modal','true');
      const heading=modal.querySelector('h1,h2,h3,[class*="font-semibold"]');
      if(heading){ if(!heading.id) heading.id=modal.id+'-title'; modal.setAttribute('aria-labelledby',heading.id); }
    });
    const toast=document.getElementById('toast-container'); if(toast){ toast.setAttribute('role','status'); toast.setAttribute('aria-live','polite'); toast.setAttribute('aria-atomic','false'); }
  }
  document.addEventListener('keydown',e=>{
    const modal=[...document.querySelectorAll('[id$="-modal"]')].find(x=>!x.classList.contains('hidden'));
    if(!modal) return;
    if(e.key==='Escape'){ const close=modal.querySelector('[onclick*="closeModal"]'); close?.click(); lastFocused?.focus(); }
    if(e.key==='Tab'){
      const items=[...modal.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')];
      if(!items.length) return; const first=items[0],last=items[items.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()} else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
    }
  });
  document.addEventListener('click',e=>{ if(e.target.closest('[onclick*="openModal"]')) lastFocused=document.activeElement; });
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',enhance); else enhance();
  new MutationObserver(enhance).observe(document.documentElement,{childList:true,subtree:true});
})();
