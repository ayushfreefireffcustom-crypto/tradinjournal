# Passkeys and biometric unlock (H14 research), 2 Nov 2026

What it would take to let people sign in with Face ID / Touch ID / Windows Hello / an Android fingerprint, and to lock the installed app behind the same check. Nothing here is built yet; the PWA install part of H14 is.

## What passkeys are

A passkey is a WebAuthn credential: a key pair made on the user's device, with the private key kept by the platform (iCloud Keychain, Google Password Manager, Windows Hello, a hardware key). Signing in means the browser asks the device to sign a challenge; the device asks for the face, fingerprint or device PIN first. The server only stores the public key, so a database leak gives an attacker nothing to replay, and a passkey can't be phished because it's bound to our domain.

Every current browser supports them (Safari, Chrome, Edge, Firefox; iOS 16+, Android 9+, Windows 10+, macOS 13+). Apple and Google sync them across a person's devices.

## Three uses for TRADElogs

1. **Passwordless sign-in.** "Sign in with a passkey" on the login page. Faster than password + two-factor and stronger than both. It would sit next to email/password and Google, not replace them.
2. **Step-up for risky actions.** Before placing a live order, connecting exchange keys, turning off two-factor or deleting the account, ask for the passkey again ("confirm it's you"). This is the biggest win for a trading app: a stolen session cookie alone couldn't move money.
3. **App lock for the installed PWA.** After N minutes in the background, the installed app shows a lock screen that unlocks with the passkey (Face ID on a phone). This is a client-side gate on top of the session, the same idea as a banking app's lock.

## How it fits our stack

- **better-auth has a passkey plugin** (`@better-auth/passkey`, built on SimpleWebAuthn). It adds endpoints to register, list, rename and delete passkeys and to sign in with one, plus a client plugin. It stores one row per passkey (`passkey`: id, name, publicKey, userId, credentialID, counter, deviceType, backedUp, transports, createdAt, aaguid).
- **Relying party ID** must be `tradelogs.com`. The web app is on `www.tradelogs.com` and the API on `api.tradelogs.com`; a passkey made for `tradelogs.com` is valid on both subdomains. The plugin needs `rpID: 'tradelogs.com'` and `origin: 'https://www.tradelogs.com'` (plus the local and staging origins).
- **Two-factor interplay.** A passkey already proves possession and (with user verification) the person, so a passkey sign-in should skip the TOTP step. Password sign-ins keep asking for TOTP as today.
- **Step-up** would be a small API middleware: the risky routes require a passkey assertion made in the last 5 minutes (kept on the session), otherwise they return a "confirm with your passkey" error the web app handles by running the ceremony and retrying.
- **App lock** needs no server change beyond step-up: the installed app calls `navigator.credentials.get` with `userVerification: 'required'` and only hides the lock screen when it succeeds.

## Risks and how to handle them

| Risk | Handling |
|---|---|
| Lost device, no synced passkey | Passkeys never become the only way in: email/password (+ two-factor and backup codes) stays |
| People confused by passkeys vs passwords | Offer it after sign-in ("Sign in faster next time?"), with one sentence on what it is |
| Shared family devices | Passkeys are per OS account; the lock screen still protects the app |
| Domain mistakes lock people out | Pin `rpID` to the apex domain from day one; test www, api, staging and localhost before launch |
| WebAuthn in in-app browsers (Instagram, X) | Detect and fall back to password; ask people to open the page in Safari/Chrome |

## Recommendation and plan

Build it in this order, each step shippable on its own:

1. **Passkey sign-in and management** (Settings › Security: add, rename, remove; login page: "Sign in with a passkey"). Plugin + one additive migration (`passkey` table). About 2 days with tests.
2. **Step-up on live orders, exchange connect, two-factor off and account deletion.** About 2 days.
3. **App lock for the installed app** (off by default, choose 1/5/15 minutes). About 1 day.

Testing needs real authenticators: Chrome's DevTools WebAuthn panel (virtual authenticators) covers the automated tests; a final pass on an iPhone (Face ID), a Mac (Touch ID), Windows Hello and an Android phone.

## What shipped for H14

- The web app is installable: a manifest (name, icons including a maskable one, standalone display, shortcuts to Dashboard, Positions and the coach), Apple touch icon and web-app metadata.
- The service worker now also shows an offline page when the installed app has no connection (pages always come from the network first; API calls are never cached), and push notifications finally have an icon (the old `/icon.png` didn't exist).
- Settings has an **Install TRADElogs** card: the browser's install button where it's offered, Add to Home Screen steps on iPhone, and the menu path elsewhere.
