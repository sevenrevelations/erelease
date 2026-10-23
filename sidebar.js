'use strict';
(() => {
  const svg=d=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
  const ICONS={
    home:svg('M3.5 10.5 12 3.8l8.5 6.7v9H15v-6H9v6H3.5z'),
    profile:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5.5 20c0-4 2.9-6.5 6.5-6.5s6.5 2.5 6.5 6.5"/></svg>',
    chat:svg('M4 4.5h16v12H9l-5 3z'),
    dm:svg('M4 5h16v13H8l-4 2.5zM8 9h8M8 13h5'),
    groups:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3.5 20c0-4 2.4-6.5 5.5-6.5s5.5 2.5 5.5 6.5M14.5 14.5c.7-.5 1.6-.8 2.5-.8 2.5 0 4.3 1.9 4.3 4.5V20"/></svg>',
    leaderboard:svg('M8 4h8v3a4 4 0 0 1-8 0zM12 11v4M8 20h8M9.5 15h5l1 5h-7z'),
    music:svg('M9 18.5a3 3 0 1 1-1-2.2V6l11-2v11.5a3 3 0 1 1-1-2.2V7L9 8.5z'),
    bookmarks:svg('M6.5 3.5h11v17L12 17l-5.5 3.5z'),
    history:svg('M4.5 6V3.5M4.5 3.5H7M4.8 4.5A9 9 0 1 1 3.2 15M12 7v5l3.3 2'),
    settings:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19 13.2a7 7 0 0 0 0-2.4l2-1.5-2-3.4-2.4 1a8 8 0 0 0-2.1-1.2L14 3h-4l-.5 2.7a8 8 0 0 0-2.1 1.2l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 2.1 1.2L10 21h4l.5-2.7a8 8 0 0 0 2.1-1.2l2.4 1 2-3.4z"/></svg>',
    close:svg('M6 6l12 12M18 6 6 18')
  };
  const ITEMS=[
    ['home','Home','home'],['profile','Profile','profile'],['chat','Chat','chat'],['dms','DMs','dm'],['groups','Groups','groups'],['leaderboard','Leaderboard','leaderboard'],['music','Music','music'],['bookmarks','Bookmarks','bookmarks'],['history','History','history'],['settings','Settings','settings']
  ];
  let root,rail,panel,panelTitle,panelBody,ready=false;const buttons=new Map();
  const node=(tag,cls='',text='')=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;};
  const icon=name=>{const n=node('span','blobby-sidebar-icon');n.innerHTML=ICONS[name]||ICONS.home;return n;};
  function build(){if(ready||!document.body||document.body.dataset.licenseState!=='unlocked')return;ready=true;
    root=node('div','blobby-sidebar-root');root.id='blobbySidebarRoot';root.dataset.open='false';
    rail=node('nav','blobby-sidebar-rail');rail.setAttribute('aria-label','Blobby navigation');
    const brand=node('button','blobby-sidebar-brand','b');brand.type='button';brand.title='Blobby';brand.onclick=()=>window.BlobbyAppUI?.goHome?.();rail.append(brand);
    ITEMS.forEach(([id,label,ic],i)=>{if(i===1||i===6||i===7||i===9)rail.append(node('span','blobby-sidebar-separator'));const b=node('button','blobby-sidebar-button');b.type='button';b.title=label;b.setAttribute('aria-label',label);b.dataset.sidebarId=id;b.append(icon(ic));b.onclick=()=>activate(id);buttons.set(id,b);rail.append(b);});
    panel=node('aside','blobby-sidebar-panel');panel.setAttribute('aria-hidden','true');const head=node('header','blobby-sidebar-panel-head');panelTitle=node('h2','','');const close=node('button','blobby-sidebar-close');close.type='button';close.setAttribute('aria-label','Close');close.append(icon('close'));close.onclick=()=>window.BlobbyPanels?.close();head.append(panelTitle,close);panelBody=node('div','blobby-sidebar-panel-body');panel.append(head,panelBody);root.append(rail,panel);document.body.append(root);
    document.getElementById('sidebarBrowserButton')?.addEventListener('click',()=>window.BlobbyPanels?.toggle('bookmarks'));
    window.addEventListener('blobby:panel-change',onPanelChange);window.addEventListener('blobby:ui-mode',syncActive);document.addEventListener('keydown',e=>{if(e.key==='Escape'&&window.BlobbyPanels?.active?.())window.BlobbyPanels.close();});syncActive();
  }
  function closeFeatures(){for(const name of ['BlobbyChat','BlobbyDM','BlobbyGroup','BlobbyLeaderboard','BlobbyMusic','BlobbyProfile'])window[name]?.close?.();}
  function activate(id){if(id==='home'){window.BlobbyPanels?.close();closeFeatures();window.BlobbyAppUI?.goHome?.();return;}if(id==='settings'){window.BlobbyPanels?.close();window.BlobbyAppUI?.openSettings?.();return;}if(id==='bookmarks'||id==='history'){window.BlobbyPanels?.toggle(id);return;}const feature={profile:'profile',chat:'chat',dms:'dm',groups:'group',leaderboard:'leaderboard',music:'music'}[id];if(feature){window.BlobbyPanels?.close();closeFeatures();setTimeout(()=>window.BlobbyFeatures?.open?.(feature).catch(console.warn),20);}}
  function renderList(title,items,empty){panelTitle.textContent=title;panelBody.replaceChildren();const list=node('div','blobby-sidebar-list');if(!items.length){list.append(node('p','blobby-sidebar-empty',empty));panelBody.append(list);return;}for(const item of items){const b=node('button','blobby-sidebar-list-item');b.type='button';const copy=node('span','blobby-sidebar-list-copy');copy.append(node('strong','',item.label||item.title||item.url),node('small','',item.url));b.append(copy);b.onclick=()=>window.BlobbyBrowser?.navigate?.(item.url);list.append(b);}panelBody.append(list);if(title==='Bookmarks'){const add=node('button','blobby-sidebar-primary','+ Add bookmark');add.type='button';add.onclick=()=>window.BlobbyBrowser?.addBookmark?.();panelBody.append(add);}}
  function renderPanel(id){if(id==='bookmarks')renderList('Bookmarks',window.BlobbyBrowser?.bookmarks?.()||[],'No bookmarks yet.');else if(id==='history')renderList('Recent',window.BlobbyBrowser?.recent?.()||[],'No recent pages.');}
  function onPanelChange(e){if(!root)return;const d=e.detail||{},isSidebar=d.id==='bookmarks'||d.id==='history';if(d.open&&isSidebar){root.dataset.open='true';root.dataset.panel=d.id;panel.setAttribute('aria-hidden','false');renderPanel(d.id);}else if(!d.open||!isSidebar){root.dataset.open='false';panel.setAttribute('aria-hidden','true');delete root.dataset.panel;}syncActive();}
  function syncActive(){const active=window.BlobbyPanels?.active?.()||'',base=window.BlobbyAppUI?.baseMode?.()||'home';buttons.forEach((b,id)=>{const yes=(id==='home'&&base==='home'&&!active)||id===active;b.dataset.active=String(yes);b.setAttribute('aria-pressed',String(yes));});}
  window.addEventListener('blobby:app-ready',build,{once:true});window.addEventListener('blobby:license-unlocked',build);build();
  window.BlobbySidebar=Object.freeze({open:id=>window.BlobbyPanels?.open(id||'bookmarks'),close:()=>window.BlobbyPanels?.close(),state:()=>({ready,open:!!window.BlobbyPanels?.active?.()})});
})();
