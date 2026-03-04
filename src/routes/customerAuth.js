const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Customer = require('../models/Customer');
const PasswordResetToken = require('../models/PasswordResetToken');
const { sendPasswordResetEmail } = require('../utils/emailService');

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

// ─────────────────────────────────────────────────────────────
// POST /api/public/auth/forgot-password
// Always responds 200 — never reveals whether an email exists.
// Rate-limiting should be applied at the reverse-proxy/nginx layer.
// ─────────────────────────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  if (!email) {
    // Even with missing email, respond 200 to avoid information leakage
    return res.json({ message: 'If that email is registered, you will receive a reset link.' });
  }

  const normalizedEmail = String(email).toLowerCase().trim();

  try {
    const customer = await Customer.findOne({ email: normalizedEmail }).select('_id email name');

    if (customer) {
      // 1. Purge any existing (unused) tokens for this user to prevent accumulation
      await PasswordResetToken.deleteMany({ userId: customer._id });

      // 2. Generate a cryptographically secure token (64 hex chars = 256 bits)
      const rawToken = crypto.randomBytes(32).toString('hex');

      // 3. Persist token with 1-hour expiry
      await PasswordResetToken.create({
        userId: customer._id,
        token: rawToken,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        used: false,
      });

      // 4. Send the reset email (non-blocking — errors are logged, not thrown)
      sendPasswordResetEmail(customer.email, rawToken).catch((err) => {
        console.error('[ForgotPassword] Email send failed:', err.message);
      });
    }
    // Whether found or not, always return the same response
  } catch (err) {
    // Log but swallow — never expose internal errors
    console.error('[ForgotPassword] Unexpected error:', err.message);
  }

  return res.json({ message: 'If that email is registered, you will receive a reset link.' });
});

// ─────────────────────────────────────────────────────────────
// POST /api/public/auth/reset-password
// Validates token, updates password, marks token as used.
// ─────────────────────────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body || {};

  if (!token || !newPassword) {
    return res.status(400).json({ error: { message: 'Token and new password are required.' } });
  }

  if (String(newPassword).length < 6) {
    return res.status(400).json({ error: { message: 'Password must be at least 6 characters.' } });
  }

  // 1. Find the token record
  const tokenDoc = await PasswordResetToken.findOne({ token: String(token) });

  if (!tokenDoc) {
    return res.status(400).json({ error: { message: 'This reset link is invalid or has already been used.' } });
  }

  // 2. Check expiry (belt-and-suspenders — TTL index handles background cleanup)
  if (tokenDoc.used || tokenDoc.expiresAt < new Date()) {
    // Clean up stale doc proactively
    await PasswordResetToken.deleteOne({ _id: tokenDoc._id }).catch(() => {});
    return res.status(400).json({ error: { message: 'This reset link has expired. Please request a new one.' } });
  }

  // 3. Find the customer
  const customer = await Customer.findById(tokenDoc.userId);
  if (!customer) {
    return res.status(400).json({ error: { message: 'Account not found. Please contact support.' } });
  }

  // 4. Hash new password and save
  const passwordHash = await bcrypt.hash(String(newPassword), 10);
  customer.passwordHash = passwordHash;
  await customer.save();

  // 5. Invalidate the token immediately (delete so it can't be reused)
  await PasswordResetToken.deleteOne({ _id: tokenDoc._id });

  // 6. Also purge any remaining tokens for this user (cleanup)
  await PasswordResetToken.deleteMany({ userId: customer._id }).catch(() => {});

  return res.json({ message: 'Password updated successfully. You can now log in with your new password.' });
});

module.exports = router;

