(() => {
  'use strict';

  // Demo entry for phones: let a tester reach the real camera scanner without
  // provisioning a Device Access Key. The resulting scanner runs in ?demo=1,
  // so scans stay local to that browser and never call the live Apps Script API.
  function installDemoEntry() {
    if (new URLSearchParams(location.search).get('demo') === '1') return;

    const form = document.getElementById('deviceSetupForm');
    if (!form || document.getElementById('openDemoScanner')) return;

    const wrap = document.createElement('div');
    wrap.className = 'demo-entry';
    wrap.innerHTML = `
      <button class="big-button" id="openDemoScanner" type="button">Open camera scanner — no login</button>
      <p class="setup-note">Demo mode uses this phone's real camera and accepts real barcodes, but keeps all scan results on this device instead of sending them to the live school Sheet.</p>
      <div class="setup-note" style="margin-top:1rem"><strong>Live system</strong></div>`;

    form.parentNode.insertBefore(wrap, form);

    document.getElementById('openDemoScanner').addEventListener('click', () => {
      const url = new URL(location.href);
      url.search = '';
      url.searchParams.set('demo', '1');
      url.searchParams.set('view', 'scanner');
      url.hash = '';
      location.assign(url.toString());
    });
  }

  const observer = new MutationObserver(installDemoEntry);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', installDemoEntry);
  installDemoEntry();
})();
