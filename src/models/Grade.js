const mongoose = require('mongoose');

const gradeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Grade', gradeSchema);
