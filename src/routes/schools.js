const express = require('express');
const School = require('../models/School');
const Category = require('../models/Category');
const Product = require('../models/Product');
const { cloudinary, isConfigured } = require('../config/cloudinary');

// Public router
const publicRouter = express.Router();

// GET /api/public/schools
publicRouter.get('/', async (req, res) => {
  const schools = await School.find({ isActive: true }).select('name slug logoUrl imageUrl level');
  res.json(schools);
});

// GET /api/public/schools/:slug - school with categories + products
publicRouter.get('/:slug', async (req, res) => {
  const school = await School.findOne({ slug: req.params.slug, isActive: true });
  if (!school) {
    return res.status(404).json({ error: { message: 'School not found' } });
  }
  const categories = await Category.find({ school: school._id }).sort({ sortOrder: 1, name: 1 });
  const products = await Product.find({ school: school._id, isActive: true })
    .lean();
  res.json({ school, categories, products });
});

// Admin router
const adminRouter = express.Router();

// GET /api/admin/schools
adminRouter.get('/', async (req, res) => {
  const schools = await School.find().sort({ createdAt: -1 });
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

