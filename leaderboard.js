'use strict';
(() => {
  const state={open:false,ready:false,loading:false,supabase:null,profile:null,tab:'weekly',weekly:[],allTime:[],mine:null,avatarUrls:new Map()};
  let ui={};
  const q=(s,r=document)=>r.querySelector(s);
  const el=(t,c='',x)=>{const n=document.createElement(t);if(c)n.className=c;if(x!==undefined)n.textContent=x;return n;};
  const initials=n=>String(n||'?').trim().split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'?';
  function fmt(sec){sec=Math.max(0,Number(sec)||0);const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60);if(h>=1)return `${h}h ${m}m`;return `${m}m`;}
  function appExpand(){try{window.BlobbyAppUI?.expand?.('leaderboard');}catch{}}
  function appRestore(){try{window.BlobbyAppUI?.restore?.();}catch{}}
  function toast(s){const n=el('div','blobby-leaderboard-toast',s);ui.toasts.append(n);setTimeout(()=>n.remove(),2400);}

  function createUI(){
    const root=el('div','blobby-leaderboard-root');root.id='blobbyLeaderboardRoot';root.dataset.open='false';
    root.innerHTML=`<div class="blobby-leaderboard-backdrop"></div><section class="blobby-leaderboard-shell" aria-label="Leaderboard" aria-hidden="true">
      <header class="blobby-leaderboard-head"><div><span>ACTIVE TIME</span><h2>Leaderboard</h2><p>Ranked by active time on Blobby.</p></div><button class="blobby-leaderboard-close" type="button" aria-label="Close Leaderboard">×</button></header>
      <div class="blobby-leaderboard-tabs"><button data-tab="weekly" class="active" type="button">This Week</button><button data-tab="allTime" type="button">All Time</button></div>
      <main class="blobby-leaderboard-body"><div class="blobby-leaderboard-list"></div>
        <aside class="blobby-leaderboard-me"><span>YOUR STATS</span><div class="blobby-leaderboard-me-grid"><div><small>Weekly rank</small><strong class="my-week-rank">—</strong><em class="my-week-time">0m</em></div><div><small>All-time rank</small><strong class="my-all-rank">—</strong><em class="my-all-time">0m</em></div></div>
        <label class="blobby-leaderboard-toggle"><span><strong>Show me on Leaderboard</strong><small>Your time is still counted privately when this is off.</small></span><input type="checkbox"><i></i></label></aside>
      </main><div class="blobby-leaderboard-toast-stack"></div></section>`;
    document.body.append(root);ui={root,shell:q('.blobby-leaderboard-shell',root),close:q('.blobby-leaderboard-close',root),backdrop:q('.blobby-leaderboard-backdrop',root),tabs:[...root.querySelectorAll('[data-tab]')],list:q('.blobby-leaderboard-list',root),weekRank:q('.my-week-rank',root),weekTime:q('.my-week-time',root),allRank:q('.my-all-rank',root),allTime:q('.my-all-time',root),toggle:q('.blobby-leaderboard-toggle input',root),toasts:q('.blobby-leaderboard-toast-stack',root)};
    ui.close.onclick=close;ui.backdrop.onclick=close;ui.tabs.forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;render();});ui.toggle.onchange=saveVisibility;
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.open)close();});window.addEventListener('blobby:license-locked',disconnect);
  }
  async function identity(){if(state.ready&&state.supabase&&state.profile)return;if(!window.BlobbyChat?.backend)throw Error('Blobby identity is unavailable.');const b=await window.BlobbyChat.backend();state.supabase=b.supabase;state.profile=b.profile;state.ready=true;}
  async function avatar(path){if(!path)return'';if(state.avatarUrls.has(path))return state.avatarUrls.get(path);try{const {data,error}=await state.supabase.storage.from('chat-avatars').createSignedUrl(path,3600);if(error)return'';state.avatarUrls.set(path,data.signedUrl);return data.signedUrl;}catch{return'';}}
  async function load(){if(state.loading)return;state.loading=true;ui.list.replaceChildren(el('div','blobby-leaderboard-loading','Loading leaderboard…'));try{await identity();const [w,a,m]=await Promise.all([state.supabase.rpc('blobby_leaderboard_weekly'),state.supabase.rpc('blobby_leaderboard_all_time'),state.supabase.rpc('blobby_my_activity_rank')]);if(w.error)throw w.error;if(a.error)throw a.error;if(m.error)throw m.error;state.weekly=w.data||[];state.allTime=a.data||[];state.mine=m.data?.[0]||null;render();}catch(e){console.warn(e);ui.list.replaceChildren(el('div','blobby-leaderboard-empty','Could not load the leaderboard.'));}finally{state.loading=false;}}
  function render(){ui.tabs.forEach(b=>b.classList.toggle('active',b.dataset.tab===state.tab));const rows=state.tab==='weekly'?state.weekly:state.allTime;ui.list.replaceChildren();if(!rows.length)ui.list.append(el('div','blobby-leaderboard-empty','No active-time rankings yet.'));else rows.forEach((r,i)=>renderRow(r,i));const m=state.mine;ui.weekRank.textContent=m?.weekly_rank?`#${m.weekly_rank}`:'—';ui.weekTime.textContent=fmt(m?.weekly_seconds);ui.allRank.textContent=m?.all_time_rank?`#${m.all_time_rank}`:'—';ui.allTime.textContent=fmt(m?.all_time_seconds);ui.toggle.checked=m?.show_on_leaderboard!==false;}
  function renderRow(r,i){const row=el('article','blobby-leaderboard-row');row.dataset.place=String(i+1);const rank=el('strong','blobby-leaderboard-rank',`#${r.rank||i+1}`),av=el('span','blobby-leaderboard-avatar',initials(r.display_name)),copy=el('div','blobby-leaderboard-person'),name=el('strong','',r.display_name||'Blobby user'),meta=el('span','',r.role==='owner'?'Owner':'Blobby user'),time=el('strong','blobby-leaderboard-time',fmt(r.active_seconds));copy.append(name,meta);row.append(rank,av,copy,time);ui.list.append(row);if(r.role==='owner')name.append(el('b','blobby-leaderboard-owner','OWNER'));if(r.avatar_path)avatar(r.avatar_path).then(url=>{if(!url||!row.isConnected)return;av.textContent='';const img=new Image();img.alt='';img.src=url;av.append(img);});}
  async function saveVisibility(){const value=ui.toggle.checked;ui.toggle.disabled=true;try{const {error}=await state.supabase.rpc('blobby_set_leaderboard_visibility',{p_visible:value});if(error)throw error;if(state.mine)state.mine.show_on_leaderboard=value;await load();toast(value?'You are visible on the Leaderboard.':'You are hidden from the Leaderboard.');}catch(e){ui.toggle.checked=!value;toast('Could not update that setting.');}finally{ui.toggle.disabled=false;}}
  async function open(){if(document.body.dataset.licenseState!=='unlocked')return;if(window.BlobbyChat?.state?.().open)window.BlobbyChat.close();if(window.BlobbyDM?.state?.().open)window.BlobbyDM.close();if(window.BlobbyGroup?.state?.().open)window.BlobbyGroup.close();state.open=true;ui.root.dataset.open='true';ui.shell.setAttribute('aria-hidden','false');document.documentElement.dataset.leaderboardOpen='true';appExpand();await load();}
  function close(){if(!state.open)return;state.open=false;ui.root.dataset.open='false';ui.shell.setAttribute('aria-hidden','true');delete document.documentElement.dataset.leaderboardOpen;appRestore();}
  function disconnect(){state.ready=false;state.supabase=null;state.profile=null;state.weekly=[];state.allTime=[];state.mine=null;if(state.open)close();}
  function boot(){createUI();}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.BlobbyLeaderboard=Object.freeze({open,close,toggle:()=>state.open?close():open(),refresh:load,state:()=>({open:state.open,ready:state.ready,tab:state.tab})});
})();
