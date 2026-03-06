const express = require('express');
const School = require('../models/School');
const Category = require('../models/Category');
const Product = require('../models/Product');
const { cloudinary, isConfigured } = require('../config/cloudinary');

// Public router
const publicRouter = express.Router();

// GET /api/public/schools
publicRouter.get('/', async (req, res) => {
  res.set('Cache-Control', 'public, max-age=120, stale-while-revalidate=300');
  const schools = await School.find({ isActive: true })
    .sort({ displayOrder: 1, createdAt: -1 })
    .select('name slug logoUrl imageUrl level displayOrder')
    .lean();
  res.json(schools);
});

// GET /api/public/schools/:slug - school with categories + products
publicRouter.get('/:slug', async (req, res) => {
  res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
  const school = await School.findOne({ slug: req.params.slug, isActive: true }).lean();
  if (!school) {
    return res.status(404).json({ error: { message: 'School not found' } });
  }
  // Fetch all active products for this school, populating both single and multi-category
  const products = await Product.find({ school: school._id, isActive: true })
    .populate('grade', '_id name')
    .populate('category', '_id name slug sortOrder')
    .populate('categories', '_id name slug sortOrder')
    .lean();

  // Build a deduplicated, sorted categories list from the products themselves
  // (supports both legacy single `category` and new `categories` array)
  const categoriesMap = new Map();
  products.forEach((p) => {
    // Use categories array if populated, otherwise fall back to single category
    const allCats = (p.categories && p.categories.length > 0)
      ? p.categories
      : (p.category ? [p.category] : []);
    allCats.forEach((cat) => {
      if (cat && cat._id) {
        categoriesMap.set(String(cat._id), cat);
      }
    });
  });
  const categories = Array.from(categoriesMap.values()).sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)
  );

  res.json({ school, categories, products });
});

// Admin router
const adminRouter = express.Router();

// GET /api/admin/schools
adminRouter.get('/', async (req, res) => {
  const schools = await School.find().sort({ displayOrder: 1, createdAt: -1 });
  res.json(schools);
});

// POST /api/admin/schools
adminRouter.post('/', async (req, res) => {
  const { name, slug, logoUrl, logoPublicId, imageUrl, imagePublicId, level, classes, accentColor, isActive, tags } = req.body;
  const finalSlug =
    slug ||
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\\s-]/g, '')
      .replace(/\\s+/g, '-')
      .replace(/-+/g, '-');
  const school = await School.create({
    name,
    slug: finalSlug,
    logoUrl,
    logoPublicId,
    imageUrl,
    imagePublicId,
    level,
    classes,
    accentColor,
    isActive,
    tags,
  });
  res.status(201).json(school);
});

// PATCH /api/admin/schools/:id/order – lightweight: only updates displayOrder
adminRouter.patch('/:id/order', async (req, res) => {
  try {
    const raw = req.body.displayOrder;
    const displayOrder = raw === null || raw === undefined || raw === '' ? null : Number(raw);
    if (displayOrder !== null && (!Number.isFinite(displayOrder) || displayOrder < 1)) {
      return res.status(400).json({ error: { message: 'displayOrder must be a positive integer or null' } });
    }
    const school = await School.findByIdAndUpdate(
      req.params.id,
      { $set: { displayOrder } },
      { new: true }
    );
    if (!school) return res.status(404).json({ error: { message: 'School not found' } });
    res.json({ _id: school._id, displayOrder: school.displayOrder });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

// PATCH /api/admin/schools/:id
adminRouter.patch('/:id', async (req, res) => {
  const update = { ...req.body };
  if (update.name && !update.slug) {
    update.slug = update.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\\s-]/g, '')
      .replace(/\\s+/g, '-')
      .replace(/-+/g, '-');
  }
  const school = await School.findByIdAndUpdate(req.params.id, update, {
    new: true,
    runValidators: true,
  });
  if (!school) {
    return res.status(404).json({ error: { message: 'School not found' } });
  }
  res.json(school);
});

// DELETE /api/admin/schools/:id/logo – remove logo from Cloudinary and clear on school
adminRouter.delete('/:id/logo', async (req, res) => {
  const school = await School.findById(req.params.id);
  if (!school) {
    return res.status(404).json({ error: { message: 'School not found' } });
  }
  if (school.logoPublicId && isConfigured()) {
    try {
      await cloudinary.uploader.destroy(school.logoPublicId, { resource_type: 'image' });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Cloudinary destroy failed', err);
    }
  }
  school.logoUrl = undefined;
  school.logoPublicId = undefined;
  await school.save();
  res.json(school);
});

// DELETE /api/admin/schools/:id/image – remove main image from Cloudinary and clear on school
adminRouter.delete('/:id/image', async (req, res) => {
  const school = await School.findById(req.params.id);
  if (!school) {
    return res.status(404).json({ error: { message: 'School not found' } });
  }
  if (school.imagePublicId && isConfigured()) {
    try {
      await cloudinary.uploader.destroy(school.imagePublicId, { resource_type: 'image' });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Cloudinary destroy (image) failed', err);
    }
  }
  school.imageUrl = undefined;
  school.imagePublicId = undefined;
  await school.save();
  res.json(school);
});

// DELETE /api/admin/schools/:id
adminRouter.delete('/:id', async (req, res) => {
  await School.findByIdAndDelete(req.params.id);
  res.status(204).end();
});

module.exports = { public: publicRouter, admin: adminRouter };

