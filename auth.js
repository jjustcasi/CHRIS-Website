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

  const nameParts = [firstName, middleName, surname].filter(Boolean);
  const name = nameParts.join(' ') + (suffix ? ' ' + suffix : '');

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

  const users = getUsers();
  if (users.some(u => u.email === email)) {
    showMessage('authMessage', 'Account already exists. Please login instead.', false);
    return;
  }

  users.push({
    name,
    surname,
    firstName,
    middleName,
    suffix,
    email,
    birthday,
    password,
    gender
  });
  saveUsers(users);
  sessionStorage.removeItem(SIGNUP_DRAFT_KEY);
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
