const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const fail=m=>{console.error('FAIL:',m);process.exitCode=1;};
const ok=m=>console.log('OK:',m);

const index=read('index.html');
const refs=[...index.matchAll(/(?:src|href)="\.\/([^?"#]+)/g)].map(m=>m[1]);
for(const f of refs){if(!fs.existsSync(path.join(root,f)))fail(`missing index asset ${f}`);}
if(!process.exitCode)ok('all local index assets exist');

for(const f of ['extensions.js','extensions.css']){
  if(fs.existsSync(path.join(root,f)))fail(`${f} should be removed`);
}
if(!process.exitCode)ok('Extensions/Shield files removed');

const all=fs.readdirSync(root).filter(f=>/\.(js|css|html)$/.test(f)).map(read).join('\n');
if(/EXTENSION_RUNTIME|EXTENSION_PING|EXTENSIONS_SYNC|ADBLOCK\||Blobby Shield/i.test(all))fail('extension/adblock runtime reference remains');
else ok('no extension/adblock runtime references');

if(!index.includes('features.js?v=stage14-20261018'))fail('feature loader is not loaded');
for(const f of ['profile.js','dm.js','group.js','leaderboard.js','music.js']){
  if(index.includes(`<script src="./${f}`))fail(`${f} should be lazy-loaded, not eager`);
}
if(!process.exitCode)ok('heavy community features are lazy-loaded');

const chatCss=read('chat.css');
if(/@media[^\{]*pointer\s*:\s*coarse/i.test(chatCss))fail('chat still uses pointer:coarse as a mobile media query');
else ok('chat breakpoints are viewport based');

const chat=read('chat.js'),dm=read('dm.js'),group=read('group.js'),profile=read('profile.js'),sql=read('202610180001_profile_ux_performance.sql');
if(!chat.includes('MAX_RENDERED_MESSAGES = 140'))fail('chat render cap missing');
if(!dm.includes('MAX_RENDERED_MESSAGES=120'))fail('DM render cap missing');
if(!group.includes('MAX_RENDERED_MESSAGES=120'))fail('Group render cap missing');
else ok('message windows are capped');
if(!profile.includes("chat_update_profile_v3"))fail('profile v3 save RPC missing');
if(!profile.includes('p_dm_privacy'))fail('profile DM privacy save missing');
if(!sql.includes('chat_start_dm_v2'))fail('server DM privacy wrapper missing');
else ok('profile v3 and DM privacy backend hooks present');
if(!read('performance.js').includes('deviceMemory')||!read('performance.css').includes('data-low-end'))fail('low-end performance guardrails missing');
else ok('low-end performance guardrails present');
if(!read('chat-shell-fix.css').includes('pointer:coarse'))fail('Stage 12.4 explanatory layout guard missing');
else ok('Stage 12.4 touchscreen layout fix retained');

if(!process.exitCode)console.log('\nStage 14 static regression checks passed.');
