# blobby.vip + MIT App Inventor setup

blobby.vip is the customizable **home/controller UI**. It does not render browser tabs and it does not iframe external websites. MIT App Inventor owns the actual browsing WebViewer(s).

JavaScript in blobby.vip sends commands through:

```javascript
window.AppInventor.setWebViewString(...)
```

## Recommended Designer structure

Create:

1. `VerticalArrangement_Main`
   - Width: Fill parent
   - Height: Fill parent
2. `WebViewer_UI`
   - HomeUrl: your GitHub Pages blobby.vip URL
   - Width: Fill parent
   - Height: Fill parent while on the blobby.vip home screen
3. `WebViewer_Browser`
   - Width: Fill parent
   - Height: Fill parent
   - Visible: false initially

If you add native App Inventor tabs later, the active tab can select which browsing WebViewer/state receives these commands. blobby.vip itself does not create, close, or switch tabs.

## Controller behavior

On the home screen, `WebViewer_UI` fills the screen so the user can see the customizable title, effects, shortcuts, clock, recent sites, and full-screen grid layout.

After a website opens, blobby.vip switches internally to its compact controller view. In App Inventor:

- shrink `WebViewer_UI` to roughly **70–76 px**
- show the active `WebViewer_Browser` below it

Opening Settings or Layout Edit sends `EXPAND_UI`, allowing App Inventor to temporarily make the UI WebViewer full-screen. Closing those surfaces sends `RESTORE_UI`.

## Messages sent from blobby.vip

| Message | App Inventor action |
|---|---|
| `NAVIGATE|https://example.com/` | Show the active browser WebViewer and call `GoToUrl(url)` |
| `BACK|https://target.example/` | Call `GoToUrl(target)` on the active browser WebViewer |
| `FORWARD|https://target.example/` | Call `GoToUrl(target)` on the active browser WebViewer |
| `REFRESH` | Reload the active browser WebViewer |
| `HOME` or `SHOW_HOME` | Hide browser content and expand `WebViewer_UI` |
| `OPEN_EXTERNAL|url` | Optional: open the URL using Android's system browser |
| `EXPAND_UI|settings` | Hide browser content and make `WebViewer_UI` Fill parent |
| `EXPAND_UI|layout` | Same; the v7 **20 × 14** editor needs the full screen |
| `RESTORE_UI|browser` | Shrink `WebViewer_UI` to the compact controller height and show browser content |
| `RESTORE_UI|home` | Keep `WebViewer_UI` full screen |

There are intentionally no `NEW_TAB`, `CLOSE_TAB`, or `SWITCH_TAB` messages in this UI.

## WebViewStringChange logic

Pseudo-block logic:

```text
when WebViewer_UI.WebViewStringChange(value)

if value starts with "NAVIGATE|"
    set url to text after "NAVIGATE|"
    set WebViewer_UI.Height to 74 px
    set WebViewer_Browser.Visible to true
    call WebViewer_Browser.GoToUrl(url)

else if value starts with "BACK|"
    call WebViewer_Browser.GoToUrl(text after "BACK|")

else if value starts with "FORWARD|"
    call WebViewer_Browser.GoToUrl(text after "FORWARD|")

else if value = "REFRESH"
    call WebViewer_Browser.Reload

else if value = "HOME" or value = "SHOW_HOME"
    set WebViewer_Browser.Visible to false
    set WebViewer_UI.Height to Fill parent

else if value starts with "EXPAND_UI|"
    set WebViewer_Browser.Visible to false
    set WebViewer_UI.Height to Fill parent

else if value = "RESTORE_UI|browser"
    set WebViewer_UI.Height to 74 px
    set WebViewer_Browser.Visible to true

else if value = "RESTORE_UI|home"
    set WebViewer_Browser.Visible to false
    set WebViewer_UI.Height to Fill parent
```

## Sync the actual URL back to blobby.vip

When the active browsing WebViewer finishes loading:

```text
when WebViewer_Browser.PageLoaded(url)
    set WebViewer_UI.WebViewString to join "URL|" url
```

If your native tab system changes the active tab, send that tab's current URL through the same `URL|...` message so blobby.vip's address bar stays synchronized.

## Performance recommendations for Chromebooks / Android WebView

The blobby.vip UI has its own Performance Mode. For low-end classroom Chromebooks or older Android devices:

- enable **Settings → Performance → Performance Mode**
- leave **Adaptive low-power rendering** enabled
- avoid large uploaded wallpapers
- keep the controller WebViewer around 74 px tall while browsing
- avoid running several separate browsing WebViewers at once if your native tab implementation can suspend inactive tabs

Performance Mode disables the decorative particle canvas, custom cursor rendering, backdrop blur, RGB animation, large shadows, and nonessential motion.

## GitHub Pages

Keep `index.html` at the repository root, then enable:

Settings → Pages → Deploy from a branch → `main` → `/ (root)`.

## v7.1 compact browse bar
When handling `NAVIGATE|...`, set `WebViewer_UI.Height` to **52** (instead of 100/74), then show `WebViewer_Browser` and navigate it.
When handling `HOME`, hide `WebViewer_Browser` and set `WebViewer_UI.Height` to **-2** (Fill Parent).
The web UI automatically detects an active browser URL and hides every homepage widget except the address/navigation bar. Home stays available on narrow phone screens.
