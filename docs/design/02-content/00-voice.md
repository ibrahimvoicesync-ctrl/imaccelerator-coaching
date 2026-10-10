# Content: Voice & Copy Rules

The voice is **direct and specific, never hype.** It reflects the brand personality:
disciplined, trustworthy, understated.

## Principles

1. **State the fact, then the action.** "Reports from your students will appear here as
   soon as they log their day." Not "No reports found!"
2. **Second person for the student, third person for the managed.** A student reads
   "Here's how today is tracking." A coach reads "This student hasn't started their
   roadmap."
3. **No exclamation marks** except in the owner greeting, which is a deliberate warmth
   exception. No emoji anywhere in product copy.
4. **No urgency manufacturing.** No "Hurry", "Don't miss", "You're falling behind".
   At-risk signals are shown to *coaches* as facts, not to students as pressure.
5. **No congratulation inflation.** "Goal Reached" is the correct register. Not
   "Amazing work!" or "You crushed it!"
6. **Numbers carry the message.** The copy labels the number; the number is the point.
7. **Sentence case for copy, UPPERCASE only for eyebrow labels.** Never Title Case a
   sentence.

## Islamic register

The product sits between Ibadat and Dunya and must read as respectful and grounded.

- The login page no longer opens with the Basmala (removed 2026-10-10 on request).
- Dashboards greet with **"Assalamu3leikum, {firstName}."**
- This register is load-bearing brand, not decoration. Do not remove it in a
  "simplification" pass, and do not add more of it for flavour.
- ⚠️ **Never apply `tracking-tight` or any negative tracking to Arabic script** — it
  breaks connected letterforms. This affects the Basmala and `MotivationalCard`.

## Terminology

Use the product's own words consistently. These are the terms users learn:

| Term | Not |
|---|---|
| Work session | Pomodoro, focus block |
| Daily report | Check-in, journal, log |
| Roadmap / step / stage | Curriculum, module, lesson |
| Outreach | Prospecting, cold email |
| Deal | Sale, contract, conversion |
| Coach | Mentor, instructor |
| Referral link | Affiliate link |

`ROLE_LABELS` in `src/lib/config.ts` is authoritative for role names: Owner, Coach,
Student, Student DIY.

## Button labels

Verb-first, specific. "Add Deal", "Generate invite link", "Sign in with Google",
"Mark Step Complete".

Never "Submit", "OK", "Click here", or a bare "Continue" where a specific verb exists.

## The next-action CTA

The student dashboard computes a single `nextAction` and renders it as the page's
dominant button. Its label must name the *actual next thing*, not a generic
destination — that is the entire point of the element. Whatever logic determines it,
the label should read as an instruction a coach would give.

## Loading & disabled copy

Use the ellipsis character, not three periods: `"Signing in…"`, `"Loading analytics…"`.
