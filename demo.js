(() => {
  'use strict';

  const params = new URLSearchParams(location.search);
  if (params.get('demo') !== '1') return;

  const DEVICE_KEY_STORAGE = 'dismissal-device-key-v1';
  const DEMO_STATE_STORAGE = 'dismissal-demo-state-v2';
  const DEMO_EMAIL = 'demo@local';
  const DEMO_NAME = 'Demo Device';

  const students = {
    'S-001': { id: 'S-001', name: 'Ava Morgan', grade: '3', homeroom: 'Room 3B', active: true },
    'S-002': { id: 'S-002', name: 'Liam Carter', grade: '5', homeroom: 'Room 5A', active: true },
    'S-003': { id: 'S-003', name: 'Noah Bennett', grade: '2', homeroom: 'Room 2C', active: true },
    'S-004': { id: 'S-004', name: 'Maya Chen', grade: '4', homeroom: 'Room 4A', active: true },
    'S-005': { id: 'S-005', name: 'Ethan Brooks', grade: '1', homeroom: 'Room 1D', active: true }
  };

  const groups = {
    'PG-101': { id: 'PG-101', name: 'Family 101', token: '101', type: 'family', studentIds: ['S-001', 'S-002'] },
    'PG-202': { id: 'PG-202', name: 'Family 202', token: '202', type: 'family', studentIds: ['S-003'] },
    'PG-303': { id: 'PG-303', name: 'Tuesday Carpool', token: '303', type: 'carpool', studentIds: ['S-004', 'S-005'] }
  };

  function isoMinutesAgo(minutes) {
    return new Date(Date.now() - minutes * 60000).toISOString();
  }

  function initialState() {
    return {
      version: 1,
      dismissals: [
        {
          dismissalId: 'W-001', studentId: 'W-001', studentName: 'Olivia Reed', grade: '6', homeroom: 'Room 6B',
          pickupGroup: 'Walker Pickup', status: 'CALLED', claimedByEmail: '', claimedByName: '', scannedAt: isoMinutesAgo(2), updatedAt: isoMinutesAgo(2)
        },
        {
          dismissalId: 'W-002', studentId: 'W-002', studentName: 'Jackson Hill', grade: '2', homeroom: 'Room 2A',
          pickupGroup: 'Family 550', status: 'CALL_AGAIN', claimedByEmail: '', claimedByName: '', scannedAt: isoMinutesAgo(12), updatedAt: isoMinutesAgo(1)
        },
        {
          dismissalId: 'W-003', studentId: 'W-003', studentName: 'Sophia Patel', grade: '4', homeroom: 'Room 4C',
          pickupGroup: 'Afternoon Carpool', status: 'CALLED', claimedByEmail: '', claimedByName: '', scannedAt: isoMinutesAgo(7), updatedAt: isoMinutesAgo(7)
        }
      ]
    };
  }

  function loadState() {
    try {
      const raw = sessionStorage.getItem(DEMO_STATE_STORAGE);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    const fresh = initialState();
    saveState(fresh);
    return fresh;
  }

  function saveState(next) {
    try { sessionStorage.setItem(DEMO_STATE_STORAGE, JSON.stringify(next)); } catch (_) {}
  }

  let state = loadState();

  const originalGetItem = Storage.prototype.getItem;
  Storage.prototype.getItem = function(key) {
    if (this === localStorage && key === DEVICE_KEY_STORAGE) return 'demo-local';
    return originalGetItem.call(this, key);
  };

  const originalSubmit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function() {
    const requestId = this.querySelector('[name="requestId"]')?.value;
    const action = this.querySelector('[name="action"]')?.value;
    const payloadText = this.querySelector('[name="payload"]')?.value;
    if (!requestId || !action) return originalSubmit.call(this);

    let payload = {};
    try { payload = payloadText ? JSON.parse(payloadText) : {}; } catch (_) {}

    setTimeout(() => {
      try {
        const data = handle(action, payload);
        window.dispatchEvent(new MessageEvent('message', {
          origin: 'https://script.google.com',
          data: { ok: true, requestId, data }
        }));
      } catch (err) {
        window.dispatchEvent(new MessageEvent('message', {
          origin: 'https://script.google.com',
          data: { ok: false, requestId, error: err?.message || String(err) }
        }));
      }
    }, 35);
  };

  function handle(action, payload) {
    if (action === 'bootstrap') return bootstrap(payload.view);
    if (action === 'queue') return queue(payload.view);
    if (action === 'scan') return scan(payload.code);
    if (action === 'update') return update(payload.dismissalId, payload.action);
    if (action === 'search') return search(payload.query);
    if (action === 'resetToday') return resetToday();
    throw new Error('Unknown demo action.');
  }

  function bootstrap(requestedView) {
    const allowedViews = ['dispatcher', 'scanner', 'runner', 'admin'];
    const view = allowedViews.includes(requestedView) ? requestedView : 'dispatcher';
    return {
      version: 'demo-local-v2',
      user: { email: DEMO_EMAIL, name: DEMO_NAME, roles: ['admin'] },
      view,
      allowedViews,
      settings: {
        schoolName: 'Dismissal Demo',
        warningMinutes: 5,
        dangerMinutes: 10,
        pollIntervalMs: 4000
      }
    };
  }

  function queue(view) {
    let rows = state.dismissals.filter(row => row.status !== 'COMPLETE').map(withAttention);

    if (view === 'runner') {
      rows = rows.filter(row => {
        const waiting = row.status === 'CALLED' || row.status === 'CALL_AGAIN';
        const available = waiting && (!row.claimedByEmail || row.claimedByEmail === DEMO_EMAIL);
        const mine = row.claimedByEmail === DEMO_EMAIL && (row.status === 'CLAIMED' || row.status === 'CANT_FIND');
        return available || mine;
      });
      rows.sort((a, b) => {
        const aMine = a.claimedByEmail === DEMO_EMAIL;
        const bMine = b.claimedByEmail === DEMO_EMAIL;
        if (aMine !== bMine) return Number(bMine) - Number(aMine);
        return new Date(a.scannedAt) - new Date(b.scannedAt);
      });
    } else {
      rows.sort((a, b) => {
        if (a.needsAttention !== b.needsAttention) return Number(b.needsAttention) - Number(a.needsAttention);
        return new Date(a.scannedAt) - new Date(b.scannedAt);
      });
    }

    const all = state.dismissals;
    const active = all.filter(row => row.status !== 'COMPLETE');
    const completed = all.filter(row => row.status === 'COMPLETE');
    const problem = active.filter(row => withAttention(row).needsAttention);

    return {
      version: String(state.version),
      rows,
      stats: { active: active.length, problem: problem.length, completed: completed.length }
    };
  }

  function withAttention(row) {
    const danger = row.status === 'CANT_FIND' || row.status === 'CALL_AGAIN' || (Date.now() - new Date(row.scannedAt).getTime()) >= 10 * 60000;
    return { ...row, needsAttention: danger };
  }

  function normalizedDynamicId(code) {
    const clean = code.replace(/[^A-Z0-9]/g, '').slice(0, 24) || 'CODE';
    return `DYN-${clean}`;
  }

  function ensureDemoGroup(code) {
    const existing = Object.values(groups).find(item => item.token.toUpperCase() === code);
    if (existing) return existing;

    const id = normalizedDynamicId(code);
    const studentId = `${id}-S`;
    if (!students[studentId]) {
      students[studentId] = {
        id: studentId,
        name: `Demo Student ${code}`,
        grade: '3',
        homeroom: 'Demo Room',
        active: true
      };
    }
    if (!groups[id]) {
      groups[id] = {
        id,
        name: `Demo Pickup ${code}`,
        token: code,
        type: 'demo',
        studentIds: [studentId]
      };
    }
    return groups[id];
  }

  function scan(rawCode) {
    const code = String(rawCode || '').trim().toUpperCase();
    if (!code) throw new Error('No barcode was received.');

    const group = ensureDemoGroup(code);
    const created = [];
    const existing = [];

    group.studentIds.forEach(studentId => {
      const student = students[studentId];
      const open = state.dismissals.find(row => row.studentId === studentId && row.status !== 'COMPLETE');
      if (open) {
        existing.push({ student, dismissal: { dismissalId: open.dismissalId, status: open.status, scannedAt: open.scannedAt } });
        return;
      }

      const now = new Date().toISOString();
      const dismissal = {
        dismissalId: `D-${Date.now()}-${studentId}`,
        studentId: student.id,
        studentName: student.name,
        grade: student.grade,
        homeroom: student.homeroom,
        pickupGroup: group.name,
        status: 'CALLED',
        claimedByEmail: '',
        claimedByName: '',
        scannedAt: now,
        updatedAt: now
      };
      state.dismissals.push(dismissal);
      created.push({ student, dismissal: { dismissalId: dismissal.dismissalId, status: dismissal.status, scannedAt: dismissal.scannedAt } });
    });

    bump();
    return { group: { id: group.id, name: group.name }, created, existing };
  }

  function update(dismissalId, rawAction) {
    const row = state.dismissals.find(item => item.dismissalId === dismissalId);
    if (!row || row.status === 'COMPLETE') throw new Error('This dismissal is no longer active.');

    const action = String(rawAction || '').toUpperCase();
    if (action === 'CLAIM') {
      if (!['CALLED', 'CALL_AGAIN'].includes(row.status)) throw new Error('This student is no longer available to claim.');
      row.status = 'CLAIMED';
      row.claimedByEmail = DEMO_EMAIL;
      row.claimedByName = DEMO_NAME;
    } else if (action === 'ON_WAY') {
      requireMine(row);
      row.status = 'ON_WAY';
    } else if (action === 'CANT_FIND') {
      requireMine(row);
      row.status = 'CANT_FIND';
    } else if (action === 'RELEASE') {
      requireMine(row);
      row.status = 'CALLED';
      row.claimedByEmail = '';
      row.claimedByName = '';
    } else if (action === 'COMPLETE') {
      row.status = 'COMPLETE';
    } else if (action === 'CALL_AGAIN') {
      row.status = 'CALL_AGAIN';
    } else {
      throw new Error('Unknown dismissal action.');
    }

    row.updatedAt = new Date().toISOString();
    bump();
    return { status: row.status, claimedByName: row.claimedByName || '' };
  }

  function requireMine(row) {
    if (row.claimedByEmail !== DEMO_EMAIL) throw new Error('This student is not claimed by you.');
  }

  function search(rawQuery) {
    const query = String(rawQuery || '').trim().toLowerCase();
    if (!query) return { total: 0, groups: [] };

    const matches = Object.values(groups).filter(group => {
      const memberStudents = group.studentIds.map(id => students[id]).filter(Boolean);
      const haystack = [group.name, group.token, group.type]
        .concat(memberStudents.flatMap(student => [student.name, student.grade, student.homeroom, student.id]))
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });

    return {
      total: matches.length,
      groups: matches.map(group => ({
        id: group.id,
        name: group.name,
        token: group.token,
        type: group.type,
        students: group.studentIds.map(id => students[id]).filter(Boolean).map(student => ({
          id: student.id,
          name: student.name,
          grade: student.grade,
          homeroom: student.homeroom
        }))
      }))
    };
  }

  function resetToday() {
    state = initialState();
    bump();
    return { ok: true };
  }

  function bump() {
    state.version += 1;
    saveState(state);
  }

  document.addEventListener('click', event => {
    const button = event.target.closest?.('#disconnectDevice');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    sessionStorage.removeItem(DEMO_STATE_STORAGE);
    location.reload();
  }, true);

  const observer = new MutationObserver(() => {
    const button = document.getElementById('disconnectDevice');
    if (button) button.textContent = 'Restart demo';
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
