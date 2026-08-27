# Dismissal — Google Apps Script + Google Sheets edition

This is the Google Workspace implementation of the Dismissal project. It keeps the same mobile-first workflow as the web prototype, but uses a Google Sheet as the data store and a Google Apps Script web app as the backend/UI.

## Current roster source

For the Nysmith deployment, the existing `Carpool` and `Table1` tabs are the source data.

- `Carpool` is authoritative for students, homerooms, grades, and Carpool IDs.
- `Table1` supplies the human-friendly family/group name for each Carpool ID.
- `Students`, `PickupGroups`, and `PickupGroupStudents` are live normalized views used by the app. Do not manually maintain those three tabs when the live roster link is installed.
- The barcode token is the numeric Carpool ID itself. A scan of that ID resolves to every student assigned to it in `Carpool`.

The live formulas intentionally keep membership in a row-based relationship table, so the system is not limited to the four student columns visible in `Table1`.

Grades are normalized for the operational UI to `Beg`, `PreK`, `K`, `1st`, `2nd`, through `8th`.

If the live formulas are ever overwritten, add `Roster.gs` to the Apps Script project and run `syncCarpoolRoster()` once. The formulas then continue updating automatically when the source tabs change. The server-side directory cache lasts at most about one minute, so roster edits may take a short time to appear in an already-open web app.

## Why this version exists

- no server to install or maintain
- runs in a browser on phones, tablets, Chromebooks, and desktops
- hardware barcode scanners that behave like keyboards work directly on the Scanner screen
- student/pickup data stays in a school-controlled Google Sheet
- runner and dispatcher screens refresh automatically every few seconds
- duplicate scans and runner-claim races are protected on the server with `LockService`
- the operational `Dismissals` sheet stays small; the prior day is automatically moved to `DismissalHistory`

## Files to create in Apps Script

Open the backend Google Sheet, choose **Extensions → Apps Script**, and create these project files from the matching repo files:

- `Code.gs`
- `Roster.gs`
- `Index.html`
- `Styles.html`
- `Client.html`

`Roster.gs` is a maintenance helper; the current backend Sheet has already been linked to the roster. The live app can run without re-running it unless the normalized formulas are damaged or you make a fresh copy of the workbook.

`appsscript.json` is included as a reference manifest. You only need to edit the manifest if you have enabled **Show "appsscript.json" manifest file in editor** in Apps Script project settings.

## First setup

1. From the Google Sheet, open **Extensions → Apps Script**.
2. Add the files above.
3. Save the project.
4. Run `setupDismissalSystem()` once and approve permissions.
5. If this is a fresh workbook containing `Carpool` and `Table1`, run `syncCarpoolRoster()` once.
6. Add staff accounts and roles in `Staff`.
7. Deploy the project as a restricted Google Apps Script web app.

Do not run `seedDemoData()` on a workbook that already contains the real linked roster.

## Internal sheet formats

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

A student can appear in more than one pickup group if the source roster supports an approved alternate arrangement.

### Staff

| Email | Display Name | Roles | Active |
|---|---|---|---|
| person@nysmithschool.com | Jane | runner | TRUE |

Multiple roles are comma-separated, for example `scanner,dispatcher`. `admin` can use every screen.

Supported roles are `scanner`, `runner`, `dispatcher`, and `admin`.

## Web app deployment

In Apps Script choose **Deploy → New deployment → Web app**.

For a school Workspace deployment, restrict access to the school/domain rather than making the app public. This project uses `Session.getActiveUser().getEmail()` to match the signed-in person to the `Staff` sheet.

A practical first deployment for a single Workspace domain is:

- **Who has access:** your Google Workspace domain
- Try **Execute as me** first if all staff are in the same Workspace domain.
- If Workspace policy returns a blank active-user email, deploy **Execute as user accessing the web app**. This changes authorization behavior because the app then runs under each staff member's Google identity.

Do not use an anonymous deployment for student dismissal data.

## Settings

The `Settings` tab includes:

- `Allowed Domain` = `nysmithschool.com`
- warning = 5 minutes
- danger = 10 minutes
- queue polling = 4000 ms

The polling interval should generally stay around 3–6 seconds.

## Daily operation

The first app request on a new school day automatically moves the previous contents of `Dismissals` into `DismissalHistory` and starts a fresh current-day sheet. `DismissalEvents` remains an append-only action log.

## Important security notes

- Do not put real student data in this public GitHub repository.
- Real student data belongs only in the private school Google Sheet.
- Restrict the deployed web app to the school Workspace domain.
- Keep the `Staff` sheet current and disable accounts that no longer need access.
- Review retention expectations for `DismissalHistory` and `DismissalEvents` with the school before long-term use.
