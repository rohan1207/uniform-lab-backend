const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');

async function ensureDefaultAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    // eslint-disable-next-line no-console
    console.warn('ADMIN_EMAIL or ADMIN_PASSWORD not set, skipping default admin seed');
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();

  const existing = await Admin.findOne({ email: normalizedEmail });
  if (existing) {
    return;
  }

  const saltRounds = 12;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  await Admin.create({
    email: normalizedEmail,
    passwordHash,
    name: 'Admin',
    role: 'admin',
  });

  // eslint-disable-next-line no-console
  console.log(`Seeded default admin user for ${normalizedEmail}`);
}

module.exports = { ensureDefaultAdmin };

