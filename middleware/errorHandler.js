function notFound(req, res) {
  res.status(404).json({ message: 'Route not found' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Malformed JSON body' });
  if (err.type === 'entity.too.large') return res.status(413).json({ message: 'Request body too large' });
  if (err.code === 11000) return res.status(409).json({ message: 'Duplicate value: already exists' });
  if (err.name === 'ValidationError') return res.status(400).json({ message: 'Validation failed', error: err.message });
  if (err.name === 'CastError') return res.status(400).json({ message: 'Invalid identifier or value' });

  console.error('[error]', err);
  // Never leak internals (stack traces, DB messages) to the client
  res.status(500).json({ message: 'Internal server error' });
}

module.exports = { notFound, errorHandler };
