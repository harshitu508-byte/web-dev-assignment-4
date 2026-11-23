const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const appEvents = require('../events/appEvents');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;

// Evaluated per request so NODE_ENV is respected. `secure` => HTTPS only in production.
const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production',
});

// POST /api/auth/signup  (always creates a normal "user"; admins come from `npm run create-admin`)
router.post(
  '/signup',
  asyncHandler(async (req, res) => {
    const { username, email, password } = req.body || {};
    if (![username, email, password].every(isNonEmptyString)) {
      return res.status(400).json({ message: 'username, email and password are required (as strings)' });
    }
    if (password.length < 6 || password.length > 72) {
      return res.status(400).json({ message: 'Password must be 6-72 characters' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanName = username.trim();
    const exists = await User.findOne({ $or: [{ email: cleanEmail }, { username: cleanName }] });
    if (exists) return res.status(409).json({ message: 'User already exists' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ username: cleanName, email: cleanEmail, password: hashed });

    appEvents.emit('user:registered', user);
    res.status(201).json({ message: 'User registered', id: user._id, username: user.username, email: user.email });
  })
);

// POST /api/auth/login
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
      return res.status(400).json({ message: 'email and password are required (as strings)' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    const ok = user && (await bcrypt.compare(password, user.password));
    if (!ok) {
      appEvents.emit('login:failed', email);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
    );

    res.cookie('token', token, { ...cookieOptions(), maxAge: 60 * 60 * 1000 });
    appEvents.emit('user:login', user);
    res.status(200).json({ message: 'Login successful', token });
  })
);

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token', cookieOptions());
  res.json({ message: 'Logged out' });
});

module.exports = router;
