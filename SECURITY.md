# Security and data-handling notes

- Imported and restored document HTML is sanitized before being rendered. Scripts, embedded active content, event-handler attributes, and unsafe URL schemes are removed.
- Document content is still user-authored rich HTML. Treat files and backups as sensitive user data.
- Local browser storage is not encrypted by this application. Anyone with access to the same browser profile may be able to access documents.
- Firebase sync is inactive unless a valid Firebase configuration is deliberately supplied. If enabled, Firestore security rules must be reviewed and tested before real use. The shared-room collection is especially sensitive: a room code is not authentication.
- Never publish a privileged API key in a static website. The optional Gemini key is entered by the end user and held in memory only, but can still be inspected by that user and is transmitted to Google's API.
- Do not use this app to store identifiable patient information or medical records without a formal institutional security/privacy review.
