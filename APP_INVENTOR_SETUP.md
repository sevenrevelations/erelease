# blobby.vip v8.2 — MIT App Inventor setup

blobby.vip is the **full-screen Home/New Tab page**. The real website appears only after navigation. While browsing, `WebViewer_UI` collapses to compact tabs/navigation/bookmarks and `WebViewer_Browser` fills the rest of the app.

v8.2 explicitly sends `HOME` on startup so App Inventor hides `WebViewer_Browser` and shows blobby.vip first.

## Designer

```text
Screen1
└── MainContainer (VerticalArrangement)
    ├── WebViewer_UI
    └── WebViewer_Browser
```

### WebViewer_UI
- Width: Fill parent
- Height: Fill parent
- Visible: true
- HomeUrl: your GitHub Pages blobby.vip URL

### WebViewer_Browser
- Width: Fill parent
- Height: Fill parent
- Visible: false

## Bridge messages

```text
HOME
NAVIGATE|https://example.com/
UI_HEIGHT|72
UI_HEIGHT|100
REFRESH
BACK|https://previous.example/
FORWARD|https://next.example/
EXPAND_UI|settings
RESTORE_UI|browser
RESTORE_UI|home
OPEN_EXTERNAL|https://example.com/
```

## Important: use one IF / ELSE IF chain

Do **not** make six independent `if` blocks that all parse the message. Commands such as `HOME` and `REFRESH` do not contain `|`, so trying to select item 2 from them causes App Inventor runtime errors.

Use this structure inside:

```text
when WebViewer_UI.WebViewStringChange value
```

```text
IF get value = "HOME"
    set WebViewer_Browser.Visible to false
    set WebViewer_UI.Height to -2

ELSE IF item 1 of (split at first get value at "|") = "UI_HEIGHT"
    set WebViewer_UI.Height to
        0 + item 2 of (split at first get value at "|")

ELSE IF get value = "REFRESH"
    call WebViewer_Browser.Reload

ELSE IF item 1 of (split at first get value at "|") = "NAVIGATE"
    set WebViewer_Browser.Visible to true
    call WebViewer_Browser.GoToUrl
        item 2 of (split at first get value at "|")

ELSE IF item 1 of (split at first get value at "|") = "BACK"
    call WebViewer_Browser.GoToUrl
        item 2 of (split at first get value at "|")

ELSE IF item 1 of (split at first get value at "|") = "FORWARD"
    call WebViewer_Browser.GoToUrl
        item 2 of (split at first get value at "|")
```

`-2` means Fill Parent in App Inventor sizing.

Once `UI_HEIGHT` is working, do not keep a hard-coded `WebViewer_UI.Height = 65/100` inside NAVIGATE. The webpage calculates its own compact height.

## Keep the active tab synchronized

Keep this separate event:

```text
when WebViewer_Browser.PageLoaded url
```

Then:

```text
set WebViewer_UI.WebViewString to
    join "URL|" get url
```

This updates the virtual tab after a user clicks links inside the real website.

Optional future inbound messages:

```text
TITLE|Actual page title
FAVICON|https://example.com/favicon.ico
```

## Tabs/bookmarks/navigation

No extra Designer components are required for:

- Virtual tabs
- New/close/switch/reorder tabs
- Back / Forward / Refresh / Home UI
- Address/search bar
- Bookmark star and bookmarks bar
- Ctrl/Cmd + Shift + B
- Browser menu
- Theme integration
- Responsive browser chrome

All of that stays in the GitHub-hosted blobby.vip UI.


## Persistent tabs in v8.2
No new App Inventor blocks are required. `WebViewer_UI` still fills the screen in Home mode, but the HTML tab strip remains visible at the top. `WebViewer_Browser` remains hidden for a Home/New Tab and appears only after navigation. The existing HOME/NAVIGATE/UI_HEIGHT bridge remains unchanged.

## Community Chat overlay

The included `chat.js` uses the same UI expansion behavior already used by blobby.vip settings. No new App Inventor components are required.

When Chat opens while an external site is active, `WebViewer_UI` is temporarily expanded with `UI_HEIGHT|-2` so the sidebar is usable. Closing Chat restores the normal browser-chrome height. The existing real `WebViewer_Browser` navigation/history logic is unchanged.

Do not add a third WebViewer for Chat; the chat is part of the GitHub-hosted `WebViewer_UI` interface.
