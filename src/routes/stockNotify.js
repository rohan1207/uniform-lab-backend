const express = require('express');
const StockNotify = require('../models/StockNotify');

const customerRouter = express.Router();

// POST /api/customer/stock-notify
// Body:
// {
//   notifyType: 'PRODUCT'|'COLOR',
//   productId, productName,
//   schoolId, schoolName, schoolSlug,
//   colorName (only for COLOR),
//   name, email
// }
customerRouter.post('/', async (req, res) => {
  const {
    notifyType,
    productId,
    productName,
    schoolId,
    schoolName,
    schoolSlug,
    colorName,
    name,
    email,
  } = req.body || {};

  if (!notifyType || !['PRODUCT', 'COLOR'].includes(notifyType)) {
    return res.status(400).json({ error: { message: 'notifyType must be PRODUCT or COLOR' } });
  }
  if (!productId || !productName || !schoolId || !schoolName || !schoolSlug) {
    return res.status(400).json({ error: { message: 'product/school details are required' } });
  }

  if (!name || !email) {
    return res.status(400).json({ error: { message: 'name and email are required' } });
  }

  if (notifyType === 'COLOR' && !colorName) {
    return res.status(400).json({ error: { message: 'colorName is required for COLOR notifyType' } });
  }

  const safeColor = notifyType === 'COLOR' ? colorName || null : null;

  try {
    const query = {
      productId,
      schoolId,
      notifyType,
      colorName: safeColor,
      email,
    };

    const update = {
      $set: {
        productName,
        schoolName,
        schoolSlug,
        name,
        // sentAt must be null until we actually send.
        sentAt: null,
        userId: req.customer?.id || undefined,
      },
    };

    const doc = await StockNotify.findOneAndUpdate(query, update, {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    });

    return res.status(201).json({ ok: true, id: doc._id });
  } catch (err) {
    return res.status(500).json({ error: { message: err.message || 'Failed to store notification' } });
  }
});

module.exports = { customerRouter };

