const express = require('express');
const Category = require('../models/Category');

const adminRouter = express.Router();

// GET /api/admin/categories – returns all categories (global list, same for all schools)
adminRouter.get('/', async (req, res) => {
  const categories = await Category.find().sort({ sortOrder: 1, name: 1 });
  res.json(categories);
});

// POST /api/admin/categories – create a global category (name required)
adminRouter.post('/', async (req, res) => {
  const { name, slug, sortOrder } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: { message: 'name is required' } });
  }
  const finalSlug =
    slug ||
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  const category = await Category.create({
    name: name.trim(),
    slug: finalSlug,
    sortOrder: sortOrder ?? 0,
  });
  res.status(201).json(category);
});

// PATCH /api/admin/categories/:id
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
  const category = await Category.findByIdAndUpdate(req.params.id, update, {
    new: true,
    runValidators: true,
  });
  if (!category) {
    return res.status(404).json({ error: { message: 'Category not found' } });
  }
  res.json(category);
});

// DELETE /api/admin/categories/:id
adminRouter.delete('/:id', async (req, res) => {
  await Category.findByIdAndDelete(req.params.id);
  res.status(204).end();
});

module.exports = { admin: adminRouter };

