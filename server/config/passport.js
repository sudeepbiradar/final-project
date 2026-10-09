require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
require('dotenv').config();
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const mongoose = require('mongoose');

global.activeTokens = global.activeTokens || new Map();

passport.serializeUser((user, done) => {
  done(null, String(user._id || user.googleId || user.email));
});

passport.deserializeUser(async (id, done) => {
  try {
    let user = null;
    const User = require('../models/User');
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      user = await User.findById(id).catch(() => null);
    }
    if (!user) {
      user = await User.findOne({ $or: [{ googleId: id }, { email: id }] }).catch(() => null);
    }
    if (!user && global.activeTokens && global.activeTokens.has(id)) {
      user = global.activeTokens.get(id);
    }
    done(null, user || { _id: id, googleId: id });
  } catch (err) {
    done(null, { _id: id, googleId: id });
  }
});

const isProd = process.env.NODE_ENV === 'production';
const defaultCallback = isProd
  ? 'https://livemail-backend.onrender.com/api/auth/google/callback'
  : 'http://localhost:5000/oauth2callback';

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_REDIRECT_URI || process.env.GOOGLE_CALLBACK_URL || defaultCallback,
    },
    async (accessToken, refreshToken, profile, done) => {
      const email = (profile.emails?.[0]?.value || 'user@example.com').toLowerCase().trim();
      const displayName = profile.displayName || profile.name?.givenName || 'User';
      const profilePicture = profile.photos?.[0]?.value || '';

      try {
        const User = require('../models/User');
        const existingUser = await User.findOne({
          $or: [{ googleId: profile.id }, { email }]
        }).catch(() => null);

        const effectiveRefreshToken = refreshToken || existingUser?.refreshToken || process.env.GOOGLE_REFRESH_TOKEN || '';

        const userPayload = {
          googleId: profile.id,
          displayName,
          email,
          profilePicture,
          accessToken,
          ...(effectiveRefreshToken ? { refreshToken: effectiveRefreshToken } : {}),
          lastLogin: new Date()
        };

        const user = await User.findOneAndUpdate(
          { $or: [{ googleId: profile.id }, { email }] },
          { $set: userPayload },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        const finalUser = user ? user.toObject() : userPayload;
        global.activeTokens.set(profile.id, finalUser);
        global.activeTokens.set(email, finalUser);
        if (finalUser._id) {
          global.activeTokens.set(String(finalUser._id), finalUser);
        }

        try {
          const { clearAuthFailureFlag } = require('../services/gmailService');
          clearAuthFailureFlag(email);
        } catch (_) {}

        console.log(`✓ [Auth] Google user authenticated & persisted to DB: ${email}`);
        return done(null, finalUser);
      } catch (err) {
        console.warn('User DB save error, using in-memory fallback:', err.message);
        const userPayload = {
          googleId: profile.id,
          displayName,
          email,
          profilePicture,
          accessToken,
          ...(refreshToken ? { refreshToken } : (process.env.GOOGLE_REFRESH_TOKEN ? { refreshToken: process.env.GOOGLE_REFRESH_TOKEN } : {}))
        };
        global.activeTokens.set(profile.id, userPayload);
        global.activeTokens.set(email, userPayload);
        return done(null, userPayload);
      }
    }
  )
);

module.exports = passport;
