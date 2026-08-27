const DISMISSAL_API = Object.freeze({
  DEVICES_SHEET: 'Devices',
  DEFAULT_ORIGIN: 'https://bigcatmellow-archive.github.io',
  DEVICE_HEADERS: ['Device ID', 'Display Name', 'Roles', 'Access Key', 'Active', 'Notes', 'Last Seen', 'Created At']
});

/**
 * POST bridge used by the GitHub Pages frontend.
 *
 * The browser submits a normal HTML form into a hidden iframe, so this does
 * not depend on CORS. The response page sends the result back to the parent
 * with postMessage and is explicitly allowed to be framed.
 *
 * Deploy the API web app as:
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * The web app itself is protected by a long per-device access key stored in
 * the private Devices sheet. Never put those keys in GitHub.
 */
function doPost(e) {
  const requestId = String(e && e.parameter && e.parameter.requestId || '').trim();
  const settings = getSettings_();
  const origin = String(settings['Allowed Frontend Origin'] || DISMISSAL_API.DEFAULT_ORIGIN).trim();

  let response;
  try {
    const action = String(e && e.parameter && e.parameter.action || '').trim();
    const token = String(e && e.parameter && e.parameter.deviceKey || '').trim();
    const payloadText = String(e && e.parameter && e.parameter.payload || '{}');
    const payload = payloadText ? JSON.parse(payloadText) : {};
    const device = apiRequireDevice_(token);

    let data;
    if (action === 'bootstrap') data = apiBootstrap_(device, payload.view);
    else if (action === 'queue') data = apiQueue_(device, payload.view);
    else if (action === 'scan') data = apiScan_(device, payload.code);
    else if (action === 'update') data = apiUpdate_(device, payload.dismissalId, payload.action);
    else if (action === 'search') data = apiSearch_(device, payload.query);
    else if (action === 'resetToday') data = apiResetToday_(device);
    else throw new Error('Unknown API action.');

    response = { ok: true, requestId: requestId, data: data };
  } catch (err) {
    response = {
      ok: false,
      requestId: requestId,
      error: err && err.message ? String(err.message) : String(err)
    };
  }

  return apiBridgeOutput_(origin, response);
}

/** Creates or repairs the Devices sheet. Safe to run more than once. */
function setupDeviceAccess() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(DISMISSAL_API.DEVICES_SHEET);
  if (!sheet) sheet = ss.insertSheet(DISMISSAL_API.DEVICES_SHEET);

  const headers = DISMISSAL_API.DEVICE_HEADERS;
  const existing = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const hasAny = existing.some(v => String(v || '').trim());
  if (!hasAny) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    headers.forEach((h, i) => {
      if (!String(existing[i] || '').trim()) sheet.getRange(1, i + 1).setValue(h);
    });
  }

  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground('#214289')
    .setFontColor('#ffffff')
    .setFontWeight('bold');
  sheet.autoResizeColumns(1, headers.length);
  return { ok: true, sheet: DISMISSAL_API.DEVICES_SHEET };
}

/**
 * Spreadsheet menu for provisioning phones/tablets without handling keys in
 * source control. Reload the Sheet after adding this file.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Dismissal')
    .addItem('Create device access', 'promptCreateDeviceAccess')
    .addItem('Repair device sheet', 'setupDeviceAccess')
    .addItem('Sync carpool roster', 'syncCarpoolRoster')
    .addToUi();
}

function promptCreateDeviceAccess() {
  setupDeviceAccess();
  const ui = SpreadsheetApp.getUi();
  const namePrompt = ui.prompt('Create device access', 'Device or staff name (example: Front Desk Scanner or Jamie Runner)', ui.ButtonSet.OK_CANCEL);
  if (namePrompt.getSelectedButton() !== ui.Button.OK) return;
  const name = String(namePrompt.getResponseText() || '').trim();
  if (!name) return ui.alert('A device name is required.');

  const rolePrompt = ui.prompt('Device role', 'Enter scanner, runner, dispatcher, admin, or comma-separated roles.', ui.ButtonSet.OK_CANCEL);
  if (rolePrompt.getSelectedButton() !== ui.Button.OK) return;
  const roles = String(rolePrompt.getResponseText() || '').trim().toLowerCase();
  if (!roles) return ui.alert('At least one role is required.');

  const created = createDeviceAccess_(name, roles, 'Created from Dismissal menu');
  ui.alert(
    'Device access created',
    'Open the Devices sheet and copy the Access Key from the new row into that phone/tablet.\n\nDevice: ' + created.name + '\nRoles: ' + created.roles,
    ui.ButtonSet.OK
  );
}

function createDeviceAccess_(displayName, roles, notes) {
  setupDeviceAccess();
  const allowed = ['scanner', 'runner', 'dispatcher', 'admin'];
  const parsed = String(roles || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!parsed.length || parsed.some(r => allowed.indexOf(r) === -1)) {
    throw new Error('Roles must use scanner, runner, dispatcher, or admin.');
  }

  const id = Utilities.getUuid();
  const key = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const sheet = getSpreadsheet_().getSheetByName(DISMISSAL_API.DEVICES_SHEET);
  appendRows_(sheet, [[id, String(displayName || '').trim(), parsed.join(','), key, true, String(notes || ''), '', new Date()]]);
  return { id: id, name: String(displayName || '').trim(), roles: parsed.join(','), accessKey: key };
}

function apiRequireDevice_(token) {
  if (!token) throw new Error('This device is not connected to Dismissal.');
  const sheet = getSpreadsheet_().getSheetByName(DISMISSAL_API.DEVICES_SHEET);
  if (!sheet || sheet.getLastRow() < 2) throw new Error('No Dismissal devices have been configured yet.');

  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();
  let match = null;
  let rowNumber = -1;
  for (let i = 0; i < rows.length; i += 1) {
    if (String(rows[i][3] || '') === token && truthy_(rows[i][4])) {
      match = rows[i];
      rowNumber = i + 2;
      break;
    }
  }
  if (!match) throw new Error('This device access key is invalid or disabled.');

  const roles = String(match[2] || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!roles.length) throw new Error('This device does not have a Dismissal role.');

  // Touch at most when the device makes a request. This is operational metadata,
  // not part of the dismissal queue and does not affect polling correctness.
  try { sheet.getRange(rowNumber, 7).setValue(new Date()); } catch (err) {}

  const id = String(match[0] || 'device');
  return {
    id: id,
    email: 'device:' + id,
    name: String(match[1] || 'Dismissal Device'),
    roles: roles
  };
}

function apiBootstrap_(staff, requestedView) {
  prepareToday_();
  const allowedViews = allowedViewsFor_(staff);
  if (!allowedViews.length) throw new Error('This device does not have a supported Dismissal role.');
  const requested = sanitizeView_(requestedView);
  const view = allowedViews.indexOf(requested) !== -1 ? requested : allowedViews[0];
  const settings = getSettings_();
  return {
    version: DS.VERSION + '-pages',
    user: { email: staff.email, name: staff.name, roles: staff.roles },
    view: view,
    allowedViews: allowedViews,
    settings: {
      schoolName: settings['School Name'] || 'Dismissal',
      warningMinutes: numberSetting_(settings, 'Warning Minutes', 5),
      dangerMinutes: numberSetting_(settings, 'Danger Minutes', 10),
      pollIntervalMs: clamp_(numberSetting_(settings, 'Poll Interval Ms', 4000), 2500, 10000)
    }
  };
}

function apiQueue_(staff, view) {
  prepareToday_();
  view = sanitizeView_(view);
  requireView_(staff, view);
  if (view !== 'runner' && view !== 'dispatcher') return { version: '0', rows: [], stats: emptyStats_() };

  let rows = loadTodayDismissalsCached_().filter(r => r.status !== 'COMPLETE');
  const settings = getSettings_();
  const dangerMinutes = numberSetting_(settings, 'Danger Minutes', 10);
  rows = rows.map(r => serializeDismissal_(r, dangerMinutes));

  if (view === 'runner') {
    rows = rows.filter(r => {
      const waiting = r.status === 'CALLED' || r.status === 'CALL_AGAIN';
      const available = waiting && (!r.claimedByEmail || r.claimedByEmail === staff.email);
      const mine = r.claimedByEmail === staff.email && (r.status === 'CLAIMED' || r.status === 'CANT_FIND');
      return available || mine;
    });
    rows.sort((a, b) => {
      const aMine = a.claimedByEmail === staff.email;
      const bMine = b.claimedByEmail === staff.email;
      if (aMine !== bMine) return bMine - aMine;
      return new Date(a.scannedAt).getTime() - new Date(b.scannedAt).getTime();
    });
  } else {
    rows.sort((a, b) => {
      if (a.needsAttention !== b.needsAttention) return b.needsAttention - a.needsAttention;
      return new Date(a.scannedAt).getTime() - new Date(b.scannedAt).getTime();
    });
  }

  const all = loadTodayDismissalsCached_();
  const active = all.filter(r => r.status !== 'COMPLETE');
  const completed = all.filter(r => r.status === 'COMPLETE');
  const problem = active.filter(r => isProblemServer_(r, dangerMinutes));
  const version = active.length + ':' + active.reduce((m, r) => Math.max(m, dateMs_(r.updatedAt)), 0);
  return { version: version, rows: rows, stats: { active: active.length, problem: problem.length, completed: completed.length } };
}

function apiScan_(staff, rawToken) {
  prepareToday_();
  requireRole_(staff, ['scanner', 'admin']);
  const token = String(rawToken || '').trim().toUpperCase();
  if (!token) throw new Error('No barcode was received.');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const directory = getDirectory_();
    const groupId = directory.tokenToGroup[token];
    const group = groupId ? directory.groups[groupId] : null;
    if (!group || !group.active) throw new Error('Barcode not recognized.');

    const todayRows = loadTodayDismissalsFresh_();
    const openByStudent = {};
    todayRows.forEach(r => { if (r.status !== 'COMPLETE') openByStudent[r.studentId] = r; });

    const newRows = [];
    const events = [];
    const created = [];
    const existing = [];
    const now = new Date();
    const sessionDate = todayKey_();

    (group.studentIds || []).forEach(studentId => {
      const student = directory.students[studentId];
      if (!student || !student.active) return;
      const open = openByStudent[studentId];
      if (open) {
        existing.push(clientStudent_(student, open));
        events.push(makeEvent_(open.dismissalId, 'RESCANNED', staff, group.name));
        return;
      }

      const id = Utilities.getUuid();
      const row = [id, sessionDate, student.id, group.id, student.name, student.grade, student.homeroom, group.name, 'CALLED', '', '', now, now, ''];
      newRows.push(row);
      const record = rowToDismissal_(row, -1);
      created.push(clientStudent_(student, record));
      events.push(makeEvent_(id, 'SCANNED', staff, group.name));
      openByStudent[studentId] = record;
    });

    if (!created.length && !existing.length) throw new Error('This pickup group has no active students.');
    if (newRows.length) appendRows_(getSpreadsheet_().getSheetByName(DS.SHEETS.DISMISSALS), newRows);
    if (events.length) logEvents_(events);
    invalidateQueueCache_();
    return { group: { id: group.id, name: group.name }, created: created, existing: existing };
  } finally {
    lock.releaseLock();
  }
}

function apiUpdate_(staff, dismissalId, action) {
  prepareToday_();
  action = String(action || '').trim().toUpperCase();
  const actionRoles = {
    CLAIM: ['runner', 'admin'],
    ON_WAY: ['runner', 'admin'],
    CANT_FIND: ['runner', 'admin'],
    RELEASE: ['runner', 'admin'],
    COMPLETE: ['dispatcher', 'admin'],
    CALL_AGAIN: ['dispatcher', 'admin']
  };
  if (!actionRoles[action]) throw new Error('Unknown dismissal action.');
  requireRole_(staff, actionRoles[action]);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSpreadsheet_().getSheetByName(DS.SHEETS.DISMISSALS);
    const match = findDismissalRow_(sheet, dismissalId);
    if (!match) throw new Error('This dismissal is no longer active. Refresh and try again.');

    const record = rowToDismissal_(match.values, match.row);
    const now = new Date();
    let nextStatus = record.status;
    let claimedEmail = record.claimedByEmail;
    let claimedName = record.claimedByName;

    if (action === 'CLAIM') {
      if (!['CALLED', 'CALL_AGAIN'].includes(record.status)) throw new Error('This student is no longer available to claim.');
      if (claimedEmail && claimedEmail !== staff.email) throw new Error((claimedName || 'Another runner') + ' already claimed this student.');
      nextStatus = 'CLAIMED';
      claimedEmail = staff.email;
      claimedName = staff.name;
    } else if (action === 'ON_WAY') {
      requireOwnedClaim_(record, staff);
      if (!['CLAIMED', 'CANT_FIND'].includes(record.status)) throw new Error('This student is not in a runner-owned state.');
      nextStatus = 'ON_WAY';
    } else if (action === 'CANT_FIND') {
      requireOwnedClaim_(record, staff);
      if (record.status !== 'CLAIMED') throw new Error('Only a claimed student can be marked as not found.');
      nextStatus = 'CANT_FIND';
    } else if (action === 'RELEASE') {
      requireOwnedClaim_(record, staff);
      nextStatus = 'CALLED';
      claimedEmail = '';
      claimedName = '';
    } else if (action === 'COMPLETE') {
      if (record.status === 'COMPLETE') return { status: 'COMPLETE' };
      nextStatus = 'COMPLETE';
    } else if (action === 'CALL_AGAIN') {
      if (record.status === 'COMPLETE') throw new Error('This student is already complete.');
      nextStatus = 'CALL_AGAIN';
    }

    sheet.getRange(match.row, 9, 1, 5).setValues([[nextStatus, claimedEmail, claimedName, now, nextStatus === 'COMPLETE' ? now : record.completedAt || '']]);
    logEvents_([makeEvent_(record.dismissalId, action, staff, nextStatus)]);
    invalidateQueueCache_();
    return { status: nextStatus, claimedByName: claimedName || '' };
  } finally {
    lock.releaseLock();
  }
}

function apiSearch_(staff, query) {
  requireRole_(staff, ['admin']);
  query = String(query || '').trim().toLowerCase();
  if (!query) return { total: 0, groups: [] };

  const directory = getDirectory_();
  const matches = Object.keys(directory.groups).map(id => directory.groups[id]).filter(group => {
    if (!group.active) return false;
    const students = (group.studentIds || []).map(id => directory.students[id]).filter(Boolean);
    const haystack = [group.name, group.token, group.type]
      .concat(students.reduce((out, s) => out.concat([s.name, s.grade, s.homeroom, s.id]), []))
      .join(' ').toLowerCase();
    return haystack.indexOf(query) !== -1;
  });

  return {
    total: matches.length,
    groups: matches.slice(0, 50).map(group => ({
      id: group.id,
      name: group.name,
      token: group.token,
      type: group.type,
      students: (group.studentIds || []).map(id => directory.students[id]).filter(Boolean).map(s => ({ id: s.id, name: s.name, grade: s.grade, homeroom: s.homeroom }))
    }))
  };
}

function apiResetToday_(staff) {
  requireRole_(staff, ['admin']);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSpreadsheet_().getSheetByName(DS.SHEETS.DISMISSALS);
    if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
    invalidateQueueCache_();
    logEvents_([makeEvent_('', 'RESET_TODAY', staff, 'Admin reset of current dismissal queue')]);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function apiBridgeOutput_(origin, response) {
  const safeOrigin = JSON.stringify(String(origin || DISMISSAL_API.DEFAULT_ORIGIN));
  const safePayload = JSON.stringify(response).replace(/</g, '\\u003c');
  const html = '<!doctype html><html><head><meta charset="utf-8"></head><body><script>' +
    'window.top.postMessage(' + safePayload + ',' + safeOrigin + ');' +
    '<\/script></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
