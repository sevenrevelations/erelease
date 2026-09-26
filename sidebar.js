'use strict';
(() => {
  const ICONS={
    home:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 10.7 12 3.8l8.5 6.9v8.1a1.7 1.7 0 0 1-1.7 1.7h-4.5v-6.2H9.7v6.2H5.2a1.7 1.7 0 0 1-1.7-1.7z"/></svg>',
    chat:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.2 4.5h15.6a1.7 1.7 0 0 1 1.7 1.7v9.4a1.7 1.7 0 0 1-1.7 1.7H9l-5.6 3v-4.5a1.7 1.7 0 0 1-.9-1.5V6.2a1.7 1.7 0 0 1 1.7-1.7Z"/></svg>',
    dm:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5a8.5 8.5 0 1 1-5.1 15.3L3 20l1.3-3.7A8.5 8.5 0 0 1 12 3.5Z"/><path d="M8 12h8M8 8.5h5.5"/></svg>',
    groups:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8.3" r="3"/><circle cx="17" cy="9.5" r="2.4"/><path d="M3.5 19.5v-1.2c0-3 2.5-5.4 5.5-5.4s5.5 2.4 5.5 5.4v1.2M14.3 14.2c.8-.6 1.8-.9 2.8-.9 2.3 0 4.2 1.8 4.2 4.1v1"/></svg>',
    leaderboard:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8v2.5a4 4 0 0 1-8 0zM8.2 5.2H4.5v1.4a4 4 0 0 0 4.3 4M15.8 5.2h3.7v1.4a4 4 0 0 1-4.3 4M12 10.5v4M8.5 20h7M9.5 14.5h5l1 5h-7z"/></svg>',
    music:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18.5a3 3 0 1 1-3-3c.7 0 1.4.2 2 .7V6l11-2v11.5a3 3 0 1 1-1-2.2V7.1L9 8.7z"/></svg>',
    bookmarks:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3.5h11v17L12 17l-5.5 3.5z"/></svg>',
    history:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.2 7.2V3.8M4.2 3.8h3.4M4.5 4.5a9 9 0 1 1-1.1 10.8M12 7.2v5l3.4 2"/></svg>',
    downloads:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5v11M7.5 10.5 12 15l4.5-4.5M4.5 20h15"/></svg>',
    settings:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.1 13.3a7.6 7.6 0 0 0 0-2.6l2-1.5-2-3.4-2.5 1a8.6 8.6 0 0 0-2.2-1.3L14 3h-4l-.4 2.5a8.6 8.6 0 0 0-2.2 1.3l-2.5-1-2 3.4 2 1.5a7.6 7.6 0 0 0 0 2.6l-2 1.5 2 3.4 2.5-1a8.6 8.6 0 0 0 2.2 1.3L10 21h4l.4-2.5a8.6 8.6 0 0 0 2.2-1.3l2.5 1 2-3.4z"/></svg>',
    close:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>'
  };

  const PANELS={
    hub:{title:'Blobby sidebar',eyebrow:'Navigation',icon:'home',body:'The new lightweight sidebar shell is active. Features are being moved here one at a time so the browser stays stable and fast.'},
    dms:{title:'Direct messages',eyebrow:'Coming next',icon:'dm',body:'Private one-to-one conversations will live here. DMs will use stable Blobby profiles, realtime updates, unread counts, replies, reactions, attachments, blocking and private RLS.'},
    groups:{title:'Group chats',eyebrow:'Planned',icon:'groups',body:'Private group conversations will support owners, admins and members without loading until you actually open Groups.'},
    leaderboard:{title:'Leaderboard',eyebrow:'Planned',icon:'leaderboard',body:'Top 5 users will be ranked by legitimate active Blobby time — never by chat spam, page loads, or websites visited.'},
    music:{title:'Blobby Music',eyebrow:'Reserved',icon:'music',body:'The player area is reserved for a future lawful streaming integration. Nothing music-related loads in the background right now.'},
    bookmarks:{title:'Bookmarks',eyebrow:'Browser tools',icon:'bookmarks',body:'Your existing bookmarks remain untouched. A compact sidebar view can be added after the social features are stable.'},
    history:{title:'History',eyebrow:'Browser tools',icon:'history',body:'Your existing recent/history behavior remains unchanged. The sidebar version will stay local and lightweight.'},
    downloads:{title:'Downloads',eyebrow:'Browser tools',icon:'downloads',body:'Downloads continue using your existing App Inventor/WebViewExtra flow. This panel is only a reserved navigation destination for now.'}
  };

  const ITEMS=[
    {id:'home',label:'Home',icon:'home',action:'home'},
    {separator:true},
    {id:'chat',label:'Global Chat',icon:'chat',action:'chat'},
    {id:'dms',label:'DMs',icon:'dm',action:'dms'},
    {id:'groups',label:'Groups',icon:'groups',panel:'groups',soon:true},
    {id:'leaderboard',label:'Leaderboard',icon:'leaderboard',panel:'leaderboard',soon:true},
    {separator:true},
    {id:'music',label:'Music',icon:'music',panel:'music',soon:true},
    {separator:true},
    {id:'bookmarks',label:'Bookmarks',icon:'bookmarks',panel:'bookmarks'},
    {id:'history',label:'History',icon:'history',panel:'history'},
    {id:'downloads',label:'Downloads',icon:'downloads',panel:'downloads'},
    {separator:true},
    {id:'settings',label:'Settings',icon:'settings',action:'settings'}
  ];

  let root,rail,panel,title,eyebrow,body,backdrop,closeButton,ready=false;
  const buttons=new Map();

  function node(tag,cls=''){const n=document.createElement(tag);if(cls)n.className=cls;return n;}
  function icon(name){const span=node('span','blobby-sidebar-icon');span.innerHTML=ICONS[name]||ICONS.home;return span;}

  function railButton(item){
    const b=node('button','blobby-sidebar-button');b.type='button';b.dataset.sidebarId=item.id;b.dataset.label=item.label;b.setAttribute('aria-label',item.label);b.title=item.label;
    b.append(icon(item.icon));
    if(item.soon){const dot=node('span','blobby-sidebar-soon');dot.setAttribute('aria-hidden','true');b.append(dot);}
    b.addEventListener('click',()=>activate(item));buttons.set(item.id,b);return b;
  }

  function build(){
    if(ready||!document.body)return;ready=true;
    root=node('div','blobby-sidebar-root');root.id='blobbySidebarRoot';root.dataset.open='false';
    rail=node('nav','blobby-sidebar-rail hide-scrollbar');rail.setAttribute('aria-label','Blobby navigation');
    const brand=node('button','blobby-sidebar-brand');brand.type='button';brand.dataset.label='Blobby';brand.setAttribute('aria-label','Open Blobby sidebar');brand.title='Blobby sidebar';brand.innerHTML='<span aria-hidden="true">b</span>';
    brand.addEventListener('click',()=>window.BlobbyPanels?.toggle('hub'));rail.append(brand);
    for(const item of ITEMS){if(item.separator){rail.append(node('span','blobby-sidebar-separator'));continue;}rail.append(railButton(item));}

    backdrop=node('button','blobby-sidebar-backdrop');backdrop.type='button';backdrop.setAttribute('aria-label','Close Blobby sidebar');backdrop.addEventListener('click',()=>window.BlobbyPanels?.close());
    panel=node('aside','blobby-sidebar-panel');panel.setAttribute('aria-hidden','true');panel.setAttribute('aria-label','Blobby sidebar panel');
    const head=node('header','blobby-sidebar-panel-head');
    const heading=node('div','blobby-sidebar-heading');eyebrow=node('span','blobby-sidebar-eyebrow');title=node('h2');heading.append(eyebrow,title);
    closeButton=node('button','blobby-sidebar-close');closeButton.type='button';closeButton.setAttribute('aria-label','Close panel');closeButton.append(icon('close'));closeButton.addEventListener('click',()=>window.BlobbyPanels?.close());
    head.append(heading,closeButton);
    body=node('div','blobby-sidebar-panel-body hide-scrollbar');panel.append(head,body);
    root.append(backdrop,rail,panel);document.body.append(root);

    const browserButton=document.getElementById('sidebarBrowserButton');if(browserButton)browserButton.addEventListener('click',()=>window.BlobbyPanels?.toggle('hub'));
    window.addEventListener('blobby:panel-change',onPanelChange);
    window.addEventListener('blobby:ui-mode',syncActive);
    document.addEventListener('keydown',onKeydown);
    syncActive();
  }

  function activate(item){
    if(item.action==='home'){
      window.BlobbyPanels?.close();
      window.BlobbyAppUI?.goHome?.();
      return;
    }
    if(item.action==='settings'){
      window.BlobbyPanels?.close();
      setTimeout(()=>window.BlobbyAppUI?.openSettings?.(),0);
      return;
    }
    if(item.action==='chat'){
      window.BlobbyPanels?.close();
      if(window.BlobbyDM?.state?.().open)window.BlobbyDM.close();
      setTimeout(()=>window.BlobbyChat?.open?.(),30);
      return;
    }
    if(item.action==='dms'){
      window.BlobbyPanels?.close();
      if(window.BlobbyChat?.state?.().open)window.BlobbyChat.close();
      setTimeout(()=>window.BlobbyDM?.open?.(),30);
      return;
    }
    if(item.panel)window.BlobbyPanels?.toggle(item.panel);
  }

  function renderPanel(id){
    const data=PANELS[id]||PANELS.hub;
    eyebrow.textContent=data.eyebrow;title.textContent=data.title;body.replaceChildren();
    const intro=node('section','blobby-sidebar-intro');intro.append(icon(data.icon),node('p','blobby-sidebar-copy'));intro.querySelector('p').textContent=data.body;body.append(intro);
    if(id==='hub'){
      const grid=node('div','blobby-sidebar-status-grid');
      const entries=[['Global Chat','Ready','chat'],['DMs','Ready','dm'],['Groups','Planned','groups'],['Leaderboard','Planned','leaderboard'],['Music','Reserved','music']];
      for(const [name,status,ic] of entries){const card=node('button','blobby-sidebar-status-card');card.type='button';card.append(icon(ic));const copy=node('span');const strong=node('strong');strong.textContent=name;const small=node('small');small.textContent=status;copy.append(strong,small);card.append(copy);if(name==='Global Chat')card.addEventListener('click',()=>activate({action:'chat'}));else if(name==='DMs')card.addEventListener('click',()=>activate({action:'dms'}));else card.addEventListener('click',()=>window.BlobbyPanels?.open(name.toLowerCase()));grid.append(card);}body.append(grid);
      const note=node('p','blobby-sidebar-note');note.textContent='The sidebar is a lightweight launcher. Global Chat and DMs open in their own standalone interfaces so browsing stays stable and fast.';body.append(note);
    }else{
      const note=node('p','blobby-sidebar-note');note.textContent='This destination is intentionally lightweight for now. We will activate it in its own tested stage.';body.append(note);
    }
  }

  function onPanelChange(e){
    if(!root)return;const d=e.detail||{};
    if(d.open){root.dataset.open='true';root.dataset.panel=d.id||'hub';panel.setAttribute('aria-hidden','false');renderPanel(d.id||'hub');}
    else if(!window.BlobbyPanels?.active?.()){root.dataset.open='false';delete root.dataset.panel;panel.setAttribute('aria-hidden','true');}
    syncActive();
  }

  function syncActive(){
    if(!root)return;const activePanel=window.BlobbyPanels?.active?.()||'';const base=window.BlobbyAppUI?.baseMode?.()||document.documentElement.dataset.baseUiMode||'home';
    buttons.forEach((b,id)=>{const pressed=(id==='home'&&base==='home'&&!activePanel)||(id===activePanel);b.dataset.active=String(pressed);b.setAttribute('aria-pressed',String(pressed));});
  }

  function onKeydown(e){if(e.key==='Escape'&&window.BlobbyPanels?.active?.()){e.preventDefault();window.BlobbyPanels.close();}}

  function boot(){if(document.body.dataset.licenseState==='unlocked'&&window.BlobbyAppUI)build();}
  window.addEventListener('blobby:app-ready',build,{once:true});
  window.addEventListener('blobby:license-unlocked',()=>{if(window.BlobbyAppUI)build();});
  boot();
  window.BlobbySidebar=Object.freeze({open:id=>window.BlobbyPanels?.open(id||'hub'),close:()=>window.BlobbyPanels?.close(),state:()=>({ready,open:!!window.BlobbyPanels?.active?.(),panel:window.BlobbyPanels?.active?.()||''})});
})();
