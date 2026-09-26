'use strict';
(() => {
  const CONFIG=window.BLOBBY_CONFIG||{};
  if(CONFIG.CHAT_ENABLED===false)return;

  const MAX_IMAGE_BYTES=Math.max(1,Number(CONFIG.CHAT_MAX_IMAGE_MB||5))*1024*1024;
  const MAX_FILE_BYTES=Math.max(1,Number(CONFIG.CHAT_MAX_FILE_MB||10))*1024*1024;
  const PAGE_SIZE=60;
  const ALLOWED_IMAGE_TYPES=new Set(['image/jpeg','image/png','image/webp']);
  const ALLOWED_FILE_TYPES=new Set([
    'application/pdf','text/plain','text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]);
  const ALLOWED_FILE_EXT=new Set(['pdf','txt','csv','docx','xlsx','pptx']);
  const QUICK_REACTIONS=['👍','❤️','😂','🔥','💯','👀'];

  const state={
    open:false,ready:false,connecting:false,supabase:null,session:null,profile:null,
    profiles:new Map(),conversations:[],activeId:'',messages:[],reactions:new Map(),
    oldestLoadedAt:null,hasMore:true,loadingOlder:false,replyTo:null,signedUrls:new Map(),
    blocked:new Set(),inboxChannel:null,pollTimer:0,refreshTimer:0,threadRefreshTimer:0
  };
  let ui={};

  function q(sel,root=document){return root.querySelector(sel);}
  function el(tag,cls='',text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
  function safeText(v,max=4000){return String(v??'').replace(/\u0000/g,'').slice(0,max);}
  function safeFilename(name){const cleaned=String(name||'file').replace(/[^a-zA-Z0-9._-]+/g,'_').replace(/^\.+/,'').slice(-90);return cleaned||'file';}
  function extOf(name){return String(name||'').split('.').pop()?.toLowerCase()||'';}
  function initials(name){const p=String(name||'?').trim().split(/\s+/).filter(Boolean);return ((p[0]?.[0]||'?')+(p.length>1?(p.at(-1)?.[0]||''):'')).toUpperCase().slice(0,2);}
  function currentProfileId(){return state.profile?.id||'';}
  function isReduced(){return document.documentElement.dataset.reduced==='true'||matchMedia('(prefers-reduced-motion: reduce)').matches;}
  function humanBytes(bytes){const n=Number(bytes)||0;if(n<1024)return `${n} B`;if(n<1024*1024)return `${(n/1024).toFixed(n<10240?1:0)} KB`;return `${(n/1024/1024).toFixed(1)} MB`;}
  function timeLabel(v){const d=new Date(v);return d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});}
  function dayKey(v){const d=new Date(v);return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;}
  function dayLabel(v){const d=new Date(v),now=new Date(),y=new Date(Date.now()-86400000);if(dayKey(d)===dayKey(now))return'Today';if(dayKey(d)===dayKey(y))return'Yesterday';return d.toLocaleDateString([],{month:'short',day:'numeric',year:d.getFullYear()===now.getFullYear()?undefined:'numeric'});}
  function friendlyError(e){const s=String(e?.message||e||'');if(/Unable to start conversation|block/i.test(s))return'You cannot message this person right now.';if(/muted/i.test(s))return'You are currently timed out from sending messages.';if(/banned/i.test(s))return'Your chat access is banned.';if(/row-level security|policy/i.test(s))return'That action is not allowed.';return s||'Something went wrong.';}
  function previewMessage(m){if(!m)return'No messages yet';if(m.deleted_at)return'Message deleted';if(m.body)return m.body.replace(/\s+/g,' ').slice(0,80);if(m.message_type==='image')return'📷 Photo';if(m.message_type==='file')return`📎 ${m.attachment_name||'File'}`;return'Message';}
  function debounce(fn,ms){let t=0;return(...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),ms);};}

  function toast(text){if(!ui.toasts)return;const n=el('div','blobby-dm-toast',text);ui.toasts.append(n);setTimeout(()=>n.remove(),2600);}
  function appExpand(){try{window.BlobbyAppUI?.expand?.('chat');}catch{}}
  function appRestore(){try{window.BlobbyAppUI?.restore?.();}catch{}}

  function createUI(){
    const root=el('div','blobby-dm-root');root.id='blobbyDmRoot';root.dataset.open='false';
    root.innerHTML=`
      <div class="blobby-dm-backdrop"></div>
      <section class="blobby-dm-shell" aria-label="Direct messages" aria-hidden="true">
        <aside class="blobby-dm-inbox">
          <header class="blobby-dm-inbox-head">
            <div><span>PRIVATE</span><strong>Direct Messages</strong></div>
            <div class="blobby-dm-head-actions"><button class="blobby-dm-new" type="button" title="New message" aria-label="New message">＋</button><button class="blobby-dm-close" type="button" title="Close DMs" aria-label="Close DMs">×</button></div>
          </header>
          <label class="blobby-dm-search"><span>⌕</span><input type="search" placeholder="Search conversations" autocomplete="off"></label>
          <div class="blobby-dm-list hide-scrollbar"></div>
          <div class="blobby-dm-picker" hidden>
            <div class="blobby-dm-picker-head"><strong>New message</strong><button type="button" aria-label="Close people picker">×</button></div>
            <label class="blobby-dm-search"><span>⌕</span><input type="search" placeholder="Find a person" autocomplete="off"></label>
            <div class="blobby-dm-people hide-scrollbar"></div>
          </div>
        </aside>
        <main class="blobby-dm-thread" data-empty="true">
          <div class="blobby-dm-empty"><div class="blobby-dm-empty-icon">✉</div><strong>Your messages</strong><span>Choose a conversation or start a new one.</span><button class="blobby-dm-empty-new" type="button">New message</button></div>
          <div class="blobby-dm-thread-ui" hidden>
            <header class="blobby-dm-thread-head"><button class="blobby-dm-back" type="button" aria-label="Back to conversations">←</button><div class="blobby-dm-thread-person"></div><div class="blobby-dm-thread-actions"><button class="blobby-dm-block" type="button">Block</button></div></header>
            <div class="blobby-dm-messages hide-scrollbar" role="log" aria-live="polite"></div>
            <div class="blobby-dm-composer">
              <div class="blobby-dm-replying" hidden><span></span><button type="button" aria-label="Cancel reply">×</button></div>
              <div class="blobby-dm-input-wrap"><textarea rows="1" maxlength="2000" placeholder="Message…" aria-label="Direct message"></textarea><button class="blobby-dm-send" type="button" disabled>Send</button></div>
              <div class="blobby-dm-tools"><button class="blobby-dm-emoji" type="button" title="React / emoji">😀</button><button class="blobby-dm-attach" type="button" title="Attach file">📎</button><button class="blobby-dm-photo" type="button" title="Attach photo">📷</button><span class="blobby-dm-upload-state"></span><span class="blobby-dm-upload-progress" hidden><i></i></span></div>
              <input class="blobby-dm-file-input" type="file" hidden accept=".pdf,.txt,.csv,.docx,.xlsx,.pptx,image/jpeg,image/png,image/webp">
              <input class="blobby-dm-photo-input" type="file" hidden accept="image/jpeg,image/png,image/webp">
            </div>
          </div>
        </main>
        <div class="blobby-dm-toast-stack"></div>
        <div class="blobby-dm-lightbox" hidden><button type="button" aria-label="Close image">×</button><img alt="Shared image preview"></div>
      </section>`;
    document.body.append(root);
    ui={
      root,shell:q('.blobby-dm-shell',root),backdrop:q('.blobby-dm-backdrop',root),close:q('.blobby-dm-close',root),newButton:q('.blobby-dm-new',root),emptyNew:q('.blobby-dm-empty-new',root),
      search:q('.blobby-dm-search input',root),list:q('.blobby-dm-list',root),picker:q('.blobby-dm-picker',root),pickerClose:q('.blobby-dm-picker-head button',root),pickerSearch:q('.blobby-dm-picker .blobby-dm-search input',root),people:q('.blobby-dm-people',root),
      thread:q('.blobby-dm-thread',root),empty:q('.blobby-dm-empty',root),threadUI:q('.blobby-dm-thread-ui',root),threadPerson:q('.blobby-dm-thread-person',root),back:q('.blobby-dm-back',root),block:q('.blobby-dm-block',root),messages:q('.blobby-dm-messages',root),
      replying:q('.blobby-dm-replying',root),input:q('.blobby-dm-input-wrap textarea',root),send:q('.blobby-dm-send',root),emoji:q('.blobby-dm-emoji',root),attach:q('.blobby-dm-attach',root),photo:q('.blobby-dm-photo',root),fileInput:q('.blobby-dm-file-input',root),photoInput:q('.blobby-dm-photo-input',root),uploadState:q('.blobby-dm-upload-state',root),uploadProgress:q('.blobby-dm-upload-progress',root),toasts:q('.blobby-dm-toast-stack',root),lightbox:q('.blobby-dm-lightbox',root),lightboxImg:q('.blobby-dm-lightbox img',root)
    };
    ui.close.onclick=closeDM;ui.backdrop.onclick=closeDM;ui.newButton.onclick=openPicker;ui.emptyNew.onclick=openPicker;ui.pickerClose.onclick=closePicker;ui.search.oninput=renderConversationList;ui.pickerSearch.oninput=renderPeople;
    ui.back.onclick=()=>{state.activeId='';renderConversationList();showThread(false);};ui.block.onclick=toggleBlock;
    ui.replying.querySelector('button').onclick=()=>setReply(null);ui.input.addEventListener('input',()=>{autoGrow();syncSend();});ui.input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendText();}});ui.send.onclick=sendText;
    ui.emoji.onclick=()=>{const x=prompt(`Insert emoji:\n${QUICK_REACTIONS.join('  ')}`,'😀');if(x){const emoji=Array.from(x.trim())[0]||'';if(emoji)insertEmoji(emoji);}};
    ui.attach.onclick=()=>ui.fileInput.click();ui.photo.onclick=()=>ui.photoInput.click();
    ui.fileInput.onchange=()=>{const f=ui.fileInput.files?.[0];ui.fileInput.value='';if(f)uploadAndSend(f,false);};ui.photoInput.onchange=()=>{const f=ui.photoInput.files?.[0];ui.photoInput.value='';if(f)uploadAndSend(f,true);};
    ui.lightbox.onclick=e=>{if(e.target===ui.lightbox||e.target.tagName==='BUTTON')ui.lightbox.hidden=true;};
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.open){if(!ui.picker.hidden){closePicker();return;}closeDM();}});
    window.addEventListener('blobby:license-locked',disconnectDM);
  }

  async function ensureIdentity(){
    if(state.ready&&state.supabase&&state.profile)return;
    if(state.connecting)return;
    state.connecting=true;
    try{
      if(!window.BlobbyChat?.backend)throw Error('Chat identity is unavailable.');
      const backend=await window.BlobbyChat.backend();
      state.supabase=backend.supabase;state.session=backend.session;state.profile=backend.profile;
      await Promise.all([loadProfiles(),loadBlocks()]);
      state.ready=true;
    }finally{state.connecting=false;}
  }

  async function openDM(){
    if(document.body.dataset.licenseState!=='unlocked')return;
    if(window.BlobbyChat?.state?.().open)window.BlobbyChat.close();
    state.open=true;ui.root.dataset.open='true';ui.shell.setAttribute('aria-hidden','false');document.documentElement.dataset.dmOpen='true';appExpand();
    ui.list.replaceChildren(el('div','blobby-dm-loading','Loading conversations…'));
    try{await ensureIdentity();await refreshAll();await subscribeRealtime();startPolling();}
    catch(e){console.warn('Blobby DM connection failed',e);ui.list.replaceChildren(el('div','blobby-dm-empty-list',friendlyError(e)));}
  }
  function closeDM(){if(!state.open)return;state.open=false;ui.root.dataset.open='false';ui.shell.setAttribute('aria-hidden','true');delete document.documentElement.dataset.dmOpen;closePicker();stopPolling();unsubscribeRealtime();appRestore();}
  function toggleDM(){state.open?closeDM():openDM();}

  async function disconnectDM(){state.ready=false;state.session=null;state.profile=null;state.profiles.clear();state.conversations=[];state.messages=[];state.reactions.clear();await unsubscribeRealtime();if(state.open)closeDM();}

  async function loadProfiles(){const {data,error}=await state.supabase.from('chat_profiles').select('id,display_name,avatar_path,bio,status,custom_status,role,is_banned,muted_until,created_at').limit(1000);if(error)throw error;state.profiles.clear();for(const p of data||[])state.profiles.set(p.id,p);}
  async function loadBlocks(){const {data,error}=await state.supabase.from('chat_blocks').select('blocked_profile_id').eq('blocker_profile_id',currentProfileId());if(error){state.blocked.clear();return;}state.blocked=new Set((data||[]).map(x=>x.blocked_profile_id));}

  async function refreshAll(){await Promise.all([loadProfiles(),loadBlocks()]);await loadConversations();if(state.activeId){const exists=state.conversations.some(c=>c.id===state.activeId);if(exists)await loadMessages(true);else{state.activeId='';showThread(false);}}}

  async function loadConversations(){
    const me=currentProfileId();if(!me)return;
    const {data:mine,error:e1}=await state.supabase.from('chat_dm_members').select('conversation_id,last_read_at').eq('profile_id',me);if(e1)throw e1;
    const ids=(mine||[]).map(x=>x.conversation_id);if(!ids.length){state.conversations=[];renderConversationList();return;}
    const [{data:convs,error:e2},{data:members,error:e3},{data:recent,error:e4}]=await Promise.all([
      state.supabase.from('chat_dm_conversations').select('id,created_at,updated_at').in('id',ids),
      state.supabase.from('chat_dm_members').select('conversation_id,profile_id,last_read_at').in('conversation_id',ids),
      state.supabase.from('chat_dm_messages').select('id,conversation_id,sender_profile_id,body,message_type,attachment_name,deleted_at,created_at').in('conversation_id',ids).order('created_at',{ascending:false}).limit(500)
    ]);if(e2)throw e2;if(e3)throw e3;if(e4)throw e4;
    const mineMap=new Map((mine||[]).map(x=>[x.conversation_id,x]));const memberMap=new Map();for(const m of members||[]){if(!memberMap.has(m.conversation_id))memberMap.set(m.conversation_id,[]);memberMap.get(m.conversation_id).push(m);}
    const latest=new Map(),unread=new Map();
    for(const m of recent||[]){if(!latest.has(m.conversation_id))latest.set(m.conversation_id,m);const lr=mineMap.get(m.conversation_id)?.last_read_at;if(m.sender_profile_id!==me&&(!lr||new Date(m.created_at)>new Date(lr)))unread.set(m.conversation_id,(unread.get(m.conversation_id)||0)+1);}
    state.conversations=(convs||[]).map(c=>{const otherRow=(memberMap.get(c.id)||[]).find(m=>m.profile_id!==me);const other=state.profiles.get(otherRow?.profile_id)||{id:otherRow?.profile_id||'',display_name:'Unknown',role:'user'};return{...c,last_read_at:mineMap.get(c.id)?.last_read_at||null,other,lastMessage:latest.get(c.id)||null,unread:unread.get(c.id)||0};}).sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at));
    renderConversationList();dispatchUnread();
  }

  function renderConversationList(){
    if(!ui.list)return;const term=(ui.search?.value||'').trim().toLowerCase();const rows=state.conversations.filter(c=>!term||String(c.other?.display_name||'').toLowerCase().includes(term));ui.list.replaceChildren();
    if(!rows.length){ui.list.append(el('div','blobby-dm-empty-list',term?'No conversations match that search.':'No DMs yet. Start a new message.'));return;}
    for(const c of rows){const b=el('button','blobby-dm-conversation');b.type='button';b.dataset.active=String(c.id===state.activeId);b.onclick=()=>openConversation(c.id);b.append(avatarNode(c.other));const copy=el('span','blobby-dm-conversation-copy');const top=el('span','blobby-dm-conversation-top');const name=el('strong');appendIdentity(name,c.other);top.append(name,el('time','',c.lastMessage?timeLabel(c.lastMessage.created_at):''));const bottom=el('span','blobby-dm-conversation-bottom');bottom.append(el('span','',previewMessage(c.lastMessage)));if(c.unread>0)bottom.append(el('b','blobby-dm-unread',c.unread>99?'99+':String(c.unread)));copy.append(top,bottom);b.append(copy);ui.list.append(b);}
  }

  function openPicker(){ui.picker.hidden=false;ui.pickerSearch.value='';renderPeople();setTimeout(()=>ui.pickerSearch.focus(),10);}
  function closePicker(){if(ui.picker)ui.picker.hidden=true;}
  function renderPeople(){
    const term=(ui.pickerSearch?.value||'').trim().toLowerCase();const existing=new Map(state.conversations.map(c=>[c.other.id,c.id]));const people=[...state.profiles.values()].filter(p=>p.id!==currentProfileId()&&!p.is_banned&&(!term||p.display_name.toLowerCase().includes(term))).sort((a,b)=>a.display_name.localeCompare(b.display_name));ui.people.replaceChildren();
    if(!people.length){ui.people.append(el('div','blobby-dm-empty-list','No people found.'));return;}
    for(const p of people){const row=el('button','blobby-dm-person');row.type='button';row.append(avatarNode(p));const copy=el('span','blobby-dm-person-copy');const name=el('strong');appendIdentity(name,p);copy.append(name,el('small','',existing.has(p.id)?'Open conversation':state.blocked.has(p.id)?'Blocked':'Start a private message'));row.append(copy);row.onclick=()=>existing.has(p.id)?openConversation(existing.get(p.id)):startDM(p);ui.people.append(row);}
  }

  async function startDM(p){
    try{const {data,error}=await state.supabase.rpc('chat_start_dm',{target_profile_id:p.id});if(error)throw error;closePicker();await loadConversations();await openConversation(data);}
    catch(e){toast(friendlyError(e));}
  }

  async function openConversation(id){state.activeId=id;setReply(null);renderConversationList();showThread(true);ui.messages.replaceChildren(el('div','blobby-dm-loading','Loading messages…'));try{await loadMessages(true);await markRead();renderThreadHead();setTimeout(()=>ui.input.focus(),30);}catch(e){ui.messages.replaceChildren(el('div','blobby-dm-empty-list',friendlyError(e)));}}
  function showThread(show){ui.thread.dataset.empty=String(!show);ui.empty.hidden=show;ui.threadUI.hidden=!show;if(!show)renderConversationList();}
  function activeConversation(){return state.conversations.find(c=>c.id===state.activeId)||null;}
  function renderThreadHead(){const c=activeConversation();if(!c)return;ui.threadPerson.replaceChildren(avatarNode(c.other));const copy=el('div','blobby-dm-thread-person-copy');const name=el('strong');appendIdentity(name,c.other);copy.append(name,el('span','',c.other.custom_status||statusLabel(c.other.status)));ui.threadPerson.append(copy);const blocked=state.blocked.has(c.other.id);ui.block.textContent=blocked?'Unblock':'Block';ui.block.dataset.blocked=String(blocked);syncSend();}

  async function loadMessages(reset=false){
    if(!state.activeId)return;if(reset){state.messages=[];state.reactions.clear();state.oldestLoadedAt=null;state.hasMore=true;}
    let query=state.supabase.from('chat_dm_messages').select('*').eq('conversation_id',state.activeId).order('created_at',{ascending:false}).limit(PAGE_SIZE);if(state.oldestLoadedAt)query=query.lt('created_at',state.oldestLoadedAt);const {data,error}=await query;if(error)throw error;const batch=(data||[]).reverse();if(batch.length<PAGE_SIZE)state.hasMore=false;if(batch.length)state.oldestLoadedAt=batch[0].created_at;state.messages=reset?batch:[...batch,...state.messages];await loadReactions();renderMessages(reset?{scrollBottom:true}:{preserve:true});}
  async function loadReactions(){const ids=state.messages.map(m=>m.id);state.reactions.clear();if(!ids.length)return;const {data,error}=await state.supabase.from('chat_dm_reactions').select('message_id,profile_id,emoji').in('message_id',ids);if(error)return;for(const r of data||[]){if(!state.reactions.has(r.message_id))state.reactions.set(r.message_id,[]);state.reactions.get(r.message_id).push(r);}}

  function renderMessages({scrollBottom=false,preserve=false}={}){
    const oldHeight=ui.messages.scrollHeight,oldTop=ui.messages.scrollTop;ui.messages.replaceChildren();if(state.hasMore&&state.messages.length){const older=el('button','blobby-dm-load-older','Load older messages');older.type='button';older.onclick=loadOlder;ui.messages.append(older);}if(!state.messages.length){ui.messages.append(el('div','blobby-dm-empty-list','No messages yet. Say hi 👋'));return;}
    let lastDay='';for(const m of state.messages){const dk=dayKey(m.created_at);if(dk!==lastDay){ui.messages.append(el('div','blobby-dm-day',dayLabel(m.created_at)));lastDay=dk;}ui.messages.append(messageNode(m));}
    if(preserve)ui.messages.scrollTop=oldTop+(ui.messages.scrollHeight-oldHeight);else if(scrollBottom)requestAnimationFrame(()=>ui.messages.scrollTo({top:ui.messages.scrollHeight,behavior:'auto'}));
  }
  function messageNode(m){
    const own=m.sender_profile_id===currentProfileId(),p=state.profiles.get(m.sender_profile_id)||{display_name:own?'You':'Unknown',role:'user'};const row=el('article','blobby-dm-message');row.dataset.own=String(own);row.dataset.messageId=m.id;const bubble=el('div','blobby-dm-bubble');const head=el('div','blobby-dm-message-head');const who=el('span');appendIdentity(who,p);head.append(who,el('time','',timeLabel(m.created_at)));if(m.edited_at)head.append(el('small','','edited'));bubble.append(head);
    if(m.reply_to){const original=state.messages.find(x=>x.id===m.reply_to);const rp=original?state.profiles.get(original.sender_profile_id):null;const prev=el('button','blobby-dm-reply-preview',original?`↳ ${rp?.display_name||'user'}: ${previewMessage(original)}`:'↳ Original message');prev.type='button';prev.onclick=()=>scrollToMessage(m.reply_to);bubble.append(prev);}
    if(m.deleted_at)bubble.append(el('div','blobby-dm-deleted','Message deleted'));else{if(m.body)bubble.append(bodyNode(m.body));if((m.message_type==='image'||m.message_type==='file')&&m.attachment_path)bubble.append(attachmentNode(m));const reacts=reactionNode(m);if(reacts)bubble.append(reacts);const actions=el('div','blobby-dm-message-actions');const reply=mini('Reply',()=>setReply(m));const react=mini('React',()=>quickReaction(m));actions.append(reply,react);if(own&&m.message_type==='text')actions.append(mini('Edit',()=>editMessage(m)));if(own)actions.append(mini('Delete',()=>deleteMessage(m)));bubble.append(actions);}row.append(bubble);return row;
  }
  function mini(text,fn){const b=el('button','blobby-dm-mini',text);b.type='button';b.onclick=fn;return b;}
  function avatarNode(p){const a=el('span','blobby-dm-avatar',initials(p?.display_name));return a;}
  function appendIdentity(parent,p){if(p?.role==='owner')parent.append(el('span','blobby-dm-owner','[¥]'));else if(p?.role==='admin')parent.append(el('span','blobby-dm-mod','[ADMIN]'));else if(p?.role==='moderator')parent.append(el('span','blobby-dm-mod','[MOD]'));parent.append(document.createTextNode(p?.display_name||'Unknown'));}
  function statusLabel(s){return s==='away'?'Away':s==='dnd'?'Do Not Disturb':s==='invisible'?'Offline':'Online';}
  function bodyNode(text){const box=el('div','blobby-dm-body'),s=String(text||''),re=/(https:\/\/[^\s<]+)/g;let last=0,m;while((m=re.exec(s))){if(m.index>last)box.append(document.createTextNode(s.slice(last,m.index)));try{const u=new URL(m[0]);const a=el('a','',u.href);a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';box.append(a);}catch{box.append(document.createTextNode(m[0]));}last=re.lastIndex;}if(last<s.length)box.append(document.createTextNode(s.slice(last)));return box;}
  function attachmentNode(m){const wrap=el('div','blobby-dm-media');if(m.message_type==='image'){const img=el('img');img.alt=m.attachment_name||'Shared image';img.loading='lazy';img.onclick=()=>openLightbox(m,img);wrap.append(img);signedUrlFor(m).then(url=>{if(url)img.src=url;});}else{const row=el('div','blobby-dm-file');row.append(el('span','blobby-dm-file-icon','📄'));const c=el('span','blobby-dm-file-copy');c.append(el('strong','',m.attachment_name||'Attachment'),el('small','',humanBytes(m.attachment_size)));const a=el('button','','Open');a.type='button';a.onclick=async()=>{const url=await signedUrlFor(m);if(url)window.open(url,'_blank','noopener,noreferrer');};row.append(c,a);wrap.append(row);}return wrap;}
  async function signedUrlFor(m){const key=`${m.message_type}:${m.attachment_path}`,cached=state.signedUrls.get(key);if(cached&&cached.until>Date.now())return cached.url;const bucket=m.message_type==='image'?'chat-dm-images':'chat-dm-files';const {data,error}=await state.supabase.storage.from(bucket).createSignedUrl(m.attachment_path,3600);if(error)return'';state.signedUrls.set(key,{url:data.signedUrl,until:Date.now()+3300000});return data.signedUrl;}
  async function openLightbox(m,img){const url=img.src||await signedUrlFor(m);if(!url)return;ui.lightboxImg.src=url;ui.lightboxImg.alt=m.attachment_name||'Shared image';ui.lightbox.hidden=false;}
  function reactionNode(m){const list=state.reactions.get(m.id)||[];if(!list.length)return null;const grouped=new Map();for(const r of list){if(!grouped.has(r.emoji))grouped.set(r.emoji,[]);grouped.get(r.emoji).push(r);}const box=el('div','blobby-dm-reactions');for(const [emoji,rows] of grouped){const b=el('button','blobby-dm-reaction',`${emoji} ${rows.length}`);b.type='button';b.dataset.mine=String(rows.some(r=>r.profile_id===currentProfileId()));b.onclick=()=>toggleReaction(m,emoji);box.append(b);}return box;}

  async function loadOlder(){if(state.loadingOlder||!state.hasMore)return;state.loadingOlder=true;try{await loadMessages(false);}catch{toast('Could not load older messages.');}finally{state.loadingOlder=false;}}
  function scrollToMessage(id){const n=ui.messages.querySelector(`[data-message-id="${CSS.escape(id)}"]`);if(n)n.scrollIntoView({block:'center',behavior:isReduced()?'auto':'smooth'});}
  async function markRead(){if(!state.activeId)return;const {error}=await state.supabase.rpc('chat_dm_mark_read',{target_conversation_id:state.activeId});if(!error){const c=activeConversation();if(c){c.unread=0;c.last_read_at=new Date().toISOString();renderConversationList();dispatchUnread();}}}

  async function sendText(){const body=ui.input.value.trim();if(!body||!state.activeId||!state.ready)return;ui.send.disabled=true;try{await insertMessage({body,message_type:'text',reply_to:state.replyTo?.id||null});ui.input.value='';autoGrow();setReply(null);}catch(e){toast(friendlyError(e));}finally{syncSend();}}
  async function insertMessage(payload){const row={conversation_id:state.activeId,sender_profile_id:currentProfileId(),body:payload.body||null,message_type:payload.message_type||'text',attachment_path:payload.attachment_path||null,attachment_name:payload.attachment_name||null,attachment_mime:payload.attachment_mime||null,attachment_size:payload.attachment_size||null,reply_to:payload.reply_to||null};const {error}=await state.supabase.from('chat_dm_messages').insert(row);if(error)throw error;}
  function setReply(m){state.replyTo=m;ui.replying.hidden=!m;ui.replying.querySelector('span').textContent=m?`Replying to ${state.profiles.get(m.sender_profile_id)?.display_name||'user'}: ${previewMessage(m)}`:'';if(m)ui.input.focus();}
  function insertEmoji(emoji){const i=ui.input,s=i.selectionStart??i.value.length,e=i.selectionEnd??i.value.length;i.value=i.value.slice(0,s)+emoji+i.value.slice(e);i.focus();i.setSelectionRange(s+emoji.length,s+emoji.length);syncSend();}
  function autoGrow(){ui.input.style.height='auto';ui.input.style.height=Math.min(108,ui.input.scrollHeight)+'px';}
  function syncSend(){const c=activeConversation(),blocked=!!c&&state.blocked.has(c.other.id);ui.input.disabled=blocked;ui.attach.disabled=blocked;ui.photo.disabled=blocked;ui.emoji.disabled=blocked;ui.send.disabled=blocked||!ui.input.value.trim()||!state.ready||!state.activeId;ui.input.placeholder=blocked?'Unblock this person to send messages.':'Message…';}

  async function editMessage(m){const next=prompt('Edit message:',m.body||'');if(next===null)return;const body=next.trim();if(!body)return;const {error}=await state.supabase.from('chat_dm_messages').update({body,edited_at:new Date().toISOString()}).eq('id',m.id).eq('sender_profile_id',currentProfileId());if(error)toast('Could not edit message.');else await reloadThread();}
  async function deleteMessage(m){if(!confirm('Delete this message?'))return;try{if(m.attachment_path){const bucket=m.message_type==='image'?'chat-dm-images':'chat-dm-files';const {error:storageError}=await state.supabase.storage.from(bucket).remove([m.attachment_path]);if(storageError)throw storageError;}const {error}=await state.supabase.from('chat_dm_messages').delete().eq('id',m.id).eq('sender_profile_id',currentProfileId());if(error)throw error;await reloadThread();}catch(e){toast('Could not delete message.');}}
  function quickReaction(m){const x=prompt(`React with an emoji:\n${QUICK_REACTIONS.join('  ')}`,'👍');if(!x)return;const emoji=Array.from(x.trim())[0]||'';if(emoji)toggleReaction(m,emoji);}
  async function toggleReaction(m,emoji){const list=state.reactions.get(m.id)||[],mine=list.some(r=>r.profile_id===currentProfileId()&&r.emoji===emoji);let error;if(mine)({error}=await state.supabase.from('chat_dm_reactions').delete().eq('message_id',m.id).eq('profile_id',currentProfileId()).eq('emoji',emoji));else({error}=await state.supabase.from('chat_dm_reactions').insert({message_id:m.id,profile_id:currentProfileId(),emoji}));if(error)toast('Could not update reaction.');else{await loadReactions();renderMessages({preserve:true});}}

  async function toggleBlock(){const c=activeConversation();if(!c)return;const target=c.other,shouldBlock=!state.blocked.has(target.id);if(shouldBlock&&!confirm(`Block ${target.display_name}? You will not be able to send each other DMs until you unblock them.`))return;const {error}=await state.supabase.rpc('chat_dm_set_block',{target_profile_id:target.id,should_block:shouldBlock});if(error){toast(friendlyError(error));return;}if(shouldBlock)state.blocked.add(target.id);else state.blocked.delete(target.id);renderThreadHead();renderPeople();toast(shouldBlock?`${target.display_name} blocked.`:`${target.display_name} unblocked.`);}

  async function uploadAndSend(file,photoOnly){
    if(!state.activeId)return;const isImage=ALLOWED_IMAGE_TYPES.has(file.type),ext=extOf(file.name);if(photoOnly&&!isImage)return toast('Choose a JPG, PNG, or WEBP image.');if(isImage&&file.size>MAX_IMAGE_BYTES)return toast(`Images must be ${CONFIG.CHAT_MAX_IMAGE_MB||5} MB or smaller.`);if(!isImage&&(!ALLOWED_FILE_TYPES.has(file.type)||!ALLOWED_FILE_EXT.has(ext)))return toast('That file type is not allowed.');if(!isImage&&file.size>MAX_FILE_BYTES)return toast(`Files must be ${CONFIG.CHAT_MAX_FILE_MB||10} MB or smaller.`);
    const bucket=isImage?'chat-dm-images':'chat-dm-files',path=`${state.activeId}/${currentProfileId()}/${crypto.randomUUID()}/${safeFilename(file.name)}`;try{setUploadProgress(0,`Uploading ${file.name}`);await xhrUpload(bucket,path,file,p=>setUploadProgress(p,`Uploading ${file.name}`));setUploadProgress(100,'Sending…');await insertMessage({message_type:isImage?'image':'file',attachment_path:path,attachment_name:file.name.slice(0,120),attachment_mime:file.type,attachment_size:file.size,reply_to:state.replyTo?.id||null});setReply(null);setUploadProgress(null,'');}catch(e){console.warn(e);setUploadProgress(null,'');toast(friendlyError(e));try{await state.supabase.storage.from(bucket).remove([path]);}catch{}}
  }
  function xhrUpload(bucket,path,file,onProgress){return new Promise(async(resolve,reject)=>{const {data:{session}}=await state.supabase.auth.getSession();if(!session?.access_token)return reject(Error('No chat session'));const xhr=new XMLHttpRequest();xhr.open('POST',String(CONFIG.SUPABASE_URL).replace(/\/$/,'')+`/storage/v1/object/${bucket}/${path}`);xhr.setRequestHeader('Authorization','Bearer '+session.access_token);xhr.setRequestHeader('apikey',CONFIG.SUPABASE_PUBLISHABLE_KEY);xhr.setRequestHeader('Content-Type',file.type||'application/octet-stream');xhr.setRequestHeader('x-upsert','false');xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress(Math.round(e.loaded/e.total*100));};xhr.onload=()=>xhr.status>=200&&xhr.status<300?resolve():reject(Error(`Upload ${xhr.status}`));xhr.onerror=()=>reject(Error('Upload network error'));xhr.send(file);});}
  function setUploadProgress(value,label){ui.uploadState.textContent=label||'';if(value===null){ui.uploadProgress.hidden=true;ui.uploadProgress.querySelector('i').style.width='0%';return;}ui.uploadProgress.hidden=false;ui.uploadProgress.querySelector('i').style.width=`${Math.max(0,Math.min(100,value))}%`;}

  async function subscribeRealtime(){
    await unsubscribeRealtime();if(!state.supabase||!state.profile)return;const ch=state.supabase.channel(`blobby-dm-${currentProfileId()}`);
    ch.on('postgres_changes',{event:'*',schema:'public',table:'chat_dm_messages'},()=>{scheduleInboxRefresh();scheduleThreadRefresh();});
    ch.on('postgres_changes',{event:'*',schema:'public',table:'chat_dm_reactions'},()=>scheduleThreadRefresh());
    ch.subscribe();state.inboxChannel=ch;
  }
  async function unsubscribeRealtime(){if(state.inboxChannel&&state.supabase){try{await state.supabase.removeChannel(state.inboxChannel);}catch{}}state.inboxChannel=null;}
  const scheduleInboxRefresh=debounce(async()=>{if(!state.open)return;try{await loadConversations();}catch{}},180);
  const scheduleThreadRefresh=debounce(async()=>{if(!state.open||!state.activeId)return;try{await reloadThread();await markRead();}catch{}},180);
  async function reloadThread(){if(!state.activeId)return;const id=state.activeId,nearBottom=ui.messages.scrollHeight-ui.messages.scrollTop-ui.messages.clientHeight<90;const {data,error}=await state.supabase.from('chat_dm_messages').select('*').eq('conversation_id',id).order('created_at',{ascending:false}).limit(120);if(error)throw error;if(id!==state.activeId)return;state.messages=(data||[]).reverse();state.hasMore=(data||[]).length>=120;state.oldestLoadedAt=state.messages[0]?.created_at||null;await loadReactions();renderMessages(nearBottom?{scrollBottom:true}:{preserve:true});await loadConversations();}
  function startPolling(){stopPolling();state.pollTimer=setInterval(async()=>{if(!state.open||document.visibilityState!=='visible')return;try{await loadConversations();if(state.activeId)await reloadThread();}catch{}},15000);}
  function stopPolling(){clearInterval(state.pollTimer);state.pollTimer=0;}
  function dispatchUnread(){const total=state.conversations.reduce((n,c)=>n+(c.unread||0),0);window.dispatchEvent(new CustomEvent('blobby:dm-unread',{detail:{count:total}}));}

  function boot(){createUI();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.BlobbyDM=Object.freeze({open:openDM,close:closeDM,toggle:toggleDM,state:()=>({open:state.open,ready:state.ready,activeId:state.activeId,unread:state.conversations.reduce((n,c)=>n+(c.unread||0),0)})});
})();
