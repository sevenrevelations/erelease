(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BlobbyCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const STORAGE_KEY='blobby.v8';
const VERSION=9;
const engines={
  google:{name:'Google',prefix:'https://www.google.com/search?q='},
  duck:{name:'DuckDuckGo',prefix:'https://duckduckgo.com/?q='},
  bing:{name:'Bing',prefix:'https://www.bing.com/search?q='}
};
const defaultLinks=[
  {label:'Google',url:'https://www.google.com/',icon:'G',folder:''},
  {label:'YouTube',url:'https://www.youtube.com/',icon:'▶',folder:''},
  {label:'Wikipedia',url:'https://www.wikipedia.org/',icon:'W',folder:'Study'},
  {label:'Khan Academy',url:'https://www.khanacademy.org/',icon:'K',folder:'Study'}
];
const defaultBookmarks=[
  {id:'bookmark_google',label:'Google',url:'https://www.google.com/',icon:'G',favicon:'',folder:''},
  {id:'bookmark_youtube',label:'YouTube',url:'https://www.youtube.com/',icon:'▶',favicon:'',folder:''}
];
function clone(v){return JSON.parse(JSON.stringify(v));}
function clamp(v,min,max){v=Number(v);return Number.isFinite(v)?Math.max(min,Math.min(max,v)):min;}
function uid(prefix='id'){return prefix+'_'+Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-4);}
function safeUrl(raw){if(typeof raw!=='string')return null;try{const u=new URL(raw);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)return null;return u.href;}catch{return null;}}
function resolve(text,engine='google',customPrefix=''){text=String(text||'').trim();if(!text)return null;
  if(/^(localhost|[\w-]+(?:\.[\w-]+)+):\d+(?:[/?#]|$)/i.test(text))return safeUrl((text.startsWith('localhost')?'http://':'https://')+text);
  if(/^[a-z][a-z0-9+.-]*:/i.test(text))return safeUrl(text);
  if(!/\s/.test(text)&&(/^[\w-]+(?:\.[\w-]+)+(?:[/:?#]|$)/.test(text)||/^localhost(?:[/:]|$)/.test(text)))return safeUrl((text.startsWith('localhost')?'http://':'https://')+text);
  if(engine==='custom'&&customPrefix){const custom=String(customPrefix).trim();if(/^https?:\/\//i.test(custom))return custom.includes('%s')?custom.replace('%s',encodeURIComponent(text)):custom+encodeURIComponent(text);}
  return (engines[engine]||engines.google).prefix+encodeURIComponent(text);
}
function titleFromUrl(url){try{return new URL(url).hostname.replace(/^www\./,'')||'Home';}catch{return 'Home';}}
function createTab(url=''){return{id:uid('tab'),title:url?titleFromUrl(url):'New Tab',favicon:'',url:url||'',history:url?[url]:[],historyIndex:url?0:-1};}
function hex(v,fallback='#8bd3b2'){const s=String(v||'').trim();if(/^#[0-9a-f]{6}$/i.test(s))return s.toLowerCase();if(/^#[0-9a-f]{3}$/i.test(s))return '#'+s.slice(1).split('').map(x=>x+x).join('').toLowerCase();return fallback;}
function defaults(){return{
  version:VERSION,
  prefs:{
    engine:'google',customSearchPrefix:'',rememberRecent:true,autofocus:true,
    accentColor:'#8bd3b2',density:'compact',
    restorePreviousTabs:true,showBookmarksBar:true,showBookmarkFavicons:true,showBookmarkText:true,compactTabs:true,
    bookmarkOpenBehavior:'current',confirmCloseMultiple:true,
    blockAds:true,adWhitelist:[],
    showShortcuts:true,showRecent:true,
    showBack:true,showForward:true,showRefresh:true,showHome:true,showExternal:true,
    keyboardShortcuts:true,commandPalette:true
  },
  links:clone(defaultLinks),bookmarks:clone(defaultBookmarks),recent:[],tabs:[createTab()],activeTab:null
};}
function sanitizePrefs(raw={}){const d=defaults().prefs;const p={...d};
  p.engine=['google','duck','bing','custom'].includes(raw.engine)?raw.engine:d.engine;
  p.customSearchPrefix=String(raw.customSearchPrefix||'').slice(0,500);
  for(const k of ['rememberRecent','autofocus','restorePreviousTabs','showBookmarksBar','showBookmarkFavicons','showBookmarkText','compactTabs','confirmCloseMultiple','blockAds','showShortcuts','showRecent','showBack','showForward','showRefresh','showHome','showExternal','keyboardShortcuts','commandPalette'])p[k]=raw[k]===undefined?d[k]:!!raw[k];
  p.accentColor=hex(raw.accentColor,d.accentColor);
  p.density=raw.density==='default'?'default':'compact';
  p.bookmarkOpenBehavior=raw.bookmarkOpenBehavior==='new'?'new':'current';
  p.adWhitelist=[...new Set((Array.isArray(raw.adWhitelist)?raw.adWhitelist:[]).map(x=>String(x||'').trim().toLowerCase()).filter(x=>/^[a-z0-9.-]+$/.test(x)).slice(0,200))];
  return p;
}
function sanitizeLinks(items){return (Array.isArray(items)?items:defaultLinks).slice(0,40).map(x=>({label:String(x?.label||'Shortcut').slice(0,32),url:safeUrl(x?.url)||'',icon:String(x?.icon||'').slice(0,4),folder:String(x?.folder||'').slice(0,24)})).filter(x=>x.url);}
function sanitizeBookmarks(items){return (Array.isArray(items)?items:defaultBookmarks).slice(0,500).map(x=>({id:String(x?.id||uid('bookmark')),label:String(x?.label||titleFromUrl(x?.url)).slice(0,48),url:safeUrl(x?.url)||'',icon:String(x?.icon||'').slice(0,4),favicon:safeUrl(x?.favicon)||'',folder:String(x?.folder||'').slice(0,32)})).filter(x=>x.url);}
function sanitizeRecent(items){return (Array.isArray(items)?items:[]).slice(0,60).map(x=>({url:safeUrl(x?.url)||'',label:String(x?.label||x?.title||titleFromUrl(x?.url)).slice(0,80),time:Number(x?.time||x?.at)||Date.now()})).filter(x=>x.url);}
function sanitizeTabs(items){const out=(Array.isArray(items)?items:[]).slice(0,24).map(x=>{const url=safeUrl(x?.url)||'',history=(Array.isArray(x?.history)?x.history:[]).map(safeUrl).filter(Boolean).slice(-40);let index=Number.isInteger(x?.historyIndex)?x.historyIndex:history.length-1;index=Math.max(-1,Math.min(history.length-1,index));return{id:String(x?.id||uid('tab')),title:String(x?.title||titleFromUrl(url)||'New Tab').slice(0,100),favicon:safeUrl(x?.favicon)||'',url,history,historyIndex:index};});return out.length?out:[createTab()];}
function migrate(read){const fresh=defaults();let saved=null;for(const key of [STORAGE_KEY,'blobby.v7','blobby.v6','blobby.v5']){try{const v=read(key,null);if(v&&typeof v==='object'){saved=v;break;}}catch{}}
  if(!saved){fresh.activeTab=fresh.tabs[0].id;return fresh;}
  fresh.prefs=sanitizePrefs(saved.prefs||{});
  fresh.links=sanitizeLinks(saved.links);
  fresh.bookmarks=sanitizeBookmarks(saved.bookmarks);
  fresh.recent=sanitizeRecent(saved.recent);
  fresh.tabs=sanitizeTabs(saved.tabs);
  fresh.activeTab=fresh.tabs.some(t=>t.id===saved.activeTab)?saved.activeTab:fresh.tabs[0].id;
  return fresh;
}
function serialize(state){const tabs=sanitizeTabs(state.tabs),active=tabs.some(t=>t.id===state.activeTab)?state.activeTab:tabs[0].id;return JSON.stringify({version:VERSION,prefs:sanitizePrefs(state.prefs),links:sanitizeLinks(state.links),bookmarks:sanitizeBookmarks(state.bookmarks),recent:sanitizeRecent(state.recent),tabs,activeTab:active});}
function navigateTab(tab,url,push=true){if(!tab||!safeUrl(url))return null;if(push){tab.history=Array.isArray(tab.history)?tab.history.slice(0,(tab.historyIndex??-1)+1):[];tab.history.push(url);if(tab.history.length>40)tab.history.shift();tab.historyIndex=tab.history.length-1;}tab.url=url;tab.title=titleFromUrl(url);return url;}
function canBack(tab){return !!tab&&Number(tab.historyIndex)>0;}
function canForward(tab){return !!tab&&Number(tab.historyIndex)>=0&&Number(tab.historyIndex)<(tab.history?.length||0)-1;}
function goHistory(tab,delta){if(!tab||!Array.isArray(tab.history))return null;const next=(tab.historyIndex??-1)+delta;if(next<0||next>=tab.history.length)return null;tab.historyIndex=next;tab.url=tab.history[next];tab.title=titleFromUrl(tab.url);return tab.url;}
function recordRecent(items,url,label=''){const safe=safeUrl(url);if(!safe)return sanitizeRecent(items);const out=sanitizeRecent(items).filter(x=>x.url!==safe);out.unshift({url:safe,label:String(label||titleFromUrl(safe)).slice(0,80),time:Date.now()});return out.slice(0,30);}
return{STORAGE_KEY,VERSION,engines,clone,clamp,uid,safeUrl,resolve,titleFromUrl,hex,createTab,defaults,sanitizePrefs,sanitizeLinks,sanitizeBookmarks,sanitizeRecent,sanitizeTabs,migrate,serialize,navigateTab,canBack,canForward,goHistory,recordRecent};
});
