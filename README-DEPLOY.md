# Lumina Docs — GitHub Pages package

This package contains the existing Lumina Docs single-page application, prepared for static hosting.

## Deploy to GitHub Pages

1. Open `https://github.com/osmosis0415-a11y/luminadox`.
2. Upload `index.html`, `manifest.webmanifest`, and `sw.js` to the repository root, and upload `icon-192.png` and `icon-512.png` to the repository root.
3. Commit the changes to the `main` branch.
4. In the repository, open **Settings → Pages**.
5. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/ (root)`, then Save.
6. Wait for the Pages deployment to finish. The expected URL is `https://osmosis0415-a11y.github.io/luminadox/`.

## Important operating notes

- Documents are stored in the browser's local storage on the device/browser where they are created. Use **Docs → Backup/Restore** regularly to export a JSON backup and move work between devices.
- Firebase cloud sync is not configured by this static package. The app therefore falls back to local browser storage. Do not assume documents are synced between devices.
- Gemini AI requires your own Gemini API key. The key is held in page memory for the current tab only; it is not saved to local storage. Reloading/closing the tab clears it. A browser-side API key is still visible to the browser user and should be a restricted, low-quota key; do not use a privileged server key here.
- Lucide icons, JSZip, and Google Fonts are loaded from CDNs when online. The original compiled Tailwind CSS is bundled in `index.html`; the development-only Tailwind CDN was removed. The service worker caches the app shell and attempts to cache selected libraries for repeat launches, but fully offline first-time use is not guaranteed.
- This is a browser-based editor, not a HIPAA-compliant or hospital-approved clinical record system. Avoid storing identifiable patient information or confidential clinical records in it unless your institution has approved the security and data-handling arrangements.

## Changes in this production package

- Added a static web manifest and service worker registration for GitHub Pages/PWA support.
- Added sanitization and record normalization for local backups and cloud snapshots before document HTML is inserted into the editor.
- Removed persistent browser storage of Gemini API keys; the old saved key is cleared when the app starts.
- Fixed duplicate save-badge element IDs and made Lucide icon initialization tolerant of CDN/offline failures.
- Made Firebase initialization idempotent to avoid duplicate initialization when both startup paths run.
- Updated the AI model identifier to `gemini-3.8-flash`; model availability and API access remain subject to Google's current API support and your key's permissions.

## Validation

The inline JavaScript has been syntax-checked with Node.js. Browser-level testing of every editor workflow, external API integration, PWA installation, and GitHub Pages deployment must still be completed in the target browser after publishing.
