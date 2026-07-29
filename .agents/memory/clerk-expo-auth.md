---
name: Clerk Expo Auth (v4 / Core v3)
description: How Clerk auth is wired in the mobile app — provider setup, token transport, custom screens, and known gotchas.
---

# Clerk Expo Auth — SplitEasy

## Setup
- `@clerk/expo` 4.1.0 (Core v3 Future API) installed in `artifacts/mobile`.
- `@clerk/express` 2.x + `http-proxy-middleware` installed in `artifacts/api-server`.
- Clerk tenant provisioned via `setupClerkWhitelabelAuth()`. Keys auto-set: `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`.
- Mobile workflow dev script exposes key as `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=$CLERK_PUBLISHABLE_KEY`.

## Mobile provider tree
`app/_layout.tsx` wraps everything in `<ClerkProvider publishableKey={EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache} proxyUrl={EXPO_PUBLIC_CLERK_PROXY_URL}>`.
`setBaseUrl(https://${EXPO_PUBLIC_DOMAIN})` is called at module level.

## Auth token transport (mobile-only)
`components/AuthBridge.tsx` calls `setAuthTokenGetter(() => getToken())` from `useAuth()`. This wires every generated API client request with `Authorization: Bearer <token>`. **Never add this to web apps** — they use cookies.

## Custom auth screens
`app/index.tsx` — branded combined sign-in / sign-up screen using Core v3 Future APIs:
- Email/password: `useSignIn()` → `signIn.password()` → `signIn.finalize()`, with `needs_client_trust` (email code) and `needs_second_factor` MFA branches.
- Sign-up: `useSignUp()` → `signUp.password()` → `signUp.verifications.sendEmailCode()` → `signUp.verifications.verifyEmailCode()` → `signUp.finalize()`.
- Google SSO: `useSSO()` → `startSSOFlow({ strategy:'oauth_google', redirectUrl: AuthSession.makeRedirectUri() })` → `setActive({ session: createdSessionId })`.
- Google disabled on web (no `expo-auth-session` browser support).

## Express proxy
`artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts` — proxy path `CLERK_PROXY_PATH = '/api/__clerk'`. Must be mounted **before** body parsers. `clerkMiddleware` resolves `publishableKey` from host via `publishableKeyFromHost`.

**Why:** Clerk's native SDK talks to `clerk.example.com`; the proxy rewrites to `api-server/__clerk` so the mobile app only needs one server hostname.

## JIT user provisioning
`artifacts/api-server/src/lib/auth.ts` — `requireAuth` middleware calls `clerkClient.users.getUser(clerkUserId)` on first request, upserts into `users` table. `req.localUser` is then available on all protected routes.
