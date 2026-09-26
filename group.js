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
    members:new Map(),inboxChannel:null,pollTimer:0,refreshTimer:0,threadRefreshTimer:0
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

  function toast(text){if(!ui.toasts)return;const n=el('div','blobby-group-toast',text);ui.toasts.append(n);setTimeout(()=>n.remove(),2600);}
  function appExpand(){try{window.BlobbyAppUI?.expand?.('groups');}catch{}}
  function appRestore(){try{window.BlobbyAppUI?.restore?.();}catch{}}

  function createUI(){
    const root=el('div','blobby-group-root');root.id='blobbyGroupRoot';root.dataset.open='false';
    root.innerHTML=`
      <div class="blobby-group-backdrop"></div>
      <section class="blobby-group-shell" aria-label="Group chats" aria-hidden="true">
        <aside class="blobby-group-inbox">
          <header class="blobby-group-inbox-head">
            <div><span>PRIVATE</span><strong>Groups</strong></div>
            <div class="blobby-group-head-actions"><button class="blobby-group-new" type="button" title="Create group" aria-label="Create group">＋</button><button class="blobby-group-close" type="button" title="Close Groups" aria-label="Close Groups">×</button></div>
          </header>
          <label class="blobby-group-search"><span>⌕</span><input type="search" placeholder="Search conversations" autocomplete="off"></label>
          <div class="blobby-group-list hide-scrollbar"></div>
          <div class="blobby-group-picker" hidden>
            <div class="blobby-group-picker-head"><strong>Create group</strong><button type="button" aria-label="Close people picker">×</button></div>
            <label class="blobby-group-search"><span>⌕</span><input type="search" placeholder="Group name" autocomplete="off"></label>
            <div class="blobby-group-people hide-scrollbar"><button class="blobby-group-create-confirm" type="button">Create group</button></div>
          </div>
        </aside>
        <main class="blobby-group-thread" data-empty="true">
          <div class="blobby-group-empty"><div class="blobby-group-empty-icon">👥</div><strong>Your groups</strong><span>Choose a group or create a new one.</span><button class="blobby-group-empty-new" type="button">Create group</button></div>
          <div class="blobby-group-thread-ui" hidden>
            <header class="blobby-group-thread-head"><button class="blobby-group-back" type="button" aria-label="Back to conversations">←</button><div class="blobby-group-thread-person"></div><div class="blobby-group-thread-actions"><button class="blobby-group-block" type="button">Manage</button></div></header>
            <div class="blobby-group-messages hide-scrollbar" role="log" aria-live="polite"></div>
            <div class="blobby-group-composer">
              <div class="blobby-group-replying" hidden><span></span><button type="button" aria-label="Cancel reply">×</button></div>
              <div class="blobby-group-input-wrap"><textarea rows="1" maxlength="2000" placeholder="Message…" aria-label="Direct message"></textarea><button class="blobby-group-send" type="button" disabled>Send</button></div>
              <div class="blobby-group-tools"><button class="blobby-group-emoji" type="button" title="React / emoji">😀</button><button class="blobby-group-attach" type="button" title="Attach file">📎</button><button class="blobby-group-photo" type="button" title="Attach photo">📷</button><span class="blobby-group-upload-state"></span><span class="blobby-group-upload-progress" hidden><i></i></span></div>
              <input class="blobby-group-file-input" type="file" hidden accept=".pdf,.txt,.csv,.docx,.xlsx,.pptx,image/jpeg,image/png,image/webp">
              <input class="blobby-group-photo-input" type="file" hidden accept="image/jpeg,image/png,image/webp">
            </div>
          </div>
        </main>
        <div class="blobby-group-toast-stack"></div>
        <div class="blobby-group-lightbox" hidden><button type="button" aria-label="Close image">×</button><img alt="Shared image preview"></div>
      </section>`;
    document.body.append(root);
    ui={
      root,shell:q('.blobby-group-shell',root),backdrop:q('.blobby-group-backdrop',root),close:q('.blobby-group-close',root),newButton:q('.blobby-group-new',root),emptyNew:q('.blobby-group-empty-new',root),
      search:q('.blobby-group-search input',root),list:q('.blobby-group-list',root),picker:q('.blobby-group-picker',root),pickerClose:q('.blobby-group-picker-head button',root),pickerSearch:q('.blobby-group-picker .blobby-group-search input',root),people:q('.blobby-group-people',root),
      thread:q('.blobby-group-thread',root),empty:q('.blobby-group-empty',root),threadUI:q('.blobby-group-thread-ui',root),threadPerson:q('.blobby-group-thread-person',root),back:q('.blobby-group-back',root),block:q('.blobby-group-block',root),messages:q('.blobby-group-messages',root),
      replying:q('.blobby-group-replying',root),input:q('.blobby-group-input-wrap textarea',root),send:q('.blobby-group-send',root),emoji:q('.blobby-group-emoji',root),attach:q('.blobby-group-attach',root),photo:q('.blobby-group-photo',root),fileInput:q('.blobby-group-file-input',root),photoInput:q('.blobby-group-photo-input',root),uploadState:q('.blobby-group-upload-state',root),uploadProgress:q('.blobby-group-upload-progress',root),toasts:q('.blobby-group-toast-stack',root),lightbox:q('.blobby-group-lightbox',root),lightboxImg:q('.blobby-group-lightbox img',root),createConfirm:q('.blobby-group-create-confirm',root)
    };
    ui.close.onclick=closeGroup;ui.backdrop.onclick=closeGroup;ui.newButton.onclick=openPicker;ui.emptyNew.onclick=openPicker;ui.pickerClose.onclick=closePicker;ui.search.oninput=renderConversationList;ui.createConfirm.onclick=createGroup;ui.pickerSearch.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();createGroup();}});
    ui.back.onclick=()=>{state.activeId='';renderConversationList();showThread(false);};ui.block.onclick=manageGroup;
    ui.replying.querySelector('button').onclick=()=>setReply(null);ui.input.addEventListener('input',()=>{autoGrow();syncSend();});ui.input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendText();}});ui.send.onclick=sendText;
    ui.emoji.onclick=()=>{const x=prompt(`Insert emoji:\n${QUICK_REACTIONS.join('  ')}`,'😀');if(x){const emoji=Array.from(x.trim())[0]||'';if(emoji)insertEmoji(emoji);}};
    ui.attach.onclick=()=>ui.fileInput.click();ui.photo.onclick=()=>ui.photoInput.click();
    ui.fileInput.onchange=()=>{const f=ui.fileInput.files?.[0];ui.fileInput.value='';if(f)uploadAndSend(f,false);};ui.photoInput.onchange=()=>{const f=ui.photoInput.files?.[0];ui.photoInput.value='';if(f)uploadAndSend(f,true);};
    ui.lightbox.onclick=e=>{if(e.target===ui.lightbox||e.target.tagName==='BUTTON')ui.lightbox.hidden=true;};
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.open){if(!ui.picker.hidden){closePicker();return;}closeGroup();}});
    window.addEventListener('blobby:license-locked',disconnectGroup);
  }

  async function ensureIdentity(){
    if(state.ready&&state.supabase&&state.profile)return;
    if(state.connecting)return;
    state.connecting=true;
    try{
      if(!window.BlobbyChat?.backend)throw Error('Chat identity is unavailable.');
      const backend=await window.BlobbyChat.backend();
      state.supabase=backend.supabase;state.session=backend.session;state.profile=backend.profile;
      await loadProfiles();
      state.ready=true;
    }finally{state.connecting=false;}
  }

  async function openGroup(){
    if(document.body.dataset.licenseState!=='unlocked')return;
    if(window.BlobbyChat?.state?.().open)window.BlobbyChat.close();if(window.BlobbyDM?.state?.().open)window.BlobbyDM.close();
    state.open=true;ui.root.dataset.open='true';ui.shell.setAttribute('aria-hidden','false');document.documentElement.dataset.groupOpen='true';appExpand();
    ui.list.replaceChildren(el('div','blobby-group-loading','Loading conversations…'));
    try{await ensureIdentity();await refreshAll();await subscribeRealtime();startPolling();}
    catch(e){console.warn('Blobby Group connection failed',e);ui.list.replaceChildren(el('div','blobby-group-empty-list',friendlyError(e)));}
  }
  function closeGroup(){if(!state.open)return;state.open=false;ui.root.dataset.open='false';ui.shell.setAttribute('aria-hidden','true');delete document.documentElement.dataset.groupOpen;closePicker();stopPolling();unsubscribeRealtime();appRestore();}
  function toggleGroup(){state.open?closeGroup():openGroup();}

  async function disconnectGroup(){state.ready=false;state.session=null;state.profile=null;state.profiles.clear();state.members.clear();state.conversations=[];state.messages=[];state.reactions.clear();await unsubscribeRealtime();if(state.open)closeGroup();}

  async function loadProfiles(){const {data,error}=await state.supabase.from('chat_profiles').select('id,display_name,avatar_path,bio,status,custom_status,role,is_banned,muted_until,created_at').limit(1000);if(error)throw error;state.profiles.clear();for(const p of data||[])state.profiles.set(p.id,p);}

  async function refreshAll(){await loadProfiles();await loadConversations();if(state.activeId){const exists=state.conversations.some(c=>c.id===state.activeId);if(exists)await loadMessages(true);else{state.activeId='';showThread(false);}}}

  async function loadConversations(){
    const me=currentProfileId();if(!me)return;
    const {data:mine,error:e1}=await state.supabase.from('chat_group_members').select('group_id,role,last_read_at').eq('profile_id',me);if(e1)throw e1;
    const ids=(mine||[]).map(x=>x.group_id);if(!ids.length){state.conversations=[];state.members.clear();renderConversationList();return;}
    const [{data:groups,error:e2},{data:members,error:e3},{data:recent,error:e4}]=await Promise.all([
      state.supabase.from('chat_group_conversations').select('id,name,owner_profile_id,avatar_path,created_at,updated_at').in('id',ids),
      state.supabase.from('chat_group_members').select('group_id,profile_id,role,joined_at,last_read_at').in('group_id',ids),
      state.supabase.from('chat_group_messages').select('id,group_id,sender_profile_id,body,message_type,attachment_name,deleted_at,created_at').in('group_id',ids).order('created_at',{ascending:false}).limit(600)
    ]);if(e2)throw e2;if(e3)throw e3;if(e4)throw e4;
    const mineMap=new Map((mine||[]).map(x=>[x.group_id,x]));state.members.clear();for(const m of members||[]){if(!state.members.has(m.group_id))state.members.set(m.group_id,[]);state.members.get(m.group_id).push(m);}
    const latest=new Map(),unread=new Map();for(const m of recent||[]){if(!latest.has(m.group_id))latest.set(m.group_id,m);const lr=mineMap.get(m.group_id)?.last_read_at;if(m.sender_profile_id!==me&&(!lr||new Date(m.created_at)>new Date(lr)))unread.set(m.group_id,(unread.get(m.group_id)||0)+1);}
    state.conversations=(groups||[]).map(g=>({...g,myRole:mineMap.get(g.id)?.role||'member',last_read_at:mineMap.get(g.id)?.last_read_at||null,members:state.members.get(g.id)||[],lastMessage:latest.get(g.id)||null,unread:unread.get(g.id)||0})).sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at));
    renderConversationList();dispatchUnread();
  }

  function renderConversationList(){
    if(!ui.list)return;const term=(ui.search?.value||'').trim().toLowerCase();const rows=state.conversations.filter(c=>!term||String(c.name||'').toLowerCase().includes(term));ui.list.replaceChildren();
    if(!rows.length){ui.list.append(el('div','blobby-group-empty-list',term?'No groups match that search.':'No groups yet. Create one.'));return;}
    for(const c of rows){const b=el('button','blobby-group-conversation');b.type='button';b.dataset.active=String(c.id===state.activeId);b.onclick=()=>openConversation(c.id);b.append(groupAvatar(c));const copy=el('span','blobby-group-conversation-copy');const top=el('span','blobby-group-conversation-top');top.append(el('strong','',c.name),el('time','',c.lastMessage?timeLabel(c.lastMessage.created_at):''));const bottom=el('span','blobby-group-conversation-bottom');bottom.append(el('span','',c.lastMessage?previewMessage(c.lastMessage):`${c.members.length} member${c.members.length===1?'':'s'}`));if(c.unread>0)bottom.append(el('b','blobby-group-unread',c.unread>99?'99+':String(c.unread)));copy.append(top,bottom);b.append(copy);ui.list.append(b);}
  }
  function groupAvatar(c){return el('span','blobby-group-avatar',initials(c?.name||'G'));}
  function openPicker(){ui.picker.hidden=false;ui.pickerSearch.value='';setTimeout(()=>ui.pickerSearch.focus(),10);}
  function closePicker(){if(ui.picker)ui.picker.hidden=true;}
  async function createGroup(){const name=ui.pickerSearch.value.trim();if(!name)return toast('Enter a group name.');if(name.length>60)return toast('Group names can be up to 60 characters.');ui.createConfirm.disabled=true;try{const {data,error}=await state.supabase.rpc('chat_group_create',{p_name:name});if(error)throw error;closePicker();await loadConversations();await openConversation(data);toast('Group created.');}catch(e){toast(friendlyError(e));}finally{ui.createConfirm.disabled=false;}}

  async function openConversation(id){state.activeId=id;setReply(null);renderConversationList();showThread(true);ui.messages.replaceChildren(el('div','blobby-group-loading','Loading messages…'));try{await loadMessages(true);await markRead();renderThreadHead();setTimeout(()=>ui.input.focus(),30);}catch(e){ui.messages.replaceChildren(el('div','blobby-group-empty-list',friendlyError(e)));}}
  function showThread(show){ui.thread.dataset.empty=String(!show);ui.empty.hidden=show;ui.threadUI.hidden=!show;if(!show)renderConversationList();}
  function activeConversation(){return state.conversations.find(c=>c.id===state.activeId)||null;}
  function renderThreadHead(){const c=activeConversation();if(!c)return;ui.threadPerson.replaceChildren(groupAvatar(c));const copy=el('div','blobby-group-thread-person-copy');copy.append(el('strong','',c.name),el('span','',`${c.members.length} member${c.members.length===1?'':'s'} · ${c.myRole}`));ui.threadPerson.append(copy);ui.block.textContent='Manage';syncSend();}

  async function loadMessages(reset=false){
    if(!state.activeId)return;if(reset){state.messages=[];state.reactions.clear();state.oldestLoadedAt=null;state.hasMore=true;}
    let query=state.supabase.from('chat_group_messages').select('*').eq('group_id',state.activeId).order('created_at',{ascending:false}).limit(PAGE_SIZE);if(state.oldestLoadedAt)query=query.lt('created_at',state.oldestLoadedAt);const {data,error}=await query;if(error)throw error;const batch=(data||[]).reverse();if(batch.length<PAGE_SIZE)state.hasMore=false;if(batch.length)state.oldestLoadedAt=batch[0].created_at;state.messages=reset?batch:[...batch,...state.messages];await loadReactions();renderMessages(reset?{scrollBottom:true}:{preserve:true});}
  async function loadReactions(){const ids=state.messages.map(m=>m.id);state.reactions.clear();if(!ids.length)return;const {data,error}=await state.supabase.from('chat_group_reactions').select('message_id,profile_id,emoji').in('message_id',ids);if(error)return;for(const r of data||[]){if(!state.reactions.has(r.message_id))state.reactions.set(r.message_id,[]);state.reactions.get(r.message_id).push(r);}}

  function renderMessages({scrollBottom=false,preserve=false}={}){
    const oldHeight=ui.messages.scrollHeight,oldTop=ui.messages.scrollTop;ui.messages.replaceChildren();if(state.hasMore&&state.messages.length){const older=el('button','blobby-group-load-older','Load older messages');older.type='button';older.onclick=loadOlder;ui.messages.append(older);}if(!state.messages.length){ui.messages.append(el('div','blobby-group-empty-list','No messages yet. Say hi 👋'));return;}
    let lastDay='';for(const m of state.messages){const dk=dayKey(m.created_at);if(dk!==lastDay){ui.messages.append(el('div','blobby-group-day',dayLabel(m.created_at)));lastDay=dk;}ui.messages.append(messageNode(m));}
    if(preserve)ui.messages.scrollTop=oldTop+(ui.messages.scrollHeight-oldHeight);else if(scrollBottom)requestAnimationFrame(()=>ui.messages.scrollTo({top:ui.messages.scrollHeight,behavior:'auto'}));
  }
  function messageNode(m){
    const own=m.sender_profile_id===currentProfileId(),p=state.profiles.get(m.sender_profile_id)||{display_name:own?'You':'Unknown',role:'user'};const row=el('article','blobby-group-message');row.dataset.own=String(own);row.dataset.messageId=m.id;const bubble=el('div','blobby-group-bubble');const head=el('div','blobby-group-message-head');const who=el('span');appendIdentity(who,p);head.append(who,el('time','',timeLabel(m.created_at)));if(m.edited_at)head.append(el('small','','edited'));bubble.append(head);
    if(m.reply_to){const original=state.messages.find(x=>x.id===m.reply_to);const rp=original?state.profiles.get(original.sender_profile_id):null;const prev=el('button','blobby-group-reply-preview',original?`↳ ${rp?.display_name||'user'}: ${previewMessage(original)}`:'↳ Original message');prev.type='button';prev.onclick=()=>scrollToMessage(m.reply_to);bubble.append(prev);}
    if(m.deleted_at)bubble.append(el('div','blobby-group-deleted','Message deleted'));else{if(m.body)bubble.append(bodyNode(m.body));if((m.message_type==='image'||m.message_type==='file')&&m.attachment_path)bubble.append(attachmentNode(m));const reacts=reactionNode(m);if(reacts)bubble.append(reacts);const actions=el('div','blobby-group-message-actions');const reply=mini('Reply',()=>setReply(m));const react=mini('React',()=>quickReaction(m));actions.append(reply,react);if(own&&m.message_type==='text')actions.append(mini('Edit',()=>editMessage(m)));if(own)actions.append(mini('Delete',()=>deleteMessage(m)));bubble.append(actions);}row.append(bubble);return row;
  }
  function mini(text,fn){const b=el('button','blobby-group-mini',text);b.type='button';b.onclick=fn;return b;}
  function avatarNode(p){const a=el('span','blobby-group-avatar',initials(p?.display_name));return a;}
  function appendIdentity(parent,p){if(p?.role==='owner')parent.append(el('span','blobby-group-owner','[¥]'));else if(p?.role==='admin')parent.append(el('span','blobby-group-mod','[ADMIN]'));else if(p?.role==='moderator')parent.append(el('span','blobby-group-mod','[MOD]'));parent.append(document.createTextNode(p?.display_name||'Unknown'));}
  function statusLabel(s){return s==='away'?'Away':s==='dnd'?'Do Not Disturb':s==='invisible'?'Offline':'Online';}
  function bodyNode(text){const box=el('div','blobby-group-body'),s=String(text||''),re=/(https:\/\/[^\s<]+)/g;let last=0,m;while((m=re.exec(s))){if(m.index>last)box.append(document.createTextNode(s.slice(last,m.index)));try{const u=new URL(m[0]);const a=el('a','',u.href);a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';box.append(a);}catch{box.append(document.createTextNode(m[0]));}last=re.lastIndex;}if(last<s.length)box.append(document.createTextNode(s.slice(last)));return box;}
  function attachmentNode(m){const wrap=el('div','blobby-group-media');if(m.message_type==='image'){const img=el('img');img.alt=m.attachment_name||'Shared image';img.loading='lazy';img.onclick=()=>openLightbox(m,img);wrap.append(img);signedUrlFor(m).then(url=>{if(url)img.src=url;});}else{const row=el('div','blobby-group-file');row.append(el('span','blobby-group-file-icon','📄'));const c=el('span','blobby-group-file-copy');c.append(el('strong','',m.attachment_name||'Attachment'),el('small','',humanBytes(m.attachment_size)));const a=el('button','','Open');a.type='button';a.onclick=async()=>{const url=await signedUrlFor(m);if(url)window.open(url,'_blank','noopener,noreferrer');};row.append(c,a);wrap.append(row);}return wrap;}
  async function signedUrlFor(m){const key=`${m.message_type}:${m.attachment_path}`,cached=state.signedUrls.get(key);if(cached&&cached.until>Date.now())return cached.url;const bucket=m.message_type==='image'?'chat-group-images':'chat-group-files';const {data,error}=await state.supabase.storage.from(bucket).createSignedUrl(m.attachment_path,3600);if(error)return'';state.signedUrls.set(key,{url:data.signedUrl,until:Date.now()+3300000});return data.signedUrl;}
  async function openLightbox(m,img){const url=img.src||await signedUrlFor(m);if(!url)return;ui.lightboxImg.src=url;ui.lightboxImg.alt=m.attachment_name||'Shared image';ui.lightbox.hidden=false;}
  function reactionNode(m){const list=state.reactions.get(m.id)||[];if(!list.length)return null;const grouped=new Map();for(const r of list){if(!grouped.has(r.emoji))grouped.set(r.emoji,[]);grouped.get(r.emoji).push(r);}const box=el('div','blobby-group-reactions');for(const [emoji,rows] of grouped){const b=el('button','blobby-group-reaction',`${emoji} ${rows.length}`);b.type='button';b.dataset.mine=String(rows.some(r=>r.profile_id===currentProfileId()));b.onclick=()=>toggleReaction(m,emoji);box.append(b);}return box;}

  async function loadOlder(){if(state.loadingOlder||!state.hasMore)return;state.loadingOlder=true;try{await loadMessages(false);}catch{toast('Could not load older messages.');}finally{state.loadingOlder=false;}}
  function scrollToMessage(id){const n=ui.messages.querySelector(`[data-message-id="${CSS.escape(id)}"]`);if(n)n.scrollIntoView({block:'center',behavior:isReduced()?'auto':'smooth'});}
  async function markRead(){if(!state.activeId)return;const {error}=await state.supabase.rpc('chat_group_mark_read',{p_group_id:state.activeId});if(!error){const c=activeConversation();if(c){c.unread=0;c.last_read_at=new Date().toISOString();renderConversationList();dispatchUnread();}}}

  async function sendText(){const body=ui.input.value.trim();if(!body||!state.activeId||!state.ready)return;ui.send.disabled=true;try{await insertMessage({body,message_type:'text',reply_to:state.replyTo?.id||null});ui.input.value='';autoGrow();setReply(null);}catch(e){toast(friendlyError(e));}finally{syncSend();}}
  async function insertMessage(payload){const row={group_id:state.activeId,sender_profile_id:currentProfileId(),body:payload.body||null,message_type:payload.message_type||'text',attachment_path:payload.attachment_path||null,attachment_name:payload.attachment_name||null,attachment_mime:payload.attachment_mime||null,attachment_size:payload.attachment_size||null,reply_to:payload.reply_to||null};const {error}=await state.supabase.from('chat_group_messages').insert(row);if(error)throw error;}
  function setReply(m){state.replyTo=m;ui.replying.hidden=!m;ui.replying.querySelector('span').textContent=m?`Replying to ${state.profiles.get(m.sender_profile_id)?.display_name||'user'}: ${previewMessage(m)}`:'';if(m)ui.input.focus();}
  function insertEmoji(emoji){const i=ui.input,s=i.selectionStart??i.value.length,e=i.selectionEnd??i.value.length;i.value=i.value.slice(0,s)+emoji+i.value.slice(e);i.focus();i.setSelectionRange(s+emoji.length,s+emoji.length);syncSend();}
  function autoGrow(){ui.input.style.height='auto';ui.input.style.height=Math.min(108,ui.input.scrollHeight)+'px';}
  function syncSend(){const disabled=!state.ready||!state.activeId;ui.input.disabled=disabled;ui.attach.disabled=disabled;ui.photo.disabled=disabled;ui.emoji.disabled=disabled;ui.send.disabled=disabled||!ui.input.value.trim();ui.input.placeholder='Message group…';}

  async function editMessage(m){const next=prompt('Edit message:',m.body||'');if(next===null)return;const body=next.trim();if(!body)return;const {error}=await state.supabase.from('chat_group_messages').update({body,edited_at:new Date().toISOString()}).eq('id',m.id).eq('sender_profile_id',currentProfileId());if(error)toast('Could not edit message.');else await reloadThread();}
  async function deleteMessage(m){if(!confirm('Delete this message?'))return;try{if(m.attachment_path){const bucket=m.message_type==='image'?'chat-group-images':'chat-group-files';const {error:storageError}=await state.supabase.storage.from(bucket).remove([m.attachment_path]);if(storageError)throw storageError;}const {error}=await state.supabase.from('chat_group_messages').delete().eq('id',m.id).eq('sender_profile_id',currentProfileId());if(error)throw error;await reloadThread();}catch(e){toast('Could not delete message.');}}
  function quickReaction(m){const x=prompt(`React with an emoji:\n${QUICK_REACTIONS.join('  ')}`,'👍');if(!x)return;const emoji=Array.from(x.trim())[0]||'';if(emoji)toggleReaction(m,emoji);}
  async function toggleReaction(m,emoji){const list=state.reactions.get(m.id)||[],mine=list.some(r=>r.profile_id===currentProfileId()&&r.emoji===emoji);let error;if(mine)({error}=await state.supabase.from('chat_group_reactions').delete().eq('message_id',m.id).eq('profile_id',currentProfileId()).eq('emoji',emoji));else({error}=await state.supabase.from('chat_group_reactions').insert({message_id:m.id,profile_id:currentProfileId(),emoji}));if(error)toast('Could not update reaction.');else{await loadReactions();renderMessages({preserve:true});}}

  async function manageGroup(){
    const c=activeConversation();if(!c)return;const members=c.members||[];const lines=members.map((m,i)=>`${i+1}. ${state.profiles.get(m.profile_id)?.display_name||'Unknown'} — ${m.role}`).join('\n');
    const action=prompt(`${c.name}\n\nMembers:\n${lines}\n\nType: add, remove, promote, demote, transfer, or leave`,'add');if(!action)return;
    const a=action.trim().toLowerCase();try{
      if(a==='leave'){if(c.myRole==='owner')return toast('Transfer ownership before leaving.');if(!confirm(`Leave ${c.name}?`))return;const {error}=await state.supabase.rpc('chat_group_leave',{p_group_id:c.id});if(error)throw error;state.activeId='';showThread(false);await loadConversations();return toast('You left the group.');}
      if(!['add','remove','promote','demote','transfer'].includes(a))return toast('Unknown group action.');
      const term=prompt(a==='add'?'Enter the Blobby display name to add:':'Enter the member display name:','');if(!term)return;const target=[...state.profiles.values()].find(p=>p.display_name.toLowerCase()===term.trim().toLowerCase());if(!target)return toast('Profile not found.');let rpc,args;
      if(a==='add'){rpc='chat_group_add_member';args={p_group_id:c.id,p_profile_id:target.id};}
      if(a==='remove'){rpc='chat_group_remove_member';args={p_group_id:c.id,p_profile_id:target.id};}
      if(a==='promote'||a==='demote'){rpc='chat_group_set_role';args={p_group_id:c.id,p_profile_id:target.id,p_role:a==='promote'?'admin':'member'};}
      if(a==='transfer'){if(!confirm(`Transfer ownership of ${c.name} to ${target.display_name}?`))return;rpc='chat_group_transfer_ownership';args={p_group_id:c.id,p_new_owner_profile_id:target.id};}
      const {error}=await state.supabase.rpc(rpc,args);if(error)throw error;await loadConversations();renderThreadHead();toast('Group updated.');
    }catch(e){toast(friendlyError(e));}
  }

  async function uploadAndSend(file,photoOnly){
    if(!state.activeId)return;const isImage=ALLOWED_IMAGE_TYPES.has(file.type),ext=extOf(file.name);if(photoOnly&&!isImage)return toast('Choose a JPG, PNG, or WEBP image.');if(isImage&&file.size>MAX_IMAGE_BYTES)return toast(`Images must be ${CONFIG.CHAT_MAX_IMAGE_MB||5} MB or smaller.`);if(!isImage&&(!ALLOWED_FILE_TYPES.has(file.type)||!ALLOWED_FILE_EXT.has(ext)))return toast('That file type is not allowed.');if(!isImage&&file.size>MAX_FILE_BYTES)return toast(`Files must be ${CONFIG.CHAT_MAX_FILE_MB||10} MB or smaller.`);
    const bucket=isImage?'chat-group-images':'chat-group-files',path=`${state.activeId}/${currentProfileId()}/${crypto.randomUUID()}/${safeFilename(file.name)}`;try{setUploadProgress(0,`Uploading ${file.name}`);await xhrUpload(bucket,path,file,p=>setUploadProgress(p,`Uploading ${file.name}`));setUploadProgress(100,'Sending…');await insertMessage({message_type:isImage?'image':'file',attachment_path:path,attachment_name:file.name.slice(0,120),attachment_mime:file.type,attachment_size:file.size,reply_to:state.replyTo?.id||null});setReply(null);setUploadProgress(null,'');}catch(e){console.warn(e);setUploadProgress(null,'');toast(friendlyError(e));try{await state.supabase.storage.from(bucket).remove([path]);}catch{}}
  }
  function xhrUpload(bucket,path,file,onProgress){return new Promise(async(resolve,reject)=>{const {data:{session}}=await state.supabase.auth.getSession();if(!session?.access_token)return reject(Error('No chat session'));const xhr=new XMLHttpRequest();xhr.open('POST',String(CONFIG.SUPABASE_URL).replace(/\/$/,'')+`/storage/v1/object/${bucket}/${path}`);xhr.setRequestHeader('Authorization','Bearer '+session.access_token);xhr.setRequestHeader('apikey',CONFIG.SUPABASE_PUBLISHABLE_KEY);xhr.setRequestHeader('Content-Type',file.type||'application/octet-stream');xhr.setRequestHeader('x-upsert','false');xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress(Math.round(e.loaded/e.total*100));};xhr.onload=()=>xhr.status>=200&&xhr.status<300?resolve():reject(Error(`Upload ${xhr.status}`));xhr.onerror=()=>reject(Error('Upload network error'));xhr.send(file);});}
  function setUploadProgress(value,label){ui.uploadState.textContent=label||'';if(value===null){ui.uploadProgress.hidden=true;ui.uploadProgress.querySelector('i').style.width='0%';return;}ui.uploadProgress.hidden=false;ui.uploadProgress.querySelector('i').style.width=`${Math.max(0,Math.min(100,value))}%`;}

  async function subscribeRealtime(){
    await unsubscribeRealtime();if(!state.supabase||!state.profile)return;const ch=state.supabase.channel(`blobby-group-${currentProfileId()}`);
    ch.on('postgres_changes',{event:'*',schema:'public',table:'chat_group_messages'},()=>{scheduleInboxRefresh();scheduleThreadRefresh();});
    ch.on('postgres_changes',{event:'*',schema:'public',table:'chat_group_reactions'},()=>scheduleThreadRefresh());
    ch.on('postgres_changes',{event:'*',schema:'public',table:'chat_group_members'},()=>scheduleInboxRefresh());
    ch.on('postgres_changes',{event:'*',schema:'public',table:'chat_group_conversations'},()=>scheduleInboxRefresh());
    ch.subscribe();state.inboxChannel=ch;
  }
  async function unsubscribeRealtime(){if(state.inboxChannel&&state.supabase){try{await state.supabase.removeChannel(state.inboxChannel);}catch{}}state.inboxChannel=null;}
  const scheduleInboxRefresh=debounce(async()=>{if(!state.open)return;try{await loadConversations();}catch{}},180);
  const scheduleThreadRefresh=debounce(async()=>{if(!state.open||!state.activeId)return;try{await reloadThread();await markRead();}catch{}},180);
  async function reloadThread(){if(!state.activeId)return;const id=state.activeId,nearBottom=ui.messages.scrollHeight-ui.messages.scrollTop-ui.messages.clientHeight<90;const {data,error}=await state.supabase.from('chat_group_messages').select('*').eq('group_id',id).order('created_at',{ascending:false}).limit(120);if(error)throw error;if(id!==state.activeId)return;state.messages=(data||[]).reverse();state.hasMore=(data||[]).length>=120;state.oldestLoadedAt=state.messages[0]?.created_at||null;await loadReactions();renderMessages(nearBottom?{scrollBottom:true}:{preserve:true});await loadConversations();}
  function startPolling(){stopPolling();state.pollTimer=setInterval(async()=>{if(!state.open||document.visibilityState!=='visible')return;try{await loadConversations();if(state.activeId)await reloadThread();}catch{}},15000);}
  function stopPolling(){clearInterval(state.pollTimer);state.pollTimer=0;}
  function dispatchUnread(){const total=state.conversations.reduce((n,c)=>n+(c.unread||0),0);window.dispatchEvent(new CustomEvent('blobby:group-unread',{detail:{count:total}}));}

  function boot(){createUI();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.BlobbyGroup=Object.freeze({open:openGroup,close:closeGroup,toggle:toggleGroup,state:()=>({open:state.open,ready:state.ready,activeId:state.activeId,unread:state.conversations.reduce((n,c)=>n+(c.unread||0),0)})});
})();
