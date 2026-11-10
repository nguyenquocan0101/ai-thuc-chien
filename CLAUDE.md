# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Landing page and registration admin for the FPT University program "AI-Augmented Software Engineering" (FA26). Plain JavaScript (ES modules, no framework) built with Vite; registrations are written straight from the browser to Firestore. UI copy, code comments and README are in Vietnamese — keep new copy and comments consistent with that.

## Commands

```bash
npm install
npm run dev            # Vite dev server (landing at /, admin at /admin/)
npm run build          # outputs dist/
npm run preview        # serve the build
npm run deploy:rules   # deploy firestore.rules to project ai-thuc-chien-fa26 (needs firebase login)
```

There is no test suite, linter or type checker. Verify changes with `npm run build` plus a browser check of the affected flow (desktop and ~390px mobile).

**Deploying:** Vercel is connected to the GitHub repo; pushing to `main` deploys (`vercel.json`: framework vite, output `dist/`, `cleanUrls`). Live at https://aithucchien.learnharness.org. Firestore rules are not deployed by Vercel — run `npm run deploy:rules` after changing `firestore.rules`.

## Architecture

**Two pages, one Vite MPA.** `index.html` → `src/main.js` (landing) and `admin/index.html` → `src/admin.js` (registration list). `vite.config.js` sets `appType: "mpa"` (unknown paths 404 instead of falling back to the landing page) and a small middleware that redirects `/admin` → `/admin/` in dev and preview, matching the static host.

**Init order matters.** `src/main.js` runs modules in a fixed order: glass patches → `initLang()` → `initRegistration()` → `enhanceSelects()` → reveal → showcase. `initRegistration()` must populate `<select>` options before `enhanceSelects()` wraps them.

**i18n (`src/scripts/i18n.js`).** One `I18N = { vi, en }` dictionary; other modules add their own keys with `Object.assign(I18N.vi, {...})` (see `registration.js`). Markup uses `data-i18n` (text), `data-i18n-html` (HTML) and `data-i18n-ph` (placeholder); `applyLang()` fills them and dispatches a `langchange` window event that modules listen to for re-rendering dynamic text. `LANG` is an exported `let` live binding, reassigned only inside i18n.js. `src/scripts/course.js` holds program facts; `null` renders as "Sẽ cập nhật" (to be updated), and values can be strings or `{ vi, en }`.

**Shared dropdown (`src/lib/select-menu.js` + `select-menu.css`).** `enhanceSelects()` turns every `<select>` into an accessible custom listbox. The native select stays the source of truth: its `value` setter and `focus()` are patched, so code reads/writes `select.value` and calls `select.focus()` normally. `data-placeholder` hides the `value=""` option. The listbox is portalled to `<body>`, or into an open `<dialog>` that contains the select (a modal dialog sits in the top layer).

**Registration flow (`src/scripts/registration.js`).**
- No sign-in. The `#regCta` block holds three stacked "folds": the pitch (perks + "Join now" `#gBtn`), the form `#regForm` and the success panel `#done`. Clicking `#gBtn` or any `a[href="#dang-ky"]` (header, hero) scrolls to the block, folds the pitch away and unfolds the form.
- Folds animate `grid-template-rows` 1fr ↔ 0fr, so height follows the real content. A closed fold is `inert`; `.is-settled` drops `overflow: hidden` once a fold has finished opening so focus rings are not clipped. Reduced motion skips the transitions.
- Fields: email, full name, student ID (MSSV), major, term, the commitment checkbox. Email is trimmed and lowercased; the student ID has spaces removed and is uppercased, then must match two letters and six digits (`SE123456`).
- The Firebase SDK is a lazy chunk (`import("../lib/firebase.js")`) preloaded on idle.
- With `firebaseConfig = null` in `src/lib/firebase-config.js`, submitting skips saving and shows a preview note. When testing with Playwright, intercept `**/src/lib/firebase-config.js*` and return `export const firebaseConfig = null;` instead of editing the file (dev server only; the build inlines the config).

**Data layer (`src/lib/firebase.js`).** `submitRegistration` writes `registrations/{email}` (lowercased email as the doc id) with `setDoc` and `createdAt: serverTimestamp()`. The same email twice is an update, which the rules deny with `permission-denied`; the client shows that as "already registered". Google sign-in (`signInWithGoogle`, `onUserChange`) is only used by the admin page. `watchRegistrations` drives the admin table in realtime; the admin page adds search, a major filter and CSV export (BOM, formula-injection guard). Older documents at `registrations/{uid}` from the earlier Google sign-in flow carry `uid`, `studentId` and `updatedAt`.

**Security lives in `firestore.rules`, not the client.**
- Anyone may create `registrations/{id}` when `id == email`, the email is lowercase and shaped like an address, and the field set is exactly `name, email, major, term, pledge, lang, createdAt` plus an optional `studentId` matching `[A-Z]{2}[0-9]{6}` (optional only so pages opened before the field existed can still submit; the form always sends it). Only admins may read, list or delete.
- Value rules: `major` is in `SE|AI|IA|IS|OTHER`, `term` is a string `"1"`–`"9"`, `pledge == true`, and `createdAt == request.time`.
- Emails are not verified and the open create path can be scripted; App Check would be the next step if spam shows up.
- The rules still accept the old signed-in `registrations/{uid}` writes so pages opened before the switch keep working; that path can be removed later.
- Changing a form field or a major code means updating the client validation, `src/admin.js` (`MAJORS`) and the rules together.
- The admin email list is duplicated in `src/lib/admins.js` (UI gate) and `firestore.rules` (the real protection) and must stay in sync.

**Firebase Console setup the CLI can't do:** the admin page signs in with Google, so keep the Google provider enabled and each serving domain listed under Authentication → Settings → Authorized domains.

**External assets:** three.js r128 (cdnjs) and `@real-human/liquid-glass` 1.2.0 (jsdelivr) are loaded from CDNs in `index.html`, not npm.
