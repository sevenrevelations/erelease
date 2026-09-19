const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const base=path.join(__dirname,'..');
const C=require(path.join(base,'core.js'));
const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
const app=fs.readFileSync(path.join(base,'app.js'),'utf8');
const css=fs.readFileSync(path.join(base,'style.css'),'utf8');
const layout=fs.readFileSync(path.join(base,'layout.js'),'utf8');
const effects=fs.readFileSync(path.join(base,'effects.js'),'utf8');
const cursor=fs.readFileSync(path.join(base,'cursor.js'),'utf8');

assert.equal(C.VERSION,8);assert.equal(C.STORAGE_KEY,'blobby.v8');assert.equal(C.GRID_COLS,20);assert.equal(C.GRID_ROWS,14);
assert.equal(C.resolve('example.com'),'https://example.com/');assert.equal(C.resolve('cats & dogs','google'),'https://www.google.com/search?q=cats%20%26%20dogs');assert.equal(C.resolve('cats','duck'),'https://duckduckgo.com/?q=cats');
for(const bad of ['javascript:alert(1)','data:text/html,hi','file:///etc/passwd','https://u:p@example.com'])assert.equal(C.resolve(bad),null);
const d=C.defaults();assert.equal(d.tabs.length,1);assert(d.bookmarks.length>=1);assert.equal(d.prefs.showBookmarksBar,true);assert.equal(d.prefs.restorePreviousTabs,true);assert(Object.keys(C.layoutPresets).length>=10);assert.equal(d.prefs.adaptivePerformance,true);
const many=[C.createTab('https://example.com/'),C.createTab('https://wikipedia.org/'),C.createTab('https://openai.com/')];assert.equal(C.sanitizeTabs(many).length,3,'virtual tabs should allow multiple saved tabs');
const marks=C.sanitizeBookmarks([{label:'A',url:'https://example.com/',folder:'Work'}]);assert.equal(marks.length,1);assert.equal(marks[0].folder,'Work');
for(const [id,p] of Object.entries(d.prefs.layoutGrid)){assert(p.col>=1&&p.col<=20,`${id} col`);assert(p.row>=1&&p.row<=14,`${id} row`);assert(p.col+p.w-1<=20,`${id} width`);assert(p.row+p.h-1<=14,`${id} height`);}
function overlap(a,b){return a.col<b.col+b.w&&a.col+a.w>b.col&&a.row<b.row+b.h&&a.row+a.h>b.row;}
for(const [name,preset] of Object.entries(C.layoutPresets)){const visible=C.layoutItemIds.filter(id=>!(preset.hidden||[]).includes(id));for(let i=0;i<visible.length;i++)for(let j=i+1;j<visible.length;j++)assert(!overlap(preset.grid[visible[i]],preset.grid[visible[j]]),`preset ${name} overlaps ${visible[i]} / ${visible[j]}`);}
let t=C.createTab();C.navigateTab(t,'https://example.com/',true);C.navigateTab(t,'https://wikipedia.org/',true);assert(C.canBack(t));assert.equal(C.goHistory(t,-1),'https://example.com/');
const v7={prefs:{theme:'midnight'},links:[{label:'Old',url:'https://example.com/'}],recent:[],tabs:[C.createTab('https://example.com/'),C.createTab('https://wikipedia.org/')],activeTab:null,customThemes:[],profiles:[],savedLayouts:[]};
const migrated=C.migrate((k,f)=>k==='blobby.v7'?v7:f);assert.equal(migrated.links[0].label,'Old');assert.equal(migrated.tabs.length,2);assert(migrated.bookmarks.length>=1);
const required=['index.html','style.css','core.js','themes.js','browser-bridge.js','effects.js','cursor.js','layout.js','app.js','README.md','APP_INVENTOR_SETUP.md'];for(const f of required)assert(fs.existsSync(path.join(base,f)),`missing ${f}`);
for(const f of ['style.css','core.js','themes.js','browser-bridge.js','effects.js','cursor.js','layout.js','app.js'])assert(html.includes('./'+f),`index missing ${f}`);
assert(!html.includes('<iframe'),'must not use iframe browsing');assert(html.includes('id="browserTabs"'));assert(html.includes('id="tabList"'));assert(html.includes('id="bookmarksBar"'));assert(html.includes('id="bookmarkPageButton"'));assert(html.includes('id="bookmarkDialog"'));assert(html.includes('id="layoutGridGuide"'));assert(html.includes('id="customCursor"'));
for(const token of ["B.send('NAVIGATE'","B.send('BACK'","B.send('FORWARD'","B.send('REFRESH'","B.send('HOME'","B.send('UI_HEIGHT'","toggleBookmarksBar","newTab(","closeTab(","renderTabs()","renderBookmarks()"]){assert(app.includes(token),`missing app feature ${token}`);}
assert(app.includes("key==='t'"));assert(app.includes("e.shiftKey&&key==='b'"));assert(app.includes("key==='tab'"));assert(app.includes('restorePreviousTabs'));
assert(layout.includes("mode==='resize'"));assert(layout.includes('canPlace'));assert(layout.includes('center(container'));
assert(css.includes('grid-template-columns:repeat(20'));assert(css.includes('scrollbar-width:none'));assert(css.includes('data-performance=true'));assert(css.includes('data-custom-cursor=true'));assert(css.includes('.browser-tabs'));assert(css.includes('.bookmarks-bar'));assert(css.includes('data-compact-tabs'));
assert(effects.includes('1000/30'));assert(effects.includes('deviceMemory'));assert(effects.includes('p.performance'));assert(cursor.includes('p.performance'));assert(cursor.includes('syncTopLayer'));assert(cursor.includes("dialog[open]"));assert(css.includes('z-index:2147483647'));
const themesCode=fs.readFileSync(path.join(base,'themes.js'),'utf8'),fake={};vm.runInNewContext(themesCode,{globalThis:fake,window:fake,document:{documentElement:{style:{setProperty(){}},dataset:{}}}});assert(fake.BlobbyThemes);assert(Object.keys(fake.BlobbyThemes.presets).length>=20);
const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));const literalIds=[...app.matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1]);for(const id of literalIds){if(!ids.has(id)&&!id.startsWith('settings-'))throw new Error(`app references missing static id: ${id}`);}

assert(html.includes('data-ui-mode="home"') || html.includes('data-ui-mode="home"'),'initial HTML must render home mode before JS');
assert(app.includes("baseUIMode='home'"),'app must initialize in home mode');
assert(app.includes("setBaseUIMode('home');makeSettings();apply();save();if(appMode())B.send('HOME')"),'App Inventor startup must force HOME');
assert(!app.includes('browserSessionStarted'),'legacy floating-home-tab state must be removed');
assert(app.includes("function goHome(){setBaseUIMode('home')"),'Home must switch UI state without destroying tab history');
assert(css.includes('data-base-ui-mode="home"') && css.includes('data-base-ui-mode="browser"'),'CSS must separate home and browser modes');

console.log('PASS: v8.1 home-first state, clean browser chrome, virtual tabs, bookmarks, dynamic App Inventor height, migration, and performance protections.');
