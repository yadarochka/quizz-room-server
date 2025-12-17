const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

function setAuthCookie(res, token) {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction,
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

function clearAuthCookie(res) {
  res.clearCookie('token');
}

function extractUserFromToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

function getUserFromCookieHeader(cookieHeader) {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';').map(p => p.trim());
  const tokenPart = parts.find(p => p.startsWith('token='));
  if (!tokenPart) return null;
  const token = tokenPart.substring('token='.length);
  return extractUserFromToken(token);
}

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies.token;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function optional(req, res, next) {
  const token = req.cookies && req.cookies.token;
  if (!token) {
    return next();
  }
  const payload = extractUserFromToken(token);
  if (payload) {
    req.user = payload;
  }
  next();
}

module.exports = {
  authMiddleware: {
    requireAuth,
    optional
  },
  getUserFromCookieHeader,
  signToken,
  setAuthCookie,
  clearAuthCookie
};


