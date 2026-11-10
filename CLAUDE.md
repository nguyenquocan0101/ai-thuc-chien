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

**Shared dropdown (`src/lib/select-menu.js` + `select-menu.css`).** `enhanceSelects()` turns every `<select>` into an accessible custom listbox. The native select stays the source of truth: its `value` setter and `focus()` are patched, so code reads/writes `select.value` and calls `select.focus()` normally. `data-placeholder` hides the `value=""` option. The listbox is portalled to `<body>`, or into the open `<dialog>` that contains the select (a modal dialog sits in the top layer).

**Registration flow (`src/scripts/registration.js`).**
- The section on the page is just a call-to-action plus a "Join now" button (`#gBtn`) that starts Google sign-in. Every `a[href="#dang-ky"]` (header, hero) is intercepted to start the same flow.
- Google sign-in must open inside the click gesture, or popup blockers fire. The Firebase SDK is a lazy chunk (`import("../lib/firebase.js")`) preloaded on idle; the click path uses the cached module without awaiting first.
- Any Google account may register (no school-domain restriction). Admin accounts that sign in here are redirected to `/admin/`.
- After sign-in, the form opens in `<dialog id="regDlg">` (bottom sheet on mobile). For `@fpt.edu.vn` emails the student ID is suggested from the address (`annqse183962@fpt.edu.vn` → `SE183962`), and any existing registration is prefilled.
- Do not leave a transform/translate on the dialog after its open animation (use `animation-fill-mode: backwards`); a persistent transform makes the dialog the containing block for fixed-position children.
- With `firebaseConfig = null` in `src/lib/firebase-config.js`, the Google button opens a simulated account picker (`#gMock`) and nothing is saved. When testing with Playwright, intercept `**/src/lib/firebase-config.js*` and return `export const firebaseConfig = null;` instead of editing the file.

**Data layer (`src/lib/firebase.js`).** One document per student at `registrations/{uid}`. `saveRegistration` reads first, then `updateDoc` (keeps `createdAt`) or `setDoc` with `createdAt`; both set `updatedAt: serverTimestamp()`. `watchRegistrations` drives the admin table in realtime. The admin page adds search, a major filter and CSV export (BOM, formula-injection guard).

**Security lives in `firestore.rules`, not the client.**
- Rules require a verified email and exactly the field set `uid, name, email, studentId, major, term, pledge, lang, createdAt, updatedAt`.
- Value rules: `studentId` matches `[A-Z]{2}[0-9]{6}`, `major` is in `SE|AI|IA|IS|OTHER`, `term` is a string `"1"`–`"9"`, `pledge == true`, and the timestamps equal `request.time`.
- Changing a form field or a major code means updating the client validation, `src/admin.js` (`MAJORS`) and the rules together.
- The admin email list is duplicated in `src/lib/admins.js` (UI gate) and `firestore.rules` (the real protection) and must stay in sync.

**Firebase Console setup the CLI can't do:** enable the Google sign-in provider, and add each serving domain under Authentication → Settings → Authorized domains.

**External assets:** three.js r128 (cdnjs) and `@real-human/liquid-glass` 1.2.0 (jsdelivr) are loaded from CDNs in `index.html`, not npm.
