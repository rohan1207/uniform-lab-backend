const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Customer = require('../models/Customer');

const router = express.Router();

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  return secret;
}

// POST /api/public/auth/signup
router.post('/signup', async (req, res) => {
  const { name, email, phone, password } = req.body || {};

  if (!name || !email || !password) {
    return res
      .status(400)
      .json({ error: { message: 'Name, email and password are required' } });
  }

  const normalizedEmail = String(email).toLowerCase().trim();

  const existing = await Customer.findOne({ email: normalizedEmail });
  if (existing) {
    return res.status(409).json({ error: { message: 'An account with this email already exists' } });
  }

  const passwordHash = await bcrypt.hash(String(password), 10);

  const customer = await Customer.create({
    name: String(name).trim(),
    email: normalizedEmail,
    phone: phone ? String(phone).trim() : '',
    passwordHash,
    addresses: [],
  });

  const payload = {
    sub: customer._id.toString(),
    email: customer.email,
    role: 'customer',
  };

  const token = jwt.sign(payload, getJwtSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  });

  return res.status(201).json({
    token,
    user: {
      id: customer._id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
    },
  });
});

// POST /api/public/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res
      .status(400)
      .json({ error: { message: 'Email and password are required' } });
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const customer = await Customer.findOne({ email: normalizedEmail });

  if (!customer) {
    return res.status(401).json({ error: { message: 'Invalid credentials' } });
  }

  const ok = await bcrypt.compare(String(password), customer.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: { message: 'Invalid credentials' } });
  }

  const payload = {
    sub: customer._id.toString(),
    email: customer.email,
    role: 'customer',
  };

  const token = jwt.sign(payload, getJwtSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  });

  return res.json({
    token,
    user: {
      id: customer._id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
    },
  });
});

// POST /api/public/auth/check-email
// Returns { exists: true|false } — never reveals sensitive info
router.post('/check-email', async (req, res) => {
  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ error: { message: 'Email is required' } });
  }
  const normalizedEmail = String(email).toLowerCase().trim();
  const exists = !!(await Customer.findOne({ email: normalizedEmail }).select('_id').lean());
  return res.json({ exists });
});

module.exports = router;

