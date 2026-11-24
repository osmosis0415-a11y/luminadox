# Lumina Docs — Production Readiness Audit

**Audit basis:** the uploaded `Lumina Docs - Modern Word Processor (1).html` (single-page vanilla HTML application, approximately 4,600 source lines). The app has not been deployed or tested against a live Firebase project.

## 1. Application and architecture

- Single-page browser application; no Node/React build step is required.
- Main features present in the source: contenteditable rich-text editor, multiple documents, localStorage persistence, medical PG thesis templates, outline/TOC, Vancouver/APA/MLA/IEEE/Chicago citation formatting, PubMed PMID lookup, footnotes, advisor comments, track changes, table editing, plagiarism-preparation highlights, sample-size/medical-symbol utilities, print styles, and DOC/DOCX/HTML/Markdown/TXT export.
- Optional Gemini-powered writing actions are present. Firebase Auth/Firestore cloud-sync code is present but depends on runtime-injected Firebase configuration and is not configured for a normal static GitHub Pages deployment.

## 2. Findings and changes made

### High priority — imported HTML trust boundary

**Finding:** the original app assigned saved document content directly to `editor.innerHTML`; restored JSON backups and remote Firestore snapshots could therefore supply active HTML/event-handler attributes or unsafe URLs.

**Change:** added an allowlist-based HTML sanitizer and record normalizer. Local saved documents, restored backups, and remote snapshots are normalized before they are placed into the editor. Scripts, embedded active content, inline event handlers, and unsafe URL schemes are removed. Common editor markup, page breaks, citations, footnotes, comment marks, plagiarism markers, and track-change formatting are retained.

**Remaining limitation:** this is client-side sanitization, not a substitute for a server-side trust boundary. Continue treating backups and document files as untrusted.

### High priority — API-key persistence

**Finding:** the original code saved the user's Gemini API key in localStorage, where it persists in the browser profile and is readable by scripts running in the same origin.

**Change:** startup clears the legacy stored key; new keys are held in page memory only and are cleared by a reload/tab close. The request uses the `x-goog-api-key` header rather than putting the key in the URL. AI now reports clearly that a key is required; no built-in server-side key exists.

**Remaining limitation:** a browser-side key is still inspectable by the browser user and is sent to Google. Use a restricted key with appropriate API restrictions and quota. Do not embed a privileged key in a static site.

### Medium priority — static hosting and installability

**Finding:** the original manifest was generated as a Blob URL at runtime and there was no service worker. That is not a robust static PWA deployment arrangement.

**Change:** added a static `manifest.webmanifest`, PNG app icons, and `sw.js`; the app registers the service worker on HTTPS hosts. The service worker caches the app shell and makes a best-effort cache of selected external libraries. The development Tailwind CDN runtime was removed because the original HTML already contains compiled Tailwind utility CSS. Lucide and JSZip scripts are deferred; icon initialization now tolerates a CDN failure.

**Remaining limitation:** first-visit offline operation is not guaranteed. Google Fonts and some libraries remain external. Browser-specific PWA installation and offline behavior must be checked after deployment.

### Medium priority — startup reliability and markup

**Finding:** Firebase initialization could be requested through both the module startup path and the main DOMContentLoaded handler. The save-badge element was also recreated with a duplicate ID.

**Change:** made Firebase initialization idempotent and removed the duplicate dynamic save-badge ID.

### AI model

**Change:** the hard-coded preview model was changed to `gemini-3.8-flash`, which Google currently lists among its Gemini API models. The application still uses the legacy `generateContent` request/response shape; confirm that the model and API method remain enabled for the user's API key before relying on AI in production. Google model availability and pricing can change. Reference: https://ai.google.dev/gemini-api/docs/models

## 3. Production risks not resolved by static packaging

1. **Firebase:** no Firebase project/configuration or Firestore security rules were supplied. Cloud sync and shared rooms must remain treated as unavailable until a project is configured and rules are independently reviewed. A room code is not authentication.
2. **Data durability:** documents are stored in browser localStorage. Browser storage can be cleared, is not encrypted by this application, and may hit quota limits. Use the JSON backup/restore function regularly. There is no automatic cross-device backup in the static configuration.
3. **Medical privacy:** this is not a validated clinical record system and is not certified for identifiable patient data. Do not store identifiable patient information without institutional security/privacy approval.
4. **Compatibility:** browser-level testing is still required for editing, paste, table operations, DOCX generation, printing, mobile layout, PWA install, offline reload, PubMed requests, and Gemini API requests.
5. **Deployment:** GitHub Pages has not been enabled or verified. The GitHub connector previously denied write access; the current package is prepared for manual upload.

## 4. Validation performed

- Extracted and syntax-checked each inline JavaScript block with Node.js.
- Syntax-checked `sw.js` with Node.js.
- Parsed `manifest.webmanifest` as JSON.
- Verified the ZIP archive can be opened and all entries pass the ZIP integrity check.
- Checked that persistent Gemini API-key writes are absent from the updated source.
- Static checks only; no end-to-end browser test or live deployment is claimed.

## 5. Deployment contents

Upload the following to the repository root:

- `index.html`
- `manifest.webmanifest`
- `sw.js`
- `icon-192.png`
- `icon-512.png`

Then enable **Settings → Pages → Deploy from a branch → main → /(root)**. See `README-DEPLOY.md` for the step-by-step procedure.
