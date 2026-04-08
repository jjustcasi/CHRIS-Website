let currentUser = null;

function getUsers() {
  return JSON.parse(localStorage.getItem('chris_users') || '[]');
}

function saveUsers(users) {
  localStorage.setItem('chris_users', JSON.stringify(users));
}

function getSession() {
  return localStorage.getItem('chris_session');
}

function clearSession() {
  localStorage.removeItem('chris_session');
}

function showMessage(text, ok) {
  const msg = document.getElementById('settingsMessage');
  msg.textContent = text;
  msg.className = 'message';
  if (!text) return;
  msg.classList.add(ok ? 'ok' : 'err');
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

  currentUser = user;
  return true;
}

function initializeSettings() {
  if (!requireLogin()) return;

  document.getElementById('fullName').value = currentUser.name || '';
  document.getElementById('email').value = currentUser.email || '';
  document.getElementById('department').value = currentUser.department || '';
  document.getElementById('position').value = currentUser.position || 'CHR Employee';
  document.getElementById('phone').value = currentUser.phone || '';
}

function saveSettings() {
  if (!requireLogin()) return;

  const fullName = document.getElementById('fullName').value.trim();
  const department = document.getElementById('department').value.trim();
  const position = document.getElementById('position').value.trim();
  const phone = document.getElementById('phone').value.trim();

  if (!fullName) {
    showMessage('Full name is required.', false);
    return;
  }

  const users = getUsers();
  const idx = users.findIndex(u => u.email === currentUser.email);
  if (idx === -1) {
    showMessage('Unable to find user account.', false);
    return;
  }

  users[idx] = {
    ...users[idx],
    name: fullName,
    department,
    position: position || 'CHR Employee',
    phone
  };

  saveUsers(users);
  currentUser = users[idx];
  showMessage('Profile updated successfully.', true);
}

function logout() {
  clearSession();
  window.location.href = 'login.html';
}
