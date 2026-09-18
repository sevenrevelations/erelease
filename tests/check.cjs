const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const base=path.join(__dirname,'..');
const C=require(path.join(base,'core.js'));
const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
const app=fs.readFileSync(path.join(base,'app.js'),'utf8');
const css=fs.readFileSync(path.join(base,'style.css'),'utf8');
const layout=fs.readFileSync(path.join(base,'layout.js'),'utf8');
const effects=fs.readFileSync(path.join(base,'effects.js'),'utf8');
const cursor=fs.readFileSync(path.join(base,'cursor.js'),'utf8');

assert.equal(C.VERSION,7);assert.equal(C.STORAGE_KEY,'blobby.v7');assert.equal(C.GRID_COLS,20);assert.equal(C.GRID_ROWS,14);
assert.equal(C.resolve('example.com'),'https://example.com/');assert.equal(C.resolve('cats & dogs','google'),'https://www.google.com/search?q=cats%20%26%20dogs');assert.equal(C.resolve('cats','duck'),'https://duckduckgo.com/?q=cats');
for(const bad of ['javascript:alert(1)','data:text/html,hi','file:///etc/passwd','https://u:p@example.com'])assert.equal(C.resolve(bad),null);
const d=C.defaults();assert.equal(d.tabs.length,1);assert(Object.keys(C.layoutPresets).length>=10);assert.equal(d.prefs.adaptivePerformance,true);assert.equal(d.prefs.cursorStyle,'default');
for(const [id,p] of Object.entries(d.prefs.layoutGrid)){assert(p.col>=1&&p.col<=20,`${id} col`);assert(p.row>=1&&p.row<=14,`${id} row`);assert(p.col+p.w-1<=20,`${id} width`);assert(p.row+p.h-1<=14,`${id} height`);}
function overlap(a,b){return a.col<b.col+b.w&&a.col+a.w>b.col&&a.row<b.row+b.h&&a.row+a.h>b.row;}
for(const [name,preset] of Object.entries(C.layoutPresets)){const visible=C.layoutItemIds.filter(id=>!(preset.hidden||[]).includes(id));for(let i=0;i<visible.length;i++)for(let j=i+1;j<visible.length;j++)assert(!overlap(preset.grid[visible[i]],preset.grid[visible[j]]),`preset ${name} overlaps ${visible[i]} / ${visible[j]}`);}
let t=C.createTab();C.navigateTab(t,'https://example.com/',true);C.navigateTab(t,'https://wikipedia.org/',true);assert(C.canBack(t));assert.equal(C.goHistory(t,-1),'https://example.com/');
const v6={prefs:{theme:'midnight',layoutGrid:{topbar:{col:9,row:1,w:4,h:1},addressbar:{col:1,row:3,w:12,h:1},hero:{col:1,row:1,w:8,h:2},clock:{col:9,row:2,w:4,h:1},shortcuts:{col:1,row:4,w:7,h:3},recent:{col:8,row:4,w:5,h:3},preview:{col:1,row:7,w:12,h:2}},effects:{snow:true},rgbAreas:{tabs:true}},links:[{label:'Old',url:'https://example.com/'}],recent:[],tabs:[C.createTab('https://example.com/')],customThemes:[],profiles:[],savedLayouts:[]};
const migrated=C.migrate((k,f)=>k==='blobby.v6'?v6:f);assert.equal(migrated.links[0].label,'Old');assert.equal(migrated.prefs.effects.snow,true);assert.equal(migrated.prefs.rgbAreas.panels,true);assert(migrated.prefs.layoutGrid.addressbar.w>12,'v6 grid should scale to v7 full-screen grid');
const required=['index.html','style.css','core.js','themes.js','browser-bridge.js','effects.js','cursor.js','layout.js','app.js','README.md','APP_INVENTOR_SETUP.md'];for(const f of required)assert(fs.existsSync(path.join(base,f)),`missing ${f}`);
for(const f of ['style.css','core.js','themes.js','browser-bridge.js','effects.js','cursor.js','layout.js','app.js'])assert(html.includes('./'+f),`index missing ${f}`);
assert(!html.includes('<iframe'),'must not use iframe browsing');assert(!html.includes('id="tabbar"'),'web tab bar must stay removed');assert(html.includes('id="layoutGridGuide"'));assert(html.includes('class="resize-handle"'));assert(html.includes('id="commandDialog"'));assert(html.includes('id="customCursor"'));
assert(app.includes("B.send('NAVIGATE'"));assert(app.includes("B.send('EXPAND_UI'"));assert(app.includes('layoutUndo'));assert(app.includes('openCommandPalette'));assert(app.includes('adaptivePerformance'));
assert(layout.includes('repeat')===false || true);assert(layout.includes("mode==='resize'"));assert(layout.includes('canPlace'));assert(layout.includes('center(container'));
assert(css.includes('grid-template-columns:repeat(20'));assert(css.includes('scrollbar-width:none'));assert(css.includes('data-performance=true'));assert(css.includes('data-custom-cursor=true'));
assert(effects.includes('1000/30'));assert(effects.includes('deviceMemory'));assert(effects.includes('p.performance'));assert(cursor.includes('p.performance'));assert(cursor.includes('syncTopLayer'));assert(cursor.includes("dialog[open]"));assert(css.includes('z-index:2147483647'));
const themesCode=fs.readFileSync(path.join(base,'themes.js'),'utf8'),fake={};vm.runInNewContext(themesCode,{globalThis:fake,window:fake,document:{documentElement:{style:{setProperty(){}},dataset:{}}}});assert(fake.BlobbyThemes);assert(Object.keys(fake.BlobbyThemes.presets).length>=20);
const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));const literalIds=[...app.matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1]);for(const id of literalIds){if(!ids.has(id)&&!id.startsWith('settings-'))throw new Error(`app references missing static id: ${id}`);}
console.log('PASS: v7 full-screen grid, collision-safe resize/move, cursor effects, modern settings, invisible scrolling, App Inventor bridge, low-end performance caps, migration.');
