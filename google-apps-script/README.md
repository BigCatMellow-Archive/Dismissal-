# Dismissal — Google Apps Script + Google Sheets edition

This is the Google Workspace implementation of the Dismissal project. It keeps the same mobile-first workflow as the web prototype, but uses a Google Sheet as the data store and a Google Apps Script web app as the backend/UI.

## Why this version exists

- no server to install or maintain
- runs in a browser on phones, tablets, Chromebooks, and desktops
- hardware barcode scanners that behave like keyboards work directly on the Scanner screen
- student/pickup data stays in a school-controlled Google Sheet
- runner and dispatcher screens refresh automatically every few seconds
- duplicate scans and runner-claim races are protected on the server with `LockService`
- the operational `Dismissals` sheet stays small; the prior day is automatically moved to `DismissalHistory`

## Files to create in Apps Script

Create a Google Sheet, open **Extensions → Apps Script**, then create these project files and paste in the matching repo files:

- `Code.gs`
- `Index.html`
- `Styles.html`
- `Client.html`

`appsscript.json` is included as a reference manifest. You only need to edit the manifest if you have enabled **Show "appsscript.json" manifest file in editor** in Apps Script project settings.

## First setup

1. From the new Google Sheet, open **Extensions → Apps Script**.
2. Add the four files above.
3. Save the project.
4. Run `setupDismissalSystem()` once from the Apps Script editor and approve the requested Google permissions.
5. The setup function creates these tabs:
   - `Students`
   - `PickupGroups`
   - `PickupGroupStudents`
   - `Staff`
   - `Dismissals`
   - `DismissalHistory`
   - `DismissalEvents`
   - `Settings`
6. The Google account that runs setup is added to `Staff` as an `admin` when Apps Script can identify that account.
7. For a safe test, run `seedDemoData()` and scan `FAM-101`, `FAM-202`, or `CARPOOL-303`.

## Sheet formats

### Students

| Student ID | Display Name | Grade | Homeroom | Active |
|---|---|---|---|---|
| 12345 | Student Name | 3A | Jones / Smith | TRUE |

`Student ID` must be unique.

### PickupGroups

| Pickup Group ID | Display Name | Barcode Token | Type | Active |
|---|---|---|---|---|
| F-123 | Smith Family | 482019 | family | TRUE |

The barcode should contain the opaque `Barcode Token`, not the student's name.

### PickupGroupStudents

| Pickup Group ID | Student ID | Active |
|---|---|---|
| F-123 | 12345 | TRUE |

A student can appear in more than one pickup group, which allows approved carpools or alternate pickup arrangements.

### Staff

| Email | Display Name | Roles | Active |
|---|---|---|---|
| person@nysmithschool.com | Jane | runner | TRUE |

Multiple roles are comma-separated, for example `scanner,dispatcher`. `admin` can use every screen.

Supported roles:

- `scanner`
- `runner`
- `dispatcher`
- `admin`

## Web app deployment

In Apps Script choose **Deploy → New deployment → Web app**.

For a school Workspace deployment, restrict access to the school/domain rather than making the app public. This project uses `Session.getActiveUser().getEmail()` to match the signed-in person to the `Staff` sheet.

A practical first deployment for a single Workspace domain is:

- **Who has access:** your Google Workspace domain
- Try **Execute as me** first if all staff are in the same Workspace domain. Google notes that active-user email is generally available to users in the same Workspace domain even though it can be blank in some `execute as me` contexts.
- If your Workspace policy still returns a blank active-user email, deploy **Execute as user accessing the web app**. Be aware that this changes authorization behavior because the app then runs under each staff member's Google identity.

Do not use an anonymous deployment for student dismissal data.

## Settings

The `Settings` tab is created automatically. Defaults:

- `Allowed Domain` = `nysmithschool.com`
- warning = 5 minutes
- danger = 10 minutes
- queue polling = 4000 ms

The polling interval should generally stay around 3–6 seconds. The app caches the active queue briefly so multiple devices do not each force a complete Sheet read every second.

## Daily operation

The first app request on a new school day automatically moves the previous contents of `Dismissals` into `DismissalHistory` and starts a fresh current-day sheet. `DismissalEvents` remains an append-only action log.

## Important security notes

- Do not put real student data in this public GitHub repository.
- Real student data belongs only in the private school Google Sheet.
- Restrict the deployed web app to the school Workspace domain.
- Keep the `Staff` sheet current and disable accounts that no longer need access.
- Barcode tokens should be opaque and replaceable.
- Review retention expectations for `DismissalHistory` and `DismissalEvents` with the school before long-term use.
