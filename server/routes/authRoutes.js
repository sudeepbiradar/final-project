const express = require('express');
const router = express.Router();
const passport = require('passport');
const requireAuth = require('../middleware/auth');

router.get('/google', (req, res, next) => {
  const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
  if (!clientId || clientId.includes('YOUR_') || !clientSecret || clientSecret.includes('YOUR_')) {
    console.log('>>> [Auth] Google OAuth credentials not set. Falling back to direct single-sign-on login.');
    return res.redirect('/auth/demo-login');
  }
  console.log(`>>> [Auth] Initiating Google OAuth authentication...`);
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

const getClientUrl = () => {
  let raw = (process.env.CLIENT_URL || '').trim().replace(/['"]/g, '');
  if (!raw) {
    raw = process.env.NODE_ENV === 'production'
      ? 'https://livemail-frontend.onrender.com'
      : 'http://localhost:3000';
  }
  return raw.replace(/\/+$/, '');
};

const handleOAuthCallback = (req, res, next) => {
  passport.authenticate('google', { session: true }, (err, user) => {
    const baseUrl = getClientUrl();
    if (err || !user) {
      console.error('>>> [OAuth Callback Error]:', err?.message || err);
      const target = `${baseUrl}/?error=auth_failed`;
      return res.redirect(target);
    }

    req.logIn(user, (loginErr) => {
      if (loginErr) {
        console.error('>>> [Login Session Error]:', loginErr.message);
        return res.redirect(`${baseUrl}/?error=session_error`);
      }

      const token = user.googleId || String(user._id || 'user-id');
      const safeUser = {
        id: token,
        displayName: user.displayName || user.name || 'User',
        email: user.email || '',
        profilePicture: user.profilePicture || ''
      };

      const userJson = JSON.stringify(safeUser);
      const userPayload = encodeURIComponent(userJson);
      const targetUrl = `${baseUrl}/dashboard?auth_success=true&token=${encodeURIComponent(token)}&user=${userPayload}`;

      console.log(`>>> [OAuth Callback Success] Redirecting user ${user.email} to: ${baseUrl}/dashboard`);
      
      // Dual-channel redirect: 302 Header + HTML meta refresh backup
      res.setHeader('Location', targetUrl);
      return res.status(302).send(`<!DOCTYPE html>
<html>
  <head>
    <meta http-equiv="refresh" content="0;url=${targetUrl}">
    <script>window.location.href = "${targetUrl}";</script>
  </head>
  <body>
    <p>Redirecting to dashboard... <a href="${targetUrl}">Click here if not redirected</a>.</p>
  </body>
</html>`);
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
