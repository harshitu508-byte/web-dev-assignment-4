const express = require('express');
const User = require('../models/User');
const Note = require('../models/Note');
const { verifyToken, authorizeRoles } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();
router.use(verifyToken, authorizeRoles('admin')); // RBAC: admins only

router.get('/users', asyncHandler(async (req, res) => {
  res.json(await User.find().select('-password'));
}));

router.get('/notes', asyncHandler(async (req, res) => {
  res.json(await Note.find().populate('owner', 'username email'));
}));

module.exports = router;
