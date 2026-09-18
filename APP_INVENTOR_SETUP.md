# blobby.vip v8 — MIT App Inventor setup

blobby.vip remains the **full-screen home/new-tab page**. After navigation, the UI WebViewer collapses into compact browser chrome containing tabs, navigation, the address bar, and (optionally) bookmarks. The actual website still loads in one separate `WebViewer_Browser`.

This design intentionally uses **one real browser WebViewer**. Tabs are lightweight virtual tabs in blobby.vip, which keeps the AIA simple and avoids the memory cost of one Android WebView per tab.

## Designer

Use this structure:

```text
Screen1
└── MainContainer (VerticalArrangement)
    ├── WebViewer_UI
    └── WebViewer_Browser
```

Recommended starting properties:

### MainContainer
- Width: Fill parent
- Height: Fill parent

### WebViewer_UI
- Width: Fill parent
- Height: Fill parent
- Visible: true
- HomeUrl: your GitHub Pages blobby.vip URL

### WebViewer_Browser
- Width: Fill parent
- Height: Fill parent
- Visible: false

Do **not** put external websites in an iframe. `WebViewer_Browser` loads them directly.

---

## Bridge messages sent by blobby.vip

```text
NAVIGATE|https://example.com/
BACK|https://previous-url.example/
FORWARD|https://next-url.example/
REFRESH
HOME
OPEN_EXTERNAL|https://example.com/
UI_HEIGHT|72
UI_HEIGHT|100
EXPAND_UI|settings
RESTORE_UI|browser
RESTORE_UI|home
```

The exact `UI_HEIGHT` number is calculated by the webpage. It changes automatically when compact tabs or the bookmarks bar change. Do not hard-code one large browsing height once `UI_HEIGHT` is wired up.

Tabs themselves require **no App Inventor tab components**. Selecting a virtual tab simply sends `NAVIGATE` for that tab's saved URL, or `HOME` for a new/home tab.

---

## Main WebViewStringChange event

Use:

```text
when WebViewer_UI.WebViewStringChange value
```

For commands containing `|`, use **Text → split at first** with `value` and `"|"`.

### 1. NAVIGATE

Condition:

```text
item 1 of (split at first value at "|") = "NAVIGATE"
```

Then:

```text
set WebViewer_UI.Height to 100     // small immediate fallback; UI_HEIGHT corrects it
set WebViewer_Browser.Visible to true
call WebViewer_Browser.GoToUrl
    url = item 2 of (split at first value at "|")
```

After `UI_HEIGHT` is working reliably, the `Height = 100` line is optional because blobby.vip sends its exact height automatically.

### 2. HOME

Condition:

```text
get value = "HOME"
```

Then:

```text
set WebViewer_Browser.Visible to false
set WebViewer_UI.Height to -2
```

`-2` means **Fill Parent** in App Inventor component sizing.

### 3. BACK

Condition:

```text
item 1 of (split at first value at "|") = "BACK"
```

Then:

```text
call WebViewer_Browser.GoToUrl
    url = item 2 of (split at first value at "|")
```

Use the URL supplied by blobby.vip instead of native `GoBack`. Virtual tabs maintain separate lightweight histories, while a single native WebView history would mix pages from different virtual tabs.

### 4. FORWARD

Same as BACK, except compare item 1 with `"FORWARD"` and navigate to item 2.

### 5. REFRESH

Condition:

```text
get value = "REFRESH"
```

Then:

```text
call WebViewer_Browser.Reload
```

### 6. UI_HEIGHT — important

Condition:

```text
item 1 of (split at first value at "|") = "UI_HEIGHT"
```

Then set:

```text
WebViewer_UI.Height = item 2
```

If App Inventor complains that item 2 is text, force it to a number with a Math block such as:

```text
0 + item 2
```

Typical heights are roughly:

```text
Bookmarks hidden:  ~72 px
Bookmarks visible: ~100 px
```

The actual number may vary slightly with compact-tab settings.

### 7. EXPAND_UI

Condition: command (item 1 after split) = `EXPAND_UI`

Then:

```text
set WebViewer_Browser.Visible to false
set WebViewer_UI.Height to -2
```

This lets Settings and Layout Edit use the full screen.

### 8. RESTORE_UI

`RESTORE_UI|browser` means return to browsing:

```text
set WebViewer_Browser.Visible to true
```

blobby.vip will immediately send `UI_HEIGHT` again.

`RESTORE_UI|home` means:

```text
set WebViewer_Browser.Visible to false
set WebViewer_UI.Height to -2
```

### 9. OPEN_EXTERNAL (optional)

If you want the ↗ button to open Android's normal browser, handle `OPEN_EXTERNAL|url` with the Activity Starter or your preferred external-browser method. It is optional.

---

## Keep the tab URL/history synchronized

This step is strongly recommended. It lets blobby.vip learn about links clicked *inside* the actual website, not only URLs typed into blobby.vip.

Use the browser WebViewer's page-loaded event:

```text
when WebViewer_Browser.PageLoaded url
```

Set:

```text
WebViewer_UI.WebViewString = join "URL|" url
```

The blobby.vip JavaScript polls the UI WebViewer's inbound WebViewString and updates the active virtual tab, address bar, history state, and bookmark star.

If a future WebView extension exposes page titles or favicons, blobby.vip already understands optional inbound messages:

```text
TITLE|Actual page title
FAVICON|https://example.com/favicon.ico
```

Without those, it gracefully uses the site's hostname / first letter.

---

## Browser UI handled entirely by blobby.vip

No extra App Inventor Designer components are needed for:

- Virtual tabs
- New tab / close tab
- Tab reorder
- Tab session restore
- Back / forward UI
- Refresh button
- Address bar
- Home button
- Bookmark star
- Bookmarks bar
- Bookmark folders
- Bookmark add/edit/delete/reorder
- Ctrl/Cmd + Shift + B
- Browser overflow menu
- Custom-theme styling
- Responsive mobile layout

This is deliberate: updating the GitHub Pages files can change the browser interface without rebuilding the AIA.

---

## Keyboard shortcuts inside blobby.vip

```text
Ctrl/Cmd + L             Focus address bar
Ctrl/Cmd + T             New tab
Ctrl/Cmd + W             Close current tab
Ctrl/Cmd + Tab           Next tab
Ctrl/Cmd + Shift + Tab   Previous tab
Ctrl/Cmd + R             Refresh
Alt + Left               Back
Alt + Right              Forward
Ctrl/Cmd + Shift + B     Toggle bookmarks bar
Ctrl/Cmd + K             Command palette
Ctrl/Cmd + ,             Settings
```

On Android touch devices, the visible buttons/menu provide the same actions.
