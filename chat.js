'use strict';
(() => {
  const CONFIG = window.BLOBBY_CONFIG || {};
  if (CONFIG.CHAT_ENABLED === false) return;

  const GENERAL_ROOM_ID = CONFIG.CHAT_GENERAL_ROOM_ID || '00000000-0000-0000-0000-000000000001';
  const ANNOUNCEMENT_LIMIT = 60;
  const PREF_KEY = 'blobby.chat.prefs.v1';
  const READ_KEY = 'blobby.chat.lastread.v1';
  const MAX_IMAGE_BYTES = Math.max(1, Number(CONFIG.CHAT_MAX_IMAGE_MB || 5)) * 1024 * 1024;
  const MAX_FILE_BYTES = Math.max(1, Number(CONFIG.CHAT_MAX_FILE_MB || 10)) * 1024 * 1024;
  const PAGE_SIZE = 40;
  const MAX_RENDERED_MESSAGES = 140;
  const MAX_PROFILE_ROWS = 300;
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
  const PROFILE_FIELDS = 'id,display_name,username,avatar_path,banner_path,banner_color,bio,pronouns,status_emoji,status,custom_status,role,badges,is_banned,muted_until,created_at,profile_accent,profile_style,profile_gradient_top,profile_gradient_bottom,name_style,profile_links,dm_privacy,show_activity';

  const state = {
    open:false, peek:false, hoverOpened:false, ready:false, identityReady:false, connecting:false, connected:false,
    supabase:null, session:null, profile:null, profiles:new Map(), messages:[], reactions:new Map(), historyMode:false,
    activeChannel:'general', announcements:[], announcementsLoaded:false, announcementsLoading:false,
    channel:null, unsubscribePromise:null, onlineIds:new Set(), typing:new Map(), typingTimer:0, typingSent:false,
    replyTo:null, unread:0, lastReadAt:readJSON(READ_KEY, 0) || 0, oldestLoadedAt:null,
    loadingOlder:false, hasMore:true, signedUrls:new Map(), avatarUrls:new Map(), blocked:new Set(),
    prefs:{ sounds:false, compact:false, reducedMotion:false, notifications:'mentions', ...readJSON(PREF_KEY,{}) },
    activePopover:'', flyout:'', lastScrollNearBottom:true, typingRenderTimer:0, profileRenderTimer:0, profilesLoadedAt:0
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
  function isOwner(){ return state.profile?.role==='owner'; }
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
        <div class="blobby-chat-workspace">
          <aside class="blobby-chat-channels">
            <div class="blobby-chat-community-title"><strong>Blobby</strong><span>Community</span></div>

            <div class="blobby-chat-channel-group">
              <small>CHANNELS</small>
              <button class="blobby-chat-channel chat-channel-general active" type="button" data-channel="general"><b>#</b><span>general</span></button>
              <button class="blobby-chat-channel chat-channel-announcements" type="button" data-channel="announcements"><b>📣</b><span>announcements</span><em>Owner only</em></button>
            </div>

            <div class="blobby-chat-channel-group">
              <small>SOCIAL</small>
              <button class="blobby-chat-channel chat-open-dms" type="button"><b>○</b><span>Direct messages</span></button>
              <button class="blobby-chat-channel chat-open-groups" type="button"><b>◎</b><span>Groups</span></button>
              <button class="blobby-chat-channel chat-open-profile" type="button"><b>◇</b><span>My profile</span></button>
            </div>

            <div class="blobby-chat-channel-spacer"></div>

            <button class="blobby-chat-self chat-open-profile" type="button">
              <span class="blobby-chat-self-avatar">?</span>
              <span class="blobby-chat-self-copy"><strong>Blobby user</strong><small>Connecting…</small></span>
            </button>
          </aside>

          <main class="blobby-chat-core">
            <header class="blobby-chat-head">
              <div class="blobby-chat-title">
                <div class="blobby-chat-title-copy">
                  <strong><span class="blobby-chat-hash chat-room-icon">#</span> <span class="chat-room-name">general</span></strong>
                  <span class="blobby-chat-connection">Not connected</span>
                </div>
              </div>
              <div class="blobby-chat-head-actions">
                <button class="blobby-chat-presence-btn" type="button"><i class="blobby-chat-dot" data-state="offline"></i><span class="blobby-chat-online-count">0 online</span></button>
                <button class="blobby-chat-icon-btn chat-settings" type="button" aria-label="Chat settings" title="Chat settings">⚙</button>
                <button class="blobby-chat-icon-btn chat-close" type="button" aria-label="Close chat" title="Close chat">×</button>
              </div>
            </header>

            <div class="blobby-chat-roombar">
              <select class="blobby-chat-mobile-channel" aria-label="Choose chat channel">
                <option value="general"># general</option>
                <option value="announcements">📣 announcements</option>
              </select>
              <div class="blobby-chat-room-description">The main Blobby community room</div>
              <span class="blobby-chat-room-note">Be respectful • no spam</span>
            </div>

            <div class="blobby-chat-messages" role="log" aria-live="polite" aria-relevant="additions"><div class="blobby-chat-loading">Open chat to connect…</div></div>
            <div class="blobby-chat-typing" aria-live="polite"></div>

            <div class="blobby-chat-composer" data-channel="general">
              <div class="blobby-chat-replying" hidden><span></span><button type="button" aria-label="Cancel reply">×</button></div>
              <div class="blobby-chat-announcement-lock" hidden><b>📣 Announcements are posting-locked.</b><span>Only the Blobby Owner can post. Everyone else can react only.</span></div>
              <div class="blobby-chat-input-wrap"><textarea class="blobby-chat-input" rows="1" maxlength="2000" placeholder="Message #general…" aria-label="Message general chat"></textarea><button class="blobby-chat-send" type="button" disabled>Send</button></div>
              <div class="blobby-chat-tools"><button class="blobby-chat-tool chat-emoji" type="button" title="Emoji">😀</button><button class="blobby-chat-tool chat-attach" type="button" title="Attach file">📎</button><button class="blobby-chat-tool chat-photo" type="button" title="Attach photo">📷</button><span class="blobby-chat-upload-state"></span><span class="blobby-chat-upload-progress" hidden><i></i></span></div>
              <input class="chat-file-input" type="file" hidden accept=".pdf,.txt,.csv,.docx,.xlsx,.pptx,image/jpeg,image/png,image/webp">
              <input class="chat-photo-input" type="file" hidden accept="image/jpeg,image/png,image/webp">
            </div>

            <button class="blobby-chat-jump" type="button" hidden>↓ New messages</button>
          </main>

          <aside class="blobby-chat-members">
            <div class="blobby-chat-members-head">
              <strong>Members</strong>
              <span class="blobby-chat-members-count"></span>
            </div>
            <div class="blobby-chat-members-list"></div>
          </aside>
        </div>

        <div class="blobby-chat-popover chat-emoji-popover" hidden><div class="blobby-chat-popover-head"><strong>Emoji</strong><button class="blobby-chat-icon-btn" type="button" data-close-popover>×</button></div><div class="blobby-chat-emoji-grid"></div></div>

        <section class="blobby-chat-flyout chat-settings-flyout" aria-label="Chat settings"><div class="blobby-chat-flyout-head"><button class="blobby-chat-icon-btn flyout-back" type="button">←</button><strong>Chat settings</strong></div><div class="blobby-chat-flyout-body">
          <button class="blobby-chat-save chat-edit-profile" type="button">Edit profile & presence</button>
          <p class="blobby-chat-setting-note">Name, avatar, bio, status, presence, colors and links are managed in your Profile.</p>
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
      memberList:q('.blobby-chat-members-list',root),memberCount:q('.blobby-chat-members-count',root),
      selfAvatar:q('.blobby-chat-self-avatar',root),selfName:q('.blobby-chat-self-copy strong',root),selfStatus:q('.blobby-chat-self-copy small',root),
      generalChannel:q('.chat-channel-general',root),announcementsChannel:q('.chat-channel-announcements',root),mobileChannel:q('.blobby-chat-mobile-channel',root),roomIcon:q('.chat-room-icon',root),roomName:q('.chat-room-name',root),roomDescription:q('.blobby-chat-room-description',root),roomNote:q('.blobby-chat-room-note',root),composer:q('.blobby-chat-composer',root),inputWrap:q('.blobby-chat-input-wrap',root),tools:q('.blobby-chat-tools',root),announcementLock:q('.blobby-chat-announcement-lock',root),
      editProfile:q('.chat-edit-profile',root),sounds:q('.chat-sounds',root),compact:q('.chat-compact',root),reduced:q('.chat-reduced',root),saveSettings:q('.chat-save-settings',root),settingsError:q('.chat-settings-error',root),
      toasts:q('.blobby-chat-toast-stack',root),lightbox:q('.blobby-chat-lightbox',root),lightboxImg:q('.blobby-chat-lightbox img',root)
    };

    const emojiGrid=q('.blobby-chat-emoji-grid',root);
    EMOJIS.forEach(e=>{ const b=el('button','',e); b.type='button'; b.onclick=()=>insertEmoji(e); emojiGrid.append(b); });

    root.querySelectorAll('.chat-open-profile').forEach(b=>b.onclick=()=>window.BlobbyFeatures?.open?.('profile').catch?.(console.warn));
    q('.chat-open-dms',root).onclick=()=>{closeChat();setTimeout(()=>window.BlobbyFeatures?.open?.('dm').catch?.(console.warn),40);};
    q('.chat-open-groups',root).onclick=()=>{closeChat();setTimeout(()=>window.BlobbyFeatures?.open?.('group').catch?.(console.warn),40);};
    ui.generalChannel.onclick=()=>switchChannel('general');
    ui.announcementsChannel.onclick=()=>switchChannel('announcements');
    ui.mobileChannel.onchange=()=>switchChannel(ui.mobileChannel.value);

    ui.panel.inert=true;
    ui.panel.style.pointerEvents='none';
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
    ui.jump.onclick=()=>{state.historyMode=false;renderMessages();scrollBottom(true);ui.jump.hidden=true;};
    ui.messages.addEventListener('scroll',onMessagesScroll,{passive:true});
    ui.saveSettings.onclick=saveChatSettings;
    ui.editProfile.onclick=()=>{closeFlyouts();closeChat();setTimeout(()=>window.BlobbyFeatures?.open?.('profile').catch?.(console.warn),20);};
    ui.lightbox.onclick=e=>{ if(e.target===ui.lightbox||e.target.tagName==='BUTTON')ui.lightbox.hidden=true; };
    document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&state.open){ if(state.flyout){closeFlyouts();return;} if(state.activePopover){closePopovers();return;} closeChat(); } });
    window.addEventListener('online',()=>{setConnection('connecting','Reconnecting…'); if(state.open)ensureConnected(true);});
    window.addEventListener('offline',()=>setConnection('offline','Offline'));
    document.addEventListener('visibilitychange',()=>{if(!state.open)return;if(document.visibilityState==='visible')ensureConnected();else unsubscribeGeneral();});
    window.addEventListener('blobby:license-locked',disconnectChat);
    window.addEventListener('blobby:profile-updated',e=>{
      const p=e.detail?.profile;if(!p?.id)return;
      const merged={...(state.profiles.get(p.id)||{}),...p};state.profiles.set(p.id,merged);
      if(p.id===currentProfileId())state.profile={...state.profile,...merged};
      scheduleProfileRender();
    });
  }

  async function switchChannel(channel){
    if(channel!=='general'&&channel!=='announcements')return;
    if(state.activeChannel===channel){configureChannelUI();return;}
    sendTypingStop();clearTimeout(state.typingRenderTimer);state.typing.clear();ui.typing.textContent='';setReply(null);
    state.activeChannel=channel;state.historyMode=false;ui.jump.hidden=true;configureChannelUI();
    if(channel==='announcements'){
      try{await ensureIdentity(false);await loadAnnouncements(!state.announcementsLoaded);renderAnnouncements();requestAnimationFrame(()=>scrollBottom(false));}
      catch(err){console.warn('Announcements unavailable',err);ui.messages.replaceChildren(el('div','blobby-chat-empty','Announcements are unavailable right now.'));}
    }else{
      if(!state.ready)await ensureConnected();
      renderMessages();requestAnimationFrame(()=>scrollBottom(false));
    }
  }

  function configureChannelUI(){
    const announcements=state.activeChannel==='announcements';
    ui.generalChannel.classList.toggle('active',!announcements);
    ui.announcementsChannel.classList.toggle('active',announcements);
    ui.mobileChannel.value=announcements?'announcements':'general';
    ui.roomIcon.textContent=announcements?'📣':'#';
    ui.roomName.textContent=announcements?'announcements':'general';
    ui.roomDescription.textContent=announcements?'Official updates from Blobby':'The main Blobby community room';
    ui.roomNote.textContent=announcements?'Everyone can read • React only • Owner posts only':'Be respectful • no spam';
    ui.composer.dataset.channel=announcements?'announcements':'general';
    ui.replying.hidden=true;
    if(announcements&&!isOwner()){
      ui.announcementLock.hidden=false;ui.inputWrap.hidden=true;ui.tools.hidden=true;ui.input.disabled=true;ui.send.disabled=true;
    }else{
      ui.announcementLock.hidden=true;ui.inputWrap.hidden=false;ui.tools.hidden=false;ui.input.disabled=false;
      ui.attachButton.hidden=announcements;ui.photoButton.hidden=announcements;
      ui.input.placeholder=announcements?'Post an announcement…':'Message #general…';
      ui.input.setAttribute('aria-label',announcements?'Post an announcement':'Message general chat');
      ui.send.textContent=announcements?'Post':'Send';syncSend();
    }
    if(!announcements){ui.attachButton.hidden=false;ui.photoButton.hidden=false;}
  }

  async function loadAnnouncements(force=false){
    if(state.announcementsLoading||(!force&&state.announcementsLoaded))return;
    state.announcementsLoading=true;
    if(!state.announcementsLoaded)ui.messages.replaceChildren(el('div','blobby-chat-loading','Loading announcements…'));
    try{
      const {data,error}=await state.supabase.from('chat_announcements').select('id,sender_profile_id,body,created_at,updated_at,edited_at').order('created_at',{ascending:false}).limit(ANNOUNCEMENT_LIMIT);
      if(error)throw error;
      state.announcements=(data||[]).reverse();state.announcementsLoaded=true;
      await loadProfilesForMessages(state.announcements);
      await loadReactions();
    }finally{state.announcementsLoading=false;}
  }

  function renderAnnouncements(){
    if(state.activeChannel!=='announcements'||!ui.messages)return;
    ui.messages.replaceChildren();
    if(!state.announcementsLoaded){ui.messages.append(el('div','blobby-chat-loading','Loading announcements…'));return;}
    if(!state.announcements.length){ui.messages.append(el('div','blobby-chat-empty',isOwner()?'No announcements yet. Post the first update below.':'No announcements yet.'));return;}
    let lastDay='';
    for(const a of state.announcements){const dk=dayKey(a.created_at);if(dk!==lastDay){ui.messages.append(el('div','blobby-chat-day',dayLabel(a.created_at)));lastDay=dk;}ui.messages.append(announcementNode(a));}
  }

  function announcementNode(a){
    const p=state.profiles.get(a.sender_profile_id)||{id:a.sender_profile_id,display_name:'Blobby Owner',role:'owner'};
    const row=el('article','blobby-chat-msg blobby-chat-announcement');row.dataset.messageId=a.id;row.dataset.own=String(a.sender_profile_id===currentProfileId());
    row.append(avatarNode(p));
    const main=el('div','blobby-chat-msg-main');const head=el('div','blobby-chat-msg-head');appendIdentity(head,p);head.append(el('span','blobby-chat-announcement-tag','ANNOUNCEMENT'),el('time','blobby-chat-time',timeLabel(a.created_at)));if(a.edited_at)head.append(el('span','blobby-chat-edited','edited'));main.append(head,bodyNode(a.body));
    const reactions=reactionNode(a); if(reactions)main.append(reactions);
    const actions=el('div','blobby-chat-msg-actions');
    const react=el('button','blobby-chat-mini-btn','React');react.type='button';react.onclick=()=>quickReaction(a,'announcement');actions.append(react);
    if(isOwner()){
      const edit=el('button','blobby-chat-mini-btn','Edit');edit.type='button';edit.onclick=()=>editAnnouncement(a);const del=el('button','blobby-chat-mini-btn','Delete');del.type='button';del.onclick=()=>deleteAnnouncement(a);actions.append(edit,del);
    }
    main.append(actions);
    row.append(main);return row;
  }

  async function postAnnouncement(body){
    if(!isOwner())throw Error('Only the Owner can post announcements.');
    const {error}=await state.supabase.rpc('chat_post_announcement',{p_body:body});if(error)throw error;
  }
  async function editAnnouncement(a){
    if(!isOwner())return;const next=prompt('Edit announcement:',a.body||'');if(next===null)return;const body=next.trim();if(!body)return;
    const {error}=await state.supabase.rpc('chat_edit_announcement',{p_announcement_id:a.id,p_body:body});if(error)toast('Could not edit announcement.');
  }
  async function deleteAnnouncement(a){
    if(!isOwner()||!confirm('Delete this announcement?'))return;const {error}=await state.supabase.rpc('chat_delete_announcement',{p_announcement_id:a.id});if(error)toast('Could not delete announcement.');
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

    // Never stack Profile over/under Chat.
    if(window.BlobbyProfile?.state?.().open) window.BlobbyProfile.close();

    state.open=true;
    state.peek=false;
    ui.panel.inert=false;
    ui.panel.style.pointerEvents='auto';
    ui.panel.setAttribute('aria-hidden','false');
    syncRootFlags();
    appExpand();

    await ensureConnected();
    configureChannelUI();
    if(state.activeChannel==='announcements'){await loadAnnouncements(!state.announcementsLoaded);renderAnnouncements();}
    markRead();
    setTimeout(()=>ui.input.focus(),isReduced()?0:220);
  }
  function closeChat(){
    if(!state.open)return;

    markRead();
    state.open=false;
    state.peek=false;
    state.hoverOpened=false;
    closePopovers();
    closeFlyouts();

    // Hard-disable the closed overlay so an invisible panel can never block
    // the Blobby homepage or Browser WebViewer.
    ui.panel.setAttribute('aria-hidden','true');
    ui.panel.inert=true;
    ui.panel.style.pointerEvents='none';

    syncRootFlags();
    sendTypingStop();clearTimeout(state.typingRenderTimer);state.typing.clear();ui.typing.textContent='';
    unsubscribeGeneral();
    appRestore();
  }
  function toggleChat(){ state.open?closeChat():openChat(); }

  function unsubscribeGeneral(){
    state.ready=false;state.connected=false;
    if(state.unsubscribePromise)return state.unsubscribePromise;
    const ch=state.channel;state.channel=null;
    if(!ch||!state.supabase)return Promise.resolve();
    const job=state.supabase.removeChannel(ch).catch(()=>{}).finally(()=>{if(state.unsubscribePromise===job)state.unsubscribePromise=null;});
    state.unsubscribePromise=job;return job;
  }

  async function loadSupabase(){
    if(state.supabase)return state.supabase;
    if(!CONFIG.SUPABASE_URL||!CONFIG.SUPABASE_PUBLISHABLE_KEY) throw Error('Chat backend is not configured.');
    const mod=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    state.supabase=mod.createClient(CONFIG.SUPABASE_URL,CONFIG.SUPABASE_PUBLISHABLE_KEY,{auth:{storageKey:'blobby-chat-auth-v1',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
    return state.supabase;
  }

  async function ensureIdentity(force=false){
    if(state.identityReady&&!force&&state.supabase&&state.profile)return {supabase:state.supabase,session:state.session,profile:state.profile};
    const sb=await loadSupabase();
    let {data:{session}}=await sb.auth.getSession();
    if(!session){
      const {data,error}=await sb.auth.signInAnonymously();
      if(error)throw Error('Anonymous chat sign-in is not enabled in Supabase.');
      session=data.session;
    }
    state.session=session;
    await bindLicenseToChat();
    await loadBlocks();
    state.identityReady=true;
    return {supabase:state.supabase,session:state.session,profile:state.profile};
  }

  async function ensureConnected(force=false){
    if(state.ready&&!force)return;
    if(state.connecting)return;
    state.connecting=true; setConnection('connecting','Connecting…');
    try{
      await ensureIdentity(false);
      if(!state.profilesLoadedAt||Date.now()-state.profilesLoadedAt>120000)await loadProfiles();
      await loadMessages(true);
      await subscribeRealtime();
      state.ready=true; state.connected=true; setConnection('connected','Connected'); if(state.activeChannel==='general')renderMessages();else{await loadAnnouncements(!state.announcementsLoaded);renderAnnouncements();} renderOnline(); configureChannelUI();
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
    state.profile=body.profile; state.profiles.set(body.profile.id,body.profile); fillSettings(); renderSelfCard();
  }

  async function loadProfiles(){
    const {data,error}=await state.supabase.from('chat_profiles').select(PROFILE_FIELDS).limit(MAX_PROFILE_ROWS);
    if(error)throw error;
    (data||[]).forEach(p=>state.profiles.set(p.id,p));
    state.profilesLoadedAt=Date.now();
    if(state.profile&&state.profiles.has(state.profile.id))state.profile={...state.profile,...state.profiles.get(state.profile.id)};
  }

  async function loadMessages(reset=false){
    if(reset){state.messages=[];state.hasMore=true;state.oldestLoadedAt=null;state.historyMode=false;ui.messages.replaceChildren(el('div','blobby-chat-loading','Loading messages…'));}
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
    const {data}=await state.supabase.from('chat_profiles').select(PROFILE_FIELDS).in('id',ids);
    (data||[]).forEach(p=>state.profiles.set(p.id,p));
  }

  async function loadReactions(){
    const general=state.activeChannel==='general';
    const windowItems=general
      ? (state.historyMode?state.messages.slice(0,MAX_RENDERED_MESSAGES):state.messages.slice(-MAX_RENDERED_MESSAGES))
      : state.announcements.slice(-ANNOUNCEMENT_LIMIT);
    const ids=windowItems.map(m=>m.id).filter(Boolean);
    state.reactions.clear();
    if(!ids.length)return;
    if(general){
      const {data}=await state.supabase.from('chat_reactions').select('message_id,profile_id,emoji').in('message_id',ids);
      for(const r of data||[]){ if(!state.reactions.has(r.message_id))state.reactions.set(r.message_id,[]); state.reactions.get(r.message_id).push(r); }
      return;
    }
    const {data}=await state.supabase.from('chat_announcement_reactions').select('announcement_id,profile_id,emoji').in('announcement_id',ids);
    for(const r of data||[]){ if(!state.reactions.has(r.announcement_id))state.reactions.set(r.announcement_id,[]); state.reactions.get(r.announcement_id).push(r); }
  }

  async function loadBlocks(){
    if(!currentProfileId())return;
    const {data}=await state.supabase.from('chat_blocks').select('blocked_profile_id').eq('blocker_profile_id',currentProfileId());
    state.blocked=new Set((data||[]).map(x=>x.blocked_profile_id));
  }

  async function subscribeRealtime(){
    await unsubscribeGeneral();
    const key=currentProfileId()||state.session?.user?.id||crypto.randomUUID();
    const ch=state.supabase.channel('blobby-general',{config:{presence:{key},broadcast:{self:false}}});
    ch.on('postgres_changes',{event:'INSERT',schema:'public',table:'chat_messages',filter:`room_id=eq.${GENERAL_ROOM_ID}`},async payload=>{
      const m=payload.new; if(state.messages.some(x=>x.id===m.id))return; state.messages.push(m); await loadProfilesForMessages([m]); if(state.activeChannel==='general')renderMessages(); handleIncoming(m);
    });
    ch.on('postgres_changes',{event:'UPDATE',schema:'public',table:'chat_messages',filter:`room_id=eq.${GENERAL_ROOM_ID}`},payload=>{
      const i=state.messages.findIndex(x=>x.id===payload.new.id); if(i>=0){state.messages[i]=payload.new;if(state.activeChannel==='general')renderMessages({preserveScroll:true});}
    });
    ch.on('postgres_changes',{event:'INSERT',schema:'public',table:'chat_announcements'},async payload=>{
      const a=payload.new;if(state.announcements.some(x=>x.id===a.id))return;state.announcements.push(a);state.announcements=state.announcements.slice(-ANNOUNCEMENT_LIMIT);state.announcementsLoaded=true;await loadProfilesForMessages([a]);if(state.activeChannel==='announcements'){renderAnnouncements();requestAnimationFrame(()=>scrollBottom(true));}else if(state.open)toast('📣 New announcement posted.');
    });
    ch.on('postgres_changes',{event:'UPDATE',schema:'public',table:'chat_announcements'},payload=>{
      const i=state.announcements.findIndex(x=>x.id===payload.new.id);if(i>=0){state.announcements[i]=payload.new;if(state.activeChannel==='announcements')renderAnnouncements();}
    });
    ch.on('postgres_changes',{event:'DELETE',schema:'public',table:'chat_announcements'},payload=>{
      const id=payload.old?.id;if(!id)return;state.announcements=state.announcements.filter(x=>x.id!==id);if(state.activeChannel==='announcements')renderAnnouncements();
    });
    ch.on('postgres_changes',{event:'*',schema:'public',table:'chat_reactions'},()=>scheduleReactionRefresh());
    ch.on('postgres_changes',{event:'*',schema:'public',table:'chat_announcement_reactions'},()=>scheduleReactionRefresh());
    ch.on('postgres_changes',{event:'UPDATE',schema:'public',table:'chat_profiles'},payload=>{
      if(payload.new?.id){state.profiles.set(payload.new.id,{...(state.profiles.get(payload.new.id)||{}),...payload.new});if(payload.new.id===currentProfileId())state.profile={...state.profile,...payload.new};scheduleProfileRender();}
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
    if(state.activeChannel!=='general'||!state.channel||!state.connected)return;
    clearTimeout(state.typingTimer);
    if(!state.typingSent){state.typingSent=true;state.channel.send({type:'broadcast',event:'typing',payload:{profile_id:currentProfileId(),typing:true}});}
    state.typingTimer=setTimeout(()=>{state.typingSent=false;state.channel?.send({type:'broadcast',event:'typing',payload:{profile_id:currentProfileId(),typing:false}});},2200);
  }

  function renderTyping(){
    if(state.activeChannel!=='general'){ui.typing.textContent='';return;}
    const now=Date.now(); for(const [id,until] of state.typing)if(until<now)state.typing.delete(id);
    const names=[...state.typing.keys()].map(id=>state.profiles.get(id)?.display_name).filter(Boolean).slice(0,3);
    if(!names.length){ui.typing.textContent='';return;}
    let text=names.length===1?`${names[0]} is typing`:names.length===2?`${names[0]} and ${names[1]} are typing`:'Several people are typing';
    ui.typing.replaceChildren(document.createTextNode(text)); const dots=el('span','blobby-chat-typing-dots');dots.innerHTML='<i></i><i></i><i></i>';ui.typing.append(dots);
    clearTimeout(state.typingRenderTimer);state.typingRenderTimer=setTimeout(renderTyping,1800);
  }

  function renderOnline(){
    const visible=[...state.onlineIds].map(id=>state.profiles.get(id)).filter(Boolean).filter(p=>p.status!=='invisible').sort((a,b)=>roleRank(b.role)-roleRank(a.role)||a.display_name.localeCompare(b.display_name));
    ui.onlineCount.textContent=`${visible.length} online`;

    if(ui.onlineList){
      ui.onlineList.replaceChildren();
      if(!visible.length)ui.onlineList.append(el('div','blobby-chat-empty','Nobody else is showing as online.'));
      else for(const p of visible)ui.onlineList.append(memberRow(p,true));
    }

    renderMemberSidebar(visible);
    renderSelfCard();
  }

  function renderMemberSidebar(visible){
    if(!ui.memberList)return;
    ui.memberList.replaceChildren();

    const onlineSet=new Set(visible.map(p=>p.id));
    const all=[...state.profiles.values()]
      .filter(p=>p.status!=='invisible'||p.id===currentProfileId())
      .sort((a,b)=>roleRank(b.role)-roleRank(a.role)||Number(onlineSet.has(b.id))-Number(onlineSet.has(a.id))||a.display_name.localeCompare(b.display_name))
      .slice(0,(isPerformance()||window.BlobbyPerformance?.lowEnd?.())?60:120);

    ui.memberCount.textContent=`${visible.length} online`;

    const groups=[
      ['OWNER / ADMIN',all.filter(p=>['owner','admin'].includes(p.role))],
      ['MODERATOR',all.filter(p=>p.role==='moderator')],
      ['ONLINE',all.filter(p=>p.role==='user'&&onlineSet.has(p.id))],
      ['OFFLINE',all.filter(p=>p.role==='user'&&!onlineSet.has(p.id))]
    ];

    for(const [label,rows] of groups){
      if(!rows.length)continue;
      const head=el('div','blobby-chat-member-group',`${label} — ${rows.length}`);
      ui.memberList.append(head);
      for(const p of rows)ui.memberList.append(memberRow(p,onlineSet.has(p.id)));
    }
  }

  function memberRow(p,online){
    const row=el('button','blobby-chat-online-user');
    row.type='button';
    row.dataset.online=String(!!online);
    row.onclick=()=>window.BlobbyFeatures?.open?.('profile',p.id).catch?.(console.warn);
    row.append(avatarNode(p));

    const copy=el('div','blobby-chat-online-copy');
    const strong=el('strong');
    appendIdentity(strong,p);
    copy.append(strong,el('span','',p.show_activity===false?'':`${p.status_emoji||''}${p.status_emoji?' ':''}${p.custom_status||(online?statusLabel(p.status):'Offline')}`));
    row.append(copy);
    return row;
  }

  function renderSelfCard(){
    if(!state.profile||!ui.selfName)return;
    ui.selfName.textContent=state.profile.display_name||'Blobby user';
    applyProfileNameStyle(ui.selfName,state.profile);
    ui.selfStatus.textContent=state.profile.show_activity===false?'':`${state.profile.status_emoji||''}${state.profile.status_emoji?' ':''}${state.profile.custom_status||statusLabel(state.profile.status)}`;
    ui.selfAvatar.textContent=initials(state.profile.display_name);
    ui.selfAvatar.style.backgroundImage='';

    if(state.profile.avatar_path){
      avatarUrl(state.profile.avatar_path).then(url=>{
        if(!url||!ui.selfAvatar?.isConnected)return;
        ui.selfAvatar.textContent='';
        ui.selfAvatar.style.backgroundImage=`url("${url.replace(/"/g,'\\"')}")`;
      });
    }
  }

  function roleRank(role){return role==='owner'?4:role==='admin'?3:role==='moderator'?2:1;}
  function statusLabel(s){return s==='away'?'Away':s==='dnd'?'Do Not Disturb':'Online';}

  function renderMessages({preserveScroll=false}={}){
    if(state.activeChannel!=='general'||!ui.messages)return;
    const oldHeight=ui.messages.scrollHeight, oldTop=ui.messages.scrollTop, nearBottom=isNearBottom();
    ui.messages.replaceChildren();
    if(state.hasMore&&state.messages.length){const older=el('button','blobby-chat-mini-btn','Load older messages');older.style.display='block';older.style.margin='0 auto 8px';older.onclick=loadOlder;ui.messages.append(older);}
    if(!state.messages.length){ui.messages.append(el('div','blobby-chat-empty','No messages yet. Say hi 👋'));return;}
    let lastDay='', dividerShown=false;
    const visibleMessages=state.historyMode?state.messages.slice(0,MAX_RENDERED_MESSAGES):state.messages.slice(-MAX_RENDERED_MESSAGES);
    if(state.messages.length>visibleMessages.length){const note=el('div','blobby-chat-window-note',`Showing latest ${visibleMessages.length} messages`);ui.messages.append(note);}
    for(const m of visibleMessages){
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

  async function avatarUrl(path){
    if(!path)return'';
    const cached=state.avatarUrls.get(path);
    if(cached&&cached.until>Date.now())return cached.url;
    try{
      const {data,error}=await state.supabase.storage.from('chat-avatars').createSignedUrl(path,3600);
      if(error||!data?.signedUrl)return'';
      state.avatarUrls.set(path,{url:data.signedUrl,until:Date.now()+3300000});
      return data.signedUrl;
    }catch{return'';}
  }

  function avatarNode(p){
    const a=el('button','blobby-chat-avatar');
    a.type='button';
    a.textContent=initials(p?.display_name);
    a.title=p?.display_name||'Profile';
    a.onclick=e=>{e.stopPropagation();window.BlobbyFeatures?.open?.('profile',p?.id).catch?.(console.warn);};

    if(p?.avatar_path){
      avatarUrl(p.avatar_path).then(url=>{
        if(!url||!a.isConnected)return;
        a.textContent='';
        const img=new Image();
        img.alt='';
        img.src=url;
        a.append(img);
      });
    }
    return a;
  }

  function applyProfileNameStyle(node,p){
    if(!node)return;
    const s=(p&&typeof p.name_style==='object'&&p.name_style)||{};
    const color=/^#[0-9a-f]{6}$/i.test(s.color||'')?s.color:'#bdfbd7';
    const color2=/^#[0-9a-f]{6}$/i.test(s.color2||'')?s.color2:'#ff4b93';
    const angle=Number.isFinite(+s.angle)?Math.max(0,Math.min(360,+s.angle)):90;

    node.style.removeProperty('background');
    node.style.removeProperty('-webkit-background-clip');
    node.style.removeProperty('background-clip');
    node.style.removeProperty('-webkit-text-fill-color');
    node.style.removeProperty('color');

    if(s.mode==='gradient'){
      node.style.background=`linear-gradient(${angle}deg,${color},${color2})`;
      node.style.webkitBackgroundClip='text';
      node.style.backgroundClip='text';
      node.style.webkitTextFillColor='transparent';
      node.style.color='transparent';
    }else{
      node.style.color=color;
    }
  }

  function appendIdentity(parent,p){
    if(isOwnerProfile(p))parent.append(el('span','blobby-chat-owner-badge','OWNER'));
    else if(p?.role==='admin')parent.append(el('span','blobby-chat-mod-badge','ADMIN'));
    else if(p?.role==='moderator')parent.append(el('span','blobby-chat-mod-badge','MOD'));

    const name=el('button','blobby-chat-name',p?.display_name||'Unknown');
    name.type='button';
    applyProfileNameStyle(name,p);
    name.onclick=e=>{e.stopPropagation();window.BlobbyFeatures?.open?.('profile',p?.id).catch?.(console.warn);};
    parent.append(name);
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
    const kind=state.activeChannel==='announcements'?'announcement':'message';
    const box=el('div','blobby-chat-reactions'); for(const [emoji,rows] of grouped){const b=el('button','blobby-chat-reaction',`${emoji} ${rows.length}`);b.type='button';b.dataset.mine=String(rows.some(r=>r.profile_id===currentProfileId()));b.onclick=()=>toggleReaction(m,emoji,kind);box.append(b);}return box;
  }

  async function loadOlder(){if(state.activeChannel!=='general'||state.loadingOlder||!state.hasMore)return;state.loadingOlder=true;const oldHeight=ui.messages.scrollHeight;try{state.historyMode=true;await loadMessages(false);renderMessages({preserveScroll:true});ui.messages.scrollTop=ui.messages.scrollHeight-oldHeight;ui.jump.hidden=false;ui.jump.textContent='↓ Back to latest';}catch(e){toast('Could not load older messages.');}finally{state.loadingOlder=false;}}
  function onMessagesScroll(){state.lastScrollNearBottom=isNearBottom();if(state.activeChannel!=='general')return; if(ui.messages.scrollTop<80&&state.hasMore&&!state.loadingOlder)loadOlder(); if(isNearBottom()&&!state.historyMode){ui.jump.hidden=true;if(state.open)markRead();}}
  function isNearBottom(){return ui.messages.scrollHeight-ui.messages.scrollTop-ui.messages.clientHeight<90;}
  function scrollBottom(smooth=true){ui.messages.scrollTo({top:ui.messages.scrollHeight,behavior:(smooth&&!isReduced())?'smooth':'auto'});}
  function scrollToMessage(id){const n=ui.messages.querySelector(`[data-message-id="${CSS.escape(id)}"]`);if(n)n.scrollIntoView({block:'center',behavior:isReduced()?'auto':'smooth'});}

  async function sendText(){
    const body=ui.input.value.trim(); if(!body||!state.ready)return; ui.send.disabled=true;
    try{
      if(state.activeChannel==='announcements')await postAnnouncement(body);
      else await insertMessage({body,message_type:'text',reply_to:state.replyTo?.id||null});
      ui.input.value='';autoGrowInput();setReply(null);sendTypingStop();
    }
    catch(e){toast(state.activeChannel==='announcements'?(isOwner()?'Announcement could not be posted.':'Only the Owner can post announcements.'):friendlyDbError(e));}finally{syncSend();}
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
    if(state.activeChannel==='announcements')return toast('Announcements are text-only.');
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
  function fillSettings(){if(!state.profile||!ui.sounds)return;ui.sounds.checked=!!state.prefs.sounds;ui.compact.checked=!!state.prefs.compact;ui.reduced.checked=!!state.prefs.reducedMotion;}
  async function saveChatSettings(){
    ui.settingsError.textContent='';state.prefs.sounds=ui.sounds.checked;state.prefs.compact=ui.compact.checked;state.prefs.reducedMotion=ui.reduced.checked;writeJSON(PREF_KEY,state.prefs);syncRootFlags();
    toast('Chat settings saved.');closeFlyouts();
  }

  const scheduleReactionRefresh=debounce(async()=>{if(!state.open||!state.ready)return;try{await loadReactions();if(state.activeChannel==='general')renderMessages({preserveScroll:true});else if(state.activeChannel==='announcements')renderAnnouncements();}catch{}},160);
  function scheduleProfileRender(){clearTimeout(state.profileRenderTimer);state.profileRenderTimer=setTimeout(()=>{if(!state.open)return;if(state.activeChannel==='general')renderMessages({preserveScroll:true});else renderAnnouncements();renderOnline();renderSelfCard();fillSettings();configureChannelUI();},90);}

  function setConnection(kind,text){if(!ui.connection)return;ui.dot.dataset.state=kind;ui.connection.textContent=text;}
  function syncSend(){if(!ui.send)return;ui.send.disabled=!ui.input.value.trim()||!state.ready||(state.activeChannel==='announcements'&&!isOwner());}
  function autoGrowInput(){ui.input.style.height='auto';ui.input.style.height=Math.min(108,ui.input.scrollHeight)+'px';}
  function sendTypingStop(){clearTimeout(state.typingTimer);if(state.typingSent){state.typingSent=false;state.channel?.send({type:'broadcast',event:'typing',payload:{profile_id:currentProfileId(),typing:false}});}}
  function debounce(fn,ms){let t=0;return(...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),ms);};}

  function handleIncoming(m){
    const own=m.sender_profile_id===currentProfileId(); if(own){if(state.open&&state.activeChannel==='general')scrollBottom(true);return;}
    if(state.open&&state.activeChannel==='general'&&isNearBottom()&&!state.historyMode){scrollBottom(true);markRead();}
    else{state.unread++;syncUnread();if(state.activeChannel==='general'){ui.jump.hidden=false;ui.jump.textContent=`↓ ${state.unread} new message${state.unread===1?'':'s'}`;}}
    if(state.prefs.sounds&&!isPerformance())playPing();
  }
  function playPing(){try{const A=window.AudioContext||window.webkitAudioContext;if(!A)return;const ctx=new A(),osc=ctx.createOscillator(),gain=ctx.createGain();osc.frequency.value=620;gain.gain.setValueAtTime(.025,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.11);osc.connect(gain).connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.12);setTimeout(()=>ctx.close(),180);}catch{}}
  function markRead(){if(!state.open)return;state.unread=0;state.lastReadAt=Date.now();writeJSON(READ_KEY,state.lastReadAt);syncUnread();}
  function syncUnread(){if(!ui.unread)return;ui.unread.hidden=state.unread<=0;ui.unread.textContent=state.unread>99?'99+':String(state.unread);}

  async function disconnectChat(){
    state.ready=false;state.identityReady=false;state.connected=false;state.session=null;state.profile=null;state.messages=[];state.announcements=[];state.announcementsLoaded=false;state.profiles.clear();state.onlineIds.clear();await unsubscribeGeneral();setConnection('offline','Access locked');if(state.open)closeChat();
  }

  function boot(){createUI();if(document.body.dataset.licenseState==='unlocked')setConnection('offline','Open chat to connect');window.addEventListener('blobby:license-unlocked',()=>setConnection('offline','Open chat to connect'));}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();

  window.BlobbyChat=Object.freeze({open:openChat,close:closeChat,toggle:toggleChat,backend:async()=>{const x=await ensureIdentity(false);return {supabase:x.supabase,session:x.session,profile:{...x.profile}};},profiles:()=>[...state.profiles.values()].map(p=>({...p})),upsertProfile:p=>{if(p?.id)state.profiles.set(p.id,{...(state.profiles.get(p.id)||{}),...p});},state:()=>({open:state.open,ready:state.ready,channel:state.activeChannel,online:state.onlineIds.size,profile:state.profile?{id:state.profile.id,displayName:state.profile.display_name,role:state.profile.role}:null})});
})();
