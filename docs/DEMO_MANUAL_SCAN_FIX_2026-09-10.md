# Demo manual scan fix — 2026-09-10

## Problem

A manually entered barcode in `?demo=1` could appear to do nothing. The original demo seeded active dismissals using the same students assigned to demo pickup codes `101`, `202`, and `303`. Duplicate protection then treated some scans as already active rather than creating a visibly new queue entry. The demo also rejected any code other than the three hard-coded examples.

## Repair

- demo seed rows use separate fictional students that do not overlap scan-test pickup groups;
- `101`, `202`, and `303` therefore create visibly new queue entries on first scan;
- any other non-empty manually entered barcode creates a temporary fictional demo pickup/student so a presenter can type or scan an arbitrary barcode and see the end-to-end UI behavior;
- duplicate protection is retained when the same demo barcode is scanned again;
- demo session storage is versioned forward so old browser state does not mask the repair;
- production Apps Script, real Sheets data, and device-key authentication are unchanged.

## Expected test

1. Open `?demo=1&view=scanner`.
2. Choose **Type a pickup code**.
3. Enter `101` or any other non-empty barcode value.
4. A success toast should name the fictional pickup/student.
5. Switch to Dispatcher or Runner.
6. The newly called fictional student should appear in the queue.

Demo data remains browser-local and must never appear in the real Google Sheet.