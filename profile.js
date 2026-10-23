'use strict';
(() => {
  const PROFILE_FIELDS=[
    'id','display_name','username','avatar_path','banner_path','banner_color','banner_position','bio','pronouns',
    'status_emoji','status','custom_status','role','badges','created_at','updated_at','profile_accent','profile_style',
    'profile_gradient_top','profile_gradient_bottom','name_style','profile_links','dm_privacy','show_activity'
  ].join(',');
  const MAX_MEMBERS=250;
  const cache=new Map();
  const signedCache=new Map();
  const state={open:false,backend:null,me:null,target:null,draft:null,saved:null,view:'profile',members:[],dirty:false,building:false,avatarFile:null,bannerFile:null,avatarPreview:'',bannerPreview:'',searchTimer:0,previewRaf:0};
  let ui={};

  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const el=(tag,cls='',text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const clone=v=>v?JSON.parse(JSON.stringify(v)):v;
  const safeHex=(v,f='#bdfbd7')=>/^#[0-9a-f]{6}$/i.test(String(v||''))?String(v).toLowerCase():f;
  const initials=name=>{const p=String(name||'?').trim().split(/\s+/).filter(Boolean);return((p[0]?.[0]||'?')+(p.length>1?(p.at(-1)?.[0]||''):'')).toUpperCase().slice(0,2);};
  const roleLabel=r=>r==='owner'?'OWNER':r==='admin'?'ADMIN':r==='moderator'?'MODERATOR':'MEMBER';
  const statusLabel=s=>s==='away'?'Away':s==='dnd'?'Do Not Disturb':s==='invisible'?'Invisible':'Online';
  const linkIcon=t=>t==='youtube'?'▶':t==='github'?'⌘':t==='spotify'?'♪':'↗';
  const isPerf=()=>window.BlobbyPerformance?.shouldSimplify?.()||document.documentElement.dataset.performance==='true';

  function normalizeLinks(v){return Array.isArray(v)?v.slice(0,4).map(x=>({type:['website','youtube','github','spotify'].includes(x?.type)?x.type:'website',url:String(x?.url||'').trim()})):[];}
  function normalizeProfile(p){return{...p,username:p?.username||'',status_emoji:p?.status_emoji||'',banner_position:Number.isFinite(+p?.banner_position)?+p.banner_position:50,profile_accent:safeHex(p?.profile_accent,'#bdfbd7'),profile_style:'minimal',profile_links:normalizeLinks(p?.profile_links),badges:Array.isArray(p?.badges)?p.badges:[],dm_privacy:['everyone','shared_groups','nobody'].includes(p?.dm_privacy)?p.dm_privacy:'everyone',show_activity:p?.show_activity!==false};}
  function applyNameStyle(node,p){if(!node)return;node.style.cssText='';node.style.color=safeHex(p?.profile_accent,'#8bd3b2');}
  function revokePreview(kind){const key=kind==='avatar'?'avatarPreview':'bannerPreview';if(state[key]){try{URL.revokeObjectURL(state[key]);}catch{}state[key]='';}}
  function appExpand(){try{window.BlobbyAppUI?.expand?.('profile');}catch{}}
  function appRestore(){try{window.BlobbyAppUI?.restore?.();}catch{}}

  function build(){
    if(ui.root||!document.body)return;
    const root=el('div','blobby-profile-root');root.id='blobbyProfileRoot';root.dataset.open='false';
    root.innerHTML=`
      <button class="bp-backdrop" type="button" aria-label="Close profile"></button>
      <section class="bp-shell" aria-hidden="true" aria-label="Blobby profile">
        <header class="bp-top">
          <div><small>BLOBBY COMMUNITY</small><h2 class="bp-title">Profile</h2></div>
          <div class="bp-top-actions">
            <button class="bp-members-btn" type="button">Browse members</button>
            <button class="bp-public-btn" type="button">Public profile</button>
            <button class="bp-close" type="button" aria-label="Close profile">×</button>
          </div>
        </header>
        <div class="bp-body">
          <aside class="bp-preview-column">
            <article class="bp-card" data-style="default">
              <div class="bp-banner"></div>
              <div class="bp-avatar-wrap"><div class="bp-avatar"></div><span class="bp-status-dot"></span></div>
              <div class="bp-card-copy">
                <div class="bp-badges"></div>
                <strong class="bp-preview-name">Blobby user</strong>
                <span class="bp-handle"></span>
                <p class="bp-preview-bio">No bio yet.</p>
                <div class="bp-card-meta"><span class="bp-preview-pronouns"></span><span class="bp-joined"></span></div>
                <div class="bp-preview-status"></div>
                <div class="bp-preview-links"></div>
              </div>
            </article>
            <div class="bp-preview-note">Preview updates locally. Nothing is saved until you press Save changes.</div>
          </aside>
          <main class="bp-editor hide-scrollbar">
            <div class="bp-loading">Loading profile…</div>
            <form class="bp-form" hidden novalidate>
              <section class="bp-section">
                <div class="bp-section-title"><div><small>PROFILE</small><h3>About you</h3></div><span class="bp-unsaved" hidden>Unsaved</span></div>
                <div class="bp-image-row">
                  <div class="bp-image-control"><strong>Avatar</strong><span>Optimized before upload.</span><div><button type="button" data-upload="avatar">Choose image</button><button type="button" data-remove="avatar">Remove</button></div></div>
                  <div class="bp-image-control"><strong>Banner</strong><span>Optional. Kept lightweight.</span><div><button type="button" data-upload="banner">Choose image</button><button type="button" data-remove="banner">Remove</button></div></div>
                </div>
                <div class="bp-grid two">
                  <label><span>Display name</span><input name="display_name" maxlength="32" autocomplete="off" required><small>2–32 characters</small></label>
                  <label><span>Username</span><div class="bp-prefix-input"><b>@</b><input name="username" maxlength="24" autocomplete="off" placeholder="optional_handle"></div><small>Optional. 3–24 letters, numbers, underscores.</small></label>
                </div>
                <label><span>Bio <b class="bp-bio-count">0/160</b></span><textarea name="bio" rows="3" maxlength="160" placeholder="A short bio"></textarea></label>
                <label><span>Pronouns</span><input name="pronouns" maxlength="40" placeholder="Optional"></label>
                <div class="bp-grid three">
                  <label><span>Status emoji</span><input name="status_emoji" maxlength="12" placeholder="🎮"></label>
                  <label><span>Status message</span><input name="custom_status" maxlength="60" placeholder="Gaming, studying, AFK…"></label>
                  <label><span>Presence</span><select name="status"><option value="online">Online</option><option value="away">Away</option><option value="dnd">Do Not Disturb</option><option value="invisible">Invisible</option></select></label>
                </div>
              </section>

              <section class="bp-section">
                <div class="bp-section-title"><div><small>PRIVACY</small><h3>Who can reach you</h3></div></div>
                <div class="bp-grid two">
                  <label><span>Direct messages</span><select name="dm_privacy"><option value="everyone">Everyone</option><option value="shared_groups">People in shared groups</option><option value="nobody">Nobody new</option></select><small>Existing DM threads still stay available.</small></label>
                  <label class="bp-toggle"><span><strong>Show activity status</strong><small>Show your custom status on your public card.</small></span><input name="show_activity" type="checkbox"></label>
                </div>
              </section>

              <section class="bp-section">
                <div class="bp-section-title"><div><small>APPEARANCE</small><h3>Profile colors</h3></div></div>
                <div class="bp-grid two">
                  <label><span>Accent</span><input name="profile_accent" type="color"></label>
                  <label><span>Banner color</span><input name="banner_color" type="color"></label>
                </div>
                <label><span>Banner position</span><input name="banner_position" type="range" min="0" max="100" step="1"></label>
              </section>

              <section class="bp-section">
                <div class="bp-section-title"><div><small>LINKS</small><h3>Profile links</h3></div><span>Up to 4</span></div>
                <div class="bp-link-list"></div>
                <button class="bp-add-link" type="button">＋ Add link</button>
              </section>

              <div class="bp-savebar"><span class="bp-message" role="status" aria-live="polite"></span><button class="bp-cancel" type="button">Reset</button><button class="bp-save" type="submit">Save changes</button></div>
            </form>
            <section class="bp-public-view" hidden></section>
            <section class="bp-members-view" hidden><div class="bp-members-head"><div><small>COMMUNITY</small><h3>Browse members</h3></div><input class="bp-member-search" type="search" placeholder="Search members" autocomplete="off"></div><div class="bp-members-grid"></div></section>
          </main>
        </div>
        <input class="bp-file-avatar" type="file" accept="image/jpeg,image/png,image/webp" hidden>
        <input class="bp-file-banner" type="file" accept="image/jpeg,image/png,image/webp" hidden>
      </section>`;
    document.body.append(root);
    ui={root,shell:q('.bp-shell',root),backdrop:q('.bp-backdrop',root),close:q('.bp-close',root),membersBtn:q('.bp-members-btn',root),publicBtn:q('.bp-public-btn',root),title:q('.bp-title',root),loading:q('.bp-loading',root),form:q('.bp-form',root),publicView:q('.bp-public-view',root),membersView:q('.bp-members-view',root),card:q('.bp-card',root),banner:q('.bp-banner',root),avatar:q('.bp-avatar',root),statusDot:q('.bp-status-dot',root),badges:q('.bp-badges',root),previewName:q('.bp-preview-name',root),handle:q('.bp-handle',root),previewBio:q('.bp-preview-bio',root),previewPronouns:q('.bp-preview-pronouns',root),joined:q('.bp-joined',root),previewStatus:q('.bp-preview-status',root),previewLinks:q('.bp-preview-links',root),bioCount:q('.bp-bio-count',root),unsaved:q('.bp-unsaved',root),message:q('.bp-message',root),save:q('.bp-save',root),cancel:q('.bp-cancel',root),avatarInput:q('.bp-file-avatar',root),bannerInput:q('.bp-file-banner',root),linkList:q('.bp-link-list',root),addLink:q('.bp-add-link',root),memberSearch:q('.bp-member-search',root),membersGrid:q('.bp-members-grid',root)};
    ui.close.onclick=requestClose;ui.backdrop.onclick=requestClose;ui.publicBtn.onclick=()=>{if(state.view==='profile'){if(!canLeaveEditor())return;showPublic(state.me?.id);}else loadOwn();};ui.membersBtn.onclick=()=>{if(state.view==='profile'&&!canLeaveEditor())return;showMembers();};
    ui.form.addEventListener('submit',e=>{e.preventDefault();saveProfile();});
    ui.form.addEventListener('input',onFormInput);ui.form.addEventListener('change',onFormInput);
    ui.cancel.onclick=resetDraft;ui.addLink.onclick=()=>{if((state.draft?.profile_links?.length||0)>=4)return;state.draft.profile_links.push({type:'website',url:''});renderLinks();markDirty();queuePreview();};
    root.querySelector('[data-upload="avatar"]').onclick=()=>ui.avatarInput.click();root.querySelector('[data-upload="banner"]').onclick=()=>ui.bannerInput.click();
    root.querySelector('[data-remove="avatar"]').onclick=()=>removeImage('avatar');root.querySelector('[data-remove="banner"]').onclick=()=>removeImage('banner');
    ui.avatarInput.onchange=()=>pickImage('avatar',ui.avatarInput);ui.bannerInput.onchange=()=>pickImage('banner',ui.bannerInput);
    ui.memberSearch.addEventListener('input',()=>{clearTimeout(state.searchTimer);state.searchTimer=setTimeout(renderMembers,180);});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.open)requestClose();});
  }

  async function ensureBackend(){if(state.backend)return state.backend;if(!window.BlobbyChat?.backend)throw Error('Community profile service is not ready.');state.backend=await window.BlobbyChat.backend();state.me=normalizeProfile(state.backend.profile);cache.set(state.me.id,{p:state.me,until:Date.now()+120000});return state.backend;}
  async function signed(path){if(!path)return'';const hit=signedCache.get(path);if(hit&&hit.until>Date.now())return hit.url;const {supabase}=await ensureBackend();const {data,error}=await supabase.storage.from('chat-avatars').createSignedUrl(path,3600);if(error||!data?.signedUrl)return'';signedCache.set(path,{url:data.signedUrl,until:Date.now()+3300000});return data.signedUrl;}
  async function fetchProfile(id,force=false){if(!force){const hit=cache.get(id);if(hit&&hit.until>Date.now())return normalizeProfile(hit.p);}const {supabase}=await ensureBackend();const {data,error}=await supabase.from('chat_profiles').select(PROFILE_FIELDS).eq('id',id).maybeSingle();if(error)throw error;if(!data)throw Error('Profile not found.');const p=normalizeProfile(data);cache.set(id,{p,until:Date.now()+120000});return p;}

  function setOpen(v){state.open=!!v;ui.root.dataset.open=String(state.open);ui.shell.setAttribute('aria-hidden',String(!state.open));ui.shell.inert=!state.open;}
  async function open(profileId=''){if(document.body.dataset.licenseState!=='unlocked')return;build();closeOtherPanels();setOpen(true);appExpand();showLoading('Loading profile…');try{await ensureBackend();if(profileId&&profileId!==state.me.id)await showPublic(profileId);else await loadOwn();}catch(e){showLoading(friendlyError(e));}}
  function closeOtherPanels(){if(window.BlobbyChat?.state?.().open)window.BlobbyChat.close();if(window.BlobbyDM?.state?.().open)window.BlobbyDM.close();if(window.BlobbyGroup?.state?.().open)window.BlobbyGroup.close();if(window.BlobbyLeaderboard?.state?.().open)window.BlobbyLeaderboard.close();if(window.BlobbyMusic?.state?.().open)window.BlobbyMusic.close();window.BlobbyPanels?.close?.();}
  function canLeaveEditor(){if(!state.dirty)return true;if(!confirm('Discard your unsaved profile changes?'))return false;state.dirty=false;state.draft=clone(state.saved);state.avatarFile=null;state.bannerFile=null;revokePreview('avatar');revokePreview('banner');return true;}
  function requestClose(){if(!state.open)return;if(!canLeaveEditor())return;close();}
  function close(){if(!state.open)return;setOpen(false);revokePreview('avatar');revokePreview('banner');state.avatarFile=null;state.bannerFile=null;appRestore();}
  function showLoading(text){ui.loading.hidden=false;ui.loading.textContent=text;ui.form.hidden=true;ui.publicView.hidden=true;ui.membersView.hidden=true;}
  async function loadOwn(){const p=await fetchProfile(state.me.id,true);state.me=p;state.target=p;state.saved=clone(p);state.draft=clone(p);state.dirty=false;state.view='profile';state.avatarFile=null;state.bannerFile=null;revokePreview('avatar');revokePreview('banner');fillForm();renderPreview();showView('profile');}
  function showView(view){state.view=view;ui.loading.hidden=true;ui.form.hidden=view!=='profile';ui.publicView.hidden=view!=='public';ui.membersView.hidden=view!=='members';ui.title.textContent=view==='members'?'Members':'Profile';ui.publicBtn.textContent=view==='profile'?'View public profile':'My profile';ui.unsaved.hidden=!state.dirty;}

  function fillForm(){const p=state.draft;if(!p)return;const f=ui.form.elements;f.display_name.value=p.display_name||'';f.username.value=p.username||'';f.bio.value=p.bio||'';f.pronouns.value=p.pronouns||'';f.status_emoji.value=p.status_emoji||'';f.custom_status.value=p.custom_status||'';f.status.value=p.status||'online';f.profile_accent.value=safeHex(p.profile_accent,'#bdfbd7');f.banner_color.value=safeHex(p.banner_color,'#0b1511');f.banner_position.value=String(p.banner_position??50);f.dm_privacy.value=p.dm_privacy||'everyone';f.show_activity.checked=p.show_activity!==false;ui.bioCount.textContent=`${f.bio.value.length}/160`;renderLinks();}
  function syncFormControls(){}
  function formToDraft(){if(!state.draft)return;const f=ui.form.elements;state.draft.display_name=f.display_name.value;state.draft.username=f.username.value;state.draft.bio=f.bio.value;state.draft.pronouns=f.pronouns.value;state.draft.status_emoji=f.status_emoji.value;state.draft.custom_status=f.custom_status.value;state.draft.status=f.status.value;state.draft.profile_accent=f.profile_accent.value;state.draft.banner_color=f.banner_color.value;state.draft.banner_position=+f.banner_position.value;state.draft.dm_privacy=f.dm_privacy.value;state.draft.show_activity=f.show_activity.checked;}
  function onFormInput(e){if(!state.draft)return;formToDraft();if(e.target?.name==='bio')ui.bioCount.textContent=`${e.target.value.length}/160`;markDirty();queuePreview();}
  function markDirty(){state.dirty=true;ui.unsaved.hidden=false;ui.message.textContent='';}
  function resetDraft(){if(!state.saved)return;state.draft=clone(state.saved);state.avatarFile=null;state.bannerFile=null;revokePreview('avatar');revokePreview('banner');state.dirty=false;fillForm();renderPreview();ui.message.textContent='Changes reset.';}

  function renderLinks(){if(!ui.linkList||!state.draft)return;ui.linkList.replaceChildren();const links=normalizeLinks(state.draft.profile_links);state.draft.profile_links=links;if(!links.length)ui.linkList.append(el('div','bp-empty-links','No links added.'));
    links.forEach((link,i)=>{const row=el('div','bp-link-row');const type=el('select');['website','youtube','github','spotify'].forEach(v=>{const o=el('option','',v[0].toUpperCase()+v.slice(1));o.value=v;o.selected=v===link.type;type.append(o);});const url=el('input');url.type='url';url.placeholder='https://…';url.value=link.url;url.maxLength=300;const remove=el('button','','×');remove.type='button';remove.setAttribute('aria-label','Remove link');type.onchange=()=>{state.draft.profile_links[i].type=type.value;markDirty();queuePreview();};url.oninput=()=>{state.draft.profile_links[i].url=url.value;markDirty();queuePreview();};remove.onclick=()=>{state.draft.profile_links.splice(i,1);renderLinks();markDirty();queuePreview();};row.append(type,url,remove);ui.linkList.append(row);});ui.addLink.disabled=links.length>=4;}

  function queuePreview(){if(state.previewRaf)return;state.previewRaf=requestAnimationFrame(()=>{state.previewRaf=0;renderPreview();});}
  function renderPreview(){const p=state.draft||state.target;if(!p)return;const accent=safeHex(p.profile_accent,'#8bd3b2');ui.card.dataset.style='minimal';ui.card.style.setProperty('--bp-accent',accent);ui.card.style.background='';ui.previewName.textContent=(p.display_name||'Blobby user').trim()||'Blobby user';applyNameStyle(ui.previewName,p);ui.handle.textContent=p.username?`@${p.username.replace(/^@/,'')}`:'';ui.previewBio.textContent=(p.bio||'').trim()||'No bio yet.';ui.previewPronouns.textContent=p.pronouns||'';ui.joined.textContent=p.created_at?`Joined ${new Date(p.created_at).toLocaleDateString([],{month:'short',year:'numeric'})}`:'';ui.statusDot.dataset.status=p.status||'online';ui.previewStatus.textContent=p.show_activity===false?'':`${p.status_emoji||''}${p.status_emoji?' ':''}${p.custom_status||statusLabel(p.status)}`;renderBadges(p);renderPreviewLinks(p);renderPreviewImages(p);}
  function renderBadges(p){ui.badges.replaceChildren();const roles=['owner','admin','moderator'];if(roles.includes(p.role))ui.badges.append(el('span','bp-role-badge',roleLabel(p.role)));for(const b of (p.badges||[]).slice(0,3))ui.badges.append(el('span','bp-badge',String(b).slice(0,24)));}
  function renderPreviewLinks(p){ui.previewLinks.replaceChildren();for(const link of normalizeLinks(p.profile_links).filter(x=>/^https:\/\//i.test(x.url)).slice(0,4)){const a=el('a','bp-preview-link',linkIcon(link.type));a.title=link.type;a.href=link.url;a.target='_blank';a.rel='noopener noreferrer';ui.previewLinks.append(a);}}
  function renderPreviewImages(p){const avatarLocal=state.avatarPreview,bannerLocal=state.bannerPreview;ui.avatar.textContent='';ui.avatar.style.backgroundImage='';if(avatarLocal){ui.avatar.style.backgroundImage=`url("${avatarLocal}")`;}else if(p.avatar_path){signed(p.avatar_path).then(url=>{if(url&&state.open&&!state.avatarPreview)ui.avatar.style.backgroundImage=`url("${url.replace(/"/g,'\\"')}")`;});}else ui.avatar.textContent=initials(p.display_name);ui.banner.style.backgroundColor=safeHex(p.banner_color,'#0b1511');ui.banner.style.backgroundPosition=`center ${Math.max(0,Math.min(100,+p.banner_position||50))}%`;ui.banner.style.backgroundImage='';if(bannerLocal)ui.banner.style.backgroundImage=`url("${bannerLocal}")`;else if(p.banner_path)signed(p.banner_path).then(url=>{if(url&&state.open&&!state.bannerPreview)ui.banner.style.backgroundImage=`url("${url.replace(/"/g,'\\"')}")`;});}

  function removeImage(kind){if(!state.draft)return;if(kind==='avatar'){state.draft.avatar_path=null;state.avatarFile=null;revokePreview('avatar');}else{state.draft.banner_path=null;state.bannerFile=null;revokePreview('banner');}markDirty();renderPreview();}
  async function pickImage(kind,input){const file=input.files?.[0];input.value='';if(!file||!state.draft)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setMessage('Use a JPG, PNG, or WebP image.',true);return;}if(file.size>12*1024*1024){setMessage('Choose an image smaller than 12 MB.',true);return;}try{setMessage(`Optimizing ${kind}…`);const optimized=await compressImage(file,kind);if(kind==='avatar'){state.avatarFile=optimized;revokePreview('avatar');state.avatarPreview=URL.createObjectURL(optimized);}else{state.bannerFile=optimized;revokePreview('banner');state.bannerPreview=URL.createObjectURL(optimized);}markDirty();renderPreview();setMessage(`${kind==='avatar'?'Avatar':'Banner'} ready to save.`);}catch{setMessage('That image could not be processed.',true);}}
  async function compressImage(file,kind){const maxW=kind==='avatar'?512:1400,maxH=kind==='avatar'?512:520;let bitmap;try{bitmap=await createImageBitmap(file);}catch{bitmap=await imageBitmapFallback(file);}const scale=Math.min(1,maxW/bitmap.width,maxH/bitmap.height);const w=Math.max(1,Math.round(bitmap.width*scale)),h=Math.max(1,Math.round(bitmap.height*scale));const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{alpha:false});ctx.imageSmoothingQuality='high';ctx.drawImage(bitmap,0,0,w,h);if(bitmap.close)bitmap.close();let quality=.82,blob;do{blob=await new Promise(r=>canvas.toBlob(r,'image/webp',quality));quality-=.08;}while(blob&&blob.size>(kind==='avatar'?450000:900000)&&quality>=.5);if(!blob)throw Error('encode failed');return new File([blob],`${kind}.webp`,{type:'image/webp'});}
  function imageBitmapFallback(file){return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('image'));};img.src=url;});}

  function validateDraft(){formToDraft();const p=state.draft;p.display_name=String(p.display_name||'').trim();p.username=String(p.username||'').trim().replace(/^@+/,'').toLowerCase();p.bio=String(p.bio||'').trim();p.pronouns=String(p.pronouns||'').trim();p.status_emoji=String(p.status_emoji||'').trim();p.custom_status=String(p.custom_status||'').trim();if(p.display_name.length<2||p.display_name.length>32||!/\p{L}|\p{N}/u.test(p.display_name))return'Display name must be 2–32 visible characters.';if(p.username&&!/^[a-z0-9_]{3,24}$/.test(p.username))return'Username must be 3–24 lowercase letters, numbers, or underscores.';if(p.bio.length>160)return'Bio must be 160 characters or less.';if(!['everyone','shared_groups','nobody'].includes(p.dm_privacy))return'Choose a valid direct-message privacy option.';for(const l of normalizeLinks(p.profile_links)){if(l.url&&!/^https:\/\/[^\s]+$/i.test(l.url))return'Profile links must start with https://';}return'';}
  async function uploadPending(kind,file,profileId){if(!file)return null;const {supabase}=await ensureBackend();const path=`${profileId}/${kind}-${Date.now()}-${crypto.randomUUID().slice(0,8)}.webp`;const {error}=await supabase.storage.from('chat-avatars').upload(path,file,{cacheControl:'3600',upsert:false,contentType:'image/webp'});if(error)throw error;return path;}
  async function saveProfile(){if(!state.draft||state.draft.id!==state.me?.id)return;const validation=validateDraft();if(validation){setMessage(validation,true);return;}ui.save.disabled=true;ui.cancel.disabled=true;setMessage('Saving…');const old=state.saved;const uploaded=[];try{const {supabase}=await ensureBackend();if(state.avatarFile){const path=await uploadPending('avatar',state.avatarFile,state.draft.id);state.draft.avatar_path=path;uploaded.push(path);}if(state.bannerFile){const path=await uploadPending('banner',state.bannerFile,state.draft.id);state.draft.banner_path=path;uploaded.push(path);}const solid=safeHex(state.draft.profile_accent,'#8bd3b2'),ns={mode:'solid',color:solid,color2:solid,angle:0};state.draft.profile_style='minimal';state.draft.profile_gradient_top='#111418';state.draft.profile_gradient_bottom='#111418';state.draft.name_style=ns;const links=normalizeLinks(state.draft.profile_links).filter(x=>x.url);const {data,error}=await supabase.rpc('chat_update_profile_v3',{p_display_name:state.draft.display_name,p_username:state.draft.username||null,p_bio:state.draft.bio||null,p_pronouns:state.draft.pronouns||null,p_status_emoji:state.draft.status_emoji||null,p_custom_status:state.draft.custom_status||null,p_status:state.draft.status||'online',p_avatar_path:state.draft.avatar_path||null,p_banner_path:state.draft.banner_path||null,p_banner_color:safeHex(state.draft.banner_color,'#0b1511'),p_banner_position:Math.max(0,Math.min(100,+state.draft.banner_position||50)),p_profile_accent:safeHex(state.draft.profile_accent,'#bdfbd7'),p_profile_style:'minimal',p_gradient_top:safeHex(state.draft.profile_gradient_top,'#050807'),p_gradient_bottom:safeHex(state.draft.profile_gradient_bottom,'#646464'),p_name_style:ns,p_profile_links:links,p_dm_privacy:state.draft.dm_privacy||'everyone',p_show_activity:state.draft.show_activity!==false});if(error)throw error;const saved=normalizeProfile({...state.draft,...(data||{})});state.me=saved;state.target=saved;state.saved=clone(saved);state.draft=clone(saved);state.dirty=false;state.avatarFile=null;state.bannerFile=null;revokePreview('avatar');revokePreview('banner');cache.set(saved.id,{p:saved,until:Date.now()+300000});fillForm();renderPreview();setMessage('Saved ✓');ui.unsaved.hidden=true;window.dispatchEvent(new CustomEvent('blobby:profile-updated',{detail:{profile:clone(saved)}}));const obsolete=[old?.avatar_path&&old.avatar_path!==saved.avatar_path?old.avatar_path:null,old?.banner_path&&old.banner_path!==saved.banner_path?old.banner_path:null].filter(Boolean);if(obsolete.length)supabase.storage.from('chat-avatars').remove(obsolete).catch(()=>{});}catch(e){if(uploaded.length){try{const {supabase}=await ensureBackend();await supabase.storage.from('chat-avatars').remove(uploaded);}catch{}}setMessage(friendlyError(e),true);}finally{ui.save.disabled=false;ui.cancel.disabled=false;}}
  function setMessage(text,error=false){if(!ui.message)return;ui.message.textContent=text||'';ui.message.dataset.error=String(!!error);}
  function friendlyError(e){const m=String(e?.message||e||'');if(/username already taken|duplicate key/i.test(m))return'That username is already taken.';if(/invalid username/i.test(m))return'Use 3–24 lowercase letters, numbers, or underscores for the username.';if(/invalid display name/i.test(m))return'Display name must be 2–32 visible characters.';if(/profile links/i.test(m))return'One of your profile links is invalid.';if(/network|fetch/i.test(m))return'Couldn’t update your profile. Check your connection and try again.';return m&&m.length<160?m:'Couldn’t update your profile. Your previous profile was kept.';}

  async function showPublic(id){showLoading('Loading profile…');state.view='public';try{const p=await fetchProfile(id||state.me.id);state.target=p;state.draft=null;renderPublic(p);showView('public');}catch(e){showLoading(friendlyError(e));}}
  function renderPublic(p){ui.publicView.replaceChildren();const box=el('article','bp-public-card');const hero=el('div','bp-public-banner');hero.style.backgroundColor=safeHex(p.banner_color,'#0b1511');hero.style.backgroundPosition=`center ${p.banner_position||50}%`;if(p.banner_path)signed(p.banner_path).then(url=>{if(url&&box.isConnected)hero.style.backgroundImage=`url("${url.replace(/"/g,'\\"')}")`;});const av=el('div','bp-public-avatar',initials(p.display_name));if(p.avatar_path)signed(p.avatar_path).then(url=>{if(url&&av.isConnected){av.textContent='';av.style.backgroundImage=`url("${url.replace(/"/g,'\\"')}")`;}});const copy=el('div','bp-public-copy');const badges=el('div','bp-public-badges');if(['owner','admin','moderator'].includes(p.role))badges.append(el('span','bp-role-badge',roleLabel(p.role)));for(const b of(p.badges||[]).slice(0,3))badges.append(el('span','bp-badge',b));const name=el('strong','bp-public-name',p.display_name||'Blobby user');applyNameStyle(name,p);const handle=el('span','bp-public-handle',p.username?`@${p.username}`:'');const bio=el('p','bp-public-bio',p.bio||'No bio yet.');const status=el('span','bp-public-status',p.show_activity===false?'':`${p.status_emoji||''}${p.status_emoji?' ':''}${p.custom_status||statusLabel(p.status)}`);const meta=el('div','bp-public-meta');if(p.pronouns)meta.append(el('span','',p.pronouns));meta.append(el('span','',`Joined ${new Date(p.created_at).toLocaleDateString([],{month:'short',year:'numeric'})}`));const links=el('div','bp-public-links');for(const l of normalizeLinks(p.profile_links).filter(x=>/^https:\/\//i.test(x.url))){const a=el('a','',linkIcon(l.type));a.title=l.type;a.href=l.url;a.target='_blank';a.rel='noopener noreferrer';links.append(a);}const actions=el('div','bp-public-actions');if(p.id===state.me?.id){const edit=el('button','','Edit profile');edit.type='button';edit.onclick=loadOwn;actions.append(edit);}else{const msg=el('button','','Message');msg.type='button';msg.onclick=()=>{close();window.BlobbyFeatures?.openDMWith?.(p.id).catch?.(console.warn);};actions.append(msg);}copy.append(badges,name,handle,bio,status,meta,links,actions);box.append(hero,av,copy);box.dataset.style='minimal';box.style.setProperty('--bp-accent',safeHex(p.profile_accent,'#bdfbd7'));ui.publicView.append(box);}

  async function showMembers(){showLoading('Loading members…');state.view='members';try{const {supabase}=await ensureBackend();const {data,error}=await supabase.from('chat_profiles').select(PROFILE_FIELDS).order('created_at',{ascending:true}).limit(MAX_MEMBERS);if(error)throw error;state.members=(data||[]).map(normalizeProfile);state.members.forEach(p=>cache.set(p.id,{p,until:Date.now()+120000}));ui.memberSearch.value='';renderMembers();showView('members');}catch(e){showLoading(friendlyError(e));}}
  function renderMembers(){if(state.view!=='members')return;const term=String(ui.memberSearch.value||'').trim().toLowerCase();const rows=state.members.filter(p=>!term||`${p.display_name} ${p.username||''} ${p.bio||''}`.toLowerCase().includes(term)).slice(0,150);ui.membersGrid.replaceChildren();if(!rows.length){ui.membersGrid.append(el('div','bp-empty','No members match that search.'));return;}const frag=document.createDocumentFragment();for(const p of rows){const card=el('button','bp-member-card');card.type='button';const av=el('span','bp-member-avatar',initials(p.display_name));if(p.avatar_path)signed(p.avatar_path).then(url=>{if(url&&av.isConnected){av.textContent='';av.style.backgroundImage=`url("${url.replace(/"/g,'\\"')}")`;}});const copy=el('span','bp-member-copy');const name=el('strong','',p.display_name);applyNameStyle(name,p);copy.append(name,el('small','',p.username?`@${p.username}`:roleLabel(p.role)),el('span','',p.show_activity===false?'':(p.custom_status||statusLabel(p.status))));card.append(av,copy);card.onclick=()=>showPublic(p.id);frag.append(card);}ui.membersGrid.append(frag);}

  function statePublic(){return{open:state.open,view:state.view,dirty:state.dirty,profile:state.target?{id:state.target.id,displayName:state.target.display_name}:null};}
  window.addEventListener('blobby:license-locked',()=>{state.backend=null;state.me=null;cache.clear();if(state.open)close();});
  window.BlobbyProfile=Object.freeze({open,close:requestClose,members:async()=>{if(!state.open)await open();await showMembers();},state:statePublic,cache:()=>[...cache.values()].map(x=>clone(x.p))});
})();
