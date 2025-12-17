const passport = require('passport');
const YandexStrategy = require('passport-yandex').Strategy;
const { getDb, get, run } = require('./database');

const YANDEX_CLIENT_ID = process.env.YANDEX_CLIENT_ID;
const YANDEX_CLIENT_SECRET = process.env.YANDEX_CLIENT_SECRET;
const YANDEX_CALLBACK_URL = process.env.YANDEX_CALLBACK_URL;

if (!YANDEX_CLIENT_ID || !YANDEX_CLIENT_SECRET || !YANDEX_CALLBACK_URL) {
  // eslint-disable-next-line no-console
  console.warn('Yandex OAuth environment variables are not fully set.');
}

passport.use(
  new YandexStrategy(
    {
      clientID: YANDEX_CLIENT_ID || 'missing',
      clientSecret: YANDEX_CLIENT_SECRET || 'missing',
      callbackURL: YANDEX_CALLBACK_URL || '/auth/yandex/callback'
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const db = getDb();
        const existingUser = await get(
          db,
          'SELECT * FROM users WHERE provider = ? AND provider_id = ?',
          ['yandex', profile.id]
        );

        if (existingUser) {
          // Update user data if it changed (name, email, avatar)
          const email =
            (profile.emails && profile.emails[0] && profile.emails[0].value) ||
            (profile._json && profile._json.default_email) ||
            null;
          const name =
            profile.displayName ||
            (profile.username ? profile.username : null) ||
            'Unknown';
          const avatar =
            (profile.photos && profile.photos[0] && profile.photos[0].value) ||
            (profile._json && profile._json.default_avatar_id
              ? `https://avatars.yandex.net/get-yapic/${profile._json.default_avatar_id}/islands-200`
              : null);

          // Only update if data changed
          if (
            existingUser.name !== name ||
            existingUser.email !== email ||
            existingUser.avatar_url !== avatar
          ) {
            await run(
              db,
              'UPDATE users SET name = ?, email = ?, avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
              [name, email, avatar, existingUser.id]
            );
            // Fetch updated user
            const updatedUser = await get(db, 'SELECT * FROM users WHERE id = ?', [existingUser.id]);
            return done(null, updatedUser);
          }

          return done(null, existingUser);
        }

        const email =
          (profile.emails && profile.emails[0] && profile.emails[0].value) ||
          (profile._json && profile._json.default_email) ||
          null;
        const name =
          profile.displayName ||
          (profile.username ? profile.username : null) ||
          'Unknown';
        const avatar =
          (profile.photos && profile.photos[0] && profile.photos[0].value) ||
          (profile._json && profile._json.default_avatar_id
            ? `https://avatars.yandex.net/get-yapic/${profile._json.default_avatar_id}/islands-200`
            : null);

        const result = await run(
          db,
          'INSERT INTO users (provider, provider_id, email, name, avatar_url) VALUES (?, ?, ?, ?, ?)',
          ['yandex', profile.id, email, name, avatar]
        );

        const user = await get(db, 'SELECT * FROM users WHERE id = ?', [result.lastID]);
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

module.exports = passport;


