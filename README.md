# blobby.vip

A sleek, highly customizable browser-controller homepage designed for GitHub Pages + MIT App Inventor.

## v7 redesign

This build keeps the existing customization system but rebuilds the interface and editor around performance and a much cleaner visual hierarchy.

### New / improved

- Full-screen **20 × 14 layout grid** that reaches the edges and corners of the usable page
- Drag **and resize** every major homepage block
- Collision detection prevents elements from overlapping
- Layout Undo / Redo and one-click Center for the selected block
- 10 layout presets plus saved custom layouts
- Completely redesigned Settings panel with clearer categories and search
- Hidden scrollbars while preserving mouse-wheel, trackpad, keyboard, and touch scrolling
- Custom desktop cursor system with dot, ring, RGB, trail, sparkle, comet, glow, pixel, crosshair, and blob modes
- Focus Mode, UI-density options, customizable navigation buttons, and clock controls
- Command palette with Ctrl/Cmd + K
- 24 theme presets plus full custom color editing
- Expanded ambient effects including constellation, digital grid, neon horizon, liquid gradient, light rays, soft clouds, and space dust
- Existing App Inventor bridge remains iframe-free
- Existing v6/v5 preferences are migrated into v7 when possible

## Performance design

v7 is deliberately optimized for lower-end Chromebooks and Android WebViews.

**Performance Mode** is the strict option. It disables or simplifies:

- Canvas particle effects
- Custom cursor effects and cursor trails
- Backdrop blur
- Large shadows
- RGB animation
- Nonessential transitions and motion
- Expensive background filtering

**Adaptive low-power rendering** is enabled by default. On devices that report roughly 4 CPU threads or 4 GB of memory or less, blobby.vip automatically:

- Caps ambient rendering near 30 FPS
- Uses a lower canvas device-pixel ratio
- Caps particle density even if the slider is higher
- Reduces expensive ambient blur
- Keeps hidden effects from consuming animation work

Performance Mode is still stronger than adaptive rendering and can be enabled manually in Settings → Performance.

## Layout blocks

The movable/resizable grid includes:

- Utility/settings controls
- Search/navigation bar
- blobby.vip title
- Clock
- Shortcuts
- Recent pages
- Desktop preview

Open the ▦ button or **Settings → Layout → Open layout editor**. Use:

- **✥** to move a block
- **⌟** to resize a block
- Arrow keys while a move/resize handle is focused for cell-by-cell adjustments
- Undo / Redo from the floating toolbar
- Center to snap the selected block to the middle when the space is available

The editor spans the full usable viewport. Invalid or occupied destinations are rejected instead of allowing overlap.

## Customization

The project includes:

- 24 preset themes
- Full custom theme color editor
- Theme import/export
- Solid, gradient, remote-image, or uploaded-image backgrounds
- Panel opacity, blur, radius, shadows, and UI density
- RGB logo/search/buttons/panels/ambient targeting
- Rain + optional lightning + rainy-glass ambience
- Snow, stars, particles, fireflies, orbs, aurora, fog, Matrix rain, bubbles, shooting stars, waves, dust, constellation, clouds, digital grid, neon horizon, liquid gradient, light rays, and space dust
- Custom cursor presets and controls
- Focus Mode
- Shortcut folders and reordering
- Saved layouts
- Complete customization profiles
- Settings and theme import/export
- Reduced Motion and keyboard controls

## Keyboard shortcuts

When keyboard shortcuts are enabled:

- `Ctrl/Cmd + L` — focus the address bar
- `Ctrl/Cmd + K` — command palette
- `Ctrl/Cmd + /` — command palette
- `Ctrl/Cmd + ,` — Settings
- `Ctrl/Cmd + Shift + E` — Layout Edit
- `/` — focus the address bar when not typing
- `Esc` — close an open dialog

## App Inventor architecture

GitHub Pages hosts only the blobby.vip controller UI. External websites are loaded by MIT App Inventor's browser WebViewer, not by an iframe.

Typical messages:

```text
NAVIGATE|https://example.com/
BACK|https://previous.example/
FORWARD|https://next.example/
REFRESH
HOME
EXPAND_UI|settings
EXPAND_UI|layout
RESTORE_UI|browser
RESTORE_UI|home
```

Tabs are intentionally not managed by this GitHub UI. Your MIT App Inventor tab layer can own the active browsing WebViewer and send its URL back to blobby.vip with `URL|https://...`.

See `APP_INVENTOR_SETUP.md` for the integration logic.

## Files

```text
index.html
style.css
core.js
themes.js
browser-bridge.js
effects.js
cursor.js
layout.js
app.js
APP_INVENTOR_SETUP.md
README.md
tests/check.cjs
```

## Local preview

You can double-click `index.html`, but a local server is more reliable:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## GitHub Pages

Upload the files directly to the repository root so `index.html` is visible immediately. Then use:

Settings → Pages → Deploy from a branch → `main` → `/ (root)`.
