# Legal Hub — CBT for the UNEC 030 Law Class

A computer-based testing and revision platform. Vanilla ES modules, no build
step; data is local-first (browser storage) with optional Firestore sync.

## Run locally

```bash
npm run serve        # http://localhost:8080
npm test             # unit tests for the question-selection engine
```

Any static file server works — the app is plain HTML/CSS/JS.

## How sessions work

1. Students choose **Practice**, **Exam** or **Flashcards** from a course.
2. A two-step dialog asks for the **topic** (or the full course) and the
   **number of questions**.
3. `js/questionBank.js` draws that many questions **at random**, preferring
   questions the student has **not seen before** (tracked per student and
   course in `js/seenStore.js`). When a topic is exhausted the cycle restarts.
   Duplicate imports are removed automatically.
4. Each question's **options are shuffled**; the correct answer is stored as
   text, so it is always preserved regardless of position.
5. Exams are timed (30 minutes, `EXAM_DURATION_SECONDS` in `js/exam.js`),
   survive a page reload, and are saved to the student's results with
   corrections and explanations. Practice is untimed with instant feedback.

## Administration

Open the lock icon on the sign-in screen. The admin password is defined as
`ADMIN_PASSCODE` in `js/admin.js`. The console manages courses, topics,
questions (manual entry or PDF/TXT/JSON import — see the in-app format guide)
and the class list.

## Appearance

Background wallpapers live in `assets/wallpapers/` and are registered in
`js/theme.js`. Students can switch backgrounds from the top bar; the choice is
remembered per browser.

## Project layout

```
index.html           markup (no inline styling)
css/styles.css       design system: Playfair Display / Inter / JetBrains Mono
js/main.js           boot sequence
js/nav.js            view switching, course guard
js/sessionSetup.js   topic → question-count wizard
js/exam.js           exam & practice engine
js/questionBank.js   pure selection logic (tested)
js/seenStore.js      per-student "already seen" memory
js/dataLayer.js      local storage + optional Firestore sync
js/admin.js          admin console
tests/               node --test suites
```
