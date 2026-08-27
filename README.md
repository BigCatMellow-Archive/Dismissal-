# Dismissal

Mobile-first school carpool dismissal prototype designed for a roughly 600-student school.

The operational target is intentionally simple: a staff member should be able to use their assigned screen correctly with essentially no training.

## Current build

- `index.html` — **Dispatcher**: the full active queue, wait timers, automatic attention ordering, and tap-to-open arrival/repeat-call actions.
- `scanner.html` — **Scanner**: a single-purpose “Scan a car” screen for keyboard-style USB/Bluetooth barcode scanners, with camera/manual entry hidden as backup options.
- `runner.html` — **Runner**: a focused work list showing available students plus that runner's own claimed students. Tapping a student reveals only the next relevant action.
- `admin.html` — **Admin**: search-first pickup-group lookup designed not to dump a large roster onto the screen.
- `app.js` — prototype queue/state logic, duplicate protection, progressive modal actions, timers, and role behavior.
- `google-apps-script/` — **Google Workspace edition**: Google Sheets data store + Apps Script web app for shared use across separate devices.
- `supabase/schema.sql` — alternative secure production data model for a true real-time database.
- `docs/PRODUCT_SPEC.md` — workflow, UX rules, scale requirements, roles, duplicate/concurrency behavior, reporting, and production requirements.

## Google Apps Script + Sheets edition

The `google-apps-script/` folder is a separate working implementation intended for a school Google Workspace environment. It keeps the same Scanner, Runner, Dispatcher, and Admin workflow while replacing browser-only storage with a shared Google Sheet.

It includes:

- automatic Sheet/tab setup
- school Google-account staff roles
- family/pickup-group barcode lookup
- duplicate-scan protection
- concurrency-safe runner claims using Apps Script `LockService`
- shared Runner/Dispatcher queues refreshed every few seconds
- search-first Admin directory
- current-day dismissal storage plus automatic prior-day history archiving
- append-only dismissal event logging
- fictional demo data for safe testing

See `google-apps-script/README.md` for the exact setup and deployment steps.

## UX contract

Operational screens follow a few strict rules:

- mobile first
- one obvious job per screen
- large touch targets
- no normal-operation typing
- no row full of buttons
- tap a student to reveal only contextually valid actions
- backup/setup choices stay behind modals or the menu
- exception ordering happens automatically instead of through filters
- operational users never browse the full 600-student roster
- plain-language actions instead of internal status terminology

See `docs/PRODUCT_SPEC.md` for the full rules.

## Test codes

The prototypes contain fictional data only.

Demo tokens:

- `FAM-101` — two students
- `FAM-202` — one student
- `CARPOOL-303` — two students, including a student also assigned to another pickup group

In the static GitHub Pages prototype, use **Can't scan? → Use a demo pass**. In the Google edition, run `seedDemoData()` once and scan the same codes.

A hardware scanner that behaves like a keyboard can scan without touching the screen between vehicles.

## Static prototype workflow

1. Open **Scanner** and scan a demo family.
2. Open **Runner**, enter a name/initials once, and tap an available student.
3. Choose **I'm getting them**.
4. Tap that student again and choose **Student is on the way** or **I can't find them**.
5. Open **Dispatcher**. The dispatcher sees the full live queue and can mark **Student is here** or **Call again**.

Within the static prototype, tabs/windows in the same browser share state. Separate physical devices do not share that browser queue.

The Google Apps Script edition is the version in this repository intended to test the same workflow across separate devices without adding an external database service.

## GitHub Pages

The root interface is static and can be served directly by GitHub Pages. In repository **Settings → Pages**, choose a deployment source for the `main` branch. The root page is the Dispatcher view.

The Google Apps Script edition is deployed from Apps Script, not GitHub Pages.

## Before real school use

Do not add real student information to this public repository or the browser-storage demo. Real roster data for the Google edition belongs only in the private school Google Sheet. Restrict the Apps Script deployment to the school Workspace domain, keep staff roles current, use revocable opaque barcode tokens, and review privacy/data-retention requirements with the school before production use.
