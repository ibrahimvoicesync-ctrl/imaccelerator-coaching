# Content: Auth Surfaces

`/login`, `/register`, `/register/[code]`, `/no-access`. These are the **only** pages
reachable without a session, and the only ones screenshottable without OAuth — which
makes them the practical test bed for visual iteration.

Google OAuth only. **No password flows exist anywhere in the product** — never design a
password field, "forgot password" link, or email/password form.

## Login — `/login`

One centred, stacked column on a full-page warm beige `bg-ima-sidebar` background
(2026-10-10): the card animation (`sm+` only; two gently floating,
`aria-hidden` example cards: Today's Work and emails sent), then sign-in below.
No headline over the cards. A separator sits between the cards and the Google button:
the house eyebrow (`Invite only`, 11px uppercase, 0.08em) between two
`bg-ima-sidebar-border` rules. Phones
skip the cards and the separator.

| Slot | Copy |
|---|---|
| Mark | `/ima-logo.png` masked in `ima-primary`, 150 × 31, pinned top-left in a header |
| Heading | `Sign in` — sm+: a white chip top-right (key icon in a blue-tint tile, 15px title, 12px line), vertically centred with the logo; phones: above the button, 32px |
| Lede | `Use the Google account your invite was sent to.` |
| CTA | `Continue with Google` (loading: spinner + `Opening Google…`) |
| Footnote | `No invite yet? Ask your coach.` |

Errors (`ERROR_MESSAGES`, keyed off the `error` search param):

| Key | Message |
|---|---|
| `auth_failed` | `Something went wrong. Try again.` |
| `already_registered` | `You already have an account. Sign in instead.` |

Rendered in a `role="alert"` block: `border-ima-error/30 bg-ima-error/10
text-ima-error`.

### Structure notes

- Entrances are **CSS** (`animate-riseIn` / `fadeIn`, staggered 40–360ms), never
  JS-initial `opacity: 0`.
- The CTA follows Google's standard layout: white `rounded-[14px]` button
  (`min-h-[54px]`), mark pinned 18px from the left, label centred, hairline border and
  soft lift on hover, `active:scale-[0.98]` on press. Not primary blue.

## Register — `/register` and `/register/[code]`

Invite-only. Codes expire in **72 h**; invites match by email
(`AUTH_CONFIG.matchInviteByEmail`).

`MagicLinkCard.tsx` and `RegisterCard.tsx` both carry the masked logo lockup.

Copy must make three things unambiguous:
1. Registration requires an invite — there is no open signup
2. The code expires
3. Sign-in is Google-only

## No Access — `/no-access`

Where `AUTH_CONFIG.noAccessRedirect` sends an authenticated user with no valid invite.

The tone rule matters most here: this person is not a bad actor, they're someone whose
invite didn't match. State the situation and give a route forward (contact
`support@imaccelerator.com`, per `APP_CONFIG.supportEmail`). Do not scold, and do not
use error-red styling for what is a normal outcome.

## Shared rules

- No sidebar — `(auth)` has its own layout.
- The logo is the hero. It is the only place in the product where the mark gets
  ~46–60px of height.
- The Basmala and any Arabic text must **never** receive negative tracking.
- Every auth page must be usable at 320px width.
