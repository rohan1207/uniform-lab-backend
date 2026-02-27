/**
 * Seed a default admin user in MongoDB.
 * Run: node scripts/seedAdmin.js (from Backend folder)
 * Uses ADMIN_EMAIL and ADMIN_PASSWORD from .env, or defaults below.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const Admin = require('../src/models/Admin');
const connectDB = require('../src/config/db');

const DEFAULT_EMAIL = 'Uniformlab@admin';
const DEFAULT_PASSWORD = 'Uniformlab@ULP2026';

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL || DEFAULT_EMAIL;
  const password = process.env.ADMIN_PASSWORD || DEFAULT_PASSWORD;
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniformlab';

  await connectDB(uri);

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await Admin.findOne({ email: normalizedEmail });

  if (existing) {
    // eslint-disable-next-line no-console
    console.log(`Admin already exists for ${normalizedEmail}. No change.`);
    await mongoose.disconnect();
    process.exit(0);
    return;
  }

  const saltRounds = 12;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  await Admin.create({
    email: normalizedEmail,
    passwordHash,
    name: 'Admin',
    role: 'admin',
    isActive: true,
  });

  // eslint-disable-next-line no-console
  console.log(`Seeded admin user: ${normalizedEmail}`);
  await mongoose.disconnect();
  process.exit(0);
}

seedAdmin().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Seed failed', err);
  process.exit(1);
});
