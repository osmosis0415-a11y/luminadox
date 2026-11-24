# Lumina Docs production status

## Current architecture

- Static GitHub Pages application with no build step.
- IndexedDB is the primary document store; localStorage is retained only as a migration and compatibility fallback.
- Offline cloud operations are coalesced per document in a durable IndexedDB outbox.
- Optional Firebase sync loads dynamically only when a runtime Firebase configuration exists.
- Shared rooms use isolated Firestore subcollections. Deletions are represented by timestamped tombstones so they propagate across clients.
- Imported, restored, and cloud-synced document HTML passes through an allowlist sanitizer before entering the editor.
- Accessibility enhancements provide labels, visible focus, a skip link, dialog semantics and focus management, touch targets, mobile reflow, reduced-motion support, and forced-color support.

## Validation

- Unit tests cover newest-write merging, tombstones, stable outbox keys, and localStorage fallback.
- Browser tests cover IndexedDB round trips, outbox coalescing, delete supersession, acknowledgement, and standalone-file packaging.
- GitHub Actions runs unit and syntax validation on main, development branches, and pull requests.
- Manual browser smoke testing covers application startup, document rendering, icons, and responsive layout.

## Remaining deployment requirements

- GitHub Pages works without Firebase in local-first mode.
- Cloud sync remains unavailable until a Firebase project, authentication policy, and reviewed Firestore security rules are supplied at runtime.
- A sync-room code is a collaboration locator, not a substitute for authorization.
- Gemini AI requires a user-supplied restricted API key and depends on the configured Google model remaining available.
- Lumina Docs is not a certified clinical-record system. Do not store identifiable patient information without institutional approval.

## Production URL

https://osmosis0415-a11y.github.io/luminadox/
