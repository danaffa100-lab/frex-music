const jwt = require('jsonwebtoken');
const { query, bool } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'frex-dev-secret-change-in-production';
const PREVIEW_SECONDS = 20;

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, isAdmin: bool(user.is_admin) },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function authMiddleware(req, res, next) {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    req.user = null;
    return next();
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    req.user = null;
    next();
  }
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Войдите в аккаунт' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) return res.status(403).json({ error: 'Доступ только для администратора' });
  next();
}

async function getUserById(id) {
  const r = await query(
    'SELECT id, username, is_admin, is_blocked, has_subscription FROM users WHERE id = $1',
    [id]
  );
  return r.rows[0] || null;
}

async function canPlayFull(userId) {
  if (!userId) return false;
  const u = await getUserById(userId);
  if (!u || bool(u.is_blocked)) return false;
  return bool(u.has_subscription) || bool(u.is_admin);
}

function setAuthCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

module.exports = {
  signToken,
  authMiddleware,
  requireAuth,
  requireAdmin,
  getUserById,
  canPlayFull,
  setAuthCookie,
  PREVIEW_SECONDS,
  JWT_SECRET,
};
