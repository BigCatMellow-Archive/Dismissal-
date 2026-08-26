# Dismissal

Mobile-first school carpool dismissal prototype.

## Current build

- `index.html` — dispatcher dashboard with live queue, timers, warning thresholds, repeat call, and completion actions.
- `scanner.html` — family/pickup-group barcode entry optimized for keyboard-style USB/Bluetooth scanners, plus optional camera QR scanning.
- `runner.html` — staff queue with claim, on-the-way, cannot-find, and complete actions.
- `admin.html` — fictional pickup groups and their associated students for testing the relationship model.
- `app.js` — prototype queue/state logic.
- `supabase/schema.sql` — proposed secure production data model for the later real-time backend.
- `docs/PRODUCT_SPEC.md` — workflow, role definitions, duplicate handling, timing, reporting, and production requirements.

## Test codes

The prototype contains fictional data only. On the Scanner page, test with:

- `FAM-101`
- `FAM-202`
- `CARPOOL-303`

A hardware scanner that behaves like a keyboard can scan directly into the barcode field. Typing a code and pressing Enter has the same effect.

## Important prototype limitation

The current version stores its queue in the browser so the workflow can be tested without creating a real student database. Tabs/windows in the same browser can react to the same state, but separate phones/computers do **not** yet share the queue.

The production step is to replace the browser-storage adapter with an authenticated real-time backend. The proposed database structure is already in `supabase/schema.sql`.

## GitHub Pages

The interface is static and can be served directly by GitHub Pages. In repository **Settings → Pages**, choose a deployment source for the `main` branch. The root page is the Dispatcher view.

## Before real school use

Do not add real student information to this public repository or the browser-storage demo. A production deployment needs authenticated staff access, role-based database rules, HTTPS, revocable opaque barcode tokens, and school review of privacy/data-retention requirements.
