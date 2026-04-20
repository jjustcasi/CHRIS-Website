const ADMIN_NAME = 'Admin';

let selectedEmployeeEmail = '';
let currentLeaveInModal = null;
let adminUsers = [];
let allLeavesCache = [];
let latestOverviewSummary = null;
const hrCache = {
  leavesByEmail: {},
  attendanceByEmail: {},
  trainingsByEmail: {},
  evaluationsByEmail: {},
  announcements: [],
};

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '-';
  return date.toLocaleString();
}

function getSessionEmail() {
  return (typeof getSession === 'function' ? getSession() : localStorage.getItem('chris_session') || '').toLowerCase();
}

async function apiGet(url) {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || 'Request failed');
  return data;
}

async function apiSend(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || 'Request failed');
  return data;
}

async function loadUsersFromApi() {
  const requesterEmail = getSessionEmail();
  const data = await apiGet('/api/admin/users?requesterEmail=' + encodeURIComponent(requesterEmail));
  adminUsers = data.users || [];
}

async function loadAllLeavesFromApi() {
  const data = await apiGet('/api/hr/leaves');
  allLeavesCache = (data.items || []).map(item => ({
    ...item,
    start: item.start || item.startDate,
    end: item.end || item.endDate,
  }));

  hrCache.leavesByEmail = {};
  allLeavesCache.forEach(item => {
    const email = (item.employeeEmail || '').toLowerCase();
    if (!email) return;
    if (!hrCache.leavesByEmail[email]) hrCache.leavesByEmail[email] = [];
    hrCache.leavesByEmail[email].push(item);
  });
}

async function loadAnnouncementsFromApi() {
  const data = await apiGet('/api/hr/announcements');
  hrCache.announcements = (data.items || []).map(item => ({
    id: Number(item.id),
    title: item.title,
    description: item.description,
    image: item.image || '',
    visible: item.visible !== false && item.visible !== 0,
    date: item.date,
  }));
}

async function loadEmployeeSnapshot(email) {
  const normalizedEmail = String(email || '').toLowerCase();
  if (!normalizedEmail) return;

  const data = await apiGet('/api/hr/snapshot?email=' + encodeURIComponent(normalizedEmail));
  const snapshot = data.snapshot || {};
  hrCache.leavesByEmail[normalizedEmail] = (snapshot.leaves || []).map(item => ({ ...item, employeeEmail: normalizedEmail }));
  hrCache.attendanceByEmail[normalizedEmail] = snapshot.attendance || [];
  hrCache.trainingsByEmail[normalizedEmail] = snapshot.trainings || [];
  hrCache.evaluationsByEmail[normalizedEmail] = snapshot.evaluation || { status: '' };

  allLeavesCache = allLeavesCache.filter(item => item.employeeEmail !== normalizedEmail).concat(hrCache.leavesByEmail[normalizedEmail]);
}

function getUsers() {
  return adminUsers;
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

function dismissAdminHint() {
  localStorage.setItem('chris_admin_hint_dismissed', '1');
  const hint = document.getElementById('adminOnboardingHint');
  if (hint) hint.classList.add('hidden');
}

function hydrateAdminHint() {
  const hint = document.getElementById('adminOnboardingHint');
  if (!hint) return;
  hint.classList.toggle('hidden', localStorage.getItem('chris_admin_hint_dismissed') === '1');
}

async function initializeAdminPortal() {
  const sessionEmail = getSession();
  const role = getUserRole();
  if (!sessionEmail || role !== 'admin') {
    window.location.href = 'login.html';
    return;
  }

  await openAdminPanel();
  setAdminProfile();
  hydrateAdminHint();
  // Check for leave notifications
  checkForNewLeaveNotifications();
  // Poll for new leave requests every 2 seconds
  setInterval(checkForNewLeaveNotifications, 2000);
}

function setAdminProfile() {
  const avatar = document.getElementById('adminProfileAvatar');
  const name = document.getElementById('adminProfileName');
  if (avatar) avatar.textContent = getInitials(ADMIN_NAME);
  if (name) name.textContent = getFirstName(ADMIN_NAME);
}

function getFirstName(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[0] : 'Admin';
}

function getInitials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'A';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

async function openAdminPanel() {
  document.getElementById('adminDashboardSection').classList.remove('hidden');
  document.getElementById('adminLogoutBtn').classList.remove('hidden');

  await loadUsersFromApi();
  await Promise.all([loadAllLeavesFromApi(), loadAnnouncementsFromApi()]);
  populateOverviewDepartmentFilter();
  
  // Show overview page by default
  showAdminPage('overview');
  await renderAdminOverview();
  
  hydrateEmployeeSelect();
  renderGlobalAnnouncements();
}

function adminLogout() {
  clearSession();
  selectedEmployeeEmail = '';
  lastNotificationIds = [];
  localStorage.removeItem('admin_last_notification_ids');
  window.location.href = 'index.html';
}

function hydrateEmployeeSelect() {
  const users = getUsers();

  hydrateSelectOptions('employeeSelect', users);
  hydrateSelectOptions('civhrEmployeeSelect', users);
  hydrateSelectOptions('trainingEmployeeSelect', users);
  
  if (!users.length) {
    selectedEmployeeEmail = '';
    const selectedText = document.getElementById('selectedEmployeeText');
    if (selectedText) selectedText.textContent = 'None';
    renderEmployeeLeaves();
    renderEmployeeAttendance();
    hydrateEmployeeEvaluation();
    renderPersonalDataSheet();
    renderTrainingMonitoring();
    return;
  }

  if (!selectedEmployeeEmail || !users.some(u => u.email === selectedEmployeeEmail)) {
    selectedEmployeeEmail = users[0].email;
  }

  syncEmployeeSelectors();
  selectEmployee();
}

function renderEmployeeDirectory() {
  const tbody = document.querySelector('#employeeDirectoryTable tbody');
  if (!tbody) return;

  const query = String(document.getElementById('employeeDirectorySearch')?.value || '').trim().toLowerCase();
  const users = getUsers().filter(user => {
    if (!query) return true;
    const haystack = [user.name, user.email, user.department, user.position].join(' ').toLowerCase();
    return haystack.includes(query);
  });

  tbody.innerHTML = '';
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="5">No matching employees found.</td></tr>';
    return;
  }

  users.forEach(user => {
    const row = `
      <tr>
        <td>${user.name || '-'}</td>
        <td>${user.email || '-'}</td>
        <td>${user.department || '-'}</td>
        <td>${user.position || '-'}</td>
        <td><button class="btn btn-outline" onclick="selectEmployeeByEmail('${String(user.email || '').replace(/'/g, "\\'")}')">Select</button></td>
      </tr>`;
    tbody.innerHTML += row;
  });
}

function selectEmployeeByEmail(email) {
  selectedEmployeeEmail = String(email || '').toLowerCase();
  syncEmployeeSelectors();
  selectEmployee();
}

async function selectEmployee() {
  const select = document.getElementById('employeeSelect');
  selectedEmployeeEmail = select ? select.value : selectedEmployeeEmail;
  syncEmployeeSelectors();

  if (selectedEmployeeEmail) {
    await loadEmployeeSnapshot(selectedEmployeeEmail);
  }

  const user = getUsers().find(u => u.email === selectedEmployeeEmail);
  const selectedText = document.getElementById('selectedEmployeeText');
  if (selectedText) {
    selectedText.textContent = user ? user.name + ' (' + user.email + ')' : 'None';
  }

  // Render supporting panels/pages
  renderPersonalDataSheet();
  renderLeaveMonitoring();
  renderTrainingMonitoring();

  // Render main content
  renderEmployeeLeaves();
  renderEmployeeAttendance();
  hydrateEmployeeEvaluation();
}

function hydrateSelectOptions(selectId, users) {
  const select = document.getElementById(selectId);
  if (!select) return;

  select.innerHTML = '<option value="">-- Select Employee --</option>';
  users.forEach(u => {
    const option = document.createElement('option');
    option.value = u.email;
    option.textContent = u.name + ' (' + u.email + ')';
    select.appendChild(option);
  });
}

function syncEmployeeSelectors() {
  ['employeeSelect', 'civhrEmployeeSelect', 'trainingEmployeeSelect'].forEach(id => {
    const select = document.getElementById(id);
    if (select) select.value = selectedEmployeeEmail || '';
  });
}

function selectEmployeeFrom(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  selectedEmployeeEmail = select.value;
  syncEmployeeSelectors();
  selectEmployee();
}

function switchAdminSidebarTab(tabName) {
  // Hide all panels
  document.getElementById('personalDataPanel').style.display = 'none';
  document.getElementById('leaveMonitoringPanel').style.display = 'none';
  document.getElementById('trainingMonitoringPanel').style.display = 'none';

  // Remove active class from all buttons
  document.getElementById('personalDataBtn').classList.remove('active');
  document.getElementById('leaveMonitoringBtn').classList.remove('active');
  document.getElementById('trainingMonitoringBtn').classList.remove('active');

  // Show selected panel and mark button as active
  if (tabName === 'personal') {
    document.getElementById('personalDataPanel').style.display = 'block';
    document.getElementById('personalDataBtn').classList.add('active');
  } else if (tabName === 'leave') {
    document.getElementById('leaveMonitoringPanel').style.display = 'block';
    document.getElementById('leaveMonitoringBtn').classList.add('active');
    renderLeaveMonitoring(); // Refresh the leave monitoring to show latest
  } else if (tabName === 'training') {
    document.getElementById('trainingMonitoringPanel').style.display = 'block';
    document.getElementById('trainingMonitoringBtn').classList.add('active');
  }
}

function getEmployeeLeaves() {
  if (!selectedEmployeeEmail) return [];
  return hrCache.leavesByEmail[selectedEmployeeEmail] || [];
}

function saveEmployeeLeaves(items) {
  if (!selectedEmployeeEmail) return;
  hrCache.leavesByEmail[selectedEmployeeEmail] = items;
  allLeavesCache = allLeavesCache.filter(item => item.employeeEmail !== selectedEmployeeEmail).concat(items.map(item => ({ ...item, employeeEmail: selectedEmployeeEmail })));
  apiSend('/api/hr/leaves', 'PUT', { email: selectedEmployeeEmail, items }).catch(() => {});
}

function updateEmployeeLeaveStatus(leaveId, status) {
  const items = getEmployeeLeaves().map(item =>
    item.id === leaveId ? { ...item, status } : item
  );
  saveEmployeeLeaves(items);
  logAdminAction('Update Leave Status', selectedEmployeeEmail, `Leave #${leaveId} marked as ${status}`);
  renderEmployeeLeaves();
  renderLeaveMonitoring();
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
  const raw = hrCache.evaluationsByEmail[selectedEmployeeEmail] || { status: '' };

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
  hrCache.evaluationsByEmail[selectedEmployeeEmail] = payload;
  apiSend('/api/hr/evaluations', 'PUT', { email: selectedEmployeeEmail, status: payload.status }).catch(() => {});
  logAdminAction('Save Evaluation', selectedEmployeeEmail, `Rating set to ${payload.status}`);
}

function getEmployeeAttendance() {
  if (!selectedEmployeeEmail) return [];
  return hrCache.attendanceByEmail[selectedEmployeeEmail] || [];
}

function saveEmployeeAttendance(items) {
  if (!selectedEmployeeEmail) return;
  hrCache.attendanceByEmail[selectedEmployeeEmail] = items;
  apiSend('/api/hr/attendance', 'PUT', { email: selectedEmployeeEmail, items }).catch(() => {});
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
  logAdminAction('Add Attendance', selectedEmployeeEmail, `${date} marked as ${status}`);
  renderEmployeeAttendance();
}

function removeEmployeeAttendance(id) {
  const items = getEmployeeAttendance().filter(item => item.id !== id);
  saveEmployeeAttendance(items);
  logAdminAction('Delete Attendance', selectedEmployeeEmail, `Removed attendance record #${id}`);
  renderEmployeeAttendance();
}

// ============ Sidebar Dashboard Functions ============

function renderPersonalDataSheet() {
  const container = document.getElementById('personalDataSheet');
  if (!container) return;
  
  if (!selectedEmployeeEmail) {
    container.innerHTML = '<p class="form-note">Select an employee to view personal data.</p>';
    return;
  }

  const user = getUsers().find(u => u.email === selectedEmployeeEmail);
  if (!user) {
    container.innerHTML = '<p class="form-note">Employee data not found.</p>';
    return;
  }

  container.innerHTML = `
    <div style="background: #f8fafc; padding: 14px; border-radius: 10px; border: 1px solid #e2e8f0; display:grid; gap:10px;">
      <div class="grid-2">
        <div>
          <label for="pdsName">Name</label>
          <input id="pdsName" type="text" value="${user.name || ''}">
        </div>
        <div>
          <label for="pdsEmail">Email</label>
          <input id="pdsEmail" type="email" value="${user.email || ''}" readonly>
        </div>
      </div>
      <div class="grid-2">
        <div>
          <label for="pdsDepartment">Department</label>
          <input id="pdsDepartment" type="text" value="${user.department || ''}">
        </div>
        <div>
          <label for="pdsPosition">Position</label>
          <input id="pdsPosition" type="text" value="${user.position || ''}">
        </div>
      </div>
      <div class="grid-2">
        <div>
          <label for="pdsPhone">Phone</label>
          <input id="pdsPhone" type="text" value="${user.phone || ''}">
        </div>
        <div>
          <label for="pdsGender">Gender</label>
          <input id="pdsGender" type="text" value="${user.gender || ''}">
        </div>
      </div>
      <div>
        <button class="btn btn-primary" onclick="savePersonalDataSheet()">Save Personal Data</button>
      </div>
    </div>
  `;
}

function savePersonalDataSheet() {
  if (!selectedEmployeeEmail) return;

  const payload = {
    email: selectedEmployeeEmail,
    name: String(document.getElementById('pdsName')?.value || '').trim(),
    department: String(document.getElementById('pdsDepartment')?.value || '').trim(),
    position: String(document.getElementById('pdsPosition')?.value || '').trim(),
    phone: String(document.getElementById('pdsPhone')?.value || '').trim(),
    gender: String(document.getElementById('pdsGender')?.value || '').trim(),
  };

  apiSend('/api/users/profile', 'PUT', payload)
    .then(() => loadUsersFromApi())
    .then(() => {
      hydrateEmployeeSelect();
      renderEmployeeDirectory();
      populateOverviewDepartmentFilter();
      logAdminAction('Update Personal Data Sheet', selectedEmployeeEmail, 'Updated employee personal details');
      showNotification('Personal data updated successfully.', 'success', 2500);
    })
    .catch(() => {
      showNotification('Failed to save personal data.', 'error', 2500);
    });
}

function renderLeaveMonitoring() {
  const container = document.getElementById('leaveMonitoringContent');
  if (!container) return;
  
  if (!selectedEmployeeEmail) {
    container.innerHTML = '<p style="color: #a1a5b4; text-align: center; padding: 20px 10px;">Select an employee to view leave requests</p>';
    return;
  }

  const leaves = getEmployeeLeaves();
  
  if (!leaves.length) {
    container.innerHTML = '<p style="color: #a1a5b4; text-align: center; padding: 15px 10px;">No leave requests</p>';
    return;
  }

  let html = '<div style="max-height: 600px; overflow-y: auto;">';
  
  leaves.forEach(leave => {
    const cssClass = (leave.status || 'Pending').toLowerCase();
    let statusColor = '#a1a5b4';
    if (cssClass === 'approved') statusColor = '#10b981';
    if (cssClass === 'rejected') statusColor = '#ef4444';
    if (cssClass === 'pending') statusColor = '#f59e0b';
    
    html += `
      <div style="background: rgba(255,255,255,0.1); border-radius: 8px; padding: 12px; margin-bottom: 10px; color: white;">
        <p style="margin: 0 0 6px 0; font-weight: 600; font-size: 0.9rem;">${leave.type}</p>
        <p style="margin: 0 0 6px 0; font-size: 0.85rem; color: #a1a5b4;">
          ${leave.start} → ${leave.end}
        </p>
        <p style="margin: 0; font-size: 0.85rem;">
          <span style="background: ${statusColor}; color: white; padding: 3px 8px; border-radius: 4px; font-size: 0.8rem;">${leave.status}</span>
          <span style="color: #a1a5b4; margin-left: 8px;">${leave.days} days</span>
        </p>
      </div>
    `;
  });
  
  html += '</div>';
  container.innerHTML = html;
}

function getEmployeeTrainings() {
  if (!selectedEmployeeEmail) return [];
  return hrCache.trainingsByEmail[selectedEmployeeEmail] || [];
}

function saveEmployeeTrainings(items) {
  if (!selectedEmployeeEmail) return;
  hrCache.trainingsByEmail[selectedEmployeeEmail] = items;
  apiSend('/api/hr/trainings', 'PUT', { email: selectedEmployeeEmail, items }).catch(() => {});
}

function assignTrainingToEmployee() {
  if (!selectedEmployeeEmail) {
    alert('Please select an employee first.');
    return;
  }

  const title = String(document.getElementById('adminTrainingTitle')?.value || '').trim();
  const sponsor = String(document.getElementById('adminTrainingSponsor')?.value || '').trim();
  const start = document.getElementById('adminTrainingStart')?.value || '';
  const end = document.getElementById('adminTrainingEnd')?.value || '';
  const hours = Number(document.getElementById('adminTrainingHours')?.value || 0);
  const type = String(document.getElementById('adminTrainingType')?.value || 'Technical');

  if (!title) {
    alert('Training title is required.');
    return;
  }

  const items = getEmployeeTrainings();
  items.unshift({
    id: Date.now(),
    title,
    sponsor,
    start,
    end,
    hours,
    type,
    status: 'Assigned',
  });

  saveEmployeeTrainings(items);
  logAdminAction('Assign Training', selectedEmployeeEmail, `${title} (${type})`);
  renderTrainingMonitoring();

  document.getElementById('adminTrainingTitle').value = '';
  document.getElementById('adminTrainingSponsor').value = '';
  document.getElementById('adminTrainingStart').value = '';
  document.getElementById('adminTrainingEnd').value = '';
  document.getElementById('adminTrainingHours').value = '';
}

function updateTrainingStatus(trainingId, status) {
  const items = getEmployeeTrainings().map(item =>
    item.id === trainingId ? { ...item, status } : item
  );
  saveEmployeeTrainings(items);
  logAdminAction('Update Training Status', selectedEmployeeEmail, `Training #${trainingId} marked as ${status}`);
  renderTrainingMonitoring();
}

function renderTrainingMonitoring() {
  const tbody = document.querySelector('#adminTrainingTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const items = getEmployeeTrainings();
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="7">No training records for this employee.</td></tr>';
    return;
  }

  items.forEach(item => {
    const status = item.status || 'Assigned';
    const row = `
      <tr>
        <td>${item.title || '-'}</td>
        <td>${item.start || '-'} - ${item.end || '-'}</td>
        <td>${item.hours || '-'}</td>
        <td>${item.type || '-'}</td>
        <td>${item.sponsor || '-'}</td>
        <td>${status}</td>
        <td>
          <div class="actions" style="display:flex; gap:6px; flex-wrap:wrap;">
            ${status !== 'Completed' ? `<button class="btn btn-success" onclick="updateTrainingStatus(${item.id}, 'Completed')">Mark Completed</button>` : `<button class="btn btn-outline" onclick="updateTrainingStatus(${item.id}, 'Assigned')">Reopen</button>`}
          </div>
        </td>
      </tr>`;
    tbody.innerHTML += row;
  });
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
  return hrCache.announcements || [];
}

function saveGlobalAnnouncements(items) {
  hrCache.announcements = items;
}

function addGlobalAnnouncement() {
  const titleInput = document.getElementById('adminAnnouncementTitle');
  const descriptionInput = document.getElementById('adminAnnouncementDescription');
  const imageInput = document.getElementById('adminAnnouncementImage');
  const title = titleInput.value.trim();
  const description = descriptionInput.value.trim();
  const imageFile = imageInput.files && imageInput.files[0];

  if (!title || !description) {
    alert('Please enter both a title and description for the announcement.');
    return;
  }

  const payload = {
    id: Date.now(),
    title,
    description,
    date: new Date().toISOString().slice(0, 10),
    image: '',
    visible: true,
  };

  const saveAnnouncement = (imageDataUrl = '') => {
    if (imageDataUrl) payload.image = imageDataUrl;
    apiSend('/api/hr/announcements', 'POST', {
      ...payload,
      createdByEmail: getSessionEmail(),
    }).then(() => {
      logAdminAction('Create Announcement', payload.title, payload.visible ? 'Visible to employees' : 'Hidden from employees');
      return loadAnnouncementsFromApi().then(() => renderGlobalAnnouncements());
    }).catch(() => {});
    titleInput.value = '';
    descriptionInput.value = '';
    imageInput.value = '';
    renderGlobalAnnouncements();
  };

  if (imageFile) {
    const reader = new FileReader();
    reader.onload = () => saveAnnouncement(reader.result);
    reader.readAsDataURL(imageFile);
  } else {
    saveAnnouncement();
  }
}

function removeGlobalAnnouncement(id) {
  fetch('/api/hr/announcements/' + encodeURIComponent(id), { method: 'DELETE' })
    .then(() => loadAnnouncementsFromApi())
    .then(() => {
      logAdminAction('Delete Announcement', String(id), 'Announcement removed');
      renderGlobalAnnouncements();
    })
    .catch(() => {});
}

function toggleAnnouncementVisibility(id, visible) {
  apiSend('/api/hr/announcements/' + encodeURIComponent(id) + '/visibility', 'PUT', { visible })
    .then(() => loadAnnouncementsFromApi())
    .then(() => {
      logAdminAction('Toggle Announcement Visibility', String(id), visible ? 'Set to visible' : 'Set to hidden');
      renderGlobalAnnouncements();
    })
    .catch(() => {
      showNotification('Failed to update announcement visibility.', 'error', 2500);
    });
}

function renderGlobalAnnouncements() {
  const board = document.getElementById('adminAnnouncementBoard');
  if (!board) return;
  board.innerHTML = '';

  const items = getGlobalAnnouncements();
  if (!items.length) {
    board.innerHTML = '<p class="form-note">No announcements posted yet.</p>';
    return;
  }

  items.forEach(item => {
    const block = document.createElement('div');
    block.className = 'announcement-item';

    const contentWrapper = document.createElement('div');
    contentWrapper.style.display = 'grid';
    contentWrapper.style.gap = '10px';

    const headerRow = document.createElement('div');
    headerRow.style.display = 'flex';
    headerRow.style.justifyContent = 'space-between';
    headerRow.style.alignItems = 'flex-start';
    headerRow.style.gap = '10px';
    headerRow.style.flexWrap = 'wrap';

    const titleBlock = document.createElement('div');
    const titleEl = document.createElement('h4');
    titleEl.textContent = item.title;
    titleEl.style.margin = '0 0 6px';
    const descEl = document.createElement('p');
    descEl.textContent = item.description;
    descEl.style.margin = '0';
    descEl.style.color = '#475569';
    titleBlock.appendChild(titleEl);
    titleBlock.appendChild(descEl);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-danger';
    deleteBtn.textContent = 'Delete';
    deleteBtn.onclick = () => removeGlobalAnnouncement(item.id);

    const actionsWrap = document.createElement('div');
    actionsWrap.style.display = 'flex';
    actionsWrap.style.gap = '8px';
    actionsWrap.style.flexWrap = 'wrap';
    actionsWrap.appendChild(deleteBtn);

    headerRow.appendChild(titleBlock);
    headerRow.appendChild(actionsWrap);
    contentWrapper.appendChild(headerRow);

    if (item.image) {
      const img = document.createElement('img');
      img.src = item.image;
      img.alt = item.title;
      img.className = 'announcement-item-image';
      contentWrapper.appendChild(img);
    }

    const dateEl = document.createElement('p');
    dateEl.className = 'form-note';
    dateEl.style.margin = '0';
    dateEl.textContent = `Posted: ${item.date}`;
    contentWrapper.appendChild(dateEl);

    block.appendChild(contentWrapper);
    board.appendChild(block);
  });
}

// ============ All Leaves Dashboard Functions ============

function getAllEmployeesLeaves() {
  const usersByEmail = {};
  getUsers().forEach(user => {
    usersByEmail[String(user.email || '').toLowerCase()] = user;
  });

  return allLeavesCache
    .map(leave => {
      const user = usersByEmail[String(leave.employeeEmail || '').toLowerCase()] || {};
      return {
        ...leave,
        start: leave.start || leave.startDate,
        end: leave.end || leave.endDate,
        employeeName: user.name || leave.employeeEmail,
        employeeEmail: leave.employeeEmail,
      };
    })
    .sort((a, b) => new Date(b.start) - new Date(a.start));
}

function showAdminPage(pageName) {
  // Hide all pages
  document.getElementById('overviewPage').classList.add('hidden');
  document.getElementById('announcementPage').classList.add('hidden');
  document.getElementById('leavesPage').classList.add('hidden');
  document.getElementById('employeesPage').classList.add('hidden');
  document.getElementById('civhrPage').classList.add('hidden');
  document.getElementById('trainingPage').classList.add('hidden');

  // Remove active class from all menu buttons
  document.getElementById('overviewBtn').classList.remove('active');
  document.getElementById('announcementsBtn').classList.remove('active');
  document.getElementById('leavesBtn').classList.remove('active');
  document.getElementById('employeesBtn').classList.remove('active');
  document.getElementById('civhrBtn').classList.remove('active');
  document.getElementById('trainingBtn').classList.remove('active');

  // Show selected page and mark button as active
  if (pageName === 'overview') {
    document.getElementById('overviewPage').classList.remove('hidden');
    document.getElementById('overviewBtn').classList.add('active');
    renderAdminOverview();
  } else if (pageName === 'announcements') {
    document.getElementById('announcementPage').classList.remove('hidden');
    document.getElementById('announcementsBtn').classList.add('active');
    renderGlobalAnnouncements();
  } else if (pageName === 'leaves') {
    document.getElementById('leavesPage').classList.remove('hidden');
    document.getElementById('leavesBtn').classList.add('active');
    renderAllLeaves();
  } else if (pageName === 'employees') {
    document.getElementById('employeesPage').classList.remove('hidden');
    document.getElementById('employeesBtn').classList.add('active');
    hydrateEmployeeSelect();
    renderEmployeeDirectory();
    selectEmployee();
  } else if (pageName === 'civhr') {
    document.getElementById('civhrPage').classList.remove('hidden');
    document.getElementById('civhrBtn').classList.add('active');
    hydrateEmployeeSelect();
    renderPersonalDataSheet();
  } else if (pageName === 'training') {
    document.getElementById('trainingPage').classList.remove('hidden');
    document.getElementById('trainingBtn').classList.add('active');
    hydrateEmployeeSelect();
    renderTrainingMonitoring();
  }
}

function populateOverviewDepartmentFilter() {
  const select = document.getElementById('overviewDepartmentFilter');
  if (!select) return;

  const departments = Array.from(new Set(
    getUsers()
      .map(user => String(user.department || '').trim())
      .filter(Boolean)
  )).sort((a, b) => a.localeCompare(b));

  const current = select.value || '';
  select.innerHTML = '<option value="">All Departments</option>';
  departments.forEach((department) => {
    const option = document.createElement('option');
    option.value = department;
    option.textContent = department;
    select.appendChild(option);
  });
  select.value = departments.includes(current) ? current : '';
}

function getOverviewFilterValues() {
  const days = Number(document.getElementById('overviewRangeFilter')?.value || 30) || 30;
  const department = String(document.getElementById('overviewDepartmentFilter')?.value || '').trim();
  return { days, department };
}

async function fetchOverviewSummary() {
  const requesterEmail = getSessionEmail();
  const { days, department } = getOverviewFilterValues();
  const query = new URLSearchParams({ requesterEmail, days: String(days) });
  if (department) query.set('department', department);
  const data = await apiGet('/api/admin/reports/summary?' + query.toString());
  return data.summary || null;
}

async function refreshOverviewInsights() {
  await renderAdminOverview();
}

async function renderAdminOverview() {
  try {
    const summary = await fetchOverviewSummary();
    latestOverviewSummary = summary;

    const metrics = (summary && summary.metrics) || {};
    const totalEmployees = Number(metrics.totalEmployees || getUsers().length || 0);
    const pendingLeaves = Number(metrics.pendingLeaves || 0);
    const approvedLeaves = Number(metrics.approvedLeaves || 0);
    const rejectedLeaves = Number(metrics.rejectedLeaves || 0);
    const upcomingTrainings = Number(metrics.upcomingTrainings || 0);
    const attendanceTrend = Number(metrics.attendancePresentRate || 0);

    document.getElementById('totalEmployeesCount').textContent = totalEmployees;
    document.getElementById('pendingLeavesCount').textContent = pendingLeaves;
    document.getElementById('approvedLeavesCount').textContent = approvedLeaves;
    document.getElementById('upcomingTrainingsCount').textContent = upcomingTrainings;
    document.getElementById('attendanceTrendRate').textContent = attendanceTrend + '%';
    document.getElementById('attendanceTrendMeta').textContent =
      `Present ${metrics.presentCount || 0} | Late ${metrics.lateCount || 0} | Absent ${metrics.absentCount || 0}`;

    document.getElementById('statusPendingCount').textContent = pendingLeaves;
    document.getElementById('statusApprovedCount').textContent = approvedLeaves;
    document.getElementById('statusRejectedCount').textContent = rejectedLeaves;

    renderRecentLeavesTable((summary && summary.recentLeaves) || []);
  } catch (error) {
    const users = getUsers();
    const allLeaves = getAllEmployeesLeaves();
    const pendingLeaves = allLeaves.filter(l => l.status === 'Pending').length;
    const approvedLeaves = allLeaves.filter(l => l.status === 'Approved').length;
    const rejectedLeaves = allLeaves.filter(l => l.status === 'Rejected').length;

    document.getElementById('totalEmployeesCount').textContent = users.length;
    document.getElementById('pendingLeavesCount').textContent = pendingLeaves;
    document.getElementById('approvedLeavesCount').textContent = approvedLeaves;
    document.getElementById('statusPendingCount').textContent = pendingLeaves;
    document.getElementById('statusApprovedCount').textContent = approvedLeaves;
    document.getElementById('statusRejectedCount').textContent = rejectedLeaves;
    renderRecentLeavesTable();
  }

  await loadAuditLogs();
  renderGlobalAnnouncements();
  updatePendingBadge();
}

function renderRecentLeavesTable(rows) {
  const tbody = document.querySelector('#recentLeavesTable tbody');
  tbody.innerHTML = '';

  let allLeaves = Array.isArray(rows) && rows.length ? rows.slice(0, 10) : getAllEmployeesLeaves().slice(0, 10);

  if (!allLeaves.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #999;">No leave requests yet.</td></tr>';
    return;
  }

  allLeaves.forEach(item => {
    const cssClass = (item.status || 'Pending').toLowerCase();
    const row = `
      <tr>
        <td><strong>${item.employeeName}</strong></td>
        <td>${item.type}</td>
        <td>${item.start}</td>
        <td>${item.end}</td>
        <td>${item.days}</td>
        <td><span class="status ${cssClass}">${item.status}</span></td>
        <td>
          <button class="btn btn-outline" onclick="openLeaveDetailsModal('${item.employeeEmail}', ${item.id})">View</button>
        </td>
      </tr>`;
    tbody.innerHTML += row;
  });
}

async function loadAuditLogs() {
  const tbody = document.querySelector('#adminAuditTable tbody');
  if (!tbody) return;

  try {
    const requesterEmail = getSessionEmail();
    const data = await apiGet('/api/admin/audit-logs?requesterEmail=' + encodeURIComponent(requesterEmail) + '&limit=25');
    const logs = data.items || [];
    if (!logs.length) {
      tbody.innerHTML = '<tr><td colspan="5">No audit logs yet.</td></tr>';
      return;
    }

    tbody.innerHTML = logs.map(log => `
      <tr>
        <td>${escapeHtml(formatDateTime(log.timestamp))}</td>
        <td>${escapeHtml(log.adminEmail || '-')}</td>
        <td>${escapeHtml(log.action || '-')}</td>
        <td>${escapeHtml(log.target || '-')}</td>
        <td>${escapeHtml(log.details || '-')}</td>
      </tr>
    `).join('');
  } catch (error) {
    tbody.innerHTML = '<tr><td colspan="5">Unable to load audit logs.</td></tr>';
  }
}

function logAdminAction(action, target, details) {
  const requesterEmail = getSessionEmail();
  if (!requesterEmail || !action) return;
  apiSend('/api/admin/audit-logs', 'POST', {
    requesterEmail,
    action,
    target: target || '',
    details: details || '',
    timestamp: new Date().toISOString(),
  }).then(() => {
    if (!document.getElementById('overviewPage')?.classList.contains('hidden')) {
      loadAuditLogs();
    }
  }).catch(() => {});
}

function buildEmployeeReportHtml(user) {
  const leaves = (hrCache.leavesByEmail[selectedEmployeeEmail] || []).slice();
  const attendance = (hrCache.attendanceByEmail[selectedEmployeeEmail] || []).slice();
  const trainings = (hrCache.trainingsByEmail[selectedEmployeeEmail] || []).slice();

  const leaveRows = leaves.length
    ? leaves.map(item => `<tr><td>${escapeHtml(item.type)}</td><td>${escapeHtml(item.start)}</td><td>${escapeHtml(item.end)}</td><td>${escapeHtml(item.status)}</td></tr>`).join('')
    : '<tr><td colspan="4">No leave records</td></tr>';

  const attendanceRows = attendance.length
    ? attendance.map(item => `<tr><td>${escapeHtml(item.date)}</td><td>${escapeHtml(item.status)}</td></tr>`).join('')
    : '<tr><td colspan="2">No attendance records</td></tr>';

  const trainingRows = trainings.length
    ? trainings.map(item => `<tr><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.start || '-')} - ${escapeHtml(item.end || '-')}</td><td>${escapeHtml(item.status || 'Assigned')}</td></tr>`).join('')
    : '<tr><td colspan="3">No training records</td></tr>';

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Employee Report - ${escapeHtml(user.name || user.email)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
    h1, h2 { margin: 0 0 8px; }
    .meta { margin-bottom: 18px; color: #333; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 13px; }
    th { background: #f5f5f5; }
  </style>
</head>
<body>
  <h1>Employee Report</h1>
  <div class="meta">
    <div><strong>Name:</strong> ${escapeHtml(user.name || '-')}</div>
    <div><strong>Email:</strong> ${escapeHtml(user.email || '-')}</div>
    <div><strong>Department:</strong> ${escapeHtml(user.department || '-')}</div>
    <div><strong>Position:</strong> ${escapeHtml(user.position || '-')}</div>
    <div><strong>Generated:</strong> ${escapeHtml(new Date().toLocaleString())}</div>
  </div>
  <h2>Leave Records</h2>
  <table><thead><tr><th>Type</th><th>Start</th><th>End</th><th>Status</th></tr></thead><tbody>${leaveRows}</tbody></table>
  <h2>Attendance Records</h2>
  <table><thead><tr><th>Date</th><th>Status</th></tr></thead><tbody>${attendanceRows}</tbody></table>
  <h2>Training Records</h2>
  <table><thead><tr><th>Title</th><th>Period</th><th>Status</th></tr></thead><tbody>${trainingRows}</tbody></table>
</body>
</html>`;
}

function openPrintWindow(html) {
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) {
    alert('Popup blocked. Please allow popups to print reports.');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

function printEmployeeReport() {
  if (!selectedEmployeeEmail) {
    alert('Please select an employee first.');
    return;
  }
  const user = getUsers().find(u => u.email === selectedEmployeeEmail);
  if (!user) {
    alert('Employee not found.');
    return;
  }
  openPrintWindow(buildEmployeeReportHtml(user));
  logAdminAction('Print Employee Report', selectedEmployeeEmail, 'Generated printable employee profile report');
}

function printHrSummaryReport() {
  const summary = latestOverviewSummary;
  if (!summary || !summary.metrics) {
    alert('Summary is not ready yet. Please try again.');
    return;
  }
  const metrics = summary.metrics;
  const filters = getOverviewFilterValues();
  const leavesRows = (summary.recentLeaves || []).map(item => `
    <tr>
      <td>${escapeHtml(item.employeeName || item.employeeEmail)}</td>
      <td>${escapeHtml(item.type || '-')}</td>
      <td>${escapeHtml(item.start || '-')}</td>
      <td>${escapeHtml(item.status || '-')}</td>
    </tr>
  `).join('') || '<tr><td colspan="4">No leave requests in this range</td></tr>';

  const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>HR Summary Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
    h1, h2 { margin: 0 0 8px; }
    .meta { margin-bottom: 18px; color: #333; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(220px, 1fr)); gap: 10px; margin-bottom: 16px; }
    .card { border: 1px solid #ddd; border-radius: 8px; padding: 10px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 13px; }
    th { background: #f5f5f5; }
  </style>
</head>
<body>
  <h1>HR Summary Report</h1>
  <div class="meta">
    <div><strong>Range:</strong> Last ${escapeHtml(filters.days)} days</div>
    <div><strong>Department:</strong> ${escapeHtml(filters.department || 'All Departments')}</div>
    <div><strong>Generated:</strong> ${escapeHtml(new Date().toLocaleString())}</div>
  </div>
  <div class="grid">
    <div class="card"><strong>Total Employees:</strong> ${escapeHtml(metrics.totalEmployees || 0)}</div>
    <div class="card"><strong>Pending Leaves:</strong> ${escapeHtml(metrics.pendingLeaves || 0)}</div>
    <div class="card"><strong>Approved Leaves:</strong> ${escapeHtml(metrics.approvedLeaves || 0)}</div>
    <div class="card"><strong>Upcoming Trainings:</strong> ${escapeHtml(metrics.upcomingTrainings || 0)}</div>
    <div class="card"><strong>Attendance Present Rate:</strong> ${escapeHtml(metrics.attendancePresentRate || 0)}%</div>
    <div class="card"><strong>Attendance Mix:</strong> P ${escapeHtml(metrics.presentCount || 0)} / L ${escapeHtml(metrics.lateCount || 0)} / A ${escapeHtml(metrics.absentCount || 0)}</div>
  </div>
  <h2>Recent Leave Requests</h2>
  <table>
    <thead><tr><th>Employee</th><th>Type</th><th>Start</th><th>Status</th></tr></thead>
    <tbody>${leavesRows}</tbody>
  </table>
</body>
</html>`;

  openPrintWindow(html);
  logAdminAction('Print HR Summary', filters.department || 'All Departments', `Range: ${filters.days} days`);
}

function showAdminView(view) {
  const allLeavesSection = document.getElementById('allLeavesSection');
  const employeeManagementSection = document.getElementById('employeeManagementSection');
  const allLeavesBtn = document.getElementById('allLeavesBtn');
  const employeeManagementBtn = document.getElementById('employeeManagementBtn');

  if (view === 'allLeaves') {
    allLeavesSection.classList.remove('hidden');
    employeeManagementSection.classList.add('hidden');
    allLeavesBtn.classList.add('btn-primary');
    allLeavesBtn.classList.remove('btn-outline');
    employeeManagementBtn.classList.remove('btn-primary');
    employeeManagementBtn.classList.add('btn-outline');
    renderAllLeaves();
  } else {
    allLeavesSection.classList.add('hidden');
    employeeManagementSection.classList.remove('hidden');
    employeeManagementBtn.classList.add('btn-primary');
    employeeManagementBtn.classList.remove('btn-outline');
    allLeavesBtn.classList.remove('btn-primary');
    allLeavesBtn.classList.add('btn-outline');
  }
}

function renderAllLeaves() {
  const tbody = document.querySelector('#allLeavesTable tbody');
  tbody.innerHTML = '';

  let allLeaves = getAllEmployeesLeaves();

  // Apply filters
  const statusFilter = document.getElementById('filterByStatus')?.value || '';
  const typeFilter = document.getElementById('filterByType')?.value || '';

  if (statusFilter) {
    allLeaves = allLeaves.filter(l => l.status === statusFilter);
  }
  if (typeFilter) {
    allLeaves = allLeaves.filter(l => l.type === typeFilter);
  }

  if (!allLeaves.length) {
    tbody.innerHTML = '<tr><td colspan="7">No leave requests found.</td></tr>';
    return;
  }

  allLeaves.forEach(item => {
    const cssClass = (item.status || 'Pending').toLowerCase();
    const row = `
      <tr>
        <td><strong>${item.employeeName}</strong><br><small style="color: #999;">${item.employeeEmail}</small></td>
        <td>${item.type}</td>
        <td>${item.start}</td>
        <td>${item.end}</td>
        <td>${item.days}</td>
        <td><span class="status ${cssClass}">${item.status}</span></td>
        <td>
          <div class="actions" style="display: flex; gap: 5px; flex-wrap: wrap;">
            <button class="btn btn-outline" onclick="openLeaveDetailsModal('${item.employeeEmail}', ${item.id})">Details</button>
            ${item.status === 'Pending' ? `
              <button class="btn btn-success" onclick="approveLeaveFromDashboard('${item.employeeEmail}', ${item.id})">Approve</button>
              <button class="btn btn-danger" onclick="rejectLeaveFromDashboard('${item.employeeEmail}', ${item.id})">Reject</button>
            ` : `
              <span style="color: #999;">-</span>
            `}
          </div>
        </td>
      </tr>`;
    tbody.innerHTML += row;
  });

  // Update badge count
  updatePendingBadge();
}

function filterAllLeaves() {
  renderAllLeaves();
}

function updatePendingBadge() {
  const badge = document.getElementById('pendingBadge');
  const allLeaves = getAllEmployeesLeaves();
  const pendingCount = allLeaves.filter(l => l.status === 'Pending').length;
  
  if (badge) {
    if (pendingCount > 0) {
      badge.textContent = pendingCount;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }
}

// ============ Comment Management Functions ============

async function getLeaveComments(employeeEmail, leaveId) {
  const data = await apiGet('/api/hr/leave-comments?email=' + encodeURIComponent(employeeEmail) + '&leaveId=' + encodeURIComponent(leaveId));
  return data.items || [];
}

async function openLeaveDetailsModal(employeeEmail, leaveId) {
  // Find the leave request
  const users = getUsers();
  const user = users.find(u => u.email === employeeEmail);
  const leaves = hrCache.leavesByEmail[employeeEmail] || [];
  const leave = leaves.find(l => l.id === leaveId);

  if (!leave || !user) return;

  currentLeaveInModal = { employeeEmail, leaveId, leave, user };

  // Display leave details
  const modalContent = document.getElementById('leaveModalContent');
  const cssClass = (leave.status || 'Pending').toLowerCase();
  
  modalContent.innerHTML = `
    <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
      <p><strong>Employee:</strong> ${user.name} (${user.email})</p>
      <p><strong>Leave Type:</strong> ${leave.type}</p>
      <p><strong>Start Date:</strong> ${leave.start}</p>
      <p><strong>End Date:</strong> ${leave.end}</p>
      <p><strong>Number of Days:</strong> ${leave.days}</p>
      <p><strong>Status:</strong> <span class="status ${cssClass}">${leave.status}</span></p>
    </div>
  `;

  // Display comments
  await displayCommentsInModal(employeeEmail, leaveId);

  // Clear comment input
  document.getElementById('commentInput').value = '';

  // Show modal
  document.getElementById('leaveDetailsModal').style.display = 'block';
}

function closeLeaveModal() {
  document.getElementById('leaveDetailsModal').style.display = 'none';
  currentLeaveInModal = null;
}

async function displayCommentsInModal(employeeEmail, leaveId) {
  const commentsList = document.getElementById('commentsList');
  const comments = await getLeaveComments(employeeEmail, leaveId);

  if (!comments.length) {
    commentsList.innerHTML = '<p style="color: #999; margin: 0;">No comments yet. Add one below.</p>';
    return;
  }

  commentsList.innerHTML = '';
  comments.forEach(comment => {
    const commentEl = document.createElement('div');
    commentEl.style.cssText = `
      background: white;
      padding: 10px;
      margin-bottom: 8px;
      border-radius: 6px;
      border-left: 3px solid #0f766e;
    `;
    commentEl.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: start;">
        <div>
          <p style="font-weight: 600; margin: 0 0 4px 0; color: #333;">Admin</p>
          <p style="margin: 0; color: #555; font-size: 0.9rem;">${comment.text}</p>
          <p style="margin: 4px 0 0 0; color: #999; font-size: 0.8rem;">${comment.date}</p>
        </div>
        <button onclick="deleteComment('${employeeEmail}', ${leaveId}, ${comment.id})" style="background: none; border: none; color: #dc2626; cursor: pointer; font-size: 18px;">×</button>
      </div>
    `;
    commentsList.appendChild(commentEl);
  });
}

async function addCommentToLeave() {
  if (!currentLeaveInModal) return;

  const commentInput = document.getElementById('commentInput');
  const text = commentInput.value.trim();

  if (!text) {
    alert('Please enter a comment');
    return;
  }

  const { employeeEmail, leaveId } = currentLeaveInModal;
  await apiSend('/api/hr/leave-comments', 'POST', {
    id: Date.now(),
    leaveId,
    employeeEmail,
    text,
    date: new Date().toLocaleString(),
    createdByEmail: getSessionEmail(),
    createdByRole: 'admin',
  });
  commentInput.value = '';
  logAdminAction('Add Leave Comment', employeeEmail, `Commented on leave #${leaveId}`);
  await displayCommentsInModal(employeeEmail, leaveId);
  showNotification('Comment added successfully!', 'success', 2000);
}

async function deleteComment(employeeEmail, leaveId, commentId) {
  await fetch('/api/hr/leave-comments/' + encodeURIComponent(commentId), { method: 'DELETE' });
  logAdminAction('Delete Leave Comment', employeeEmail, `Deleted comment #${commentId} for leave #${leaveId}`);
  await displayCommentsInModal(employeeEmail, leaveId);
  showNotification('Comment deleted', 'success', 2000);
}

// Close modal when clicking outside
document.addEventListener('click', function(event) {
  const modal = document.getElementById('leaveDetailsModal');
  if (event.target === modal) {
    closeLeaveModal();
  }
});

function approveLeaveFromDashboard(employeeEmail, leaveId) {
  const leaves = hrCache.leavesByEmail[employeeEmail] || [];
  const updatedLeaves = leaves.map(l => l.id === leaveId ? { ...l, status: 'Approved' } : l);
  hrCache.leavesByEmail[employeeEmail] = updatedLeaves;
  allLeavesCache = allLeavesCache.map(l => (l.id === leaveId ? { ...l, status: 'Approved' } : l));
  fetch('/api/hr/leaves/' + encodeURIComponent(leaveId) + '/status', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'Approved' })
  }).catch(() => {});
  logAdminAction('Approve Leave', employeeEmail, `Approved leave #${leaveId}`);
  renderAllLeaves();
  renderLeaveMonitoring();
  showNotification(`Leave request approved for ${employeeEmail}`, 'success');
}

function rejectLeaveFromDashboard(employeeEmail, leaveId) {
  const leaves = hrCache.leavesByEmail[employeeEmail] || [];
  const updatedLeaves = leaves.map(l => l.id === leaveId ? { ...l, status: 'Rejected' } : l);
  hrCache.leavesByEmail[employeeEmail] = updatedLeaves;
  allLeavesCache = allLeavesCache.map(l => (l.id === leaveId ? { ...l, status: 'Rejected' } : l));
  fetch('/api/hr/leaves/' + encodeURIComponent(leaveId) + '/status', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'Rejected' })
  }).catch(() => {});
  logAdminAction('Reject Leave', employeeEmail, `Rejected leave #${leaveId}`);
  renderAllLeaves();
  renderLeaveMonitoring();
  showNotification(`Leave request rejected for ${employeeEmail}`, 'error');
}

// ============ Notification System ============

let lastNotificationIds = JSON.parse(localStorage.getItem('admin_last_notification_ids') || '[]');

async function checkForNewLeaveNotifications() {
  await loadAllLeavesFromApi().catch(() => {});
  const users = getUsers();
  const currentNotificationIds = [];

  users.forEach(user => {
    const userLeaves = hrCache.leavesByEmail[user.email] || [];
    userLeaves.forEach(leave => {
      const leaveKey = `${user.email}_${leave.id}`;
      currentNotificationIds.push(leaveKey);

      if (!lastNotificationIds.includes(leaveKey) && leave.status === 'Pending') {
        showNotification(`📋 New leave request from ${user.name}! (${leave.type} - ${leave.start} to ${leave.end})`, 'info', 5000);
      }
    });
  });

  lastNotificationIds = currentNotificationIds;
  localStorage.setItem('admin_last_notification_ids', JSON.stringify(lastNotificationIds));
  
  // Update badge on dashboard
  updatePendingBadge();
}

function showNotification(message, type = 'info', duration = 4000) {
  const container = document.getElementById('notificationContainer');
  const notif = document.createElement('div');
  notif.className = `notification notification-${type}`;
  notif.style.cssText = `
    background: ${getNotificationColor(type)};
    color: white;
    padding: 14px 18px;
    border-radius: 8px;
    margin-bottom: 10px;
    animation: slideIn 0.3s ease;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    word-wrap: break-word;
    max-width: 100%;
  `;
  notif.textContent = message;
  container.appendChild(notif);

  setTimeout(() => {
    notif.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notif.remove(), 300);
  }, duration);
}

function getNotificationColor(type) {
  switch(type) {
    case 'success': return '#15803d';
    case 'error': return '#dc2626';
    case 'info': return '#0f766e';
    default: return '#6b7280';
  }
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(400px);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);
