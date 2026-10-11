# MX Notes

A polished private note-taking web app, combining **Obsidian-inspired type and linked notes** with direct **Apple Notes-style rich-text editing**, deployed to **https://mxnote.pages.dev/** from the GitHub repository `mazenmix/notes`.

## Features

- Real horizontal multi-tab document navigation, click-to-open and close tabs
- Smooth note and folder operations with right-click desktop context menus and long-press mobile menus
- Rich text editing directly in the page (bold, italic, underline, heading, lists, checklist, links). No Markdown symbol codes or preview switch
- App-native right-click menus for notes, tabs and editor; translation of selected text opens Google Translate in a separate tab
- Browser spellcheck with optional Shift + right-click native spelling suggestions
- Adjustable Apple Notes system / Obsidian Inter / serif reading typography in Settings
- Inter-based typography, full-width Arabic/English writing surface, collapsible folder groups and note previews
- Desktop layout and mobile near-full-screen editor with compact navigation and formatting dock
- Dark/light themes; local-first autosaving; JSON backup and HTML note exports
- Cloudflare Pages Functions + owner-only password + D1 database cloud sync, ~1.45 s typing debounce and 12 s periodic checks
- No public account registration, no tag UI

## Website

**Production site:** https://mxnote.pages.dev/

Cloudflare Pages should be linked to `main`, with the repository root as the Pages build output. This site uses the `functions/` directory for authenticated cloud API routes.

## IMPORTANT: activate cloud database

**Cloud sync is not active until you add your database binding and encrypted secrets in your own Cloudflare dashboard.**

Follow **[Cloudflare D1 owner setup](cloudflare/README.md)** step by step. You need a D1 database, the provided SQL schema, the `DB` binding, and encrypted `NOTES_PASSWORD` and `SESSION_SECRET`. Redeploy once. Your data stays stored locally until you successfully unlock and verify cloud sync.

No Supabase account or keys are used by this version.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| Ctrl/⌘ + N | Create a new tab and note |
| Ctrl/⌘ + K | Search |
| Ctrl/⌘ + S | Save locally / queue upload |
| Ctrl/⌘ + Shift + L | Toggle light/dark theme |
| Esc | Close overlay / leave focus mode |

## File map

- `index.html`, `styles.css` — polished responsive UI
- `app.js` — rich editor, tabs, contextual actions, client sync
- `functions/api/session.js` — single-owner login and session
- `functions/api/vault.js` — authenticated D1 read/write with revision checks
- `functions/_lib/owner.js` — cookie/session auth and throttling helpers
- `cloudflare/schema.sql` — D1 database schema
- `cloudflare/README.md` — production activation and verification
- `_routes.json` — enable Pages Functions for /api/* only

No proprietary iA Writer or Obsidian font files are bundled. The font is **Inter** with local system fallbacks.

Made for MazenmiX.

<!-- Redeploy trigger: refresh Cloudflare Pages Production environment bindings on 2026-10-11. -->
