const express = require('express');
const Grade = require('../models/Grade');

const adminRouter = express.Router();

const DEFAULT_GRADES = [
  { name: 'Pre-Primary / Pre-school', sortOrder: 0 },
  { name: 'Grade 1 onwards', sortOrder: 1 },
];

async function ensureDefaultGrades() {
  const count = await Grade.countDocuments();
  if (count === 0) {
    await Grade.insertMany(DEFAULT_GRADES);
  }
}

// GET /api/admin/grades – returns all grades (for admin dropdown); seeds defaults if none exist
adminRouter.get('/', async (req, res) => {
  await ensureDefaultGrades();
  const grades = await Grade.find().sort({ sortOrder: 1, name: 1 });
  res.json(grades);
});

// POST /api/admin/grades – create a grade (name required)
adminRouter.post('/', async (req, res) => {
  const { name, sortOrder } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: { message: 'name is required' } });
  }
  const grade = await Grade.create({
    name: name.trim(),
    sortOrder: sortOrder ?? 0,
  });
  res.status(201).json(grade);
});

module.exports = { admin: adminRouter };
