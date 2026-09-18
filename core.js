(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BlobbyCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const STORAGE_KEY='blobby.v7';
const VERSION=7;
const GRID_COLS=20, GRID_ROWS=14;
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
const layoutItemIds=['topbar','addressbar','hero','clock','shortcuts','recent','preview'];
const defaultLayoutGrid={
 topbar:{col:16,row:1,w:5,h:1},
 hero:{col:2,row:2,w:8,h:2},
 clock:{col:16,row:2,w:4,h:2},
 addressbar:{col:5,row:5,w:12,h:1},
 shortcuts:{col:3,row:7,w:10,h:4},
 recent:{col:14,row:7,w:5,h:4},
 preview:{col:5,row:12,w:12,h:2}
};
const layoutPresets={
 minimal:{name:'Minimal',grid:{topbar:{col:16,row:1,w:5,h:1},hero:{col:6,row:3,w:10,h:2},clock:{col:17,row:3,w:3,h:2},addressbar:{col:5,row:6,w:12,h:1},shortcuts:{col:5,row:8,w:12,h:3},recent:{col:5,row:11,w:12,h:2},preview:{col:5,row:13,w:12,h:2}},hidden:['clock','recent','preview']},
 centered:{name:'Centered',grid:{topbar:{col:16,row:1,w:5,h:1},hero:{col:6,row:2,w:10,h:2},clock:{col:9,row:4,w:4,h:2},addressbar:{col:4,row:6,w:14,h:1},shortcuts:{col:5,row:8,w:12,h:3},recent:{col:6,row:11,w:10,h:2},preview:{col:5,row:13,w:12,h:2}},hidden:['preview']},
 compact:{name:'Compact',grid:{topbar:{col:16,row:1,w:5,h:1},hero:{col:2,row:2,w:7,h:1},clock:{col:17,row:2,w:3,h:1},addressbar:{col:3,row:4,w:16,h:1},shortcuts:{col:3,row:6,w:11,h:3},recent:{col:15,row:6,w:4,h:3},preview:{col:3,row:10,w:16,h:2}},hidden:['clock','preview']},
 floating:{name:'Floating',grid:{topbar:{col:16,row:1,w:5,h:1},hero:{col:2,row:2,w:7,h:2},clock:{col:17,row:3,w:3,h:2},addressbar:{col:5,row:5,w:12,h:1},shortcuts:{col:2,row:8,w:9,h:4},recent:{col:14,row:7,w:5,h:4},preview:{col:6,row:12,w:10,h:2}},hidden:[]},
 gaming:{name:'Gaming',grid:{topbar:{col:16,row:1,w:5,h:1},hero:{col:2,row:2,w:9,h:2},clock:{col:16,row:2,w:4,h:2},addressbar:{col:3,row:5,w:16,h:1},shortcuts:{col:2,row:7,w:17,h:4},recent:{col:14,row:12,w:5,h:2},preview:{col:2,row:12,w:11,h:2}},hidden:['recent']},
 dashboard:{name:'Dashboard',grid:{topbar:{col:16,row:1,w:5,h:1},hero:{col:2,row:2,w:8,h:2},clock:{col:16,row:2,w:4,h:2},addressbar:{col:2,row:5,w:18,h:1},shortcuts:{col:2,row:7,w:11,h:5},recent:{col:14,row:7,w:6,h:5},preview:{col:2,row:13,w:18,h:2}},hidden:[]},
 corner:{name:'Corner UI',grid:{topbar:{col:16,row:1,w:5,h:1},hero:{col:1,row:2,w:7,h:2},clock:{col:17,row:3,w:4,h:2},addressbar:{col:4,row:6,w:14,h:1},shortcuts:{col:1,row:9,w:9,h:4},recent:{col:16,row:9,w:5,h:4},preview:{col:5,row:12,w:12,h:2}},hidden:['preview']},
 wide:{name:'Wide Desktop',grid:{topbar:{col:16,row:1,w:5,h:1},hero:{col:2,row:2,w:8,h:2},clock:{col:17,row:2,w:3,h:2},addressbar:{col:2,row:5,w:18,h:1},shortcuts:{col:2,row:7,w:12,h:4},recent:{col:15,row:7,w:5,h:4},preview:{col:2,row:12,w:18,h:2}},hidden:[]},
 focus:{name:'Focus',grid:{topbar:{col:16,row:1,w:5,h:1},hero:{col:6,row:4,w:10,h:2},clock:{col:17,row:3,w:3,h:2},addressbar:{col:5,row:7,w:12,h:1},shortcuts:{col:5,row:9,w:12,h:3},recent:{col:6,row:12,w:10,h:2},preview:{col:5,row:13,w:12,h:2}},hidden:['clock','shortcuts','recent','preview']},
 mobile:{name:'Mobile',grid:{topbar:{col:12,row:1,w:9,h:1},hero:{col:2,row:2,w:18,h:2},clock:{col:14,row:4,w:6,h:1},addressbar:{col:2,row:5,w:18,h:1},shortcuts:{col:2,row:7,w:18,h:4},recent:{col:2,row:11,w:18,h:3},preview:{col:2,row:14,w:18,h:1}},hidden:['clock','preview']}
};
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
function createTab(url=''){return {id:uid('session'),title:url?titleFromUrl(url):'Home',url:url||'',history:url?[url]:[],historyIndex:url?0:-1};}
function hex(v,fallback='#8da2ff'){const s=String(v||'').trim();if(/^#[0-9a-f]{6}$/i.test(s))return s.toLowerCase();if(/^#[0-9a-f]{3}$/i.test(s))return '#'+s.slice(1).split('').map(x=>x+x).join('').toLowerCase();return fallback;}
function sanitizeGrid(raw){const out={};for(const id of layoutItemIds){const d=defaultLayoutGrid[id],v=raw&&raw[id]||d;const w=Math.round(clamp(v.w||d.w,1,GRID_COLS));const h=Math.round(clamp(v.h||d.h,1,GRID_ROWS));const col=Math.round(clamp(v.col||d.col,1,GRID_COLS-w+1));const row=Math.round(clamp(v.row||d.row,1,GRID_ROWS-h+1));out[id]={col,row,w,h};}return out;}
function defaults(){return {version:VERSION,prefs:{
 theme:'midnight',engine:'google',customSearchPrefix:'',rememberRecent:true,autofocus:true,
 performance:false,adaptivePerformance:true,reducedMotion:false,animations:true,animationSpeed:1,hoverEffects:true,
 glass:true,blur:16,shadow:18,radius:18,panelOpacity:.7,density:'default',focusMode:false,focusKeepLogo:true,
 rgb:false,rgbMode:'cycle',rgbSpeed:9,rgbIntensity:60,rgbSaturation:100,rgbAreas:{logo:true,panels:false,address:true,buttons:false,ambient:true,cursor:false},
 backgroundMode:'gradient',backgroundSolid:'#080a12',backgroundGradient:'linear-gradient(145deg,#080a12 0%,#101724 55%,#171124 100%)',backgroundImage:'',backgroundBrightness:100,backgroundBlur:0,backgroundOpacity:100,backgroundOverlay:16,backgroundSize:'cover',backgroundPosition:'center',
 effectsMaster:true,effectDensity:40,effectSpeed:1,effectOpacity:.5,effectSize:1,effectDepth:'behindPanels',effectBlur:0,effectBrightness:100,
 effects:{snow:false,rain:false,stars:false,particles:false,fireflies:false,orbs:false,aurora:true,fog:false,matrix:false,bubbles:false,shooting:false,waves:false,rgbGlow:false,dust:false,constellation:false,clouds:false,digitalGrid:false,neonHorizon:false,liquid:false,lightRays:false,spaceDust:false},
 rainLightning:false,rainGlass:false,
 cursorStyle:'default',cursorSize:18,cursorColor:'#8da2ff',cursorSecondary:'#d6ddff',cursorGlow:35,cursorTrail:8,cursorTrailFade:70,cursorSmoothing:.2,cursorRGBSpeed:8,
 layoutPreset:'minimal',layoutGrid:clone(layoutPresets.minimal.grid),layoutHidden:clone(layoutPresets.minimal.hidden),layoutLocked:true,mobileAutoLayout:true,
 showSubtitle:true,showClock:true,showShortcuts:true,showRecent:true,showPreview:true,showBack:true,showForward:true,showRefresh:true,showHome:true,showExternal:true,
 clock24:false,clockSeconds:false,showDate:true,commandPalette:true,keyboardShortcuts:true
 },links:clone(defaultLinks),recent:[],tabs:[createTab()],activeTab:null,customThemes:[],profiles:[],savedLayouts:[]};}
const effectKeys=['snow','rain','stars','particles','fireflies','orbs','aurora','fog','matrix','bubbles','shooting','waves','rgbGlow','dust','constellation','clouds','digitalGrid','neonHorizon','liquid','lightRays','spaceDust'];
function sanitizeEffects(raw){const out={};for(const k of effectKeys)out[k]=!!(raw&&raw[k]);return out;}
function sanitizePrefs(raw={}){const d=defaults().prefs,p={...d,...raw};
 p.blur=clamp(p.blur,0,28);p.shadow=clamp(p.shadow,0,50);p.radius=clamp(p.radius,6,30);p.panelOpacity=clamp(p.panelOpacity,.35,1);p.animationSpeed=clamp(p.animationSpeed,.5,2);
 p.rgbSpeed=clamp(p.rgbSpeed,2,30);p.rgbIntensity=clamp(p.rgbIntensity,0,100);p.rgbSaturation=clamp(p.rgbSaturation,20,140);
 p.backgroundBrightness=clamp(p.backgroundBrightness,30,150);p.backgroundBlur=clamp(p.backgroundBlur,0,18);p.backgroundOpacity=clamp(p.backgroundOpacity,20,100);p.backgroundOverlay=clamp(p.backgroundOverlay,0,80);
 p.effectDensity=clamp(p.effectDensity,5,100);p.effectSpeed=clamp(p.effectSpeed,.3,2.5);p.effectOpacity=clamp(p.effectOpacity,.08,1);p.effectSize=clamp(p.effectSize,.5,2.5);p.effectBlur=clamp(p.effectBlur,0,6);p.effectBrightness=clamp(p.effectBrightness,50,160);if(!['deep','behindPanels','vivid'].includes(p.effectDepth))p.effectDepth='behindPanels';
 p.cursorSize=clamp(p.cursorSize,8,42);p.cursorGlow=clamp(p.cursorGlow,0,100);p.cursorTrail=clamp(p.cursorTrail,0,24);p.cursorTrailFade=clamp(p.cursorTrailFade,10,100);p.cursorSmoothing=clamp(p.cursorSmoothing,.05,.5);p.cursorRGBSpeed=clamp(p.cursorRGBSpeed,2,20);
 p.cursorColor=hex(p.cursorColor,d.cursorColor);p.cursorSecondary=hex(p.cursorSecondary,d.cursorSecondary);
 p.effects=sanitizeEffects(raw.effects||d.effects);p.rgbAreas={...d.rgbAreas,...(raw.rgbAreas||{})};if(raw.rgbAreas&&raw.rgbAreas.panels===undefined&&raw.rgbAreas.tabs!==undefined)p.rgbAreas.panels=!!raw.rgbAreas.tabs;
 p.layoutGrid=sanitizeGrid(raw.layoutGrid||d.layoutGrid);p.layoutHidden=Array.isArray(raw.layoutHidden)?raw.layoutHidden.filter(x=>layoutItemIds.includes(x)):[];
 if(!['comfortable','default','compact','ultra'].includes(p.density))p.density='default';if(!['default','dot','ring','dotring','rgb','trail','sparkle','comet','glow','pixel','crosshair','blob'].includes(p.cursorStyle))p.cursorStyle='default';
 return p;}
function sanitizeLinks(items){return (Array.isArray(items)?items:[]).filter(x=>x&&typeof x.label==='string'&&safeUrl(x.url)).slice(0,40).map(x=>({label:x.label.slice(0,32),url:safeUrl(x.url),icon:String(x.icon||x.label.slice(0,1)).slice(0,4),folder:String(x.folder||'').slice(0,24)}));}
function sanitizeRecent(items){return (Array.isArray(items)?items:[]).filter(x=>x&&safeUrl(x.url)).slice(0,30).map(x=>({label:String(x.label||titleFromUrl(x.url)).slice(0,80),url:safeUrl(x.url),time:Number(x.time)||Date.now()}));}
function sanitizeTabs(items){const tabs=(Array.isArray(items)?items:[]).slice(0,1).map(t=>{const history=(Array.isArray(t.history)?t.history:[]).map(safeUrl).filter(Boolean).slice(-50);const idx=Math.min(Math.max(Number(t.historyIndex)||0,-1),history.length-1);const url=safeUrl(t.url)||history[idx]||'';return {id:String(t.id||uid('session')),title:String(t.title||titleFromUrl(url)).slice(0,80),url,history,historyIndex:history.length?idx:-1};});return tabs.length?tabs:[createTab()];}
function scaleV6Grid(raw){if(!raw)return clone(defaultLayoutGrid);const out={};for(const id of layoutItemIds){const v=raw[id];if(!v)continue;out[id]={col:Math.max(1,Math.round(((v.col-1)/11)*19)+1),row:Math.max(1,Math.round(((v.row-1)/11)*13)+1),w:Math.max(1,Math.round((v.w/12)*20)),h:Math.max(1,Math.round((v.h/12)*14))};}return sanitizeGrid(out);}
function normalizeSavedLayouts(items){return (Array.isArray(items)?items:[]).slice(0,20).map(x=>({id:String(x.id||uid('layout')),name:String(x.name||'Saved layout').slice(0,48),grid:sanitizeGrid(x.grid||defaultLayoutGrid),hidden:Array.isArray(x.hidden)?x.hidden.filter(i=>layoutItemIds.includes(i)):[],preset:String(x.preset||'minimal')}));}
function migrate(read){const fresh=defaults();let saved=null,source=VERSION;for(const [k,v] of [[STORAGE_KEY,7],['blobby.v6',6],['blobby.v5',5]]){try{saved=read(k,null);}catch{}if(saved){source=v;break;}}
 if(saved&&typeof saved==='object'){
  const raw={...(saved.prefs||{})};if(source===6&&raw.layoutGrid)raw.layoutGrid=scaleV6Grid(raw.layoutGrid);if(source===5&&!raw.layoutGrid)raw.layoutGrid=clone(defaultLayoutGrid);
  fresh.prefs=sanitizePrefs(raw);fresh.links=sanitizeLinks(saved.links||defaultLinks);fresh.recent=sanitizeRecent(saved.recent);fresh.tabs=sanitizeTabs(saved.tabs);fresh.activeTab=fresh.tabs[0].id;
  fresh.customThemes=Array.isArray(saved.customThemes)?saved.customThemes.slice(0,30):[];fresh.profiles=Array.isArray(saved.profiles)?saved.profiles.slice(0,20):[];fresh.savedLayouts=normalizeSavedLayouts(saved.savedLayouts);
 }
 return fresh;}
function serialize(state){return JSON.stringify({...state,version:VERSION,prefs:sanitizePrefs(state.prefs),links:sanitizeLinks(state.links),recent:sanitizeRecent(state.recent),tabs:sanitizeTabs(state.tabs),savedLayouts:normalizeSavedLayouts(state.savedLayouts)});}
function navigateTab(tab,url,push=true){url=safeUrl(url);if(!url)return tab;if(push){tab.history=tab.history.slice(0,tab.historyIndex+1);tab.history.push(url);if(tab.history.length>50)tab.history.shift();tab.historyIndex=tab.history.length-1;}tab.url=url;tab.title=titleFromUrl(url);return tab;}
function canBack(tab){return tab.historyIndex>0;}function canForward(tab){return tab.historyIndex>=0&&tab.historyIndex<tab.history.length-1;}
function goHistory(tab,delta){const i=tab.historyIndex+delta;if(i<0||i>=tab.history.length)return null;tab.historyIndex=i;tab.url=tab.history[i];tab.title=titleFromUrl(tab.url);return tab.url;}
function recordRecent(items,url,label){url=safeUrl(url);if(!url)return sanitizeRecent(items);const next=(Array.isArray(items)?items:[]).filter(x=>x.url!==url);next.unshift({url,label:String(label||titleFromUrl(url)).slice(0,80),time:Date.now()});return sanitizeRecent(next);}
return {STORAGE_KEY,VERSION,GRID_COLS,GRID_ROWS,engines,layoutItemIds,defaultLayoutGrid,layoutPresets,effectKeys,clone,clamp,uid,safeUrl,resolve,titleFromUrl,hex,createTab,sanitizeGrid,defaults,sanitizeEffects,sanitizePrefs,sanitizeLinks,sanitizeRecent,sanitizeTabs,migrate,serialize,navigateTab,canBack,canForward,goHistory,recordRecent};
});
