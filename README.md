# MX Notes

A responsive dark writing workspace inspired by **iA Writer's typography** and **Obsidian's linked-note organization**. Dependency-free, local-first, and designed for phones and desktops.

**Website URL (when GitHub Pages is enabled):** https://mazenmix.github.io/notes/

## Features

- Dark, minimal typography with IBM Plex Mono
- Desktop rail + sidebar + editor + graph/backlinks
- Mobile full-width writing with bottom navigation and slide-out notes list
- Notes, folders, favorite/star, archive, trash, tags
- Markdown source and safe preview, `[[Wiki links]]`, graph and backlinks
- Live search, format buttons, word/character counts, focus mode
- Automatic browser storage and JSON backup import/export
- Markdown export per note
- Optional single-owner Supabase sign-in and multi-device cloud synchronization
- One-click verified sync with exact last confirmed cloud timestamp
- Working persistent light/dark theme toggle (desktop and mobile)
- Installable web manifest; no build step or paid UI packages

## Deploy on GitHub Pages

1. Open **Settings → Pages** in this repository.
2. Set **Build and deployment → Source: GitHub Actions**.
3. Run **Deploy MX Notes** under **Actions** (or push to `main`).
4. Open **https://mazenmix.github.io/notes/** after the workflow succeeds.

Alternatively, connect this repository to Cloudflare Pages, choose branch `main`, leave Build command blank and use `/` for the output directory.

## Activate real cloud synchronization

**Important:** Publishing the website does not automatically give it a shared cloud database. Without the following setup, your notes save to local browser storage only.

1. Create a Supabase project and enable email/password under **Authentication → Providers**.
2. Create **one owner account** in **Authentication → Users** from the Supabase dashboard (use **Add user**). Disable **Allow new users to sign up** under Authentication settings to block public registrations.
3. Open the **Supabase SQL Editor**, paste the contents of [supabase.sql](./supabase.sql), and run it. RLS ensures a signed-in user can only read their own vault.
4. Visit MX Notes. Click the **cloud icon**. Enter your Supabase Project URL and **publishable or anon key** from Project Settings → API Keys, plus that owner's email/password. **There is deliberately no Create account button on MX Notes.**
5. Log in on your other devices with the same project details and credentials. Press **Sync now & verify** to confirm the server has returned the stored revision.
6. Settings displays the *exact last successful confirmation date/time*, live connection status, and pending verification state. An unconfigured or unreachable cloud is **never** presented as successfully synced.

Do not put your Supabase **service_role**, secret key, or database password in this public repository or in the web app.

Cloud traffic is protected using HTTPS and database rows are isolated with RLS. **This is not end-to-end encryption.** The sync model is a single JSON vault per user, resolved by last-write time, and checks cloud updates on window focus and periodically. Successful cloud writes are read back and checked before being marked confirmed. Avoid simultaneous edits on separate devices to prevent one workspace version overriding another. Keep regular JSON backups.

## Shortcuts

| Shortcut | Action |
|---|---|
| Ctrl/⌘ + N | New note |
| Ctrl/⌘ + K | Find notes |
| Ctrl/⌘ + S | Save and queue cloud sync |
| Ctrl/⌘ + Shift + L | Toggle light/dark theme |
| Esc | Close panels / exit focus |

The proprietary iA Writer typeface is not included. Open-licensed IBM Plex Mono provides a comparable writing feel.

## Project files

- `index.html` — editor and navigation markup
- `styles.css` — responsive visual design
- `app.js` — note and cloud-sync logic
- `supabase.sql` — user-isolated cloud schema
- `.github/workflows/pages.yml` — deployment workflow

Made for MazenmiX.
