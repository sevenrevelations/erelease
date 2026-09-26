'use strict';
(() => {
  const state={open:false,queue:[],index:-1,shuffle:false,repeat:'off',source:'local',spotifyUrl:''};
  let ui={},audio,spotifyController=null,spotifyApiPromise=null,spotifyReady=false,spotifyPaused=true;

  const el=(t,c='',x)=>{const n=document.createElement(t);if(c)n.className=c;if(x!==undefined)n.textContent=x;return n;};
  const fmt=s=>{s=Math.max(0,Math.floor(Number(s)||0));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;};
  const title=f=>f.name.replace(/\.[^.]+$/,'');
  function appExpand(){try{window.BlobbyAppUI?.expand?.('music');}catch{}}
  function appRestore(){try{window.BlobbyAppUI?.restore?.();}catch{}}

  function save(){
    localStorage.setItem('blobby.music.prefs',JSON.stringify({
      volume:audio.volume,shuffle:state.shuffle,repeat:state.repeat,source:state.source
    }));
  }

  function loadPrefs(){
    try{
      const p=JSON.parse(localStorage.getItem('blobby.music.prefs')||'{}');
      audio.volume=Number.isFinite(+p.volume)?Math.min(1,Math.max(0,+p.volume)):.8;
      state.shuffle=!!p.shuffle;
      state.repeat=['off','all','one'].includes(p.repeat)?p.repeat:'off';
      state.source=p.source==='spotify'?'spotify':'local';
      state.spotifyUrl=localStorage.getItem('blobby.music.spotify')||'';
    }catch{audio.volume=.8;}
  }

  function spotifyEntity(raw){
    const value=String(raw||'').trim();
    if(!value)return '';
    const allowed=new Set(['track','album','playlist','artist','show','episode']);
    if(value.startsWith('spotify:')){
      const parts=value.split(':');
      if(parts.length>=3&&allowed.has(parts[1])&&/^[A-Za-z0-9]+$/.test(parts[2])){
        return `https://open.spotify.com/${parts[1]}/${parts[2]}`;
      }
      return '';
    }
    try{
      const u=new URL(value);
      if(u.hostname==='spotify.com')u.hostname='open.spotify.com';
      if(u.hostname!=='open.spotify.com')return '';
      const parts=u.pathname.split('/').filter(Boolean);
      const typeIndex=parts.findIndex(p=>allowed.has(p));
      if(typeIndex<0||!parts[typeIndex+1])return '';
      const type=parts[typeIndex],id=parts[typeIndex+1];
      if(!/^[A-Za-z0-9]+$/.test(id))return '';
      return `https://open.spotify.com/${type}/${id}`;
    }catch{return '';}
  }

  function ensureSpotifyApi(){
    if(window.__blobbySpotifyIframeAPI)return Promise.resolve(window.__blobbySpotifyIframeAPI);
    if(spotifyApiPromise)return spotifyApiPromise;

    spotifyApiPromise=new Promise((resolve,reject)=>{
      const oldReady=window.onSpotifyIframeApiReady;
      let settled=false;
      const done=api=>{
        if(settled)return;
        settled=true;
        window.__blobbySpotifyIframeAPI=api;
        resolve(api);
      };

      window.onSpotifyIframeApiReady=api=>{
        try{if(typeof oldReady==='function')oldReady(api);}catch{}
        done(api);
      };

      let script=document.querySelector('script[data-blobby-spotify-iframe-api]');
      if(!script){
        script=document.createElement('script');
        script.src='https://open.spotify.com/embed/iframe-api/v1';
        script.async=true;
        script.dataset.blobbySpotifyIframeApi='1';
        script.onerror=()=>{if(!settled){settled=true;reject(new Error('Spotify iframe API failed to load.'));}};
        document.head.append(script);
      }

      setTimeout(()=>{
        if(!settled&&!window.__blobbySpotifyIframeAPI){
          settled=true;
          reject(new Error('Spotify iframe API timed out.'));
        }
      },15000);
    }).catch(err=>{
      spotifyApiPromise=null;
      throw err;
    });

    return spotifyApiPromise;
  }

  function build(){
    audio=new Audio();
    audio.preload='metadata';
    loadPrefs();

    const root=el('div','blobby-music-root');
    root.id='blobbyMusicRoot';
    root.dataset.open='false';
    root.innerHTML=`<div class="blobby-music-backdrop"></div>
<section class="blobby-music-shell" aria-hidden="true" aria-label="Blobby Music">
  <header class="blobby-music-head">
    <div><span>MUSIC</span><h2>Blobby Music</h2><p>Play local audio or use Spotify's official embedded player.</p></div>
    <button class="blobby-music-close" type="button" aria-label="Close Music">×</button>
  </header>

  <div class="blobby-music-source-tabs" role="tablist" aria-label="Music source">
    <button type="button" data-source="local" role="tab">Local</button>
    <button type="button" data-source="spotify" role="tab">Spotify</button>
  </div>

  <main class="blobby-music-body" data-source-panel="local">
    <section class="blobby-music-library">
      <div class="blobby-music-section-head">
        <div><small>LOCAL LIBRARY</small><h3>Your queue</h3></div>
        <button class="blobby-music-add" type="button">+ Add music</button>
      </div>
      <input class="blobby-music-picker" type="file" accept="audio/*" multiple hidden>
      <div class="blobby-music-list"></div>
    </section>

    <aside class="blobby-music-player">
      <div class="blobby-music-art">♫</div>
      <small>NOW PLAYING</small>
      <h3 class="blobby-music-title">Nothing playing</h3>
      <p class="blobby-music-file">Add audio files to begin.</p>
      <div class="blobby-music-progress">
        <span class="blobby-music-current">0:00</span>
        <input class="blobby-music-seek" type="range" min="0" max="1000" value="0">
        <span class="blobby-music-duration">0:00</span>
      </div>
      <div class="blobby-music-controls">
        <button data-act="shuffle" type="button" title="Shuffle">⤨</button>
        <button data-act="prev" type="button" title="Previous">‹</button>
        <button data-act="play" class="primary" type="button" title="Play">▶</button>
        <button data-act="next" type="button" title="Next">›</button>
        <button data-act="repeat" type="button" title="Repeat">↻</button>
      </div>
      <label class="blobby-music-volume"><span>Volume</span><input type="range" min="0" max="100" value="80"></label>
      <p class="blobby-music-note">Local files stay available for this Blobby session. After a full browser/app restart, choose them again.</p>
    </aside>
  </main>

  <main class="blobby-music-spotify" data-source-panel="spotify" hidden>
    <section class="blobby-music-spotify-card">
      <div class="blobby-music-section-head"><div><small>SPOTIFY EMBED</small><h3>Play from Spotify</h3></div></div>
      <p class="blobby-music-spotify-copy">Paste a Spotify track, album, playlist, artist, show, or episode link. Blobby loads Spotify's official Embed.</p>
      <div class="blobby-music-spotify-input-row">
        <input class="blobby-music-spotify-input" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://open.spotify.com/playlist/...">
        <button class="blobby-music-spotify-load" type="button">Load</button>
      </div>
      <div class="blobby-music-spotify-error" role="status" aria-live="polite"></div>

      <div class="blobby-music-spotify-frame-wrap">
        <div class="blobby-music-spotify-empty">Paste a Spotify link above to load the player.</div>
      </div>

      <div class="blobby-music-spotify-safe-controls">
        <button class="blobby-music-spotify-play" type="button" disabled>▶ Play / Pause</button>
        <button class="blobby-music-spotify-restart" type="button" disabled>↻ Restart</button>
        <span class="blobby-music-spotify-state">No Spotify player loaded.</span>
      </div>

      <div class="blobby-music-spotify-actions">
        <button class="blobby-music-spotify-clear" type="button">Clear Spotify player</button>
      </div>

      <p class="blobby-music-note">For App Inventor safety, links inside the Spotify Embed are disabled. Use Blobby's controls below the Embed for playback. On this WebViewer, Spotify may provide preview playback because Widevine protected audio is unavailable.</p>
    </section>
  </main>
</section>`;

    const mini=el('div','blobby-music-mini');
    mini.hidden=true;
    mini.innerHTML=`<button class="blobby-music-mini-open" type="button"><span>♫</span><span><small>NOW PLAYING</small><strong>Nothing playing</strong></span></button><button class="blobby-music-mini-play" type="button" aria-label="Play">▶</button><button class="blobby-music-mini-next" type="button" aria-label="Next">›</button>`;

    document.body.append(root,mini);

    ui={
      root,
      shell:root.querySelector('.blobby-music-shell'),
      backdrop:root.querySelector('.blobby-music-backdrop'),
      close:root.querySelector('.blobby-music-close'),
      picker:root.querySelector('.blobby-music-picker'),
      add:root.querySelector('.blobby-music-add'),
      list:root.querySelector('.blobby-music-list'),
      title:root.querySelector('.blobby-music-title'),
      file:root.querySelector('.blobby-music-file'),
      seek:root.querySelector('.blobby-music-seek'),
      current:root.querySelector('.blobby-music-current'),
      duration:root.querySelector('.blobby-music-duration'),
      volume:root.querySelector('.blobby-music-volume input'),
      play:root.querySelector('[data-act="play"]'),
      shuffle:root.querySelector('[data-act="shuffle"]'),
      repeat:root.querySelector('[data-act="repeat"]'),
      mini,
      miniTitle:mini.querySelector('strong'),
      miniPlay:mini.querySelector('.blobby-music-mini-play'),
      sourceTabs:[...root.querySelectorAll('[data-source]')],
      localPanel:root.querySelector('[data-source-panel="local"]'),
      spotifyPanel:root.querySelector('[data-source-panel="spotify"]'),
      spotifyInput:root.querySelector('.blobby-music-spotify-input'),
      spotifyLoad:root.querySelector('.blobby-music-spotify-load'),
      spotifyError:root.querySelector('.blobby-music-spotify-error'),
      spotifyFrameWrap:root.querySelector('.blobby-music-spotify-frame-wrap'),
      spotifyPlay:root.querySelector('.blobby-music-spotify-play'),
      spotifyRestart:root.querySelector('.blobby-music-spotify-restart'),
      spotifyState:root.querySelector('.blobby-music-spotify-state'),
      spotifyClear:root.querySelector('.blobby-music-spotify-clear')
    };

    ui.volume.value=Math.round(audio.volume*100);
    ui.close.onclick=close;
    ui.backdrop.onclick=close;
    ui.add.onclick=()=>ui.picker.click();
    ui.picker.onchange=e=>addFiles([...e.target.files]);

    root.querySelector('[data-act="prev"]').onclick=prev;
    root.querySelector('[data-act="next"]').onclick=next;
    ui.play.onclick=toggle;
    ui.shuffle.onclick=()=>{state.shuffle=!state.shuffle;save();renderControls();};
    ui.repeat.onclick=()=>{state.repeat=state.repeat==='off'?'all':state.repeat==='all'?'one':'off';save();renderControls();};
    ui.volume.oninput=()=>{audio.volume=+ui.volume.value/100;save();};
    ui.seek.oninput=()=>{if(Number.isFinite(audio.duration))audio.currentTime=(+ui.seek.value/1000)*audio.duration;};

    mini.querySelector('.blobby-music-mini-open').onclick=open;
    mini.querySelector('.blobby-music-mini-play').onclick=toggle;
    mini.querySelector('.blobby-music-mini-next').onclick=next;

    ui.sourceTabs.forEach(b=>b.onclick=()=>setSource(b.dataset.source));
    ui.spotifyLoad.onclick=loadSpotifyFromInput;
    ui.spotifyInput.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();loadSpotifyFromInput();}};
    ui.spotifyPlay.onclick=()=>{try{spotifyController?.togglePlay?.();}catch{}};
    ui.spotifyRestart.onclick=()=>{try{spotifyController?.restart?.();}catch{}};
    ui.spotifyClear.onclick=clearSpotify;

    audio.ontimeupdate=progress;
    audio.onloadedmetadata=progress;
    audio.onplay=renderControls;
    audio.onpause=renderControls;
    audio.onended=ended;

    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.open)close();});
    window.addEventListener('blobby:license-locked',()=>{
      audio.pause();
      try{spotifyController?.pause?.();}catch{}
      close();
    });

    setSource(state.source,false);
    render();

    if(state.spotifyUrl){
      ui.spotifyInput.value=state.spotifyUrl;
      loadSpotify(state.spotifyUrl,false);
    }
  }

  function setSpotifyStatus(text,error=false){
    ui.spotifyError.textContent=text||'';
    ui.spotifyError.classList.toggle('error',!!error);
  }

  function renderSpotifyState(){
    if(!ui.spotifyState)return;
    if(!spotifyController){
      ui.spotifyState.textContent='No Spotify player loaded.';
      return;
    }
    if(!spotifyReady){
      ui.spotifyState.textContent='Loading Spotify Embed…';
      return;
    }
    ui.spotifyState.textContent=spotifyPaused?'Spotify Embed ready — paused.':'Spotify Embed playing.';
  }

  function setSource(source,persist=true){
    state.source=source==='spotify'?'spotify':'local';

    ui.sourceTabs.forEach(b=>{
      const active=b.dataset.source===state.source;
      b.classList.toggle('active',active);
      b.setAttribute('aria-selected',active?'true':'false');
    });

    ui.localPanel.hidden=state.source!=='local';
    ui.spotifyPanel.hidden=state.source!=='spotify';

    if(state.source==='spotify'){
      if(!audio.paused)audio.pause();
    }else{
      try{spotifyController?.pause?.();}catch{}
      spotifyPaused=true;
      renderSpotifyState();
    }

    const cur=state.queue[state.index];
    ui.mini.hidden=!cur||state.source!=='local';
    if(persist)save();
  }

  function loadSpotifyFromInput(){
    loadSpotify(ui.spotifyInput.value,true);
  }

  async function loadSpotify(raw,persist=true){
    const entity=spotifyEntity(raw);
    if(!entity){
      setSpotifyStatus('Paste a valid open.spotify.com link or Spotify URI.',true);
      return;
    }

    setSpotifyStatus('Loading Spotify Embed…');
    ui.spotifyPlay.disabled=true;
    ui.spotifyRestart.disabled=true;
    spotifyReady=false;
    spotifyPaused=true;

    if(!audio.paused)audio.pause();

    if(spotifyController){
      try{spotifyController.pause?.();}catch{}
      try{spotifyController.destroy?.();}catch{}
      spotifyController=null;
    }

    const host=el('div','blobby-music-spotify-host');
    ui.spotifyFrameWrap.replaceChildren(host);
    renderSpotifyState();

    try{
      const IFrameAPI=await ensureSpotifyApi();

      IFrameAPI.createController(
        host,
        {width:'100%',height:352,url:entity},
        controller=>{
          spotifyController=controller;
          spotifyReady=true;
          spotifyPaused=true;

          controller.addListener?.('ready',()=>{
            spotifyReady=true;
            ui.spotifyPlay.disabled=false;
            ui.spotifyRestart.disabled=false;
            setSpotifyStatus('');
            renderSpotifyState();
          });

          controller.addListener?.('playback_started',()=>{
            spotifyPaused=false;
            renderSpotifyState();
          });

          controller.addListener?.('playback_update',e=>{
            if(e?.data&&typeof e.data.isPaused==='boolean'){
              spotifyPaused=e.data.isPaused;
              renderSpotifyState();
            }
          });

          ui.spotifyPlay.disabled=false;
          ui.spotifyRestart.disabled=false;
          setSpotifyStatus('');
          renderSpotifyState();
        }
      );

      state.spotifyUrl=entity;
      ui.spotifyInput.value=entity;
      if(persist)localStorage.setItem('blobby.music.spotify',entity);
    }catch(err){
      spotifyController=null;
      spotifyReady=false;
      ui.spotifyPlay.disabled=true;
      ui.spotifyRestart.disabled=true;
      ui.spotifyFrameWrap.replaceChildren(el('div','blobby-music-spotify-empty','Spotify Embed could not be loaded.'));
      setSpotifyStatus(err?.message||'Spotify Embed could not be loaded.',true);
      renderSpotifyState();
    }
  }

  function clearSpotify(){
    try{spotifyController?.pause?.();}catch{}
    try{spotifyController?.destroy?.();}catch{}
    spotifyController=null;
    spotifyReady=false;
    spotifyPaused=true;
    state.spotifyUrl='';
    localStorage.removeItem('blobby.music.spotify');
    ui.spotifyInput.value='';
    ui.spotifyPlay.disabled=true;
    ui.spotifyRestart.disabled=true;
    setSpotifyStatus('');
    ui.spotifyFrameWrap.replaceChildren(el('div','blobby-music-spotify-empty','Paste a Spotify link above to load the player.'));
    renderSpotifyState();
  }

  function addFiles(files){
    for(const f of files){
      if(!f.type.startsWith('audio/'))continue;
      state.queue.push({file:f,url:URL.createObjectURL(f),title:title(f)});
    }
    ui.picker.value='';
    if(state.index<0&&state.queue.length)select(0,false);
    render();
  }

  function select(i,autoplay=true){
    if(!state.queue.length)return;
    i=(i+state.queue.length)%state.queue.length;
    state.index=i;
    audio.src=state.queue[i].url;
    audio.load();
    render();
    if(autoplay){
      setSource('local');
      audio.play().catch(()=>{});
    }
  }

  function toggle(){
    if(state.index<0){
      if(state.queue.length)select(0,true);
      return;
    }
    setSource('local');
    if(audio.paused)audio.play().catch(()=>{});
    else audio.pause();
  }

  function next(){
    if(!state.queue.length)return;
    if(state.shuffle&&state.queue.length>1){
      let i;
      do{i=Math.floor(Math.random()*state.queue.length);}while(i===state.index);
      select(i,true);
    }else if(state.index<state.queue.length-1)select(state.index+1,true);
    else if(state.repeat==='all')select(0,true);
  }

  function prev(){
    if(!state.queue.length)return;
    if(audio.currentTime>3){audio.currentTime=0;return;}
    select(state.index-1,true);
  }

  function ended(){
    if(state.repeat==='one'){
      audio.currentTime=0;
      audio.play().catch(()=>{});
    }else next();
  }

  function remove(i){
    const was=i===state.index,item=state.queue[i];
    if(!item)return;
    if(was)audio.pause();
    URL.revokeObjectURL(item.url);
    state.queue.splice(i,1);
    if(!state.queue.length){
      state.index=-1;
      audio.removeAttribute('src');
      audio.load();
    }else if(was)select(Math.min(i,state.queue.length-1),false);
    else if(i<state.index)state.index--;
    render();
  }

  function progress(){
    ui.current.textContent=fmt(audio.currentTime);
    ui.duration.textContent=fmt(audio.duration);
    ui.seek.value=Number.isFinite(audio.duration)&&audio.duration?Math.round(audio.currentTime/audio.duration*1000):0;
  }

  function renderControls(){
    const playing=!audio.paused&&state.index>=0;
    ui.play.textContent=playing?'❚❚':'▶';
    ui.miniPlay.textContent=playing?'❚❚':'▶';
    ui.shuffle.classList.toggle('active',state.shuffle);
    ui.repeat.classList.toggle('active',state.repeat!=='off');
    ui.repeat.title=`Repeat: ${state.repeat}`;
    ui.repeat.textContent=state.repeat==='one'?'↻¹':'↻';
  }

  function render(){
    const cur=state.queue[state.index];
    ui.title.textContent=cur?.title||'Nothing playing';
    ui.file.textContent=cur?.file?.name||'Add audio files to begin.';
    ui.miniTitle.textContent=cur?.title||'Nothing playing';
    ui.mini.hidden=!cur||state.source!=='local';
    ui.list.replaceChildren();

    if(!state.queue.length){
      ui.list.append(el('div','blobby-music-empty','No music added yet. Choose audio files from this device.'));
    }

    state.queue.forEach((t,i)=>{
      const r=el('div','blobby-music-track');
      if(i===state.index)r.classList.add('active');

      const play=el('button','blobby-music-track-play',i===state.index&&!audio.paused?'❚❚':'▶');
      play.type='button';
      play.onclick=()=>i===state.index?toggle():select(i,true);

      const copy=el('button','blobby-music-track-copy');
      copy.type='button';
      copy.innerHTML=`<strong></strong><small></small>`;
      copy.querySelector('strong').textContent=t.title;
      copy.querySelector('small').textContent=t.file.name;
      copy.onclick=()=>select(i,true);

      const del=el('button','blobby-music-remove','×');
      del.type='button';
      del.title='Remove from queue';
      del.onclick=()=>remove(i);

      r.append(play,copy,del);
      ui.list.append(r);
    });

    renderControls();
    progress();
  }

  function open(){
    if(document.body.dataset.licenseState!=='unlocked')return;
    if(window.BlobbyChat?.state?.().open)window.BlobbyChat.close();
    if(window.BlobbyDM?.state?.().open)window.BlobbyDM.close();
    if(window.BlobbyGroup?.state?.().open)window.BlobbyGroup.close();
    if(window.BlobbyLeaderboard?.state?.().open)window.BlobbyLeaderboard.close();
    window.BlobbyPanels?.close();
    state.open=true;
    ui.root.dataset.open='true';
    ui.shell.setAttribute('aria-hidden','false');
    document.documentElement.dataset.musicOpen='true';
    appExpand();
  }

  function close(){
    if(!state.open)return;
    if(state.source==='spotify'){
      try{spotifyController?.pause?.();}catch{}
      spotifyPaused=true;
      renderSpotifyState();
    }
    state.open=false;
    ui.root.dataset.open='false';
    ui.shell.setAttribute('aria-hidden','true');
    delete document.documentElement.dataset.musicOpen;
    appRestore();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',build,{once:true});
  else build();

  window.BlobbyMusic=Object.freeze({
    open,
    close,
    toggle:()=>state.open?close():open(),
    state:()=>({
      open:state.open,
      playing:!!audio&&!audio.paused,
      index:state.index,
      count:state.queue.length,
      source:state.source,
      spotifyLoaded:!!state.spotifyUrl
    })
  });
})();