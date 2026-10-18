'use strict';
(() => {
  const DB_NAME='blobby-extensions-v1';
  const DB_VERSION=1;
  const STORE='extensions';
  const MAX_PACKAGE_BYTES=25*1024*1024;
  const SETTINGS_KEY='blobby.extensions.settings.v1';
  const textDecoder=new TextDecoder('utf-8');
  let dbPromise=null, root=null, panel=null, list=null, stats=null, runtimeBadge=null, shieldCopy=null, fileInput=null, toastNode=null, ready=false, openState=false, runtimeReady=false, toastTimer=0;
  let records=[];
  let runtimePingAttempts=0;

  const $=(s,p=document)=>p.querySelector(s);
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const settings=loadSettings();

  function loadSettings(){
    try{return Object.assign({adblock:false},JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}'));}catch{return {adblock:false};}
  }
  function saveSettings(){try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}catch{}}

  function openDB(){
    if(dbPromise)return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{
      if(!('indexedDB' in window)){reject(new Error('IndexedDB is unavailable in this browser.'));return;}
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'});};
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||new Error('Could not open extension storage.'));
    });
    return dbPromise;
  }
  async function dbAll(){const db=await openDB();return new Promise((resolve,reject)=>{const req=db.transaction(STORE,'readonly').objectStore(STORE).getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);});}
  async function dbPut(record){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(record);tx.oncomplete=()=>resolve(record);tx.onerror=()=>reject(tx.error);});}
  async function dbDelete(id){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}

  function build(){
    if(ready||!document.body)return;ready=true;
    root=el('div','blobby-extensions-root');root.id='blobbyExtensionsRoot';root.dataset.open='false';
    const backdrop=el('button','blobby-extensions-backdrop');backdrop.type='button';backdrop.setAttribute('aria-label','Close extensions');backdrop.addEventListener('click',close);
    panel=el('section','blobby-extensions-panel');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','blobbyExtensionsTitle');

    const head=el('header','blobby-extensions-head');
    const title=el('div','blobby-extensions-title');title.append(el('span','', 'Browser tools'),el('h2','', 'Extensions'));title.querySelector('h2').id='blobbyExtensionsTitle';
    const actions=el('div','blobby-extensions-actions');
    const importZip=el('button','blobby-extensions-button','Import ZIP');importZip.type='button';importZip.addEventListener('click',()=>choose('.zip'));
    const importAny=el('button','blobby-extensions-button primary','Import extension');importAny.type='button';importAny.addEventListener('click',()=>choose('.zip,.crx'));
    const closeBtn=el('button','blobby-extensions-close','×');closeBtn.type='button';closeBtn.setAttribute('aria-label','Close extensions');closeBtn.addEventListener('click',close);
    actions.append(importZip,importAny,closeBtn);head.append(title,actions);

    const summary=el('div','blobby-extensions-summary');
    stats=el('div','blobby-extensions-stats');
    runtimeBadge=el('div','blobby-extensions-runtime');runtimeBadge.dataset.ready='false';runtimeBadge.append(el('i'),el('span','', 'Imported packages are managed locally'));
    summary.append(stats,runtimeBadge);

    const content=el('main','blobby-extensions-content hide-scrollbar');
    const hero=el('section','blobby-extension-hero');
    hero.append(el('div','blobby-extension-hero-icon','◆'));
    const heroCopy=el('div','blobby-extension-hero-copy');shieldCopy=el('span','', 'Built-in ad blocking switch. Connect the App Inventor runtime to filter pages in WebViewer_Browser.');heroCopy.append(el('strong','', 'Blobby Shield'),shieldCopy);
    const shieldSwitch=switchControl(settings.adblock,async checked=>{
      settings.adblock=checked;saveSettings();syncNative(true);renderStats();window.dispatchEvent(new CustomEvent('blobby:adblock-change',{detail:{enabled:checked}}));toast(`Blobby Shield ${checked?'enabled':'disabled'}.`);
    },'Toggle Blobby Shield');
    hero.append(heroCopy,shieldSwitch);content.append(hero);

    const sectionHead=el('div','blobby-extensions-section-head');sectionHead.append(el('h3','', 'Installed extensions'),el('span','', 'ZIP and CRX packages'));content.append(sectionHead);
    list=el('div','blobby-extensions-list');content.append(list);

    toastNode=el('div','blobby-extensions-toast');toastNode.setAttribute('role','status');root.append(backdrop,panel,toastNode);panel.append(head,summary,content);document.body.append(root);

    fileInput=el('input');fileInput.type='file';fileInput.accept='.zip,.crx,application/zip,application/x-chrome-extension';fileInput.hidden=true;fileInput.addEventListener('change',async()=>{const files=[...fileInput.files||[]];fileInput.value='';for(const file of files)await installFile(file);});document.body.append(fileInput);

    for(const target of [panel,content]){
      target.addEventListener('dragover',e=>{if([...e.dataTransfer?.items||[]].some(x=>x.kind==='file')){e.preventDefault();panel.classList.add('blobby-extension-drop');}});
      target.addEventListener('dragleave',()=>panel.classList.remove('blobby-extension-drop'));
      target.addEventListener('drop',async e=>{e.preventDefault();panel.classList.remove('blobby-extension-drop');for(const file of [...e.dataTransfer?.files||[]])await installFile(file);});
    }

    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&openState){e.preventDefault();close();}});
    window.addEventListener('blobby:appmessage',e=>{
      const {command,payload}=e.detail||{};
      if(command==='EXTENSION_RUNTIME'){
        runtimeReady=String(payload||'').toUpperCase()==='READY';
        renderRuntime();
        if(runtimeReady)syncNative(false);
      }
    });
    setTimeout(pingRuntime,180);
    refresh();
  }

  function choose(accept){fileInput.accept=accept;fileInput.click();}

  async function refresh(){
    try{records=(await dbAll()).sort((a,b)=>(b.installedAt||0)-(a.installedAt||0));}
    catch(err){records=[];toast(err.message||'Extension storage is unavailable.','error');}
    render();
  }

  function render(){renderStats();renderRuntime();list.replaceChildren();if(!records.length){const empty=el('div','blobby-extensions-empty');const c=el('div');c.append(el('strong','', 'No imported extensions yet'),el('span','', 'Drop a .zip or .crx package here, or use Import extension. Blobby reads the manifest and stores the package locally.'));empty.append(c);list.append(empty);return;}for(const record of records)list.append(renderCard(record));}

  function renderStats(){
    if(!stats)return;stats.replaceChildren();
    const enabled=records.filter(x=>x.enabled).length;
    const items=[[records.length,'installed'],[enabled,'enabled'],[settings.adblock?'On':'Off','Shield']];
    for(const [value,label] of items){const s=el('div','blobby-extensions-stat');s.append(el('strong','',String(value)),document.createTextNode(label));stats.append(s);}
  }
  function renderRuntime(){
    if(!runtimeBadge)return;runtimeBadge.dataset.ready=String(runtimeReady);
    $('span',runtimeBadge).textContent=runtimeReady?'Native extension runtime connected':'Packages ready · runtime bridge not connected';
    if(shieldCopy)shieldCopy.textContent=runtimeReady?'Active page-level ad/tracker filtering for WebViewer_Browser.':'Built-in ad blocking switch. Connect the App Inventor runtime to filter pages in WebViewer_Browser.';
  }

  function renderCard(record){
    const card=el('article','blobby-extension-card');card.dataset.extensionId=record.id;
    const main=el('div','blobby-extension-main');
    const icon=el('div','blobby-extension-icon');
    if(record.iconData){const img=new Image();img.alt='';img.src=record.iconData;icon.append(img);}else icon.textContent=initials(record.name);
    const copy=el('div','blobby-extension-copy');const line=el('div','blobby-extension-name-line');line.append(el('strong','blobby-extension-name',record.name||'Unnamed extension'),el('span','blobby-extension-version',`v${record.version||'0'}`));copy.append(line,el('div','blobby-extension-desc',record.description||'No description provided.'));
    const meta=el('div','blobby-extension-meta');meta.append(pill(`Manifest V${record.manifestVersion||'?'}`),pill(record.sourceType?.toUpperCase()||'ZIP'),pill(formatBytes(record.packageSize||0)));if(record.compatibility==='native')meta.append(pill('Native bridge required','warn'));else meta.append(pill('Package parsed','good'));copy.append(meta);
    const actions=el('div','blobby-extension-card-actions');
    const details=el('button','blobby-extension-details','Details');details.type='button';
    const remove=el('button','blobby-extension-remove','Remove');remove.type='button';
    const sw=switchControl(!!record.enabled,checked=>setEnabled(record.id,checked),`Enable ${record.name}`);
    actions.append(details,remove,sw);main.append(icon,copy,actions);card.append(main);
    const detail=el('div','blobby-extension-detail-panel');detail.hidden=true;detail.append(renderDetails(record));card.append(detail);
    details.addEventListener('click',()=>{detail.hidden=!detail.hidden;details.textContent=detail.hidden?'Details':'Hide';});
    remove.addEventListener('click',async()=>{if(!confirm(`Remove ${record.name}?`))return;await dbDelete(record.id);records=records.filter(x=>x.id!==record.id);render();syncNative();toast(`${record.name} removed.`);});
    return card;
  }

  function renderDetails(record){
    const g=el('div','blobby-extension-detail-grid');
    const rows=[
      ['Extension ID',record.id],
      ['Package hash',record.packageHash||''],
      ['Source',record.fileName||record.sourceType||''],
      ['Permissions',(record.permissions||[]).join(', ')||'None declared'],
      ['Host access',(record.hostPermissions||[]).join(', ')||'None declared'],
      ['Runtime',record.compatibility==='native'?'Requires browser/native content-script bridge':'Stored package']
    ];
    for(const [k,v] of rows){g.append(el('strong','',k));const value=el('code','',String(v));g.append(value);}return g;
  }

  function pill(text,kind=''){return el('span',`blobby-extension-pill${kind?' '+kind:''}`,text);}
  function switchControl(checked,onChange,label){const wrap=el('label','blobby-extension-switch');wrap.title=label;const input=el('input');input.type='checkbox';input.checked=checked;input.setAttribute('aria-label',label);input.addEventListener('change',()=>onChange(input.checked));wrap.append(input,el('span'));return wrap;}

  async function setEnabled(id,enabled){
    const record=records.find(x=>x.id===id);if(!record)return;record.enabled=!!enabled;record.updatedAt=Date.now();await dbPut(record);renderStats();syncNative();window.dispatchEvent(new CustomEvent('blobby:extension-change',{detail:{id,enabled:record.enabled}}));toast(`${record.name} ${record.enabled?'enabled':'disabled'}.`);
  }

  async function installFile(file){
    if(!file)return;
    const lower=String(file.name||'').toLowerCase();if(!lower.endsWith('.zip')&&!lower.endsWith('.crx')){toast('Choose a .zip or .crx extension package.','error');return;}
    if(file.size>MAX_PACKAGE_BYTES){toast('That extension package is larger than 25 MB.','error');return;}
    try{
      toast(`Reading ${file.name}…`);
      const original=await file.arrayBuffer();
      const sourceType=lower.endsWith('.crx')?'crx':'zip';
      const zipBuffer=sourceType==='crx'?extractCRXZip(original):original;
      const archive=new ZipArchive(zipBuffer);
      const manifestEntry=archive.findManifest();if(!manifestEntry)throw new Error('manifest.json was not found at the extension root.');
      const manifestText=await archive.readText(manifestEntry);let manifest;try{manifest=JSON.parse(manifestText);}catch{throw new Error('manifest.json is not valid JSON.');}
      validateManifest(manifest);
      const iconData=await extractIconData(archive,manifest);
      const packageHash=await sha256Hex(original);
      const identitySource=manifest.key?`key:${manifest.key}`:`name:${String(manifest.name||'').trim().toLowerCase()}|homepage:${manifest.homepage_url||''}`;
      const id='ext_'+(await sha256Hex(new TextEncoder().encode(identitySource))).slice(0,24);
      const old=records.find(x=>x.id===id);
      const permissions=uniq([...(manifest.permissions||[]).filter(x=>typeof x==='string'),...(manifest.optional_permissions||[]).filter(x=>typeof x==='string')]);
      const hostPermissions=uniq([...(manifest.host_permissions||[]).filter(x=>typeof x==='string'),...(manifest.optional_host_permissions||[]).filter(x=>typeof x==='string'),...permissions.filter(looksLikeHost)]);
      const record={
        id,name:String(manifest.name||'Unnamed extension').slice(0,120),version:String(manifest.version||'0').slice(0,40),description:String(manifest.description||'').slice(0,400),manifestVersion:Number(manifest.manifest_version||0),
        permissions,hostPermissions,sourceType,fileName:file.name,packageSize:file.size,packageHash,iconData,enabled:old?!!old.enabled:true,installedAt:old?.installedAt||Date.now(),updatedAt:Date.now(),
        compatibility:'native',manifest:compactManifest(manifest),packageBlob:new Blob([original],{type:file.type||'application/octet-stream'})
      };
      await dbPut(record);const wasUpdate=!!old;await refresh();syncNative();toast(`${record.name} ${wasUpdate?'updated':'installed'}.`);
      window.dispatchEvent(new CustomEvent('blobby:extension-installed',{detail:{id:record.id,name:record.name,version:record.version,updated:wasUpdate}}));
    }catch(err){console.warn('Extension import failed',err);toast(err?.message||'Could not import that extension.','error');}
  }

  function compactManifest(m){
    return {manifest_version:m.manifest_version,name:m.name,version:m.version,description:m.description||'',permissions:Array.isArray(m.permissions)?m.permissions:[],host_permissions:Array.isArray(m.host_permissions)?m.host_permissions:[],content_scripts:Array.isArray(m.content_scripts)?m.content_scripts.map(x=>({matches:x.matches||[],exclude_matches:x.exclude_matches||[],js:x.js||[],css:x.css||[],run_at:x.run_at||'document_idle',all_frames:!!x.all_frames})):[],background:m.background||null,action:m.action||m.browser_action||null};
  }

  function validateManifest(m){
    if(!m||typeof m!=='object')throw new Error('manifest.json is missing or invalid.');
    if(![2,3].includes(Number(m.manifest_version)))throw new Error('Only Chrome Manifest V2 or V3 packages are recognized.');
    if(typeof m.name!=='string'||!m.name.trim())throw new Error('The extension manifest does not contain a valid name.');
    if(typeof m.version!=='string'||!m.version.trim())throw new Error('The extension manifest does not contain a valid version.');
  }

  async function extractIconData(archive,manifest){
    const icons=manifest.icons&&typeof manifest.icons==='object'?manifest.icons:null;if(!icons)return '';
    const choices=Object.entries(icons).filter(([,v])=>typeof v==='string').sort((a,b)=>Number(b[0])-Number(a[0]));
    for(const [,path] of choices){const entry=archive.get(path);if(!entry)continue;try{const bytes=await archive.read(entry);const ext=path.split('.').pop()?.toLowerCase();const type=ext==='svg'?'image/svg+xml':ext==='jpg'||ext==='jpeg'?'image/jpeg':ext==='gif'?'image/gif':'image/png';return await blobToDataURL(new Blob([bytes],{type}));}catch{}}
    return '';
  }
  function blobToDataURL(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});}

  function extractCRXZip(buffer){
    const v=new DataView(buffer);if(buffer.byteLength<16||String.fromCharCode(...new Uint8Array(buffer,0,4))!=='Cr24')throw new Error('This CRX file has an invalid header.');
    const version=v.getUint32(4,true);let offset=0;
    if(version===2){const pub=v.getUint32(8,true),sig=v.getUint32(12,true);offset=16+pub+sig;}
    else if(version===3){const header=v.getUint32(8,true);offset=12+header;}
    else throw new Error(`CRX version ${version} is not supported.`);
    if(offset>=buffer.byteLength-4)throw new Error('This CRX package is incomplete.');
    const bytes=new Uint8Array(buffer,offset);if(bytes[0]!==0x50||bytes[1]!==0x4b)throw new Error('The CRX payload does not contain a ZIP archive.');
    return buffer.slice(offset);
  }

  class ZipArchive{
    constructor(buffer){this.buffer=buffer;this.view=new DataView(buffer);this.bytes=new Uint8Array(buffer);this.entries=new Map();this.parse();}
    parse(){
      const eocd=this.findEOCD();if(eocd<0)throw new Error('The ZIP archive is invalid or unsupported.');
      const total=this.view.getUint16(eocd+10,true),dirOffset=this.view.getUint32(eocd+16,true);let p=dirOffset;
      for(let i=0;i<total;i++){
        if(p+46>this.buffer.byteLength||this.view.getUint32(p,true)!==0x02014b50)throw new Error('The ZIP directory is corrupted.');
        const flags=this.view.getUint16(p+8,true),method=this.view.getUint16(p+10,true),compressedSize=this.view.getUint32(p+20,true),uncompressedSize=this.view.getUint32(p+24,true),nameLen=this.view.getUint16(p+28,true),extraLen=this.view.getUint16(p+30,true),commentLen=this.view.getUint16(p+32,true),localOffset=this.view.getUint32(p+42,true);
        const name=textDecoder.decode(this.bytes.slice(p+46,p+46+nameLen)).replace(/\\/g,'/');
        this.entries.set(normalizePath(name),{name,flags,method,compressedSize,uncompressedSize,localOffset});p+=46+nameLen+extraLen+commentLen;
      }
    }
    findEOCD(){const min=Math.max(0,this.buffer.byteLength-65557);for(let p=this.buffer.byteLength-22;p>=min;p--)if(this.view.getUint32(p,true)===0x06054b50)return p;return -1;}
    get(path){return this.entries.get(normalizePath(path))||null;}
    findManifest(){return this.get('manifest.json');}
    async readText(entry){return textDecoder.decode(await this.read(entry));}
    async read(entry){
      if(entry.flags&1)throw new Error('Encrypted ZIP entries are not supported.');
      const p=entry.localOffset;if(p+30>this.buffer.byteLength||this.view.getUint32(p,true)!==0x04034b50)throw new Error('The ZIP entry is invalid.');
      const nameLen=this.view.getUint16(p+26,true),extraLen=this.view.getUint16(p+28,true),start=p+30+nameLen+extraLen,end=start+entry.compressedSize;if(end>this.buffer.byteLength)throw new Error('The ZIP entry is truncated.');
      const compressed=this.bytes.slice(start,end);if(entry.method===0)return compressed;
      if(entry.method===8){
        if(typeof DecompressionStream!=='function')throw new Error('This browser cannot decompress this extension package.');
        try{const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));return new Uint8Array(await new Response(stream).arrayBuffer());}
        catch{throw new Error('Could not decompress an extension file.');}
      }
      throw new Error(`ZIP compression method ${entry.method} is not supported.`);
    }
  }

  function normalizePath(path){return String(path||'').replace(/^\.\//,'').replace(/^\//,'').replace(/\\/g,'/');}
  function looksLikeHost(x){return /^(\*|https?|file|ftp):\/\//i.test(x)||x==='<all_urls>';}
  function uniq(a){return [...new Set(a)];}
  function initials(name){const words=String(name||'EX').trim().split(/\s+/).slice(0,2);return words.map(x=>x[0]||'').join('').toUpperCase()||'EX';}
  function formatBytes(n){n=Number(n)||0;if(n<1024)return `${n} B`;if(n<1024*1024)return `${(n/1024).toFixed(1)} KB`;return `${(n/1024/1024).toFixed(1)} MB`;}
  async function sha256Hex(data){const buffer=data instanceof ArrayBuffer?data:data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);const hash=await crypto.subtle.digest('SHA-256',buffer);return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');}

  function syncNative(reloadAdblock=false){
    const payload={version:1,adblock:!!settings.adblock,extensions:records.filter(x=>x.enabled).map(x=>({id:x.id,name:x.name,version:x.version,manifest:x.manifest}))};
    window.dispatchEvent(new CustomEvent('blobby:extensions-config',{detail:payload}));
    if(runtimeReady&&window.BlobbyBridge?.send){
      try{
        window.BlobbyBridge.send(reloadAdblock?'ADBLOCK':'ADBLOCK_STATE',settings.adblock?'1':'0');
        const json=JSON.stringify(payload);if(json.length<12000)window.BlobbyBridge.send('EXTENSIONS_SYNC',encodeURIComponent(json));
      }
      catch(err){console.warn('Extension runtime sync failed',err);}
    }
  }

  function pingRuntime(){
    if(runtimeReady||runtimePingAttempts>=5||!window.BlobbyBridge?.isAppInventor?.()||!window.BlobbyBridge?.send)return;
    runtimePingAttempts+=1;
    try{window.BlobbyBridge.send('EXTENSION_PING');}catch{}
    if(!runtimeReady)setTimeout(pingRuntime,450+runtimePingAttempts*250);
  }

  function toast(message,kind='info'){
    if(!toastNode)return;clearTimeout(toastTimer);toastNode.textContent=message;toastNode.dataset.kind=kind;toastNode.dataset.show='true';toastTimer=setTimeout(()=>{toastNode.dataset.show='false';},2600);
  }

  function open(){build();openState=true;root.dataset.open='true';panel.setAttribute('aria-hidden','false');refresh();setTimeout(()=>$('.blobby-extensions-close',panel)?.focus(),20);window.dispatchEvent(new CustomEvent('blobby:extensions-open',{detail:{open:true}}));}
  function close(){if(!root)return;openState=false;root.dataset.open='false';panel.setAttribute('aria-hidden','true');window.dispatchEvent(new CustomEvent('blobby:extensions-open',{detail:{open:false}}));}
  function state(){return {ready,open:openState,count:records.length,enabled:records.filter(x=>x.enabled).length,adblock:!!settings.adblock,runtimeReady};}
  async function listInstalled(){build();await refresh();return records.map(({packageBlob,iconData,...x})=>x);}
  async function getPackage(id){const db=await openDB();return new Promise((resolve,reject)=>{const req=db.transaction(STORE,'readonly').objectStore(STORE).get(id);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);});}

  window.BlobbyExtensions=Object.freeze({open,close,state,refresh,listInstalled,getPackage,setAdblock(enabled){settings.adblock=!!enabled;saveSettings();render();syncNative(true);}});
  window.addEventListener('blobby:app-ready',build,{once:true});
  window.addEventListener('blobby:license-unlocked',()=>{if(window.BlobbyAppUI)build();});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{if(document.body?.dataset.licenseState==='unlocked'&&window.BlobbyAppUI)build();},{once:true});else if(document.body?.dataset.licenseState==='unlocked'&&window.BlobbyAppUI)build();
})();
