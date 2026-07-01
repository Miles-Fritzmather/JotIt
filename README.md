# JotIt

A lightweight macOS quick-note app. Heavily inspired by Raycast's note tool, except this is actually open source and free like all their other stuff! Press a global shortcut, jot something down in a floating Markdown editor, and get back to what you were doing. Notes are plain `.md` files on disk — no account, no sync layer, no database. The project is open to suggestions or additions. Was built using AI (not 100% or anything) if that is something you care about.

Built with [Tauri 2](https://v2.tauri.app/), React, and [Milkdown](https://milkdown.dev/).

## Features

- **Global floating notepad** — summon from anywhere with **⌃⇧J** (Control+Shift+J). The window stays on top, works across fullscreen spaces, and hides instead of quitting when you close it.
- **Markdown editing** — Uses Milkdown/Crepe for the markdown render and some helpful features like the / menu and highlight text view. Supports images, code blocks with langauge specification, latex, tables, and all the other basic stuff.
- **Plain-file storage** — every note is a `.md` file in an app data folder. Import existing `.md`, `.markdown`, or `.txt` files from settings.
- **Multiple notes** — Create as many notes as you want. You can star them too for easier access.
- **Find in note** — **⌘F** to search within the current note.
- **macOS-native chrome** — Liquid Glass or blur backdrop (native `NSGlassEffectView` / `NSVisualEffectView`), transparent panel, and focus-aware styling. The glass effect I thought would be cooler than it was so set as an optional toggle on.
- **Customizable accent color** — the accent color is used everywhere so choose wisely!
- **Runs in the background** — no dock icon while only the notepad is active and opens instantly.

## Requirements

- **macOS** (primary target; uses macOS-specific window and backdrop APIs)
- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) stable
- Xcode Command Line Tools (`xcode-select --install`)

## Getting started

```bash
npm install
npm run tauri dev
```

This starts the Vite dev server and launches the native app. You do **not** need to run `npm run dev` in a separate terminal.

## Building a standalone app

```bash
npm run tauri build
```

Output:

```
src-tauri/target/release/bundle/macos/notetaker.app
```

Open it directly or drag it to `/Applications`:

```bash
open src-tauri/target/release/bundle/macos/notetaker.app
```

The project is configured to build the `.app` bundle only (no `.dmg` installer), which avoids flaky DMG packaging on some macOS setups.

To also build a DMG, change `bundle.targets` in `src-tauri/tauri.conf.json` from `["app"]` to `"all"`.

## Usage

### Global shortcut

| Action | Shortcut |
|--------|----------|
| Toggle notepad | **⌃⇧J** |

Press again while the notepad is focused to hide it. Focus returns to the app you were using before.

### In the notepad

| Action | Shortcut |
|--------|----------|
| New note | **⌘N** |
| Pick / search notes | **⌘P** |
| Settings | **⌘,** |
| Find in note | **⌘F** |
| Previous / next note | **⌥←** / **⌥→** |
| Zoom in / out / reset | **⌘+** / **⌘-** / **⌘0** |
| Delete note (confirm) | **Ctrl+X** |
| Paste alternate mode | **⌘⇧V** |

### Settings

Open settings from the notepad toolbar or with **⌘,**. You can also open the dedicated settings window from Rust (`open_settings`).

- View and reveal the notes folder
- Import markdown files
- Toggle formatted vs plain-text paste
- Pick an accent color

## Where data is stored

| Data | Location |
|------|----------|
| Notes (`.md` files) | `~/Library/Application Support/test/notes/` |
| Note metadata (stars, tags) | `~/Library/Application Support/test/notes/metadata.json` |
| App settings | `~/Library/Application Support/test/app-settings.json` |
| Window position/size | `~/Library/Application Support/test/floating-note-window.json` |

> The folder name `test` comes from `identifier` in `src-tauri/tauri.conf.json`. Change it before distributing the app.

## Project structure

```
notetaker/
├── index.html              # Settings window entry
├── floating-note.html      # Notepad window entry (required for production builds)
├── src/
│   ├── main.tsx            # Routes to settings or notepad by window label
│   ├── theme.ts            # Accent color + Tauri settings commands
│   ├── app/                # Settings UI
│   └── notepad/            # Floating editor, Milkdown, note providers
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs          # macOS overlay, vibrancy, app entry
│   │   ├── notepad.rs      # Notes CRUD, floating window, global shortcut
│   │   └── settings.rs     # Persistent settings + settings window
│   └── tauri.conf.json
└── vite.config.ts          # Multi-page build (index + floating-note)
```

## Tech stack

| Layer | Choice |
|-------|--------|
| Shell | Tauri 2 (Rust) |
| UI | React 19, TypeScript, Tailwind CSS 4 |
| Editor | Milkdown 7 (Crepe) |
| Bundler | Vite 7 |

## Development notes

- **Two webviews** — the settings window loads `index.html`; the notepad loads `floating-note.html`. Both share `src/main.tsx` but render different roots based on the Tauri window label.
- **Tauri / npm versions** — `@tauri-apps/api` and `@tauri-apps/cli` are pinned to match the Rust `tauri` crate major.minor (currently 2.10.x). Keep them aligned if you upgrade.
- **Login at startup** — add `notetaker.app` to **System Settings → General → Login Items** after building.

## License

Private project.
