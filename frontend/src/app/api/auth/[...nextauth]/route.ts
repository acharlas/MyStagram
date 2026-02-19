import type { NextAuthOptions } from "next-auth";
import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import {
  authorizeWithCredentials,
  fetchUserProfile,
  loginWithCredentials,
  loginWithCredentialsWithClientKey,
  type AuthorizedUser,
} from "@/lib/auth/backend-auth";
import {
  buildRateLimitClientKeyFromIdentifier,
} from "@/lib/auth/rate-limit-client";
import {
  clearRefreshCoordinatorStateForTests,
  getRecentRefreshResultCapacityForTests as getRefreshCoordinatorCapacityForTests,
  getRecentRefreshResultsSizeForTests as getRefreshCoordinatorRecentSizeForTests,
  getRecentRefreshResultTtlMsForTests as getRefreshCoordinatorTtlMsForTests,
  refreshTokensWithCoordinator,
} from "@/lib/auth/refresh-coordinator";
import {
  applyAuthorizedUserToJwt,
  ensureFreshAccessToken,
} from "@/lib/auth/jwt-lifecycle";

const API_BASE_URL = process.env.BACKEND_API_URL ?? "http://backend:8000";

export {
  authorizeWithCredentials,
  fetchUserProfile,
  loginWithCredentials,
  loginWithCredentialsWithClientKey,
};
export type { AuthorizedUser };

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const identifier =
          typeof credentials?.username === "string"
            ? credentials.username
            : null;
        const rateLimitClientKey =
          buildRateLimitClientKeyFromIdentifier(identifier);
        return authorizeWithCredentials(
          credentials ?? {},
          undefined,
          rateLimitClientKey,
        );
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        return applyAuthorizedUserToJwt(token, user as AuthorizedUser);
      }

      return ensureFreshAccessToken(token, {
        refreshTokens: (refreshToken) =>
          refreshTokensWithCoordinator(refreshToken, {
            apiBaseUrl: API_BASE_URL,
          }),
        logger: console,
      });
    },
    async session({ session, token }) {
      session.user = {
        id: typeof token.userId === "string" ? token.userId : "",
        username: typeof token.username === "string" ? token.username : "",
        avatarUrl:
          typeof token.avatarUrl === "string" || token.avatarUrl === null
            ? token.avatarUrl
            : null,
      };
      session.error = typeof token.error === "string" ? token.error : undefined;
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};

export const __internal = {
  clearRecentRefreshResultsForTests() {
    clearRefreshCoordinatorStateForTests();
  },
  getRecentRefreshResultsSizeForTests() {
    return getRefreshCoordinatorRecentSizeForTests();
  },
  getRecentRefreshResultTtlMsForTests() {
    return getRefreshCoordinatorTtlMsForTests();
  },
  getRecentRefreshResultCapacityForTests() {
    return getRefreshCoordinatorCapacityForTests();
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
