const DS = Object.freeze({
  VERSION: '1.0.0',
  PROP_SPREADSHEET_ID: 'DISMISSAL_SPREADSHEET_ID',
  CACHE_DIRECTORY: 'dismissal-directory-v1',
  CACHE_QUEUE: 'dismissal-queue-v1',
  SHEETS: {
    STUDENTS: 'Students',
    GROUPS: 'PickupGroups',
    MEMBERS: 'PickupGroupStudents',
    STAFF: 'Staff',
    DISMISSALS: 'Dismissals',
    HISTORY: 'DismissalHistory',
    EVENTS: 'DismissalEvents',
    SETTINGS: 'Settings'
  },
  HEADERS: {
    Students: ['Student ID', 'Display Name', 'Grade', 'Homeroom', 'Active'],
    PickupGroups: ['Pickup Group ID', 'Display Name', 'Barcode Token', 'Type', 'Active'],
    PickupGroupStudents: ['Pickup Group ID', 'Student ID', 'Active'],
    Staff: ['Email', 'Display Name', 'Roles', 'Active'],
    Dismissals: ['Dismissal ID', 'Session Date', 'Student ID', 'Pickup Group ID', 'Student Name', 'Grade', 'Homeroom', 'Pickup Group', 'Status', 'Claimed By Email', 'Claimed By Name', 'Scanned At', 'Updated At', 'Completed At'],
    DismissalHistory: ['Dismissal ID', 'Session Date', 'Student ID', 'Pickup Group ID', 'Student Name', 'Grade', 'Homeroom', 'Pickup Group', 'Status', 'Claimed By Email', 'Claimed By Name', 'Scanned At', 'Updated At', 'Completed At'],
    DismissalEvents: ['Event ID', 'Dismissal ID', 'Event Type', 'Actor Email', 'Actor Name', 'Timestamp', 'Details'],
    Settings: ['Key', 'Value', 'Notes']
  },
  DEFAULT_SETTINGS: [
    ['School Name', 'Nysmith School', 'Shown in the web app header.'],
    ['Allowed Domain', 'nysmithschool.com', 'Leave blank only for testing.'],
    ['Warning Minutes', '5', 'Wait time that begins the amber warning state.'],
    ['Danger Minutes', '10', 'Wait time that begins the red attention state.'],
    ['Poll Interval Ms', '4000', 'Runner/dispatcher refresh interval. 3000-6000 is recommended.'],
    ['Current Session Date', '', 'Managed automatically by the script.']
  ],
  STATUSES: ['CALLED', 'CLAIMED', 'ON_WAY', 'CANT_FIND', 'CALL_AGAIN', 'AT_PICKUP', 'COMPLETE'],
  VIEWS: ['dispatcher', 'scanner', 'runner', 'admin']
});

function doGet(e) {
  const template = HtmlService.createTemplateFromFile('Index');
  template.requestedView = sanitizeView_(e && e.parameter ? e.parameter.view : '');
  return template.evaluate()
    .setTitle('Dismissal')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/** Run once from a Google Sheet-bound Apps Script project. */
function setupDismissalSystem() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Open the Apps Script project from the Google Sheet, then run setupDismissalSystem().');

  PropertiesService.getScriptProperties().setProperty(DS.PROP_SPREADSHEET_ID, ss.getId());
  ss.setSpreadsheetTimeZone(Session.getScriptTimeZone() || 'America/New_York');

  Object.keys(DS.HEADERS).forEach(name => ensureSheet_(ss, name, DS.HEADERS[name]));
  ensureDefaultSettings_(ss);
  ensureInitialAdmin_(ss);
  prepareToday_();
  invalidateCaches_();

  return {
    ok: true,
    spreadsheetId: ss.getId(),
    sheets: Object.keys(DS.HEADERS),
    webAppNote: 'Deploy as a Google Apps Script web app after adding staff and roster data.'
  };
}

/** Optional: inserts fictional records for a safe end-to-end test. */
function seedDemoData() {
  const ss = getSpreadsheet_();
  const students = ss.getSheetByName(DS.SHEETS.STUDENTS);
  const groups = ss.getSheetByName(DS.SHEETS.GROUPS);
  const members = ss.getSheetByName(DS.SHEETS.MEMBERS);

  if (students.getLastRow() > 1 || groups.getLastRow() > 1 || members.getLastRow() > 1) {
    throw new Error('Demo data was not added because roster/pickup data already exists.');
  }

  appendRows_(students, [
    ['S-001', 'Demo Student A', '3', 'Room 3B', true],
    ['S-002', 'Demo Student B', '5', 'Room 5A', true],
    ['S-003', 'Demo Student C', '2', 'Room 2C', true],
    ['S-004', 'Demo Student D', '4', 'Room 4A', true]
  ]);
  appendRows_(groups, [
    ['PG-101', 'Family 101', 'FAM-101', 'family', true],
    ['PG-202', 'Family 202', 'FAM-202', 'family', true],
    ['PG-303', 'Tuesday Carpool', 'CARPOOL-303', 'carpool', true]
  ]);
  appendRows_(members, [
    ['PG-101', 'S-001', true],
    ['PG-101', 'S-002', true],
    ['PG-202', 'S-003', true],
    ['PG-303', 'S-002', true],
    ['PG-303', 'S-004', true]
  ]);

  invalidateCaches_();
  return { ok: true, demoCodes: ['FAM-101', 'FAM-202', 'CARPOOL-303'] };
}

/** Clears today's operational queue but leaves roster, groups, staff, and event history intact. */
function resetTodayDismissal() {
  const staff = requireStaff_();
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

function getBootstrap(requestedView) {
  prepareToday_();
  const staff = requireStaff_();
  const allowedViews = allowedViewsFor_(staff);
  if (!allowedViews.length) throw new Error('Your Staff record does not include a supported Dismissal role.');
  const requested = sanitizeView_(requestedView);
  const view = allowedViews.indexOf(requested) !== -1 ? requested : allowedViews[0];
  const settings = getSettings_();
  return {
    ok: true,
    version: DS.VERSION,
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

function getQueueSnapshot(view) {
  prepareToday_();
  const staff = requireStaff_();
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

  return {
    version: version,
    rows: rows,
    stats: { active: active.length, problem: problem.length, completed: completed.length }
  };
}

function scanPickupGroup(rawToken) {
  prepareToday_();
  const staff = requireStaff_();
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
      const row = [
        id, sessionDate, student.id, group.id, student.name, student.grade, student.homeroom,
        group.name, 'CALLED', '', '', now, now, ''
      ];
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

    return {
      ok: true,
      group: { id: group.id, name: group.name },
      created: created,
      existing: existing
    };
  } finally {
    lock.releaseLock();
  }
}

function updateDismissal(dismissalId, action) {
  prepareToday_();
  const staff = requireStaff_();
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
      if (record.status === 'COMPLETE') return { ok: true, status: 'COMPLETE' };
      nextStatus = 'COMPLETE';
    } else if (action === 'CALL_AGAIN') {
      if (record.status === 'COMPLETE') throw new Error('This student is already complete.');
      nextStatus = 'CALL_AGAIN';
    }

    const updates = [[nextStatus, claimedEmail, claimedName, now, nextStatus === 'COMPLETE' ? now : record.completedAt || '']];
    sheet.getRange(match.row, 9, 1, 5).setValues(updates);
    logEvents_([makeEvent_(record.dismissalId, action, staff, nextStatus)]);
    invalidateQueueCache_();
    return { ok: true, status: nextStatus, claimedByName: claimedName || '' };
  } finally {
    lock.releaseLock();
  }
}

function searchPickupDirectory(query) {
  const staff = requireStaff_();
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
      students: (group.studentIds || []).map(id => directory.students[id]).filter(Boolean).map(s => ({
        id: s.id, name: s.name, grade: s.grade, homeroom: s.homeroom
      }))
    }))
  };
}

function onEdit(e) {
  try {
    const name = e && e.range && e.range.getSheet ? e.range.getSheet().getName() : '';
    if ([DS.SHEETS.STUDENTS, DS.SHEETS.GROUPS, DS.SHEETS.MEMBERS, DS.SHEETS.STAFF, DS.SHEETS.SETTINGS].indexOf(name) !== -1) {
      invalidateCaches_();
    }
  } catch (err) {
    console.warn(err);
  }
}

// -------------------- Internal helpers --------------------

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty(DS.PROP_SPREADSHEET_ID);
  if (!id) throw new Error('Dismissal is not configured. Run setupDismissalSystem() from the bound Google Sheet first.');
  return SpreadsheetApp.openById(id);
}

function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  const existing = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const hasAny = existing.some(v => String(v).trim() !== '');
  if (!hasAny) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    const mismatch = headers.some((h, i) => String(existing[i] || '').trim() !== h);
    if (mismatch) throw new Error('Sheet "' + name + '" already exists but its header row does not match the Dismissal format.');
  }

  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground('#214289')
    .setFontColor('#ffffff')
    .setFontWeight('bold');
  sheet.autoResizeColumns(1, Math.min(headers.length, 8));

  if (name === DS.SHEETS.DISMISSALS || name === DS.SHEETS.HISTORY) {
    sheet.getRange('L:N').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  }
  if (name === DS.SHEETS.EVENTS) sheet.getRange('F:F').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  return sheet;
}

function ensureDefaultSettings_(ss) {
  const sheet = ss.getSheetByName(DS.SHEETS.SETTINGS);
  const values = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues() : [];
  const existing = {};
  values.forEach(r => { if (r[0]) existing[String(r[0])] = true; });
  const missing = DS.DEFAULT_SETTINGS.filter(r => !existing[r[0]]);
  if (missing.length) appendRows_(sheet, missing);
}

function ensureInitialAdmin_(ss) {
  const email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!email) return;
  const sheet = ss.getSheetByName(DS.SHEETS.STAFF);
  const rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues() : [];
  if (rows.some(r => String(r[0]).trim().toLowerCase() === email)) return;
  appendRows_(sheet, [[email, email.split('@')[0], 'admin', true]]);
}

function prepareToday_() {
  const ss = getSpreadsheet_();
  const settings = getSettings_();
  const today = todayKey_();
  if ((settings['Current Session Date'] || '') === today) return;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    const refreshed = getSettings_();
    if ((refreshed['Current Session Date'] || '') === today) return;
    const activeSheet = ss.getSheetByName(DS.SHEETS.DISMISSALS);
    const historySheet = ss.getSheetByName(DS.SHEETS.HISTORY);
    if (activeSheet.getLastRow() > 1) {
      const rows = activeSheet.getRange(2, 1, activeSheet.getLastRow() - 1, activeSheet.getLastColumn()).getValues();
      appendRows_(historySheet, rows);
      activeSheet.getRange(2, 1, activeSheet.getLastRow() - 1, activeSheet.getLastColumn()).clearContent();
    }
    setSetting_('Current Session Date', today);
    invalidateQueueCache_();
  } finally {
    lock.releaseLock();
  }
}

function getSettings_() {
  const sheet = getSpreadsheet_().getSheetByName(DS.SHEETS.SETTINGS);
  if (!sheet || sheet.getLastRow() < 2) return {};
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  const out = {};
  rows.forEach(r => { if (r[0]) out[String(r[0])] = String(r[1] == null ? '' : r[1]); });
  return out;
}

function setSetting_(key, value) {
  const sheet = getSpreadsheet_().getSheetByName(DS.SHEETS.SETTINGS);
  const rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues() : [];
  const index = rows.findIndex(r => String(r[0]) === key);
  if (index === -1) appendRows_(sheet, [[key, value, '']]);
  else sheet.getRange(index + 2, 2).setValue(value);
}

function numberSetting_(settings, key, fallback) {
  const n = Number(settings[key]);
  return Number.isFinite(n) ? n : fallback;
}

function requireStaff_() {
  const email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!email) {
    throw new Error('Google could not identify your signed-in account. For a school deployment, restrict the web app to your Workspace domain. If identity is still blank, deploy the app to run as the user accessing it or ask your Workspace administrator to review Apps Script identity policy.');
  }

  const settings = getSettings_();
  const allowedDomain = String(settings['Allowed Domain'] || '').trim().toLowerCase();
  if (allowedDomain && !email.endsWith('@' + allowedDomain)) throw new Error('This Google account is outside the allowed school domain.');

  const sheet = getSpreadsheet_().getSheetByName(DS.SHEETS.STAFF);
  const rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues() : [];
  const row = rows.find(r => String(r[0]).trim().toLowerCase() === email && truthy_(r[3]));
  if (!row) throw new Error('Your account is not enabled for Dismissal. Ask an administrator to add ' + email + ' to the Staff sheet.');

  const roles = String(row[2] || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!roles.length) throw new Error('Your Staff record does not have a role.');
  return { email: email, name: String(row[1] || email.split('@')[0]), roles: roles };
}

function requireRole_(staff, accepted) {
  if (staff.roles.indexOf('admin') !== -1) return;
  if (!accepted.some(role => staff.roles.indexOf(role) !== -1)) throw new Error('Your account does not have permission for this action.');
}

function requireView_(staff, view) {
  if (allowedViewsFor_(staff).indexOf(view) === -1) throw new Error('Your account does not have permission to open this screen.');
}

function allowedViewsFor_(staff) {
  if (staff.roles.indexOf('admin') !== -1) return DS.VIEWS.slice();
  return DS.VIEWS.filter(v => staff.roles.indexOf(v) !== -1);
}

function getDirectory_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(DS.CACHE_DIRECTORY);
  if (cached) {
    try { return JSON.parse(cached); } catch (err) {}
  }

  const ss = getSpreadsheet_();
  const studentsSheet = ss.getSheetByName(DS.SHEETS.STUDENTS);
  const groupsSheet = ss.getSheetByName(DS.SHEETS.GROUPS);
  const membersSheet = ss.getSheetByName(DS.SHEETS.MEMBERS);

  const students = {};
  dataRows_(studentsSheet, 5).forEach(r => {
    const id = String(r[0] || '').trim();
    if (!id) return;
    students[id] = { id: id, name: String(r[1] || ''), grade: String(r[2] || ''), homeroom: String(r[3] || ''), active: truthy_(r[4]) };
  });

  const groups = {};
  const tokenToGroup = {};
  dataRows_(groupsSheet, 5).forEach(r => {
    const id = String(r[0] || '').trim();
    if (!id) return;
    const token = String(r[2] || '').trim().toUpperCase();
    groups[id] = { id: id, name: String(r[1] || ''), token: token, type: String(r[3] || 'family'), active: truthy_(r[4]), studentIds: [] };
    if (token) tokenToGroup[token] = id;
  });

  dataRows_(membersSheet, 3).forEach(r => {
    const groupId = String(r[0] || '').trim();
    const studentId = String(r[1] || '').trim();
    if (!groupId || !studentId || !truthy_(r[2]) || !groups[groupId]) return;
    groups[groupId].studentIds.push(studentId);
  });

  const directory = { students: students, groups: groups, tokenToGroup: tokenToGroup };
  try { cache.put(DS.CACHE_DIRECTORY, JSON.stringify(directory), 60); } catch (err) { console.warn('Directory cache skipped: ' + err.message); }
  return directory;
}

function loadTodayDismissalsCached_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(DS.CACHE_QUEUE);
  if (cached) {
    try { return JSON.parse(cached).map(hydrateDismissalDates_); } catch (err) {}
  }
  const rows = loadTodayDismissalsFresh_();
  try { cache.put(DS.CACHE_QUEUE, JSON.stringify(rows.map(serializeForCache_)), 3); } catch (err) {}
  return rows;
}

function loadTodayDismissalsFresh_() {
  const sheet = getSpreadsheet_().getSheetByName(DS.SHEETS.DISMISSALS);
  if (sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 14).getValues();
  const today = todayKey_();
  return values.map((r, i) => rowToDismissal_(r, i + 2)).filter(r => r.sessionDate === today);
}

function findDismissalRow_(sheet, id) {
  if (!id || sheet.getLastRow() < 2) return null;
  const finder = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).createTextFinder(String(id)).matchEntireCell(true).findNext();
  if (!finder) return null;
  const row = finder.getRow();
  return { row: row, values: sheet.getRange(row, 1, 1, 14).getValues()[0] };
}

function rowToDismissal_(r, row) {
  return {
    row: row,
    dismissalId: String(r[0] || ''),
    sessionDate: String(r[1] || ''),
    studentId: String(r[2] || ''),
    pickupGroupId: String(r[3] || ''),
    studentName: String(r[4] || ''),
    grade: String(r[5] || ''),
    homeroom: String(r[6] || ''),
    pickupGroup: String(r[7] || ''),
    status: String(r[8] || 'CALLED'),
    claimedByEmail: String(r[9] || '').toLowerCase(),
    claimedByName: String(r[10] || ''),
    scannedAt: asDate_(r[11]),
    updatedAt: asDate_(r[12]),
    completedAt: r[13] ? asDate_(r[13]) : null
  };
}

function serializeDismissal_(r, dangerMinutes) {
  return {
    dismissalId: r.dismissalId,
    studentId: r.studentId,
    studentName: r.studentName,
    grade: r.grade,
    homeroom: r.homeroom,
    pickupGroup: r.pickupGroup,
    status: r.status,
    claimedByEmail: r.claimedByEmail,
    claimedByName: r.claimedByName,
    scannedAt: toIso_(r.scannedAt),
    updatedAt: toIso_(r.updatedAt),
    needsAttention: isProblemServer_(r, dangerMinutes)
  };
}

function clientStudent_(student, dismissal) {
  return {
    student: { id: student.id, name: student.name, grade: student.grade, homeroom: student.homeroom },
    dismissal: { dismissalId: dismissal.dismissalId, status: dismissal.status, scannedAt: toIso_(dismissal.scannedAt) }
  };
}

function isProblemServer_(r, dangerMinutes) {
  if (r.status === 'CANT_FIND' || r.status === 'CALL_AGAIN') return true;
  return (Date.now() - dateMs_(r.scannedAt)) >= dangerMinutes * 60000;
}

function requireOwnedClaim_(record, staff) {
  if (!record.claimedByEmail || record.claimedByEmail !== staff.email) throw new Error('This student is not claimed by you. Refresh the queue.');
}

function makeEvent_(dismissalId, type, staff, details) {
  return [Utilities.getUuid(), dismissalId || '', type, staff ? staff.email : '', staff ? staff.name : '', new Date(), String(details || '')];
}

function logEvents_(rows) {
  if (!rows || !rows.length) return;
  appendRows_(getSpreadsheet_().getSheetByName(DS.SHEETS.EVENTS), rows);
}

function appendRows_(sheet, rows) {
  if (!rows || !rows.length) return;
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function dataRows_(sheet, cols) {
  return sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, cols).getValues() : [];
}

function invalidateCaches_() {
  const cache = CacheService.getScriptCache();
  cache.remove(DS.CACHE_DIRECTORY);
  cache.remove(DS.CACHE_QUEUE);
}

function invalidateQueueCache_() {
  CacheService.getScriptCache().remove(DS.CACHE_QUEUE);
}

function todayKey_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'America/New_York', 'yyyy-MM-dd');
}

function sanitizeView_(view) {
  view = String(view || '').toLowerCase();
  return DS.VIEWS.indexOf(view) !== -1 ? view : 'dispatcher';
}

function truthy_(value) {
  if (value === true) return true;
  const s = String(value == null ? '' : value).trim().toLowerCase();
  return ['true', 'yes', 'y', '1', 'active'].indexOf(s) !== -1;
}

function asDate_(value) {
  if (value instanceof Date) return value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? new Date(0) : d;
}

function toIso_(value) {
  const d = asDate_(value);
  return d.toISOString();
}

function dateMs_(value) {
  return asDate_(value).getTime();
}

function serializeForCache_(r) {
  const out = Object.assign({}, r);
  out.scannedAt = toIso_(r.scannedAt);
  out.updatedAt = toIso_(r.updatedAt);
  out.completedAt = r.completedAt ? toIso_(r.completedAt) : null;
  return out;
}

function hydrateDismissalDates_(r) {
  r.scannedAt = asDate_(r.scannedAt);
  r.updatedAt = asDate_(r.updatedAt);
  r.completedAt = r.completedAt ? asDate_(r.completedAt) : null;
  return r;
}

function emptyStats_() { return { active: 0, problem: 0, completed: 0 }; }
function clamp_(n, min, max) { return Math.max(min, Math.min(max, n)); }
