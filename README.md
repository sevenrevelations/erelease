# blobby.vip v8

A performance-first customizable browser controller designed for a two-WebViewer MIT App Inventor app.

## v8 highlights

- Full-screen blobby.vip home/new-tab experience
- Compact, theme-aware browser chrome after navigation
- Lightweight **virtual tabs** using one real Android WebViewer
- New tab, close, switch, reorder, session restore, per-tab URL history
- Back, forward, refresh, Home, address/search bar, bookmark star, overflow menu
- Optional bookmarks bar with `Ctrl/Cmd + Shift + B`
- Bookmark add/edit/delete/reorder and lightweight folders
- Bookmarks/tabs/settings persist with localStorage and settings export/import
- `UI_HEIGHT|N` App Inventor bridge message automatically minimizes vertical space
- Tabs/navigation/bookmarks inherit built-in and custom theme color variables instantly
- Performance Mode strips expensive browser-chrome effects
- Responsive Chromebook, desktop, and phone behavior
- No iframe browsing and no heavy frontend framework

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

Virtual tabs save each tab's URL/history/title metadata and reuse `WebViewer_Browser` when switching. This avoids creating multiple Android WebViews, which is substantially friendlier to low-end Chromebooks and Android devices.

## Browser chrome heights

The web UI calculates its own required height and sends `UI_HEIGHT|N` to App Inventor. With compact tabs, the target is roughly 72px without bookmarks and 100px with the bookmarks bar, rather than permanently reserving a large toolbar.

## Performance

- Vanilla JavaScript/CSS; no React/Vue/runtime framework
- One real browser WebView regardless of virtual tab count
- Debounced localStorage writes
- Keyed tab DOM updates instead of rebuilding the tab strip unnecessarily
- Event delegation for tab/bookmark actions
- Ambient/background rendering disabled in App Inventor browser mode
- Custom cursor disabled in compact browser mode
- Existing adaptive low-power canvas caps retained
- Performance Mode removes blur, large shadows, RGB animation, and nonessential transitions

## Files

`index.html` remains at the repository root for direct GitHub Pages deployment.

See `APP_INVENTOR_SETUP.md` for the exact bridge blocks, including `UI_HEIGHT`, URL synchronization, Home, Back, Forward, and Refresh.
