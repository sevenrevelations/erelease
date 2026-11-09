# Blobby keyless setup

The web frontend no longer uses access/license keys.

## Required once for Community Chat

Run `202611090001_keyless_chat.sql` in Supabase SQL Editor after your existing Blobby chat/profile migrations.

This keeps existing profiles but allows new chat profiles without a license row. Chat identity now uses Supabase anonymous Auth. Because anonymous Auth is stored locally, clearing browser/app site data can create a new identity.

## Old license backend

The frontend and admin dashboard no longer call `license-public` or `license-admin`. You can leave the old license database/functions in place temporarily while verifying the keyless build. They are unused by this build and can be retired separately after you confirm you no longer need historical license data.
