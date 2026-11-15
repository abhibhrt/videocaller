// src/middleware/auth.middleware.js
const { verifyToken } = require('../utils/jwt');

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split(' ')[1];
  const payload = await verifyToken(token);

  if (!payload) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }

  req.user = payload;
  next();
}

module.exports = requireAuth;