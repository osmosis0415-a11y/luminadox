# Lumina Docs — GitHub Pages

Production: https://osmosis0415-a11y.github.io/luminadox/

## Deployment

GitHub Pages publishes the repository root from `main`. A push to `main` triggers the Pages rebuild. Keep the complete repository contents together, including `index.html`, the accessibility and storage modules, manifest, service worker, and PNG icons.

## Operating notes

- Documents are stored primarily in IndexedDB in the current browser. localStorage is used only for migration and compatibility fallback.
- Use **Docs → Backup/Restore** regularly. Browser storage is not a substitute for an external backup.
- Firebase cloud sync is optional and requires runtime Firebase configuration, authentication policy, and reviewed Firestore security rules. The static GitHub Pages deployment otherwise operates in local-first mode.
- Gemini AI requires a user-supplied restricted API key. It remains in memory for the current tab and is cleared on reload or close.
- Lucide, JSZip, Google Fonts, Firebase, PubMed, and Gemini depend on external services. The service worker caches the local application shell and selected CDN resources for repeat visits.
- Lumina Docs is not a certified clinical-record system. Do not store identifiable patient information without institutional approval.

## Current production capabilities

- IndexedDB-first persistence with migration from legacy localStorage data.
- Coalesced durable sync outbox: one pending operation per document.
- Timestamped deletion tombstones and newest-write conflict handling.
- Isolated Firestore subcollections for shared rooms.
- Firebase libraries load dynamically only when cloud configuration exists.
- Self-contained downloaded HTML with Lumina's local accessibility and storage modules embedded.
- Responsive accessibility, dialog focus management, reduced-motion support, and visible keyboard focus.
- Content Security Policy and pinned Lucide version.
- GitHub Actions validation for unit and syntax checks.

## Validation

Run `npm test` and `npm run check`. Browser harnesses in `tests/` validate IndexedDB/outbox behavior and standalone packaging. Production deployment is complete only after the public HTML, assets, and service-worker version are verified at the URL above.
