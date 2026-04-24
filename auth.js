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

function setUserRole(role) {
  localStorage.setItem('chris_user_role', role);
}

function getUserRole() {
  return localStorage.getItem('chris_user_role') || '';
}

function clearUserRole() {
  localStorage.removeItem('chris_user_role');
}

function clearSession() {
  localStorage.removeItem('chris_session');
  clearUserRole();
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
  const role = getUserRole();
  if (sessionEmail) {
    if (role === 'admin') {
      window.location.href = 'admin.html';
    } else {
      window.location.href = 'dashboard.html';
    }
  }
}

function setupSignupAutoUppercase() {
  const upperCaseFieldIds = [
    'signupSurname',
    'signupFirstName',
    'signupMiddleName',
    'signupSuffix'
  ];

  upperCaseFieldIds.forEach((id) => {
    const field = document.getElementById(id);
    if (!field) return;

    field.addEventListener('input', () => {
      field.value = field.value.toUpperCase();
    });
  });
}

function setupSignupPasswordEyeButtons() {
  const fieldButtonPairs = [
    { fieldId: 'signupPassword', buttonId: 'toggleSignupPassword', showLabel: 'Show password', hideLabel: 'Hide password' },
    { fieldId: 'signupConfirmPassword', buttonId: 'toggleSignupConfirmPassword', showLabel: 'Show confirm password', hideLabel: 'Hide confirm password' }
  ];

  fieldButtonPairs.forEach(({ fieldId, buttonId, showLabel, hideLabel }) => {
    const field = document.getElementById(fieldId);
    const button = document.getElementById(buttonId);
    if (!field || !button) return;

    button.addEventListener('click', () => {
      const shouldShow = field.type === 'password';
      field.type = shouldShow ? 'text' : 'password';
      const nextLabel = shouldShow ? hideLabel : showLabel;
      button.setAttribute('aria-label', nextLabel);
      button.title = nextLabel;
      button.classList.toggle('is-active', shouldShow);
    });
  });
}

const SIGNUP_DRAFT_KEY = 'chris_signup_draft';

function cameFromPolicyPage() {
  const referrer = document.referrer || '';
  if (!referrer) return false;

  return /\/(terms|privacy|cookies)\.html$/i.test(referrer);
}

function getSignupDraftFieldIds() {
  return [
    'signupSurname',
    'signupFirstName',
    'signupMiddleName',
    'signupSuffix',
    'signupEmail',
    'signupBirthday',
    'signupPassword',
    'signupConfirmPassword',
    'signupGender'
  ];
}

function setupSignupDraftPersistence() {
  const fieldIds = getSignupDraftFieldIds();
  const availableFields = fieldIds
    .map((id) => document.getElementById(id))
    .filter(Boolean);

  if (!availableFields.length) return;

  // Keep draft only when user returns from policy pages.
  if (!cameFromPolicyPage()) {
    sessionStorage.removeItem(SIGNUP_DRAFT_KEY);
  }

  const savedDraftRaw = sessionStorage.getItem(SIGNUP_DRAFT_KEY);
  if (savedDraftRaw) {
    try {
      const savedDraft = JSON.parse(savedDraftRaw);
      fieldIds.forEach((id) => {
        const field = document.getElementById(id);
        if (!field) return;
        if (typeof savedDraft[id] === 'string') {
          field.value = savedDraft[id];
        }
      });
    } catch (_) {
      sessionStorage.removeItem(SIGNUP_DRAFT_KEY);
    }
  }

  const saveDraft = () => {
    const draft = {};
    fieldIds.forEach((id) => {
      const field = document.getElementById(id);
      if (!field) return;
      draft[id] = field.value;
    });
    sessionStorage.setItem(SIGNUP_DRAFT_KEY, JSON.stringify(draft));
  };

  availableFields.forEach((field) => {
    field.addEventListener('input', saveDraft);
    field.addEventListener('change', saveDraft);
  });
}

function setupLoginPasswordEyeButton() {
  const field = document.getElementById('loginPassword');
  const button = document.getElementById('toggleLoginPassword');
  if (!field || !button) return;

  button.addEventListener('click', () => {
    const shouldShow = field.type === 'password';
    field.type = shouldShow ? 'text' : 'password';
    const nextLabel = shouldShow ? 'Hide password' : 'Show password';
    button.setAttribute('aria-label', nextLabel);
    button.title = nextLabel;
    button.classList.toggle('is-active', shouldShow);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupSignupAutoUppercase();
  setupSignupPasswordEyeButtons();
  setupSignupDraftPersistence();
  setupLoginPasswordEyeButton();
});

function ensureLocalUserRecord(user) {
  if (!user || !user.email) return;
  const email = user.email.toLowerCase();
  const users = getUsers();
  const storedUser = users.find((u) => u.email === email);
  if (!storedUser) {
    users.push({
      name: user.name || email,
      surname: user.surname || '',
      firstName: user.firstName || '',
      middleName: user.middleName || '',
      suffix: user.suffix || '',
      email,
      birthday: user.birthday || '',
      password: user.password || '',
      gender: user.gender || '',
      role: user.role || 'employee',
      google: user.google || false,
    });
    saveUsers(users);
  } else if (user.role && storedUser.role !== user.role) {
    storedUser.role = user.role;
    saveUsers(users);
  }

  const leavesKey = 'chris_leaves_' + email;
  const trainingsKey = 'chris_trainings_' + email;
  if (!localStorage.getItem(leavesKey)) {
    localStorage.setItem(leavesKey, JSON.stringify([]));
  }
  if (!localStorage.getItem(trainingsKey)) {
    localStorage.setItem(trainingsKey, JSON.stringify([]));
  }
}

function createLocalUser(user) {
  const users = getUsers();
  if (users.some((u) => u.email === user.email.toLowerCase())) {
    return false;
  }

  const newUser = {
    name: user.name || user.email,
    surname: user.surname || '',
    firstName: user.firstName || '',
    middleName: user.middleName || '',
    suffix: user.suffix || '',
    email: user.email.toLowerCase(),
    birthday: user.birthday || '',
    password: user.password || '',
    gender: user.gender || '',
    role: user.role || 'employee',
    google: user.google || false,
  };

  users.push(newUser);
  saveUsers(users);
  ensureLocalUserRecord(newUser);
  return true;
}

function signup() {
  const surname = document.getElementById('signupSurname').value.trim().toUpperCase();
  const firstName = document.getElementById('signupFirstName').value.trim().toUpperCase();
  const middleName = document.getElementById('signupMiddleName').value.trim().toUpperCase();
  const suffix = document.getElementById('signupSuffix').value.trim().toUpperCase();
  const email = document.getElementById('signupEmail').value.trim().toLowerCase();
  const birthday = document.getElementById('signupBirthday').value;
  const password = document.getElementById('signupPassword').value;
  const confirmPassword = document.getElementById('signupConfirmPassword').value;
  const gender = document.getElementById('signupGender').value;

  if (!surname || !firstName || !middleName || !suffix || !email || !birthday || !password || !confirmPassword || !gender) {
    showMessage('authMessage', 'Please complete all sign up fields.', false);
    return;
  }

  if (password !== confirmPassword) {
    showMessage('authMessage', 'Password and confirm password do not match.', false);
    return;
  }

  if (password.length < 6) {
    showMessage('authMessage', 'Password must be at least 6 characters.', false);
    return;
  }

  if (!document.getElementById('agreeTerms').checked) {
    showMessage('authMessage', 'You must agree to the Terms and Conditions and Privacy Policy.', false);
    return;
  }

  const localUserPayload = {
    email,
    name: `${firstName} ${middleName} ${surname}`.trim(),
    surname,
    firstName,
    middleName,
    suffix,
    birthday,
    password,
    gender,
    role: 'employee',
    google: false,
  };

  fetch('/api/auth/signup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      surname,
      firstName,
      middleName,
      suffix,
      email,
      birthday,
      password,
      gender
    })
  })
    .then((res) => res.json())
    .then((data) => {
      if (!data.success) {
        showMessage('authMessage', data.message || 'Failed to create account.', false);
        return;
      }

      createLocalUser(localUserPayload);
      setUserRole('employee');
      sessionStorage.removeItem(SIGNUP_DRAFT_KEY);
      setSession(email);
      window.location.href = 'dashboard.html';
    })
    .catch(() => {
      if (!createLocalUser(localUserPayload)) {
        showMessage('authMessage', 'Account already exists locally.', false);
        return;
      }

      showMessage('authMessage', 'Backend unavailable. Account created locally.', true);
      setUserRole('employee');
      sessionStorage.removeItem(SIGNUP_DRAFT_KEY);
      setSession(email);
      window.location.href = 'dashboard.html';
    });
}

function login() {
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;

  fetch('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  })
    .then((res) => res.json())
    .then((data) => {
      if (!data.success) {
        showMessage('authMessage', data.message || 'Invalid email or password.', false);
        return;
      }

      ensureLocalUserRecord({
        email,
        name: data.user.name || email,
        role: data.user.role || 'employee',
        google: false
      });

      setUserRole(data.user.role || 'employee');
      setSession(data.user.email);
      window.location.href = data.user.role === 'admin' ? 'admin.html' : 'dashboard.html';
    })
    .catch(() => {
      const user = getUsers().find(u => u.email === email && u.password === password);
      if (!user) {
        showMessage('authMessage', 'Unable to reach the authentication server. Local login failed.', false);
        return;
      }

      ensureLocalUserRecord(user);
      setUserRole(user.role || 'employee');
      setSession(user.email);
      window.location.href = user.role === 'admin' ? 'admin.html' : 'dashboard.html';
    });
}

function handleCredentialResponse(response) {
  if (!response || !response.credential) {
    showMessage('authMessage', 'Google login failed. Please try again.', false);
    return;
  }

  fetch('/api/auth/google', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ credential: response.credential })
  })
    .then((res) => res.json())
    .then((data) => {
      if (!data.success) {
        showMessage('authMessage', data.message || 'Google authentication failed.', false);
        return;
      }

      ensureLocalUserRecord({
        email: data.user.email,
        name: data.user.name || data.user.email,
        role: data.user.role || 'employee',
        google: true,
      });
      setUserRole(data.user.role || 'employee');
      setSession(data.user.email);
      window.location.href = data.user.role === 'admin' ? 'admin.html' : 'dashboard.html';
    })
    .catch(() => {
      showMessage('authMessage', 'Unable to reach the authentication server.', false);
    });
}
