(() => {
  'use strict';

  // Compatibility for the redirect bridge used by some deployed Apps Script
  // versions. bridge.html runs on the GitHub Pages origin, while app.js
  // historically accepted only Google-origin postMessage responses.
  //
  // Relay only responses that:
  //   1. come from this exact GitHub Pages origin,
  //   2. contain a requestId, and
  //   3. correspond to a currently pending hidden API iframe.
  //
  // app.js still performs the authoritative pending-request lookup before it
  // resolves anything. Production device-key authentication is unchanged.
  window.addEventListener('message', event => {
    if (event.origin !== window.location.origin) return;

    const msg = event.data;
    if (!msg || typeof msg !== 'object' || !msg.requestId) return;

    const expectedFrameName = `dismissal_api_${String(msg.requestId).replace(/[^a-zA-Z0-9_]/g, '')}`;
    const hasPendingFrame = Array.from(document.querySelectorAll('iframe')).some(frame => frame.name === expectedFrameName);
    if (!hasPendingFrame) return;

    window.dispatchEvent(new MessageEvent('message', {
      data: msg,
      origin: 'https://script.google.com',
      source: event.source
    }));
  });
})();
