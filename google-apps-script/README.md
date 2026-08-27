# Dismissal — Google Apps Script + Google Sheets backend

This folder is now primarily the **backend** for the GitHub Pages dismissal app.

The mobile UI and continuous phone-camera scanner run from GitHub Pages. Apps Script keeps the server-side dismissal rules, device permissions, locking, queue state, and Google Sheets access.

## Current roster source

For the Nysmith deployment, the existing `Carpool` and `Table1` tabs are the source data.

- `Carpool` is authoritative for students, homerooms, grades, and Carpool IDs.
- `Table1` supplies the human-friendly family/group name for each Carpool ID.
- `Students`, `PickupGroups`, and `PickupGroupStudents` are normalized views used by the app.
- The barcode token is the numeric Carpool ID itself.

Grades are normalized to `Beg`, `PreK`, `K`, `1st` through `8th`.

If the roster links are overwritten, run `syncCarpoolRoster()` from `Roster.gs`.

## Files to add to Apps Script

Open the backend Google Sheet and choose **Extensions → Apps Script**.

The current project should contain:

- `Code.gs` — core dismissal logic
- `Roster.gs` — roster synchronization
- `Api.gs` — GitHub Pages POST bridge and device provisioning
- `Index.html`, `Styles.html`, `Client.html` — older Apps Script-hosted UI retained as a fallback/reference

The live-camera production path uses the root GitHub Pages app rather than the Apps Script HTML interface.

## Device access

The backend Sheet contains a private `Devices` tab:

| Device ID | Display Name | Roles | Access Key | Active | Notes | Last Seen | Created At |
|---|---|---|---|---|---|---|---|

Each phone/tablet has its own long random Access Key. The key stays in the private Sheet and that device's browser storage; it is never committed to GitHub.

Supported roles:

- `scanner`
- `runner`
- `dispatcher`
- `admin`

`admin` can switch between every screen.

### Create a device key

1. Add/save `Api.gs` in Apps Script.
2. Run `setupDeviceAccess()` once.
3. Reload the Google Sheet.
4. Use **Dismissal → Create device access**.
5. Enter a device/staff name and one or more roles.
6. Copy the Access Key from the new row in `Devices`.
7. Open the GitHub Pages app on that device and paste the key once.

Disable the `Active` value in `Devices` to revoke a lost or retired phone/tablet immediately.

## API deployment

The GitHub frontend communicates with Apps Script by submitting a normal HTTPS POST into a hidden iframe. Apps Script answers with `postMessage`, so the app does not rely on browser CORS exceptions.

Deploy/update Apps Script as a **Web app** with:

- **Execute as:** Me
- **Who has access:** Anyone

This deployment mode is intentional. The endpoint itself does not grant access to student data: every API request must contain a valid long device key from the private `Devices` sheet. Requests without a valid active key are rejected.

The allowed frontend origin is stored in `Settings` as:

`Allowed Frontend Origin = https://bigcatmellow-archive.github.io`

If the Apps Script `/exec` URL changes, update `API_URL` near the top of the repository root `app.js` and redeploy GitHub Pages.

## First backend setup

1. Run `setupDismissalSystem()` once if the workbook has not already been configured.
2. Run `syncCarpoolRoster()` if this is a fresh workbook or the normalized roster formulas need repair.
3. Run `setupDeviceAccess()` once.
4. Save and deploy the current Apps Script version.
5. Create at least one device access row.

Do **not** run `seedDemoData()` on the workbook containing the real linked roster.

## Internal Sheet formats

### Students

| Student ID | Display Name | Grade | Homeroom | Active |
|---|---|---|---|---|
| generated ID | Student Name | 3rd | 3A | TRUE |

### PickupGroups

| Pickup Group ID | Display Name | Barcode Token | Type | Active |
|---|---|---|---|---|
| PG-34499 | Family name | 34499 | family | TRUE |

### PickupGroupStudents

| Pickup Group ID | Student ID | Active |
|---|---|---|
| PG-34499 | generated student ID | TRUE |

### Settings

Important values include:

- `Allowed Domain = nysmithschool.com` — retained for the older Workspace-account UI
- `Allowed Frontend Origin = https://bigcatmellow-archive.github.io`
- warning = 5 minutes
- danger = 10 minutes
- queue polling = 4000 ms

## Daily operation

The first request on a new school day moves the previous contents of `Dismissals` to `DismissalHistory` and starts a fresh current-day queue. `DismissalEvents` remains the append-only action log.

## Security notes

- Never put real student data or device keys in the public GitHub repository.
- Real roster and dismissal data belongs only in the private school Google Sheet.
- Use a separate device key for each phone/tablet or staff member where practical.
- Disable device access immediately when it is no longer needed.
- Keep the backend Sheet private; normal dismissal users interact with GitHub Pages rather than receiving direct Sheet access.
