# Browser-only demo mode

This mode exists only for demonstrations and UI testing while the GitHub Pages → Apps Script response bridge is being repaired.

## Start it

Open the normal GitHub Pages application and append:

```text
?demo=1
```

You can also choose a starting screen:

```text
?demo=1&view=scanner
?demo=1&view=runner
?demo=1&view=dispatcher
?demo=1&view=admin
```

## Demo pickup codes

Use these fictional codes with manual entry, a hardware scanner, or a QR/barcode containing the code:

- `101` — Family 101
- `202` — Family 202
- `303` — Tuesday Carpool

The demo starts with several fictional students already in the queue so Dispatcher and Runner views are immediately populated.

## What demo mode does

- skips the Device Access Key screen;
- never submits requests to Apps Script;
- simulates `bootstrap`, queue reads, scans, status updates, admin search, and reset locally in the browser;
- keeps demo state only for the current browser tab/session;
- uses fictional names and pickup groups;
- gives the demo identity access to all four screens.

The normal application is unchanged when `demo=1` is absent.

## Security boundary

Do not replace the production device authentication with this demo behavior. The deployed Apps Script web app is intentionally reachable by `Anyone`, so removing `apiRequireDevice_()` from the live backend would expose school data and dismissal actions to unauthenticated visitors.

This demo mode avoids that risk by intercepting the application requests in the browser before they leave the page. No real Sheet data is read or changed.

## Current live-bridge issue

The existing repair record shows that requests already reach Apps Script and valid Access Keys update `Devices → Last Seen`; the unresolved failure is the response message returning from Apps Script to the GitHub Pages parent page. Removing device authentication would therefore not repair the current timeout.

See `docs/REPAIR_GITHUB_APPS_SCRIPT_BRIDGE.md` for the repair record.
