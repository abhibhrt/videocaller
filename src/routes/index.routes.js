// src/routes/index.routes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const requireAuth = require('../middleware/auth.middleware');

router.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

// Auth routes
router.post('/api/auth/register', authController.register);
router.post('/api/auth/login', authController.login);
router.get('/api/auth/me', requireAuth, authController.me);

// User search & Direct Messages
router.get('/api/users/search', requireAuth, authController.searchUsers);
router.get('/api/messages/:username', requireAuth, authController.getDirectMessages);

module.exports = router;