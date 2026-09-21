/* blobby.vip v9 public configuration.
   This file is safe to serve publicly. Never put service-role/secret keys here.
   Copy values from your Supabase project after following DEPLOYMENT.md. */
window.BLOBBY_CONFIG = Object.freeze({
  SUPABASE_URL: "https://asyfvgtgzxdnpsowucgf.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_YXnPw2zl8W8eZsz5KbFmLw_baSkoFn2",
  SUPPORT_URL: "",
  VERIFY_INTERVAL_HOURS: 12,
  OFFLINE_GRACE_HOURS: 72,

  // Community chat (public frontend settings only; no secrets here)
  CHAT_ENABLED: true,
  CHAT_GENERAL_ROOM_ID: "00000000-0000-0000-0000-000000000001",
  CHAT_MAX_IMAGE_MB: 5,
  CHAT_MAX_FILE_MB: 10
});
