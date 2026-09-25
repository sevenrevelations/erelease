'use strict';
(() => {
  const CONFIG = window.BLOBBY_CONFIG || {};
  if (CONFIG.CHAT_ENABLED === false) return;

  const GENERAL_ROOM_ID = CONFIG.CHAT_GENERAL_ROOM_ID || '00000000-0000-0000-0000-000000000001';
  const PREF_KEY = 'blobby.chat.prefs.v1';
  const READ_KEY = 'blobby.chat.lastread.v1';
  const MAX_IMAGE_BYTES = Math.max(1, Number(CONFIG.CHAT_MAX_IMAGE_MB || 5)) * 1024 * 1024;
  const MAX_FILE_BYTES = Math.max(1, Number(CONFIG.CHAT_MAX_FILE_MB || 10)) * 1024 * 1024;
  const PAGE_SIZE = 45;
  const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg','image/png','image/webp']);
  const ALLOWED_FILE_TYPES = new Set([
    'application/pdf','text/plain','text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]);
  const ALLOWED_FILE_EXT = new Set(['pdf','txt','csv','docx','xlsx','pptx']);
  const EMOJIS = ['😀','😄','😂','🥹','😍','😎','🤯','😭','😤','🤔','🫡','👀','👍','👎','❤️','🔥','💯','🎉','✨','💀','🙏','👏','🤝','🫶','⚽','🎮','📚','🚀','✅','❌','🍿','🧠'];
  const QUICK_REACTIONS = ['👍','❤️','😂','🔥','💯','👀'];

  const state = {
    open:false, peek:false, hoverOpened:false, ready:false, connecting:false, connected:false,
    supabase:null, session:null, profile:null, profiles:new Map(), messages:[], reactions:new Map(),
    channel:null, onlineIds:new Set(), typing:new Map(), typingTimer:0, typingSent:false,
    replyTo:null, unread:0, lastReadAt:readJSON(READ_KEY, 0) || 0, oldestLoadedAt:null,
    loadingOlder:false, hasMore:true, signedUrls:new Map(), blocked:new Set(),
    prefs:{ sounds:false, compact:false, reducedMotion:false, notifications:'mentions', ...readJSON(PREF_KEY,{}) },
    activePopover:'', flyout:'', lastScrollNearBottom:true
  };

  let ui = {};

  function readJSON(key, fallback){ try{ const v=localStorage.getItem(key); return v===null?fallback:JSON.parse(v); }catch{return fallback;} }
  function writeJSON(key, value){ try{ localStorage.setItem(key, JSON.stringify(value)); return true; }catch{return false;} }
  function q(sel, root=document){ return root.querySelector(sel); }
  function el(tag, cls='', text){ const n=document.createElement(tag); if(cls)n.className=cls; if(text!==undefined)n.textContent=text; return n; }
  function safeText(v,max=4000){ return String(v??'').replace(/\u0000/g,'').slice(0,max); }
  function safeName(v){ return safeText(v,32).trim(); }
  function isPerformance(){ return document.documentElement.dataset.performance==='true'; }
  function isReduced(){ return state.prefs.reducedMotion || document.documentElement.dataset.reduced==='true' || matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function currentProfileId(){ return state.profile?.id || ''; }
  function isMod(){ return ['owner','admin','moderator'].includes(state.profile?.role); }
  function isOwnerProfile(p){ return p?.role==='owner'; }
  function humanBytes(bytes){ const n=Number(bytes)||0; if(n<1024)return `${n} B`; if(n<1024*1024)return `${(n/1024).toFixed(n<10240?1:0)} KB`; return `${(n/1024/1024).toFixed(1)} MB`; }
  function timeLabel(v){ const d=new Date(v); return d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}); }
  function dayKey(v){ const d=new Date(v); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }
  function dayLabel(v){ const d=new Date(v), now=new Date(), yesterday=new Date(Date.now()-86400000); if(dayKey(d)===dayKey(now))return 'Today'; if(dayKey(d)===dayKey(yesterday))return 'Yesterday'; return d.toLocaleDateString([], {month:'short',day:'numeric',year:d.getFullYear()===now.getFullYear()?undefined:'numeric'}); }
  function initials(name){ const parts=String(name||'?').trim().split(/\s+/).filter(Boolean); return ((parts[0]?.[0]||'?')+(parts.length>1?(parts.at(-1)?.[0]||''):'')).toUpperCase().slice(0,2); }
  function isHttpsUrl(v){ try{ const u=new URL(String(v||'')); return u.protocol==='https:'; }catch{return false;} }
  function safeFilename(name){ const cleaned=String(name||'file').replace(/[^a-zA-Z0-9._-]+/g,'_').replace(/^\.+/,'').slice(-90); return cleaned || 'file'; }
  function extOf(name){ return String(name||'').split('.').pop()?.toLowerCase()||''; }

  function toast(text){
    if(!ui.toasts) return;
    const n=el('div','blobby-chat-toast',text);
    ui.toasts.append(n);
    setTimeout(()=>n.remove(),2600);
  }

  function syncRootFlags(){
    if(!ui.root) return;
    ui.root.dataset.open=String(state.open);
    ui.root.dataset.peek=String(state.peek);
    ui.root.dataset.compact=String(!!state.prefs.compact);
    ui.root.dataset.reduced=String(isReduced());
    ui.root.dataset.performance=String(isPerformance());
  }

  function createUI(){
    const root=el('div','blobby-chat-root'); root.id='blobbyChatRoot'; root.dataset.open='false'; root.dataset.peek='false';
    root.innerHTML=`
      <div class="blobby-chat-edge-zone" aria-hidden="true"></div>
      <button class="blobby-chat-handle" type="button" aria-label="Open Blobby Chat" title="Blobby Chat">
        <span class="blobby-chat-handle-icon">💬</span><span class="blobby-chat-handle-label">Chat</span><span class="blobby-chat-unread" hidden>0</span>
      </button>
      <div class="blobby-chat-backdrop" aria-hidden="true"></div>
      <aside class="blobby-chat-panel" aria-label="Blobby Chat" aria-hidden="true">
        <header class="blobby-chat-head">
          <div class="blobby-chat-title"><div class="blobby-chat-logo">b</div><div class="blobby-chat-title-copy"><strong>BLOBBY CHAT</strong><span class="blobby-chat-connection">Not connected</span></div></div>
          <div class="blobby-chat-head-actions"><button class="blobby-chat-icon-btn chat-settings" type="button" aria-label="Chat settings" title="Chat settings">⚙</button><button class="blobby-chat-icon-btn chat-close" type="button" aria-label="Close chat" title="Close chat">×</button></div>
        </header>
        <div class="blobby-chat-roombar"><div class="blobby-chat-room">general</div><button class="blobby-chat-presence-btn" type="button"><i class="blobby-chat-dot" data-state="offline"></i><span class="blobby-chat-online-count">0 online</span></button></div>
        <div class="blobby-chat-messages" role="log" aria-live="polite" aria-relevant="additions"><div class="blobby-chat-loading">Open chat to connect…</div></div>
        <div class="blobby-chat-typing" aria-live="polite"></div>
        <div class="blobby-chat-composer">
          <div class="blobby-chat-replying" hidden><span></span><button type="button" aria-label="Cancel reply">×</button></div>
          <div class="blobby-chat-input-wrap"><textarea class="blobby-chat-input" rows="1" maxlength="2000" placeholder="Message #general…" aria-label="Message general chat"></textarea><button class="blobby-chat-send" type="button" disabled>Send</button></div>
          <div class="blobby-chat-tools"><button class="blobby-chat-tool chat-emoji" type="button" title="Emoji">😀</button><button class="blobby-chat-tool chat-attach" type="button" title="Attach file">📎</button><button class="blobby-chat-tool chat-photo" type="button" title="Attach photo">📷</button><span class="blobby-chat-upload-state"></span><span class="blobby-chat-upload-progress" hidden><i></i></span></div>
          <input class="chat-file-input" type="file" hidden accept=".pdf,.txt,.csv,.docx,.xlsx,.pptx,image/jpeg,image/png,image/webp">
          <input class="chat-photo-input" type="file" hidden accept="image/jpeg,image/png,image/webp">
        </div>
        <button class="blobby-chat-jump" type="button" hidden>↓ New messages</button>
        <div class="blobby-chat-popover chat-emoji-popover" hidden><div class="blobby-chat-popover-head"><strong>Emoji</strong><button class="blobby-chat-icon-btn" type="button" data-close-popover>×</button></div><div class="blobby-chat-emoji-grid"></div></div>
        <section class="blobby-chat-flyout chat-settings-flyout" aria-label="Chat settings"><div class="blobby-chat-flyout-head"><button class="blobby-chat-icon-btn flyout-back" type="button">←</button><strong>Chat settings</strong></div><div class="blobby-chat-flyout-body">
          <div class="blobby-chat-field"><label>Display name</label><input class="chat-display-name" maxlength="32" autocomplete="off"></div>
          <div class="blobby-chat-field"><label>Custom status</label><input class="chat-custom-status" maxlength="80" placeholder="chilling, gaming, afk…"></div>
          <div class="blobby-chat-field"><label>Presence</label><select class="chat-presence-status"><option value="online">Online</option><option value="away">Away</option><option value="dnd">Do Not Disturb</option><option value="invisible">Invisible</option></select></div>
          <label class="blobby-chat-setting-row"><span>Notification sounds</span><input class="chat-sounds" type="checkbox"></label>
          <label class="blobby-chat-setting-row"><span>Compact messages</span><input class="chat-compact" type="checkbox"></label>
          <label class="blobby-chat-setting-row"><span>Reduced chat motion</span><input class="chat-reduced" type="checkbox"></label>
          <button class="blobby-chat-save chat-save-settings" type="button">Save changes</button><div class="blobby-chat-error chat-settings-error"></div>
        </div></section>
        <section class="blobby-chat-flyout chat-online-flyout" aria-label="Online users"><div class="blobby-chat-flyout-head"><button class="blobby-chat-icon-btn flyout-back" type="button">←</button><strong>Online now</strong></div><div class="blobby-chat-flyout-body chat-online-list"></div></section>
        <div class="blobby-chat-toast-stack"></div>
      </aside>
      <div class="blobby-chat-lightbox" hidden><button type="button" aria-label="Close image">×</button><img alt="Shared image preview"></div>
    `;
    document.body.append(root);

    ui={
      root,panel:q('.blobby-chat-panel',root),edge:q('.blobby-chat-edge-zone',root),handle:q('.blobby-chat-handle',root),unread:q('.blobby-chat-unread',root),backdrop:q('.blobby-chat-backdrop',root),
      close:q('.chat-close',root),settings:q('.chat-settings',root),connection:q('.blobby-chat-connection',root),dot:q('.blobby-chat-dot',root),onlineCount:q('.blobby-chat-online-count',root),presenceButton:q('.blobby-chat-presence-btn',root),
      messages:q('.blobby-chat-messages',root),typing:q('.blobby-chat-typing',root),input:q('.blobby-chat-input',root),send:q('.blobby-chat-send',root),replying:q('.blobby-chat-replying',root),
      emojiButton:q('.chat-emoji',root),attachButton:q('.chat-attach',root),photoButton:q('.chat-photo',root),fileInput:q('.chat-file-input',root),photoInput:q('.chat-photo-input',root),uploadState:q('.blobby-chat-upload-state',root),uploadProgress:q('.blobby-chat-upload-progress',root),
      emojiPopover:q('.chat-emoji-popover',root),
      settingsFlyout:q('.chat-settings-flyout',root),onlineFlyout:q('.chat-online-flyout',root),onlineList:q('.chat-online-list',root),jump:q('.blobby-chat-jump',root),
      displayName:q('.chat-display-name',root),customStatus:q('.chat-custom-status',root),presenceStatus:q('.chat-presence-status',root),sounds:q('.chat-sounds',root),compact:q('.chat-compact',root),reduced:q('.chat-reduced',root),saveSettings:q('.chat-save-settings',root),settingsError:q('.chat-settings-error',root),
      toasts:q('.blobby-chat-toast-stack',root),lightbox:q('.blobby-chat-lightbox',root),lightboxImg:q('.blobby-chat-lightbox img',root)
    };

    const emojiGrid=q('.blobby-chat-emoji-grid',root);
    EMOJIS.forEach(e=>{ const b=el('button','',e); b.type='button'; b.onclick=()=>insertEmoji(e); emojiGrid.append(b); });
    bindUI(); syncRootFlags(); syncUnread(); observeThemeState();
  }

  function bindUI(){
    let peekTimer=0, closePeekTimer=0, hoverOpenTimer=0, hoverCloseTimer=0;
    const finePointer=()=>matchMedia('(hover:hover) and (pointer:fine)').matches;
    const cancelHoverClose=()=>clearTimeout(hoverCloseTimer);
    const maybeHoverClose=()=>{if(!state.hoverOpened)return;clearTimeout(hoverCloseTimer);hoverCloseTimer=setTimeout(()=>{if(state.hoverOpened){state.hoverOpened=false;closeChat();}},700);};
    ui.edge.addEventListener('mouseenter',()=>{ clearTimeout(closePeekTimer);cancelHoverClose(); peekTimer=setTimeout(()=>{state.peek=true;syncRootFlags();},90); });
    ui.edge.addEventListener('mouseleave',()=>{ clearTimeout(peekTimer); closePeekTimer=setTimeout(()=>{if(!state.open){state.peek=false;syncRootFlags();}},260);maybeHoverClose(); });
    ui.handle.addEventListener('mouseenter',()=>{ clearTimeout(closePeekTimer);cancelHoverClose();state.peek=true;syncRootFlags();if(finePointer()&&!state.open){clearTimeout(hoverOpenTimer);hoverOpenTimer=setTimeout(()=>{state.hoverOpened=true;openChat();},320);} });
    ui.handle.addEventListener('mouseleave',()=>{clearTimeout(hoverOpenTimer);closePeekTimer=setTimeout(()=>{if(!state.open){state.peek=false;syncRootFlags();}},350);maybeHoverClose();});
    ui.panel.addEventListener('mouseenter',cancelHoverClose);
    ui.panel.addEventListener('mouseleave',maybeHoverClose);
    ui.handle.onclick=()=>{clearTimeout(hoverOpenTimer);state.hoverOpened=false;toggleChat();}; ui.close.onclick=()=>{state.hoverOpened=false;closeChat();}; ui.backdrop.onclick=()=>{state.hoverOpened=false;closeChat();};
    ui.settings.onclick=()=>openFlyout('settings'); ui.presenceButton.onclick=()=>openFlyout('online');
    ui.root.querySelectorAll('.flyout-back').forEach(b=>b.onclick=closeFlyouts);
    ui.root.querySelectorAll('[data-close-popover]').forEach(b=>b.onclick=closePopovers);
    ui.emojiButton.onclick=()=>togglePopover('emoji');
    ui.attachButton.onclick=()=>ui.fileInput.click(); ui.photoButton.onclick=()=>ui.photoInput.click();
    ui.fileInput.onchange=()=>{const f=ui.fileInput.files?.[0]; ui.fileInput.value=''; if(f)uploadAndSend(f,false);};
    ui.photoInput.onchange=()=>{const f=ui.photoInput.files?.[0]; ui.photoInput.value=''; if(f)uploadAndSend(f,true);};
    ui.input.addEventListener('input',()=>{ autoGrowInput(); syncSend(); sendTyping(); });
    ui.input.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendText();} });
    ui.send.onclick=sendText;
    ui.replying.querySelector('button').onclick=()=>setReply(null);
    ui.jump.onclick=()=>{scrollBottom(true);ui.jump.hidden=true;};
    ui.messages.addEventListener('scroll',onMessagesScroll,{passive:true});
    ui.saveSettings.onclick=saveChatSettings;
    ui.lightbox.onclick=e=>{ if(e.target===ui.lightbox||e.target.tagName==='BUTTON')ui.lightbox.hidden=true; };
    document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&state.open){ if(state.flyout){closeFlyouts();return;} if(state.activePopover){closePopovers();return;} closeChat(); } });
    window.addEventListener('online',()=>{setConnection('connecting','Reconnecting…'); if(state.open)ensureConnected(true);});
    window.addEventListener('offline',()=>setConnection('offline','Offline'));
    document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible'&&state.open)ensureConnected(); });
    window.addEventListener('blobby:license-locked',disconnectChat);
  }

  function observeThemeState(){
    const obs=new MutationObserver(()=>syncRootFlags());
    obs.observe(document.documentElement,{attributes:true,attributeFilter:['data-performance','data-reduced','data-animations','data-glass']});
  }

  function appExpand(){
    try{ if(window.BlobbyAppUI?.expand) window.BlobbyAppUI.expand('chat'); else if(window.BlobbyBridge?.isAppInventor?.()){window.BlobbyBridge.send('EXPAND_UI','chat');setTimeout(()=>window.BlobbyBridge.send('UI_HEIGHT','-2'),20);} }catch{}
  }
  function appRestore(){
    try{ if(window.BlobbyAppUI?.restore) window.BlobbyAppUI.restore(); else if(window.BlobbyBridge?.isAppInventor?.()) window.BlobbyBridge.send('RESTORE_UI','browser'); }catch{}
  }

  async function openChat(){
    if(document.body.dataset.licenseState!=='unlocked') return;
    state.open=true; state.peek=false; ui.panel.setAttribute('aria-hidden','false'); syncRootFlags(); appExpand();
    await ensureConnected();
    markRead();
    setTimeout(()=>ui.input.focus(),isReduced()?0:220);
  }
  function closeChat(){
    if(!state.open)return; state.open=false; state.peek=false; state.hoverOpened=false; closePopovers(); closeFlyouts(); ui.panel.setAttribute('aria-hidden','true'); syncRootFlags(); markRead(); appRestore();
  }
  function toggleChat(){ state.open?closeChat():openChat(); }

  async function loadSupabase(){
    if(state.supabase)return state.supabase;
    if(!CONFIG.SUPABASE_URL||!CONFIG.SUPABASE_PUBLISHABLE_KEY) throw Error('Chat backend is not configured.');
    const mod=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    state.supabase=mod.createClient(CONFIG.SUPABASE_URL,CONFIG.SUPABASE_PUBLISHABLE_KEY,{auth:{storageKey:'blobby-chat-auth-v1',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
    return state.supabase;
  }

  async function ensureConnected(force=false){
    if(state.ready&&!force)return;
    if(state.connecting)return;
    state.connecting=true; setConnection('connecting','Connecting…');
    try{
      const sb=await loadSupabase();
      let {data:{session}}=await sb.auth.getSession();
      if(!session){
        const {data,error}=await sb.auth.signInAnonymously();
        if(error)throw Error('Anonymous chat sign-in is not enabled in Supabase.');
        session=data.session;
      }
      state.session=session;
      await bindLicenseToChat();
      await Promise.all([loadProfiles(),loadMessages(true),loadBlocks()]);
      await subscribeRealtime();
      state.ready=true; state.connected=true; setConnection('connected','Connected'); renderMessages(); renderOnline();
    }catch(err){
      console.warn('Blobby Chat connection failed',err); setConnection(navigator.onLine?'offline':'offline',err.message||'Chat unavailable');
      ui.messages.replaceChildren(el('div','blobby-chat-empty',err.message||'Chat is unavailable right now.'));
    }finally{state.connecting=false;}
  }

  async function bindLicenseToChat(){
    const creds=window.BlobbyLicense?.chatCredentials?.();
    if(!creds?.token||!creds?.installationId) throw Error('Your blobby.vip access needs to be verified before chat can connect.');
    const {data:{session}}=await state.supabase.auth.getSession();
    if(!session?.access_token)throw Error('Chat session unavailable.');
    const res=await fetch(String(CONFIG.SUPABASE_URL).replace(/\/$/,'')+'/functions/v1/chat-public',{method:'POST',headers:{'Content-Type':'application/json','apikey':CONFIG.SUPABASE_PUBLISHABLE_KEY,'Authorization':'Bearer '+session.access_token},body:JSON.stringify({action:'bind',activationToken:creds.token,installationId:creds.installationId})});
    let body={}; try{body=await res.json();}catch{}
    if(!res.ok||!body.ok)throw Error(body.code==='chat_banned'?'Your chat access is banned.':body.code==='license_invalid'?'Your blobby.vip access could not be verified for chat.':body.message||body.code||'Chat authorization failed.');
    state.profile=body.profile; state.profiles.set(body.profile.id,body.profile); fillSettings();
  }

  async function loadProfiles(){
    const {data,error}=await state.supabase.from('chat_profiles').select('id,display_name,avatar_path,bio,status,custom_status,role,is_banned,muted_until,created_at').limit(1000);
    if(error)throw error;
    (data||[]).forEach(p=>state.profiles.set(p.id,p));
    if(state.profile&&state.profiles.has(state.profile.id))state.profile={...state.profile,...state.profiles.get(state.profile.id)};
  }

  async function loadMessages(reset=false){
    if(reset){state.messages=[];state.hasMore=true;state.oldestLoadedAt=null;ui.messages.replaceChildren(el('div','blobby-chat-loading','Loading messages…'));}
    let query=state.supabase.from('chat_messages').select('*').eq('room_id',GENERAL_ROOM_ID).order('created_at',{ascending:false}).limit(PAGE_SIZE);
    if(state.oldestLoadedAt)query=query.lt('created_at',state.oldestLoadedAt);
    const {data,error}=await query;
    if(error)throw error;
    const batch=(data||[]).reverse();
    if(batch.length<PAGE_SIZE)state.hasMore=false;
    if(batch.length)state.oldestLoadedAt=batch[0].created_at;
    if(reset)state.messages=batch; else state.messages=[...batch,...state.messages];
    await loadProfilesForMessages(batch);
    await loadReactions();
    if(reset){renderMessages();requestAnimationFrame(()=>scrollBottom(false));}
  }

  async function loadProfilesForMessages(items){
    const ids=[...new Set((items||[]).map(m=>m.sender_profile_id).filter(id=>id&&!state.profiles.has(id)))];
    if(!ids.length)return;
    const {data}=await state.supabase.from('chat_profiles').select('id,display_name,avatar_path,bio,status,custom_status,role,is_banned,muted_until,created_at').in('id',ids);
    (data||[]).forEach(p=>state.profiles.set(p.id,p));
  }

  async function loadReactions(){
    const ids=state.messages.map(m=>m.id); if(!ids.length){state.reactions.clear();return;}
    const {data}=await state.supabase.from('chat_reactions').select('message_id,profile_id,emoji').in('message_id',ids);
    state.reactions.clear();
    for(const r of data||[]){ if(!state.reactions.has(r.message_id))state.reactions.set(r.message_id,[]); state.reactions.get(r.message_id).push(r); }
  }

  async function loadBlocks(){
    if(!currentProfileId())return;
    const {data}=await state.supabase.from('chat_blocks').select('blocked_profile_id').eq('blocker_profile_id',currentProfileId());
    state.blocked=new Set((data||[]).map(x=>x.blocked_profile_id));
  }

  async function subscribeRealtime(){
    if(state.channel)await state.supabase.removeChannel(state.channel);
    const key=currentProfileId()||state.session?.user?.id||crypto.randomUUID();
    const ch=state.supabase.channel('blobby-general',{config:{presence:{key},broadcast:{self:false}}});
    ch.on('postgres_changes',{event:'INSERT',schema:'public',table:'chat_messages',filter:`room_id=eq.${GENERAL_ROOM_ID}`},async payload=>{
      const m=payload.new; if(state.messages.some(x=>x.id===m.id))return; state.messages.push(m); await loadProfilesForMessages([m]); renderMessages(); handleIncoming(m);
    });
    ch.on('postgres_changes',{event:'UPDATE',schema:'public',table:'chat_messages',filter:`room_id=eq.${GENERAL_ROOM_ID}`},payload=>{
      const i=state.messages.findIndex(x=>x.id===payload.new.id); if(i>=0){state.messages[i]=payload.new;renderMessages({preserveScroll:true});}
    });
    ch.on('postgres_changes',{event:'*',schema:'public',table:'chat_reactions'},async()=>{await loadReactions();renderMessages({preserveScroll:true});});
    ch.on('postgres_changes',{event:'UPDATE',schema:'public',table:'chat_profiles'},payload=>{
      if(payload.new?.id){state.profiles.set(payload.new.id,payload.new);if(payload.new.id===currentProfileId()){state.profile={...state.profile,...payload.new};fillSettings();}renderMessages({preserveScroll:true});renderOnline();}
    });
    ch.on('presence',{event:'sync'},()=>syncPresence(ch));
    ch.on('presence',{event:'join'},()=>syncPresence(ch));
    ch.on('presence',{event:'leave'},()=>syncPresence(ch));
    ch.on('broadcast',{event:'typing'},({payload})=>receiveTyping(payload));
    ch.subscribe(async status=>{
      if(status==='SUBSCRIBED'){
        state.connected=true;setConnection('connected','Connected');
        if(state.profile?.status!=='invisible')await ch.track({profile_id:currentProfileId(),at:Date.now()});
      }else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){state.connected=false;setConnection('connecting','Reconnecting…');}
    });
    state.channel=ch;
  }

  function syncPresence(ch){
    const presence=ch.presenceState(); const ids=new Set();
    Object.values(presence||{}).flat().forEach(meta=>{if(meta?.profile_id)ids.add(meta.profile_id);});
    state.onlineIds=ids; renderOnline();
  }

  function receiveTyping(payload){
    const id=payload?.profile_id; if(!id||id===currentProfileId())return;
    if(!payload.typing){state.typing.delete(id);}else state.typing.set(id,Date.now()+3500);
    renderTyping();
  }

  function sendTyping(){
    if(!state.channel||!state.connected)return;
    clearTimeout(state.typingTimer);
    if(!state.typingSent){state.typingSent=true;state.channel.send({type:'broadcast',event:'typing',payload:{profile_id:currentProfileId(),typing:true}});}
    state.typingTimer=setTimeout(()=>{state.typingSent=false;state.channel?.send({type:'broadcast',event:'typing',payload:{profile_id:currentProfileId(),typing:false}});},1400);
  }

  function renderTyping(){
    const now=Date.now(); for(const [id,until] of state.typing)if(until<now)state.typing.delete(id);
    const names=[...state.typing.keys()].map(id=>state.profiles.get(id)?.display_name).filter(Boolean).slice(0,3);
    if(!names.length){ui.typing.textContent='';return;}
    let text=names.length===1?`${names[0]} is typing`:names.length===2?`${names[0]} and ${names[1]} are typing`:'Several people are typing';
    ui.typing.replaceChildren(document.createTextNode(text)); const dots=el('span','blobby-chat-typing-dots');dots.innerHTML='<i></i><i></i><i></i>';ui.typing.append(dots);
    setTimeout(renderTyping,1800);
  }

  function renderOnline(){
    const visible=[...state.onlineIds].map(id=>state.profiles.get(id)).filter(Boolean).filter(p=>p.status!=='invisible').sort((a,b)=>roleRank(b.role)-roleRank(a.role)||a.display_name.localeCompare(b.display_name));
    ui.onlineCount.textContent=`${visible.length} online`;
    if(!ui.onlineList)return; ui.onlineList.replaceChildren();
    if(!visible.length){ui.onlineList.append(el('div','blobby-chat-empty','Nobody else is showing as online.'));return;}
    for(const p of visible){const row=el('div','blobby-chat-online-user');row.append(avatarNode(p));const copy=el('div','blobby-chat-online-copy');const strong=el('strong');appendIdentity(strong,p);copy.append(strong,el('span','',p.custom_status||statusLabel(p.status)));row.append(copy);ui.onlineList.append(row);}
  }
  function roleRank(role){return role==='owner'?4:role==='admin'?3:role==='moderator'?2:1;}
  function statusLabel(s){return s==='away'?'Away':s==='dnd'?'Do Not Disturb':'Online';}

  function renderMessages({preserveScroll=false}={}){
    if(!ui.messages)return;
    const oldHeight=ui.messages.scrollHeight, oldTop=ui.messages.scrollTop, nearBottom=isNearBottom();
    ui.messages.replaceChildren();
    if(state.hasMore&&state.messages.length){const older=el('button','blobby-chat-mini-btn','Load older messages');older.style.display='block';older.style.margin='0 auto 8px';older.onclick=loadOlder;ui.messages.append(older);}
    if(!state.messages.length){ui.messages.append(el('div','blobby-chat-empty','No messages yet. Say hi 👋'));return;}
    let lastDay='', dividerShown=false;
    for(const m of state.messages){
      const dk=dayKey(m.created_at); if(dk!==lastDay){ui.messages.append(el('div','blobby-chat-day',dayLabel(m.created_at)));lastDay=dk;}
      if(!dividerShown&&state.lastReadAt&&new Date(m.created_at).getTime()>state.lastReadAt&&m.sender_profile_id!==currentProfileId()){ui.messages.append(el('div','blobby-chat-new-divider','New messages'));dividerShown=true;}
      if(state.blocked.has(m.sender_profile_id))continue;
      ui.messages.append(messageNode(m));
    }
    if(preserveScroll){ui.messages.scrollTop=oldTop+(ui.messages.scrollHeight-oldHeight);}else if(nearBottom||state.lastScrollNearBottom)requestAnimationFrame(()=>scrollBottom(false));
  }

  function messageNode(m){
    const p=state.profiles.get(m.sender_profile_id)||{id:m.sender_profile_id,display_name:'Unknown',role:'user'};
    const row=el('article','blobby-chat-msg'); row.dataset.messageId=m.id; row.dataset.own=String(m.sender_profile_id===currentProfileId());
    row.append(avatarNode(p));
    const main=el('div','blobby-chat-msg-main'); const head=el('div','blobby-chat-msg-head');
    appendIdentity(head,p); head.append(el('time','blobby-chat-time',timeLabel(m.created_at))); if(m.edited_at)head.append(el('span','blobby-chat-edited','edited')); main.append(head);
    if(m.reply_to){const original=state.messages.find(x=>x.id===m.reply_to);const rp=original?state.profiles.get(original.sender_profile_id):null;const prev=el('div','blobby-chat-reply-preview',original?`↳ ${rp?.display_name||'user'}: ${previewMessage(original)}`:'↳ Original message');prev.onclick=()=>scrollToMessage(m.reply_to);main.append(prev);}
    if(m.deleted_at){main.append(el('div','blobby-chat-deleted','Message deleted'));}
    else{
      if(m.body)main.append(bodyNode(m.body));
      if(m.message_type==='gif'&&isHttpsUrl(m.gif_url))main.append(gifNode(m.gif_url));
      if((m.message_type==='image'||m.message_type==='file')&&m.attachment_path)main.append(attachmentNode(m));
      const reactions=reactionNode(m); if(reactions)main.append(reactions);
      const actions=el('div','blobby-chat-msg-actions');
      const reply=el('button','blobby-chat-mini-btn','Reply');reply.type='button';reply.onclick=()=>setReply(m);actions.append(reply);
      const react=el('button','blobby-chat-mini-btn','React');react.type='button';react.onclick=()=>quickReaction(m);actions.append(react);
      if(m.sender_profile_id===currentProfileId()&&m.message_type==='text'){const edit=el('button','blobby-chat-mini-btn','Edit');edit.type='button';edit.onclick=()=>editMessage(m);actions.append(edit);}
      if(m.sender_profile_id===currentProfileId()||isMod()){const del=el('button','blobby-chat-mini-btn','Delete');del.type='button';del.onclick=()=>deleteMessage(m);actions.append(del);}
      if(m.sender_profile_id!==currentProfileId()){const report=el('button','blobby-chat-mini-btn','Report');report.type='button';report.onclick=()=>reportMessage(m);actions.append(report);if(isMod()){const mute=el('button','blobby-chat-mini-btn','Timeout');mute.type='button';mute.onclick=()=>moderateProfile(p,'mute');const ban=el('button','blobby-chat-mini-btn','Ban');ban.type='button';ban.onclick=()=>moderateProfile(p,'ban');actions.append(mute,ban);}}
      main.append(actions);
    }
    row.append(main);return row;
  }

  function avatarNode(p){
    const a=el('div','blobby-chat-avatar');a.textContent=initials(p?.display_name);return a;
  }
  function appendIdentity(parent,p){
    if(isOwnerProfile(p))parent.append(el('span','blobby-chat-owner-badge','[¥]'));
    else if(p?.role==='admin')parent.append(el('span','blobby-chat-mod-badge','[ADMIN]'));
    else if(p?.role==='moderator')parent.append(el('span','blobby-chat-mod-badge','[MOD]'));
    parent.append(el('span','blobby-chat-name',p?.display_name||'Unknown'));
  }
  function previewMessage(m){if(m.deleted_at)return 'Message deleted';if(m.body)return m.body.replace(/\s+/g,' ').slice(0,90);if(m.message_type==='gif')return '[GIF]';if(m.message_type==='image')return '[Photo]';if(m.message_type==='file')return `[File: ${m.attachment_name||'attachment'}]`;return 'Message';}
  function bodyNode(text){
    const box=el('div','blobby-chat-body'); const s=String(text||''); const re=/(https:\/\/[^\s<]+)/g; let last=0, match;
    while((match=re.exec(s))){if(match.index>last)box.append(document.createTextNode(s.slice(last,match.index)));try{const u=new URL(match[0]);const a=el('a','',u.href);a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';box.append(a);}catch{box.append(document.createTextNode(match[0]));}last=re.lastIndex;}if(last<s.length)box.append(document.createTextNode(s.slice(last)));return box;
  }
  function gifNode(url){
    const wrap=el('div','blobby-chat-media');
    const load=()=>{const img=el('img');img.alt='Shared GIF';img.loading='lazy';img.referrerPolicy='no-referrer';img.src=url;wrap.replaceChildren(img);};
    {const b=el('button','blobby-chat-file','▶ Load legacy GIF');b.type='button';b.style.width='100%';b.style.border='0';b.style.color='var(--ink)';b.onclick=load;wrap.append(b);}
    return wrap;
  }
  function attachmentNode(m){
    const wrap=el('div','blobby-chat-media'); if(m.message_type==='image'){const img=el('img');img.alt=m.attachment_name||'Shared image';img.loading='lazy';img.onclick=()=>openAttachmentLightbox(m,img);wrap.append(img);signedUrlFor(m).then(url=>{if(url)img.src=url;});}
    else{const f=el('div','blobby-chat-file');f.append(el('div','blobby-chat-file-icon','📄'));const c=el('div','blobby-chat-file-copy');c.append(el('strong','',m.attachment_name||'Attachment'),el('span','',humanBytes(m.attachment_size)));const a=el('a','', 'Open');a.href='#';a.onclick=async e=>{e.preventDefault();const url=await signedUrlFor(m);if(url)window.open(url,'_blank','noopener,noreferrer');};f.append(c,a);wrap.append(f);}return wrap;
  }
  async function signedUrlFor(m){
    const key=`${m.message_type}:${m.attachment_path}`;const cached=state.signedUrls.get(key);if(cached&&cached.until>Date.now())return cached.url;
    const bucket=m.message_type==='image'?'chat-images':'chat-files';const {data,error}=await state.supabase.storage.from(bucket).createSignedUrl(m.attachment_path,3600);if(error)return '';state.signedUrls.set(key,{url:data.signedUrl,until:Date.now()+3300000});return data.signedUrl;
  }
  async function openAttachmentLightbox(m,img){const url=img.src||await signedUrlFor(m);if(!url)return;ui.lightboxImg.src=url;ui.lightboxImg.alt=m.attachment_name||'Shared image';ui.lightbox.hidden=false;}

  function reactionNode(m){
    const list=state.reactions.get(m.id)||[]; if(!list.length)return null; const grouped=new Map(); for(const r of list){if(!grouped.has(r.emoji))grouped.set(r.emoji,[]);grouped.get(r.emoji).push(r);}
    const box=el('div','blobby-chat-reactions'); for(const [emoji,rows] of grouped){const b=el('button','blobby-chat-reaction',`${emoji} ${rows.length}`);b.type='button';b.dataset.mine=String(rows.some(r=>r.profile_id===currentProfileId()));b.onclick=()=>toggleReaction(m,emoji);box.append(b);}return box;
  }

  async function loadOlder(){if(state.loadingOlder||!state.hasMore)return;state.loadingOlder=true;const oldHeight=ui.messages.scrollHeight;try{await loadMessages(false);renderMessages({preserveScroll:true});ui.messages.scrollTop=ui.messages.scrollHeight-oldHeight;}catch(e){toast('Could not load older messages.');}finally{state.loadingOlder=false;}}
  function onMessagesScroll(){state.lastScrollNearBottom=isNearBottom(); if(ui.messages.scrollTop<80&&state.hasMore&&!state.loadingOlder)loadOlder(); if(isNearBottom()){ui.jump.hidden=true;if(state.open)markRead();}}
  function isNearBottom(){return ui.messages.scrollHeight-ui.messages.scrollTop-ui.messages.clientHeight<90;}
  function scrollBottom(smooth=true){ui.messages.scrollTo({top:ui.messages.scrollHeight,behavior:(smooth&&!isReduced())?'smooth':'auto'});}
  function scrollToMessage(id){const n=ui.messages.querySelector(`[data-message-id="${CSS.escape(id)}"]`);if(n)n.scrollIntoView({block:'center',behavior:isReduced()?'auto':'smooth'});}

  async function sendText(){
    const body=ui.input.value.trim(); if(!body||!state.ready)return; ui.send.disabled=true;
    try{await insertMessage({body,message_type:'text',reply_to:state.replyTo?.id||null});ui.input.value='';autoGrowInput();setReply(null);sendTypingStop();}
    catch(e){toast(friendlyDbError(e));}finally{syncSend();}
  }
  async function insertMessage(payload){
    if(!state.profile)throw Error('Chat profile unavailable.'); const row={room_id:GENERAL_ROOM_ID,sender_profile_id:currentProfileId(),body:payload.body||null,message_type:payload.message_type||'text',gif_url:payload.gif_url||null,attachment_path:payload.attachment_path||null,attachment_name:payload.attachment_name||null,attachment_mime:payload.attachment_mime||null,attachment_size:payload.attachment_size||null,reply_to:payload.reply_to||null};
    const {error}=await state.supabase.from('chat_messages').insert(row); if(error)throw error;
  }
  function friendlyDbError(e){const s=String(e?.message||e||'');if(/rate|slow down/i.test(s))return 'Slow down — you’re sending messages too quickly.';if(/muted/i.test(s))return 'You are currently timed out from sending messages.';if(/banned/i.test(s))return 'Your chat access is banned.';return 'Message could not be sent.';}

  function setReply(m){state.replyTo=m;ui.replying.hidden=!m;ui.replying.querySelector('span').textContent=m?`Replying to ${state.profiles.get(m.sender_profile_id)?.display_name||'user'}: ${previewMessage(m)}`:'';if(m)ui.input.focus();}
  async function editMessage(m){const next=prompt('Edit message:',m.body||'');if(next===null)return;const body=next.trim();if(!body)return;const {error}=await state.supabase.rpc('chat_edit_message',{p_message_id:m.id,p_body:body});if(error)toast('Could not edit message.');}
  async function deleteMessage(m){if(!confirm('Delete this message?'))return;const {error}=await state.supabase.rpc('chat_delete_message',{p_message_id:m.id});if(error)toast('Could not delete message.');}
  function quickReaction(m){const emoji=prompt(`React with an emoji:\n${QUICK_REACTIONS.join('  ')}`,'👍');if(!emoji)return;toggleReaction(m,Array.from(emoji.trim())[0]||emoji.trim());}
  async function toggleReaction(m,emoji){emoji=String(emoji||'').slice(0,16);if(!emoji)return;const list=state.reactions.get(m.id)||[];const mine=list.some(r=>r.profile_id===currentProfileId()&&r.emoji===emoji);let error;if(mine)({error}=await state.supabase.from('chat_reactions').delete().eq('message_id',m.id).eq('profile_id',currentProfileId()).eq('emoji',emoji));else({error}=await state.supabase.from('chat_reactions').insert({message_id:m.id,profile_id:currentProfileId(),emoji}));if(error)toast('Could not update reaction.');}
  async function reportMessage(m){const reason=prompt('Report reason (spam, harassment, inappropriate content, impersonation, other):','spam');if(!reason)return;const {error}=await state.supabase.from('chat_reports').insert({reporter_profile_id:currentProfileId(),message_id:m.id,reason:safeText(reason,200)});toast(error?'Report could not be submitted.':'Report submitted.');}
  async function moderateProfile(p,action){if(!isMod())return;if(action==='mute'){const mins=Number(prompt(`Timeout ${p.display_name} for how many minutes?`,'30'));if(!Number.isFinite(mins)||mins<1)return;const {error}=await state.supabase.rpc('chat_moderate_profile',{p_target_profile_id:p.id,p_action:'mute',p_minutes:Math.min(mins,10080)});toast(error?'Moderation action failed.':`${p.display_name} timed out.`);}else if(action==='ban'){if(!confirm(`Ban ${p.display_name} from chat?`))return;const {error}=await state.supabase.rpc('chat_moderate_profile',{p_target_profile_id:p.id,p_action:'ban',p_minutes:null});toast(error?'Moderation action failed.':`${p.display_name} banned.`);}}

  function insertEmoji(emoji){const i=ui.input,s=i.selectionStart??i.value.length,e=i.selectionEnd??i.value.length;i.value=i.value.slice(0,s)+emoji+i.value.slice(e);i.focus();i.setSelectionRange(s+emoji.length,s+emoji.length);syncSend();closePopovers();}
  function togglePopover(name){const target=ui.emojiPopover;if(state.activePopover===name){closePopovers();return;}closePopovers();state.activePopover=name;target.hidden=false;}
  function closePopovers(){state.activePopover='';ui.emojiPopover.hidden=true;}


  async function uploadAndSend(file,photoOnly){
    if(!state.ready)return toast('Chat is still connecting.');
    const isImage=ALLOWED_IMAGE_TYPES.has(file.type);const ext=extOf(file.name);
    if(photoOnly&&!isImage)return toast('Choose a JPG, PNG, or WEBP image.');
    if(isImage&&file.size>MAX_IMAGE_BYTES)return toast(`Images must be ${CONFIG.CHAT_MAX_IMAGE_MB||5} MB or smaller.`);
    if(!isImage&&(!ALLOWED_FILE_TYPES.has(file.type)||!ALLOWED_FILE_EXT.has(ext)))return toast('That file type is not allowed.');
    if(!isImage&&file.size>MAX_FILE_BYTES)return toast(`Files must be ${CONFIG.CHAT_MAX_FILE_MB||10} MB or smaller.`);
    const bucket=isImage?'chat-images':'chat-files';const path=`${currentProfileId()}/${crypto.randomUUID()}/${safeFilename(file.name)}`;
    try{setUploadProgress(0,`Uploading ${file.name}`);await xhrUpload(bucket,path,file,p=>setUploadProgress(p,`Uploading ${file.name}`));setUploadProgress(100,'Sending…');await insertMessage({message_type:isImage?'image':'file',attachment_path:path,attachment_name:file.name.slice(0,120),attachment_mime:file.type,attachment_size:file.size,reply_to:state.replyTo?.id||null});setReply(null);setUploadProgress(null,'');}
    catch(e){console.warn(e);setUploadProgress(null,'');toast('Upload failed. Nothing was posted.');try{await state.supabase.storage.from(bucket).remove([path]);}catch{}}
  }
  function xhrUpload(bucket,path,file,onProgress){
    return new Promise(async(resolve,reject)=>{const {data:{session}}=await state.supabase.auth.getSession();if(!session?.access_token)return reject(Error('No chat session'));const xhr=new XMLHttpRequest();xhr.open('POST',String(CONFIG.SUPABASE_URL).replace(/\/$/)+`/storage/v1/object/${bucket}/${path}`);xhr.setRequestHeader('Authorization','Bearer '+session.access_token);xhr.setRequestHeader('apikey',CONFIG.SUPABASE_PUBLISHABLE_KEY);xhr.setRequestHeader('Content-Type',file.type||'application/octet-stream');xhr.setRequestHeader('x-upsert','false');xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress(Math.round(e.loaded/e.total*100));};xhr.onload=()=>xhr.status>=200&&xhr.status<300?resolve():reject(Error(`Upload ${xhr.status}`));xhr.onerror=()=>reject(Error('Upload network error'));xhr.send(file);});
  }
  function setUploadProgress(value,label){ui.uploadState.textContent=label||'';if(value===null){ui.uploadProgress.hidden=true;ui.uploadProgress.querySelector('i').style.width='0%';return;}ui.uploadProgress.hidden=false;ui.uploadProgress.querySelector('i').style.width=`${Math.max(0,Math.min(100,value))}%`;}

  function openFlyout(which){closePopovers();state.flyout=which;ui.settingsFlyout.dataset.open=String(which==='settings');ui.onlineFlyout.dataset.open=String(which==='online');if(which==='settings')fillSettings();if(which==='online')renderOnline();}
  function closeFlyouts(){state.flyout='';ui.settingsFlyout.dataset.open='false';ui.onlineFlyout.dataset.open='false';}
  function fillSettings(){if(!state.profile||!ui.displayName)return;ui.displayName.value=state.profile.display_name||'';ui.customStatus.value=state.profile.custom_status||'';ui.presenceStatus.value=state.profile.status||'online';ui.sounds.checked=!!state.prefs.sounds;ui.compact.checked=!!state.prefs.compact;ui.reduced.checked=!!state.prefs.reducedMotion;}
  async function saveChatSettings(){
    ui.settingsError.textContent='';const displayName=safeName(ui.displayName.value),customStatus=safeText(ui.customStatus.value,80).trim(),status=ui.presenceStatus.value;
    if(displayName.length<2){ui.settingsError.textContent='Display name must be at least 2 characters.';return;}
    const {data,error}=await state.supabase.rpc('chat_update_profile',{p_display_name:displayName,p_custom_status:customStatus||null,p_status:status});
    if(error){ui.settingsError.textContent=/cooldown/i.test(error.message)?'You can change your display name once every 10 minutes.':error.message||'Could not save profile.';return;}
    if(data)state.profile={...state.profile,...data};state.profiles.set(state.profile.id,state.profile);
    state.prefs.sounds=ui.sounds.checked;state.prefs.compact=ui.compact.checked;state.prefs.reducedMotion=ui.reduced.checked;writeJSON(PREF_KEY,state.prefs);syncRootFlags();renderMessages({preserveScroll:true});
    if(state.channel){if(state.profile.status==='invisible')await state.channel.untrack();else await state.channel.track({profile_id:currentProfileId(),at:Date.now()});}
    toast('Chat settings saved.');closeFlyouts();
  }

  function setConnection(kind,text){if(!ui.connection)return;ui.dot.dataset.state=kind;ui.connection.textContent=text;}
  function syncSend(){if(ui.send)ui.send.disabled=!ui.input.value.trim()||!state.ready;}
  function autoGrowInput(){ui.input.style.height='auto';ui.input.style.height=Math.min(108,ui.input.scrollHeight)+'px';}
  function sendTypingStop(){clearTimeout(state.typingTimer);if(state.typingSent){state.typingSent=false;state.channel?.send({type:'broadcast',event:'typing',payload:{profile_id:currentProfileId(),typing:false}});}}
  function debounce(fn,ms){let t=0;return(...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),ms);};}

  function handleIncoming(m){
    const own=m.sender_profile_id===currentProfileId(); if(own){if(state.open)scrollBottom(true);return;}
    if(state.open&&isNearBottom()){scrollBottom(true);markRead();}else{state.unread++;syncUnread();ui.jump.hidden=false;ui.jump.textContent=`↓ ${state.unread} new message${state.unread===1?'':'s'}`;}
    if(state.prefs.sounds&&!isPerformance())playPing();
  }
  function playPing(){try{const A=window.AudioContext||window.webkitAudioContext;if(!A)return;const ctx=new A(),osc=ctx.createOscillator(),gain=ctx.createGain();osc.frequency.value=620;gain.gain.setValueAtTime(.025,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.11);osc.connect(gain).connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.12);setTimeout(()=>ctx.close(),180);}catch{}}
  function markRead(){if(!state.open)return;state.unread=0;state.lastReadAt=Date.now();writeJSON(READ_KEY,state.lastReadAt);syncUnread();}
  function syncUnread(){if(!ui.unread)return;ui.unread.hidden=state.unread<=0;ui.unread.textContent=state.unread>99?'99+':String(state.unread);}

  async function disconnectChat(){
    state.ready=false;state.connected=false;state.messages=[];state.profiles.clear();state.onlineIds.clear();if(state.channel&&state.supabase){try{await state.supabase.removeChannel(state.channel);}catch{}}state.channel=null;setConnection('offline','Access locked');if(state.open)closeChat();
  }

  function boot(){createUI();if(document.body.dataset.licenseState==='unlocked')setConnection('offline','Open chat to connect');window.addEventListener('blobby:license-unlocked',()=>setConnection('offline','Open chat to connect'));}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();

  window.BlobbyChat=Object.freeze({open:openChat,close:closeChat,toggle:toggleChat,state:()=>({open:state.open,ready:state.ready,online:state.onlineIds.size,profile:state.profile?{displayName:state.profile.display_name,role:state.profile.role}:null})});
})();
