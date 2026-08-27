const STORE_KEY = 'dismissal-prototype-v1';
const ACTOR_KEY = 'dismissal-actor';

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
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (saved?.pickupGroups && saved?.students && saved?.dismissals) return saved;
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
function getActor() { return sessionStorage.getItem(ACTOR_KEY) || ''; }
function setActor(name) {
  const clean = String(name || '').trim();
  if (clean) sessionStorage.setItem(ACTOR_KEY, clean);
  return clean;
}

function activeDismissals(state = loadState()) {
  return state.dismissals
    .filter(d => d.status !== 'COMPLETE')
    .sort((a, b) => new Date(a.scannedAt) - new Date(b.scannedAt));
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
  if (status === 'CALLED') dismissal.claimedBy = null;
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

function statusLabel(status) {
  return ({
    CALLED: 'Waiting',
    CLAIMED: 'Being picked up',
    ON_WAY: 'On the way',
    CANT_FIND: "Can't find",
    CALL_AGAIN: 'Call again',
    AT_PICKUP: 'At pickup',
    COMPLETE: 'Complete'
  })[status] || status;
}

function isProblem(dismissal) {
  return ['CANT_FIND', 'CALL_AGAIN'].includes(dismissal.status) || ageBand(dismissal.scannedAt) === 'danger';
}

function statusClass(dismissal) {
  if (isProblem(dismissal)) return 'problem';
  if (['CLAIMED', 'ON_WAY', 'AT_PICKUP'].includes(dismissal.status)) return 'progress';
  return '';
}

function sortForRole(rows, role, actor) {
  return [...rows].sort((a, b) => {
    if (role === 'dispatcher') {
      const problemDiff = Number(isProblem(b)) - Number(isProblem(a));
      if (problemDiff) return problemDiff;
    }
    if (role === 'runner') {
      const aMine = a.claimedBy && a.claimedBy === actor;
      const bMine = b.claimedBy && b.claimedBy === actor;
      if (aMine !== bMine) return Number(bMine) - Number(aMine);
      const aOpen = a.status === 'CALLED' || a.status === 'CALL_AGAIN';
      const bOpen = b.status === 'CALLED' || b.status === 'CALL_AGAIN';
      if (aOpen !== bOpen) return Number(bOpen) - Number(aOpen);
    }
    return new Date(a.scannedAt) - new Date(b.scannedAt);
  });
}

function cardHint(dismissal, role, actor) {
  if (role === 'runner') {
    if (dismissal.claimedBy === actor && dismissal.status === 'CLAIMED') return 'Tap when you find them';
    if (dismissal.status === 'CALLED' || dismissal.status === 'CALL_AGAIN') return 'Tap to get student';
    if (dismissal.status === 'CANT_FIND' && dismissal.claimedBy === actor) return 'Tap when found';
    if (dismissal.claimedBy && dismissal.claimedBy !== actor) return `${dismissal.claimedBy} is handling this`;
    return 'Tap for details';
  }
  return 'Tap for options';
}

function renderQueue(target, options = {}) {
  const state = loadState();
  const role = options.role || (options.runner ? 'runner' : 'dispatcher');
  const actor = options.actor || getActor() || 'Runner';
  const rows = sortForRole(activeDismissals(state), role, actor);
  const root = typeof target === 'string' ? document.querySelector(target) : target;
  if (!root) return;

  if (!rows.length) {
    root.innerHTML = `<div class="empty-state"><div class="empty-icon">✓</div><strong>All clear</strong><span>No students are waiting right now.</span></div>`;
    return;
  }

  root.innerHTML = rows.map(d => {
    const student = findStudent(state, d.studentId);
    const group = findGroup(state, d.pickupGroupId);
    const claimedText = d.claimedBy ? ` · ${escapeHtml(d.claimedBy)}` : '';
    return `<button class="student-card" type="button" data-dismissal-id="${escapeHtml(d.id)}" data-age="${ageBand(d.scannedAt)}">
      <div class="student-card-main">
        <div class="student-name">${escapeHtml(student?.name || 'Unknown student')}</div>
        <div class="student-meta">Grade ${escapeHtml(student?.grade || '—')} · ${escapeHtml(student?.homeroom || '—')}</div>
        <div class="pickup-meta">${escapeHtml(group?.name || 'Pickup group')}</div>
      </div>
      <div class="student-card-side">
        <div class="wait" data-time="${escapeHtml(d.scannedAt)}">${formatElapsed(d.scannedAt)}</div>
        <div class="status-pill ${statusClass(d)}">${escapeHtml(statusLabel(d.status))}${claimedText}</div>
      </div>
      <div class="card-hint">${escapeHtml(cardHint(d, role, actor))}<span aria-hidden="true">›</span></div>
    </button>`;
  }).join('');

  root.querySelectorAll('[data-dismissal-id]').forEach(card => {
    card.addEventListener('click', () => openDismissalModal(card.dataset.dismissalId, { ...options, role, actor }));
  });
}

function ensureModalRoot() {
  let root = document.querySelector('#appModal');
  if (root) return root;
  root = document.createElement('div');
  root.id = 'appModal';
  root.className = 'modal-layer';
  root.hidden = true;
  root.innerHTML = `<div class="modal-backdrop" data-modal-close></div>
    <section class="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <div class="modal-grab" aria-hidden="true"></div>
      <div id="modalContent"></div>
    </section>`;
  document.body.appendChild(root);
  root.addEventListener('click', e => {
    if (e.target.closest('[data-modal-close]')) closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !root.hidden) closeModal();
  });
  return root;
}

function openModal({ eyebrow = '', title, body = '', actions = [], dismissible = true }) {
  const root = ensureModalRoot();
  const content = root.querySelector('#modalContent');
  content.innerHTML = `${eyebrow ? `<div class="modal-eyebrow">${escapeHtml(eyebrow)}</div>` : ''}
    <h2 id="modalTitle">${escapeHtml(title)}</h2>
    ${body ? `<div class="modal-body">${body}</div>` : ''}
    <div class="modal-actions">
      ${actions.map((a, i) => `<button type="button" class="modal-action ${escapeHtml(a.kind || (i === 0 ? 'primary' : 'secondary'))}" data-modal-action="${i}">${escapeHtml(a.label)}</button>`).join('')}
      ${dismissible ? `<button type="button" class="modal-cancel" data-modal-close>Cancel</button>` : ''}
    </div>`;
  root.hidden = false;
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => root.classList.add('show'));
  content.querySelectorAll('[data-modal-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = actions[Number(btn.dataset.modalAction)];
      if (!action?.onClick) return;
      btn.disabled = true;
      await action.onClick();
      if (action.keepOpen) btn.disabled = false;
      else closeModal();
    });
  });
  setTimeout(() => content.querySelector('.modal-action, input, [data-modal-close]')?.focus(), 40);
}

function closeModal() {
  const root = document.querySelector('#appModal');
  if (!root || root.hidden) return;
  root.classList.remove('show');
  document.body.classList.remove('modal-open');
  setTimeout(() => { root.hidden = true; }, 160);
}

function personSummary(student, dismissal, group) {
  return `<div class="modal-person">
    <div class="modal-person-name">${escapeHtml(student?.name || 'Unknown student')}</div>
    <div>Grade ${escapeHtml(student?.grade || '—')} · ${escapeHtml(student?.homeroom || '—')}</div>
    <div>${escapeHtml(group?.name || 'Pickup group')}</div>
    <div class="modal-wait">Waiting ${formatElapsed(dismissal.scannedAt)}</div>
  </div>`;
}

function openDismissalModal(id, options = {}) {
  const state = loadState();
  const dismissal = state.dismissals.find(d => d.id === id);
  if (!dismissal) return;
  const student = findStudent(state, dismissal.studentId);
  const group = findGroup(state, dismissal.pickupGroupId);
  const role = options.role || 'dispatcher';
  const actor = options.actor || getActor() || 'Runner';
  const refresh = () => options.onChange?.();
  const body = personSummary(student, dismissal, group);
  let actions = [];

  if (role === 'runner') {
    const mine = dismissal.claimedBy === actor;
    const available = dismissal.status === 'CALLED' || dismissal.status === 'CALL_AGAIN';
    if (available && (!dismissal.claimedBy || mine)) {
      actions.push({ label: `I'm getting ${student?.name?.split(' ')[0] || 'them'}`, kind: 'primary', onClick: () => { updateDismissal(id, 'CLAIMED', actor); refresh(); } });
    } else if (mine && dismissal.status === 'CLAIMED') {
      actions.push({ label: 'Student is on the way', kind: 'primary', onClick: () => { updateDismissal(id, 'ON_WAY', actor); refresh(); } });
      actions.push({ label: "I can't find them", kind: 'warning', onClick: () => { updateDismissal(id, 'CANT_FIND', actor); refresh(); } });
      actions.push({ label: 'Release student', kind: 'quiet', onClick: () => { updateDismissal(id, 'CALLED', actor); refresh(); } });
    } else if (mine && dismissal.status === 'CANT_FIND') {
      actions.push({ label: 'Found them — on the way', kind: 'primary', onClick: () => { updateDismissal(id, 'ON_WAY', actor); refresh(); } });
      actions.push({ label: 'Release student', kind: 'quiet', onClick: () => { updateDismissal(id, 'CALLED', actor); refresh(); } });
    } else if (dismissal.status === 'ON_WAY') {
      actions.push({ label: 'Got it', kind: 'secondary', onClick: () => {} });
    } else if (dismissal.claimedBy && !mine) {
      actions.push({ label: 'Got it', kind: 'secondary', onClick: () => {} });
    }
  } else {
    actions.push({ label: 'Student is here', kind: 'primary', onClick: () => { updateDismissal(id, 'COMPLETE', actor || 'Dispatcher'); refresh(); } });
    actions.push({ label: 'Call again', kind: isProblem(dismissal) ? 'warning' : 'secondary', onClick: () => { updateDismissal(id, 'CALL_AGAIN', actor || 'Dispatcher'); refresh(); } });
  }

  openModal({
    eyebrow: role === 'runner' ? statusLabel(dismissal.status) : (isProblem(dismissal) ? 'Needs attention' : statusLabel(dismissal.status)),
    title: student?.name || 'Student',
    body,
    actions
  });
}

function openNameModal({ required = false, onSave } = {}) {
  const root = ensureModalRoot();
  const content = root.querySelector('#modalContent');
  const current = getActor();
  content.innerHTML = `<div class="modal-eyebrow">Runner</div>
    <h2 id="modalTitle">Who are you?</h2>
    <div class="modal-body"><p>Enter your name or initials once. Other staff will see who is getting a student.</p>
      <label class="field-label" for="runnerNameInput">Name or initials</label>
      <input id="runnerNameInput" class="modal-input" maxlength="30" autocomplete="name" value="${escapeHtml(current)}" placeholder="Example: JO">
    </div>
    <div class="modal-actions">
      <button type="button" class="modal-action primary" id="saveRunnerName">Continue</button>
      ${required ? '' : '<button type="button" class="modal-cancel" data-modal-close>Cancel</button>'}
    </div>`;
  root.hidden = false;
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => root.classList.add('show'));
  const input = content.querySelector('#runnerNameInput');
  const save = () => {
    const value = setActor(input.value);
    if (!value) {
      input.classList.add('input-error');
      input.focus();
      return;
    }
    closeModal();
    onSave?.(value);
  };
  content.querySelector('#saveRunnerName').addEventListener('click', save);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
  setTimeout(() => input.focus(), 40);
}

function openAppMenu(currentPage = '') {
  const links = [
    ['dispatcher', 'index.html', 'Dispatcher'],
    ['scanner', 'scanner.html', 'Scanner'],
    ['runner', 'runner.html', 'Runner'],
    ['admin', 'admin.html', 'Admin']
  ];
  const body = `<div class="menu-list">${links.map(([key, href, label]) =>
    `<a class="menu-link ${key === currentPage ? 'current' : ''}" href="${href}">${escapeHtml(label)}${key === currentPage ? '<span>Current</span>' : '<span>›</span>'}</a>`
  ).join('')}</div>`;
  openModal({ eyebrow: 'Dismissal', title: 'Switch screen', body, actions: [], dismissible: true });
}

function bindMenu(currentPage) {
  document.querySelectorAll('[data-app-menu]').forEach(btn => btn.addEventListener('click', () => openAppMenu(currentPage)));
}

function updateTimers() {
  document.querySelectorAll('[data-time]').forEach(el => {
    el.textContent = formatElapsed(el.dataset.time);
    const card = el.closest('.student-card');
    if (card) card.dataset.age = ageBand(el.dataset.time);
  });
}

function stats() {
  const state = loadState();
  const active = activeDismissals(state);
  const problem = active.filter(isProblem);
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
  bindLiveRefresh,
  getActor,
  setActor,
  openNameModal,
  openModal,
  closeModal,
  openAppMenu,
  bindMenu,
  escapeHtml
};
