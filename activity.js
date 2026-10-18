/* blobby.vip active-time heartbeat.
   Counts foreground Blobby usage only. No URLs, searches, or browsing history are sent.
   Stage 14 delays the first heartbeat so the browser UI gets the startup CPU/network first. */
(()=>{
  'use strict';
  const PING_MS=60_000;
  const FIRST_PING_DELAY=15_000;
  let timer=null,firstTimer=null,running=false,busy=false;
  function unlocked(){return document.body?.dataset?.licenseState==='unlocked';}
  function foreground(){return document.visibilityState==='visible';}
  async function ping(){if(busy||!running||!unlocked()||!foreground())return;busy=true;try{if(!window.BlobbyChat?.backend)return;const {supabase}=await window.BlobbyChat.backend();const {error}=await supabase.rpc('blobby_activity_ping');if(error)throw error;}catch(err){console.warn('Blobby activity heartbeat unavailable',err);}finally{busy=false;}}
  function clearTimers(){if(timer){clearInterval(timer);timer=null;}if(firstTimer){clearTimeout(firstTimer);firstTimer=null;}}
  function start(){if(running)return;running=true;clearTimers();firstTimer=setTimeout(()=>{firstTimer=null;ping();if(running)timer=setInterval(ping,PING_MS);},FIRST_PING_DELAY);}
  function stop(){running=false;clearTimers();}
  function sync(){if(unlocked()&&foreground())start();else stop();}
  window.addEventListener('blobby:license-unlocked',sync);window.addEventListener('blobby:license-locked',stop);document.addEventListener('visibilitychange',sync);window.addEventListener('pageshow',sync);window.addEventListener('pagehide',stop);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});else sync();
  window.BlobbyActivity=Object.freeze({ping});
})();
