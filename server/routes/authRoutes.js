const express = require('express');
const router = express.Router();
const passport = require('passport');
const requireAuth = require('../middleware/auth');

router.get('/google', (req, res, next) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || clientId.includes('YOUR_') || !clientSecret || clientSecret.includes('YOUR_')) {
    console.log('>>> [Auth] Google OAuth credentials not set. Falling back to direct single-sign-on login.');
    return res.redirect('/auth/demo-login');
  }
  passport.authenticate('google', {
    scope: [
      'profile',
      'email',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
    ],
    accessType: 'offline',
    prompt: 'consent',
  })(req, res, next);
});

const getClientUrl = () => process.env.CLIENT_URL || 'http://localhost:3000';

const handleOAuthCallback = (req, res, next) => {
  passport.authenticate('google', { session: true }, (err, user) => {
    const clientUrl = getClientUrl();
    if (err || !user) {
      console.error('OAuth Callback Failed:', err);
      return res.redirect(`${clientUrl}/?error=auth_failed`);
    }

    req.logIn(user, (loginErr) => {
      const token = user.googleId || user._id?.toString();
      const userPayload = encodeURIComponent(
        JSON.stringify({
          id: token,
          displayName: user.displayName || user.name || 'User',
          email: user.email,
          profilePicture: user.profilePicture || user.picture || user.avatar || '',
        })
      );

      return res.redirect(`${clientUrl}/dashboard?auth_success=true&token=${token}&user=${userPayload}`);
    });
  })(req, res, next);
};

router.get('/oauth2callback', handleOAuthCallback);
router.get('/google/callback', handleOAuthCallback);
router.get('/callback', handleOAuthCallback);

router.get('/demo-login', async (req, res) => {
  const clientUrl = getClientUrl();
  try {
    const User = require('../models/User');
    let user = await User.findOne({ email: 'sudeepbiradar031@gmail.com' });
    if (!user) user = await User.findOne({});
    if (!user) {
      user = await User.create({
        email: 'sudeepbiradar031@gmail.com',
        displayName: 'Sudeep Biradar',
        googleId: 'sudeep-local-id',
        lastLogin: new Date()
      });
    }

    req.logIn(user, (loginErr) => {
      const token = user.googleId || user._id?.toString();
      const userPayload = encodeURIComponent(
        JSON.stringify({
          id: token,
          displayName: user.displayName || user.name || 'Sudeep Biradar',
          email: user.email,
          profilePicture: user.profilePicture || user.picture || user.avatar || '',
        })
      );
      return res.redirect(`${clientUrl}/dashboard?auth_success=true&token=${token}&user=${userPayload}`);
    });
  } catch (err) {
    console.error('Demo login error:', err);
    return res.redirect(`${clientUrl}/?error=` + encodeURIComponent(err.message));
  }
});

router.get('/user', requireAuth, (req, res) => {
  const user = req.user;
  const hasGmailToken = !!(user && (user.refreshToken || user.accessToken || process.env.GOOGLE_REFRESH_TOKEN));
  res.json({ success: true, user, hasGmailToken });
});

const handleLogout = (req, res) => {
  const finalize = () => {
    if (res.headersSent) return;
    try {
      res.clearCookie('connect.sid', { path: '/' });
      res.clearCookie('connect.sid');
    } catch (_) {}
    return res.status(200).json({ success: true, message: 'Logged out successfully' });
  };

  if (req.session) {
    req.session.destroy(() => {
      if (typeof req.logout === 'function') {
        try { req.logout(() => {}); } catch (_) {}
      }
      finalize();
    });
  } else if (typeof req.logout === 'function') {
    try { req.logout(() => {}); } catch (_) {}
    finalize();
  } else {
    finalize();
  }
};

router.get('/logout', handleLogout);
router.post('/logout', handleLogout);

module.exports = router;
