const express = require('express');
const Product = require('../models/Product');

const router = express.Router();

// Simple placeholder implementation:
// POST /api/public/recommendations
// body: { items: [{ productId, categoryId, schoolId }] }
// This just returns other products from the same school (excluding ones already in cart).
router.post('/', async (req, res) => {
  const { items } = req.body || {};
  if (!Array.isArray(items) || !items.length) {
    return res.json([]);
  }
  const schoolIds = [...new Set(items.map((i) => i.schoolId).filter(Boolean))];
  const productIdsInCart = items.map((i) => i.productId).filter(Boolean);

  if (!schoolIds.length) {
    return res.json([]);
  }

  const recommendations = await Product.find({
    school: { $in: schoolIds },
    _id: { $nin: productIdsInCart },
    isActive: true,
  })
    .limit(12)
    .select('name price mainImageUrl school category');

  res.json(recommendations);
});

module.exports = router;

