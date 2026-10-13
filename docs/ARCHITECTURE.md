# Architecture plan

Status: approved direction, 2026-10-13. Implementation has not started yet.
The assessment brief is the source of truth; `docs/PROJECT.md` is the living
project record. This file captures the Phase 1 repository analysis, the
proposed architecture, and the decisions taken on it.

## 1. Repository findings (Launchbase baseline)

- `api/`: FastAPI root app with two mounted sub-apps, `/app` (customer) and
  `/internal` (platform staff), each with its own OpenAPI document. Operation
  IDs are endpoint function names, which keeps generated hooks readable.
- Auth: Argon2 passwords. JWTs carry an audience (`app` / `internal`) and are
  stored in separate httponly cookies (`access_token`,
  `internal_access_token`). The user is loaded from the DB on every request.
  The internal surface requires `users.is_admin` at login and per request.
- Models: typed SQLAlchemy 2.0, `IdMixin` (UUID) + `TimestampMixin`; lazy
  loads are turned into `raise_on_sql` globally. No model enums.
- Services hold the session and only `flush()`; routers `commit()`. Errors use
  `APIException` in FastAPI's 422 shape. Lists return
  `{items, total, limit, offset}`. `requests.org` documents the API.
- Migrations: `uv run alembic revision --autogenerate`; the only allowed
  manual edit is `server_default`. Tests use `Base.metadata.create_all` on a
  testcontainers Postgres 16, so a separate migration check is needed.
- Frontends (`app/`, `internal/`): TanStack Start SPA mode, Orval-generated
  react-query hooks and zod schemas (`npm run generate`, API must run on
  :8000), react-hook-form. `site/`: SSG landing page, no API client.

Pre-existing gaps to fix first:

1. `users.is_active` is not checked at login or per request (both surfaces);
   an existing test asserts inactive users get 200.
2. `User.is_active` defaults to `False`; signup must set it explicitly.
3. The internal sub-app allows CORS from every frontend origin; restrict it
   to the internal console origin.

## 2. Decisions

| ID | Decision |
| --- | --- |
| D1 | Keep the `users.is_admin` column (platform staff). Separate it from the org `admin` role through naming (`CurrentPlatformStaff`, `OrgRole` constants) and a test. |
| D2 | No hard delete of users in the internal panel; deactivate/reactivate instead. Staff accounts are created only via `manage.py create-user --admin`. |
| D3 | A member's plan is approved only by a lead of a team the author belongs to. A team lead's own plan may be approved by another lead of a shared team or by an org owner/admin. Nobody approves their own plan. No extra roles. |
| D4 | Minimal timeboxing: per-task hour budget, weekly capacity, deterministic over-capacity warning, estimates fed to the AI scope check. |
| D5 | One optional extra: Option B "look back before planning", only after required work is solid. |
| D6 | Drafts are private to the author; others see only "not submitted". After submission the content is visible to the author's possible approvers (D3). |
| D7 | Product name: pending user choice. Per the PDF (p.1), the name and SVG logo are settled before implementation so the brand is in the code from the first commit. |
| D8 | Model `gemini-3.5-flash-lite` (named by the PDF, p.6) via `AI_MODEL` setting; confirm it responds during the AI phase. |
| D9 | Develop inside WSL 2 (Ubuntu), repository in the WSL filesystem. |
| D10 | Commit locally in small logical steps; never push (origin is the upstream template). |

## 3. Data model

```
users (existing)            is_active enforced everywhere; is_admin = platform staff
organizations               id, name, suspended_at?, suspended_reason?, timestamps
organization_memberships    organization_id, user_id, role ('owner'|'admin'|'member') + CHECK,
                            UNIQUE(organization_id, user_id)
organization_invites        organization_id, email, role ('admin'|'member'), token_hash (sha256, unique),
                            created_by_id, expires_at, accepted_at?, accepted_by_id?, revoked_at?
teams                       organization_id, name, description?, lead_user_id?,
                            UNIQUE(organization_id, name), UNIQUE(organization_id, id)
team_memberships            organization_id, team_id, user_id, UNIQUE(team_id, user_id)
                            FK (organization_id, team_id) -> teams(organization_id, id) CASCADE
                            FK (organization_id, user_id) -> organization_memberships(...) CASCADE
weekly_plans                organization_id, user_id, week_start DATE (CHECK Monday),
                            status ('draft'|'submitted'|'approved'|'done') + CHECK,
                            capacity_hours?, submitted_at?, approved_at?, approved_by_id?,
                            completed_at?, main_goal_shipped?, outcome_note?,
                            ai_review JSONB?, ai_reviewed_at?, ai_review_plan_hash?,
                            UNIQUE(organization_id, user_id, week_start), INDEX(organization_id, week_start)
plan_tasks                  plan_id CASCADE, kind ('main'|'sub_goal'|'gtm'), title, why? (main only),
                            estimate_hours?, position, is_done, done_at?,
                            partial UNIQUE(plan_id) WHERE kind = 'main'
plan_reviews                plan_id, reviewer_id, action ('approved'|'changes_requested'), comment, created_at
ai_usage_events             organization_id, user_id?, operation ('plan_review'|'plan_draft'|'plan_lookback'),
                            outcome ('succeeded'|'failed'|'rate_limited'), error_kind?, model,
                            latency_ms, input_tokens?, output_tokens?, created_at
                            INDEX(organization_id, created_at), INDEX(user_id, created_at), INDEX(created_at)
```

Tenancy rules:

- Every tenant route is under `/app/organizations/{org_id}/...`. An
  `OrgContext` dependency resolves the caller's membership: non-member -> 404
  (no existence leak), suspended org -> 403 `ORGANIZATION_SUSPENDED`.
- Services require `org_id` and always filter by it; foreign IDs look missing.
- Composite FKs make cross-org team membership impossible at the DB level.
- Plans belong to the organization and user (not a team) and outlive
  membership so history stays intact. Week = Monday date sent by the client,
  validated server-side.
- "Send back" returns the plan to `draft` with a `changes_requested` review.

## 4. Plan workflow

| Transition | Who | Rule |
| --- | --- | --- |
| create draft | author | allowed weeks: previous, current, next Monday |
| edit tasks | author | draft only |
| draft -> submitted | author | exactly one main task with title and "why" |
| submitted -> draft (withdraw) | author | |
| submitted -> approved | approver per D3 | never self |
| submitted -> draft (request changes) | approver per D3 | comment required |
| tick task done/undone | author | approved only |
| approved -> done | author | `main_goal_shipped` required, optional note |

## 5. Authorization matrix (within one org)

| Action | Owner | Org admin | Member | Team lead | Platform staff |
| --- | --- | --- | --- | --- | --- |
| View org, member names/roles | yes | yes | yes | yes | metadata via /internal |
| Rename org | yes | yes | no | no | no |
| Invites | any role | member/admin | no | no | no |
| Change role / remove member | yes (not last owner) | members only | no | no | no |
| Manage teams, team members, lead | yes | yes | no | no | no |
| Own plan: create/edit/submit/track/close | yes | yes | yes | yes | no |
| Read others' submitted plans | as approver of leads (D3) | as approver of leads (D3) | no | for members of led teams | no |
| Read others' drafts | no | no | no | status only | no |
| Approve / send back | leads' plans only (D3) | leads' plans only (D3) | no | members of led teams, never self | no |
| Team-week view and history | yes (status, D6 applies) | yes (status, D6 applies) | no | led teams | no |
| AI review (own draft), AI draft | yes | yes | yes | yes | no |
| Suspend org, deactivate user, AI usage | no | no | no | no | yes |

## 6. API resources

Customer (`/app`), in addition to `/auth`, `/logout`, `/users/self`:

```
POST   /signup
GET|POST /organizations
GET|PATCH /organizations/{org}
DELETE /organizations/{org}/membership                      leave
GET    /organizations/{org}/members      PATCH|DELETE .../members/{membership_id}
GET|POST /organizations/{org}/invites    DELETE .../invites/{invite_id}
GET    /invites/{token}                                     public preview
POST   /invites/{token}/accept                              email must match
GET|POST /organizations/{org}/teams      GET|PATCH|DELETE .../teams/{team}
PUT|DELETE /organizations/{org}/teams/{team}/members/{user_id}
GET    /organizations/{org}/teams/{team}/weeks/{monday}     team-week view
GET    /organizations/{org}/teams/{team}/weeks              history rollup
GET|POST /organizations/{org}/plans                         list mine / create draft
GET|PUT  /organizations/{org}/plans/{plan}                  PUT replaces draft tasks
PATCH  /organizations/{org}/plans/{plan}/tasks/{task}
POST   /organizations/{org}/plans/{plan}/submit|withdraw|approve|request-changes|complete
POST   /organizations/{org}/plans/{plan}/ai-review          -> PlanReview (stored)
POST   /organizations/{org}/ai/plan-drafts                  -> PlanDraft (never stored)
```

Internal (`/internal`):

```
GET  /users?q=   GET /users/{id} (+memberships)   PATCH /users/{id} {is_active}
GET  /organizations?q=&status=   GET /organizations/{id}   (metadata only)
POST /organizations/{id}/suspend {reason}   POST /organizations/{id}/reinstate
GET  /ai-usage/summary?days=   GET /ai-usage/events
```

Privacy decision: platform staff see operational metadata (counts, statuses,
timestamps, member names/emails/roles, team names) but never task text,
"why", lead comments, AI review content or brain dumps.

## 7. AI

- `app/ai/`: `pydantic-ai-slim[google]`, `GoogleModel` + `GoogleProvider`
  with the key passed from settings (`GOOGLE_API_KEY`, server-side only).
- Agents have typed `output_type` and no tools. Tasks are sent with short
  refs (`MAIN`, `SG1`, `GTM2`) and mapped back server-side; unknown refs are
  dropped.
- Output models: `ReviewFinding` (task_ref, issue, severity, problem, field,
  suggested_rewrite, suggested_task), `PlanReview` (verdict, summary,
  findings), `PlanDraft` (main_task with why, sub_goals, gtm_goals, left_out).
- The latest review is stored on the plan with a content hash (shown as stale
  after edits). Brain-dump drafts only pre-fill the form; the user saves.
- Failures: missing key 503, local or provider rate limit 429, provider error
  503, timeout 504, invalid output 502. Every call writes one
  `ai_usage_events` row (metadata only), committed even when the request fails.

## 8. Tests

- Factories and login helpers; a two-org tenancy suite covering every
  org-scoped route (outsider 404, wrong role 403).
- Route meta-test: every non-public route depends on `CurrentUser`; every
  `{org_id}` route depends on `OrgContext`.
- Workflow transitions, approver rules (D3), draft privacy (D6), suspension,
  deactivation, customer access to `/internal`.
- AI: `ALLOW_MODEL_REQUESTS = False`, `GOOGLE_API_KEY` blanked,
  `TestModel`/`FunctionModel` overrides; structured output, ref mapping,
  failures, usage logging, rate limits.
- Migration check: upgrade a fresh DB, then autogenerate must be empty.

## 9. Implementation order

0. Brand (PDF p.1): name, one-line pitch, SVG logo checked at 16/32px and
   large on light and dark; swap Launchbase's `<title>`, favicon and header
   in `app/`, `internal/` (marked internal) and `site/`.
1. Auth hardening (`is_active`), signup.
2. Tenancy core: orgs, memberships, invites, teams, `OrgContext`, tests.
3. Plans, tasks, workflow, reviews, team-week and history APIs, tests.
4. AI: review, draft, failure mapping, usage logging, rate limits, tests.
5. Internal API: suspension, user search/deactivation, AI usage, tests.
6. Seed command (`manage.py seed-demo`).
7. Customer frontend.
8. Internal frontend.
9. Landing page (PDF p.7–8): hero, how it works, rendered AI review example,
   for teams, meta, Open Graph image.
10. At most one optional extra (PDF p.9): Option B, which covers carry-over;
    timeboxing (D4) only if core work is solid.
11. QA, `SUBMISSION.md`, packaging from a fresh `git archive`.
