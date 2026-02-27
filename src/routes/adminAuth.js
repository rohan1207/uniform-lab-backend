const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: { message: 'Email and password are required' } });
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const admin = await Admin.findOne({ email: normalizedEmail, isActive: true });

  if (!admin) {
    return res.status(401).json({ error: { message: 'Invalid credentials' } });
  }

  const ok = await bcrypt.compare(password, admin.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: { message: 'Invalid credentials' } });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }

  const payload = {
    sub: admin._id.toString(),
    email: admin.email,
    role: admin.role,
  };

  const token = jwt.sign(payload, secret, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

  return res.json({
    token,
    admin: {
      id: admin._id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    },
  });
});

module.exports = router;

