# Bridge reconciliation — 2026-09-10

## Verdict

A concrete protocol mismatch exists between the Apps Script `Api.gs` supplied from the working Sheet project and the current GitHub Pages client.

The supplied Apps Script response path is:

```text
Apps Script doPost
  -> apiBridgeOutput_()
  -> window.name = serialized response
  -> redirect hidden iframe to GitHub Pages /Dismissal-/bridge.html
  -> bridge.html reads window.name
  -> bridge.html posts response to window.top
```

Because `bridge.html` runs on `https://bigcatmellow-archive.github.io`, that final `postMessage` has the GitHub Pages origin.

The current root `app.js`, however, accepts response messages only from `script.google.com` or `*.googleusercontent.com`. A valid response arriving through `bridge.html` is therefore ignored before the pending request can resolve.

## Current Sheet evidence

The exact Google Sheet currently named `Dismissal System - Google Sheets Backend` was inspected on 2026-09-10.

Relevant current state:

- expected operational tabs exist, including `Settings` and `Devices`;
- `Settings -> Allowed Frontend Origin` is `https://bigcatmellow-archive.github.io`;
- the configured test device is active and has scanner, runner, dispatcher, and admin roles;
- its `Last Seen` value is still dated 2026-08-27.

The stale `Last Seen` means the earlier August observation that valid requests reached the backend must not be treated as proof about today's deployment. Current request-path success still needs to be re-verified.

No Access Key was copied into this repository or this note.

## Repository divergence

Current GitHub `google-apps-script/Api.gs` uses a different response implementation:

```js
window.top.postMessage(response, allowedOrigin)
```

The supplied Apps Script code instead uses the `window.name` + `bridge.html` redirect flow described above.

Therefore there are two response protocols in circulation. The deployed web-app version cannot be established from the Sheet contents alone, because Apps Script deployment versions are separate from Sheet cell data.

## Repair in this branch

This branch adds `bridge-compat.js` and loads it before `app.js`.

The compatibility layer:

1. ignores all messages not coming from the exact current GitHub Pages origin;
2. requires a response object containing a `requestId`;
3. requires a currently present hidden API iframe whose generated name corresponds to that `requestId`;
4. relays the validated bridge response into the existing `app.js` response handler;
5. leaves device-key validation, roles, queue rules, scan rules, and Sheet data unchanged.

This makes the browser compatible with the supplied redirect bridge while preserving compatibility with the current direct-Google-message path already accepted by `app.js`.

## Verification gate

After this branch is merged and GitHub Pages has the new client files, perform one valid bootstrap test using the existing device Access Key.

Record both sides separately:

### Request path

PASS if `Devices -> Last Seen` changes to the current test time.

FAIL if `Last Seen` remains unchanged. If this fails, stop debugging `postMessage`; the request is not reaching/validating at the intended Apps Script deployment. Check the `/exec` URL and Apps Script deployment version/access settings.

### Response path

PASS if the GitHub app receives the matching response and opens the requested screen without the 20/25 second timeout.

If `Last Seen` updates but the browser still times out, the remaining defect is specifically in the response/redirect path.

## Authority / safety

Do not remove `apiRequireDevice_()` as a connectivity workaround. The `/exec` web app is intended to be reachable by `Anyone`; the private per-device Access Key is the authorization boundary protecting real roster and dismissal actions.

The separate browser-only `?demo=1` work remains the appropriate path for a no-credential presentation/demo while production connectivity is being repaired.
