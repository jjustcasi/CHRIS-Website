require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const {
  DB_HOST = 'localhost',
  DB_PORT = '3306',
  DB_USER,
  DB_PASSWORD,
  DB_NAME,
} = process.env;

const useFileFallback = !DB_USER || !DB_PASSWORD || !DB_NAME || DB_USER === 'your_mysql_user' || DB_PASSWORD === 'your_mysql_password';

let pool = null;
if (!useFileFallback) {
  pool = mysql.createPool({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });
} else {
  console.warn('MySQL is not configured. Using local JSON fallback store for data.');
}

const STORE_DIR = path.join(__dirname, 'data');
const STORE_PATH = path.join(STORE_DIR, 'local-db.json');

function ensureStorePath() {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify({ users: [], userProfiles: [], announcements: [], leaves: [], attendance: [], trainings: [], evaluations: [], leaveComments: [], auditLogs: [] }, null, 2));
  }
}

function readStore() {
  ensureStorePath();
  try {
    const content = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(content || '{}');
    return {
      users: parsed.users || [],
      userProfiles: parsed.userProfiles || [],
      announcements: parsed.announcements || [],
      leaves: parsed.leaves || [],
      attendance: parsed.attendance || [],
      trainings: parsed.trainings || [],
      evaluations: parsed.evaluations || [],
      leaveComments: parsed.leaveComments || [],
      auditLogs: parsed.auditLogs || [],
    };
  } catch (err) {
    fs.writeFileSync(STORE_PATH, JSON.stringify({ users: [], userProfiles: [], announcements: [], leaves: [], attendance: [], trainings: [], evaluations: [], leaveComments: [], auditLogs: [] }, null, 2));
    return { users: [], userProfiles: [], announcements: [], leaves: [], attendance: [], trainings: [], evaluations: [], leaveComments: [], auditLogs: [] };
  }
}

function writeStore(store) {
  ensureStorePath();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

async function getUsers() {
  if (useFileFallback) {
    const store = readStore();
    const profilesByEmail = {};
    (store.userProfiles || []).forEach(p => {
      profilesByEmail[p.email] = p;
    });

    return (store.users || []).map(u => ({
      ...u,
      department: profilesByEmail[u.email]?.department || '',
      position: profilesByEmail[u.email]?.position || '',
      phone: profilesByEmail[u.email]?.phone || '',
      profileImage: profilesByEmail[u.email]?.profileImage || '',
    }));
  }

  const [rows] = await pool.execute('SELECT * FROM users');
  return rows;
}

async function getUserByEmail(email) {
  if (!email) return null;
  const normalizedEmail = email.toLowerCase();

  if (useFileFallback) {
    const store = readStore();
    const user = (store.users || []).find(u => u.email === normalizedEmail) || null;
    if (!user) return null;
    const profile = (store.userProfiles || []).find(p => p.email === normalizedEmail) || {};
    return {
      ...user,
      department: profile.department || '',
      position: profile.position || '',
      phone: profile.phone || '',
      profileImage: profile.profileImage || '',
    };
  }

  const [rows] = await pool.execute('SELECT * FROM users WHERE email = ? LIMIT 1', [normalizedEmail]);
  return rows[0] || null;
}

async function getUserById(id) {
  if (!id) return null;

  if (useFileFallback) {
    const store = readStore();
    return (store.users || []).find(u => u.id === id) || null;
  }

  const [rows] = await pool.execute('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function updateUserRole(id, role) {
  if (!id || !role) return null;

  if (useFileFallback) {
    const store = readStore();
    const user = (store.users || []).find(u => u.id === id);
    if (!user) return null;
    user.role = role;
    writeStore(store);
    return user;
  }

  await pool.execute('UPDATE users SET role = ? WHERE id = ?', [role, id]);
  return getUserById(id);
}

async function createUser(user) {
  const {
    name,
    surname,
    firstName,
    middleName,
    suffix,
    email,
    birthday,
    password,
    gender,
    role,
    google,
  } = user;

  if (useFileFallback) {
    const store = readStore();
    const users = store.users || [];
    const nextId = users.length ? Math.max(...users.map(u => u.id || 0)) + 1 : 1;
    const newUser = {
      id: nextId,
      name,
      surname,
      firstName,
      middleName,
      suffix,
      email: email.toLowerCase(),
      birthday,
      password,
      gender,
      role: role || 'employee',
      google: google ? true : false,
    };
    users.push(newUser);
    store.users = users;
    writeStore(store);
    return newUser;
  }

  const [result] = await pool.execute(
    `INSERT INTO users
      (name, surname, firstName, middleName, suffix, email, birthday, password, gender, role, google)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name,
      surname,
      firstName,
      middleName,
      suffix,
      email.toLowerCase(),
      birthday || null,
      password,
      gender,
      role,
      google ? 1 : 0,
    ]
  );

  return {
    id: result.insertId,
    name,
    surname,
    firstName,
    middleName,
    suffix,
    email: email.toLowerCase(),
    birthday,
    password,
    gender,
    google,
  };
}

async function getAnnouncements() {
  if (useFileFallback) {
    const store = readStore();
    return (store.announcements || []).slice().sort((a, b) => (String(b.date || '')).localeCompare(String(a.date || '')));
  }

  const [rows] = await pool.execute('SELECT id, title, description, image, visible, date, createdByEmail, createdAt FROM announcements ORDER BY createdAt DESC');
  return rows;
}

async function createAnnouncement(item) {
  if (useFileFallback) {
    const store = readStore();
    const announcement = {
      id: Number(item.id),
      title: item.title,
      description: item.description,
      image: item.image || '',
      visible: item.visible !== false,
      date: item.date,
      createdByEmail: item.createdByEmail || '',
      createdAt: new Date().toISOString(),
    };
    store.announcements.unshift(announcement);
    writeStore(store);
    return announcement;
  }

  await pool.execute(
    'INSERT INTO announcements (id, title, description, image, visible, date, createdByEmail) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [Number(item.id), item.title, item.description, item.image || '', item.visible === false ? 0 : 1, item.date, item.createdByEmail || null]
  );
  return item;
}

async function updateAnnouncementVisibility(id, visible) {
  if (useFileFallback) {
    const store = readStore();
    const item = (store.announcements || []).find(a => Number(a.id) === Number(id));
    if (!item) return null;
    item.visible = !!visible;
    writeStore(store);
    return item;
  }

  await pool.execute('UPDATE announcements SET visible = ? WHERE id = ?', [visible ? 1 : 0, Number(id)]);
  const [rows] = await pool.execute('SELECT id, title, description, image, visible, date, createdByEmail, createdAt FROM announcements WHERE id = ? LIMIT 1', [Number(id)]);
  return rows[0] || null;
}

async function deleteAnnouncement(id) {
  if (useFileFallback) {
    const store = readStore();
    store.announcements = (store.announcements || []).filter(a => Number(a.id) !== Number(id));
    writeStore(store);
    return true;
  }

  await pool.execute('DELETE FROM announcements WHERE id = ?', [Number(id)]);
  return true;
}

async function getLeaves(email) {
  if (useFileFallback) {
    const store = readStore();
    const items = store.leaves || [];
    const filtered = email ? items.filter(l => l.employeeEmail === email.toLowerCase()) : items;
    return filtered.slice().sort((a, b) => new Date(b.startDate || b.start) - new Date(a.startDate || a.start));
  }

  if (email) {
    const [rows] = await pool.execute('SELECT * FROM leaves WHERE employeeEmail = ? ORDER BY startDate DESC', [email.toLowerCase()]);
    return rows;
  }

  const [rows] = await pool.execute('SELECT * FROM leaves ORDER BY startDate DESC');
  return rows;
}

async function upsertLeavesForEmployee(email, leaves) {
  const normalizedEmail = (email || '').toLowerCase();

  if (useFileFallback) {
    const store = readStore();
    store.leaves = (store.leaves || []).filter(l => l.employeeEmail !== normalizedEmail);
    const prepared = (leaves || []).map(l => ({
      id: Number(l.id),
      employeeEmail: normalizedEmail,
      type: l.type,
      startDate: l.startDate || l.start,
      endDate: l.endDate || l.end,
      days: Number(l.days || 0),
      status: l.status || 'Pending',
      medicalCertificate: l.medicalCertificate ? JSON.stringify(l.medicalCertificate) : null,
      start: l.start || l.startDate,
      end: l.end || l.endDate,
    }));
    store.leaves.push(...prepared);
    writeStore(store);
    return prepared;
  }

  await pool.execute('DELETE FROM leaves WHERE employeeEmail = ?', [normalizedEmail]);
  for (const l of leaves || []) {
    await pool.execute(
      'INSERT INTO leaves (id, employeeEmail, type, startDate, endDate, days, status, medicalCertificate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        Number(l.id),
        normalizedEmail,
        l.type,
        l.startDate || l.start,
        l.endDate || l.end,
        Number(l.days || 0),
        l.status || 'Pending',
        l.medicalCertificate ? JSON.stringify(l.medicalCertificate) : null,
      ]
    );
  }
  return getLeaves(normalizedEmail);
}

async function updateLeaveStatus(id, status) {
  if (useFileFallback) {
    const store = readStore();
    const found = (store.leaves || []).find(l => Number(l.id) === Number(id));
    if (!found) return null;
    found.status = status;
    writeStore(store);
    return found;
  }

  await pool.execute('UPDATE leaves SET status = ? WHERE id = ?', [status, Number(id)]);
  const [rows] = await pool.execute('SELECT * FROM leaves WHERE id = ? LIMIT 1', [Number(id)]);
  return rows[0] || null;
}

async function getAttendance(email) {
  const normalizedEmail = (email || '').toLowerCase();
  if (useFileFallback) {
    const store = readStore();
    return (store.attendance || []).filter(a => a.employeeEmail === normalizedEmail).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  const [rows] = await pool.execute('SELECT * FROM attendance WHERE employeeEmail = ? ORDER BY date DESC', [normalizedEmail]);
  return rows;
}

async function upsertAttendanceForEmployee(email, attendance) {
  const normalizedEmail = (email || '').toLowerCase();
  if (useFileFallback) {
    const store = readStore();
    store.attendance = (store.attendance || []).filter(a => a.employeeEmail !== normalizedEmail);
    const prepared = (attendance || []).map(a => ({ id: Number(a.id), employeeEmail: normalizedEmail, date: a.date, status: a.status }));
    store.attendance.push(...prepared);
    writeStore(store);
    return prepared;
  }

  await pool.execute('DELETE FROM attendance WHERE employeeEmail = ?', [normalizedEmail]);
  for (const a of attendance || []) {
    await pool.execute('INSERT INTO attendance (id, employeeEmail, date, status) VALUES (?, ?, ?, ?)', [Number(a.id), normalizedEmail, a.date, a.status]);
  }
  return getAttendance(normalizedEmail);
}

async function getTrainings(email) {
  const normalizedEmail = (email || '').toLowerCase();
  if (useFileFallback) {
    const store = readStore();
    return (store.trainings || []).filter(t => t.employeeEmail === normalizedEmail).slice().sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')));
  }

  const [rows] = await pool.execute('SELECT * FROM trainings WHERE employeeEmail = ? ORDER BY startDate DESC', [normalizedEmail]);
  return rows;
}

async function upsertTrainingsForEmployee(email, trainings) {
  const normalizedEmail = (email || '').toLowerCase();
  if (useFileFallback) {
    const store = readStore();
    store.trainings = (store.trainings || []).filter(t => t.employeeEmail !== normalizedEmail);
    const prepared = (trainings || []).map(t => ({
      id: Number(t.id),
      employeeEmail: normalizedEmail,
      title: t.title,
      startDate: t.startDate || t.start || null,
      endDate: t.endDate || t.end || null,
      hours: t.hours || null,
      type: t.type || null,
      sponsor: t.sponsor || null,
      status: t.status || null,
      start: t.start || t.startDate || null,
      end: t.end || t.endDate || null,
    }));
    store.trainings.push(...prepared);
    writeStore(store);
    return prepared;
  }

  await pool.execute('DELETE FROM trainings WHERE employeeEmail = ?', [normalizedEmail]);
  for (const t of trainings || []) {
    await pool.execute(
      'INSERT INTO trainings (id, employeeEmail, title, startDate, endDate, hours, type, sponsor, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [Number(t.id), normalizedEmail, t.title, t.startDate || t.start || null, t.endDate || t.end || null, t.hours || null, t.type || null, t.sponsor || null, t.status || null]
    );
  }
  return getTrainings(normalizedEmail);
}

async function getEvaluation(email) {
  const normalizedEmail = (email || '').toLowerCase();
  if (useFileFallback) {
    const store = readStore();
    return (store.evaluations || []).find(e => e.employeeEmail === normalizedEmail) || { employeeEmail: normalizedEmail, status: '' };
  }

  const [rows] = await pool.execute('SELECT * FROM evaluations WHERE employeeEmail = ? LIMIT 1', [normalizedEmail]);
  return rows[0] || { employeeEmail: normalizedEmail, status: '' };
}

async function upsertEvaluation(email, status) {
  const normalizedEmail = (email || '').toLowerCase();
  if (useFileFallback) {
    const store = readStore();
    const evaluations = store.evaluations || [];
    const existing = evaluations.find(e => e.employeeEmail === normalizedEmail);
    if (existing) {
      existing.status = status || '';
      existing.updatedAt = new Date().toISOString();
    } else {
      evaluations.push({ employeeEmail: normalizedEmail, status: status || '', updatedAt: new Date().toISOString() });
    }
    store.evaluations = evaluations;
    writeStore(store);
    return getEvaluation(normalizedEmail);
  }

  await pool.execute(
    'INSERT INTO evaluations (employeeEmail, status) VALUES (?, ?) ON DUPLICATE KEY UPDATE status = VALUES(status)',
    [normalizedEmail, status || '']
  );
  return getEvaluation(normalizedEmail);
}

async function getLeaveComments(employeeEmail, leaveId) {
  const normalizedEmail = (employeeEmail || '').toLowerCase();
  const normalizedLeaveId = Number(leaveId);

  if (useFileFallback) {
    const store = readStore();
    return (store.leaveComments || [])
      .filter(c => c.employeeEmail === normalizedEmail && Number(c.leaveId) === normalizedLeaveId)
      .slice()
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  }

  const [rows] = await pool.execute(
    'SELECT id, leaveId, employeeEmail, text, date, createdByEmail, createdByRole, createdAt FROM leave_comments WHERE employeeEmail = ? AND leaveId = ? ORDER BY createdAt ASC',
    [normalizedEmail, normalizedLeaveId]
  );
  return rows;
}

async function createLeaveComment(item) {
  const payload = {
    id: Number(item.id),
    leaveId: Number(item.leaveId),
    employeeEmail: String(item.employeeEmail || '').toLowerCase(),
    text: item.text || '',
    date: item.date || new Date().toLocaleString(),
    createdByEmail: item.createdByEmail || '',
    createdByRole: item.createdByRole || '',
    createdAt: new Date().toISOString(),
  };

  if (useFileFallback) {
    const store = readStore();
    store.leaveComments.push(payload);
    writeStore(store);
    return payload;
  }

  await pool.execute(
    'INSERT INTO leave_comments (id, leaveId, employeeEmail, text, date, createdByEmail, createdByRole) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [payload.id, payload.leaveId, payload.employeeEmail, payload.text, payload.date, payload.createdByEmail || null, payload.createdByRole || null]
  );
  return payload;
}

async function deleteLeaveComment(id) {
  const normalizedId = Number(id);
  if (useFileFallback) {
    const store = readStore();
    store.leaveComments = (store.leaveComments || []).filter(c => Number(c.id) !== normalizedId);
    writeStore(store);
    return true;
  }

  await pool.execute('DELETE FROM leave_comments WHERE id = ?', [normalizedId]);
  return true;
}

async function getUserProfile(email) {
  const normalizedEmail = (email || '').toLowerCase();
  if (!normalizedEmail) return null;

  if (useFileFallback) {
    const store = readStore();
    const user = (store.users || []).find(u => u.email === normalizedEmail);
    if (!user) return null;
    const profile = (store.userProfiles || []).find(p => p.email === normalizedEmail) || {};
    return {
      email: normalizedEmail,
      name: user.name || '',
      department: profile.department || '',
      position: profile.position || '',
      phone: profile.phone || '',
      profileImage: profile.profileImage || '',
      gender: user.gender || '',
    };
  }

  const user = await getUserByEmail(normalizedEmail);
  if (!user) return null;
  const [rows] = await pool.execute('SELECT email, department, position, phone, profileImage FROM user_profiles WHERE email = ? LIMIT 1', [normalizedEmail]);
  const profile = rows[0] || {};
  return {
    email: normalizedEmail,
    name: user.name || '',
    department: profile.department || '',
    position: profile.position || '',
    phone: profile.phone || '',
    profileImage: profile.profileImage || '',
    gender: user.gender || '',
  };
}

async function upsertUserProfile(email, profile) {
  const normalizedEmail = (email || '').toLowerCase();
  if (!normalizedEmail) return null;

  if (useFileFallback) {
    const store = readStore();
    const users = store.users || [];
    const user = users.find(u => u.email === normalizedEmail);
    if (!user) return null;

    if (profile.name !== undefined) user.name = profile.name;
    if (profile.gender !== undefined) user.gender = profile.gender;

    const profiles = store.userProfiles || [];
    let existing = profiles.find(p => p.email === normalizedEmail);
    if (!existing) {
      existing = { email: normalizedEmail, department: '', position: '', phone: '', profileImage: '' };
      profiles.push(existing);
    }

    if (profile.department !== undefined) existing.department = profile.department;
    if (profile.position !== undefined) existing.position = profile.position;
    if (profile.phone !== undefined) existing.phone = profile.phone;
    if (profile.profileImage !== undefined) existing.profileImage = profile.profileImage;

    store.users = users;
    store.userProfiles = profiles;
    writeStore(store);
    return getUserProfile(normalizedEmail);
  }

  if (profile.name !== undefined || profile.gender !== undefined) {
    await pool.execute('UPDATE users SET name = COALESCE(?, name), gender = COALESCE(?, gender) WHERE email = ?', [profile.name ?? null, profile.gender ?? null, normalizedEmail]);
  }

  await pool.execute(
    'INSERT INTO user_profiles (email, department, position, phone, profileImage) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE department = VALUES(department), position = VALUES(position), phone = VALUES(phone), profileImage = VALUES(profileImage)',
    [normalizedEmail, profile.department || '', profile.position || '', profile.phone || '', profile.profileImage || '']
  );

  return getUserProfile(normalizedEmail);
}

async function updateUserPassword(email, hashedPassword) {
  const normalizedEmail = (email || '').toLowerCase();
  if (!normalizedEmail || !hashedPassword) return false;

  if (useFileFallback) {
    const store = readStore();
    const user = (store.users || []).find(u => u.email === normalizedEmail);
    if (!user) return false;
    user.password = hashedPassword;
    writeStore(store);
    return true;
  }

  await pool.execute('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, normalizedEmail]);
  return true;
}

async function getAuditLogs(limit = 100) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);

  if (useFileFallback) {
    const store = readStore();
    return (store.auditLogs || [])
      .slice()
      .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')))
      .slice(0, safeLimit);
  }

  try {
    const [rows] = await pool.execute(
      'SELECT id, adminEmail, action, target, details, timestamp FROM audit_logs ORDER BY timestamp DESC LIMIT ?',
      [safeLimit]
    );
    return rows;
  } catch (error) {
    return [];
  }
}

async function createAuditLog(entry) {
  const payload = {
    id: Number(entry.id) || Date.now(),
    adminEmail: String(entry.adminEmail || '').toLowerCase(),
    action: String(entry.action || '').trim(),
    target: String(entry.target || '').trim(),
    details: String(entry.details || '').trim(),
    timestamp: entry.timestamp || new Date().toISOString(),
  };

  if (useFileFallback) {
    const store = readStore();
    store.auditLogs = store.auditLogs || [];
    store.auditLogs.unshift(payload);
    writeStore(store);
    return payload;
  }

  try {
    await pool.execute(
      'INSERT INTO audit_logs (id, adminEmail, action, target, details, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
      [payload.id, payload.adminEmail, payload.action, payload.target, payload.details, payload.timestamp]
    );
  } catch (error) {
    return payload;
  }
  return payload;
}

module.exports = {
  getUsers,
  getUserByEmail,
  getUserById,
  updateUserRole,
  createUser,
  getAnnouncements,
  createAnnouncement,
  updateAnnouncementVisibility,
  deleteAnnouncement,
  getLeaves,
  upsertLeavesForEmployee,
  updateLeaveStatus,
  getAttendance,
  upsertAttendanceForEmployee,
  getTrainings,
  upsertTrainingsForEmployee,
  getEvaluation,
  upsertEvaluation,
  getLeaveComments,
  createLeaveComment,
  deleteLeaveComment,
  getUserProfile,
  upsertUserProfile,
  updateUserPassword,
  getAuditLogs,
  createAuditLog,
};
