import passport from "passport";
import {
  Strategy as GoogleStrategy,
  Profile as GoogleProfile,
  VerifyCallback,
} from "passport-google-oauth20";
import {
  Strategy as GitHubStrategy,
  Profile as GitHubProfile,
} from "passport-github2";
import { env } from "./env";
import { pool } from "./db";

/* ========================================
   GOOGLE STRATEGY
======================================== */

if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${env.BACKEND_URL}/api/auth/google/callback`,
      },
      async (
        _accessToken: string,
        _refreshToken: string,
        profile: GoogleProfile,
        done: VerifyCallback
      ) => {
        try {
          const email = profile.emails?.[0]?.value;

          if (!email) {
            return done(new Error("No email from Google"), false);
          }

          let user = await pool.query(
            "SELECT id, email FROM users WHERE email = $1",
            [email]
          );

          if (!user.rowCount) {
            const created = await pool.query(
              "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
              [email, "oauth_google"]
            );
            user = created;
          }

          return done(null, user.rows[0]);
        } catch (err) {
          return done(err as Error, false);
        }
      }
    )
  );
}

/* ========================================
   GITHUB STRATEGY
======================================== */

if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
  passport.use(
    new GitHubStrategy(
      {
        clientID: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        callbackURL: `${env.BACKEND_URL}/api/auth/github/callback`,
      },
      async (
        _accessToken: string,
        _refreshToken: string,
        profile: GitHubProfile,
        done: VerifyCallback
      ) => {
        try {
          const email =
            profile.emails?.[0]?.value ||
            `${profile.username}@github-oauth.local`;

          let user = await pool.query(
            "SELECT id, email FROM users WHERE email = $1",
            [email]
          );

          if (!user.rowCount) {
            const created = await pool.query(
              "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
              [email, "oauth_github"]
            );
            user = created;
          }

          return done(null, user.rows[0]);
        } catch (err) {
          return done(err as Error, false);
        }
      }
    )
  );
}

export default passport;
