const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, default: '', trim: true },
    text: { type: String, default: '', trim: true },
    details: { type: String, default: '', trim: true },
    imageDataUrl: { type: String, default: '' },
    date: { type: String, required: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Announcement', announcementSchema);
