import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const C = window.BLOBBY_CONFIG || {}
const $ = id => document.getElementById(id)
const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(String(C.SUPABASE_URL || '')) && String(C.SUPABASE_PUBLISHABLE_KEY || '').length > 20 && !String(C.SUPABASE_PUBLISHABLE_KEY).includes('YOUR_')
let supabase = null
let session = null
let announcements = []
let canManage = false

if (configured) {
  supabase = createClient(C.SUPABASE_URL, C.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:true }
  })
}

const el=(tag,cls='',text='')=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n}
const fmt=v=>v?new Date(v).toLocaleString():'—'
const toLocalInput=value=>{if(!value)return'';const d=new Date(value);if(Number.isNaN(d.getTime()))return'';const pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`}
const isoOrNull=value=>value?new Date(value).toISOString():null

function setLoginError(text){$('loginError').textContent=text||''}
function setStatus(text){$('globalAnnouncementStatus').textContent=text||''}
function stateOf(a){const now=Date.now(),starts=Date.parse(a.starts_at||0),ends=a.ends_at?Date.parse(a.ends_at):Infinity;if(!a.active)return'draft';if(starts>now)return'scheduled';if(ends<=now)return'expired';return'active'}

async function loadAnnouncements(){
  if(!supabase||!session)return
  setStatus('Loading announcements…')
  try{
    const {data:adminCheck,error:adminError}=await supabase.rpc('is_global_announcement_admin')
    if(adminError)throw adminError
    canManage=adminCheck===true
    $('newGlobalAnnouncement').disabled=!canManage
    if(!canManage){announcements=[];$('globalAnnouncementList').replaceChildren(el('div','ga-admin-card','This account is not allowed to manage global announcements. Add its email to global_announcement_admins in Supabase.'));setStatus('Announcement admin setup required.');return}
    const {data,error}=await supabase.from('global_announcements').select('*').order('created_at',{ascending:false}).limit(100)
    if(error)throw error
    announcements=data||[]
    renderAnnouncements()
    setStatus(`${announcements.length} announcement${announcements.length===1?'':'s'}.`)
  }catch(e){setStatus(e?.message||'Could not load announcements.')}
}

function renderAnnouncements(){
  const list=$('globalAnnouncementList');list.replaceChildren()
  if(!announcements.length){list.append(el('div','ga-admin-card','No global announcements yet.'));return}
  for(const a of announcements){
    const card=el('article','ga-admin-card'),top=el('div','ga-admin-card-head'),titleWrap=el('div')
    titleWrap.append(el('strong','ga-admin-title',a.title||'Untitled'),el('span','ga-admin-meta',`${a.announcement_type||'general'}${a.version_label?` • v${a.version_label}`:''}`))
    top.append(titleWrap,el('span',`pill ga-${stateOf(a)}`,stateOf(a)))
    const msg=el('p','ga-admin-message',a.message||''),details=el('div','ga-admin-details')
    details.append(el('span','',`Display: ${a.display_mode||'popup'}`),el('span','',`Starts: ${fmt(a.starts_at)}`),el('span','',`Ends: ${a.ends_at?fmt(a.ends_at):'No expiration'}`),el('span','',`Revision: ${a.revision||1}`))
    if(a.link_url)details.append(el('span','',`Copy button: ${a.link_label||'Copy link'}`))
    const actions=el('div','ga-actions')
    const edit=el('button','','Edit');edit.type='button';edit.onclick=()=>openAnnouncement(a)
    const toggle=el('button','',a.active?'Deactivate':'Activate');toggle.type='button';toggle.onclick=()=>toggleAnnouncement(a)
    const del=el('button','danger','Delete');del.type='button';del.onclick=()=>deleteAnnouncement(a)
    actions.append(edit,toggle,del);card.append(top,msg,details,actions);list.append(card)
  }
}

function openAnnouncement(a=null){
  if(!canManage)return
  const fresh=!a
  $('gaDialogTitle').textContent=fresh?'New announcement':'Edit announcement'
  $('gaId').value=a?.id||'';$('gaTitle').value=a?.title||'';$('gaMessage').value=a?.message||'';$('gaType').value=a?.announcement_type||'update';$('gaDisplay').value=a?.display_mode||'popup';$('gaVersion').value=a?.version_label||'';$('gaLinkLabel').value=a?.link_label||(a?.announcement_type==='update'?'Copy update link':'Copy link');$('gaLinkUrl').value=a?.link_url||'';$('gaStarts').value=toLocalInput(a?.starts_at||new Date());$('gaEnds').value=toLocalInput(a?.ends_at);$('gaActive').checked=a?!!a.active:true;$('gaError').textContent='';$('gaSave').textContent=fresh?'Publish':'Save changes';$('globalAnnouncementDialog').showModal();setTimeout(()=>$('gaTitle').focus(),30)
}

async function saveAnnouncement(e){
  e.preventDefault();if(!canManage)return;$('gaError').textContent=''
  const title=$('gaTitle').value.trim(),message=$('gaMessage').value.trim(),link=$('gaLinkUrl').value.trim()
  if(!title||!message){$('gaError').textContent='Title and message are required.';return}
  if(link&&!/^https:\/\//i.test(link)){$('gaError').textContent='Use an https:// link.';return}
  let startsAt,endsAt
  try{startsAt=isoOrNull($('gaStarts').value)||new Date().toISOString();endsAt=isoOrNull($('gaEnds').value);if(endsAt&&new Date(endsAt)<=new Date(startsAt))throw Error('End time must be after start time.')}catch(err){$('gaError').textContent=err.message||'Check the dates.';return}
  const row={title,message,announcement_type:$('gaType').value,display_mode:$('gaDisplay').value,version_label:$('gaVersion').value.trim()||null,link_url:link||null,link_label:$('gaLinkLabel').value.trim()||($('gaType').value==='update'?'Copy update link':'Copy link'),starts_at:startsAt,ends_at:endsAt,active:$('gaActive').checked}
  $('gaSave').disabled=true
  try{const id=$('gaId').value;if(id){const{error}=await supabase.from('global_announcements').update(row).eq('id',id);if(error)throw error}else{row.created_by=session?.user?.id||null;const{error}=await supabase.from('global_announcements').insert(row);if(error)throw error}$('globalAnnouncementDialog').close();await loadAnnouncements()}catch(err){$('gaError').textContent=err?.message||'Could not save announcement.'}finally{$('gaSave').disabled=false}
}

async function toggleAnnouncement(a){if(!canManage)return;try{const{error}=await supabase.from('global_announcements').update({active:!a.active}).eq('id',a.id);if(error)throw error;await loadAnnouncements()}catch(e){alert(e?.message||'Could not update announcement.')}}
async function deleteAnnouncement(a){if(!canManage||!confirm(`Delete “${a.title}”?`))return;try{const{error}=await supabase.from('global_announcements').delete().eq('id',a.id);if(error)throw error;await loadAnnouncements()}catch(e){alert(e?.message||'Could not delete announcement.')}}

$('loginForm').addEventListener('submit',async e=>{e.preventDefault();if(!supabase)return;setLoginError('');$('loginButton').disabled=true;try{const{data,error}=await supabase.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error)throw error;session=data.session;await showDashboard()}catch(err){setLoginError(err?.message||'Sign-in failed.')}finally{$('loginButton').disabled=false}})
$('logoutButton').onclick=async()=>{await supabase?.auth.signOut();session=null;$('dashboard').hidden=true;$('loginView').hidden=false}
$('refreshButton').onclick=()=>loadAnnouncements()
$('newGlobalAnnouncement').onclick=()=>openAnnouncement()
$('globalAnnouncementForm').addEventListener('submit',saveAnnouncement)

async function showDashboard(){$('loginView').hidden=true;$('dashboard').hidden=false;$('adminEmail').textContent=session?.user?.email||'Admin';await loadAnnouncements()}

;(async()=>{if(!configured){setLoginError('Owner setup is incomplete. Configure ../config.js and Supabase first.');return}const{data}=await supabase.auth.getSession();session=data.session;supabase.auth.onAuthStateChange((_event,newSession)=>{session=newSession});if(session)await showDashboard()})()
