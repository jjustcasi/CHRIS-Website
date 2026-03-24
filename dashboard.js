let leaves = [];
let trainings = [];
let attendance = [];
let announcements = [];
let evaluation = { status: '' };
let currentUser = null;

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

function loadUserData() {
  leaves = JSON.parse(localStorage.getItem(userDataKey('leaves')) || '[]');
  trainings = JSON.parse(localStorage.getItem(userDataKey('trainings')) || '[]');
  attendance = JSON.parse(localStorage.getItem(userDataKey('attendance')) || '[]');
  announcements = JSON.parse(localStorage.getItem('chris_global_announcements') || '[]');
  evaluation = JSON.parse(localStorage.getItem(userDataKey('evaluation')) || '{"status":""}');
}

function saveUserData() {
  localStorage.setItem(userDataKey('leaves'), JSON.stringify(leaves));
  localStorage.setItem(userDataKey('trainings'), JSON.stringify(trainings));
  localStorage.setItem(userDataKey('attendance'), JSON.stringify(attendance));
  localStorage.setItem(userDataKey('evaluation'), JSON.stringify(evaluation));
}

function requireLogin() {
  const sessionEmail = getSession();
  if (!sessionEmail) {
    window.location.href = 'login.html';
    return false;
  }
  const user = getUsers().find(u => u.email === sessionEmail);
  if (!user) {
    clearSession();
    window.location.href = 'login.html';
    return false;
  }
  currentUser = { name: user.name, email: user.email };
  return true;
}

function initializeDashboard() {
  if (!requireLogin()) return;
  document.getElementById('userName').textContent = currentUser.name;
  loadUserData();
  seedUserSideDefaults();
  showPage('overview');
  renderLeaves();
  renderTraining();
  renderAttendance();
  renderAnnouncements();
  renderOverview();
}

function logout() {
  clearSession();
  window.location.href = 'login.html';
}

function showPage(page) {
  document.getElementById('overviewPage').classList.toggle('hidden', page !== 'overview');
  document.getElementById('leavePage').classList.toggle('hidden', page !== 'leave');
  document.getElementById('trainingPage').classList.toggle('hidden', page !== 'training');
  document.getElementById('overviewBtn').classList.toggle('active', page === 'overview');
  document.getElementById('leaveBtn').classList.toggle('active', page === 'leave');
  document.getElementById('trainingBtn').classList.toggle('active', page === 'training');
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
  const days = daysBetween(start, end);
  if (!days) return;

  leaves.unshift({
    id: Date.now(),
    type,
    start,
    end,
    days,
    status: 'Pending'
  });
  saveUserData();
  renderLeaves();
  renderOverview();
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
    const row = `
      <tr>
        <td>${l.type}</td>
        <td>${l.start}</td>
        <td>${l.end}</td>
        <td>${l.days}</td>
        <td><span class="status ${cssClass}">${l.status}</span></td>
      </tr>`;
    tbody.innerHTML += row;
  });
}

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
}

function deleteTraining(id) {
  trainings = trainings.filter(t => t.id !== id);
  saveUserData();
  renderTraining();
  renderOverview();
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
    block.innerHTML = `
      <div>
        <strong>${item.text}</strong>
        <p class="form-note">Posted: ${item.date}</p>
      </div>`;
    board.appendChild(block);
  });
}

function renderOverview() {
  const leaveQuota = {
    Sick: 10,
    Emergency: 5,
    Vacation: 15
  };

  const requestedByType = {
    Sick: 0,
    Emergency: 0,
    Vacation: 0
  };

  leaves
    .filter(l => l.status !== 'Rejected')
    .forEach(l => {
      if (Object.prototype.hasOwnProperty.call(requestedByType, l.type)) {
        requestedByType[l.type] += Number(l.days || 0);
      }
    });

  const sickBalance = Math.max(0, leaveQuota.Sick - requestedByType.Sick);
  const emergencyBalance = Math.max(0, leaveQuota.Emergency - requestedByType.Emergency);
  const vacationBalance = Math.max(0, leaveQuota.Vacation - requestedByType.Vacation);

  const sickPercent = (sickBalance / leaveQuota.Sick) * 100;
  const emergencyPercent = (emergencyBalance / leaveQuota.Emergency) * 100;
  const vacationPercent = (vacationBalance / leaveQuota.Vacation) * 100;

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

  document.getElementById('sickLeaveBalance').textContent = String(sickBalance);
  document.getElementById('emergencyLeaveBalance').textContent = String(emergencyBalance);
  document.getElementById('vacationLeaveBalance').textContent = String(vacationBalance);
  document.getElementById('sickLeaveMeta').textContent = sickBalance + ' / ' + leaveQuota.Sick + ' remaining';
  document.getElementById('emergencyLeaveMeta').textContent = emergencyBalance + ' / ' + leaveQuota.Emergency + ' remaining';
  document.getElementById('vacationLeaveMeta').textContent = vacationBalance + ' / ' + leaveQuota.Vacation + ' remaining';
  document.getElementById('sickLeaveBar').style.width = sickPercent + '%';
  document.getElementById('emergencyLeaveBar').style.width = emergencyPercent + '%';
  document.getElementById('vacationLeaveBar').style.width = vacationPercent + '%';
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
