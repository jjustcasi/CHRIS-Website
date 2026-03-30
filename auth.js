function getUsers() {
  return JSON.parse(localStorage.getItem('chris_users') || '[]');
}

function saveUsers(users) {
  localStorage.setItem('chris_users', JSON.stringify(users));
}

function setSession(email) {
  localStorage.setItem('chris_session', email);
}

function getSession() {
  return localStorage.getItem('chris_session');
}

function setAdminSession(active) {
  localStorage.setItem('chris_admin_session', active ? '1' : '0');
}

function hasAdminSession() {
  return localStorage.getItem('chris_admin_session') === '1';
}

function showMessage(id, text, ok) {
  const msg = document.getElementById(id);
  if (!msg) return;
  msg.textContent = text;
  msg.className = 'message';
  if (!text) return;
  msg.classList.add(ok ? 'ok' : 'err');
}

function ensureLoggedOut() {
  const sessionEmail = getSession();
  if (sessionEmail) {
    window.location.href = 'dashboard.html';
  }
}

function signup() {
  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim().toLowerCase();
  const password = document.getElementById('signupPassword').value;
  const gender = document.getElementById('signupGender').value;

  if (!name || !email || !password || !gender) {
    showMessage('authMessage', 'Please complete all sign up fields.', false);
    return;
  }

  if (password.length < 6) {
    showMessage('authMessage', 'Password must be at least 6 characters.', false);
    return;
  }

  const users = getUsers();
  if (users.some(u => u.email === email)) {
    showMessage('authMessage', 'Account already exists. Please login instead.', false);
    return;
  }

  users.push({ name, email, password, gender });
  saveUsers(users);
  setSession(email);
  localStorage.setItem('chris_leaves_' + email, JSON.stringify([]));
  localStorage.setItem('chris_trainings_' + email, JSON.stringify([]));
  window.location.href = 'dashboard.html';
}

function login() {
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;

  const user = getUsers().find(u => u.email === email && u.password === password);

  if (!user) {
    showMessage('authMessage', 'Invalid email or password.', false);
    return;
  }

  setAdminSession(false);
  setSession(user.email);
  window.location.href = 'dashboard.html';
}
