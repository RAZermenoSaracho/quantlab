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
import { ensureOauthUsername } from "../controllers/auth.controller";

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

          const user = await ensureOauthUsername(
            email,
            "oauth_google",
            profile.displayName || email.split("@")[0]
          );
          return done(null, user);
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

          const user = await ensureOauthUsername(
            email,
            "oauth_github",
            profile.username || profile.displayName || email.split("@")[0]
          );
          return done(null, user);
        } catch (err) {
          return done(err as Error, false);
        }
      }
    )
  );
}

export default passport;
