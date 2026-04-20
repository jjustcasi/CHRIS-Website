let currentUser = null;
let selectedProfileImage = '';

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
  localStorage.removeItem('chris_user_role');
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

function showMessage(text, ok) {
  const msg = document.getElementById('settingsMessage');
  msg.textContent = text;
  msg.className = 'message';
  if (!text) return;
  msg.classList.add(ok ? 'ok' : 'err');
}

function renderProfilePreview(imageData) {
  const preview = document.getElementById('profileImagePreview');
  if (!preview) return;

  if (imageData) {
    preview.innerHTML = '<img src="' + imageData + '" alt="Profile" class="profile-pic">';
  } else {
    const name = String(document.getElementById('fullName')?.value || currentUser?.name || 'U');
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const initials = parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : (parts[0] || 'U').slice(0, 2).toUpperCase();
    preview.innerHTML = '<span class="profile-avatar">' + initials + '</span>';
  }
}

function upsertLocalUserProfile(profile) {
  if (!profile || !profile.email) return;

  const users = getUsers();
  const email = String(profile.email || '').toLowerCase();
  const idx = users.findIndex(u => String(u.email || '').toLowerCase() === email);
  if (idx === -1) return;

  users[idx] = {
    ...users[idx],
    name: profile.name !== undefined ? profile.name : users[idx].name,
    department: profile.department !== undefined ? profile.department : users[idx].department,
    position: profile.position !== undefined ? profile.position : users[idx].position,
    phone: profile.phone !== undefined ? profile.phone : users[idx].phone,
    gender: profile.gender !== undefined ? profile.gender : users[idx].gender,
    profileImage: profile.profileImage !== undefined ? profile.profileImage : users[idx].profileImage,
  };

  saveUsers(users);
}

function bindImageInput() {
  const input = document.getElementById('profileImage');
  if (!input) return;

  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) {
      selectedProfileImage = currentUser?.profileImage || '';
      renderProfilePreview(selectedProfileImage);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      selectedProfileImage = String(reader.result || '');
      renderProfilePreview(selectedProfileImage);
    };
    reader.readAsDataURL(file);
  });
}

async function requireLogin() {
  const sessionEmail = String(getSession() || '').trim().toLowerCase();
  if (!sessionEmail) {
    window.location.href = 'login.html';
    return false;
  }

  try {
    const data = await apiGet('/api/users/profile?email=' + encodeURIComponent(sessionEmail));
    currentUser = data.profile;
    upsertLocalUserProfile(currentUser);
    return true;
  } catch (err) {
    const localUser = getUsers().find(u => String(u.email || '').toLowerCase() === sessionEmail);
    if (!localUser) {
      clearSession();
      window.location.href = 'login.html';
      return false;
    }

    currentUser = {
      email: sessionEmail,
      name: localUser.name || sessionEmail,
      department: localUser.department || '',
      position: localUser.position || 'CHR Employee',
      phone: localUser.phone || '',
      profileImage: localUser.profileImage || '',
      gender: localUser.gender || '',
    };

    return true;
  }
}

async function initializeSettings() {
  const loggedIn = await requireLogin();
  if (!loggedIn) return;

  document.getElementById('fullName').value = currentUser.name || '';
  document.getElementById('email').value = currentUser.email || '';
  document.getElementById('department').value = currentUser.department || '';
  document.getElementById('position').value = currentUser.position || 'CHR Employee';
  document.getElementById('phone').value = currentUser.phone || '';
  selectedProfileImage = currentUser.profileImage || '';
  renderProfilePreview(selectedProfileImage);
  bindImageInput();
}

async function saveSettings() {
  if (!currentUser) return;

  const fullName = document.getElementById('fullName').value.trim();
  const department = document.getElementById('department').value.trim();
  const position = document.getElementById('position').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  if (!fullName) {
    showMessage('Full name is required.', false);
    return;
  }

  if (newPassword || confirmPassword) {
    if (newPassword.length < 6) {
      showMessage('New password must be at least 6 characters.', false);
      return;
    }
    if (newPassword !== confirmPassword) {
      showMessage('Password confirmation does not match.', false);
      return;
    }
  }

  try {
    const data = await apiSend('/api/users/profile', 'PUT', {
      email: currentUser.email,
      name: fullName,
      department,
      position: position || 'CHR Employee',
      phone,
      profileImage: selectedProfileImage,
      newPassword: newPassword || undefined,
    });
    currentUser = data.profile || currentUser;
    upsertLocalUserProfile(currentUser);

    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
    showMessage('Profile updated successfully.', true);
  } catch (err) {
    currentUser = {
      ...currentUser,
      name: fullName,
      department,
      position: position || 'CHR Employee',
      phone,
      profileImage: selectedProfileImage,
    };
    upsertLocalUserProfile(currentUser);
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
    showMessage('Profile saved locally. Backend sync is currently unavailable.', true);
  }
}

function logout() {
  clearSession();
  window.location.href = 'index.html';
}
