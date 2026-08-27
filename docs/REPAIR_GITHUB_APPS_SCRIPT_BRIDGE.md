# Repair Record: GitHub Pages → Apps Script response bridge

- Severity: `BLOCKING`
- Owner: operator / implementation agent
- Trigger and evidence: GitHub diagnostics can POST to the current Apps Script `/exec`; both top-level and hidden-iframe tests update `Devices → Last Seen`, but the hidden-iframe test times out waiting for the response message.

## Definition of DONE

The GitHub Pages frontend can make a `bootstrap` request through the hidden form/iframe transport and receive the matching response in the parent GitHub page. The same transport must then support queue, scan, update, and search calls without exposing student data or device credentials in the public repository.

Pass/fail proof for the current repair:

1. `diagnostics.html` Test 2 returns a response with the same `requestId` instead of timing out.
2. `Devices → Last Seen` updates for the request.
3. The response reports `ok: true` for a valid device key.
4. No additional callback service, duplicate data store, or public credential is introduced.

## Verified reality

| Claim | Status | Evidence |
| --- | --- | --- |
| The new Apps Script deployment contains a working `doPost(e)` | VERIFIED | Top-level POST no longer reports `Script function not found: doPost`. |
| GitHub can POST to Apps Script | VERIFIED | Top-level diagnostic reaches the backend. |
| Hidden-iframe POST also reaches Apps Script | VERIFIED | `Devices → Last Seen` changes after Test 2 even though Test 2 times out. |
| Device-key validation reaches the private Sheet | VERIFIED | `Last Seen` is written by `apiRequireDevice_()` after matching the key. |
| The failure is currently on the response path, not the request path | VERIFIED | Backend side effect occurs but GitHub receives no matching `postMessage`. |
| `Api.gs` currently sends the response with `parent.postMessage(...)` | VERIFIED | `apiBridgeOutput_()` uses `parent.postMessage(payload, origin)`. |
| Apps Script `HtmlOutput` client code runs in Google's HTML Service iframe sandbox | VERIFIED | Google Apps Script HTML Service documentation. |
| `XFrameOptionsMode.ALLOWALL` permits framing but does not remove the HTML Service sandbox layer | VERIFIED | Google `HtmlOutput` / `XFrameOptionsMode` documentation. |

Primary documentation:

- https://developers.google.com/apps-script/guides/html/restrictions
- https://developers.google.com/apps-script/reference/html/html-output
- https://developers.google.com/apps-script/reference/html/x-frame-options-mode
- https://developers.google.com/apps-script/guides/web

## Finding

The implementation assumed that the Apps Script response document's `parent` is the GitHub iframe owner. That assumption is not established and is inconsistent with Google's documented HTML Service iframe sandbox.

The observed behavior is compatible with this topology:

```text
GitHub page (top)
  └─ hidden iframe submitted to Apps Script
       └─ Google HTML Service sandbox/wrapper
            └─ response script
```

If so, `parent.postMessage(...)` posts to Google's immediate wrapper rather than the GitHub page. `postMessage` does not bubble upward, so the GitHub listener never sees it.

## Smallest repair hypothesis

Change only the response target from:

```js
parent.postMessage(payload, origin);
```

to:

```js
window.top.postMessage(payload, origin);
```

Cross-origin access does not permit reading `window.top`, but `postMessage` is specifically designed for cross-origin messaging when a target origin is supplied.

This is a **hypothesis until Test 2 passes**. Do not adopt a new callback/redirect architecture before falsifying it.

## Change or proposal

First-wave experiment:

1. In `google-apps-script/Api.gs`, change only `parent.postMessage` to `window.top.postMessage` inside `apiBridgeOutput_()`.
2. Make the same one-line change in the actual Apps Script editor.
3. Save and update the current web-app deployment to a new version while preserving its `/exec` URL.
4. Run `diagnostics.html` Test 2 with the valid device key.
5. Record the result.

No other transport, authentication, camera, queue, or roster code should change in this experiment.

## Verification and rollback

- Verification: Test 2 must receive the matching response instead of timing out; `Last Seen` must still update.
- Rollback: change `window.top.postMessage` back to `parent.postMessage` and redeploy the prior Apps Script version.

## If the hypothesis fails

Do not immediately redesign the architecture. Gather the next missing evidence:

1. Instrument the generated Apps Script response to attempt messages to both `parent` and `top` with distinguishable diagnostic markers.
2. Log `event.origin`, `event.source`, and received marker on the GitHub diagnostics page.
3. Inspect whether the response document executes at all inside the hidden iframe.
4. Only after those observations decide whether a same-origin callback bridge, OAuth/API executable, or different backend transport is warranted.

## Deferred / not yet approved

`bridge.html` was created during an earlier speculative callback approach. It is **not part of the accepted architecture** and should not be wired into production unless evidence later requires that design. Removal can be handled after the response-path repair is resolved.

## Prevention

Once repaired, keep `diagnostics.html` as a regression check for both directions:

- request reached Apps Script (`Last Seen` changes), and
- response reached GitHub (matching `requestId` received).

A future change to deployment, iframe transport, Google authentication, or response bridging should not be considered complete unless both checks pass.
