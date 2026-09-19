# blobby.vip v8.1 — stability & polish release

A performance-first customizable browser controller designed for a two-WebViewer MIT App Inventor app.

## What v8.1 fixes

- Always starts on the **full blobby.vip homepage**, even when old tabs are restored.
- Sends `HOME` on App Inventor startup so the real browser WebViewer is hidden immediately.
- Tabs, browser navigation, and bookmarks appear **only in Browser Mode**.
- Removes the old floating-tab behavior that could overlap the homepage utility bar (`Connected`, Settings, Edit Layout, etc.).
- Home no longer destroys the current virtual tab or its history; it only changes the visible UI back to blobby.vip.
- Uses a centralized UI state controller for Home, Browser, Settings/Layout/Command/Modal overlays.
- Browser chrome height is still sent through `UI_HEIGHT|N` and collapses/expands automatically.
- Hidden browser UI cannot intercept clicks.
- Browser chrome keeps theme/custom-color integration and Performance Mode protections.

## Intended state flow

```text
Fresh launch
→ full blobby.vip homepage
→ search / open URL
→ compact tabs + navigation + optional bookmarks
→ actual website in WebViewer_Browser
→ Home
→ clean full-screen blobby.vip homepage
```

Restored virtual tabs remain saved in the background but do **not** force Browser Mode at startup.

## Architecture

```text
WebViewer_UI
└── GitHub-hosted blobby.vip
    ├── Home UI
    ├── Virtual tabs
    ├── Navigation chrome
    ├── Bookmarks
    └── Settings/themes/effects

WebViewer_Browser
└── The one real external website WebView
```

Virtual tabs reuse one real browser WebViewer to keep memory use, AIA size, and Chromebook load low.

## Performance

- Vanilla JavaScript/CSS; no heavy runtime framework
- One real browser WebView regardless of virtual tab count
- Debounced localStorage writes
- Keyed tab DOM updates
- Event delegation for tab/bookmark actions
- Homepage ambient/background rendering disabled while browsing in App Inventor
- Custom cursor disabled in compact browser mode
- Existing adaptive low-power canvas caps retained
- Performance Mode removes blur, large shadows, RGB animation, and nonessential transitions

`index.html` remains at the repository root for direct GitHub Pages deployment.

See `APP_INVENTOR_SETUP.md` for the App Inventor bridge blocks.
