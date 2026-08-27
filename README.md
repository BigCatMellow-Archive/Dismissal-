# Dismissal

Mobile-first school carpool dismissal prototype designed for a roughly 600-student school.

The operational target is intentionally simple: a staff member should be able to use their assigned screen correctly with essentially no training.

## Current build

- `index.html` — **Dispatcher**: the full active queue, wait timers, automatic attention ordering, and tap-to-open arrival/repeat-call actions.
- `scanner.html` — **Scanner**: a single-purpose “Scan a car” screen for keyboard-style USB/Bluetooth barcode scanners, with camera/manual entry hidden as backup options.
- `runner.html` — **Runner**: a focused work list showing available students plus that runner's own claimed students. Tapping a student reveals only the next relevant action.
- `admin.html` — **Admin**: search-first pickup-group lookup designed not to dump a large roster onto the screen.
- `app.js` — prototype queue/state logic, duplicate protection, progressive modal actions, timers, and role behavior.
- `supabase/schema.sql` — proposed secure production data model for the later real-time backend.
- `docs/PRODUCT_SPEC.md` — workflow, UX rules, scale requirements, roles, duplicate/concurrency behavior, reporting, and production requirements.

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

The prototype contains fictional data only. On the Scanner page, normal testing can be reached through **Can't scan? → Use a demo pass**.

Demo tokens:

- `FAM-101` — two students
- `FAM-202` — one student
- `CARPOOL-303` — two students, including a student also assigned to another pickup group

A hardware scanner that behaves like a keyboard can scan without touching the screen between vehicles. The input is intentionally hidden so the scanner page remains a large, simple ready screen.

## Prototype workflow

1. Open **Scanner** and scan a demo family.
2. Open **Runner**, enter a name/initials once, and tap an available student.
3. Choose **I'm getting them**.
4. Tap that student again and choose **Student is on the way** or **I can't find them**.
5. Open **Dispatcher**. The dispatcher sees the full live queue and can mark **Student is here** or **Call again**.

Within the prototype, tabs/windows in the same browser share state. Separate physical devices do not yet share the queue.

## Important prototype limitation

The current version stores its queue in the browser so the workflow can be tested without creating a real student database. The production step is to replace that storage adapter with an authenticated real-time backend. The proposed database structure is already in `supabase/schema.sql`.

Production also needs atomic runner claims so two devices cannot claim the same student at the same time.

## GitHub Pages

The interface is static and can be served directly by GitHub Pages. In repository **Settings → Pages**, choose a deployment source for the `main` branch. The root page is the Dispatcher view.

## Before real school use

Do not add real student information to this public repository or the browser-storage demo. A production deployment needs authenticated staff access, role-based database rules, HTTPS, revocable opaque barcode tokens, role-locked screens, concurrency-safe claims, and school review of privacy/data-retention requirements.
