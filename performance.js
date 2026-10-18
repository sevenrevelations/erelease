'use strict';
(() => {
  const root=document.documentElement;
  const mem=Number(navigator.deviceMemory||0);
  const cores=Number(navigator.hardwareConcurrency||0);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lowEnd=(mem>0&&mem<=4)||(cores>0&&cores<=4);

  root.dataset.lowEnd=String(lowEnd);
  if(reduced)root.dataset.reducedSystem='true';

  // One shared signal other modules can use to avoid work while hidden.
  const dispatch=()=>window.dispatchEvent(new CustomEvent('blobby:visibility',{detail:{visible:!document.hidden}}));
  document.addEventListener('visibilitychange',dispatch,{passive:true});

  window.BlobbyPerformance=Object.freeze({
    lowEnd:()=>root.dataset.lowEnd==='true',
    reduced:()=>root.dataset.reducedSystem==='true'||root.dataset.reduced==='true',
    performanceMode:()=>root.dataset.performance==='true',
    shouldSimplify:()=>root.dataset.performance==='true'||root.dataset.lowEnd==='true'||root.dataset.reducedSystem==='true'
  });
})();
