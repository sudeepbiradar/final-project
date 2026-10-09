const mongoose = require('mongoose');

const requireAuth = async (req, res, next) => {
  // 1. Session-based auth (Passport sets req.user via deserializeUser)
  if (req.user && req.user.email) return next();

  // 2. Token-based auth (Bearer token from Authorization header)
  const authHeader = req.headers.authorization;
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  if (token && token !== 'undefined' && token !== 'null') {
    // Check in-memory active token cache first (fastest path)
    if (global.activeTokens && global.activeTokens.has(token)) {
      req.user = global.activeTokens.get(token);
      return next();
    }

    try {
      const User = require('../models/User');
      let dbUser = null;

      // Try by ObjectId
      if (mongoose.Types.ObjectId.isValid(token) && token.length === 24) {
        dbUser = await User.findById(token).catch(() => null);
      }
      // Try by googleId
      if (!dbUser) {
        dbUser = await User.findOne({ googleId: token }).catch(() => null);
      }
      // Try by email
      if (!dbUser && token.includes('@')) {
        dbUser = await User.findOne({ email: token.toLowerCase().trim() }).catch(() => null);
      }

      if (dbUser) {
        req.user = dbUser;
        return next();
      }
    } catch (e) {
      console.error('[Auth] DB lookup error:', e.message);
    }
  }

  return res.status(401).json({ success: false, message: 'Unauthorized: Session missing' });
};

module.exports = requireAuth;
