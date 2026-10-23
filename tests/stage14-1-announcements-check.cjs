const fs=require('fs');
const chat=fs.readFileSync('chat.js','utf8');
const css=fs.readFileSync('chat.css','utf8');
const sql=fs.readFileSync('202610180002_owner_announcements.sql','utf8');
const index=fs.readFileSync('index.html','utf8');
function ok(cond,msg){if(!cond){console.error('FAIL:',msg);process.exit(1)}console.log('OK:',msg)}
ok(!chat.includes('share-music'),'share-music channel removed');
ok(chat.includes('chat-channel-announcements')&&chat.includes("switchChannel('announcements')"),'announcements channel is interactive');
ok(chat.includes("state.profile?.role==='owner'")&&chat.includes("chat_post_announcement"),'frontend owner posting gate present');
ok(sql.includes("coalesce(me.role,'user') <> 'owner'")&&sql.includes('security definer'),'server-side owner check present');
ok(sql.includes('revoke insert, update, delete')&&sql.includes('grant select'),'clients can read but cannot directly write announcement rows');
ok(sql.includes("alter publication supabase_realtime add table public.chat_announcements"),'announcements enabled for realtime');
ok(chat.includes('blobby-chat-mobile-channel'),'mobile channel switcher present');
ok(css.includes('.blobby-chat-announcement-lock'),'read-only announcement UI styled');
ok(index.includes('chat.js?v=stage14.1-20261018'),'chat cache-bust bumped');
console.log('\nStage 14.1 announcement checks passed.');
