const jwt = require('jsonwebtoken');

// Reads the token from "Authorization: Bearer <token>" or from a "token" cookie
function extractToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7);

  const cookies = req.headers.cookie;
  if (cookies) {
    const match = cookies.split(';').map((c) => c.trim()).find((c) => c.startsWith('token='));
    if (match) return decodeURIComponent(match.slice(6));
  }
  return null;
}

function verifyToken(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(403).json({ message: 'No token provided' });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET); // { id, username, role }
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}

// RBAC: allow only the listed roles
const authorizeRoles = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied: insufficient permissions' });
  }
  next();
};

module.exports = { verifyToken, authorizeRoles };
