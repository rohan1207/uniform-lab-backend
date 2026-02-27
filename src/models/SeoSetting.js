const mongoose = require('mongoose');

const seoSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'global' },
    value: { type: Object, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SeoSetting', seoSettingSchema);

