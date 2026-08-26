const STORE_KEY = 'dismissal-prototype-v1';

const DEMO = {
  pickupGroups: [
    { id: 'pg1', name: 'Family 101', token: 'FAM-101', studentIds: ['s1', 's2'] },
    { id: 'pg2', name: 'Family 202', token: 'FAM-202', studentIds: ['s3'] },
    { id: 'pg3', name: 'Tuesday Carpool', token: 'CARPOOL-303', studentIds: ['s2', 's4'] }
  ],
  students: [
    { id: 's1', name: 'Demo Student A', grade: '3', homeroom: 'Room 3B' },
    { id: 's2', name: 'Demo Student B', grade: '5', homeroom: 'Room 5A' },
    { id: 's3', name: 'Demo Student C', grade: '2', homeroom: 'Room 2C' },
    { id: 's4', name: 'Demo Student D', grade: '4', homeroom: 'Room 4A' }
  ],
  dismissals: [],
  events: []
};

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (saved?.pickupGroups && saved?.students) return saved;
  } catch (_) {}
  const state = clone(DEMO);
  saveState(state);
  return state;
}

function saveState(state) {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent('dismissal-state-changed'));
}

function resetDemo() {
  localStorage.setItem(STORE_KEY, JSON.stringify(clone(DEMO)));
  window.dispatchEvent(new CustomEvent('dismissal-state-changed'));
}

function uid(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowISO() { return new Date().toISOString(); }

function findStudent(state, id) { return state.students.find(s => s.id === id); }
function findGroup(state, id) { return state.pickupGroups.find(g => g.id === id); }

function activeDismissals(state = loadState()) {
  return state.dismissals.filter(d => d.status !== 'COMPLETE').sort((a, b) => new Date(a.scannedAt) - new Date(b.scannedAt));
}

function scanPickupGroup(rawToken) {
  const token = String(rawToken || '').trim().toUpperCase();
  const state = loadState();
  const group = state.pickupGroups.find(g => g.token.toUpperCase() === token);
  if (!group) return { ok: false, message: 'Barcode not recognized.' };

  const created = [];
  const existing = [];
  for (const studentId of group.studentIds) {
    const student = findStudent(state, studentId);
    if (!student) continue;
    const open = state.dismissals.find(d => d.studentId === studentId && d.status !== 'COMPLETE');
    if (open) {
      existing.push({ dismissal: open, student });
      state.events.push({ id: uid('ev'), dismissalId: open.id, type: 'RESCANNED', at: nowISO(), actor: 'Scanner' });
      continue;
    }
    const dismissal = {
      id: uid('d'),
      studentId,
      pickupGroupId: group.id,
      scannedAt: nowISO(),
      status: 'CALLED',
      claimedBy: null,
      updatedAt: nowISO()
    };
    state.dismissals.push(dismissal);
    state.events.push({ id: uid('ev'), dismissalId: dismissal.id, type: 'SCANNED', at: dismissal.scannedAt, actor: 'Scanner' });
    created.push({ dismissal, student });
  }
  saveState(state);
  return { ok: true, group, created, existing };
}

function updateDismissal(id, status, actor = 'Staff') {
  const state = loadState();
  const dismissal = state.dismissals.find(d => d.id === id);
  if (!dismissal) return false;
  dismissal.status = status;
  dismissal.updatedAt = nowISO();
  if (status === 'CLAIMED') dismissal.claimedBy = actor;
  if (status === 'COMPLETE') dismissal.completedAt = nowISO();
  state.events.push({ id: uid('ev'), dismissalId: id, type: status, at: nowISO(), actor });
  saveState(state);
  return true;
}

function formatElapsed(iso) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function ageBand(iso) {
  const minutes = (Date.now() - new Date(iso).getTime()) / 60000;
  if (minutes >= 10) return 'danger';
  if (minutes >= 5) return 'warn';
  return 'normal';
}

function statusClass(status) {
  if (['CANT_FIND', 'CALL_AGAIN'].includes(status)) return 'problem';
  if (['CLAIMED', 'ON_WAY', 'AT_PICKUP'].includes(status)) return 'progress';
  return '';
}

function statusLabel(status) {
  return ({
    CALLED: 'Called',
    CLAIMED: 'Claimed',
    ON_WAY: 'On the way',
    CANT_FIND: "Can't find",
    CALL_AGAIN: 'Call again',
    AT_PICKUP: 'At pickup',
    COMPLETE: 'Complete'
  })[status] || status;
}

function renderQueue(target, options = {}) {
  const state = loadState();
  const rows = activeDismissals(state);
  const root = typeof target === 'string' ? document.querySelector(target) : target;
  if (!root) return;
  if (!rows.length) {
    root.innerHTML = '<div class="empty">No active dismissals. Scan a pickup barcode to begin.</div>';
    return;
  }
  root.innerHTML = rows.map(d => {
    const student = findStudent(state, d.studentId);
    const group = findGroup(state, d.pickupGroupId);
    const buttons = options.runner
      ? `<button class="btn accent" data-action="CLAIMED" data-id="${d.id}">Claim</button>
         <button class="btn secondary" data-action="ON_WAY" data-id="${d.id}">On way</button>
         <button class="btn warn" data-action="CANT_FIND" data-id="${d.id}">Can't find</button>
         <button class="btn" data-action="COMPLETE" data-id="${d.id}">Complete</button>`
      : `<button class="btn secondary" data-action="CALL_AGAIN" data-id="${d.id}">Call again</button>
         <button class="btn" data-action="COMPLETE" data-id="${d.id}">Complete</button>`;
    return `<article class="queue-card" data-age="${ageBand(d.scannedAt)}">
      <div>
        <div class="student-name">${student?.name || 'Unknown student'}</div>
        <div class="student-meta">Grade ${student?.grade || '—'} · ${student?.homeroom || '—'}</div>
      </div>
      <div>
        <span class="status-pill ${statusClass(d.status)}">${statusLabel(d.status)}</span>
        <div class="family-meta">${group?.name || 'Pickup group'}${d.claimedBy ? ` · ${d.claimedBy}` : ''}</div>
      </div>
      <div class="wait" data-time="${d.scannedAt}">${formatElapsed(d.scannedAt)}</div>
      <div class="actions">${buttons}</div>
    </article>`;
  }).join('');

  root.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      let actor = options.actor || 'Staff';
      if (btn.dataset.action === 'CLAIMED') {
        actor = sessionStorage.getItem('dismissal-actor') || prompt('Your name or initials:', 'Runner') || 'Runner';
        sessionStorage.setItem('dismissal-actor', actor);
      }
      updateDismissal(btn.dataset.id, btn.dataset.action, actor);
      renderQueue(root, options);
      if (options.onChange) options.onChange();
    });
  });
}

function updateTimers() {
  document.querySelectorAll('[data-time]').forEach(el => {
    el.textContent = formatElapsed(el.dataset.time);
    const card = el.closest('.queue-card');
    if (card) card.dataset.age = ageBand(el.dataset.time);
  });
}

function stats() {
  const state = loadState();
  const active = activeDismissals(state);
  const problem = active.filter(d => ['CANT_FIND', 'CALL_AGAIN'].includes(d.status));
  const fivePlus = active.filter(d => (Date.now() - new Date(d.scannedAt).getTime()) >= 300000);
  const completed = state.dismissals.filter(d => d.status === 'COMPLETE');
  return { active: active.length, problem: problem.length, fivePlus: fivePlus.length, completed: completed.length };
}

function bindLiveRefresh(callback) {
  window.addEventListener('storage', e => { if (e.key === STORE_KEY) callback(); });
  window.addEventListener('dismissal-state-changed', callback);
}

window.DismissalApp = {
  loadState,
  saveState,
  resetDemo,
  scanPickupGroup,
  updateDismissal,
  activeDismissals,
  renderQueue,
  updateTimers,
  stats,
  formatElapsed,
  bindLiveRefresh
};
