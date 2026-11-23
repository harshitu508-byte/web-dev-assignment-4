const express = require('express');
const mongoose = require('mongoose');
const Note = require('../models/Note');
const { verifyToken } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const appEvents = require('../events/appEvents');

const router = express.Router();
router.use(verifyToken); // every notes route is protected

const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;
const checkId = (req, res, next) =>
  mongoose.isValidObjectId(req.params.id)
    ? next()
    : res.status(400).json({ message: 'Invalid note id' });

// Create
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { title, content } = req.body || {};
    if (!isNonEmptyString(title) || !isNonEmptyString(content)) {
      return res.status(400).json({ message: 'title and content are required (as strings)' });
    }
    const note = await Note.create({ title, content, owner: req.user.id });
    appEvents.emit('note:created', note);
    res.status(201).json(note);
  })
);

// Read all (own notes only)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await Note.find({ owner: req.user.id }).sort({ createdAt: 1 }));
  })
);

// Read one
router.get(
  '/:id',
  checkId,
  asyncHandler(async (req, res) => {
    const note = await Note.findOne({ _id: req.params.id, owner: req.user.id });
    if (!note) return res.status(404).json({ message: 'Note not found' });
    res.json(note);
  })
);

// Update
router.put(
  '/:id',
  checkId,
  asyncHandler(async (req, res) => {
    const { title, content } = req.body || {};
    const update = {};
    for (const [key, value] of Object.entries({ title, content })) {
      if (value === undefined) continue;
      if (!isNonEmptyString(value)) return res.status(400).json({ message: `${key} must be a non-empty string` });
      update[key] = value;
    }
    if (!Object.keys(update).length) return res.status(400).json({ message: 'Provide title and/or content' });

    const note = await Note.findOneAndUpdate({ _id: req.params.id, owner: req.user.id }, update, {
      new: true,
      runValidators: true,
    });
    if (!note) return res.status(404).json({ message: 'Note not found' });
    appEvents.emit('note:updated', note);
    res.json(note);
  })
);

// Delete
router.delete(
  '/:id',
  checkId,
  asyncHandler(async (req, res) => {
    const note = await Note.findOneAndDelete({ _id: req.params.id, owner: req.user.id });
    if (!note) return res.status(404).json({ message: 'Note not found' });
    appEvents.emit('note:deleted', note._id);
    res.json({ message: 'Note deleted' });
  })
);

module.exports = router;
