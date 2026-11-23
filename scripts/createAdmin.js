require('dotenv').config();
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');

(async () => {
  const { ADMIN_EMAIL, ADMIN_USERNAME, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_USERNAME || !ADMIN_PASSWORD) {
    console.error('Set ADMIN_EMAIL, ADMIN_USERNAME and ADMIN_PASSWORD in .env first.');
    process.exit(1);
  }
  if (ADMIN_PASSWORD.length < 12) {
    console.error('ADMIN_PASSWORD must be at least 12 characters.');
    process.exit(1);
  }

  await connectDB();
  const email = ADMIN_EMAIL.toLowerCase().trim();
  const hashed = await bcrypt.hash(ADMIN_PASSWORD, 12);

  const existing = await User.findOne({ email });
  if (existing) {
    existing.role = 'admin';
    existing.password = hashed;
    await existing.save();
    console.log(`[admin] updated existing user ${email} -> admin`);
  } else {
    await User.create({ username: ADMIN_USERNAME.trim(), email, password: hashed, role: 'admin' });
    console.log(`[admin] created admin ${email}`);
  }
  await mongoose.disconnect();
})().catch((err) => {
  console.error('[admin] failed:', err.message);
  process.exit(1);
});
