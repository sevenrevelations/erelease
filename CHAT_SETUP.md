# blobby.vip Community Chat — Keyless setup

Blobby is now keyless. Community identity uses Supabase Anonymous Auth instead of access/license keys.

## 1) Keep your existing chat migrations

The existing chat tables, RLS policies, messages, reactions, DMs, groups, profiles, uploads, and moderation features remain in place.

## 2) Enable Anonymous Auth

In **Supabase → Authentication → Providers**, enable **Anonymous Sign-Ins**.

## 3) Run the keyless identity migration

In **Supabase → SQL Editor**, run:

`202611090001_keyless_chat.sql`

This makes `chat_profiles.license_id` optional and adds the authenticated RPC `chat_keyless_bind()`.

Existing profiles are preserved. If an existing anonymous-auth user already has a profile, Blobby reuses it. New users receive a basic profile automatically and can then edit it normally.

## 4) Owner/admin roles

Existing role values on existing profiles are preserved.

For a new identity, open Chat once, find the new profile in `public.chat_profiles`, then assign the trusted role manually from Supabase if needed:

```sql
update public.chat_profiles
set role='owner'
where id='PROFILE_UUID';
```

Do not expose role editing to the public client.

## Identity tradeoff

Without license keys, the stable identity is the persisted Supabase anonymous-auth user. Clearing site/app data or resetting that auth session can create a new identity. That makes bans and identity continuity less durable than the old license-bound model.

## Frontend behavior

The site itself loads immediately with no access-key gate. Chat connects only when opened, so it still avoids unnecessary Realtime/storage work during normal browsing.
