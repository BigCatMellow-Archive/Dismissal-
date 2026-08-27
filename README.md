# Dismissal

Mobile-first school carpool dismissal system designed for a roughly 600-student school.

The operational target is intentionally simple: a staff member should be able to use an assigned screen correctly with essentially no training.

## Current architecture

The production-oriented Google version is now split into three layers:

```text
GitHub Pages
  └─ mobile UI + continuous live camera barcode scanner
          │
          │ secure per-device POST bridge
          ▼
Google Apps Script
  └─ permissions, duplicate protection, queue logic, runner claims
          │
          ▼
Google Sheets
  └─ roster, pickup groups, current queue, history, devices, event log
```

This split is intentional. Apps Script HTML Service runs inside Google's sandboxed iframe, which makes continuous phone-camera scanning unreliable. GitHub Pages runs as a normal top-level HTTPS page, so the phone can use a persistent camera viewfinder like a QR scanner while Sheets remains the school-controlled database.

## Root GitHub Pages app

- `index.html` — unified Dispatcher / Scanner / Runner / Admin application.
- `styles.css` — mobile-first UI.
- `app.js` — live queue UI, continuous camera scanning, hardware-scanner support, device authentication, and the Apps Script POST bridge.
- `scanner.html`, `runner.html`, and `admin.html` — older prototype pages retained for reference; normal use starts at the root `index.html`.

The root app does **not** contain student data or device credentials. Real data is requested from Apps Script only after a valid private device key is supplied.

## Google Apps Script backend

`google-apps-script/` contains the Sheet-backed server implementation:

- `Code.gs` — dismissal state machine, Sheets access, roles, queue logic, locking, history.
- `Roster.gs` — links the school's `Carpool` and `Table1` source tabs to the normalized internal roster tables.
- `Api.gs` — secure POST bridge used by GitHub Pages plus device-key provisioning.
- `Index.html`, `Styles.html`, `Client.html` — earlier Apps Script-hosted UI retained as a fallback/reference.

### Device security

The private Google Sheet contains a `Devices` tab:

| Device ID | Display Name | Roles | Access Key | Active | Notes | Last Seen | Created At |
|---|---|---|---|---|---|---|---|

Each phone/tablet gets a long random Access Key. The key is stored only in the private Sheet and that device's browser storage. It is never committed to GitHub.

Supported roles:

- `scanner`
- `runner`
- `dispatcher`
- `admin`

An `admin` device can switch among all screens.

## First live setup

1. Open the backend Google Sheet and **Extensions → Apps Script**.
2. Add a new **Script** file named `Api` and paste `google-apps-script/Api.gs` into it.
3. Make sure `Code.gs` and `Roster.gs` are also current, then save.
4. Run `setupDismissalSystem()` once if this project has not already been configured.
5. Run `setupDeviceAccess()` once. This creates/repairs the `Devices` tab.
6. Reload the Google Sheet. A **Dismissal** menu appears.
7. Choose **Dismissal → Create device access**, enter a device/staff name, and assign its role(s).
8. Copy the generated **Access Key** from the new row in `Devices`.
9. Deploy/update the Apps Script project as a **Web app**:
   - **Execute as:** Me
   - **Who has access:** Anyone
   - The public web endpoint contains no useful data without a valid private device key.
10. If this creates a different `/exec` URL, update `API_URL` near the top of root `app.js` to that URL.
11. Open the GitHub Pages site on the phone. On first launch, paste the device Access Key.
12. Open **Scanner → Start live camera** and allow camera access for the GitHub Pages site.

After the first setup, the device remembers its key until **Menu → Disconnect this device** is chosen or browser storage is cleared.

## Live camera behavior

The Scanner view keeps the rear camera active and recognizes common formats including QR, Code 39, Code 128, Codabar, EAN, and UPC. A decoded Carpool ID is submitted immediately and the camera remains active for the next vehicle.

The physical HID barcode scanner still works without touching the screen. Manual Carpool ID entry remains a backup.

## Roster source

The private Sheet's `Carpool` tab is the authoritative student/membership source. `Table1` supplies the cleaner family/pickup display name. The normalized tabs used by the application are:

- `Students`
- `PickupGroups`
- `PickupGroupStudents`

`Roster.gs` contains `syncCarpoolRoster()` to rebuild those links if necessary.

## UX contract

Operational screens follow strict rules:

- mobile first
- one obvious job per screen
- large touch targets
- no normal-operation typing
- uncommon choices hidden
- tap a student to reveal only contextually valid actions
- automatic exception ordering rather than filters
- operational users never browse the full 600-student roster
- plain-language actions rather than internal status terminology
- mistakes are recoverable

See `docs/PRODUCT_SPEC.md` for the full workflow rules.

## Privacy

Do not put real student information or device access keys in this public repository. Real roster and dismissal data belongs only in the private school Google Sheet. Disable a row in `Devices` immediately if a phone/tablet is lost or should no longer have access.
