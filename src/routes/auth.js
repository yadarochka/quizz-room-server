const express = require('express');
const passport = require('passport');
const { signToken, setAuthCookie, clearAuthCookie, authMiddleware } = require('../middleware/auth');
const { getDb, get } = require('../config/database');

const router = express.Router();

router.get(
  '/yandex',
  passport.authenticate('yandex')
);

router.get(
  '/yandex/callback',
  passport.authenticate('yandex', { session: false, failureRedirect: '/' }),
  (req, res) => {
    const token = signToken(req.user);
    setAuthCookie(res, token);
    const redirectUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    res.redirect(redirectUrl);
  }
);

router.get('/logout', (req, res) => {
  clearAuthCookie(res);
  res.status(200).json({ success: true });
});

router.get('/me', authMiddleware.requireAuth, async (req, res, next) => {
  try {
    const db = getDb();
    const user = await get(db, 'SELECT id, email, name, avatar_url, created_at FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    next(err);
  }
});

module.exports = router;


