'use strict';
(() => {
  const PROFILE_FIELDS = [
    'id','display_name','avatar_path','banner_path','banner_color','bio','pronouns',
    'status','custom_status','role','created_at','updated_at',
    'profile_gradient_top','profile_gradient_bottom','name_style'
  ].join(',');

  const state = {
    open:false,
    backend:null,
    me:null,
    profile:null,
    targetId:'',
    members:[],
    avatarUrls:new Map(),
    view:'profile'
  };

  let ui = {};

  const el=(tag,cls='',text)=>{
    const n=document.createElement(tag);
    if(cls)n.className=cls;
    if(text!==undefined)n.textContent=text;
    return n;
  };

  const q=(s,r=document)=>r.querySelector(s);

  function initials(name){
    const p=String(name||'?').trim().split(/\s+/).filter(Boolean);
    return ((p[0]?.[0]||'?')+(p.length>1?(p.at(-1)?.[0]||''):'')).toUpperCase().slice(0,2);
  }

  function safeHex(v, fallback){
    v=String(v||'').trim();
    return /^#[0-9a-f]{6}$/i.test(v)?v.toLowerCase():fallback;
  }

  function styleObj(p){
    const s=(p&&typeof p.name_style==='object'&&p.name_style)||{};
    return {
      mode:s.mode==='gradient'?'gradient':'solid',
      color:safeHex(s.color,'#bdfbd7'),
      color2:safeHex(s.color2,'#ff4b93'),
      angle:Number.isFinite(+s.angle)?Math.max(0,Math.min(360,+s.angle)):90
    };
  }

  function applyNameStyle(node,p){
    if(!node)return;
    const s=styleObj(p);
    node.style.removeProperty('background');
    node.style.removeProperty('-webkit-background-clip');
    node.style.removeProperty('background-clip');
    node.style.removeProperty('-webkit-text-fill-color');
    node.style.removeProperty('color');

    if(s.mode==='gradient'){
      node.style.background=`linear-gradient(${s.angle}deg,${s.color},${s.color2})`;
      node.style.webkitBackgroundClip='text';
      node.style.backgroundClip='text';
      node.style.webkitTextFillColor='transparent';
      node.style.color='transparent';
    }else{
      node.style.color=s.color;
    }
  }

  function roleLabel(role){
    return role==='owner'?'OWNER':role==='admin'?'ADMIN':role==='moderator'?'MODERATOR':'MEMBER';
  }

  function statusLabel(v){
    return v==='away'?'Away':v==='dnd'?'Do Not Disturb':v==='invisible'?'Invisible':'Online';
  }

  function appExpand(){
    try{window.BlobbyAppUI?.expand?.('profile');}catch{}
  }
  function appRestore(){
    try{window.BlobbyAppUI?.restore?.();}catch{}
  }

  function build(){
    if(ui.root||!document.body)return;

    const root=el('div','blobby-profile-root');
    root.id='blobbyProfileRoot';
    root.dataset.open='false';
    root.innerHTML=`
      <div class="bp-backdrop"></div>
      <section class="bp-shell" aria-hidden="true">
        <header class="bp-top">
          <div>
            <small>BLOBBY COMMUNITY</small>
            <h2>Profile</h2>
          </div>
          <div class="bp-top-actions">
            <button class="bp-members-btn" type="button">Browse members</button>
            <button class="bp-public-btn" type="button">View public profile</button>
            <button class="bp-close" type="button" aria-label="Close profile">×</button>
          </div>
        </header>

        <div class="bp-body">
          <aside class="bp-preview-column">
            <article class="bp-card">
              <div class="bp-banner"></div>
              <div class="bp-card-overlay"></div>
              <div class="bp-avatar-wrap">
                <div class="bp-avatar"></div>
                <span class="bp-status-dot"></span>
              </div>
              <div class="bp-card-copy">
                <div class="bp-role"></div>
                <strong class="bp-preview-name"></strong>
                <span class="bp-handle"></span>
                <p class="bp-preview-bio"></p>
                <div class="bp-card-meta">
                  <span class="bp-preview-pronouns"></span>
                  <span class="bp-joined"></span>
                </div>
              </div>
            </article>

            <section class="bp-activity">
              <div class="bp-activity-icon">○</div>
              <div><small>ACTIVE IN</small><strong>Blobby community</strong><span class="bp-presence"></span></div>
            </section>
          </aside>

          <main class="bp-editor">
            <div class="bp-loading">Loading profile…</div>

            <div class="bp-edit-content" hidden>
              <section class="bp-section">
                <div class="bp-section-title"><small>PROFILE</small><h3>Identity</h3></div>

                <div class="bp-row">
                  <div><strong>Display name</strong><span class="bp-current-name"></span></div>
                  <button type="button" data-edit="display">Change</button>
                </div>

                <div class="bp-row">
                  <div><strong>Avatar</strong><span>Square JPG, PNG, or WebP. Up to 5 MB.</span></div>
                  <button type="button" data-upload="avatar">Upload image</button>
                </div>

                <div class="bp-row">
                  <div><strong>Banner</strong><span>Upload an image or use a banner color.</span></div>
                  <div class="bp-row-actions">
                    <button type="button" data-upload="banner">Upload image</button>
                    <label class="bp-color-button">Set color<input class="bp-banner-color" type="color"></label>
                  </div>
                </div>

                <div class="bp-row">
                  <div><strong>Bio</strong><span class="bp-current-bio"></span></div>
                  <button type="button" data-edit="bio">Edit</button>
                </div>

                <div class="bp-row">
                  <div><strong>Pronouns</strong><span class="bp-current-pronouns"></span></div>
                  <button type="button" data-edit="pronouns">Edit</button>
                </div>

                <div class="bp-row">
                  <div><strong>Custom status</strong><span class="bp-current-status"></span></div>
                  <button type="button" data-edit="status">Edit</button>
                </div>
              </section>

              <section class="bp-section">
                <div class="bp-section-title"><small>APPEARANCE</small><h3>Profile card</h3></div>

                <div class="bp-style-grid">
                  <label>
                    <span>Gradient top</span>
                    <input class="bp-gradient-top" type="color">
                  </label>
                  <label>
                    <span>Gradient bottom</span>
                    <input class="bp-gradient-bottom" type="color">
                  </label>
                </div>

                <div class="bp-name-style">
                  <div><strong>Username style</strong><span>Used on your profile and in Blobby chat.</span></div>
                  <div class="bp-name-preview"></div>

                  <div class="bp-segment">
                    <button type="button" data-name-mode="solid">Solid color</button>
                    <button type="button" data-name-mode="gradient">Gradient</button>
                  </div>

                  <div class="bp-style-grid">
                    <label><span>Color</span><input class="bp-name-color1" type="color"></label>
                    <label class="bp-name-color2-wrap"><span>Second color</span><input class="bp-name-color2" type="color"></label>
                  </div>
                </div>

                <div class="bp-savebar">
                  <span class="bp-message"></span>
                  <button class="bp-save" type="button">Save profile</button>
                </div>
              </section>
            </div>

            <section class="bp-public-view" hidden></section>
            <section class="bp-members-view" hidden>
              <div class="bp-members-head">
                <div><small>COMMUNITY</small><h3>Browse members</h3></div>
                <input class="bp-member-search" type="search" placeholder="Search members">
              </div>
              <div class="bp-members-grid"></div>
            </section>
          </main>
        </div>

        <input class="bp-file-avatar" type="file" accept="image/jpeg,image/png,image/webp" hidden>
        <input class="bp-file-banner" type="file" accept="image/jpeg,image/png,image/webp" hidden>
      </section>
    `;
    document.body.append(root);

    ui={
      root,
      shell:q('.bp-shell',root),
      backdrop:q('.bp-backdrop',root),
      close:q('.bp-close',root),
      publicBtn:q('.bp-public-btn',root),
      membersBtn:q('.bp-members-btn',root),
      loading:q('.bp-loading',root),
      editContent:q('.bp-edit-content',root),
      publicView:q('.bp-public-view',root),
      membersView:q('.bp-members-view',root),
      banner:q('.bp-banner',root),
      card:q('.bp-card',root),
      avatar:q('.bp-avatar',root),
      statusDot:q('.bp-status-dot',root),
      role:q('.bp-role',root),
      previewName:q('.bp-preview-name',root),
      handle:q('.bp-handle',root),
      previewBio:q('.bp-preview-bio',root),
      previewPronouns:q('.bp-preview-pronouns',root),
      joined:q('.bp-joined',root),
      presence:q('.bp-presence',root),
      currentName:q('.bp-current-name',root),
      currentBio:q('.bp-current-bio',root),
      currentPronouns:q('.bp-current-pronouns',root),
      currentStatus:q('.bp-current-status',root),
      bannerColor:q('.bp-banner-color',root),
      gradientTop:q('.bp-gradient-top',root),
      gradientBottom:q('.bp-gradient-bottom',root),
      namePreview:q('.bp-name-preview',root),
      nameColor1:q('.bp-name-color1',root),
      nameColor2:q('.bp-name-color2',root),
      nameColor2Wrap:q('.bp-name-color2-wrap',root),
      save:q('.bp-save',root),
      message:q('.bp-message',root),
      avatarInput:q('.bp-file-avatar',root),
      bannerInput:q('.bp-file-banner',root),
      memberSearch:q('.bp-member-search',root),
      membersGrid:q('.bp-members-grid',root)
    };

    ui.close.onclick=close;
    ui.backdrop.onclick=close;
    ui.publicBtn.onclick=()=>showPublic(state.me?.id);
    ui.membersBtn.onclick=showMembers;
    ui.save.onclick=saveProfile;

    root.querySelector('[data-upload="avatar"]').onclick=()=>ui.avatarInput.click();
    root.querySelector('[data-upload="banner"]').onclick=()=>ui.bannerInput.click();
    ui.avatarInput.onchange=()=>uploadPicked('avatar',ui.avatarInput);
    ui.bannerInput.onchange=()=>uploadPicked('banner',ui.bannerInput);

    root.querySelectorAll('[data-edit]').forEach(btn=>{
      btn.onclick=()=>editField(btn.dataset.edit);
    });

    root.querySelectorAll('[data-name-mode]').forEach(btn=>{
      btn.onclick=()=>{
        if(!state.profile)return;
        const s=styleObj(state.profile);
        s.mode=btn.dataset.nameMode;
        state.profile.name_style=s;
        render();
      };
    });

    [ui.bannerColor,ui.gradientTop,ui.gradientBottom,ui.nameColor1,ui.nameColor2].forEach(inp=>{
      inp.addEventListener('input',()=>{
        if(!state.profile)return;
        state.profile.banner_color=ui.bannerColor.value;
        state.profile.profile_gradient_top=ui.gradientTop.value;
        state.profile.profile_gradient_bottom=ui.gradientBottom.value;
        const s=styleObj(state.profile);
        s.color=ui.nameColor1.value;
        s.color2=ui.nameColor2.value;
        state.profile.name_style=s;
        render();
      });
    });

    ui.memberSearch.oninput=renderMembers;
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape'&&state.open)close();
    });
  }

  async function ensureBackend(){
    if(state.backend)return state.backend;
    if(!window.BlobbyChat?.backend)throw Error('Blobby community profile service is not ready.');
    state.backend=await window.BlobbyChat.backend();
    state.me=state.backend.profile;
    return state.backend;
  }

  async function signed(path){
    if(!path)return'';
    const hit=state.avatarUrls.get(path);
    if(hit&&hit.until>Date.now())return hit.url;

    const {supabase}=await ensureBackend();
    const {data,error}=await supabase.storage.from('chat-avatars').createSignedUrl(path,3600);
    if(error||!data?.signedUrl)return'';

    state.avatarUrls.set(path,{url:data.signedUrl,until:Date.now()+3300000});
    return data.signedUrl;
  }

  async function fetchProfile(id){
    const {supabase}=await ensureBackend();
    const {data,error}=await supabase.from('chat_profiles').select(PROFILE_FIELDS).eq('id',id).maybeSingle();
    if(error)throw error;
    if(!data)throw Error('Profile not found.');
    return data;
  }

  async function loadOwn(){
    const backend=await ensureBackend();
    state.targetId=backend.profile.id;
    state.profile=await fetchProfile(state.targetId);
    state.me=state.profile;
    state.view='profile';
    render();
  }

  function setOpen(v){
    state.open=!!v;
    ui.root.dataset.open=String(state.open);
    ui.shell.setAttribute('aria-hidden',String(!state.open));
  }

  async function open(profileId=''){
    if(document.body.dataset.licenseState!=='unlocked')return;
    build();

    if(window.BlobbyChat?.state?.().open)window.BlobbyChat.close();
    if(window.BlobbyDM?.state?.().open)window.BlobbyDM.close();
    if(window.BlobbyGroup?.state?.().open)window.BlobbyGroup.close();
    if(window.BlobbyLeaderboard?.state?.().open)window.BlobbyLeaderboard.close();
    if(window.BlobbyMusic?.state?.().open)window.BlobbyMusic.close();

    setOpen(true);
    appExpand();
    ui.loading.hidden=false;
    ui.editContent.hidden=true;
    ui.publicView.hidden=true;
    ui.membersView.hidden=true;

    try{
      await ensureBackend();
      if(profileId&&profileId!==state.me.id){
        await showPublic(profileId);
      }else{
        await loadOwn();
      }
    }catch(err){
      ui.loading.hidden=false;
      ui.loading.textContent=err?.message||'Could not load profile.';
    }
  }

  function close(){
    if(!state.open)return;
    setOpen(false);
    appRestore();
  }

  async function showPublic(id){
    ui.loading.hidden=false;
    ui.editContent.hidden=true;
    ui.membersView.hidden=true;
    ui.publicView.hidden=true;
    state.view='public';

    try{
      const p=await fetchProfile(id||state.me.id);
      state.targetId=p.id;
      state.profile=p;
      render();
      renderPublic(p);
    }catch(err){
      ui.loading.textContent=err?.message||'Could not load this profile.';
    }
  }

  async function showMembers(){
    ui.loading.hidden=false;
    ui.editContent.hidden=true;
    ui.publicView.hidden=true;
    ui.membersView.hidden=true;
    state.view='members';

    try{
      const {supabase}=await ensureBackend();
      const {data,error}=await supabase.from('chat_profiles').select(PROFILE_FIELDS).order('created_at',{ascending:true}).limit(500);
      if(error)throw error;
      state.members=data||[];
      ui.loading.hidden=true;
      ui.membersView.hidden=false;
      renderMembers();
    }catch(err){
      ui.loading.textContent=err?.message||'Could not load members.';
    }
  }

  function render(){
    if(!state.profile)return;
    const p=state.profile;
    const own=p.id===state.me?.id;

    ui.loading.hidden=true;
    ui.editContent.hidden=!(state.view==='profile'&&own);
    ui.publicView.hidden=state.view!=='public';
    ui.membersView.hidden=state.view!=='members';

    const top=safeHex(p.profile_gradient_top,'#050807');
    const bottom=safeHex(p.profile_gradient_bottom,'#646464');
    ui.card.style.background=`linear-gradient(180deg,${top},${bottom})`;

    ui.bannerColor.value=safeHex(p.banner_color,'#0b1511');
    ui.gradientTop.value=top;
    ui.gradientBottom.value=bottom;

    ui.role.textContent=roleLabel(p.role);
    ui.previewName.textContent=p.display_name||'Blobby user';
    applyNameStyle(ui.previewName,p);
    ui.handle.textContent='@'+String(p.display_name||'member').toLowerCase().replace(/[^a-z0-9]+/g,'').slice(0,20);
    ui.previewBio.textContent=p.bio||'No bio yet.';
    ui.previewPronouns.textContent=p.pronouns||'';
    ui.joined.textContent='Joined '+new Date(p.created_at).toLocaleDateString([], {month:'short',day:'numeric',year:'numeric'});
    ui.presence.textContent=statusLabel(p.status);

    ui.currentName.textContent=p.display_name||'';
    ui.currentBio.textContent=p.bio||'Not set';
    ui.currentPronouns.textContent=p.pronouns||'Not set';
    ui.currentStatus.textContent=p.custom_status||'Not set';

    const ns=styleObj(p);
    ui.namePreview.textContent=p.display_name||'Blobby user';
    applyNameStyle(ui.namePreview,p);
    ui.nameColor1.value=ns.color;
    ui.nameColor2.value=ns.color2;
    ui.nameColor2Wrap.hidden=ns.mode!=='gradient';
    ui.root.querySelectorAll('[data-name-mode]').forEach(b=>b.classList.toggle('active',b.dataset.nameMode===ns.mode));

    ui.statusDot.dataset.status=p.status||'online';
    ui.publicBtn.textContent=own&&state.view!=='public'?'View public profile':'My profile';

    if(p.avatar_path){
      signed(p.avatar_path).then(url=>{
        if(!url||state.profile?.id!==p.id)return;
        ui.avatar.style.backgroundImage=`url("${url.replace(/"/g,'\\"')}")`;
        ui.avatar.textContent='';
      });
    }else{
      ui.avatar.style.backgroundImage='';
      ui.avatar.textContent=initials(p.display_name);
    }

    if(p.banner_path){
      signed(p.banner_path).then(url=>{
        if(!url||state.profile?.id!==p.id)return;
        ui.banner.style.backgroundImage=`linear-gradient(0deg,rgba(0,0,0,.12),rgba(0,0,0,.12)),url("${url.replace(/"/g,'\\"')}")`;
      });
    }else{
      ui.banner.style.backgroundImage='';
      ui.banner.style.backgroundColor=safeHex(p.banner_color,'#0b1511');
    }
  }

  function renderPublic(p){
    ui.loading.hidden=true;
    ui.publicView.hidden=false;
    ui.publicView.replaceChildren();

    const box=el('div','bp-public-card');
    const top=el('div','bp-public-top');
    const av=el('div','bp-public-avatar',initials(p.display_name));
    const copy=el('div','bp-public-copy');
    const role=el('span','bp-public-role',roleLabel(p.role));
    const name=el('strong','',p.display_name||'Blobby user');
    applyNameStyle(name,p);
    const meta=el('span','',p.pronouns||'Blobby member');
    copy.append(role,name,meta);
    top.append(av,copy);

    if(p.avatar_path){
      signed(p.avatar_path).then(url=>{
        if(!url)return;
        av.textContent='';
        av.style.backgroundImage=`url("${url.replace(/"/g,'\\"')}")`;
      });
    }

    const bio=el('p','bp-public-bio',p.bio||'No bio yet.');
    const stats=el('div','bp-public-stats');
    stats.append(
      el('span','',`Joined ${new Date(p.created_at).toLocaleDateString([], {month:'short',year:'numeric'})}`),
      el('span','',p.custom_status||statusLabel(p.status))
    );

    const actions=el('div','bp-public-actions');
    if(p.id===state.me?.id){
      const edit=el('button','','Edit profile');
      edit.onclick=async()=>{state.view='profile';state.profile=await fetchProfile(state.me.id);render();};
      actions.append(edit);
    }

    box.append(top,bio,stats,actions);
    ui.publicView.append(box);
  }

  function renderMembers(){
    if(state.view!=='members')return;
    const term=String(ui.memberSearch.value||'').trim().toLowerCase();
    const items=state.members.filter(p=>{
      if(!term)return true;
      return `${p.display_name} ${p.bio||''} ${p.pronouns||''}`.toLowerCase().includes(term);
    });

    ui.membersGrid.replaceChildren();
    if(!items.length){
      ui.membersGrid.append(el('div','bp-empty','No members match that search.'));
      return;
    }

    for(const p of items){
      const card=el('button','bp-member-card');
      card.type='button';

      const av=el('div','bp-member-avatar',initials(p.display_name));
      const name=el('strong','',p.display_name);
      applyNameStyle(name,p);
      const meta=el('span','',p.pronouns||roleLabel(p.role));
      const status=el('small','',p.custom_status||statusLabel(p.status));

      card.append(av,name,meta,status);
      card.onclick=()=>showPublic(p.id);

      if(p.avatar_path){
        signed(p.avatar_path).then(url=>{
          if(!url||!card.isConnected)return;
          av.textContent='';
          av.style.backgroundImage=`url("${url.replace(/"/g,'\\"')}")`;
        });
      }

      ui.membersGrid.append(card);
    }
  }

  async function editField(which){
    if(!state.profile||state.profile.id!==state.me?.id)return;
    const p=state.profile;

    let label='', current='', max=80;
    if(which==='display'){label='Display name';current=p.display_name||'';max=32;}
    else if(which==='bio'){label='Bio';current=p.bio||'';max=240;}
    else if(which==='pronouns'){label='Pronouns';current=p.pronouns||'';max=40;}
    else if(which==='status'){label='Custom status';current=p.custom_status||'';max=80;}
    else return;

    const next=prompt(`${label}:`,current);
    if(next===null)return;

    const clean=String(next).trim().slice(0,max);
    if(which==='display'&&clean.length<2){
      ui.message.textContent='Display name must be at least 2 characters.';
      return;
    }

    if(which==='display')p.display_name=clean;
    if(which==='bio')p.bio=clean;
    if(which==='pronouns')p.pronouns=clean;
    if(which==='status')p.custom_status=clean;
    render();
  }

  function extFor(file){
    if(file.type==='image/png')return'png';
    if(file.type==='image/webp')return'webp';
    return'jpg';
  }

  async function uploadPicked(kind,input){
    const file=input.files?.[0];
    input.value='';
    if(!file||!state.profile||state.profile.id!==state.me?.id)return;

    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){
      ui.message.textContent='Use a JPG, PNG, or WebP image.';
      return;
    }

    if(file.size>5*1024*1024){
      ui.message.textContent='Image must be 5 MB or smaller.';
      return;
    }

    ui.message.textContent=`Uploading ${kind}…`;

    try{
      const {supabase}=await ensureBackend();
      const path=`${state.profile.id}/${kind}-${Date.now()}.${extFor(file)}`;
      const {error}=await supabase.storage.from('chat-avatars').upload(path,file,{
        cacheControl:'3600',
        upsert:false,
        contentType:file.type
      });
      if(error)throw error;

      if(kind==='avatar')state.profile.avatar_path=path;
      else state.profile.banner_path=path;

      await saveProfile();
    }catch(err){
      ui.message.textContent=err?.message||`Could not upload ${kind}.`;
    }
  }

  async function saveProfile(){
    if(!state.profile||state.profile.id!==state.me?.id)return;
    ui.save.disabled=true;
    ui.message.textContent='Saving…';

    try{
      const p=state.profile;
      const ns=styleObj(p);
      const {supabase}=await ensureBackend();

      const {data,error}=await supabase.rpc('chat_update_profile_v2',{
        p_display_name:p.display_name,
        p_bio:p.bio||null,
        p_pronouns:p.pronouns||null,
        p_custom_status:p.custom_status||null,
        p_status:p.status||'online',
        p_avatar_path:p.avatar_path||null,
        p_banner_path:p.banner_path||null,
        p_banner_color:safeHex(p.banner_color,'#0b1511'),
        p_gradient_top:safeHex(p.profile_gradient_top,'#050807'),
        p_gradient_bottom:safeHex(p.profile_gradient_bottom,'#646464'),
        p_name_style:ns
      });

      if(error)throw error;
      if(data){
        state.profile={...state.profile,...data};
        state.me=state.profile;
      }

      ui.message.textContent='Saved.';
      render();
      window.dispatchEvent(new CustomEvent('blobby:profile-updated',{detail:{profile:{...state.profile}}}));
    }catch(err){
      const m=String(err?.message||'');
      ui.message.textContent=/cooldown/i.test(m)
        ? 'Display name can only be changed once every 10 minutes.'
        : (m||'Could not save profile.');
    }finally{
      ui.save.disabled=false;
    }
  }

  function statePublic(){
    return {
      open:state.open,
      view:state.view,
      profile:state.profile?{id:state.profile.id,displayName:state.profile.display_name}:null
    };
  }

  function boot(){
    build();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();

  window.BlobbyProfile=Object.freeze({
    open,
    close,
    members:async()=>{if(!state.open)await open();await showMembers();},
    state:statePublic
  });
})();