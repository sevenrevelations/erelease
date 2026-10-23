(()=>{
  'use strict';
  const C=window.BLOBBY_CONFIG||{};
  const ACK_KEY='blobby.globalAnnouncements.acks.v1';
  const SESSION_KEY='blobby.globalAnnouncements.sessionHidden.v1';
  const POLL_MS=120000;
  let timer=0,loading=false,current=null,root=null;

  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}};
  const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{}};
  const safeUrl=v=>{try{const u=new URL(String(v||''),location.href);return u.protocol==='https:'?u.href:''}catch{return''}};
  const configured=()=>/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(String(C.SUPABASE_URL||''))&&String(C.SUPABASE_PUBLISHABLE_KEY||'').length>20;
  const unlocked=()=>document.body?.dataset?.licenseState==='unlocked'||window.BlobbyLicense?.state?.().unlocked===true;

  function ensureRoot(){
    if(root?.isConnected)return root;
    root=document.createElement('div');root.className='bga-root';root.hidden=true;
    root.innerHTML=`<div class="bga-backdrop" data-close="later"></div><section class="bga-card" role="dialog" aria-modal="true" aria-labelledby="bgaTitle"><button class="bga-x" type="button" aria-label="Remind me later">×</button><div class="bga-kicker"></div><h2 id="bgaTitle"></h2><p class="bga-message"></p><div class="bga-version" hidden></div><div class="bga-actions"><a class="bga-link" target="_blank" rel="noopener noreferrer" hidden></a><button class="bga-ack" type="button">Acknowledge</button><button class="bga-later" type="button">Remind me later</button></div></section><section class="bga-banner" role="status"><div><strong></strong><span></span></div><div class="bga-banner-actions"><a target="_blank" rel="noopener noreferrer" hidden></a><button type="button" data-ack>Got it</button><button type="button" data-close="later" aria-label="Remind me later">×</button></div></section>`;
    document.body.append(root);
    root.querySelector('.bga-x').onclick=()=>hideForSession();
    root.querySelector('.bga-later').onclick=()=>hideForSession();
    root.querySelectorAll('[data-close="later"]').forEach(n=>n.addEventListener('click',e=>{if(e.target===n||n.tagName==='BUTTON')hideForSession()}));
    root.querySelector('.bga-ack').onclick=acknowledge;
    root.querySelector('[data-ack]').onclick=acknowledge;
    return root;
  }

  function ackToken(a){return `${a.id}:${a.revision||1}`}
  function isAcked(a){const acks=read(ACK_KEY,{});return !!acks[ackToken(a)]}
  function isHiddenThisSession(a){try{return sessionStorage.getItem(SESSION_KEY)==ackToken(a)}catch{return false}}
  function markSessionHidden(a){try{sessionStorage.setItem(SESSION_KEY,ackToken(a))}catch{}}

  function typeLabel(t){return t==='update'?'Update available':t==='maintenance'?'Maintenance':t==='important'?'Important':'Announcement'}
  function render(a){
    current=a;const r=ensureRoot();
    r.dataset.type=a.announcement_type||'general';
    r.dataset.mode=a.display_mode||'popup';
    r.querySelector('.bga-kicker').textContent=typeLabel(a.announcement_type);
    r.querySelector('#bgaTitle').textContent=a.title||'Blobby announcement';
    r.querySelector('.bga-message').textContent=a.message||'';
    const version=r.querySelector('.bga-version');version.hidden=!a.version_label;version.textContent=a.version_label?`Version ${a.version_label}`:'';
    const url=safeUrl(a.link_url);const label=String(a.link_label||'View details').slice(0,60);
    const link=r.querySelector('.bga-link');link.hidden=!url;link.onclick=url?()=>acknowledge():null;if(url){link.href=url;link.textContent=label;}
    const bstrong=r.querySelector('.bga-banner strong');const bspan=r.querySelector('.bga-banner span');bstrong.textContent=a.title||'Blobby announcement';bspan.textContent=a.message||'';
    const blink=r.querySelector('.bga-banner a');blink.hidden=!url;blink.onclick=url?()=>acknowledge():null;if(url){blink.href=url;blink.textContent=label;}
    r.hidden=false;
    document.documentElement.classList.toggle('bga-modal-open',(a.display_mode||'popup')==='popup');
  }

  function closeUi(){if(root){root.hidden=true;}document.documentElement.classList.remove('bga-modal-open');current=null;}
  function hideForSession(){if(current)markSessionHidden(current);closeUi();}
  function acknowledge(){if(!current)return;const acks=read(ACK_KEY,{});acks[ackToken(current)]=Date.now();const keys=Object.keys(acks).sort((a,b)=>(acks[b]||0)-(acks[a]||0)).slice(0,80);const trimmed={};for(const k of keys)trimmed[k]=acks[k];write(ACK_KEY,trimmed);closeUi();setTimeout(refresh,60);}

  async function fetchActive(){
    if(!configured())return [];
    const base=String(C.SUPABASE_URL).replace(/\/$/,'');
    const url=`${base}/rest/v1/global_announcements?select=id,title,message,announcement_type,display_mode,version_label,link_url,link_label,starts_at,ends_at,revision,created_at,updated_at&active=eq.true&order=created_at.desc&limit=12`;
    const res=await fetch(url,{headers:{apikey:C.SUPABASE_PUBLISHABLE_KEY,'Cache-Control':'no-cache'},cache:'no-store'});
    if(!res.ok)throw Error(`announcement fetch ${res.status}`);
    return await res.json();
  }

  async function refresh(){
    if(loading||!unlocked()||document.hidden)return;
    loading=true;
    try{
      const rows=await fetchActive();const now=Date.now();
      const next=(rows||[]).find(a=>{
        const start=Date.parse(a.starts_at||0),end=a.ends_at?Date.parse(a.ends_at):Infinity;
        return start<=now&&end>now&&!isAcked(a)&&!isHiddenThisSession(a);
      });
      if(next){if(!current||ackToken(current)!==ackToken(next))render(next);}else if(current)closeUi();
    }catch(e){console.debug('[global-announcements]',e?.message||e)}finally{loading=false;}
  }

  function start(){clearInterval(timer);refresh();timer=setInterval(()=>{if(!document.hidden)refresh()},POLL_MS);}
  window.addEventListener('blobby:license-unlocked',start);
  window.addEventListener('blobby:license-locked',()=>{clearInterval(timer);closeUi();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&unlocked())refresh();});
  window.addEventListener('focus',()=>{if(unlocked())refresh();});
  window.BlobbyGlobalAnnouncements={refresh,acknowledgeCurrent:acknowledge};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{if(unlocked())start()},{once:true});else if(unlocked())start();
})();
