(() => {
  'use strict';

  const API_URL = 'https://script.google.com/macros/s/AKfycbyZQkRRZC_coeL2fw3RJIDlMyzdPWtXIqJfYtSino_NFvNo-dp46LdPoP5S4-Zl6-fM4A/exec';
  const DEVICE_KEY_STORAGE = 'dismissal-device-key-v1';
  const GOOGLE_MESSAGE_ORIGINS = new Set([
    'https://script.google.com',
    'https://script.googleusercontent.com'
  ]);

  const S = {
    boot: null,
    view: '',
    user: null,
    allowedViews: [],
    settings: {},
    queueVersion: '',
    pollTimer: null,
    timerTick: null,
    toastTimer: null,
    scanQueue: [],
    scanning: false,
    qr: null,
    cameraStarting: false,
    cameraRunning: false,
    lastCameraCode: '',
    lastCameraAt: 0,
    adminDebounce: null,
    pending: new Map()
  };

  const $ = sel => document.querySelector(sel);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  function requestId() {
    if (window.crypto?.randomUUID) return crypto.randomUUID();
    return `r-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function deviceKey() {
    return localStorage.getItem(DEVICE_KEY_STORAGE) || '';
  }

  function consumeKeyFromHash() {
    const raw = location.hash.startsWith('#') ? location.hash.slice(1) : '';
    const params = new URLSearchParams(raw);
    const key = String(params.get('key') || '').trim();
    if (!key) return;
    localStorage.setItem(DEVICE_KEY_STORAGE, key);
    history.replaceState(null, '', location.pathname + location.search);
  }

  function validGoogleOrigin(origin) {
    if (GOOGLE_MESSAGE_ORIGINS.has(origin)) return true;
    try {
      const u = new URL(origin);
      return u.protocol === 'https:' && (u.hostname === 'script.google.com' || u.hostname.endsWith('.googleusercontent.com'));
    } catch (_) {
      return false;
    }
  }

  window.addEventListener('message', event => {
    if (!validGoogleOrigin(event.origin)) return;
    const msg = event.data;
    if (!msg || typeof msg !== 'object' || !msg.requestId) return;
    const pending = S.pending.get(msg.requestId);
    if (!pending) return;
    S.pending.delete(msg.requestId);
    clearTimeout(pending.timer);
    pending.cleanup();
    if (msg.ok) pending.resolve(msg.data);
    else pending.reject(new Error(msg.error || 'Dismissal request failed.'));
  });

  function call(action, payload = {}, options = {}) {
    const key = options.key ?? deviceKey();
    if (!key) return Promise.reject(new Error('This device is not connected to Dismissal.'));

    return new Promise((resolve, reject) => {
      const id = requestId();
      const frameName = `dismissal_api_${id.replace(/[^a-zA-Z0-9_]/g, '')}`;
      const iframe = document.createElement('iframe');
      iframe.name = frameName;
      iframe.title = 'Dismissal API';
      iframe.hidden = true;
      iframe.setAttribute('aria-hidden', 'true');

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = API_URL;
      form.target = frameName;
      form.hidden = true;

      const fields = {
        requestId: id,
        action,
        deviceKey: key,
        payload: JSON.stringify(payload || {})
      };
      Object.entries(fields).forEach(([name, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value;
        form.appendChild(input);
      });

      const cleanup = () => {
        setTimeout(() => {
          form.remove();
          iframe.remove();
        }, 50);
      };

      const timer = setTimeout(() => {
        S.pending.delete(id);
        cleanup();
        reject(new Error('The Sheets backend did not respond. Make sure the Apps Script API deployment is set to Execute as me and Anyone can access it.'));
      }, options.timeout || 20000);

      S.pending.set(id, { resolve, reject, cleanup, timer });
      document.body.appendChild(iframe);
      document.body.appendChild(form);
      form.submit();
    });
  }

  async function boot() {
    consumeKeyFromHash();
    bindGlobal();
    S.timerTick = setInterval(updateTimers, 1000);

    if (!deviceKey()) {
      renderDeviceSetup();
      return;
    }

    try {
      await connectWithStoredKey();
    } catch (err) {
      if (/invalid|disabled|not connected|configured/i.test(err.message)) {
        localStorage.removeItem(DEVICE_KEY_STORAGE);
        renderDeviceSetup(err.message);
      } else {
        showFatal(err);
      }
    }
  }

  async function connectWithStoredKey() {
    S.boot = await call('bootstrap', { view: initialView() });
    S.view = S.boot.view;
    S.user = S.boot.user;
    S.allowedViews = S.boot.allowedViews || [];
    S.settings = S.boot.settings || {};
    $('#boot').hidden = true;
    $('#appbar').hidden = false;
    $('#app').hidden = false;
    $('#schoolName').textContent = S.settings.schoolName || 'Dismissal';
    $('#menuButton').hidden = S.allowedViews.length < 2;
    switchView(S.view);
  }

  function initialView() {
    const view = new URLSearchParams(location.search).get('view');
    return ['dispatcher', 'scanner', 'runner', 'admin'].includes(view) ? view : 'dispatcher';
  }

  function renderDeviceSetup(message = '') {
    $('#boot').hidden = true;
    $('#appbar').hidden = true;
    $('#app').hidden = false;
    $('#app').innerHTML = `
      <section class="device-setup">
        <div class="setup-mark">D</div>
        <h1>Connect this device</h1>
        <p>This is a one-time setup. Copy the Access Key for this phone/tablet from the private <strong>Devices</strong> sheet.</p>
        ${message ? `<div class="setup-error">${esc(message)}</div>` : ''}
        <form id="deviceSetupForm">
          <label for="deviceKeyInput">Device access key</label>
          <input id="deviceKeyInput" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" required>
          <button class="big-button" type="submit">Connect device</button>
        </form>
        <p class="setup-note">The key stays on this device. Student data is never stored in the public GitHub repository.</p>
      </section>`;

    $('#deviceSetupForm').addEventListener('submit', async e => {
      e.preventDefault();
      const key = String($('#deviceKeyInput').value || '').trim();
      if (!key) return;
      const btn = e.currentTarget.querySelector('button');
      btn.disabled = true;
      btn.textContent = 'Connecting…';
      try {
        const data = await call('bootstrap', { view: initialView() }, { key, timeout: 25000 });
        localStorage.setItem(DEVICE_KEY_STORAGE, key);
        S.boot = data;
        S.view = data.view;
        S.user = data.user;
        S.allowedViews = data.allowedViews || [];
        S.settings = data.settings || {};
        $('#appbar').hidden = false;
        $('#schoolName').textContent = S.settings.schoolName || 'Dismissal';
        $('#menuButton').hidden = S.allowedViews.length < 2;
        switchView(S.view);
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Connect device';
        toast('Could not connect', err.message, false);
      }
    });
  }

  function bindGlobal() {
    $('#menuButton').addEventListener('click', openMenu);
    $('#modal').addEventListener('click', e => { if (e.target.closest('[data-close-modal]')) closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });
    document.addEventListener('pointerdown', e => {
      if (S.view === 'scanner' && $('#modal').hidden && !e.target.closest('button,input,#reader')) setTimeout(refocusScanner, 0);
    });
  }

  function switchView(view) {
    if (!S.allowedViews.includes(view)) return;
    stopPolling();
    if (view !== 'scanner') stopCamera();
    S.view = view;
    S.queueVersion = '';
    $('#viewTitle').textContent = titleFor(view);
    $('#headerSearch').hidden = view !== 'admin';
    $('#appbar').classList.toggle('admin-mode', view === 'admin');
    closeModal();

    if (view === 'scanner') renderScanner();
    else if (view === 'runner') renderQueueScreen('runner');
    else if (view === 'dispatcher') renderQueueScreen('dispatcher');
    else if (view === 'admin') renderAdmin();
  }

  function titleFor(view) {
    return ({dispatcher:'Dispatcher',scanner:'Scanner',runner:'Runner',admin:'Admin'})[view] || 'Dismissal';
  }

  function identityChip() {
    return `<div class="identity-chip">Device: <strong>${esc(S.user?.name || 'Dismissal')}</strong></div>`;
  }

  function renderQueueScreen(view) {
    $('#app').innerHTML = `${identityChip()}
      <section class="screen-head">
        <h1>${view === 'runner' ? 'Who needs you?' : 'Who are we waiting on?'}</h1>
        <p>${view === 'runner' ? 'Tap a student. The next step will appear.' : 'Problem and long-wait pickups rise to the top automatically.'}</p>
      </section>
      ${view === 'dispatcher' ? `<section class="summary-row"><div class="summary-tile"><div class="summary-number" id="statActive">0</div><div class="summary-label">Waiting now</div></div><div class="summary-tile attention"><div class="summary-number" id="statProblem">0</div><div class="summary-label">Need attention</div></div></section><div class="completed-note" id="completedNote">0 completed today</div>` : ''}
      <div class="section-label">Students waiting</div>
      <section class="queue" id="queue"></section>`;
    refreshQueue(true);
    S.pollTimer = setInterval(() => refreshQueue(false), S.settings.pollIntervalMs || 4000);
  }

  async function refreshQueue(force) {
    try {
      const snap = await call('queue', { view: S.view });
      if (S.view === 'dispatcher') {
        $('#statActive').textContent = snap.stats.active;
        $('#statProblem').textContent = snap.stats.problem;
        $('#completedNote').textContent = `${snap.stats.completed} completed today`;
      }
      if (!force && snap.version === S.queueVersion) return;
      S.queueVersion = snap.version;
      renderQueue(snap.rows || []);
    } catch (err) {
      toast('Connection problem', err.message, false);
    }
  }

  function renderQueue(rows) {
    const root = $('#queue');
    if (!root) return;
    if (!rows.length) {
      root.innerHTML = `<div class="empty-state"><div class="empty-icon">✓</div><strong>${S.view === 'runner' ? 'You are caught up' : 'All clear'}</strong><span>No students need action right now.</span></div>`;
      return;
    }
    root.innerHTML = rows.map(studentCard).join('');
    root.querySelectorAll('[data-dismissal]').forEach(card => card.addEventListener('click', () => openStudent(rowById(rows, card.dataset.dismissal))));
  }

  function studentCard(row) {
    const age = ageBand(row.scannedAt);
    const progress = ['CLAIMED','ON_WAY'].includes(row.status);
    const cls = row.needsAttention ? 'danger' : age === 'warn' ? 'warn' : progress ? 'progress' : '';
    return `<button class="student-card ${cls}" type="button" data-dismissal="${esc(row.dismissalId)}">
      <div class="grade-badge">${esc(shortGrade(row.grade))}</div>
      <div><div class="student-name">${esc(row.studentName)}</div><div class="student-meta">${esc(row.grade || '—')} · ${esc(row.homeroom || '—')}</div><div class="pickup-meta">${esc(row.pickupGroup || '')}</div></div>
      <div class="card-side"><div class="wait" data-time="${esc(row.scannedAt)}">${elapsed(row.scannedAt)}</div><div class="status">${esc(statusLabel(row))}</div></div><div class="chevron">›</div>
    </button>`;
  }

  function rowById(rows, id) { return rows.find(r => r.dismissalId === id); }
  function shortGrade(g) { const s=String(g||'—'); return s.replace(/^Grade\s*/i,'').slice(0,3); }
  function statusLabel(row) {
    const map={CALLED:'Waiting',CLAIMED:'Being picked up',ON_WAY:'On the way',CANT_FIND:"Can't find",CALL_AGAIN:'Call again'};
    const base=map[row.status]||row.status;
    return row.claimedByName ? `${base} · ${row.claimedByName}` : base;
  }

  function openStudent(row) {
    if (!row) return;
    const body = `<div class="modal-person"><strong>${esc(row.studentName)}</strong><div>${esc(row.grade || '—')} · ${esc(row.homeroom || '—')}</div><div>${esc(row.pickupGroup || '')}</div><div class="modal-wait">Waiting ${elapsed(row.scannedAt)}</div></div>`;
    const actions=[];
    if (S.view === 'runner') {
      const mine = row.claimedByEmail === S.user.email;
      if ((row.status === 'CALLED' || row.status === 'CALL_AGAIN') && (!row.claimedByEmail || mine)) actions.push(action("I'm getting them", 'CLAIM', 'primary'));
      else if (mine && row.status === 'CLAIMED') {
        actions.push(action('Student is on the way','ON_WAY','primary'));
        actions.push(action("I can't find them",'CANT_FIND','warning'));
        actions.push(action('Release student','RELEASE','secondary'));
      } else if (mine && row.status === 'CANT_FIND') {
        actions.push(action('Found them — on the way','ON_WAY','primary'));
        actions.push(action('Release student','RELEASE','secondary'));
      }
    } else {
      actions.push(action('Student is here','COMPLETE','primary'));
      actions.push(action('Call again','CALL_AGAIN',row.needsAttention?'warning':'secondary'));
    }
    openModal(row.needsAttention ? 'Needs attention' : statusLabel(row), row.studentName, body, actions);
    $('#modal').dataset.dismissalId = row.dismissalId;
  }

  function action(label, serverAction, kind) {
    return {label,kind,onClick: async () => {
      const id = $('#modal').dataset.dismissalId;
      try {
        await call('update', { dismissalId: id, action: serverAction });
        closeModal();
        await refreshQueue(true);
      } catch (err) {
        closeModal();
        toast('Could not update student', err.message, false);
        await refreshQueue(true);
      }
    }};
  }

  function renderScanner() {
    $('#app').innerHTML = `<section class="scanner-page">
      <section class="screen-head scanner-head"><h1>Scan a car</h1><p>Hardware scanner or live phone camera. The camera stays ready for the next car.</p></section>
      <div class="scanner-live" id="scannerLive">
        <div id="reader" class="reader"></div>
        <div class="camera-placeholder" id="cameraPlaceholder">
          <div class="scan-mark">▥</div>
          <strong>Camera ready</strong>
          <span>Tap below to start live scanning.</span>
        </div>
        <div class="scan-flash" id="scanFlash" hidden></div>
      </div>
      <div class="scan-ready" id="scanState">Ready</div>
      <form id="scanForm"><input id="barcodeInput" class="scan-hidden" autocomplete="off" autocapitalize="characters" inputmode="none"></form>
      <div class="scanner-actions">
        <button class="big-button" id="cameraButton" type="button">Start live camera</button>
        <button class="big-button secondary" id="stopCameraButton" type="button" hidden>Stop camera</button>
        <button class="text-button" id="manualButton" type="button">Type a pickup code</button>
      </div>
    </section>`;

    const input=$('#barcodeInput');
    $('#scanForm').addEventListener('submit', e => {e.preventDefault();enqueueScan(input.value);input.value='';refocusScanner();});
    $('#cameraButton').addEventListener('click', startCamera);
    $('#stopCameraButton').addEventListener('click', stopCamera);
    $('#manualButton').addEventListener('click', openManualScan);
    setTimeout(refocusScanner,50);
  }

  function refocusScanner(){ const input=$('#barcodeInput'); if(input && $('#modal').hidden && !S.cameraRunning){ try{input.focus({preventScroll:true});}catch(e){input.focus();} } }
  function enqueueScan(code){code=String(code||'').trim();if(!code)return;S.scanQueue.push(code);processScanQueue();}

  async function processScanQueue(){
    if(S.scanning || !S.scanQueue.length)return;
    S.scanning=true;
    while(S.scanQueue.length){
      const code=S.scanQueue.shift();
      setScanState(S.scanQueue.length?`${S.scanQueue.length+1} queued`:'Calling…');
      try{
        const result=await call('scan',{code});
        const names=[...(result.created||[]),...(result.existing||[])].map(x=>x.student.name).join(', ');
        flashScan(true, result.group.name);
        toast(result.group.name, names || 'Pickup called', true);
      }catch(err){
        flashScan(false, 'Not accepted');
        toast('Scan not accepted',err.message,false);
      }
    }
    S.scanning=false;setScanState(S.cameraRunning?'Camera live':'Ready');refocusScanner();
  }

  function setScanState(text){const el=$('#scanState');if(el)el.textContent=text;}

  function flashScan(ok, label) {
    const el = $('#scanFlash');
    if (!el) return;
    el.className = `scan-flash ${ok ? 'ok' : 'bad'}`;
    el.textContent = label || (ok ? 'Scanned' : 'Try again');
    el.hidden = false;
    clearTimeout(flashScan.timer);
    flashScan.timer = setTimeout(() => { if (el) el.hidden = true; }, 900);
    if (navigator.vibrate) navigator.vibrate(ok ? 70 : [80,40,80]);
  }

  async function ensureQrLibrary() {
    if (window.Html5Qrcode) return true;
    return new Promise(resolve => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
      script.onload = () => resolve(Boolean(window.Html5Qrcode));
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  }

  async function startCamera(){
    if (S.cameraRunning || S.cameraStarting) return;
    S.cameraStarting = true;
    setScanState('Starting camera…');
    const loaded = await ensureQrLibrary();
    if(!loaded){
      S.cameraStarting=false;
      setScanState('Ready');
      toast('Camera scanner unavailable','The scanner library could not load. Hardware and manual entry still work.',false);
      return;
    }

    try{
      $('#cameraPlaceholder').hidden = true;
      S.qr = new Html5Qrcode('reader', { verbose: false });
      const formats = window.Html5QrcodeSupportedFormats ? [
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODABAR,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E
      ] : undefined;
      const config = { fps: 15, qrbox: (w,h) => ({width: Math.min(w * .86, 360), height: Math.min(h * .48, 210)}), aspectRatio: 1.6 };
      if (formats) config.formatsToSupport = formats;

      await S.qr.start(
        { facingMode:'environment' },
        config,
        decoded => {
          const code = String(decoded || '').trim();
          const now = Date.now();
          if (!code) return;
          if (code === S.lastCameraCode && now - S.lastCameraAt < 2200) return;
          S.lastCameraCode = code;
          S.lastCameraAt = now;
          enqueueScan(code);
        },
        () => {}
      );
      S.cameraRunning = true;
      $('#cameraButton').hidden = true;
      $('#stopCameraButton').hidden = false;
      setScanState('Camera live');
    }catch(err){
      S.qr = null;
      $('#cameraPlaceholder').hidden = false;
      toast('Camera could not start', cameraErrorText(err), false);
      setScanState('Ready');
    }finally{
      S.cameraStarting=false;
    }
  }

  function cameraErrorText(err) {
    const text = String(err?.message || err || '');
    if (/permission|notallowed/i.test(text)) return 'Allow camera access for this GitHub Pages site in your browser settings, then try again.';
    if (/notfound|device/i.test(text)) return 'No usable rear camera was found.';
    return text || 'Close other apps using the camera and try again.';
  }

  async function stopCamera(){
    const qr=S.qr; S.qr=null;
    if(qr){try{await qr.stop();}catch(e){} try{await qr.clear();}catch(e){}}
    S.cameraRunning=false;
    S.cameraStarting=false;
    const placeholder=$('#cameraPlaceholder'); if(placeholder) placeholder.hidden=false;
    const start=$('#cameraButton'); if(start) start.hidden=false;
    const stop=$('#stopCameraButton'); if(stop) stop.hidden=true;
    if(S.view==='scanner') setScanState('Ready');
    refocusScanner();
  }

  function openManualScan(){
    openModal('Backup','Type the pickup code',`<label for="manualCode">Carpool ID</label><input id="manualCode" class="modal-input" inputmode="numeric" autocomplete="off" placeholder="Example: 34499">`,[
      {label:'Call pickup',kind:'primary',onClick:()=>{const v=$('#manualCode').value;closeModal();enqueueScan(v);}}
    ]);
    setTimeout(()=>$('#manualCode')?.focus(),50);
  }

  function renderAdmin() {
    $('#app').innerHTML = `${identityChip()}<section class="screen-head"><h1>Find a pickup</h1><p>Search by family, barcode, student, grade, homeroom, or student ID.</p></section><div class="directory-meta" id="directoryMeta">Start typing above</div><section class="directory-list" id="directoryList"><div class="empty-state"><strong>Search the directory</strong><span>The full school roster is never rendered at once.</span></div></section>`;
    const input=$('#directorySearch'); input.value='';
    input.oninput=()=>{clearTimeout(S.adminDebounce);S.adminDebounce=setTimeout(()=>searchAdmin(input.value),250);};
    setTimeout(()=>input.focus(),50);
  }

  async function searchAdmin(query){
    query=String(query||'').trim();
    if(!query){$('#directoryMeta').textContent='Start typing above';$('#directoryList').innerHTML='<div class="empty-state"><strong>Search the directory</strong><span>The full school roster is never rendered at once.</span></div>';return;}
    $('#directoryMeta').textContent='Searching…';
    try{
      const result=await call('search',{query});
      $('#directoryMeta').textContent=`${result.total} result${result.total===1?'':'s'}${result.total>50?' · first 50 shown':''}`;
      $('#directoryList').innerHTML=result.groups.length?result.groups.map(g=>`<article class="directory-card"><h2>${esc(g.name)}</h2><span class="directory-code">${esc(g.token)}</span>${g.students.map(s=>`<div class="directory-student"><strong>${esc(s.name)}</strong><span>${esc(s.grade)} · ${esc(s.homeroom)} · ${esc(s.id)}</span></div>`).join('')}</article>`).join(''):'<div class="empty-state"><strong>No matches</strong><span>Try another name, grade, or ID.</span></div>';
    }catch(err){toast('Search failed',err.message,false);}
  }

  function openMenu(){
    const body=`<div class="menu-list">${S.allowedViews.map(v=>`<button type="button" class="menu-link ${v===S.view?'current':''}" data-view="${v}"><span>${titleFor(v)}</span><span>${v===S.view?'Current':'›'}</span></button>`).join('')}</div>
      <button type="button" class="disconnect-button" id="disconnectDevice">Disconnect this device</button>`;
    openModal('Dismissal','Switch screen',body,[]);
    $('#modalContent').querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{closeModal();switchView(b.dataset.view);}));
    $('#disconnectDevice').addEventListener('click',()=>{
      localStorage.removeItem(DEVICE_KEY_STORAGE);
      closeModal();
      stopPolling();
      stopCamera();
      S.allowedViews=[];
      S.user=null;
      renderDeviceSetup();
    });
  }

  function openModal(eyebrow,title,body,actions=[],dismissible=true){
    const modal=$('#modal'); modal.dataset.dismissible=String(dismissible); modal.dataset.dismissalId='';
    $('#modalContent').innerHTML=`<div class="modal-eyebrow">${esc(eyebrow||'')}</div><h2 id="modalTitle">${esc(title)}</h2><div class="modal-body">${body||''}</div><div class="modal-actions">${actions.map((a,i)=>`<button class="modal-action ${esc(a.kind||'secondary')}" data-action="${i}" type="button">${esc(a.label)}</button>`).join('')}${dismissible?'<button class="modal-cancel" data-close-modal type="button">Cancel</button>':''}</div>`;
    actions.forEach((a,i)=>$('#modalContent').querySelector(`[data-action="${i}"]`)?.addEventListener('click',a.onClick));
    modal.hidden=false; document.body.classList.add('modal-open'); requestAnimationFrame(()=>modal.classList.add('show'));
  }

  function closeModal(){
    const modal=$('#modal'); if(!modal||modal.hidden)return;
    modal.classList.remove('show'); document.body.classList.remove('modal-open');
    setTimeout(()=>{modal.hidden=true;modal.dataset.dismissalId='';},170);
  }

  function toast(title,detail,success){
    const el=$('#toast'); clearTimeout(S.toastTimer);
    el.className=`toast ${success?'success':'error'}`;
    el.innerHTML=`<div class="toast-title">${esc(title)}</div>${detail?`<div class="toast-detail">${esc(detail)}</div>`:''}`;
    requestAnimationFrame(()=>el.classList.add('show'));
    S.toastTimer=setTimeout(()=>el.classList.remove('show'),success?2600:4400);
  }

  function showFatal(err){
    $('#boot').hidden=true; $('#appbar').hidden=true; $('#app').hidden=false;
    $('#app').innerHTML=`<section class="error-screen"><h1>Dismissal could not open</h1><p>${esc(err?.message||err)}</p><button class="big-button" id="retryButton" type="button">Try again</button><button class="text-button" id="resetDeviceButton" type="button">Reconnect this device</button></section>`;
    $('#retryButton').addEventListener('click',()=>location.reload());
    $('#resetDeviceButton').addEventListener('click',()=>{localStorage.removeItem(DEVICE_KEY_STORAGE);renderDeviceSetup();});
  }

  function elapsed(iso){
    const sec=Math.max(0,Math.floor((Date.now()-new Date(iso).getTime())/1000));
    const m=Math.floor(sec/60),s=sec%60; return `${m}:${String(s).padStart(2,'0')}`;
  }

  function ageBand(iso){
    const mins=(Date.now()-new Date(iso).getTime())/60000;
    if(mins>=(S.settings.dangerMinutes||10))return'danger';
    if(mins>=(S.settings.warningMinutes||5))return'warn';
    return'normal';
  }

  function updateTimers(){document.querySelectorAll('[data-time]').forEach(el=>el.textContent=elapsed(el.dataset.time));}
  function stopPolling(){if(S.pollTimer){clearInterval(S.pollTimer);S.pollTimer=null;}}

  boot();
})();
