# Floppy: submission

**Less strain. More brain.**

## The name

- **Brand:** Floppy
- **One-line pitch:** Floppy gets every engineer on your team to commit to one
  thing they'll ship this week, reviewed before you approve it, so by Friday
  you know what actually shipped.
- **Why the name:** Floppy is named after the floppy disk: small, familiar, and
  it holds exactly one week of work. It's easy to say and to spell.
- **Logo:** `branding/floppy-mark.svg`. A document-shaped disk with a folded
  corner and a cut-out F. The F and the fold gap are holes, not white paint, so
  it works on light and dark backgrounds. It was checked at 16, 32, 64 and
  256 px, and it is the favicon in all three front ends.

## How to run it

Use Linux, macOS or WSL 2 (Ubuntu). You need Python 3.12 with uv, Node.js 24+,
Postgres 16, and Docker (the test suite starts its own Postgres). The
Launchbase READMEs in each folder still apply. Beyond those:

```bash
# API
cd api
cp .env.example .env      # set SECRET_KEY and SQLALCHEMY_DATABASE_URI for your Postgres
                          # GOOGLE_API_KEY is optional: without it the AI buttons are hidden
                          # and the AI endpoints answer 503; planning still works
uv sync
uv run alembic upgrade head
uv run manage.py seed-demo        # add --reset to rebuild the demo later
make run                          # http://localhost:8000

# Front ends, each in its own terminal
cd app && npm install && make run        # customer app   http://localhost:3001
cd internal && npm install && make run   # staff console  http://localhost:3002
cd site && npm install && make run       # landing page   http://localhost:3000
```

`tmuxp load .` from the repo root starts all four.

Tests: `cd api && uv run pytest`. It runs 70 tests with no Google key and no
network access to Google.

### Demo logins

Every demo account uses the password **`floppy-demo-1`**.

| Who | Email | Where |
| --- | --- | --- |
| Member (Payments team) | `marco@northwind.example` | app |
| Team lead (Payments) | `leila@northwind.example` | app |
| Org owner | `olivia@northwind.example` | app |
| Org admin (a customer role) | `arjun@northwind.example` | app |
| Owner of the second organization | `hana@harbor.example` | app |
| Platform staff | `staff@floppy.example` | internal console |

The demo has two organizations (Northwind Labs, Harbor Health), three teams
with leads, and someone in two teams (Tom). It covers five closed weeks with
some main goals shipped and some not. This week has plans that are approved,
waiting for approval, sent back, or not started.
It also has AI usage history for the staff view. More staff accounts:
`uv run manage.py create-user --admin ...`.

## Your hours

**[To fill in: the actual number of hours spent.]**

## Decisions worth knowing

- **Tenancy lives in the API.** Every `/organizations/{id}/...` route goes
  through one dependency that loads the caller's membership. Someone else's
  organization, team, plan or member id returns 404 (not found), never 403,
  so ids can't be probed. A test fails if a new org route skips that
  dependency. Team membership has a composite foreign key, so nobody can be
  added to another org's team, even by a bug.
- **Who approves what:** a lead of a team the author belongs to. A lead's own
  plan can be approved by another lead of a shared team, or by an org owner or
  admin. Nobody approves their own plan. You can't submit a plan nobody can
  approve; the app says so instead.
- **Drafts are private.** Others see only that a draft exists. Once submitted,
  a plan is visible to the people who can approve it.
- **Staff vs org admin.** `users.is_admin` is platform staff only. The code
  calls the customer role `OrgRole.ADMIN`, and the console labels people
  "Staff" or "Customer". Staff can't be created through sign-up or granted from
  the console, only with `manage.py create-user --admin`.
- **What staff see:** metadata only (counts, statuses, timestamps, names,
  emails, roles, team names). The console never shows task text, why, lead
  comments, AI reviews or brain dumps. Running the product doesn't need them,
  and leaving them out is a promise customers can believe.
- **The AI returns data, not prose.** Both agents use Pydantic models as
  `output_type`. Tasks go to the model with short labels (MAIN, SG1, GTM1),
  and the server maps findings back to real task ids, dropping any it doesn't
  recognise. The model never sees ids, names or emails. Findings appear next
  to their task with a one-click apply, and the brain-dump draft only fills
  the form.
- **The AI can fail.** No key, a timeout, a provider 429, a provider error or
  unusable output each become a plain-words message. Every call, including
  failures, is recorded against the organization for the staff usage view.
  There's also a per-user limit of 6 calls a minute.

## Optional extra: look back before planning

The plan reviewer has a tool, `previous_plans`, that returns the author's
two most recent earlier plans: each task, whether it got done, and whether
the main task shipped. The tool takes no arguments. The server fixes whose
plans and which organization, so the model can't ask for anyone else's. When
this week's plan repeats unfinished work, the review flags it as **carried
over** on that task and suggests a slice that can be finished this week. The
demo has a real case: Tom's main task didn't ship the last two weeks and is
back on this week's draft. Sign in as `tom@northwind.example` and run
**Review with AI**. Tests cover what the tool returns: only that author, only
the last two plans, and nothing when there is no history.

## What isn't done

- **Optional extras:** only "look back before planning" (above); the
  end-of-week summary and team digest weren't built.
- **Timeboxing is minimal:** per-task hour estimates, a total, and a warning
  above about 30 hours. There's no per-person capacity setting.
- **Team history uses today's members.** If someone moves teams, past weekly
  rollups move with them.
- **Only the latest AI review is kept per plan.** It's marked stale once the
  plan changes.
- **The AI rate limit is a database count per user per minute.** That's fine
  for one API process, but not a shared limiter.
- **Teams can't be renamed in the UI** (the API supports it).
- **No front-end unit tests.** The UI was checked with scripted browser runs
  (Playwright, outside this repo): sign-up, invite and join, the plan with AI
  draft and review, approve and send back, team week, a foreign org's URL,
  suspension, deactivation, and the landing page at phone width.
- **Seeded AI usage history is synthetic.**
- **Out of scope by the brief:** email, billing, SSO, notifications and
  deployment.

With another day I'd add per-person capacity, keep review history, and give
leads the team digest (what's at risk, who hasn't submitted).
