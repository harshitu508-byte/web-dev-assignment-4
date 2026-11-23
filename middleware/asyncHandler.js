// Express 4 does not catch rejected promises from async handlers.
// Wrapping a handler forwards any thrown error / rejection to the error middleware.
module.exports = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
