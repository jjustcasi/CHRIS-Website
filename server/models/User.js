const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    surname: { type: String, required: true, trim: true },
    firstName: { type: String, required: true, trim: true },
    middleName: { type: String, required: true, trim: true },
    suffix: { type: String, default: '', trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    birthday: { type: String, required: true },
    passwordHash: { type: String, required: true },
    gender: { type: String, required: true, trim: true },
    department: { type: String, default: '', trim: true },
    position: { type: String, default: 'CHR Employee', trim: true },
    phone: { type: String, default: '', trim: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
