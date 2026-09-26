'use strict';
(() => {
  const state={open:false,queue:[],index:-1,shuffle:false,repeat:'off',source:'local'};
  let ui={},audio;
  const el=(t,c='',x)=>{const n=document.createElement(t);if(c)n.className=c;if(x!==undefined)n.textContent=x;return n;};
  const fmt=s=>{s=Math.max(0,Math.floor(Number(s)||0));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;};
  const title=f=>f.name.replace(/\.[^.]+$/,'');
  function appExpand(){try{window.BlobbyAppUI?.expand?.('music');}catch{}}
  function appRestore(){try{window.BlobbyAppUI?.restore?.();}catch{}}
  function save(){localStorage.setItem('blobby.music.prefs',JSON.stringify({volume:audio.volume,shuffle:state.shuffle,repeat:state.repeat,source:state.source}));}
  function loadPrefs(){
    try{
      const p=JSON.parse(localStorage.getItem('blobby.music.prefs')||'{}');
      audio.volume=Number.isFinite(+p.volume)?Math.min(1,Math.max(0,+p.volume)):.8;
      state.shuffle=!!p.shuffle;
      state.repeat=['off','all','one'].includes(p.repeat)?p.repeat:'off';
      state.source=p.source==='spotify'?'spotify':'local';
    }catch{audio.volume=.8;}
  }
  function normalizeSpotify(value){
    value=String(value||'').trim();
    if(!value)return '';
    if(value.startsWith('spotify:')){
      const p=value.split(':');
      const allowed=new Set(['track','album','playlist','artist','show','episode']);
      if(p.length>=3&&allowed.has(p[1])&&/^[A-Za-z0-9]+$/.test(p[2]))return `https://open.spotify.com/${p[1]}/${p[2]}`;
      return '';
    }
    try{
      const u=new URL(value);
      if(u.hostname==='spotify.com')u.hostname='open.spotify.com';
      if(u.hostname!=='open.spotify.com'&&!u.hostname.endsWith('.spotify.com'))return '';
      return `https://open.spotify.com${u.pathname}${u.search}`;
    }catch{return '';}
  }
  function spotifyTarget(value){
    const raw=String(value||'').trim();
    if(!raw)return 'https://open.spotify.com/';
    const link=normalizeSpotify(raw);
    if(link)return link;
    return `https://open.spotify.com/search/${encodeURIComponent(raw)}`;
  }
  function setSpotifyStatus(text,error=false){
    if(!ui.spotifyStatus)return;
    ui.spotifyStatus.textContent=text||'';
    ui.spotifyStatus.classList.toggle('error',!!error);
  }
  function openExternal(url){
    if(!url)return;
    if(!audio.paused)audio.pause();
    setSpotifyStatus('Opening Spotify…');
    try{
      if(window.AppInventor&&typeof window.AppInventor.setWebViewString==='function'){
        window.AppInventor.setWebViewString(`OPEN_EXTERNAL|${url}`);
        return;
      }
    }catch{}
    try{
      const w=window.open(url,'_blank','noopener,noreferrer');
      if(!w)location.href=url;
    }catch{
      location.href=url;
    }
  }
  function build(){
    audio=new Audio();audio.preload='metadata';loadPrefs();
    const root=el('div','blobby-music-root');root.id='blobbyMusicRoot';root.dataset.open='false';
    root.innerHTML=`<div class="blobby-music-backdrop"></div><section class="blobby-music-shell" aria-hidden="true" aria-label="Blobby Music"><header class="blobby-music-head"><div><span>MUSIC</span><h2>Blobby Music</h2><p>Play local audio or hand music off to the real Spotify app.</p></div><button class="blobby-music-close" type="button" aria-label="Close Music">×</button></header><div class="blobby-music-source-tabs" role="tablist" aria-label="Music source"><button type="button" data-source="local" role="tab">Local</button><button type="button" data-source="spotify" role="tab">Spotify</button></div><main class="blobby-music-body" data-source-panel="local"><section class="blobby-music-library"><div class="blobby-music-section-head"><div><small>LOCAL LIBRARY</small><h3>Your queue</h3></div><button class="blobby-music-add" type="button">+ Add music</button></div><input class="blobby-music-picker" type="file" accept="audio/*" multiple hidden><div class="blobby-music-list"></div></section><aside class="blobby-music-player"><div class="blobby-music-art">♫</div><small>NOW PLAYING</small><h3 class="blobby-music-title">Nothing playing</h3><p class="blobby-music-file">Add audio files to begin.</p><div class="blobby-music-progress"><span class="blobby-music-current">0:00</span><input class="blobby-music-seek" type="range" min="0" max="1000" value="0"><span class="blobby-music-duration">0:00</span></div><div class="blobby-music-controls"><button data-act="shuffle" type="button" title="Shuffle">⤨</button><button data-act="prev" type="button" title="Previous">‹</button><button data-act="play" class="primary" type="button" title="Play">▶</button><button data-act="next" type="button" title="Next">›</button><button data-act="repeat" type="button" title="Repeat">↻</button></div><label class="blobby-music-volume"><span>Volume</span><input type="range" min="0" max="100" value="80"></label><p class="blobby-music-note">Local files stay available for this Blobby session. After a full browser/app restart, choose them again.</p></aside></main><main class="blobby-music-spotify" data-source-panel="spotify" hidden><section class="blobby-spotify-launcher"><div class="blobby-spotify-mark">♪</div><small>SPOTIFY</small><h3>Listen in Spotify</h3><p class="blobby-spotify-copy">Blobby can send music directly to the real Spotify app or your device's browser. Spotify handles login and playback outside the Blobby WebViewer.</p><button class="blobby-spotify-home" type="button">Open Spotify</button><div class="blobby-spotify-divider"><span>OR</span></div><label class="blobby-spotify-label" for="blobbySpotifyInput">Paste a Spotify link or search</label><div class="blobby-spotify-input-row"><input id="blobbySpotifyInput" class="blobby-spotify-input" type="text" autocomplete="off" spellcheck="false" placeholder="Song, artist, playlist, or open.spotify.com link"><button class="blobby-spotify-open" type="button">Open in Spotify</button></div><p class="blobby-spotify-status" role="status" aria-live="polite"></p><div class="blobby-spotify-examples"><button type="button" data-search="Liked Songs">Liked Songs</button><button type="button" data-search="Discover Weekly">Discover Weekly</button><button type="button" data-search="Release Radar">Release Radar</button></div><p class="blobby-music-note">No Spotify audio is proxied, downloaded, or played inside Blobby. This avoids the WebViewer DRM limitation.</p></section></main></section>`;
    const mini=el('div','blobby-music-mini');mini.hidden=true;mini.innerHTML=`<button class="blobby-music-mini-open" type="button"><span>♫</span><span><small>NOW PLAYING</small><strong>Nothing playing</strong></span></button><button class="blobby-music-mini-play" type="button" aria-label="Play">▶</button><button class="blobby-music-mini-next" type="button" aria-label="Next">›</button>`;
    document.body.append(root,mini);
    ui={
      root,shell:root.querySelector('.blobby-music-shell'),backdrop:root.querySelector('.blobby-music-backdrop'),
      close:root.querySelector('.blobby-music-close'),picker:root.querySelector('.blobby-music-picker'),
      add:root.querySelector('.blobby-music-add'),list:root.querySelector('.blobby-music-list'),
      title:root.querySelector('.blobby-music-title'),file:root.querySelector('.blobby-music-file'),
      seek:root.querySelector('.blobby-music-seek'),current:root.querySelector('.blobby-music-current'),
      duration:root.querySelector('.blobby-music-duration'),volume:root.querySelector('.blobby-music-volume input'),
      play:root.querySelector('[data-act="play"]'),shuffle:root.querySelector('[data-act="shuffle"]'),
      repeat:root.querySelector('[data-act="repeat"]'),mini,miniTitle:mini.querySelector('strong'),
      miniPlay:mini.querySelector('.blobby-music-mini-play'),sourceTabs:[...root.querySelectorAll('[data-source]')],
      localPanel:root.querySelector('[data-source-panel="local"]'),spotifyPanel:root.querySelector('[data-source-panel="spotify"]'),
      spotifyHome:root.querySelector('.blobby-spotify-home'),spotifyInput:root.querySelector('.blobby-spotify-input'),
      spotifyOpen:root.querySelector('.blobby-spotify-open'),spotifyStatus:root.querySelector('.blobby-spotify-status')
    };
    ui.volume.value=Math.round(audio.volume*100);
    ui.close.onclick=close;ui.backdrop.onclick=close;ui.add.onclick=()=>ui.picker.click();
    ui.picker.onchange=e=>addFiles([...e.target.files]);
    root.querySelector('[data-act="prev"]').onclick=prev;root.querySelector('[data-act="next"]').onclick=next;
    ui.play.onclick=toggle;ui.shuffle.onclick=()=>{state.shuffle=!state.shuffle;save();renderControls();};
    ui.repeat.onclick=()=>{state.repeat=state.repeat==='off'?'all':state.repeat==='all'?'one':'off';save();renderControls();};
    ui.volume.oninput=()=>{audio.volume=+ui.volume.value/100;save();};
    ui.seek.oninput=()=>{if(Number.isFinite(audio.duration))audio.currentTime=(+ui.seek.value/1000)*audio.duration;};
    mini.querySelector('.blobby-music-mini-open').onclick=open;mini.querySelector('.blobby-music-mini-play').onclick=toggle;mini.querySelector('.blobby-music-mini-next').onclick=next;
    ui.sourceTabs.forEach(b=>b.onclick=()=>setSource(b.dataset.source));
    ui.spotifyHome.onclick=()=>openExternal('https://open.spotify.com/');
    ui.spotifyOpen.onclick=()=>openSpotifyInput();
    ui.spotifyInput.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();openSpotifyInput();}};
    root.querySelectorAll('[data-search]').forEach(b=>b.onclick=()=>{ui.spotifyInput.value=b.dataset.search||'';openSpotifyInput();});
    audio.ontimeupdate=progress;audio.onloadedmetadata=progress;audio.onplay=renderControls;audio.onpause=renderControls;audio.onended=ended;
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.open)close();});
    window.addEventListener('blobby:license-locked',()=>{audio.pause();close();});
    setSource(state.source,false);render();
  }
  function openSpotifyInput(){
    const raw=ui.spotifyInput.value.trim();
    if(!raw){setSpotifyStatus('Type a song, artist, playlist, or paste a Spotify link.',true);ui.spotifyInput.focus();return;}
    setSpotifyStatus('');
    openExternal(spotifyTarget(raw));
  }
  function setSource(source,persist=true){
    state.source=source==='spotify'?'spotify':'local';
    ui.sourceTabs.forEach(b=>{const active=b.dataset.source===state.source;b.classList.toggle('active',active);b.setAttribute('aria-selected',active?'true':'false');});
    ui.localPanel.hidden=state.source!=='local';
    ui.spotifyPanel.hidden=state.source!=='spotify';
    if(state.source==='spotify'&&!audio.paused)audio.pause();
    ui.mini.hidden=state.source!=='local'||state.index<0;
    if(persist)save();
  }
  function addFiles(files){for(const f of files){if(!f.type.startsWith('audio/'))continue;state.queue.push({file:f,url:URL.createObjectURL(f),title:title(f)});}ui.picker.value='';if(state.index<0&&state.queue.length)select(0,false);render();}
  function select(i,autoplay=true){if(!state.queue.length)return;i=(i+state.queue.length)%state.queue.length;state.index=i;audio.src=state.queue[i].url;audio.load();render();if(autoplay)audio.play().catch(()=>{});}
  function toggle(){if(state.index<0){if(state.queue.length)select(0,true);return;}if(audio.paused)audio.play().catch(()=>{});else audio.pause();}
  function next(){if(!state.queue.length)return;if(state.shuffle&&state.queue.length>1){let i;do{i=Math.floor(Math.random()*state.queue.length);}while(i===state.index);select(i,true);}else if(state.index<state.queue.length-1)select(state.index+1,true);else if(state.repeat==='all')select(0,true);}
  function prev(){if(!state.queue.length)return;if(audio.currentTime>3){audio.currentTime=0;return;}select(state.index-1,true);}
  function ended(){if(state.repeat==='one'){audio.currentTime=0;audio.play().catch(()=>{});}else next();}
  function remove(i){const was=i===state.index,item=state.queue[i];if(!item)return;if(was)audio.pause();URL.revokeObjectURL(item.url);state.queue.splice(i,1);if(!state.queue.length){state.index=-1;audio.removeAttribute('src');audio.load();}else if(was)select(Math.min(i,state.queue.length-1),false);else if(i<state.index)state.index--;render();}
  function progress(){ui.current.textContent=fmt(audio.currentTime);ui.duration.textContent=fmt(audio.duration);ui.seek.value=Number.isFinite(audio.duration)&&audio.duration?Math.round(audio.currentTime/audio.duration*1000):0;}
  function renderControls(){const playing=!audio.paused&&state.index>=0;ui.play.textContent=playing?'❚❚':'▶';ui.miniPlay.textContent=playing?'❚❚':'▶';ui.shuffle.classList.toggle('active',state.shuffle);ui.repeat.classList.toggle('active',state.repeat!=='off');ui.repeat.title=`Repeat: ${state.repeat}`;ui.repeat.textContent=state.repeat==='one'?'↻¹':'↻';}
  function render(){const cur=state.queue[state.index];ui.title.textContent=cur?.title||'Nothing playing';ui.file.textContent=cur?.file?.name||'Add audio files to begin.';ui.miniTitle.textContent=cur?.title||'Nothing playing';ui.mini.hidden=!cur||state.source!=='local';ui.list.replaceChildren();if(!state.queue.length)ui.list.append(el('div','blobby-music-empty','No music added yet. Choose audio files from this device.'));state.queue.forEach((t,i)=>{const r=el('div','blobby-music-track');if(i===state.index)r.classList.add('active');const play=el('button','blobby-music-track-play',i===state.index&&!audio.paused?'❚❚':'▶');play.type='button';play.onclick=()=>i===state.index?toggle():select(i,true);const copy=el('button','blobby-music-track-copy');copy.type='button';copy.innerHTML=`<strong></strong><small></small>`;copy.querySelector('strong').textContent=t.title;copy.querySelector('small').textContent=t.file.name;copy.onclick=()=>select(i,true);const del=el('button','blobby-music-remove','×');del.type='button';del.title='Remove from queue';del.onclick=()=>remove(i);r.append(play,copy,del);ui.list.append(r);});renderControls();progress();}
  function open(){if(document.body.dataset.licenseState!=='unlocked')return;if(window.BlobbyChat?.state?.().open)window.BlobbyChat.close();if(window.BlobbyDM?.state?.().open)window.BlobbyDM.close();if(window.BlobbyGroup?.state?.().open)window.BlobbyGroup.close();if(window.BlobbyLeaderboard?.state?.().open)window.BlobbyLeaderboard.close();window.BlobbyPanels?.close();state.open=true;ui.root.dataset.open='true';ui.shell.setAttribute('aria-hidden','false');document.documentElement.dataset.musicOpen='true';appExpand();}
  function close(){if(!state.open)return;state.open=false;ui.root.dataset.open='false';ui.shell.setAttribute('aria-hidden','true');delete document.documentElement.dataset.musicOpen;appRestore();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',build,{once:true});else build();
  window.BlobbyMusic=Object.freeze({open,close,toggle:()=>state.open?close():open(),state:()=>({open:state.open,playing:!!audio&&!audio.paused,index:state.index,count:state.queue.length,source:state.source})});
})();
