# Internship Assessment — Project Record

Last updated: 2026-10-13 (Asia/Colombo)

## 1. Purpose and source of truth

This is the living record for the internship assessment project: confirmed decisions, required scope, open questions, and delivery evidence. Update this file as decisions are made and implementation progresses.

**Source priority:** the uploaded assessment PDF is the authority for assessment requirements. Explicit user decisions govern product choices within that brief. Earlier assistant suggestions are ideas, not approved decisions or verified assessment requirements.

**Source availability:** the assessment PDF was not available in this workspace or in the attachments returned for the referenced conversation when this file was created. This initial record therefore preserves the user's supplied requirements without claiming PDF verification. Detailed acceptance criteria, exact versions, repository URL, and submission rules must be checked against the PDF once it is supplied. On 2026-10-13 the user supplied a detailed written brief, which is treated as the working source of truth until the PDF is available.

**Update 2026-10-13:** the user supplied the PDF, `se-intern-weekly-planner-assement.pdf` (Xaventra, ref SE-INT-04, 10 pages). It has been read and is now the authority. Page references below use the form "PDF p.N". Discrepancies with the earlier record are listed in section 4.

| Source | Status | Use |
| --- | --- | --- |
| Assessment PDF `se-intern-weekly-planner-assement.pdf` | Read 2026-10-13 (supplied in conversation; not stored in the repo) | Authoritative assessment requirements |
| Current user request, 2026-10-13 | Available | Product, tagline, starter repository, stack, and required scope listed below |
| Detailed written brief, 2026-10-13 | Available (in conversation) | Working source of truth for scope, phases, security, AI, and submission rules |
| Referenced conversation: ලේඛන විශ්ලේෂණය ಸಲાહೆ | Read; returned history has no attachments | Tagline confirmation, naming ideas, and provisional workflow context |
| Notion official product and help pages, checked 2026-10-13 | Available; linked in section 10 | Competitor capabilities and project comparison; not assessment requirements |
| Linear official documentation, checked 2026-10-13 | Available; linked in section 11 | Competitor capabilities and project comparison; not assessment requirements |
| Timeboxing references from Atlassian and Todoist, checked 2026-10-13 | Linked in section 12 | Method background; proposed product capabilities are recorded separately |

Conversation reference: `6acbbdb1-ba60-83ee-956f-4d7a8cebec41`.

Status vocabulary: **Confirmed** = explicit user decision; **Required — user-supplied** = stated in the current request, awaiting PDF cross-check; **Provisional** = prior discussion or proposed interpretation; **Open** = undecided or missing information. Unchecked boxes do not imply implementation has begun.

## 2. Confirmed product decisions

| Item | Decision | Status |
| --- | --- | --- |
| Product type | AI-assisted weekly planning SaaS | Confirmed |
| Target audience | Software/company teams | Confirmed |
| Tagline | **Less strain. More brain.** | Confirmed 2026-10-13; replaces "Your second brain"; preserve this exact wording |
| Product name | **Floppy** | Confirmed 2026-10-13; one-line pitch and why-the-name sentence still open |
| Logo | Orange (#FF5722) document-shaped disk with a folded corner and a cut-out F, from the user's design (2026-10-13); SVG in `branding/floppy-mark.svg` | Confirmed; checked at 16, 32, 64 and 256px on light and dark |
| Starter repository | **Launchbase**, used as the starter Git repository/monorepo | Required — user-supplied |
| Architecture | Data model, tenancy, permissions, workflow, API, AI design in `docs/ARCHITECTURE.md` | Confirmed 2026-10-13 (decisions D1–D10) |

Launchbase is the starter repository name; it is not the selected product name. The local clone's `origin` is `https://github.com/chamoda/launchbase`; work happens on branch `build/weekly-planning`, starting from commit `af4ad1f`. Work is committed locally and not pushed.

## 3. Required core stack

All entries below are **Required — user-supplied**. Preserve the versions supplied here until the assessment PDF is reviewed; record any discrepancy explicitly rather than silently substituting a version.

| Area | Technology / version |
| --- | --- |
| Backend API | FastAPI |
| ORM | Async SQLAlchemy |
| Database | PostgreSQL 16 |
| Database migrations | Alembic |
| Authentication | JWT |
| Python runtime and dependency tooling | Python 3.12 + uv |
| Frontend | TanStack Start |
| UI components | shadcn/ui |
| API client generation | Orval |
| JavaScript runtime | Node 24+ |
| Containers | Docker |
| AI framework | Pydantic AI |
| AI model | Gemini 3.5 Flash-Lite |

Open stack details: exact package versions, provider model identifier, and environment configuration. Launchbase already implements FastAPI, async SQLAlchemy, Alembic, JWT cookie auth with separate app/internal audiences, pytest with testcontainers, Orval clients, and the four frontends/backends described in `docs/ARCHITECTURE.md`. Pydantic AI is not yet installed; the latest `pydantic-ai-slim` on 2026-10-13 was 2.55.0. The model name above is preserved from the request; provider availability and identifier have not been independently checked.

## 4. Required scope and verification checklist

The areas below are verified against the PDF (2026-10-13). Estimated effort in the PDF is ~12 hours (PDF p.1).

| ID | Required area | Acceptance criteria from the PDF | Source |
| --- | --- | --- | --- |
| REQ-01 | Core product features | Email/password sign-up; create an org or join by copyable invite link (no email). Org roles owner/admin/member; owners and admins manage members and settings. Admins create teams, add members, set a lead; users can be in several teams. Plan per member per week keyed by Monday: one main task (with why it matters), a few sub-goals, go-to-market goals, each a separate task with its own status. Plan states draft → submitted → approved → done; lead approves or sends back with a comment; tasks ticked done during the week; member marks whether the main task shipped. Team-week view (submitted, approved, tasks done, shipped) and history of past weeks. Loading, empty and forbidden states; no dead buttons. | PDF p.4–5 |
| REQ-02 | Tenancy and security | No cross-org reads or writes; a member cannot act as an admin; a non-lead cannot approve. Enforced in the API; reviewers will send requests with other orgs' IDs. | PDF p.5 |
| REQ-03 | Internal admin panel | In `internal/` on `/internal`. Platform staff only via `is_admin`, created with `manage.py create-user --admin`, never by sign-up; customer owners/admins cannot reach it. Orgs: member, team, plan counts and last active; suspend/reinstate locks members out. Users: search, org memberships, deactivate. AI usage: calls per org, failures, rate-limited calls. Make `is_admin` vs org `admin` obvious in code. Deliberate, explainable call on whether staff see plan text. | PDF p.5 |
| REQ-04 | AI plan review | Pydantic AI + `gemini-3.5-flash-lite`. Before submitting, a structured review like a demanding lead: flags work-not-result tasks, main task without why, missing GTM goals, scope too big for a week. Each finding targets a specific task with a concrete suggested rewrite; UI shows findings beside tasks with one-click apply. Pydantic `output_type`, no JSON-in-prompt parsing. | PDF p.6–7 |
| REQ-05 | Brain-dump-to-draft | Messy notes → pre-filled plan form to edit before saving; output never goes straight into the database. | PDF p.6 |
| REQ-06 | Branding and landing page | Name and logo decided before code (PDF p.1). One-line pitch, short spellable name not an obvious existing product, a sentence on why. SVG logo used as favicon, app header, sign-in page and landing page; readable at 16px on light and dark. Brand replaces Launchbase in `<title>`, favicon, header, sign-in/sign-up, landing page and admin panel (marked internal); nothing user-facing says "Launchbase". Landing page: hero with name, logo, one line, Get started → sign-up in `app/`; how it works; a rendered AI review example; what leads get; responsive to phone, `<title>`, meta description, Open Graph image, no lorem ipsum or generic AI copy. | PDF p.1–3, 7–8 |
| REQ-07 | Seed data | `manage.py` command: at least two orgs, a few teams, members in every role, several weeks of plans, some shipped and some not. | PDF p.5 |
| REQ-08 | Testing | Tests are required (overrides template AGENTS.md). `uv run pytest` passes with no key and no network to Google, using `TestModel`/`FunctionModel`; covers agent code and tenancy rules, not only CRUD. AI key server-side via settings from `api/.env`, empty `GOOGLE_API_KEY=` in `api/.env.example`; works without AI (slow, down, 429) with plain-words UI messages and no per-keystroke calls; every AI call recorded against the org with success/failure. | PDF p.3, 7 |
| REQ-09 | Submission | Root `SUBMISSION.md`: how to run, seed command, demo logins (member, team lead, org owner, staff); brand name, pitch, why the name; honest hours; what isn't done. Commit, then `git archive --format=zip -o assessment.zip HEAD`; unzip into a fresh folder and verify it runs; upload `assessment.zip`. No deadline is stated in the PDF. | PDF p.9–10 |

Grading weights (PDF p.9): tenancy & access ★★★, AI integration ★★★, product & domain ★★, admin panel ★★, founder thinking ★★, code quality ★, judgement ★. Optional extras: pick at most one (end-of-week summary, look back before planning, or team digest), worth less than a solid core.

### Discrepancies between the PDF and the earlier record

| Item | Earlier record | PDF | Action |
| --- | --- | --- | --- |
| Branding order | D7: no branding work until a name is chosen; branding was step 9 | Name and logo come before any code so the brand runs through the code from the first commit (p.1) | Choose name and logo now, before implementation step 1; landing page content can still come later |
| CLAUDE.md | Not present | Recommends a one-line `CLAUDE.md` containing `@AGENTS.md`, and updating AGENTS.md files when the agent makes mistakes (p.8) | Add `CLAUDE.md` |
| Model ID | To verify (D8) | `gemini-3.5-flash-lite` is named explicitly (p.6) | ID confirmed by the brief; availability still checked during AI work |
| Timeboxing (D4) | Minimal timeboxing planned | Not mentioned | Optional; keep behind required work so it does not cost core scope (judgement criterion, p.9) |
| Reference features step | Carry-over and timeboxing listed alongside Option B | At most one optional extra | Carry-over overlaps Option B; treat them as one extra |
| Deadline | Unknown | Not stated; ~12 hours estimated effort | No change |

### Core workflow context — provisional

The earlier assistant described a weekly workflow in which a team member sets one meaningful outcome, receives AI feedback, obtains lead approval, and tracks whether the outcome ships by Friday. This is useful context but has not been verified against the assessment PDF. Do not treat Friday, a single outcome, specific role names, or any particular state machine as confirmed constraints yet.

The detailed written brief of 2026-10-13 specifies the workflow used for implementation: one main task per week plus sub-goals and go-to-market goals, plans keyed by Monday, states draft → submitted → approved → done, lead approval or send-back with a comment, and a recorded "main goal shipped" outcome. See `docs/ARCHITECTURE.md` section 4.

The earlier discussion also positioned the product around weekly planning and approval for software teams. It mentioned Notion, Linear, and spreadsheets as alternatives allegedly referenced by the brief. The written brief confirms the landing page must explain the product's value against Notion, Linear, spreadsheets, and generic project-management tools.

### Implementation tracking

- [x] Obtain and read the assessment PDF; add page references and precise acceptance criteria to REQ-01 through REQ-09. Evidence: section 4 table (2026-10-13).
- [x] Inspect Launchbase and record existing functionality and required changes. Evidence: `docs/ARCHITECTURE.md` section 1 (2026-10-13).
- [ ] Implement and verify the required weekly planning workflow.
- [x] Implement and verify tenant separation, authentication, and authorization. Evidence: section 7 (API; UI pending).
- [x] Implement and verify the internal admin panel. Evidence: section 7 (API tests; UI walk-through 2026-10-13).
- [ ] Implement and verify AI plan review.
- [ ] Implement and verify brain-dump-to-draft.
- [x] Finalize product name and implement branding and landing page. Evidence: section 5; `site/` landing page checked at 1280px and 390px (no horizontal overflow), title, meta description and Open Graph image (2026-10-13).
- [x] Add the required seed data and reproducible setup instructions. Evidence: `manage.py seed-demo`, `SUBMISSION.md`.
- [x] Complete the required tests and record results. Evidence: section 7.
- [ ] Prepare and verify every required submission artifact. `SUBMISSION.md` written; `git archive` zip verified from a fresh unzip and a fresh Postgres (2026-10-13). Pending: the author's real hours, then the final commit and archive.

## 5. Branding decisions and idea backlog

**Product name:** Floppy (user decision, 2026-10-13).

**Approved tagline:** Less strain. More brain. (user decision, 2026-10-13; replaces the earlier "Your second brain").

Logo: the user supplied a raster design on 2026-10-13; it was redrawn as SVG (`branding/floppy-mark.svg`, the F and fold gap are mask cut-outs so it works on dark backgrounds) and rendered at 16/32/64/256px on light and dark. **One-line pitch** (user choice, 2026-10-13): Floppy gets every engineer on your team to commit to one thing they'll ship this week, reviewed before you approve it, so by Friday you know what actually shipped.

**Why the name** (user choice, 2026-10-13): Floppy is named after the floppy disk: small, familiar, and it holds exactly one week of work. It's easy to say and to spell.

**Name check** (web search, 2026-10-13): no well-known team or weekly-planning product called Floppy turned up. The nearest match is FloppyData, an AI data-automation tool, which is in a different space. Domains and trademarks were not checked.

Names suggested in the referenced conversation: Weekmind, Planora, Shipmind, Focusly, Weekwise, Planflow, Taskmind, Mindweek, Flowweek, Syncmind, and Weekship. Earlier assistant preferences for Weekmind and Shipmind were recommendations only. Name availability, existing products, domains, and trademark conflicts have not been researched.

Shortlist presented on 2026-10-13 (assistant recommendations only): Weekmind (recommended), Shipmind, Weekmark, Keel, Oneship.

The earlier assistant attributed these naming criteria to the brief: short, easy to say, easy to spell, and not an obvious existing well-known product in the same space. The written brief of 2026-10-13 confirms those criteria.

Longer tagline variants suggested earlier were not selected. Keep the confirmed wording exactly as written above unless the user changes it.

## 6. Open decisions and missing information

| ID | Question / missing item | Status |
| --- | --- | --- |
| OPEN-01 | Accessible assessment PDF and its exact requirements | Resolved 2026-10-13: PDF read; criteria in section 4 |
| OPEN-02 | Final product name and logo | Resolved 2026-10-13: Floppy, tagline, pitch, name rationale, logo; name check done (section 5) |
| OPEN-03 | Launchbase repository URL and starting revision | Resolved: `github.com/chamoda/launchbase`, baseline `af4ad1f` |
| OPEN-04 | Exact tenant, team, membership, and permission model | Decided in `docs/ARCHITECTURE.md` (D1, D3, D6) |
| OPEN-05 | Weekly plan fields, lifecycle, approvals, and time rules | Decided in `docs/ARCHITECTURE.md` section 4 |
| OPEN-06 | Internal admin panel scope and access rules | Decided in `docs/ARCHITECTURE.md` (D2, privacy decision) |
| OPEN-07 | AI inputs, structured outputs, expected behavior, and provider configuration | Designed in `docs/ARCHITECTURE.md` section 7; model ID `gemini-3.5-flash-lite` named by PDF p.6 |
| OPEN-08 | Landing page and branding acceptance criteria | Specified by PDF p.1–3, 7–8; awaiting product name |
| OPEN-09 | Seed scenarios and test expectations | Specified by PDF p.5, 7; plan in `docs/ARCHITECTURE.md` |
| OPEN-10 | Deadline, submission channel, and deliverables | Deliverables and `git archive` upload per PDF p.9–10; no deadline stated |

## 7. Testing and submission evidence

No implementation, test execution, or submission is recorded yet. The following are tracking fields, not verified assessment mandates.

| Evidence | Current value |
| --- | --- |
| Project repository and branch | Local clone of `github.com/chamoda/launchbase`, branch `build/weekly-planning` (not pushed) |
| Setup / run instructions | Backend: `cd api && uv run alembic upgrade head`; `GOOGLE_API_KEY` in `api/.env` (optional; AI endpoints return 503 without it) |
| Environment variable documentation | Not recorded; document names and setup guidance, never actual secrets |
| Migration and seed instructions | Migration `e8260ca82850`; `uv run alembic check` reports no drift. Seed: `uv run manage.py seed-demo [--reset]`, every demo account gets `DEMO_PASSWORD` from `api/.env`, and the command prints one login per role |
| Test commands and results | Baseline before changes: `uv run pytest` 12 passed (2026-10-13). After auth hardening and sign-up: 26 passed, ruff and pyright clean (2026-10-13). After the backend (tenancy, plans, AI, internal API): `uv run pytest` 68 passed with no key and no network; ruff and pyright clean (2026-10-13). With the look-back extra: 70 passed (2026-10-13) |
| Tenant and permission checks | `tests/api/app/test_tenancy.py` (foreign ids 404 on every org route, route meta-test, suspension), `test_plans.py` (D3 approver rules, D6 draft privacy), internal tests (customers refused, staff can't grant staff). Re-checked on seeded data through a running API (2026-10-13). UI walk-through: member sees "team week is for leads", lead approves and sends back (draft then hidden), another org's owner gets "not a member" for a Northwind URL, invite link -> sign-up -> join. Staff console walk-through: an org owner can't sign in; org detail shows no plan text; suspending locks a signed-in member out and reinstating restores them; deactivating a user ends their open session |
| AI feature verification | Offline: `tests/api/app/test_ai.py` with TestModel/FunctionModel (ref mapping, staleness, 429/502/503/504, usage rows, local rate limit, nothing saved by drafts). Live: one review and one draft against `gemini-3.5-flash-lite` with the local key returned typed output (2026-10-13); instructions then tightened to use [placeholders] instead of invented details. Through the UI (Playwright, headless Chromium): brain dump -> draft -> AI review -> apply a suggestion -> submit, against the live model; reviewer told not to show internal task labels to people |
| Known limitations | None recorded yet |
| Deployment / demo link, if required | Production deployment is out of scope per the written brief |
| Final submission checklist and deadline | Checklist in the written brief; deadline unknown |

## 8. Decision and change log

| Date | Entry | Basis |
| --- | --- | --- |
| 2026-10-13 | Created this living project record | Current user request |
| 2026-10-13 | Recorded AI-assisted weekly planning SaaS for software/company teams | Explicit user specification |
| 2026-10-13 | Recorded “Your second brain” as the confirmed tagline; left product name open | User request and referenced conversation |
| 2026-10-13 | Recorded Launchbase, the supplied stack, and nine requirement areas | Explicit user specification; pending PDF verification |
| 2026-10-13 | Flagged the missing assessment PDF and separated provisional context from confirmed decisions | Source inspection |
| 2026-10-13 | Added Notion capabilities, a weekly planning example, and potential differentiation in section 10 | User request; official Notion documentation |
| 2026-10-13 | Added Linear capabilities, a weekly planning example, and potential differentiation in section 11 | User request; official Linear documentation |
| 2026-10-13 | Added timeboxing method, proposed capabilities, weekly workflow, and acceptance scenarios in section 12 | User requested documentation; implementation scope remains open |
| 2026-10-13 | Completed repository analysis; recorded architecture plan in `docs/ARCHITECTURE.md` | Phase 1 inspection |
| 2026-10-13 | D1: keep `users.is_admin` as the platform-staff flag; separate it from the org `admin` role by naming and tests | User decision |
| 2026-10-13 | D2: internal panel deactivates users instead of hard-deleting them | User decision |
| 2026-10-13 | D3: team leads approve members' plans; a lead's own plan is approved by another shared-team lead or an org owner/admin; no self-approval | User decision |
| 2026-10-13 | D4: minimal timeboxing (task hour budgets, capacity warning, AI feasibility input); see section 12 | User decision (resolves TB-OPEN-01) |
| 2026-10-13 | D5: optional extra is Option B, look back before planning, after required work | User decision |
| 2026-10-13 | D6: drafts private to the author; submitted plans visible to possible approvers | User decision |
| 2026-10-13 | D7: product name deferred; D8: verify model ID during AI work | User decision |
| 2026-10-13 | D9: develop in WSL 2 Ubuntu with the repository inside the WSL filesystem | User decision |
| 2026-10-13 | D10: commit locally in small steps; do not push | User decision |
| 2026-10-13 | Read the assessment PDF; replaced REQ-01–REQ-09 with its criteria and page references; logged discrepancies; moved name and logo ahead of implementation; added `CLAUDE.md` | PDF `se-intern-weekly-planner-assement.pdf` |
| 2026-10-13 | Product name Floppy and tagline "Less strain. More brain." | User decision |
| 2026-10-13 | Backend steps 1-6 done: sign-up, tenancy, teams, plans workflow, AI agents, internal API, seed command; team lead stored as `team_memberships.is_lead` | Implementation; see `docs/ARCHITECTURE.md` |
| 2026-10-13 | Logo adopted from the user's design and redrawn as SVG; customer app (step 7) built: sign-up, invites, organizations, my week with AI draft and review, approvals, teams and team week, history, settings | User decision; implementation |
| 2026-10-13 | Internal staff console (step 8): marked internal on every page, overview, organizations with suspend/reinstate, users with search, detail and deactivate/reactivate (no delete, no granting staff), AI usage by organization and by call | Implementation |
| 2026-10-13 | One-line pitch and name rationale chosen; web check found no well-known product called Floppy in team planning | User decision; web search |
| 2026-10-13 | Landing page (step 9): hero with tagline and pitch, why not Notion/Linear/spreadsheets, how a week works, a rendered AI review example, the lead's view, Open Graph image | Implementation |
| 2026-10-13 | QA and packaging (step 11): `SUBMISSION.md`; READMEs rebranded; sign-in labels tied to inputs; `git archive` zip (about 1 MB) unpacked into a fresh folder: no `.env`, `node_modules`, `.venv`, `dist` or API key inside; against a new Postgres 16 it migrated, `alembic check` was clean, seeded, passed 68 tests, served a lead login, and all three front ends validated and built | Verification |
| 2026-10-13 | Optional extra (D5, Option B): reviewer tool `previous_plans` returns the author's last two plans; new finding `carried_over`; seeded a slipping task for Tom; 70 tests; live check flagged Tom's third week. Prompt now shows estimates as "(estimated 16h)" because "[16h]" was copied into rewrites like a placeholder | Implementation; live verification |

## 9. Maintenance rules

1. Keep this file as the main project record; update existing sections rather than creating competing summaries.
2. When the PDF becomes available, record its filename and page references, replace unresolved requirement questions with exact criteria, and log discrepancies with the initial user-supplied summary.
3. Record user-approved decisions in section 2 or section 5 and add a dated entry to section 8. Preserve superseded decisions in the log when useful.
4. Keep suggestions separate from approved decisions. Do not select a name or invent assessment requirements by implication.
5. Track work using the stable REQ and OPEN identifiers. Add implementation links and evidence as work is completed.
6. Mark checklist items complete only when supported by implementation or verification evidence. Record test outcomes and limitations accurately.
7. Update the last-updated date with each substantive revision. Keep secrets and private access tokens out of this file.

## 10. Competitor reference — Notion capabilities

Research date: **2026-10-13**. This section describes Notion as an alternative for software/company teams. It does not add features to the assessment scope. Availability depends on the workspace plan, permissions, enabled connections, and usage limits.

### What teams can do with Notion

| Capability | Practical use for a software/company team | Official source |
| --- | --- | --- |
| Documents and shared knowledge | Keep project notes, specifications, and company knowledge alongside project and task records. | [Projects and tasks guide](https://www.notion.com/help/guides/getting-started-with-projects-and-tasks) |
| Structured databases | Store tasks or plans as pages with properties; use different views to organize the same information. This supports a custom planning workspace instead of a single fixed layout. | [Database introduction](https://www.notion.com/help/intro-to-databases) |
| Project and task tracking | Connect tasks to larger projects and organize work around project objectives. | [Projects and tasks guide](https://www.notion.com/help/guides/getting-started-with-projects-and-tasks) |
| Engineering workflows | Manage backlogs, sprints, bugs, and dependencies; use forms to collect requests. | [Notion Projects](https://www.notion.com/en-gb/product/projects) |
| Workflow automation | Configure database triggers and actions to reduce repetitive updates. An example use is reacting to a status change; the exact trigger/action combination must be checked during setup. | [Database automations](https://www.notion.com/help/database-automations) |
| AI drafting and information processing | Generate drafts, improve writing, populate database properties, and create research reports. These overlap with turning rough ideas into organized planning content. | [Notion AI](https://www.notion.com/product/ai) |
| AI search and meeting capture | Search workspace and connected-app information; transcribe meetings and summarize key points with AI Meeting Notes. | [Notion AI](https://www.notion.com/product/ai) |
| AI agents | Notion Agent can create/edit pages and databases. Custom Agents can run recurring work on triggers or schedules, including task routing and project updates. | [Notion AI](https://www.notion.com/product/ai) |
| Collaboration and permissions | Share with members, groups, teamspaces, or guests. Assign view, comment, edit, or full-access permissions; database content editing can be separated from structural changes. | [Sharing and permissions](https://www.notion.com/help/sharing-and-permissions) |
| Granular database access | On Business and Enterprise plans, database page-level rules can grant access based on person properties. This is relevant when team members should access only certain records. | [Sharing and permissions](https://www.notion.com/help/sharing-and-permissions) |
| Public publishing | Publish pages to the web for externally accessible information. This could support a simple public project page. | [Sharing and permissions](https://www.notion.com/help/sharing-and-permissions) |

Notion's AI product page states that core AI features are included in Business and Enterprise, with limited trials on other plans. Custom Agents use Notion credits. Do not assume every capability is included in a free workspace or quote a fixed cost without rechecking the plan. [Notion AI availability](https://www.notion.com/product/ai)

### Example: weekly planning in Notion

**Illustrative configuration, not a verified built-in assessment workflow:**

1. Create a weekly plans database with week, owner, team, intended outcome, reviewer, and status properties.
2. Connect each plan to task records and relevant specifications.
3. Create views for the current week, each team member, and plans awaiting review.
4. Use AI to turn rough notes into a draft and request feedback using a team-defined prompt.
5. Use comments and a review status to coordinate lead approval; configure applicable automation for updates.
6. Record completion and retrospective notes at the end of the week.

This example is an inference from Notion's documented building blocks. It has not been configured or tested. A status field alone does not establish an enforced approval process; permissions and transitions would need to be designed and verified.

### Implications for this project

**Analysis and proposed positioning — not confirmed product decisions:**

| Area | Comparison / opportunity |
| --- | --- |
| Weekly planning | Notion provides flexible building blocks. Our product could offer a ready-to-use weekly planning flow with fewer configuration steps. |
| Brain-dump-to-draft | Notion already supports AI drafting. Potential differentiation is producing the project's exact plan structure with validation and user review built into the flow. |
| AI plan review | AI alone is not a unique claim. Potential differentiation is consistent, actionable feedback against a defined weekly planning rubric, subject to the assessment requirements. |
| Approval | A dedicated application could make reviewer permissions and allowed state changes explicit and enforce them in the backend. Do not claim Notion cannot support approvals. |
| Team boundaries | Notion has granular sharing controls. Our SaaS still needs its own verified tenant isolation; Notion teamspaces are not an implementation specification for our tenancy model. |
| Product focus | Emphasize the quality and simplicity of the complete weekly workflow. Avoid competing on the number of generic documentation, database, or AI features. |

Working positioning hypothesis: **a focused weekly planning product that helps software teams turn rough ideas into reviewable plans and track delivery.** Validate this against the PDF and user decisions before using it as final landing-page copy. The approved tagline is now **“Less strain. More brain.”**

## 11. Competitor reference — Linear capabilities

Research date: **2026-10-13**. Linear is a relevant alternative for software teams organizing product and engineering work. This research does not expand assessment requirements or commit this project to a Linear integration. Features depend on the plan, permissions, configuration, and enabled integrations.

### What teams can do with Linear

| Capability | Practical use for a software/company team | Official source |
| --- | --- | --- |
| Issue tracking | Track bugs, features, follow-up tasks, and internal requests. Assign ownership, priority, labels, a project, and a cycle; discuss work in comments. | [Core concepts](https://linear.app/docs/conceptual-model) |
| Team workflows | Define ordered issue statuses per team and organize work in lists or boards. Teams own their workflow, triage process, and planning cadence. | [Core concepts](https://linear.app/docs/conceptual-model) |
| Projects and initiatives | Group related work into projects and connect projects to broader strategic initiatives, linking execution to larger organizational goals. | [Core concepts](https://linear.app/docs/conceptual-model) |
| Cycles | Plan work in recurring periods of 1–8 weeks, with configurable start days and optional cooldowns. A one-week cycle supports weekly planning; cycles are not tied to releases. | [Cycles](https://linear.app/docs/use-cycles) |
| Capacity and rollover | Estimate upcoming cycle capacity using recent completed cycles. Unfinished cycle issues generally roll into the next cycle, subject to documented status and cooldown exceptions. | [Cycles](https://linear.app/docs/use-cycles) |
| Intake and triage | Review incoming work before scheduling it. Triage rules can update properties such as team, assignee, project, status, labels, and priority; support integrations can connect customer reports to issues. | [Triage](https://linear.app/docs/triage) |
| AI-assisted triage | Triage Intelligence suggests teams, projects, assignees, and labels, and identifies possible duplicates or related issues. Suggestions can be reviewed or configured to apply automatically. | [Triage Intelligence](https://linear.app/docs/triage-intelligence) |
| Workspace AI assistant | Linear Agent answers workspace questions, creates or updates issues and projects, and summarizes ongoing work. Documented examples include identifying cycle rollover risks and drafting project documents. It operates within the requesting user's permissions. | [Linear Agent](https://linear.app/docs/linear-agent) |
| Coding delegation | Linear documents coding sessions that implement a well-scoped issue in a cloud environment and return a draft pull request for review. This is broader than planning assistance. | [Coding sessions](https://linear.app/docs/coding-sessions) |
| GitHub integration | Link pull requests and commits to issues, automate issue statuses, and synchronize GitHub issues and comments with Linear. Setup and capabilities depend on the GitHub environment. | [GitHub integration](https://linear.app/docs/github) |
| Progress reporting | Publish project and initiative updates with health indicators and narrative context. Configure recurring reminders and deliver updates to Slack. | [Initiative and project updates](https://linear.app/docs/initiative-and-project-updates) |
| Analytics | Analyze issue counts, estimated effort, cycle time, lead time, triage time, and issue age using filtered graphs and tables. | [Insights](https://linear.app/docs/insights) |
| Restricted team access | Private teams restrict visibility of their issues, with documented sharing exceptions and administrative access behavior. Shared projects need careful visibility configuration. | [Private teams](https://linear.app/docs/private-teams) |

The current documentation lists **Triage Intelligence**, **Insights**, and **private teams** as Business/Enterprise features. Check the relevant linked pages and current plan before adopting a capability; this record does not assume all features are free or available in every workspace. Sources: [Triage Intelligence](https://linear.app/docs/triage-intelligence), [Insights](https://linear.app/docs/insights), [Private teams](https://linear.app/docs/private-teams).

### Example: weekly planning in Linear

**Illustrative configuration based on documented capabilities; not configured or tested:**

1. Configure the team's cycles to last one week, using the team's preferred start day and timezone.
2. Review incoming requests in Triage, clarify scope, and assign owners and priorities.
3. Add selected issues to the upcoming cycle and connect them to the relevant projects.
4. Use capacity estimates as an input when deciding how much work to commit to.
5. Ask Linear Agent to summarize progress and possible rollover risks; have the team review its output.
6. Track execution through issue statuses and linked GitHub pull requests.
7. Record outcomes and risks in a project update, then review unfinished work and rollover at the cycle boundary.

This workflow is an inference from the cited features. It does not demonstrate a dedicated, enforced weekly-plan approval process matching this assessment. Confirm the assessment's plan structure and approval rules before comparing exact workflow coverage.

### Implications for this project

**Analysis and proposed positioning — not confirmed product decisions:**

| Area | Comparison / opportunity |
| --- | --- |
| Weekly cadence | Linear already supports one-week cycles. Weekly scheduling alone is not a defensible differentiator; evaluate the experience of creating and reviewing the plan itself. |
| AI planning | Linear already offers AI summaries, issue/project creation, and risk-oriented prompts. Differentiate through a clear assessment-specific plan structure and review rubric, if the PDF requires them. |
| Brain-dump-to-draft | Potential value is a guided transformation into an editable weekly plan with explicit validation. Do not claim Linear cannot turn natural-language ideas into structured work. |
| Approval and accountability | A focused application could make plan submission, lead review, requested changes, and approval easy to understand and enforce. Exact states remain pending the PDF. |
| Delivery evidence | Linear has strong issue-to-code connections. Treat it as a benchmark for traceability; a Linear or GitHub integration is not automatically part of this assessment. |
| Tenancy and administration | Private teams illustrate access control within a workspace. Our SaaS must independently implement and verify the required tenant boundaries and internal admin permissions. |
| Adoption | A narrower workflow may reduce setup for teams seeking only weekly planning. This is a hypothesis to validate with users, not a proven advantage over Linear. |

Comparison takeaway for future branding: Notion offers configurable documents and databases, while Linear supplies established engineering planning and delivery workflows. Our proposed value should be demonstrated through the complete **draft → review → approved plan → delivery tracking** experience, with final behavior determined by the assessment PDF. Avoid unsupported claims that competitors lack AI, weekly planning, or access controls.

## 12. Timeboxing — features and capabilities

Added: **2026-10-13**. The user requested that timeboxing be documented. This section describes the method and proposes ways it could support the product. On 2026-10-13 the user approved a minimal subset (D4): TB-01 as per-task hour budgets, TB-03 as a weekly capacity warning, and TB-09 as an input to the AI scope review. The other capabilities remain unapproved. Timeboxing here refers to the planning method, not a particular vendor's application.

### Method and purpose

Timeboxing sets a maximum amount of time for an activity. For example, a developer might spend 45 minutes investigating a bug, then review findings and decide the next step. The time limit does not guarantee the entire bug will be fixed. Atlassian describes timeboxing in sprint planning as setting a maximum time for the planning activity. [Atlassian: Sprint planning](https://www.atlassian.com/agile/scrum/sprint-planning)

Time blocking reserves a calendar period for work; timeboxing emphasizes the time limit and what to achieve within it. They can be used together: reserve 09:00–09:45, define an investigation goal, and review the result when the period ends. [Todoist: Time blocking and related methods](https://www.todoist.com/productivity-methods/time-blocking)

For this product, the proposed value is connecting weekly outcomes to realistic work sessions, exposing overcommitment, and helping users learn from estimates. These are design goals, not measured productivity claims.

### Proposed capability catalog

Priorities below were suggestions for later scope selection. Status reflects decision D4.

| ID | Capability | Proposed behavior | Status |
| --- | --- | --- | --- |
| TB-01 | Outcome-linked timeboxes | Associate each session with a weekly plan or task, an owner, a focused objective, and a duration budget. | Adapted: per-task hour budget |
| TB-02 | Daily and weekly scheduling | Assign a start/end time, show sessions on a schedule, and allow moving or resizing future sessions. Distinguish an unscheduled duration budget from a calendar reservation. | Skipped |
| TB-03 | Capacity checks | Compare planned time with declared availability after meetings, leave, and buffers; flag overbooking and overlapping sessions. | Adapted: weekly capacity vs. task budgets |
| TB-04 | Session timer | Start, pause, resume, and finish a session; show remaining time and preserve state after refresh. At expiry, prompt for a result instead of marking the task done. | Skipped |
| TB-05 | End-of-session policy | Offer a strict stop-and-review prompt or a softer reminder. Users can record an explicit extension or schedule another session; preserve the original budget for comparison. | Skipped |
| TB-06 | Outcomes and actual effort | Record completed, partial, blocked, or deferred results, notes, and actual active minutes separately from planned duration. | Partly covered by task completion and week outcome note |
| TB-07 | Breaks and buffers | Reserve recovery time and space for interruptions; keep those periods separate from task estimates. | Skipped |
| TB-08 | AI duration suggestions | Suggest a duration or smaller sessions from a brain dump, explain assumptions, and ask the user to accept or edit suggestions. | Not approved |
| TB-09 | AI feasibility review | Flag a plan that exceeds availability, lacks time for review/testing, or schedules dependent work too early. AI should advise; deterministic checks should enforce basic time constraints. | Adapted: estimates fed to AI scope check |
| TB-10 | Team coordination | Let authorized teammates see relevant availability and plan-linked sessions; support handoffs without exposing unrelated private calendar details. | Skipped |
| TB-11 | Reminders and calendar integration | Add start/end reminders and calendar export or synchronization. Calendar providers, sync direction, conflict handling, and notification permissions require separate decisions. | Blocked: notifications/integrations out of scope |
| TB-12 | Reflection and reporting | Compare estimated and actual time, completion outcomes, and repeated interruptions to improve future planning. Avoid treating timer usage as an employee performance score. | Skipped |

### Example weekly workflow

**Illustrative product flow; no implementation exists yet:**

1. A member enters a brain dump for a weekly outcome, such as preparing a reviewable authentication change.
2. The draft separates investigation, implementation, tests, and review into manageable tasks.
3. The member declares 20 available hours. Six hours of meetings and two hours of buffer leave 12 hours for planned task sessions, assuming those categories do not overlap.
4. The member assigns duration budgets and schedules sessions. A proposed 14-hour task plan triggers a two-hour capacity warning.
5. AI can suggest reducing scope or moving work; the member chooses changes before any required lead review.
6. At the end of a 45-minute investigation session, the member records findings. An unfinished task stays open even though the session has ended.
7. The weekly review compares delivered outcomes with planned and actual effort, then records decisions about remaining work.

### Proposed behavior and acceptance scenarios

These scenarios are a future design checklist, not tests already run or confirmed PDF requirements.

- **Valid scheduling:** end time must follow start time; durations must be positive. Show overlaps for the same owner and define whether users may override them.
- **Timezones:** store unambiguous timestamps and display them in the chosen timezone. Preserve duration across timezone changes and handle daylight-saving boundaries if supported regions require them.
- **Capacity:** do not double-count overlapping meetings, leave, or buffers. If availability is unknown, show that the feasibility assessment is incomplete.
- **Session completion:** a timer reaching zero does not complete a task, approve a plan, or prove an outcome was delivered.
- **Timer accuracy:** if a timer is implemented, derive elapsed time from persisted session timestamps and paused intervals so browser refresh or background throttling does not reset the session.
- **Changes after approval:** establish whether moving a session is a schedule-only edit and whether changing committed scope or effort requires renewed review. This decision depends on the PDF's approval rules.
- **AI control:** generated durations and scheduling changes remain suggestions until accepted. AI failure must still allow manual planning.
- **Access:** enforce the existing tenant and role boundaries for viewing, editing, and reporting timeboxes. Tenant isolation must also cover any future calendar connection.

### Scope decisions to resolve later

| ID | Open decision |
| --- | --- |
| TB-OPEN-01 | Resolved 2026-10-13 (D4): minimal adapted subset is in scope as an approved enhancement. |
| TB-OPEN-02 | Resolved 2026-10-13 (D4): duration budgets only; no schedule or live timer. |
| TB-OPEN-03 | What availability, overlap, timezone, and post-approval editing rules apply? Budgets are editable in draft only, like other task fields. |
| TB-OPEN-04 | Are calendars and notifications needed, and which providers are in scope? Currently out of scope. |

**Suggested starting scope:** if timeboxing is selected, begin with outcome-linked duration budgets, manual scheduling, capacity warnings, and result notes. Validate this flow before adding live timers, external calendar synchronization, or automated rescheduling. The confirmed product decisions and tagline remain unchanged.
