const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const Announcement = require('./models/Announcement');

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 4000);
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI in environment variables.');
  process.exit(1);
}

app.use(cors());
app.use(express.json({ limit: '5mb' }));

function buildDisplayName({ firstName, middleName, surname, suffix }) {
  const base = [firstName, middleName, surname].filter(Boolean).join(' ').trim();
  return suffix ? `${base} ${suffix}`.trim() : base;
}

function toPublicUser(userDoc) {
  return {
    id: String(userDoc._id),
    name: userDoc.name,
    surname: userDoc.surname,
    firstName: userDoc.firstName,
    middleName: userDoc.middleName,
    suffix: userDoc.suffix || '',
    email: userDoc.email,
    birthday: userDoc.birthday,
    gender: userDoc.gender,
    department: userDoc.department || '',
    position: userDoc.position || 'CHR Employee',
    phone: userDoc.phone || ''
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/auth/signup', async (req, res) => {
  try {
    const {
      surname,
      firstName,
      middleName,
      suffix = '',
      email,
      birthday,
      password,
      confirmPassword,
      gender
    } = req.body || {};

    if (!surname || !firstName || !middleName || !email || !birthday || !password || !confirmPassword || !gender) {
      return res.status(400).json({ message: 'Please complete all sign up fields.' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Password and confirm password do not match.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ message: 'Account already exists. Please login instead.' });
    }

    const finalSuffix = String(suffix || '').trim().toUpperCase() === 'N/A' ? '' : String(suffix || '').trim();

    const payload = {
      surname: String(surname).trim().toUpperCase(),
      firstName: String(firstName).trim().toUpperCase(),
      middleName: String(middleName).trim().toUpperCase(),
      suffix: finalSuffix.toUpperCase(),
      email: normalizedEmail,
      birthday,
      gender: String(gender).trim(),
      position: 'CHR Employee'
    };

    payload.name = buildDisplayName(payload);
    payload.passwordHash = await bcrypt.hash(password, 10);

    const created = await User.create(payload);
    return res.status(201).json({ user: toPublicUser(created) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Unable to create account at this time.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    return res.json({ user: toPublicUser(user) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Unable to login at this time.' });
  }
});

app.get('/api/announcements', async (_req, res) => {
  try {
    const items = await Announcement.find({}).sort({ createdAt: -1 });
    return res.json({ announcements: items.map((item) => ({
      id: String(item._id),
      title: item.title || '',
      text: item.text || '',
      details: item.details || '',
      imageDataUrl: item.imageDataUrl || '',
      date: item.date
    })) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Unable to load announcements.' });
  }
});

app.post('/api/announcements', async (req, res) => {
  try {
    const { title = '', text = '', details = '', imageDataUrl = '' } = req.body || {};
    if (!title && !text && !imageDataUrl) {
      return res.status(400).json({ message: 'Announcement title or image is required.' });
    }

    const created = await Announcement.create({
      title: String(title || text || '').trim(),
      text: String(text || title || '').trim(),
      details: String(details || '').trim(),
      imageDataUrl: String(imageDataUrl || ''),
      date: new Date().toISOString().slice(0, 10)
    });

    return res.status(201).json({
      announcement: {
        id: String(created._id),
        title: created.title || '',
        text: created.text || '',
        details: created.details || '',
        imageDataUrl: created.imageDataUrl || '',
        date: created.date
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Unable to create announcement.' });
  }
});

app.delete('/api/announcements/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Announcement.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: 'Announcement not found.' });
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Unable to delete announcement.' });
  }
});

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`CHRIS backend running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to connect to MongoDB:', error.message);
    process.exit(1);
  });
