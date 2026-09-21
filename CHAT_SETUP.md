# blobby.vip Community Chat — Setup

The frontend is already integrated into this package. The chat stays dormant until a licensed user opens it, so it does not add Realtime/storage work to normal browsing.

## 1) Run the chat migration

In **Supabase → SQL Editor → New query**, paste and run:

`supabase/migrations/202609210001_blobby_chat.sql`

This creates:
- chat profiles with one stable profile per blobby.vip license
- `#general`
- messages, replies, reactions, reports, blocks, moderation log
- rate limiting / timeout / ban checks
- Row Level Security
- private Storage buckets for images/files/avatars
- Realtime publication for messages/reactions/profile updates

## 2) Enable anonymous Auth

In **Supabase → Authentication → Providers**, enable **Anonymous Sign-Ins**.

Chat uses a Supabase anonymous auth session as a short-lived technical session, then `chat-public` securely binds that session to the user's already-valid blobby.vip license. The license itself remains the stable identity.

## 3) Deploy `chat-public`

Create/deploy the Edge Function:

`supabase/functions/chat-public/index.ts`

Put its accompanying `common.ts` in the same function folder.

This function reuses server secrets you already have for the license system:
- `LICENSE_TOKEN_SECRET`
- `INSTALLATION_PEPPER`
- `ALLOWED_ORIGINS`

It also uses Supabase's built-in server variables:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Do not put any of those private secrets in GitHub or `config.js`.

Keep JWT verification enabled for this function: the frontend calls it only after obtaining an authenticated Supabase chat session.

## 4) Optional GIF search

Direct HTTPS GIF links work without extra setup.

For built-in GIF search, add a Supabase Edge Function secret named:

`TENOR_API_KEY`

Then deploy:

`supabase/functions/chat-gif/index.ts`

The function uses Tenor's content filter and keeps the API key server-side.

## 5) Make your chat identity the owner

First, deploy the frontend and open Chat once using **your own blobby.vip license**. This creates your stable `chat_profiles` record.

Then run this in SQL Editor, replacing the assigned name with the exact **Assigned Name on your own license** in the key admin panel:

```sql
update public.chat_profiles p
set role='owner', updated_at=now()
from public.licenses l
where p.license_id=l.id
  and l.assigned_name='YOUR LICENSE ASSIGNED NAME';
```

The role is tied to the trusted license row, not the changeable chat display name.

After that, your messages render like:

**[¥] panga**

The `[¥]` badge is red and cannot be granted by changing a username.

## 6) Upload the frontend files to GitHub Pages

Upload/replace the repository files from this package. Important additions/changes are:

- `chat.js` — chat behavior
- `chat.css` — sidebar/animation/UI
- `index.html` — loads chat files
- `config.js` — public chat limits/settings
- `license.js` — exposes a restricted in-browser credential handoff for chat binding and license lock/unlock events
- `app.js` — lets chat temporarily expand the UI WebViewer in App Inventor and restore it afterward

No additional MIT App Inventor blocks are required. Chat uses the existing `UI_HEIGHT`/overlay bridge behavior. When chat opens in the App Inventor build, the UI WebViewer expands so the panel is usable; closing chat restores the normal compact browser chrome height.

## Included chat features

- right-edge hover reveal + smooth slide-in sidebar
- touch/mobile chat button
- `#general` realtime room
- online count + online-user flyout
- realtime typing indicators
- changeable display name + custom status + online/away/DND/invisible
- trusted red `[¥]` owner badge
- replies
- emoji reactions
- message editing/deletion
- small image uploads (default 5 MB)
- approved file uploads (default 10 MB)
- upload progress
- GIFs + optional Tenor search
- unread count + new-message jump button
- image lightbox
- reporting
- owner/admin/moderator delete, timeout and ban actions
- server-enforced rate limiting
- private Storage with signed download URLs
- theme integration
- Performance Mode integration (reduced motion, no GIF autoplay, reduced visual overhead)
- persistent chat preferences

## Security model

- License keys are never displayed in chat.
- `chat-public` verifies the signed activation token and registered installation server-side.
- One stable `chat_profiles` identity is linked to one `licenses.id`.
- Clearing the anonymous auth session does not create a new moderation identity; a valid registered license reclaims its existing profile.
- User roles are server-controlled.
- Users cannot make themselves owner/admin/moderator.
- Users cannot edit/delete other people's messages unless they have a trusted moderation role.
- Storage is private; chat uses signed URLs for approved attachments.
- Dangerous executable/script uploads are not on the allowlist.
- Sensitive Supabase/service/encryption secrets stay out of GitHub.

## Notes

The database is structured so additional rooms, DMs, avatars, a report dashboard, and richer profile cards can be layered on without rewriting the core chat identity or message system.
