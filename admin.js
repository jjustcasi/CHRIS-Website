const ADMIN_SESSION_KEY = 'chris_admin_session';
const ADMIN_EMAIL = 'admin@chris.local';
const ADMIN_PASSWORD = 'admin123';

let selectedEmployeeEmail = '';

function getUsers() {
  return JSON.parse(localStorage.getItem('chris_users') || '[]');
}

function setAdminSession(active) {
  localStorage.setItem(ADMIN_SESSION_KEY, active ? '1' : '0');
}

function hasAdminSession() {
  return localStorage.getItem(ADMIN_SESSION_KEY) === '1';
}

function clearAdminSession() {
  localStorage.removeItem(ADMIN_SESSION_KEY);
}

function showAuthMessage(text, ok) {
  const msg = document.getElementById('adminAuthMessage');
  if (!msg) return;
  msg.textContent = text;
  msg.className = 'message';
  if (!text) return;
  msg.classList.add(ok ? 'ok' : 'err');
}

function userKey(type, email) {
  return 'chris_' + type + '_' + email;
}

function initializeAdminPortal() {
  if (hasAdminSession()) {
    openAdminPanel();
  } else {
    showAdminLogin();
  }
}

function showAdminLogin() {
  document.getElementById('adminLoginSection').classList.remove('hidden');
  document.getElementById('adminPanelSection').classList.add('hidden');
  document.getElementById('adminLogoutBtn').classList.add('hidden');
}

function openAdminPanel() {
  document.getElementById('adminLoginSection').classList.add('hidden');
  document.getElementById('adminPanelSection').classList.remove('hidden');
  document.getElementById('adminLogoutBtn').classList.remove('hidden');
  hydrateEmployeeSelect();
  renderGlobalAnnouncements();
}

function adminLogin() {
  const email = document.getElementById('adminEmail').value.trim().toLowerCase();
  const password = document.getElementById('adminPassword').value;

  if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
    showAuthMessage('Invalid admin credentials.', false);
    return;
  }

  setAdminSession(true);
  showAuthMessage('', true);
  openAdminPanel();
}

function adminLogout() {
  clearAdminSession();
  selectedEmployeeEmail = '';
  showAdminLogin();
}

function hydrateEmployeeSelect() {
  const select = document.getElementById('employeeSelect');
  const users = getUsers();

  select.innerHTML = '';
  if (!users.length) {
    select.innerHTML = '<option value="">No employees found</option>';
    selectedEmployeeEmail = '';
    document.getElementById('selectedEmployeeText').textContent = 'None';
    renderEmployeeLeaves();
    renderEmployeeAttendance();
    hydrateEmployeeEvaluation();
    return;
  }

  users.forEach(u => {
    const option = document.createElement('option');
    option.value = u.email;
    option.textContent = u.name + ' (' + u.email + ')';
    select.appendChild(option);
  });

  if (!selectedEmployeeEmail || !users.some(u => u.email === selectedEmployeeEmail)) {
    selectedEmployeeEmail = users[0].email;
  }

  select.value = selectedEmployeeEmail;
  selectEmployee();
}

function selectEmployee() {
  const select = document.getElementById('employeeSelect');
  selectedEmployeeEmail = select.value;

  const user = getUsers().find(u => u.email === selectedEmployeeEmail);
  document.getElementById('selectedEmployeeText').textContent = user
    ? user.name + ' (' + user.email + ')'
    : 'None';

  renderEmployeeLeaves();
  renderEmployeeAttendance();
  hydrateEmployeeEvaluation();
}

function getEmployeeLeaves() {
  if (!selectedEmployeeEmail) return [];
  return JSON.parse(localStorage.getItem(userKey('leaves', selectedEmployeeEmail)) || '[]');
}

function saveEmployeeLeaves(items) {
  if (!selectedEmployeeEmail) return;
  localStorage.setItem(userKey('leaves', selectedEmployeeEmail), JSON.stringify(items));
}

function updateEmployeeLeaveStatus(leaveId, status) {
  const items = getEmployeeLeaves().map(item =>
    item.id === leaveId ? { ...item, status } : item
  );
  saveEmployeeLeaves(items);
  renderEmployeeLeaves();
}

function renderEmployeeLeaves() {
  const tbody = document.querySelector('#adminLeaveTable tbody');
  tbody.innerHTML = '';

  const items = getEmployeeLeaves();
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="6">No leave requests for this employee.</td></tr>';
    return;
  }

  items.forEach(item => {
    const cssClass = (item.status || 'Pending').toLowerCase();
    const row = `
      <tr>
        <td>${item.type}</td>
        <td>${item.start}</td>
        <td>${item.end}</td>
        <td>${item.days}</td>
        <td><span class="status ${cssClass}">${item.status}</span></td>
        <td>
          <div class="actions">
            <button class="btn btn-success" onclick="updateEmployeeLeaveStatus(${item.id}, 'Approved')">Approve</button>
            <button class="btn btn-danger" onclick="updateEmployeeLeaveStatus(${item.id}, 'Rejected')">Reject</button>
          </div>
        </td>
      </tr>`;
    tbody.innerHTML += row;
  });
}

function getEmployeeEvaluation() {
  if (!selectedEmployeeEmail) return { status: '' };
  const raw = JSON.parse(localStorage.getItem(userKey('evaluation', selectedEmployeeEmail)) || '{"status":""}');

  if (raw.status === 'Pending' || raw.status === 'In Progress' || raw.status === 'Completed') {
    return { status: 'Good' };
  }

  return { status: raw.status || '' };
}

function hydrateEmployeeEvaluation() {
  const evaluation = getEmployeeEvaluation();
  document.getElementById('adminEvaluationStatus').value = evaluation.status || 'Good';
}

function saveEmployeeEvaluation() {
  if (!selectedEmployeeEmail) return;

  const payload = {
    status: document.getElementById('adminEvaluationStatus').value
  };
  localStorage.setItem(userKey('evaluation', selectedEmployeeEmail), JSON.stringify(payload));
}

function getEmployeeAttendance() {
  if (!selectedEmployeeEmail) return [];
  return JSON.parse(localStorage.getItem(userKey('attendance', selectedEmployeeEmail)) || '[]');
}

function saveEmployeeAttendance(items) {
  if (!selectedEmployeeEmail) return;
  localStorage.setItem(userKey('attendance', selectedEmployeeEmail), JSON.stringify(items));
}

function addEmployeeAttendance() {
  if (!selectedEmployeeEmail) return;

  let date = document.getElementById('adminAttendanceDate').value;
  const selected = document.querySelector('input[name="adminAttendanceStatus"]:checked');
  const status = selected ? selected.value : 'Present';
  if (!date) {
    date = new Date().toISOString().slice(0, 10);
    document.getElementById('adminAttendanceDate').value = date;
  }

  const items = getEmployeeAttendance();
  items.unshift({ id: Date.now(), date, status });
  saveEmployeeAttendance(items);
  renderEmployeeAttendance();
}

function removeEmployeeAttendance(id) {
  const items = getEmployeeAttendance().filter(item => item.id !== id);
  saveEmployeeAttendance(items);
  renderEmployeeAttendance();
}

function renderEmployeeAttendance() {
  const tbody = document.querySelector('#adminAttendanceTable tbody');
  tbody.innerHTML = '';

  const items = getEmployeeAttendance();
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="3">No attendance records for this employee.</td></tr>';
    return;
  }

  items.forEach(item => {
    const row = `
      <tr>
        <td>${item.date}</td>
        <td>${item.status}</td>
        <td><button class="btn btn-danger" onclick="removeEmployeeAttendance(${item.id})">Delete</button></td>
      </tr>`;
    tbody.innerHTML += row;
  });
}

function getGlobalAnnouncements() {
  return JSON.parse(localStorage.getItem('chris_global_announcements') || '[]');
}

function saveGlobalAnnouncements(items) {
  localStorage.setItem('chris_global_announcements', JSON.stringify(items));
}

function addGlobalAnnouncement() {
  const input = document.getElementById('adminAnnouncementInput');
  const text = input.value.trim();
  if (!text) return;

  const items = getGlobalAnnouncements();
  items.unshift({
    id: Date.now(),
    text,
    date: new Date().toISOString().slice(0, 10)
  });
  saveGlobalAnnouncements(items);
  input.value = '';
  renderGlobalAnnouncements();
}

function removeGlobalAnnouncement(id) {
  const items = getGlobalAnnouncements().filter(item => item.id !== id);
  saveGlobalAnnouncements(items);
  renderGlobalAnnouncements();
}

function renderGlobalAnnouncements() {
  const board = document.getElementById('adminAnnouncementBoard');
  board.innerHTML = '';

  const items = getGlobalAnnouncements();
  if (!items.length) {
    board.innerHTML = '<p class="form-note">No announcements posted yet.</p>';
    return;
  }

  items.forEach(item => {
    const block = document.createElement('div');
    block.className = 'announcement-item';
    block.innerHTML = `
      <div>
        <strong>${item.text}</strong>
        <p class="form-note">Posted: ${item.date}</p>
      </div>
      <button class="btn btn-danger" onclick="removeGlobalAnnouncement(${item.id})">Delete</button>`;
    board.appendChild(block);
  });
}
