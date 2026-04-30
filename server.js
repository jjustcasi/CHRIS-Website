require('dotenv').config();
const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const {
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
} = require('./database');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID';

const app = express();
app.use(express.json());

app.get('/config.js', (req, res) => {
  res.type('application/javascript');
  res.send(`window.APP_CONFIG = { googleClientId: '${GOOGLE_CLIENT_ID.replace(/'/g, "\\'")}' };`);
});

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
const DEFAULT_ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@chris.com';
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

async function ensureDefaultAdminAccount() {
  const existingAdmin = await getUserByEmail(DEFAULT_ADMIN_EMAIL);
  if (existingAdmin) {
    if (existingAdmin.role !== 'admin') {
      await updateUserRole(existingAdmin.id, 'admin');
      console.log(`Updated existing user ${DEFAULT_ADMIN_EMAIL} to admin role.`);
    }
    return;
  }

  const hashedPassword = bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, 10);
  await createUser({
    name: 'Admin User',
    surname: 'Admin',
    firstName: 'Admin',
    middleName: '',
    suffix: '',
    email: DEFAULT_ADMIN_EMAIL,
    birthday: '2000-01-01',
    password: hashedPassword,
    gender: 'Other',
    role: 'admin',
    google: false,
  });
  console.log(`Created default admin account: ${DEFAULT_ADMIN_EMAIL}`);
}

function validateEmail(email) {
  return typeof email === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

function validateBirthday(value) {
  if (typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

app.post('/api/auth/signup', async (req, res) => {
  const { surname, firstName, middleName, suffix, email, birthday, password, gender } = req.body;
  if (!surname || !firstName || !email || !birthday || !password || !gender) {
    return res.status(400).json({ success: false, message: 'Please complete all sign up fields.' });
  }

  if (!validateEmail(email)) {
    return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
  }

  if (!validateBirthday(birthday)) {
    return res.status(400).json({ success: false, message: 'Please enter a valid birthday in YYYY-MM-DD format.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
  }

  const normalizedEmail = email.toLowerCase();
  const existingUser = await getUserByEmail(normalizedEmail);
  if (existingUser) {
    return res.status(409).json({ success: false, message: 'Account already exists. Please login instead.' });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  const name = [firstName, middleName, surname, suffix]
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .join(' ');

  const user = await createUser({
    name: name.trim(),
    surname: surname.trim(),
    firstName: firstName.trim(),
    middleName: String(middleName || '').trim(),
    suffix: String(suffix || '').trim(),
    email: normalizedEmail,
    birthday,
    password: hashedPassword,
    gender,
    role: 'employee',
    google: false,
  });

  return res.json({ success: true, user: { email: user.email, name: user.name, role: user.role || 'employee' } });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }

  const normalizedEmail = email.toLowerCase();
  const user = await getUserByEmail(normalizedEmail);
  if (!user || !user.password || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ success: false, message: 'Invalid email or password.' });
  }

  return res.json({ success: true, user: { email: user.email, name: user.name, role: user.role || 'employee' } });
});

app.get('/api/auth/me', async (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required.' });
  }

  const user = await getUserByEmail(email);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  return res.json({ success: true, user: { email: user.email, name: user.name, role: user.role || 'employee' } });
});

async function isAdminUser(email) {
  if (!email) return false;
  const user = await getUserByEmail(email.toLowerCase());
  return !!user && user.role === 'admin';
}

async function requireAdmin(req, res) {
  const requesterEmail = String(req.body.requesterEmail || req.query.requesterEmail || '').trim().toLowerCase();
  if (!requesterEmail) {
    res.status(403).json({ success: false, message: 'Requester email is required.' });
    return null;
  }

  const isAdmin = await isAdminUser(requesterEmail);
  if (!isAdmin) {
    res.status(403).json({ success: false, message: 'Admin privileges required.' });
    return null;
  }

  return requesterEmail;
}

function parseDateOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysAgoDate(days) {
  const now = new Date();
  const safeDays = Math.max(Number(days) || 30, 1);
  return new Date(now.getTime() - safeDays * 24 * 60 * 60 * 1000);
}

app.get('/api/admin/users', async (req, res) => {
  const requesterEmail = await requireAdmin(req, res);
  if (!requesterEmail) return;

  const users = await getUsers();
  const safeUsers = users.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role || 'employee', department: u.department || '', position: u.position || '', phone: u.phone || '', gender: u.gender || '', profileImage: u.profileImage || '' }));
  return res.json({ success: true, users: safeUsers });
});

app.post('/api/admin/users', async (req, res) => {
  const requesterEmail = await requireAdmin(req, res);
  if (!requesterEmail) return;

  const { name, email, password, role = 'employee', surname = '', firstName = '', middleName = '', suffix = '', birthday = '', gender = '' } = req.body;
  if (!email || !name || !role) {
    return res.status(400).json({ success: false, message: 'Name, email, and role are required.' });
  }

  const normalizedEmail = email.toLowerCase();
  const existingUser = await getUserByEmail(normalizedEmail);
  if (existingUser) {
    return res.status(409).json({ success: false, message: 'User already exists.' });
  }

  const hashedPassword = password ? bcrypt.hashSync(password, 10) : '';
  const user = await createUser({
    name,
    surname,
    firstName,
    middleName,
    suffix,
    email: normalizedEmail,
    birthday,
    password: hashedPassword,
    gender,
    role,
    google: false,
  });

  return res.json({ success: true, user: { email: user.email, name: user.name, role: user.role || role } });
});

app.put('/api/admin/users/:id/role', async (req, res) => {
  const requesterEmail = await requireAdmin(req, res);
  if (!requesterEmail) return;

  const userId = Number(req.params.id);
  const { role } = req.body;
  if (!userId || !role) {
    return res.status(400).json({ success: false, message: 'User id and role are required.' });
  }

  const user = await getUserById(userId);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  const updatedUser = await updateUserRole(userId, role);
  return res.json({ success: true, user: { id: updatedUser.id, email: updatedUser.email, name: updatedUser.name, role: updatedUser.role || 'employee' } });
});

app.get('/api/admin/reports/summary', async (req, res) => {
  const requesterEmail = await requireAdmin(req, res);
  if (!requesterEmail) return;

  const days = Math.max(Number(req.query.days) || 30, 1);
  const departmentFilter = String(req.query.department || '').trim().toLowerCase();
  const since = daysAgoDate(days);
  const now = new Date();
  const futureUntil = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const users = await getUsers();
  const scopedUsers = users.filter(user => {
    if (!departmentFilter) return true;
    return String(user.department || '').trim().toLowerCase() === departmentFilter;
  });

  const userData = await Promise.all(
    scopedUsers.map(async (user) => {
      const email = String(user.email || '').toLowerCase();
      const [leaves, trainings, attendance] = await Promise.all([
        getLeaves(email),
        getTrainings(email),
        getAttendance(email),
      ]);
      return { user, leaves: leaves || [], trainings: trainings || [], attendance: attendance || [] };
    })
  );

  let pendingLeaves = 0;
  let approvedLeaves = 0;
  let rejectedLeaves = 0;
  let upcomingTrainings = 0;
  let presentCount = 0;
  let lateCount = 0;
  let absentCount = 0;
  const recentLeaves = [];

  userData.forEach(({ user, leaves, trainings, attendance }) => {
    leaves.forEach((item) => {
      const startRaw = item.start || item.startDate;
      const startDate = parseDateOrNull(startRaw);
      if (startDate && startDate >= since) {
        const status = String(item.status || 'Pending');
        if (status === 'Pending') pendingLeaves += 1;
        if (status === 'Approved') approvedLeaves += 1;
        if (status === 'Rejected') rejectedLeaves += 1;
      }

      recentLeaves.push({
        id: Number(item.id),
        employeeEmail: user.email,
        employeeName: user.name || user.email,
        type: item.type,
        start: startRaw,
        end: item.end || item.endDate,
        days: Number(item.days || 0),
        status: item.status || 'Pending',
      });
    });

    trainings.forEach((item) => {
      const trainingStart = parseDateOrNull(item.start || item.startDate);
      if (trainingStart && trainingStart >= now && trainingStart <= futureUntil) {
        upcomingTrainings += 1;
      }
    });

    attendance.forEach((item) => {
      const attendanceDate = parseDateOrNull(item.date);
      if (!attendanceDate || attendanceDate < since) return;
      const status = String(item.status || '').toLowerCase();
      if (status === 'present') presentCount += 1;
      else if (status === 'late') lateCount += 1;
      else if (status === 'absent') absentCount += 1;
    });
  });

  const attendanceTotal = presentCount + lateCount + absentCount;
  const attendancePresentRate = attendanceTotal ? Math.round((presentCount / attendanceTotal) * 100) : 0;

  recentLeaves.sort((a, b) => {
    const da = parseDateOrNull(a.start);
    const db = parseDateOrNull(b.start);
    return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
  });

  return res.json({
    success: true,
    summary: {
      rangeDays: days,
      department: departmentFilter,
      generatedAt: new Date().toISOString(),
      metrics: {
        totalEmployees: scopedUsers.length,
        pendingLeaves,
        approvedLeaves,
        rejectedLeaves,
        upcomingTrainings,
        attendancePresentRate,
        presentCount,
        lateCount,
        absentCount,
      },
      recentLeaves: recentLeaves.slice(0, 10),
    },
  });
});

app.get('/api/admin/audit-logs', async (req, res) => {
  const requesterEmail = await requireAdmin(req, res);
  if (!requesterEmail) return;

  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const items = await getAuditLogs(limit);
  return res.json({ success: true, items });
});

app.post('/api/admin/audit-logs', async (req, res) => {
  const requesterEmail = await requireAdmin(req, res);
  if (!requesterEmail) return;

  const { action, target = '', details = '', timestamp } = req.body;
  if (!action) {
    return res.status(400).json({ success: false, message: 'action is required.' });
  }

  const item = await createAuditLog({
    id: Date.now(),
    adminEmail: requesterEmail,
    action,
    target,
    details,
    timestamp: timestamp || new Date().toISOString(),
  });

  return res.json({ success: true, item });
});

app.get('/api/hr/announcements', async (req, res) => {
  const visibleOnly = String(req.query.visibleOnly || '') === '1';
  const items = await getAnnouncements();
  const filtered = visibleOnly ? items.filter(item => item.visible !== false && item.visible !== 0) : items;
  return res.json({ success: true, items: filtered });
});

app.post('/api/hr/announcements', async (req, res) => {
  const { id, title, description, image, visible, date, createdByEmail } = req.body;
  if (!id || !title || !description || !date) {
    return res.status(400).json({ success: false, message: 'id, title, description, and date are required.' });
  }

  const item = await createAnnouncement({ id, title, description, image, visible: visible !== false, date, createdByEmail });
  return res.json({ success: true, item });
});

app.put('/api/hr/announcements/:id/visibility', async (req, res) => {
  const visible = !!req.body.visible;
  const item = await updateAnnouncementVisibility(req.params.id, visible);
  if (!item) {
    return res.status(404).json({ success: false, message: 'Announcement not found.' });
  }
  return res.json({ success: true, item });
});

app.delete('/api/hr/announcements/:id', async (req, res) => {
  await deleteAnnouncement(req.params.id);
  return res.json({ success: true });
});

app.get('/api/hr/leaves', async (req, res) => {
  const email = req.query.email ? String(req.query.email).toLowerCase() : '';
  const items = await getLeaves(email || null);
  return res.json({ success: true, items });
});

app.put('/api/hr/leaves', async (req, res) => {
  const { email, items = [] } = req.body;
  const normalizedEmail = String(email || '').toLowerCase();
  if (!normalizedEmail) {
    return res.status(400).json({ success: false, message: 'email is required.' });
  }

  const saved = await upsertLeavesForEmployee(normalizedEmail, items);
  return res.json({ success: true, items: saved });
});

app.put('/api/hr/leaves/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!status) {
    return res.status(400).json({ success: false, message: 'status is required.' });
  }

  const leave = await updateLeaveStatus(req.params.id, status);
  if (!leave) {
    return res.status(404).json({ success: false, message: 'Leave record not found.' });
  }

  return res.json({ success: true, leave });
});

app.get('/api/hr/attendance', async (req, res) => {
  const email = String(req.query.email || '').toLowerCase();
  if (!email) {
    return res.status(400).json({ success: false, message: 'email is required.' });
  }

  const items = await getAttendance(email);
  return res.json({ success: true, items });
});

app.put('/api/hr/attendance', async (req, res) => {
  const { email, items = [] } = req.body;
  const normalizedEmail = String(email || '').toLowerCase();
  if (!normalizedEmail) {
    return res.status(400).json({ success: false, message: 'email is required.' });
  }

  const saved = await upsertAttendanceForEmployee(normalizedEmail, items);
  return res.json({ success: true, items: saved });
});

app.get('/api/hr/trainings', async (req, res) => {
  const email = String(req.query.email || '').toLowerCase();
  if (!email) {
    return res.status(400).json({ success: false, message: 'email is required.' });
  }

  const items = await getTrainings(email);
  return res.json({ success: true, items });
});

app.put('/api/hr/trainings', async (req, res) => {
  const { email, items = [] } = req.body;
  const normalizedEmail = String(email || '').toLowerCase();
  if (!normalizedEmail) {
    return res.status(400).json({ success: false, message: 'email is required.' });
  }

  const saved = await upsertTrainingsForEmployee(normalizedEmail, items);
  return res.json({ success: true, items: saved });
});

app.get('/api/hr/evaluations', async (req, res) => {
  const email = String(req.query.email || '').toLowerCase();
  if (!email) {
    return res.status(400).json({ success: false, message: 'email is required.' });
  }

  const item = await getEvaluation(email);
  return res.json({ success: true, item });
});

app.put('/api/hr/evaluations', async (req, res) => {
  const { email, status } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, message: 'email is required.' });
  }

  const item = await upsertEvaluation(String(email).toLowerCase(), status || '');
  return res.json({ success: true, item });
});

app.get('/api/hr/snapshot', async (req, res) => {
  const email = String(req.query.email || '').toLowerCase();
  if (!email) {
    return res.status(400).json({ success: false, message: 'email is required.' });
  }

  const [leaveRows, trainingRows, attendanceRows, evaluationRow, announcementRows] = await Promise.all([
    getLeaves(email),
    getTrainings(email),
    getAttendance(email),
    getEvaluation(email),
    getAnnouncements(),
  ]);

  const leaves = leaveRows.map(row => ({
    id: Number(row.id),
    type: row.type,
    start: row.start || row.startDate,
    end: row.end || row.endDate,
    days: Number(row.days || 0),
    status: row.status || 'Pending',
    medicalCertificate: row.medicalCertificate ? (typeof row.medicalCertificate === 'string' ? JSON.parse(row.medicalCertificate) : row.medicalCertificate) : null,
  }));

  const trainings = trainingRows.map(row => ({
    id: Number(row.id),
    title: row.title,
    start: row.start || row.startDate,
    end: row.end || row.endDate,
    hours: row.hours,
    type: row.type,
    sponsor: row.sponsor,
    status: row.status || '',
  }));

  const attendance = attendanceRows.map(row => ({
    id: Number(row.id),
    date: row.date,
    status: row.status,
  }));

  const announcements = announcementRows
    .filter(item => item.visible !== false && item.visible !== 0)
    .map(item => ({
    id: Number(item.id),
    title: item.title,
    description: item.description,
    image: item.image || '',
    date: item.date,
  }));

  return res.json({
    success: true,
    snapshot: {
      leaves,
      trainings,
      attendance,
      evaluation: { status: (evaluationRow && evaluationRow.status) || '' },
      announcements,
    }
  });
});

app.put('/api/hr/snapshot', async (req, res) => {
  const { email, leaves = [], trainings = [], attendance = [], evaluation = { status: '' } } = req.body;
  const normalizedEmail = String(email || '').toLowerCase();
  if (!normalizedEmail) {
    return res.status(400).json({ success: false, message: 'email is required.' });
  }

  await Promise.all([
    upsertLeavesForEmployee(normalizedEmail, leaves),
    upsertTrainingsForEmployee(normalizedEmail, trainings),
    upsertAttendanceForEmployee(normalizedEmail, attendance),
    upsertEvaluation(normalizedEmail, (evaluation && evaluation.status) || ''),
  ]);

  return res.json({ success: true });
});

app.get('/api/hr/leave-comments', async (req, res) => {
  const email = String(req.query.email || '').toLowerCase();
  const leaveId = Number(req.query.leaveId);
  if (!email || !leaveId) {
    return res.status(400).json({ success: false, message: 'email and leaveId are required.' });
  }

  const items = await getLeaveComments(email, leaveId);
  return res.json({ success: true, items });
});

app.post('/api/hr/leave-comments', async (req, res) => {
  const { id, leaveId, employeeEmail, text, date, createdByEmail, createdByRole } = req.body;
  if (!id || !leaveId || !employeeEmail || !text) {
    return res.status(400).json({ success: false, message: 'id, leaveId, employeeEmail, and text are required.' });
  }

  const item = await createLeaveComment({ id, leaveId, employeeEmail, text, date, createdByEmail, createdByRole });
  return res.json({ success: true, item });
});

app.delete('/api/hr/leave-comments/:id', async (req, res) => {
  await deleteLeaveComment(req.params.id);
  return res.json({ success: true });
});

app.post('/api/auth/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) {
    return res.status(400).json({ success: false, message: 'Google credential is required.' });
  }

  let ticket;
  try {
    ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid Google credential.' });
  }

  const payload = ticket.getPayload();
  if (!payload || !payload.email) {
    return res.status(400).json({ success: false, message: 'Google token did not contain an email.' });
  }

  const email = payload.email.toLowerCase();
  let user = await getUserByEmail(email);

  if (!user) {
    const nameParts = (payload.name || '').trim().split(' ');
    const firstName = nameParts[0] || '';
    const surname = nameParts.slice(1).join(' ') || '';

    user = await createUser({
      name: payload.name || email,
      surname,
      firstName,
      middleName: '',
      suffix: '',
      email,
      birthday: '',
      password: '',
      gender: '',
      role: 'employee',
      google: true,
    });
  }

  return res.json({ success: true, user: { email: user.email, name: user.name, role: user.role || 'employee' } });
});

app.get('/api/users/profile', async (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ success: false, message: 'email is required.' });
  }

  const profile = await getUserProfile(email);
  if (!profile) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  return res.json({ success: true, profile });
});

app.put('/api/users/profile', async (req, res) => {
  const { email, name, department, position, phone, profileImage, gender, newPassword } = req.body;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    return res.status(400).json({ success: false, message: 'email is required.' });
  }

  const user = await getUserByEmail(normalizedEmail);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  if (newPassword) {
    if (String(newPassword).length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }
    const hashed = bcrypt.hashSync(String(newPassword), 10);
    await updateUserPassword(normalizedEmail, hashed);
  }

  const profile = await upsertUserProfile(normalizedEmail, {
    name: name !== undefined ? String(name).trim() : undefined,
    department: department !== undefined ? String(department).trim() : undefined,
    position: position !== undefined ? String(position).trim() : undefined,
    phone: phone !== undefined ? String(phone).trim() : undefined,
    profileImage: profileImage !== undefined ? profileImage : undefined,
    gender: gender !== undefined ? String(gender).trim() : undefined,
  });

  return res.json({ success: true, profile });
});

app.use(express.static(path.join(__dirname)));

ensureDefaultAdminAccount().catch(error => {
  console.error('Failed to ensure default admin account:', error);
});

app.listen(PORT, () => {
  console.log(`CHRIS Website backend started on http://localhost:${PORT}`);
  if (!process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID') {
    console.warn('WARNING: Set GOOGLE_CLIENT_ID environment variable before using Google authentication.');
  }

  if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASSWORD || !process.env.DB_NAME) {
    console.warn('WARNING: Set DB_HOST, DB_USER, DB_PASSWORD, and DB_NAME environment variables before using MySQL.');
  }
});
