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

**Three pages, one Vite MPA.**
- `index.html` → `src/main.js` (landing).
- `admin/index.html` → `src/admin.js`: full-width layout, sidebar navigation (Đăng ký, Sinh viên, Lớp), and a `createPageHeader` (breadcrumb, title from `data-title`, `[data-meta]` summary, `[data-actions]` buttons) on every section; registration list; and `src/scripts/admin-schedule.js` for students (Sheet import in a dialog, class assignment and class filter tabs) and the Lớp overview (one card per class: head count by term, the 6 sessions, a button that opens the student list filtered to that class).
- `lich/index.html` → `src/schedule.js` (student schedule registration).

`vite.config.js` sets `appType: "mpa"` (unknown paths 404 instead of falling back to the landing page) and a small middleware that redirects `/admin` and `/lich` to the trailing-slash path in dev and preview, matching the static host.

**Init order.** `src/main.js` runs modules in a fixed order: glass patches → `initLang()` → `initScheduleCta()` → reveal → showcase.

**i18n (`src/scripts/i18n.js`).** One `I18N = { vi, en }` dictionary; other modules add their own keys with `Object.assign(I18N.vi, {...})` (see `schedule-cta.js`). Markup uses `data-i18n` (text), `data-i18n-html` (HTML) and `data-i18n-ph` (placeholder); `applyLang()` fills them and dispatches a `langchange` window event that modules listen to for re-rendering dynamic text. `LANG` is an exported `let` live binding, reassigned only inside i18n.js. `src/scripts/course.js` holds program facts and `CLASSES` (the two classes and their fixed sessions); `null` renders as "Sẽ cập nhật" (to be updated), and values can be strings or `{ vi, en }`.

**Components (`src/components/`).** Reusable UI, each a `.js` + `.css` pair; pages import the CSS from their stylesheet (`index.css`, `admin.css`; `/lich` reuses `admin.css`). New reusable UI goes here, not in `src/lib` (pure logic) or `src/scripts` (page wiring).
- `sidebar.js`: `createSidebar({ items: [{ id, label, panel, icon }], label })` shows one panel at a time, keeps the current item in `#id`, and exposes `setBadge(id, text)` and `select(id)`. Vertical on desktop, a sticky horizontal strip under 900px. Place it and the panels inside `.sb-layout`.
- `dialog.js` + `dialog.css`: the `.modal` frame for every `<dialog>`, `confirmDialog({ title, message, confirmLabel, danger })` (returns a Promise<boolean>, replaces `confirm()`), and `wireDialog(dlg)` to close on `[data-close]` or a backdrop click.
- `page-header.js`: `createPageHeader({ crumbs, title, meta, actions })`; moves the existing `meta`/`actions` elements in, so their ids and listeners keep working.
- `clawd-walker.js`: `createClawdWalker()` returns `{ show(url), hide() }`; a fixed link with the Claude Code pixel crab holding the Zalo app icon that crawls along the viewport edges with its legs on the edge (the body rotates per edge, the icon counter-rotates to stay upright) (speech bubble on screens ≥700px, pauses on hover/focus, parks in a corner under reduced motion). `/lich` shows it only when the student's class has a Zalo link.
- `dropdown.js`: see below.

**Shared dropdown (`src/components/dropdown.js` + `dropdown.css`).** `enhanceSelects()` turns every `<select>` into an accessible custom listbox; `createDropdown({ options, value, label, placeholder, onChange, size: "sm" })` builds one in JS and returns the wrapper (`.select` is the native select). The native select stays the source of truth: its `value` setter and `focus()` are patched, so code reads/writes `select.value` and calls `select.focus()` normally. `data-placeholder` hides the `value=""` option. The listbox is attached only while open, to `<body>` or to an open `<dialog>` that contains the select (a modal dialog sits in the top layer), so re-rendered tables leave nothing behind.

**Landing CTA (`src/scripts/schedule-cta.js`). Registration is closed;** the public form was removed (git history has it). The `#dang-ky` block and the header/hero buttons (`a[data-signin]`) are links to `/lich/`. Once the lazy Firebase chunk has loaded (preloaded on idle), clicking opens the Google popup on the landing page itself and then navigates to `/lich/`, which checks the email against `students` and shows the student's schedule. The popup must open inside the click, so if the chunk is not loaded yet the link just navigates and the student signs in on `/lich`. A popup error other than the user closing it also falls back to `/lich`.

**Data layer (`src/lib/firebase.js`).** Registrations live at `registrations/{email}` (lowercased email as the doc id, written by the old public form). Google sign-in (`signInWithGoogle`, `onUserChange`) is used by the landing CTA, `/lich` and the admin page. `watchRegistrations` drives the admin table in realtime; the admin page adds search, a major filter and CSV export (BOM, formula-injection guard). Older documents at `registrations/{uid}` from the earlier Google sign-in flow carry `uid`, `studentId` and `updatedAt`.

**Schedule (`/lich`).** Students sign in with Google.
- Only emails present in `students/{email}` get in (the admin pastes the list from a Sheet).
- On first sign-in (no `infoConfirmedAt`), `/lich` shows a "Kiểm tra thông tin" form: the student reviews and fixes name, MSSV, major and term, and saving stamps `infoConfirmedAt`. A "Sửa thông tin" button on the main view reopens it. The rules let a student update only those keys on their own doc and validate each changed key (`changedOk`). Admin writes use `set` with merge so they keep `infoConfirmedAt` and `classId`. `MAJORS` lives in `src/lib/majors.js`.
- Two parallel classes in week 13, fixed in `CLASSES` in `src/scripts/course.js` (`modern`, `harness`; each has name, short name and 6 sessions with date, hours, room, topic; source: the organisers' Excel schedule, not in the repo). A student's class is `students/{email}.classId`, written only by admins (the student update rule rejects other keys). `/lich` shows that class's sessions, or "Bạn chưa được xếp lớp" when `classId` is missing; it never guesses a class.
- The Sinh viên tab has full CRUD: add/edit in a form dialog (email is the doc id, so it is read-only when editing; the form also sets the class), delete through `confirmDialog`, which also removes the student's `availability`. **Chia lớp tự động** (`planSplit`) re-splits everyone evenly per term: students grouped by term (descending, no term last), sorted by name, then alternated between the classes; terms 8 and 9 (`LEAN_MODERN_TERMS`) start with `modern`, so an odd group gives Modern AI the extra student; other terms start with whichever class is smaller (ties go to `modern`). It overwrites manual choices after a confirm that shows counts per class and per term. Tabs above the table (Tất cả / each class / Chưa xếp lớp, with counts) filter by class; ticking rows offers bulk delete and bulk "Chuyển sang" a class. A term dropdown filters the table, and row checkboxes plus a "select all visible" header box drive a bulk delete bar. **Xuất Excel** builds one .xlsx in the browser (`src/lib/xlsx.js`, no dependency: inline strings, store-only zip) with a Tổng sinh viên sheet, one sheet per class and one attendance sheet per session of each class (named with the class short name, since both classes share dates); `classSheets(id)` builds one class's sheets and `exportClass(id)` downloads them alone as `Danh sách lớp <name> - AI Thực Chiến FA26 (<dd-mm-yyyy>).xlsx` (button on each Lớp card, and `#stuClassXlsx` follows the selected class tab). `downloadXlsx(name, sheets)` uses `name` as the file name. The Sinh viên tab has no CSV export any more. Each sheet is `{ name, title, info: [[label, value]], columns: [{ label, width?, center? }], rows }`: a title row, merged "label: value" info rows, then a bordered table whose column widths come from the table only.
- Zalo group links: `schedule/config.zalo = { modern, harness }`, edited per class card in the Lớp tab (merge write, `https:` only through `safeUrl` in `src/lib/schedule.js`). `/lich` reads `schedule/config` (rules allow listed students) and, live via `watchDocument`, shows the walking Clawd (`src/components/clawd-walker.js`, the only Zalo entry point there) only when the student's class has a link.
- The old shift flow (`schedule/config` status, `schedule/classes`, `availability/{email}`) has no UI any more; its data and rules are still in Firestore, and deleting a student also deletes their `availability`. `src/lib/schedule.js` holds `SID_RE`, `cleanSid` and `safeUrl`.

**Local testing against emulators:** in dev, `?emu` on any page connects auth (9099) and Firestore (8181) emulators; the build drops this.

**Security lives in `firestore.rules`, not the client.**
- Anyone may create `registrations/{id}` when `id == email`, the email is lowercase and shaped like an address, and the field set is exactly `name, email, major, term, pledge, lang, createdAt` plus an optional `studentId` matching `[A-Z]{2}[0-9]{6}` (optional only so pages opened before the field existed can still submit; the form always sends it). Only admins may read, list or delete.
- Value rules: `major` is in `SE|AI|IA|IS|OTHER`, `term` is a string `"1"`–`"9"`, `pledge == true`, and `createdAt == request.time`.
- Emails are not verified and the open create path can be scripted; App Check would be the next step if spam shows up.
- The rules still accept the old signed-in `registrations/{uid}` writes so pages opened before the switch keep working; that path can be removed later.
- Changing a form field or a major code means updating the client validation, `src/admin.js` (`MAJORS`) and the rules together.
- The admin email list is duplicated in `src/lib/admins.js` (UI gate) and `firestore.rules` (the real protection) and must stay in sync.

**Firebase Console setup the CLI can't do:** the admin page signs in with Google, so keep the Google provider enabled and each serving domain listed under Authentication → Settings → Authorized domains.

**External assets:** three.js r128 (cdnjs) and `@real-human/liquid-glass` 1.2.0 (jsdelivr) are loaded from CDNs in `index.html`, not npm.
