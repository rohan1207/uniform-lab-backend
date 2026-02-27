const express = require('express');
const SeoSetting = require('../models/SeoSetting');

const adminRouter = express.Router();

// GET /api/admin/seo/global
adminRouter.get('/global', async (req, res) => {
  const setting = await SeoSetting.findOne({ key: 'global' });
  res.json(setting ? setting.value : null);
});

// PUT /api/admin/seo/global
adminRouter.put('/global', async (req, res) => {
  const value = req.body || {};
  const setting = await SeoSetting.findOneAndUpdate(
    { key: 'global' },
    { value },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  res.json(setting.value);
});

module.exports = { admin: adminRouter };

