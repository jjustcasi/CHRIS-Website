let leaves = [];
let trainings = [];
let attendance = [];
let announcements = [];
let evaluation = { status: '' };
let pdsData = {};
let currentUser = null;
let signaturePadCtx = null;
let isSignatureDrawing = false;
let finalSignaturePadCtx = null;
let isFinalSignatureDrawing = false;
let previousSnapshot = {
  leaveStatuses: {},
  trainingIds: [],
  announcementIds: [],
};
let hasPreviousSnapshot = false;

function getUsers() {
  return JSON.parse(localStorage.getItem('chris_users') || '[]');
}

function getSession() {
  return localStorage.getItem('chris_session');
}

function clearSession() {
  localStorage.removeItem('chris_session');
}

function userDataKey(type) {
  return 'chris_' + type + '_' + currentUser.email;
}

function getReadAnnouncementIds() {
  try {
    const ids = JSON.parse(localStorage.getItem(userDataKey('announcement_read_ids')) || '[]');
    return Array.isArray(ids) ? ids : [];
  } catch (_) {
    return [];
  }
}

function saveReadAnnouncementIds(ids) {
  localStorage.setItem(userDataKey('announcement_read_ids'), JSON.stringify(ids));
}

function getUnreadAnnouncements() {
  const readIds = new Set(getReadAnnouncementIds().map(Number));
  return (announcements || []).filter(item => !readIds.has(Number(item.id)));
}

function updateAnnouncementsBadge(unreadCount) {
  const badge = document.getElementById('announcementsBadge');
  if (!badge) return;
  const count = Number(unreadCount) || 0;
  if (count > 0) {
    badge.textContent = String(count);
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

function markAnnouncementRead(announcementId) {
  const id = Number(announcementId);
  if (!id) return;
  const currentIds = new Set(getReadAnnouncementIds().map(Number));
  if (currentIds.has(id)) return;

  currentIds.add(id);
  saveReadAnnouncementIds(Array.from(currentIds));

  const item = (announcements || []).find(a => Number(a.id) === id);
  if (item) {
    const title = item.title || 'Announcement';
    showLeaveNotification(`Announcement marked as read: ${title}`, 'success', 3000);
  }

  renderAnnouncementUnreadPanel();
}

function clearUnreadAnnouncements() {
  const allIds = (announcements || []).map(item => Number(item.id)).filter(Number.isFinite);
  saveReadAnnouncementIds(allIds);
  renderAnnouncementUnreadPanel();
  showLeaveNotification('All announcements marked as read.', 'info', 3200);
}

function renderAnnouncementUnreadPanel() {
  const unreadItems = getUnreadAnnouncements();
  updateAnnouncementsBadge(unreadItems.length);

  const board = document.getElementById('announcementUnreadBoard');
  if (!board) return;
  board.innerHTML = '';

  if (!unreadItems.length) {
    board.innerHTML = '<p class="form-note">You are all caught up.</p>';
    return;
  }

  unreadItems.forEach(item => {
    const block = document.createElement('div');
    block.className = 'announcement-item announcement-unread-item';

    const title = item.title || item.text || 'Announcement';
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.alignItems = 'flex-start';
    row.style.gap = '10px';
    row.style.flexWrap = 'wrap';

    const info = document.createElement('div');
    info.innerHTML = `<strong>${title}</strong><p class="form-note">Posted: ${item.date || '-'}</p>`;

    const button = document.createElement('button');
    button.className = 'btn btn-outline';
    button.type = 'button';
    button.textContent = 'Mark Read';
    button.onclick = () => markAnnouncementRead(item.id);

    row.appendChild(info);
    row.appendChild(button);
    block.appendChild(row);
    board.appendChild(block);
  });
}

function loadPreviousSnapshot() {
  try {
    const raw = localStorage.getItem(userDataKey('notification_state'));
    if (!raw) {
      hasPreviousSnapshot = false;
      return { leaveStatuses: {}, trainingIds: [], announcementIds: [] };
    }
    const parsed = JSON.parse(raw);
    hasPreviousSnapshot = true;
    return {
      leaveStatuses: parsed.leaveStatuses || {},
      trainingIds: Array.isArray(parsed.trainingIds) ? parsed.trainingIds : [],
      announcementIds: Array.isArray(parsed.announcementIds) ? parsed.announcementIds : [],
    };
  } catch (_) {
    hasPreviousSnapshot = false;
    return { leaveStatuses: {}, trainingIds: [], announcementIds: [] };
  }
}

function saveCurrentSnapshot() {
  const next = {
    leaveStatuses: Object.fromEntries((leaves || []).map(item => [String(item.id), item.status || 'Pending'])),
    trainingIds: (trainings || []).map(item => Number(item.id)).filter(Number.isFinite),
    announcementIds: (announcements || []).map(item => Number(item.id)).filter(Number.isFinite),
  };
  previousSnapshot = next;
  localStorage.setItem(userDataKey('notification_state'), JSON.stringify(next));
}

function notifyDashboardReminders() {
  const previous = previousSnapshot || { leaveStatuses: {}, trainingIds: [], announcementIds: [] };
  const currentLeaveStatuses = Object.fromEntries((leaves || []).map(item => [String(item.id), item.status || 'Pending']));

  if (!hasPreviousSnapshot) {
    return;
  }

  (leaves || []).forEach((item) => {
    const prevStatus = previous.leaveStatuses[String(item.id)];
    if (!prevStatus) return;
    if (prevStatus !== item.status && item.status === 'Approved') {
      showLeaveNotification(`Leave approval notice: Your ${item.type} request (${item.start} to ${item.end}) was approved.`, 'success', 5500);
    }
    if (prevStatus !== item.status && item.status === 'Rejected') {
      showLeaveNotification(`Leave update: Your ${item.type} request was marked as rejected.`, 'error', 5500);
    }
  });

  const previousTrainingIds = new Set(previous.trainingIds || []);
  (trainings || []).forEach((item) => {
    const trainingId = Number(item.id);
    if (!trainingId || previousTrainingIds.has(trainingId)) return;
    showLeaveNotification(`Training assignment notice: ${item.title} has been assigned to you.`, 'info', 5500);
  });

  previousSnapshot = {
    leaveStatuses: currentLeaveStatuses,
    trainingIds: (trainings || []).map(item => Number(item.id)).filter(Number.isFinite),
    announcementIds: (announcements || []).map(item => Number(item.id)).filter(Number.isFinite),
  };
  localStorage.setItem(userDataKey('notification_state'), JSON.stringify(previousSnapshot));
}

async function refreshUserReminders() {
  await loadUserData();
  renderAnnouncements();
  renderAnnouncementModule();
  updateAnnouncementsBadge(getUnreadAnnouncements().length);
  renderOverview();
  notifyDashboardReminders();
  saveCurrentSnapshot();
}

function dismissEmployeeHint() {
  localStorage.setItem(userDataKey('hint_dismissed'), '1');
  const hint = document.getElementById('employeeOnboardingHint');
  if (hint) hint.classList.add('hidden');
}

function hydrateEmployeeHint() {
  const hint = document.getElementById('employeeOnboardingHint');
  if (!hint) return;
  const dismissed = localStorage.getItem(userDataKey('hint_dismissed')) === '1';
  hint.classList.toggle('hidden', dismissed);
}

async function loadUserData() {
  pdsData = JSON.parse(localStorage.getItem(userDataKey('pds')) || '{}');

  leaves = [];
  trainings = [];
  attendance = [];
  announcements = [];
  evaluation = { status: '' };

  try {
    const snapshotRes = await fetch('/api/hr/snapshot?email=' + encodeURIComponent(currentUser.email));
    const data = await snapshotRes.json();
    if (data.success && data.snapshot) {
      leaves = Array.isArray(data.snapshot.leaves) ? data.snapshot.leaves : [];
      trainings = Array.isArray(data.snapshot.trainings) ? data.snapshot.trainings : [];
      attendance = Array.isArray(data.snapshot.attendance) ? data.snapshot.attendance : [];
      evaluation = data.snapshot.evaluation || { status: '' };
    }
  } catch (_) {
    // Keep defaults when snapshot endpoint is unavailable.
  }

  try {
    const announcementsRes = await fetch('/api/hr/announcements?visibleOnly=1');
    const announcementData = await announcementsRes.json();
    announcements = announcementData.success && Array.isArray(announcementData.items) ? announcementData.items : [];
  } catch (_) {
    // Keep defaults when announcements endpoint is unavailable.
  }

  try {
    const profileRes = await fetch('/api/users/profile?email=' + encodeURIComponent(currentUser.email));
    const profileData = await profileRes.json();
    if (profileData.success && profileData.profile) {
      currentUser = {
        ...currentUser,
        ...profileData.profile,
      };
    }
  } catch (_) {
    // Use session/local profile info when profile endpoint is unavailable.
  }
}

function saveUserData() {
  fetch('/api/hr/snapshot', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: currentUser.email,
      leaves,
      trainings,
      attendance,
      evaluation,
    })
  }).catch(() => {
    // Keep UI responsive even if sync fails.
  });

  localStorage.setItem(userDataKey('pds'), JSON.stringify(pdsData));
}

function requireLogin() {
  const sessionEmail = getSession();
  const role = getUserRole();
  if (!sessionEmail) {
    window.location.href = 'login.html';
    return false;
  }
  if (role === 'admin') {
    window.location.href = 'admin.html';
    return false;
  }

  const normalizedEmail = String(sessionEmail || '').toLowerCase();
  const user = getUsers().find(u => String(u.email || '').toLowerCase() === normalizedEmail);
  if (!user) {
    clearSession();
    window.location.href = 'login.html';
    return false;
  }
  currentUser = {
    name: user.name,
    email: user.email,
    position: user.position || 'CHR Employee',
    gender: user.gender || '',
    role: role || user.role || 'employee'
  };
  return true;
}

async function initializeDashboard() {
  if (!requireLogin()) return;
  previousSnapshot = loadPreviousSnapshot();
  document.getElementById('profileName').textContent = currentUser.name;
  const avatarEl = document.getElementById('profileAvatar');
  if (currentUser.profileImage) {
    avatarEl.innerHTML = '<img src="' + currentUser.profileImage + '" alt="Profile" class="profile-pic">';
  } else {
    avatarEl.textContent = getInitials(currentUser.name);
  }
  document.getElementById('welcomeName').textContent = currentUser.name;
  document.getElementById('welcomePosition').textContent = currentUser.position;
  await loadUserData();
  if (currentUser.profileImage) {
    avatarEl.innerHTML = '<img src="' + currentUser.profileImage + '" alt="Profile" class="profile-pic">';
  }
  seedUserSideDefaults();
  populateLeaveTypeDropdown();
  showPage('overview');
  renderLeaves();
  renderTraining();
  renderAttendance();
  renderAnnouncements();
  renderAnnouncementModule();
  updateAnnouncementsBadge(getUnreadAnnouncements().length);
  renderOverview();
  hydrateEmployeeHint();
  notifyDashboardReminders();
  saveCurrentSnapshot();
  hasPreviousSnapshot = true;
  setInterval(() => {
    refreshUserReminders().catch(() => {});
  }, 30000);
  initializePdsSections();
  loadPdsForm();
}

function getInitials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function populateLeaveTypeDropdown() {
  const genderAppropriateLeaves = getGenderAppropriateLeaveTypes();
  const dropdown = document.getElementById('leaveType');
  
  dropdown.innerHTML = '';
  genderAppropriateLeaves.forEach(leaveType => {
    const option = document.createElement('option');
    option.value = leaveType;
    option.textContent = leaveType;
    dropdown.appendChild(option);
  });

  // Add change listener to toggle medical certificate field
  dropdown.addEventListener('change', toggleMedicalCertField);
  toggleMedicalCertField();
}

function toggleMedicalCertField() {
  const leaveType = document.getElementById('leaveType').value;
  const medCertContainer = document.getElementById('medicalCertContainer');
  if (leaveType === 'Sick Leave') {
    medCertContainer.style.display = 'block';
  } else {
    medCertContainer.style.display = 'none';
  }
}

function logout() {
  clearSession();
  window.location.href = 'index.html';
}

function showPage(page) {
  document.getElementById('overviewPage').classList.toggle('hidden', page !== 'overview');
  document.getElementById('announcementsPage').classList.toggle('hidden', page !== 'announcements');
  document.getElementById('leavePage').classList.toggle('hidden', page !== 'leave');
  document.getElementById('trainingPage').classList.toggle('hidden', page !== 'training');
  document.getElementById('reportPage').classList.toggle('hidden', page !== 'report');
  document.getElementById('performancePage').classList.toggle('hidden', page !== 'performance');
  document.getElementById('pdsPage').classList.toggle('hidden', page !== 'pds');
  const welcomeBanner = document.querySelector('.welcome-banner');
  if (welcomeBanner) {
    welcomeBanner.classList.toggle('hidden', page !== 'overview');
  }
  document.getElementById('overviewBtn').classList.toggle('active', page === 'overview');
  document.getElementById('announcementsBtn').classList.toggle('active', page === 'announcements');
  document.getElementById('leaveBtn').classList.toggle('active', page === 'leave');
  document.getElementById('trainingBtn').classList.toggle('active', page === 'training');
  document.getElementById('reportBtn').classList.toggle('active', page === 'report');
  document.getElementById('performanceBtn').classList.toggle('active', page === 'performance');
  document.getElementById('pdsBtn').classList.toggle('active', page === 'pds');

  if (page === 'announcements') {
    renderAnnouncementModule();
  }

  if (page === 'report') {
    renderReportPage();
  }
  if (page === 'performance') {
    renderPerformancePage();
  }
}

function renderReportPage() {
  const reportPreview = document.getElementById('reportPreview');
  const reportOutput = document.getElementById('reportOutput');
  if (!reportPreview || !reportOutput) return;

  const pendingLeaves = leaves.filter(l => l.status === 'Pending').length;
  const approvedLeaves = leaves.filter(l => l.status === 'Approved').length;
  const completedTrainings = trainings.filter(t => t.status === 'Completed').length;
  const presentCount = attendance.filter(item => item.status === 'Present').length;
  const absentCount = attendance.filter(item => item.status === 'Absent').length;
  const lateCount = attendance.filter(item => item.status === 'Late').length;

  reportPreview.innerHTML = `
    <p><strong>Name:</strong> ${currentUser.name}</p>
    <p><strong>Email:</strong> ${currentUser.email}</p>
    <p><strong>Position:</strong> ${currentUser.position}</p>
    <p><strong>Approved leaves:</strong> ${approvedLeaves}</p>
    <p><strong>Pending leave requests:</strong> ${pendingLeaves}</p>
    <p><strong>Training completed:</strong> ${completedTrainings}</p>
    <p><strong>Attendance (P/L/A):</strong> ${presentCount}/${lateCount}/${absentCount}</p>
    <p><strong>Evaluation status:</strong> ${evaluation.status || 'Not rated'}</p>
  `;
  reportOutput.textContent = 'Press Generate Report to view a printable summary.';
}

function generateUserReport() {
  const reportPreview = document.getElementById('reportPreview');
  const reportOutput = document.getElementById('reportOutput');
  if (!reportPreview || !reportOutput) return;

  const leaveList = leaves.map(record => `${record.type} (${record.status}) from ${record.startDate} to ${record.endDate}`).join('\n') || 'No leave records available.';
  const trainingList = trainings.map(record => `${record.title} — ${record.status || 'Pending'} (${record.hours}h)`).join('\n') || 'No training records available.';
  const attendanceSummary = attendance.length ? attendance.map(record => `${record.date}: ${record.status}`).join('\n') : 'No attendance activity logged.';

  reportOutput.innerHTML = `<pre style="white-space: pre-wrap; line-height: 1.4;">Employee Report for ${currentUser.name}

Position: ${currentUser.position}
Email: ${currentUser.email}
Evaluation: ${evaluation.status || 'Not rated'}

Leave History:
${leaveList}

Training Summary:
${trainingList}

Attendance Details:
${attendanceSummary}
</pre>`;
  reportPreview.innerHTML = '<p>Report generated successfully.</p>';
}

function renderPerformancePage() {
  const attendanceRateEl = document.getElementById('performanceAttendanceRate');
  const trainingCompletedEl = document.getElementById('performanceTrainingCompleted');
  const leaveCountEl = document.getElementById('performanceLeaveCount');
  const evaluationStatusEl = document.getElementById('performanceEvaluationStatus');
  const activitiesEl = document.getElementById('performanceActivities');

  if (!attendanceRateEl || !trainingCompletedEl || !leaveCountEl || !evaluationStatusEl || !activitiesEl) return;

  const totalDays = attendance.length || 1;
  const presentCount = attendance.filter(item => item.status === 'Present').length;
  const attendancePercent = Math.round((presentCount / totalDays) * 100);
  const completedTrainings = trainings.filter(t => t.status === 'Completed').length;
  const requestCount = leaves.length;

  attendanceRateEl.textContent = `${attendancePercent}%`;
  trainingCompletedEl.textContent = `${completedTrainings}`;
  leaveCountEl.textContent = `${requestCount}`;
  evaluationStatusEl.textContent = evaluation.status || 'Pending review';

  const recentActivity = [];
  if (leaves.length) {
    recentActivity.push(`<strong>Leave Requests:</strong> ${leaves.slice(-3).map(l => `${l.type} (${l.status})`).join(', ')}`);
  }
  if (trainings.length) {
    recentActivity.push(`<strong>Training:</strong> ${trainings.slice(-3).map(t => `${t.title} (${t.status || 'Pending'})`).join(', ')}`);
  }
  if (attendance.length) {
    recentActivity.push(`<strong>Attendance:</strong> ${attendance.slice(-3).map(a => `${a.date} - ${a.status}`).join(', ')}`);
  }

  activitiesEl.innerHTML = recentActivity.length ? `<ul>${recentActivity.map(item => `<li>${item}</li>`).join('')}</ul>` : '<p>No recent activity to display.</p>';
}

function handleCheckbox(checkedId, uncheckedId) {
  const checkedEl = document.getElementById(checkedId);
  const uncheckedEl = document.getElementById(uncheckedId);
  if (checkedEl && checkedEl.checked && uncheckedEl) {
    uncheckedEl.checked = false;
  }
}

const pdsFieldIds = [
  'pdsSurname',
  'pdsFirstName',
  'pdsMiddleName',
  'pdsNameExtension',
  'pdsDob',
  'pdsPlaceOfBirth',
  'pdsSexAtBirth',
  'pdsCivilStatus',
  'pdsCitizenship',
  'pdsResidentialAddress',
  'pdsPermanentAddress',
  'pdsResidentialHouseLot',
  'pdsResidentialStreet',
  'pdsResidentialSubdivision',
  'pdsResidentialBarangay',
  'pdsResidentialCity',
  'pdsResidentialProvince',
  'pdsResidentialZip',
  'pdsPermanentHouseLot',
  'pdsPermanentStreet',
  'pdsPermanentSubdivision',
  'pdsPermanentBarangay',
  'pdsPermanentCity',
  'pdsPermanentProvince',
  'pdsPermanentZip',
  'pdsHeight',
  'pdsWeight',
  'pdsBloodType',
  'pdsGsis',
  'pdsPagibig',
  'pdsPhilhealth',
  'pdsPhilsys',
  'pdsTin',
  'pdsAgencyNo',
  'pdsDualCitizenshipType',
  'pdsDualCitizenshipCountry',
  'pdsTelephone',
  'pdsMobile',
  'pdsEmail',
  'pdsSpouseSurname',
  'pdsSpouseFirstName',
  'pdsSpouseMiddleName',
  'pdsSpouseNameExtension',
  'pdsSpouseOccupation',
  'pdsSpouseEmployer',
  'pdsSpouseBusinessAddress',
  'pdsSpouseTelephone',
  'pdsChild1Name',
  'pdsChild1Dob',
  'pdsChild2Name',
  'pdsChild2Dob',
  'pdsChild3Name',
  'pdsChild3Dob',
  'pdsChild4Name',
  'pdsChild4Dob',
  'pdsFatherSurname',
  'pdsFatherFirstName',
  'pdsFatherMiddleName',
  'pdsFatherNameExtension',
  'pdsMotherSurname',
  'pdsMotherFirstName',
  'pdsMotherMiddleName',
  'pdsFatherName',
  'pdsMotherName',
  'pdsChildren',
  'pdsElemSchool',
  'pdsElemDegree',
  'pdsElemUnits',
  'pdsElemFrom',
  'pdsElemTo',
  'pdsElemGradYear',
  'pdsElemHonors',
  'pdsSecSchool',
  'pdsSecDegree',
  'pdsSecUnits',
  'pdsSecFrom',
  'pdsSecTo',
  'pdsSecGradYear',
  'pdsSecHonors',
  'pdsVocSchool',
  'pdsVocDegree',
  'pdsVocUnits',
  'pdsVocFrom',
  'pdsVocTo',
  'pdsVocGradYear',
  'pdsVocHonors',
  'pdsColSchool',
  'pdsColDegree',
  'pdsColUnits',
  'pdsColFrom',
  'pdsColTo',
  'pdsColGradYear',
  'pdsColHonors',
  'pdsGradSchool',
  'pdsGradDegree',
  'pdsGradUnits',
  'pdsGradFrom',
  'pdsGradTo',
  'pdsGradGradYear',
  'pdsGradHonors',
  'pdsCivilService',
  'pdsCivilType1', 'pdsCivilRating1', 'pdsCivilDate1', 'pdsCivilPlace1', 'pdsCivilLicense1Number', 'pdsCivilLicense1ValidUntil',
  'pdsCivilType2', 'pdsCivilRating2', 'pdsCivilDate2', 'pdsCivilPlace2', 'pdsCivilLicense2Number', 'pdsCivilLicense2ValidUntil',
  'pdsCivilType3', 'pdsCivilRating3', 'pdsCivilDate3', 'pdsCivilPlace3', 'pdsCivilLicense3Number', 'pdsCivilLicense3ValidUntil',
  'pdsWorkFrom1', 'pdsWorkTo1', 'pdsWorkPosition1', 'pdsWorkCompany1', 'pdsWorkStatus1', 'pdsWorkGovt1',
  'pdsWorkFrom2', 'pdsWorkTo2', 'pdsWorkPosition2', 'pdsWorkCompany2', 'pdsWorkStatus2', 'pdsWorkGovt2',
  'pdsWorkFrom3', 'pdsWorkTo3', 'pdsWorkPosition3', 'pdsWorkCompany3', 'pdsWorkStatus3', 'pdsWorkGovt3',
  'pdsVolOrg1', 'pdsVolFrom1', 'pdsVolTo1', 'pdsVolHours1', 'pdsVolPosition1',
  'pdsVolOrg2', 'pdsVolFrom2', 'pdsVolTo2', 'pdsVolHours2', 'pdsVolPosition2',
  'pdsVolOrg3', 'pdsVolFrom3', 'pdsVolTo3', 'pdsVolHours3', 'pdsVolPosition3',
  'pdsWorkExperience',
  'pdsVoluntaryWork',
  'pdsSkills',
  'pdsDistinctions',
  'pdsOrganizationMembership',
  'pdsQ34a_yes', 'pdsQ34a_no', 'pdsQ34b_yes', 'pdsQ34b_no', 'pdsQ34b_detail',
  'pdsQ35a_yes', 'pdsQ35a_no', 'pdsQ35a_detail',
  'pdsQ35b_yes', 'pdsQ35b_no', 'pdsQ35b_detail',
  'pdsQ36_yes', 'pdsQ36_no', 'pdsQ36_detail',
  'pdsQ37_yes', 'pdsQ37_no', 'pdsQ37_detail',
  'pdsQ38a_yes', 'pdsQ38a_no', 'pdsQ38a_detail',
  'pdsQ38b_yes', 'pdsQ38b_no', 'pdsQ38b_detail',
  'pdsQ39_yes', 'pdsQ39_no', 'pdsQ39_detail',
  'pdsQ40a_yes', 'pdsQ40a_no', 'pdsQ40a_detail',
  'pdsQ40b_yes', 'pdsQ40b_no', 'pdsQ40b_detail',
  'pdsQ40c_yes', 'pdsQ40c_no', 'pdsQ40c_detail',
  'pdsFinalESignature', 'pdsFinalSignatureDate',
  'pdsESignature',
  'pdsSignatureDate'
];

function inferNameParts(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return { pdsSurname: '', pdsFirstName: '', pdsMiddleName: '' };

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return { pdsSurname: parts[0], pdsFirstName: '', pdsMiddleName: '' };
  }
  if (parts.length === 2) {
    return { pdsSurname: parts[1], pdsFirstName: parts[0], pdsMiddleName: '' };
  }

  const firstName = parts[0];
  const surname = parts[parts.length - 1];
  const middleName = parts.slice(1, -1).join(' ');

  return {
    pdsSurname: surname,
    pdsFirstName: firstName,
    pdsMiddleName: middleName
  };
}

let currentPdsSection = 1;
const totalPdsSections = 7;

function initializePdsSections() {
  currentPdsSection = 1;
  showPdsSection(1);
}

function setupDetailFieldVisibility() {
  // Map of YES checkbox IDs to their detail field container IDs
  const detailFieldMappings = {
    'pdsQ34b_yes': 'pdsQ34b_details',
    'pdsQ35a_yes': 'pdsQ35a_details',
    'pdsQ35b_yes': 'pdsQ35b_details',
    'pdsQ36_yes': 'pdsQ36_details',
    'pdsQ37_yes': 'pdsQ37_details',
    'pdsQ38a_yes': 'pdsQ38a_details',
    'pdsQ38b_yes': 'pdsQ38b_details',
    'pdsQ39_yes': 'pdsQ39_details',
    'pdsQ40a_yes': 'pdsQ40a_details',
    'pdsQ40b_yes': 'pdsQ40b_details',
    'pdsQ40c_yes': 'pdsQ40c_details'
  };

  // Set up listeners for each mapping
  Object.entries(detailFieldMappings).forEach(([yesCheckboxId, detailFieldId]) => {
    const yesCheckbox = document.getElementById(yesCheckboxId);
    const detailField = document.getElementById(detailFieldId);
    
    if (yesCheckbox && detailField) {
      // Initial state based on checkbox
      detailField.style.display = yesCheckbox.checked ? 'block' : 'none';
      
      // Add change listener
      yesCheckbox.addEventListener('change', function() {
        detailField.style.display = this.checked ? 'block' : 'none';
      });
    }
  });
}

function showPdsSection(sectionNumber) {
  // Hide all sections
  for (let i = 1; i <= totalPdsSections; i++) {
    const section = document.getElementById(`pdsSection${i}`);
    if (section) {
      section.classList.add('pds-section-hidden');
    }
  }
  
  // Show the current section
  const currentSection = document.getElementById(`pdsSection${sectionNumber}`);
  if (currentSection) {
    currentSection.classList.remove('pds-section-hidden');
  }

  const pdsMessage = document.getElementById('pdsMessage');
  if (pdsMessage) {
    pdsMessage.textContent = '';
    pdsMessage.className = 'message';
  }

  // Update next/previous visibility
  const btnPrev = document.getElementById('pdsBtnPrevious');
  const btnNext = document.getElementById('pdsBtnNext');
  const finalActions = document.getElementById('pdsFinalActions');

  if (btnPrev) {
    btnPrev.style.display = sectionNumber === 1 ? 'none' : 'inline-flex';
  }

  if (btnNext) {
    btnNext.style.display = sectionNumber === totalPdsSections ? 'none' : 'inline-flex';
  }

  if (finalActions) {
    finalActions.style.display = sectionNumber === totalPdsSections ? 'flex' : 'none';
  }

  // Update progress bar
  updatePdsProgress(sectionNumber);
  
  // Setup detail field visibility for section 7 (Other Information)
  if (sectionNumber === 7) {
    setupDetailFieldVisibility();
  }
  
  currentPdsSection = sectionNumber;
}

function updatePdsProgress(sectionNumber) {
  // Update progress bar fill
  const progressFill = document.getElementById('pdsProgressFill');
  if (progressFill) {
    const progressPercentage = (sectionNumber / totalPdsSections) * 100;
    progressFill.style.width = `${progressPercentage}%`;
  }
  
  // Update step indicators
  const steps = document.querySelectorAll('.pds-step');
  steps.forEach((step, index) => {
    const stepNumber = index + 1;
    step.classList.remove('active', 'completed');
    
    if (stepNumber < sectionNumber) {
      step.classList.add('completed');
    } else if (stepNumber === sectionNumber) {
      step.classList.add('active');
    }
  });
}

function nextPdsSection() {
  if (!validatePdsSection(currentPdsSection)) {
    return;
  }

  if (currentPdsSection < totalPdsSections) {
    showPdsSection(currentPdsSection + 1);
  }
}

function prevPdsSection() {
  if (currentPdsSection > 1) {
    showPdsSection(currentPdsSection - 1);
  }
}

function showPdsMessage(text, ok = false) {
  const msg = document.getElementById('pdsMessage');
  if (!msg) return;
  msg.textContent = text;
  msg.className = 'message';
  msg.classList.add(ok ? 'ok' : 'err');
}

function clearPdsSectionErrors(sectionNumber) {
  const section = document.getElementById(`pdsSection${sectionNumber}`);
  if (!section) return;
  section.querySelectorAll('.pds-field-error').forEach(el => el.classList.remove('pds-field-error'));
}

function highlightPdsField(field) {
  if (!field) return;
  const wrapper = field.closest('.pds-sheet-value') || field.closest('.pds-family-value') || field;
  if (wrapper) {
    wrapper.classList.add('pds-field-error');
    if (typeof wrapper.scrollIntoView === 'function') {
      wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return;
  }
  field.classList.add('pds-field-error');
}

function validatePdsSection(sectionNumber) {
  const section = document.getElementById(`pdsSection${sectionNumber}`);
  if (!section) return true;

  clearPdsSectionErrors(sectionNumber);

  const visibleRequiredFields = Array.from(section.querySelectorAll('[data-required]'));
  for (const field of visibleRequiredFields) {
    const value = (field.value || '').trim();
    if (!value) {
      const labelText = field.closest('td')?.previousElementSibling?.textContent?.trim() || field.getAttribute('id') || 'required field';
      showPdsMessage(`Please answer: ${labelText}.`, false);
      highlightPdsField(field);
      return false;
    }
  }

  const hiddenRequiredBySection = {
    1: [
      { id: 'pdsSexAtBirth', label: 'Sex at Birth' },
      { id: 'pdsCivilStatus', label: 'Civil Status' },
      { id: 'pdsCitizenship', label: 'Citizenship' }
    ],
    4: [
      { id: 'pdsCivilService', label: 'Civil Service Eligibility' }
    ],
    5: [
      { id: 'pdsWorkExperience', label: 'Work Experience' }
    ],
    6: [
      { id: 'pdsVoluntaryWork', label: 'Voluntary Work' },
      { id: 'pdsSkills', label: 'Skills' }
    ],
    7: [
      { id: 'pdsFinalESignature', label: 'Final Signature' },
      { id: 'pdsFinalSignatureDate', label: 'Signature Date' }
    ]
  };

  const hiddenRequired = hiddenRequiredBySection[sectionNumber] || [];
  for (const fieldDef of hiddenRequired) {
    const field = document.getElementById(fieldDef.id);
    if (!field) continue;
    const value = (field.value || '').trim();
    if (!value) {
      showPdsMessage(`Please answer: ${fieldDef.label}.`, false);
      highlightPdsField(field);
      return false;
    }
  }

  if (sectionNumber === 1 && document.getElementById('pdsCitizenship')?.value === 'Dual Citizenship') {
    const dualFields = [
      { id: 'pdsDualCitizenshipType', label: 'Dual Citizenship Type' },
      { id: 'pdsDualCitizenshipCountry', label: 'Dual Citizenship Country' }
    ];
    for (const fieldDef of dualFields) {
      const field = document.getElementById(fieldDef.id);
      if (!field) continue;
      const value = (field.value || '').trim();
      if (!value) {
        showPdsMessage(`Please answer: ${fieldDef.label}.`, false);
        highlightPdsField(field);
        return false;
      }
    }
  }

  return true;
}

function loadPdsForm() {
  const defaults = {
    pdsEmail: currentUser.email,
    pdsSexAtBirth: currentUser.gender || '',
    pdsSignatureDate: new Date().toISOString().slice(0, 10),
    ...inferNameParts(currentUser.name)
  };

  pdsFieldIds.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (!field) return;

    const storedValue = pdsData[fieldId];
    if (storedValue !== undefined && storedValue !== null) {
      field.value = String(storedValue);
      return;
    }

    if (Object.prototype.hasOwnProperty.call(defaults, fieldId)) {
      field.value = defaults[fieldId];
    }
  });

  syncSexAtBirthCheckboxes();
  syncCivilStatusCheckboxes();
  syncCitizenshipOptions();
  syncDualCitizenshipTypeCheckboxes();
  hydrateStructuredAddressFields();
  hydrateFamilyStructuredFields();
  initializeSignaturePad();
  initializeFinalSignaturePad();
}

function initializeSignaturePad() {
  const canvas = document.getElementById('pdsSignaturePad');
  const hiddenSignature = document.getElementById('pdsESignature');
  if (!canvas || !hiddenSignature) return;

  if (!signaturePadCtx) {
    signaturePadCtx = canvas.getContext('2d');
    signaturePadCtx.lineCap = 'round';
    signaturePadCtx.lineJoin = 'round';
    signaturePadCtx.strokeStyle = '#111827';
    signaturePadCtx.lineWidth = 2;
  }

  if (!canvas.dataset.bound) {
    canvas.addEventListener('pointerdown', startSignatureStroke);
    canvas.addEventListener('pointermove', drawSignatureStroke);
    canvas.addEventListener('pointerup', endSignatureStroke);
    canvas.addEventListener('pointerleave', endSignatureStroke);
    canvas.addEventListener('pointercancel', endSignatureStroke);
    canvas.dataset.bound = 'true';
  }

  signaturePadCtx.clearRect(0, 0, canvas.width, canvas.height);

  if (hiddenSignature.value) {
    const image = new Image();
    image.onload = () => {
      signaturePadCtx.clearRect(0, 0, canvas.width, canvas.height);
      signaturePadCtx.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = hiddenSignature.value;
  }
}

function initializeFinalSignaturePad() {
  const canvas = document.getElementById('pdsFinalSignaturePad');
  const hiddenSignature = document.getElementById('pdsFinalESignature');
  if (!canvas || !hiddenSignature) return;

  if (!finalSignaturePadCtx) {
    finalSignaturePadCtx = canvas.getContext('2d');
    finalSignaturePadCtx.lineCap = 'round';
    finalSignaturePadCtx.lineJoin = 'round';
    finalSignaturePadCtx.strokeStyle = '#111827';
    finalSignaturePadCtx.lineWidth = 2;
  }

  if (!canvas.dataset.boundFinal) {
    canvas.addEventListener('pointerdown', startFinalSignatureStroke);
    canvas.addEventListener('pointermove', drawFinalSignatureStroke);
    canvas.addEventListener('pointerup', endFinalSignatureStroke);
    canvas.addEventListener('pointerleave', endFinalSignatureStroke);
    canvas.addEventListener('pointercancel', endFinalSignatureStroke);
    canvas.dataset.boundFinal = 'true';
  }

  finalSignaturePadCtx.clearRect(0, 0, canvas.width, canvas.height);

  if (hiddenSignature.value) {
    const image = new Image();
    image.onload = () => {
      finalSignaturePadCtx.clearRect(0, 0, canvas.width, canvas.height);
      finalSignaturePadCtx.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = hiddenSignature.value;
  }
}

function getSignaturePoint(event) {
  const canvas = document.getElementById('pdsSignaturePad');
  if (!canvas) return { x: 0, y: 0 };

  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return { x: 0, y: 0 };

  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height)
  };
}

function getFinalSignaturePoint(event) {
  const canvas = document.getElementById('pdsFinalSignaturePad');
  if (!canvas) return { x: 0, y: 0 };

  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return { x: 0, y: 0 };

  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height)
  };
}

function startSignatureStroke(event) {
  if (!signaturePadCtx) return;
  const canvas = document.getElementById('pdsSignaturePad');
  if (!canvas) return;

  isSignatureDrawing = true;
  canvas.setPointerCapture(event.pointerId);
  const point = getSignaturePoint(event);
  signaturePadCtx.beginPath();
  signaturePadCtx.moveTo(point.x, point.y);
  event.preventDefault();
}

function drawSignatureStroke(event) {
  if (!isSignatureDrawing || !signaturePadCtx) return;
  const point = getSignaturePoint(event);
  signaturePadCtx.lineTo(point.x, point.y);
  signaturePadCtx.stroke();
  event.preventDefault();
}

function endSignatureStroke(event) {
  if (!isSignatureDrawing || !signaturePadCtx) return;
  isSignatureDrawing = false;
  signaturePadCtx.closePath();

  const canvas = document.getElementById('pdsSignaturePad');
  const hiddenSignature = document.getElementById('pdsESignature');
  if (!canvas || !hiddenSignature) return;

  hiddenSignature.value = canvas.toDataURL('image/png');
  event.preventDefault();
}

function startFinalSignatureStroke(event) {
  if (!finalSignaturePadCtx) return;
  const canvas = document.getElementById('pdsFinalSignaturePad');
  if (!canvas) return;

  isFinalSignatureDrawing = true;
  canvas.setPointerCapture(event.pointerId);
  const point = getFinalSignaturePoint(event);
  finalSignaturePadCtx.beginPath();
  finalSignaturePadCtx.moveTo(point.x, point.y);
  event.preventDefault();
}

function drawFinalSignatureStroke(event) {
  if (!isFinalSignatureDrawing || !finalSignaturePadCtx) return;
  const point = getFinalSignaturePoint(event);
  finalSignaturePadCtx.lineTo(point.x, point.y);
  finalSignaturePadCtx.stroke();
  event.preventDefault();
}

function endFinalSignatureStroke(event) {
  if (!isFinalSignatureDrawing || !finalSignaturePadCtx) return;
  isFinalSignatureDrawing = false;
  finalSignaturePadCtx.closePath();

  const canvas = document.getElementById('pdsFinalSignaturePad');
  const hiddenSignature = document.getElementById('pdsFinalESignature');
  if (!canvas || !hiddenSignature) return;

  hiddenSignature.value = canvas.toDataURL('image/png');
  event.preventDefault();
}

function clearPdsSignature() {
  const canvas = document.getElementById('pdsSignaturePad');
  const hiddenSignature = document.getElementById('pdsESignature');
  if (!canvas || !hiddenSignature || !signaturePadCtx) return;

  signaturePadCtx.clearRect(0, 0, canvas.width, canvas.height);
  hiddenSignature.value = '';
}

function clearFinalSignature() {
  const canvas = document.getElementById('pdsFinalSignaturePad');
  const hiddenSignature = document.getElementById('pdsFinalESignature');
  if (!canvas || !hiddenSignature || !finalSignaturePadCtx) return;

  finalSignaturePadCtx.clearRect(0, 0, canvas.width, canvas.height);
  hiddenSignature.value = '';
}

function setSexAtBirth(value, checked) {
  const sexInput = document.getElementById('pdsSexAtBirth');
  const maleCb = document.getElementById('pdsSexMale');
  const femaleCb = document.getElementById('pdsSexFemale');
  if (!sexInput || !maleCb || !femaleCb) return;

  if (!checked) {
    sexInput.value = '';
    maleCb.checked = false;
    femaleCb.checked = false;
    return;
  }

  sexInput.value = value;
  maleCb.checked = value === 'Male';
  femaleCb.checked = value === 'Female';
}

function syncSexAtBirthCheckboxes() {
  const sexInput = document.getElementById('pdsSexAtBirth');
  const maleCb = document.getElementById('pdsSexMale');
  const femaleCb = document.getElementById('pdsSexFemale');
  if (!sexInput || !maleCb || !femaleCb) return;

  maleCb.checked = sexInput.value === 'Male';
  femaleCb.checked = sexInput.value === 'Female';
}

function setCivilStatus(value, checked) {
  const civilInput = document.getElementById('pdsCivilStatus');
  const single = document.getElementById('pdsCivilSingle');
  const married = document.getElementById('pdsCivilMarried');
  const widowed = document.getElementById('pdsCivilWidowed');
  const separated = document.getElementById('pdsCivilSeparated');
  const other = document.getElementById('pdsCivilOther');

  if (!civilInput || !single || !married || !widowed || !separated || !other) return;

  if (!checked) {
    civilInput.value = '';
    single.checked = false;
    married.checked = false;
    widowed.checked = false;
    separated.checked = false;
    other.checked = false;
    return;
  }

  civilInput.value = value;
  single.checked = value === 'Single';
  married.checked = value === 'Married';
  widowed.checked = value === 'Widowed';
  separated.checked = value === 'Separated';
  other.checked = value === 'Other';
}

function syncCivilStatusCheckboxes() {
  const civilInput = document.getElementById('pdsCivilStatus');
  const single = document.getElementById('pdsCivilSingle');
  const married = document.getElementById('pdsCivilMarried');
  const widowed = document.getElementById('pdsCivilWidowed');
  const separated = document.getElementById('pdsCivilSeparated');
  const other = document.getElementById('pdsCivilOther');

  if (!civilInput || !single || !married || !widowed || !separated || !other) return;

  single.checked = civilInput.value === 'Single';
  married.checked = civilInput.value === 'Married';
  widowed.checked = civilInput.value === 'Widowed';
  separated.checked = civilInput.value === 'Separated';
  other.checked = civilInput.value === 'Other';
}

function setCitizenshipOption(value, checked) {
  const citizenshipInput = document.getElementById('pdsCitizenship');
  const filipinoCb = document.getElementById('pdsCitizenshipFilipino');
  const dualCb = document.getElementById('pdsCitizenshipDual');

  if (!citizenshipInput || !filipinoCb || !dualCb) return;

  if (!checked) {
    citizenshipInput.value = '';
    filipinoCb.checked = false;
    dualCb.checked = false;
    setDualCitizenshipType('', false);
    return;
  }

  citizenshipInput.value = value;
  filipinoCb.checked = value === 'Filipino';
  dualCb.checked = value === 'Dual Citizenship';

  if (value !== 'Dual Citizenship') {
    setDualCitizenshipType('', false);
  }
}

function syncCitizenshipOptions() {
  const citizenshipInput = document.getElementById('pdsCitizenship');
  const filipinoCb = document.getElementById('pdsCitizenshipFilipino');
  const dualCb = document.getElementById('pdsCitizenshipDual');

  if (!citizenshipInput || !filipinoCb || !dualCb) return;

  filipinoCb.checked = citizenshipInput.value === 'Filipino';
  dualCb.checked = citizenshipInput.value === 'Dual Citizenship';
}

function setDualCitizenshipType(value, checked) {
  const dualTypeInput = document.getElementById('pdsDualCitizenshipType');
  const byBirth = document.getElementById('pdsDualByBirth');
  const byNaturalization = document.getElementById('pdsDualByNaturalization');

  if (!dualTypeInput || !byBirth || !byNaturalization) return;

  if (!checked) {
    dualTypeInput.value = '';
    byBirth.checked = false;
    byNaturalization.checked = false;
    return;
  }

  dualTypeInput.value = value;
  byBirth.checked = value === 'By Birth';
  byNaturalization.checked = value === 'By Naturalization';
}

function syncDualCitizenshipTypeCheckboxes() {
  const dualTypeInput = document.getElementById('pdsDualCitizenshipType');
  const byBirth = document.getElementById('pdsDualByBirth');
  const byNaturalization = document.getElementById('pdsDualByNaturalization');

  if (!dualTypeInput || !byBirth || !byNaturalization) return;

  byBirth.checked = dualTypeInput.value === 'By Birth';
  byNaturalization.checked = dualTypeInput.value === 'By Naturalization';
}

function getFieldValue(id) {
  const field = document.getElementById(id);
  return field ? (field.value || '').trim() : '';
}

function setFieldValue(id, value) {
  const field = document.getElementById(id);
  if (field) field.value = value || '';
}

function hydrateStructuredAddressFields() {
  const residentialParts = [
    getFieldValue('pdsResidentialHouseLot'),
    getFieldValue('pdsResidentialStreet'),
    getFieldValue('pdsResidentialSubdivision'),
    getFieldValue('pdsResidentialBarangay'),
    getFieldValue('pdsResidentialCity'),
    getFieldValue('pdsResidentialProvince'),
    getFieldValue('pdsResidentialZip')
  ];
  const permanentParts = [
    getFieldValue('pdsPermanentHouseLot'),
    getFieldValue('pdsPermanentStreet'),
    getFieldValue('pdsPermanentSubdivision'),
    getFieldValue('pdsPermanentBarangay'),
    getFieldValue('pdsPermanentCity'),
    getFieldValue('pdsPermanentProvince'),
    getFieldValue('pdsPermanentZip')
  ];

  const legacyResidential = getFieldValue('pdsResidentialAddress');
  const legacyPermanent = getFieldValue('pdsPermanentAddress');

  if (!residentialParts.some(Boolean) && legacyResidential.includes('|')) {
    const values = legacyResidential.split('|').map(item => item.trim());
    setFieldValue('pdsResidentialHouseLot', values[0] || '');
    setFieldValue('pdsResidentialStreet', values[1] || '');
    setFieldValue('pdsResidentialSubdivision', values[2] || '');
    setFieldValue('pdsResidentialBarangay', values[3] || '');
    setFieldValue('pdsResidentialCity', values[4] || '');
    setFieldValue('pdsResidentialProvince', values[5] || '');
    setFieldValue('pdsResidentialZip', values[6] || '');
  }

  if (!permanentParts.some(Boolean) && legacyPermanent.includes('|')) {
    const values = legacyPermanent.split('|').map(item => item.trim());
    setFieldValue('pdsPermanentHouseLot', values[0] || '');
    setFieldValue('pdsPermanentStreet', values[1] || '');
    setFieldValue('pdsPermanentSubdivision', values[2] || '');
    setFieldValue('pdsPermanentBarangay', values[3] || '');
    setFieldValue('pdsPermanentCity', values[4] || '');
    setFieldValue('pdsPermanentProvince', values[5] || '');
    setFieldValue('pdsPermanentZip', values[6] || '');
  }
}

function syncLegacyAddressFields() {
  const residentialCombined = [
    getFieldValue('pdsResidentialHouseLot'),
    getFieldValue('pdsResidentialStreet'),
    getFieldValue('pdsResidentialSubdivision'),
    getFieldValue('pdsResidentialBarangay'),
    getFieldValue('pdsResidentialCity'),
    getFieldValue('pdsResidentialProvince'),
    getFieldValue('pdsResidentialZip')
  ].join(' | ');

  const permanentCombined = [
    getFieldValue('pdsPermanentHouseLot'),
    getFieldValue('pdsPermanentStreet'),
    getFieldValue('pdsPermanentSubdivision'),
    getFieldValue('pdsPermanentBarangay'),
    getFieldValue('pdsPermanentCity'),
    getFieldValue('pdsPermanentProvince'),
    getFieldValue('pdsPermanentZip')
  ].join(' | ');

  setFieldValue('pdsResidentialAddress', residentialCombined);
  setFieldValue('pdsPermanentAddress', permanentCombined);
}

function hydrateFamilyStructuredFields() {
  const hasChildrenRows = [
    getFieldValue('pdsChild1Name'),
    getFieldValue('pdsChild2Name'),
    getFieldValue('pdsChild3Name'),
    getFieldValue('pdsChild4Name')
  ].some(Boolean);

  const legacyChildren = getFieldValue('pdsChildren');
  if (!hasChildrenRows && legacyChildren) {
    const childLines = legacyChildren
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .slice(0, 4);

    childLines.forEach((line, index) => {
      const [namePart, dobPart] = line.split('|').map(item => (item || '').trim());
      setFieldValue(`pdsChild${index + 1}Name`, namePart || line);
      setFieldValue(`pdsChild${index + 1}Dob`, dobPart || '');
    });
  }

  const hasFatherParts = [
    getFieldValue('pdsFatherSurname'),
    getFieldValue('pdsFatherFirstName'),
    getFieldValue('pdsFatherMiddleName')
  ].some(Boolean);
  const legacyFather = getFieldValue('pdsFatherName');
  if (!hasFatherParts && legacyFather) {
    setFieldValue('pdsFatherSurname', legacyFather);
  }

  const hasMotherParts = [
    getFieldValue('pdsMotherSurname'),
    getFieldValue('pdsMotherFirstName'),
    getFieldValue('pdsMotherMiddleName')
  ].some(Boolean);
  const legacyMother = getFieldValue('pdsMotherName');
  if (!hasMotherParts && legacyMother) {
    setFieldValue('pdsMotherSurname', legacyMother);
  }
}

function syncLegacyFamilyFields() {
  const childrenLines = [1, 2, 3, 4]
    .map(index => {
      const name = getFieldValue(`pdsChild${index}Name`);
      const dob = getFieldValue(`pdsChild${index}Dob`);
      if (!name && !dob) return '';
      return dob ? `${name} | ${dob}` : name;
    })
    .filter(Boolean);

  const fatherNameParts = [
    getFieldValue('pdsFatherSurname'),
    getFieldValue('pdsFatherFirstName'),
    getFieldValue('pdsFatherMiddleName')
  ].filter(Boolean);

  const fatherExtension = getFieldValue('pdsFatherNameExtension');
  const fatherJoined = fatherNameParts.join(', ').trim();
  const fatherFull = fatherExtension ? `${fatherJoined} ${fatherExtension}`.trim() : fatherJoined;

  const motherNameParts = [
    getFieldValue('pdsMotherSurname'),
    getFieldValue('pdsMotherFirstName'),
    getFieldValue('pdsMotherMiddleName')
  ].filter(Boolean);

  setFieldValue('pdsChildren', childrenLines.join('\n'));
  setFieldValue('pdsFatherName', fatherFull);
  setFieldValue('pdsMotherName', motherNameParts.join(', ').trim());
}

function showPdsMessage(text, ok) {
  const msg = document.getElementById('pdsMessage');
  if (!msg) return;
  msg.textContent = text || '';
  msg.className = 'message';
  if (!text) return;
  msg.classList.add(ok ? 'ok' : 'err');
}

function savePds() {
  if (!currentUser) return;

  const surname = (document.getElementById('pdsSurname').value || '').trim();
  const firstName = (document.getElementById('pdsFirstName').value || '').trim();
  const mobile = (document.getElementById('pdsMobile').value || '').trim();

  if (!surname || !firstName || !mobile) {
    showPdsMessage('Please provide at least Surname, First Name, and Mobile Number.', false);
    return;
  }

  const updated = {
    ...pdsData,
    updatedAt: new Date().toISOString()
  };

  syncLegacyAddressFields();
  syncLegacyFamilyFields();

  pdsFieldIds.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (!field) return;
    updated[fieldId] = field.value;
  });

  pdsData = updated;
  saveUserData();
  showPdsMessage('PDS saved successfully.', true);
}

function resetPdsForm() {
  pdsData = {};
  saveUserData();
  initializePdsSections();
  loadPdsForm();
  showPdsMessage('PDS form reset. Default account details were reloaded.', true);
}

function seedUserSideDefaults() {
  let changed = false;

  if (!evaluation || !evaluation.status) {
    evaluation = { status: '' };
    changed = true;
  }

  if (!Array.isArray(attendance)) {
    attendance = [];
    changed = true;
  }

  if (!Array.isArray(announcements)) announcements = [];

  if (changed) saveUserData();
}

function daysBetween(start, end) {
  const d1 = new Date(start);
  const d2 = new Date(end);
  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime()) || d2 < d1) return 0;
  return Math.max(1, (d2 - d1) / (1000 * 60 * 60 * 24) + 1);
}

function applyLeave() {
  const type = document.getElementById('leaveType').value;
  const start = document.getElementById('startDate').value;
  const end = document.getElementById('endDate').value;

  if (!start || !end) return;
  
  // Check if medical certificate is required for sick leave
  if (type === 'Sick Leave') {
    const medCertFile = document.getElementById('medicalCert').files[0];
    if (!medCertFile) {
      showLeaveNotification('Medical certificate is required for Sick Leave.', 'error');
      return;
    }
    
    // Check file size (max 5MB)
    if (medCertFile.size > 5 * 1024 * 1024) {
      showLeaveNotification('Medical certificate file size must not exceed 5MB.', 'error');
      return;
    }
  }

  const days = daysBetween(start, end);
  if (!days) return;

  // Create leave object
  const leaveObj = {
    id: Date.now(),
    type,
    start,
    end,
    days,
    status: 'Pending',
    medicalCertificate: null
  };

  // Handle medical certificate file
  if (type === 'Sick Leave') {
    const medCertFile = document.getElementById('medicalCert').files[0];
    const reader = new FileReader();
    
    reader.onload = function(e) {
      leaveObj.medicalCertificate = {
        name: medCertFile.name,
        type: medCertFile.type,
        data: e.target.result // Base64 encoded file data
      };
      
      leaves.unshift(leaveObj);
      saveUserData();
      renderLeaves();
      renderOverview();
      
      // Show notification to user
      showLeaveNotification(`Leave request submitted with medical certificate! Waiting for admin approval.`, 'success');
      
      // Clear form
      document.getElementById('leaveType').value = '';
      document.getElementById('startDate').value = '';
      document.getElementById('endDate').value = '';
      document.getElementById('medicalCert').value = '';
      toggleMedicalCertField();
      populateLeaveTypeDropdown();
    };
    
    reader.readAsDataURL(medCertFile);
  } else {
    leaves.unshift(leaveObj);
    saveUserData();
    renderLeaves();
    renderOverview();
    
    // Show notification to user
    showLeaveNotification(`Leave request submitted! Waiting for admin approval.`, 'success');
    
    // Clear form
    document.getElementById('leaveType').value = '';
    document.getElementById('startDate').value = '';
    document.getElementById('endDate').value = '';
    toggleMedicalCertField();
    populateLeaveTypeDropdown();
  }
}

function updateLeave(id, status) {
  leaves = leaves.map(l => l.id === id ? { ...l, status } : l);
  saveUserData();
  renderLeaves();
  renderOverview();
}

function renderLeaves() {
  const tbody = document.querySelector('#leaveTable tbody');
  tbody.innerHTML = '';

  leaves.forEach(l => {
    const cssClass = l.status.toLowerCase();
    const certButton = l.medicalCertificate 
      ? `<button class="btn btn-outline" onclick="viewMedicalCertificate(${l.id})" style="padding: 6px 12px; font-size: 0.85rem; background: #e8f4f8; color: #0ea5e9;">View Cert</button>`
      : (l.type === 'Sick Leave' ? '<span style="color: #999;">Pending</span>' : '<span style="color: #ccc;">N/A</span>');
    
    const row = `
      <tr>
        <td>${l.type}</td>
        <td>${l.start}</td>
        <td>${l.end}</td>
        <td>${l.days}</td>
        <td><span class="status ${cssClass}">${l.status}</span></td>
        <td>${certButton}</td>
        <td><button class="btn btn-outline" onclick="openEmployeeLeaveDetailsModal(${l.id})" style="padding: 6px 12px; font-size: 0.85rem;">View Details</button></td>
      </tr>`;
    tbody.innerHTML += row;
  });
}

// ============ Employee Leave Details Modal ============

async function openEmployeeLeaveDetailsModal(leaveId) {
  const leave = leaves.find(l => l.id === leaveId);
  if (!leave) return;

  const modalContent = document.getElementById('employeeLeaveModalContent');
  const cssClass = (leave.status || 'Pending').toLowerCase();
  
  modalContent.innerHTML = `
    <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
      <p><strong>Leave Type:</strong> ${leave.type}</p>
      <p><strong>Start Date:</strong> ${leave.start}</p>
      <p><strong>End Date:</strong> ${leave.end}</p>
      <p><strong>Number of Days:</strong> ${leave.days}</p>
      <p><strong>Status:</strong> <span class="status ${cssClass}">${leave.status}</span></p>
    </div>
  `;

  // Display admin comments
  await displayEmployeeComments(leaveId);

  // Show modal
  document.getElementById('leaveDetailsModalEmployee').style.display = 'block';
}

function closeEmployeeLeaveModal() {
  document.getElementById('leaveDetailsModalEmployee').style.display = 'none';
}

function viewMedicalCertificate(leaveId) {
  const leave = leaves.find(l => l.id === leaveId);
  if (!leave || !leave.medicalCertificate) {
    showLeaveNotification('Medical certificate not found.', 'error');
    return;
  }

  const cert = leave.medicalCertificate;
  const content = document.getElementById('medicalCertContent');
  
  // Check if it's an image
  if (cert.type.startsWith('image/')) {
    content.innerHTML = `<img src="${cert.data}" style="max-width: 100%; height: auto; border-radius: 8px;">`;
  } else if (cert.type === 'application/pdf') {
    content.innerHTML = `
      <p style="margin-bottom: 15px; text-align: center;">
        <strong>${cert.name}</strong>
      </p>
      <p style="color: #666; text-align: center;">PDF files are not displayed inline. Please download or contact admin to view.</p>
      <div style="text-align: center; margin-top: 20px;">
        <a href="${cert.data}" download="${cert.name}" class="btn btn-primary" style="text-decoration: none; display: inline-block; padding: 10px 20px;">Download PDF</a>
      </div>
    `;
  } else {
    content.innerHTML = `
      <p><strong>File Name:</strong> ${cert.name}</p>
      <p><strong>File Type:</strong> ${cert.type}</p>
      <p style="color: #666; margin-top: 20px;">Document preview not available for this file type. Please contact admin to view the full document.</p>
    `;
  }
  
  document.getElementById('medicalCertModal').style.display = 'block';
}

function closeMedicalCertModal() {
  document.getElementById('medicalCertModal').style.display = 'none';
}

async function displayEmployeeComments(leaveId) {
  const commentsList = document.getElementById('employeeCommentsList');
  let comments = [];
  try {
    const res = await fetch('/api/hr/leave-comments?email=' + encodeURIComponent(currentUser.email) + '&leaveId=' + encodeURIComponent(leaveId));
    const data = await res.json();
    comments = data.success ? (data.items || []) : [];
  } catch (err) {
    comments = [];
  }

  if (!comments.length) {
    commentsList.innerHTML = '<p style="color: #999; margin: 0;">No admin comments yet. You\'ll be notified when admin adds notes.</p>';
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
      <div>
        <p style="font-weight: 600; margin: 0 0 4px 0; color: #333;">Admin Note</p>
        <p style="margin: 0; color: #555; font-size: 0.9rem;">${comment.text}</p>
        <p style="margin: 4px 0 0 0; color: #999; font-size: 0.8rem;">${comment.date}</p>
      </div>
    `;
    commentsList.appendChild(commentEl);
  });
}

// Close modal when clicking outside
document.addEventListener('click', function(event) {
  const modal = document.getElementById('leaveDetailsModalEmployee');
  if (event.target === modal) {
    closeEmployeeLeaveModal();
  }
});

function addTraining() {
  const title = document.getElementById('title').value.trim();
  const start = document.getElementById('tStart').value;
  const end = document.getElementById('tEnd').value;
  const hours = document.getElementById('hours').value;
  const type = document.getElementById('tType').value;
  const sponsor = document.getElementById('sponsor').value.trim();

  if (!title) return;

  trainings.unshift({
    id: Date.now(),
    title,
    start,
    end,
    hours,
    type,
    sponsor
  });
  saveUserData();
  renderTraining();
  renderOverview();
  saveCurrentSnapshot();
}

function deleteTraining(id) {
  trainings = trainings.filter(t => t.id !== id);
  saveUserData();
  renderTraining();
  renderOverview();
  saveCurrentSnapshot();
}

function renderTraining() {
  const tbody = document.querySelector('#trainingTable tbody');
  tbody.innerHTML = '';

  trainings.forEach(t => {
    const row = `
      <tr>
        <td>${t.title}</td>
        <td>${t.start || '-'} - ${t.end || '-'}</td>
        <td>${t.hours || '-'}</td>
        <td>${t.type}</td>
        <td>${t.sponsor || '-'}</td>
        <td><button onclick="deleteTraining(${t.id})" class="btn btn-danger">Delete</button></td>
      </tr>`;
    tbody.innerHTML += row;
  });
}

function renderAttendance() {
  const present = attendance.filter(a => a.status === 'Present').length;
  const late = attendance.filter(a => a.status === 'Late').length;
  const absent = attendance.filter(a => a.status === 'Absent').length;

  const presentEl = document.getElementById('attendancePresentCount');
  const lateEl = document.getElementById('attendanceLateCount');
  const absentEl = document.getElementById('attendanceAbsentCount');
  if (!presentEl || !lateEl || !absentEl) return;

  presentEl.textContent = String(present);
  lateEl.textContent = String(late);
  absentEl.textContent = String(absent);
}

function renderAnnouncements() {
  const board = document.getElementById('announcementBoard');
  if (!board) return;
  board.innerHTML = '';

  if (!announcements.length) {
    board.innerHTML = '<p class="form-note">No announcements yet.</p>';
    return;
  }

  announcements.forEach(item => {
    const block = document.createElement('div');
    block.className = 'announcement-item';
    const title = item.title || item.text || 'Announcement';
    block.innerHTML = `
      <div>
        <strong>${title}</strong>
        <p class="form-note">Posted: ${item.date}</p>
        <button class="btn btn-outline" style="margin-top: 8px;" onclick="showPage('announcements')">Learn more</button>
      </div>`;
    board.appendChild(block);
  });
}

function renderAnnouncementModule() {
  const board = document.getElementById('announcementModuleBoard');
  if (!board) return;
  board.innerHTML = '';

  renderAnnouncementUnreadPanel();

  if (!announcements.length) {
    board.innerHTML = '<p class="form-note">No announcements yet.</p>';
    return;
  }

  announcements.forEach(item => {
    const block = document.createElement('div');
    block.className = 'announcement-item';
    const title = item.title || item.text || 'Announcement';
    const description = item.description || '';
    block.innerHTML = `
      <div>
        <strong>${title}</strong>
        ${description ? `<p style="margin:6px 0 0; color:#475569;">${description}</p>` : '<p style="margin:6px 0 0; color:#475569;">No additional details provided.</p>'}
        ${item.image ? `<img src="${item.image}" alt="${title}" class="announcement-item-image" style="margin-top:10px;">` : ''}
        <p class="form-note">Posted: ${item.date}</p>
      </div>`;
    board.appendChild(block);
  });
}

function renderOverview() {
  const leaveQuota = {
    'Vacation Leave': 5,
    'Mandatory/Force Leave': 5,
    'Sick Leave': 5,
    'Maternity Leave': 105,
    'Paternity Leave': 7,
    'Special Privilege Leave': 3,
    'Solo Parent Leave': 7,
    '10-Day VAWC Leave': 10,
    'Rehabilitation Privilege': 0,
    'Special Leave Benefits for Women': 0,
    'Special Emergency (Calamity) Leave': 5,
    'Adoption Leave': 0,
    'Wellness Leave': 0
  };

  const requestedByType = {};
  
  // Initialize requestedByType with all leave types
  Object.keys(leaveQuota).forEach(type => {
    requestedByType[type] = 0;
  });

  leaves
    .filter(l => l.status !== 'Rejected')
    .forEach(l => {
      if (Object.prototype.hasOwnProperty.call(requestedByType, l.type)) {
        requestedByType[l.type] += Number(l.days || 0);
      }
    });

  // Render leave balance dynamically
  renderLeaveBalance(leaveQuota, requestedByType);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = trainings
    .filter(t => t.start && t.start >= today)
    .sort((a, b) => (a.start > b.start ? 1 : -1));

  const attendancePresent = attendance.filter(a => a.status === 'Present').length;
  const attendanceLate = attendance.filter(a => a.status === 'Late').length;
  const attendanceAbsent = attendance.filter(a => a.status === 'Absent').length;

  const pendingLeaves = leaves.filter(l => l.status === 'Pending').length;
  const approvedLeaves = leaves.filter(l => l.status === 'Approved').length;
  const rejectedLeaves = leaves.filter(l => l.status === 'Rejected').length;

  // Calculate total leave balance
  const genderAppropriateLeaves = getGenderAppropriateLeaveTypes();
  let totalLeaveQuota = 0;
  let totalLeaveUsed = 0;

  genderAppropriateLeaves.forEach(leaveType => {
    const quota = leaveQuota[leaveType];
    if (quota > 0) {
      totalLeaveQuota += quota;
      totalLeaveUsed += requestedByType[leaveType] || 0;
    }
  });

  document.getElementById('totalLeaveBalance').textContent = String(totalLeaveQuota);
  document.getElementById('totalLeaveUsed').textContent = `${totalLeaveUsed} used`;

  document.getElementById('upcomingTrainingCount').textContent = String(upcoming.length);
  document.getElementById('nextTrainingDate').textContent = upcoming.length
    ? 'Next: ' + upcoming[0].start
    : 'No scheduled date';
  const evaluationText = evaluation.status || 'Not yet rated';
  const evaluationEl = document.getElementById('evaluationStatusText');
  evaluationEl.textContent = evaluationText;
  evaluationEl.classList.remove('evaluation-rating', 'evaluation-very-good', 'evaluation-good', 'evaluation-bad', 'evaluation-neutral');
  evaluationEl.classList.add('evaluation-rating');

  if (evaluationText === 'Very Good') {
    evaluationEl.classList.add('evaluation-very-good');
  } else if (evaluationText === 'Good') {
    evaluationEl.classList.add('evaluation-good');
  } else if (evaluationText === 'Bad') {
    evaluationEl.classList.add('evaluation-bad');
  } else {
    evaluationEl.classList.add('evaluation-neutral');
  }

  document.getElementById('evaluationDateText').textContent = 'Based on your latest admin review';
  document.getElementById('leavePendingCount').textContent = String(pendingLeaves);
  document.getElementById('leaveApprovedCount').textContent = String(approvedLeaves);
  document.getElementById('leaveRejectedCount').textContent = String(rejectedLeaves);
}

// ============ Gender-based Leave Type Filtering ============

function getGenderAppropriateLeaveTypes() {
  const genderLeaveMap = {
    Male: [
      'Vacation Leave',
      'Sick Leave',
      'Paternity Leave',
      'Mandatory/Force Leave',
      'Special Privilege Leave',
      'Solo Parent Leave',
      '10-Day VAWC Leave',
      'Special Emergency (Calamity) Leave'
    ],
    Female: [
      'Vacation Leave',
      'Sick Leave',
      'Maternity Leave',
      'Mandatory/Force Leave',
      'Special Privilege Leave',
      'Solo Parent Leave',
      '10-Day VAWC Leave',
      'Special Emergency (Calamity) Leave'
    ],
    Other: [
      'Vacation Leave',
      'Sick Leave',
      'Mandatory/Force Leave',
      'Special Privilege Leave',
      'Solo Parent Leave',
      'Special Emergency (Calamity) Leave'
    ]
  };

  return genderLeaveMap[currentUser.gender] || genderLeaveMap.Other;
}

function renderLeaveBalance(leaveQuota, requestedByType) {
  const container = document.getElementById('leaveBalanceContainer');
  container.innerHTML = '';

  const allLeaveTypeConfig = [
    { name: 'Vacation Leave', color: 'vacation' },
    { name: 'Sick Leave', color: 'sick' },
    { name: 'Maternity Leave', color: 'maternity' },
    { name: 'Paternity Leave', color: 'paternity' },
    { name: 'Mandatory/Force Leave', color: 'mandatory' },
    { name: 'Special Privilege Leave', color: 'special' },
    { name: 'Solo Parent Leave', color: 'soloparent' },
    { name: '10-Day VAWC Leave', color: 'vawc' },
    { name: 'Special Emergency (Calamity) Leave', color: 'calamity' }
  ];

  const genderAppropriateLeaves = getGenderAppropriateLeaveTypes();

  allLeaveTypeConfig.forEach(config => {
    const leaveType = config.name;
    
    // Only show leave types that are appropriate for the user's gender
    if (!genderAppropriateLeaves.includes(leaveType)) {
      return;
    }

    const quota = leaveQuota[leaveType];
    const requested = requestedByType[leaveType] || 0;
    const balance = Math.max(0, quota - requested);
    const usedPercent = Math.round((requested / quota) * 100);
    
    // Only show leave types that have a quota
    if (quota > 0) {
      const item = document.createElement('div');
      item.className = `attendance-tracker leave-balance-${config.color}`;
      item.innerHTML = `
        <p>${leaveType}</p>
        <h4>${balance}</h4>
        <div class="leave-progress-track" style="margin-top: 8px; background: rgba(0,0,0,0.1);">
          <span class="leave-progress-fill" style="width: ${usedPercent}%; opacity: 0.6;"></span>
        </div>
        <small style="display: block; margin-top: 4px; font-size: 0.75rem; opacity: 0.8;">${requested}/${quota} used</small>
      `;
      container.appendChild(item);
    }
  });

  // If no leave types with quota, show message
  if (container.children.length === 0) {
    container.innerHTML = '<p style="color: #999;">No leave balance information available.</p>';
  }
}

// ============ Employee Notification System ============

function showLeaveNotification(message, type = 'info', duration = 3000) {
  let container = document.getElementById('employeeNotificationContainer');
  if (!container) return;

  const notif = document.createElement('div');
  notif.className = `notification notification-${type}`;
  notif.style.cssText = `
    background: ${getLeaveNotificationColor(type)};
    color: white;
    padding: 14px 18px;
    border-radius: 8px;
    margin-bottom: 10px;
    animation: slideInNotif 0.3s ease;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    word-wrap: break-word;
    max-width: 100%;
  `;
  notif.textContent = message;
  container.appendChild(notif);

  setTimeout(() => {
    notif.style.animation = 'slideOutNotif 0.3s ease';
    setTimeout(() => notif.remove(), 300);
  }, duration);
}

function getLeaveNotificationColor(type) {
  switch(type) {
    case 'success': return '#15803d';
    case 'error': return '#dc2626';
    case 'info': return '#0f766e';
    default: return '#6b7280';
  }
}

// Add animation styles if not already added
if (!document.querySelector('style[data-notif-animations]')) {
  const style = document.createElement('style');
  style.setAttribute('data-notif-animations', 'true');
  style.textContent = `
    @keyframes slideInNotif {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    @keyframes slideOutNotif {
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
}

