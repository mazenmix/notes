# MX Notes — Cloudflare D1 activation

This repo is connected to **https://mxnote.pages.dev/** on Cloudflare Pages. Code for private cloud sync is already in `functions/api/session.js`, `functions/api/vault.js`, and `functions/_lib/owner.js`. **The database and owner secrets must still be created in your own Cloudflare account.** Do not commit passwords, API tokens, or database contents to GitHub.

## One-time setup (Cloudflare dashboard)

1. In **Cloudflare → Workers & Pages → D1**, create a database named `mxnotes-db`.
2. Select `mxnotes-db → Console` and execute the full SQL from [schema.sql](./schema.sql). It creates `vault` and `login_attempts`.
3. Open **Workers & Pages → mxnote → Settings → Bindings** (Production environment). Select **Add binding → D1 database** and bind `mxnotes-db` with the exact **Variable name `DB`**.
4. In **mxnote → Settings → Variables and Secrets / Environment variables**, create **encrypted secrets** for the production environment:
   - `NOTES_PASSWORD`: your unique private login password (minimum 12 characters).
   - `SESSION_SECRET`: a different, random 32+ character string (64+ strongly preferred). Keep it private; rotating it signs every device out.
5. **Redeploy** the latest GitHub-connected `main` deployment, because new Pages bindings and environment variables take effect on a fresh deployment. Check **https://mxnote.pages.dev/api/session** — it should return `{"configured":true,"authenticated":false}`.
6. Visit **https://mxnote.pages.dev/**, open cloud settings and enter the `NOTES_PASSWORD` you created. No email, Supabase signup or other accounts are required. Check **Sync now & verify**.
7. Log into the same site from your phone using the same password. Notes upload about 1.45 seconds after you stop typing; the app checks for updates about every 12 seconds.

## How sync works

- Notes always save first in browser storage, including when offline.
- D1 stores one private workspace containing notes and folders; the server never returns it unless the caller presents a valid signed, HttpOnly session cookie.
- Access is owner-only through the `NOTES_PASSWORD` secret and a 7-day, signed, Secure, SameSite=Strict cookie. There is no public registration endpoint.
- Login attempts are throttled per IP fingerprint using D1.
- Updates use a revision check to prevent blind overwrites. The client merges notes by each note's `updatedAt` timestamp, retrying concurrent revision conflicts.
- A successful upload is read back; **Saved to cloud** appears only after the read-back matches.
- Local edits aren't lost if the cloud is unreachable; **Offline · saved locally** is shown.
- This is TLS-protected, owner-restricted cloud storage, **not end-to-end encryption**. Cloudflare can process/store your vault. Export occasional JSON backups.
- Avoid simultaneous editing of the same note across two devices: last edit wins on that note. Separate notes merge.

## Cloudflare Pages build settings

Git-connected Pages project: production branch `main`; no build command; output directory `/` (root).

Cloudflare's **Pages Functions** are picked up from the root-level `functions/` directory automatically. If you configured a custom root directory, make sure it is the repository root, not a subfolder.

### Verify

- `/api/session` returns `configured:false` → binding or secrets are not configured.
- `/api/session` returns `configured:true,authenticated:false` → ready for owner login.
- `/api/vault` without login → HTTP 401; this protects private notes.
- Press the in-app **Sync now & verify** button; Settings should show a real server-confirmed timestamp.
- **403 Cross-origin write blocked** → use the same hostname for the app and the API.
- **503 D1 table missing** → run `schema.sql` in the correct **production** database and redeploy.
- If a preview deployment needs sync, bind the appropriate D1 and secrets to **Preview** too; production settings do not automatically cover Preview.

## Important security note

Do not expose `NOTES_PASSWORD` or `SESSION_SECRET` in browser code, GitHub, chat screenshots, or ordinary public environment variables. Use Cloudflare's encrypted secret type. Only the short password entry travels to the site's same-origin HTTPS login API.

© MazenmiX


## Private attachments (new)

MX Note can attach **images, PDFs, and general files** (up to **15 MB each**).
Attachments are stored as private objects in Cloudflare **R2**, not embedded in
the D1 text workspace. The note stores only an opaque attachment ID, display
filename, MIME type, and image display width.

1. Cloudflare dashboard → **R2 Object Storage** → **Create bucket**.
   Example bucket name: `mxnotes-attachments`. Leave public access **off**.
2. Workers & Pages → **mxnote** → **Settings → Bindings → Add**.
   Choose **R2 bucket**, binding variable `ATTACHMENTS`, and select
   `mxnotes-attachments` in **Production** (and Preview if needed).
3. Save, then **redeploy** the latest `main` Production deployment.
4. Unlock the cloud vault at `https://mxnote.pages.dev`, attach a small image
   or PDF, then refresh and verify it opens from a second authenticated device.

The attachment endpoint is `/api/attachment` and requires the existing signed
owner session, so there are **no publicly accessible object URLs**. Upload and
delete operations require a matching same-origin request. Unsupported/missing
R2 binding returns HTTP 503, so the app will not pretend an upload succeeded.
Exporting a workspace backup includes attachment references **only**, not R2
binary content. Keep your bucket and vault together for disaster recovery.

### Rich editor
- Paperclip → upload one or more files; tap **Open** to view/download.
- Image figure → **−**/**+** buttons resize it (the chosen width is saved).
- Table icon → choose rows and columns; right-click or long-press a cell to add
  or delete rows/columns and change column width or row height.
- Code icon → choose a language, paste/edit code. The local syntax tokenizer
  colors strings, numbers, comments and language keywords on exit.

Normal note/folder deletion now moves content to the recoverable Trash without
asking. **Empty Trash** is the only deletion action requiring confirmation.
Folders retain their original note locations until permanent deletion.
