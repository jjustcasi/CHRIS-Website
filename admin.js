const ADMIN_SESSION_KEY = 'chris_admin_session';
const ADMIN_EMAIL = 'admin@chris.local';
const ADMIN_PASSWORD = 'admin123';

function getApiBaseUrls() {
  const urls = ['http://127.0.0.1:4000/api', 'http://localhost:4000/api'];

  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    urls.unshift(`${window.location.protocol}//${window.location.hostname}:4000/api`);
  }

  return [...new Set(urls.filter(Boolean))];
}

async function fetchApi(path, options) {
  let lastError = null;

  for (const baseUrl of getApiBaseUrls()) {
    try {
      return await fetch(`${baseUrl}${path}`, options);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Unable to reach backend.');
}

let selectedEmployeeEmail = '';
let currentLeaveInModal = null;

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
  // Check for leave notifications
  checkForNewLeaveNotifications();
  // Poll for new leave requests every 2 seconds
  setInterval(checkForNewLeaveNotifications, 2000);
}

function showAdminLogin() {
  document.getElementById('adminLoginSection').classList.remove('hidden');
  document.getElementById('adminDashboardSection').classList.add('hidden');
  document.getElementById('adminLogoutBtn').classList.add('hidden');
}

function openAdminPanel() {
  document.getElementById('adminLoginSection').classList.add('hidden');
  document.getElementById('adminDashboardSection').classList.remove('hidden');
  document.getElementById('adminLogoutBtn').classList.remove('hidden');
  
  // Show overview page by default
  showAdminPage('overview');
  renderAdminOverview();
  
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
  lastNotificationIds = [];
  localStorage.removeItem('admin_last_notification_ids');
  showAdminLogin();
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

function selectEmployee() {
  const select = document.getElementById('employeeSelect');
  selectedEmployeeEmail = select ? select.value : selectedEmployeeEmail;
  syncEmployeeSelectors();

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
    <div style="background: #f8fafc; padding: 14px; border-radius: 10px; border: 1px solid #e2e8f0;">
      <p style="margin: 0 0 8px 0; font-size: 0.85rem; color: #64748b;"><strong>Name</strong></p>
      <p style="margin: 0 0 12px 0;">${user.name || 'N/A'}</p>
      
      <p style="margin: 0 0 8px 0; font-size: 0.85rem; color: #64748b;"><strong>Email</strong></p>
      <p style="margin: 0 0 12px 0; font-size: 0.9rem; word-break: break-all;">${user.email || 'N/A'}</p>
      
      <p style="margin: 0 0 8px 0; font-size: 0.85rem; color: #64748b;"><strong>Position</strong></p>
      <p style="margin: 0 0 12px 0;">${user.position || 'N/A'}</p>
      
      <p style="margin: 0 0 8px 0; font-size: 0.85rem; color: #64748b;"><strong>Gender</strong></p>
      <p style="margin: 0;">${user.gender || 'N/A'}</p>
    </div>
  `;
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
  return JSON.parse(localStorage.getItem(userKey('trainings', selectedEmployeeEmail)) || '[]');
}

function renderTrainingMonitoring() {
  const tbody = document.querySelector('#adminTrainingTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const items = getEmployeeTrainings();
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="5">No training records for this employee.</td></tr>';
    return;
  }

  items.forEach(item => {
    const row = `
      <tr>
        <td>${item.title || '-'}</td>
        <td>${item.start || '-'} - ${item.end || '-'}</td>
        <td>${item.hours || '-'}</td>
        <td>${item.type || '-'}</td>
        <td>${item.sponsor || '-'}</td>
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
  return JSON.parse(localStorage.getItem('chris_global_announcements') || '[]');
}

function saveGlobalAnnouncements(items) {
  localStorage.setItem('chris_global_announcements', JSON.stringify(items));
}

async function fetchGlobalAnnouncementsFromApi() {
  const response = await fetchApi('/announcements');
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || 'Unable to load announcements.');
  }

  const items = Array.isArray(payload.announcements) ? payload.announcements : [];
  saveGlobalAnnouncements(items);
  return items;
}

async function createAnnouncementInApi(announcement) {
  const response = await fetchApi('/announcements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(announcement)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || 'Unable to create announcement.');
  }

  return payload.announcement;
}

async function deleteAnnouncementInApi(id) {
  const response = await fetchApi(`/announcements/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || 'Unable to delete announcement.');
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Unable to read image file.'));
    reader.readAsDataURL(file);
  });
}

async function addGlobalAnnouncement() {
  const input = document.getElementById('adminAnnouncementInput');
  const detailsInput = document.getElementById('adminAnnouncementDetails');
  const imageInput = document.getElementById('adminAnnouncementImage');
  const text = input.value.trim();
  const details = detailsInput ? detailsInput.value.trim() : '';
  const imageFile = imageInput && imageInput.files ? imageInput.files[0] : null;

  if (!text && !imageFile) return;

  let imageDataUrl = '';
  if (imageFile) {
    if (!imageFile.type || !imageFile.type.startsWith('image/')) {
      showNotification('Please upload a valid image file for announcements.', 'error');
      return;
    }

    if (imageFile.size > 5 * 1024 * 1024) {
      showNotification('Announcement image must be 5MB or less.', 'error');
      return;
    }

    try {
      imageDataUrl = await readFileAsDataUrl(imageFile);
    } catch (_) {
      showNotification('Failed to attach the selected image.', 'error');
      return;
    }
  }

  try {
    await createAnnouncementInApi({
      title: text,
      text,
      details,
      imageDataUrl
    });
    input.value = '';
    if (detailsInput) detailsInput.value = '';
    if (imageInput) imageInput.value = '';
    await renderGlobalAnnouncements();
    showNotification('Announcement posted successfully.', 'success');
  } catch (error) {
    showNotification(error.message || 'Cannot connect to backend announcements service.', 'error');
  }
}

async function removeGlobalAnnouncement(id) {
  try {
    await deleteAnnouncementInApi(id);
    await renderGlobalAnnouncements();
  } catch (error) {
    showNotification(error.message || 'Cannot delete announcement right now.', 'error');
  }
}

async function renderGlobalAnnouncements() {
  const board = document.getElementById('adminAnnouncementBoard');
  if (!board) return;
  board.innerHTML = '';

  let items = [];
  try {
    items = await fetchGlobalAnnouncementsFromApi();
  } catch (_) {
    showNotification('Unable to refresh announcements from the backend right now.', 'error');
  }

  if (!items.length) {
    board.innerHTML = '<p class="form-note">No announcements posted yet.</p>';
    return;
  }

  items.forEach(item => {
    const block = document.createElement('div');
    block.className = 'announcement-item';
    block.innerHTML = `
      <div class="announcement-content">
        ${item.title || item.text ? `<strong>${item.title || item.text}</strong>` : '<strong>Announcement</strong>'}
        ${item.details ? `<p class="form-note" style="margin: 0; color: #334155;">${item.details}</p>` : ''}
        ${item.imageDataUrl ? `<img src="${item.imageDataUrl}" alt="Announcement image" class="announcement-image">` : ''}
        <p class="form-note">Posted: ${item.date}</p>
      </div>
      <button class="btn btn-danger" onclick="removeGlobalAnnouncement('${item.id}')">Delete</button>`;
    board.appendChild(block);
  });
}

// ============ All Leaves Dashboard Functions ============

function getAllEmployeesLeaves() {
  const users = getUsers();
  const allLeaves = [];

  users.forEach(user => {
    const userLeaves = JSON.parse(localStorage.getItem(userKey('leaves', user.email)) || '[]');
    userLeaves.forEach(leave => {
      allLeaves.push({
        ...leave,
        employeeName: user.name,
        employeeEmail: user.email
      });
    });
  });

  return allLeaves.sort((a, b) => new Date(b.start) - new Date(a.start));
}

function showAdminPage(pageName) {
  // Hide all pages
  document.getElementById('overviewPage').classList.add('hidden');
  document.getElementById('leavesPage').classList.add('hidden');
  document.getElementById('employeesPage').classList.add('hidden');
  document.getElementById('civhrPage').classList.add('hidden');
  document.getElementById('trainingPage').classList.add('hidden');
  document.getElementById('announcementsPage').classList.add('hidden');

  // Remove active class from all menu buttons
  document.getElementById('overviewBtn').classList.remove('active');
  document.getElementById('leavesBtn').classList.remove('active');
  document.getElementById('employeesBtn').classList.remove('active');
  document.getElementById('civhrBtn').classList.remove('active');
  document.getElementById('trainingBtn').classList.remove('active');
  document.getElementById('announcementsBtn').classList.remove('active');

  // Show selected page and mark button as active
  if (pageName === 'overview') {
    document.getElementById('overviewPage').classList.remove('hidden');
    document.getElementById('overviewBtn').classList.add('active');
    renderAdminOverview();
  } else if (pageName === 'leaves') {
    document.getElementById('leavesPage').classList.remove('hidden');
    document.getElementById('leavesBtn').classList.add('active');
    renderAllLeaves();
  } else if (pageName === 'employees') {
    document.getElementById('employeesPage').classList.remove('hidden');
    document.getElementById('employeesBtn').classList.add('active');
    hydrateEmployeeSelect();
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
  } else if (pageName === 'announcements') {
    document.getElementById('announcementsPage').classList.remove('hidden');
    document.getElementById('announcementsBtn').classList.add('active');
    renderGlobalAnnouncements();
  }
}

function renderAdminOverview() {
  const users = getUsers();
  const allLeaves = getAllEmployeesLeaves();
  
  // Calculate metrics
  const totalEmployees = users.length;
  const pendingLeaves = allLeaves.filter(l => l.status === 'Pending').length;
  const approvedLeaves = allLeaves.filter(l => l.status === 'Approved').length;
  const rejectedLeaves = allLeaves.filter(l => l.status === 'Rejected').length;
  
  // Update metric cards
  document.getElementById('totalEmployeesCount').textContent = totalEmployees;
  document.getElementById('pendingLeavesCount').textContent = pendingLeaves;
  document.getElementById('approvedLeavesCount').textContent = approvedLeaves;
  
  // Update status tracker
  document.getElementById('statusPendingCount').textContent = pendingLeaves;
  document.getElementById('statusApprovedCount').textContent = approvedLeaves;
  document.getElementById('statusRejectedCount').textContent = rejectedLeaves;
  
  // Render recent leaves table
  renderRecentLeavesTable();
  
  // Update pending badge
  updatePendingBadge();
}

function renderRecentLeavesTable() {
  const tbody = document.querySelector('#recentLeavesTable tbody');
  tbody.innerHTML = '';

  let allLeaves = getAllEmployeesLeaves();
  // Show only the 10 most recent leaves
  allLeaves = allLeaves.slice(0, 10);

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

function getLeaveComments(employeeEmail, leaveId) {
  const key = `chris_comments_${employeeEmail}_${leaveId}`;
  return JSON.parse(localStorage.getItem(key) || '[]');
}

function saveLeaveComments(employeeEmail, leaveId, comments) {
  const key = `chris_comments_${employeeEmail}_${leaveId}`;
  localStorage.setItem(key, JSON.stringify(comments));
}

function openLeaveDetailsModal(employeeEmail, leaveId) {
  // Find the leave request
  const users = getUsers();
  const user = users.find(u => u.email === employeeEmail);
  const leaves = JSON.parse(localStorage.getItem(userKey('leaves', employeeEmail)) || '[]');
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
  displayCommentsInModal(employeeEmail, leaveId);

  // Clear comment input
  document.getElementById('commentInput').value = '';

  // Show modal
  document.getElementById('leaveDetailsModal').style.display = 'block';
}

function closeLeaveModal() {
  document.getElementById('leaveDetailsModal').style.display = 'none';
  currentLeaveInModal = null;
}

function displayCommentsInModal(employeeEmail, leaveId) {
  const commentsList = document.getElementById('commentsList');
  const comments = getLeaveComments(employeeEmail, leaveId);

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

function addCommentToLeave() {
  if (!currentLeaveInModal) return;

  const commentInput = document.getElementById('commentInput');
  const text = commentInput.value.trim();

  if (!text) {
    alert('Please enter a comment');
    return;
  }

  const { employeeEmail, leaveId } = currentLeaveInModal;
  const comments = getLeaveComments(employeeEmail, leaveId);

  comments.push({
    id: Date.now(),
    text,
    date: new Date().toLocaleString()
  });

  saveLeaveComments(employeeEmail, leaveId, comments);
  commentInput.value = '';
  displayCommentsInModal(employeeEmail, leaveId);
  showNotification('Comment added successfully!', 'success', 2000);
}

function deleteComment(employeeEmail, leaveId, commentId) {
  const comments = getLeaveComments(employeeEmail, leaveId);
  const filtered = comments.filter(c => c.id !== commentId);
  saveLeaveComments(employeeEmail, leaveId, filtered);
  displayCommentsInModal(employeeEmail, leaveId);
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
  const leaves = JSON.parse(localStorage.getItem(userKey('leaves', employeeEmail)) || '[]');
  const updatedLeaves = leaves.map(l => l.id === leaveId ? { ...l, status: 'Approved' } : l);
  localStorage.setItem(userKey('leaves', employeeEmail), JSON.stringify(updatedLeaves));
  renderAllLeaves();
  renderLeaveMonitoring();
  showNotification(`Leave request approved for ${employeeEmail}`, 'success');
}

function rejectLeaveFromDashboard(employeeEmail, leaveId) {
  const leaves = JSON.parse(localStorage.getItem(userKey('leaves', employeeEmail)) || '[]');
  const updatedLeaves = leaves.map(l => l.id === leaveId ? { ...l, status: 'Rejected' } : l);
  localStorage.setItem(userKey('leaves', employeeEmail), JSON.stringify(updatedLeaves));
  renderAllLeaves();
  renderLeaveMonitoring();
  showNotification(`Leave request rejected for ${employeeEmail}`, 'error');
}

// ============ Notification System ============

let lastNotificationIds = JSON.parse(localStorage.getItem('admin_last_notification_ids') || '[]');

function checkForNewLeaveNotifications() {
  const users = getUsers();
  const currentNotificationIds = [];

  users.forEach(user => {
    const userLeaves = JSON.parse(localStorage.getItem(userKey('leaves', user.email)) || '[]');
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
