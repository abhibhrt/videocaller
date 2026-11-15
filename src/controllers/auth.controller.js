// src/controllers/auth.controller.js
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Message = require('../models/Message');
const { signToken } = require('../utils/jwt');

const INTERNAL_DOMAIN = '@closemiles.in';

function normalizeUsername(raw = '') {
  let clean = raw.trim().toLowerCase();
  if (clean.endsWith(INTERNAL_DOMAIN)) {
    clean = clean.slice(0, -INTERNAL_DOMAIN.length);
  }
  return clean;
}

const authController = {
  async register(req, res) {
    try {
      const { name, username, password } = req.body;

      if (!name || !username || !password) {
        return res.status(400).json({ error: 'Name, username, and password are required.' });
      }

      const cleanUsername = normalizeUsername(username);
      if (!/^[a-z0-9_]{3,25}$/.test(cleanUsername)) {
        return res.status(400).json({
          error: 'Username must be 3-25 characters (letters, numbers, underscores only).'
        });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters.' });
      }

      const internalEmail = `${cleanUsername}${INTERNAL_DOMAIN}`;

      const existing = await User.findOne({
        $or: [{ username: cleanUsername }, { email: internalEmail }]
      });
      if (existing) {
        return res.status(409).json({ error: 'Username is already taken.' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await User.create({
        name: name.trim(),
        username: cleanUsername,
        email: internalEmail,
        password: hashedPassword
      });

      const token = await signToken({
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        name: user.name
      });

      res.status(201).json({
        token,
        user: {
          id: user._id,
          name: user.name,
          username: user.username,
          email: user.email
        }
      });
    } catch (err) {
      console.error('Register error:', err);
      res.status(500).json({ error: 'Server error during registration.' });
    }
  },

  async login(req, res) {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
      }

      // Works whether user enters "alex_99" or "alex_99@closemiles.in"
      const cleanUsername = normalizeUsername(username);
      const user = await User.findOne({ username: cleanUsername });
      if (!user) {
        return res.status(401).json({ error: 'Invalid username or password.' });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ error: 'Invalid username or password.' });
      }

      const token = await signToken({
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        name: user.name
      });

      res.json({
        token,
        user: {
          id: user._id,
          name: user.name,
          username: user.username,
          email: user.email
        }
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Server error during login.' });
    }
  },

  async me(req, res) {
    res.json({ user: req.user });
  },

  async searchUsers(req, res) {
    try {
      const query = (req.query.q || '').trim().toLowerCase();
      if (!query) {
        return res.json({ users: [] });
      }

      const users = await User.find({
        username: { $ne: req.user.username },
        $or: [
          { username: { $regex: query, $options: 'i' } },
          { email: { $regex: query, $options: 'i' } }
        ]
      })
        .select('name username email -_id')
        .limit(15);

      res.json({ users });
    } catch (err) {
      res.status(500).json({ error: 'Failed to search users.' });
    }
  },

  async getDirectMessages(req, res) {
    try {
      const targetUsername = normalizeUsername(req.params.username);
      const me = req.user.username;

      const messages = await Message.find({
        $or: [
          { from: me, to: targetUsername },
          { from: targetUsername, to: me }
        ]
      })
        .sort({ createdAt: 1 })
        .limit(100);

      res.json({ messages });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load messages.' });
    }
  }
};

module.exports = authController;