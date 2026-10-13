<p align="center">
  <img src="branding/floppy-mark.svg" alt="Floppy" width="96">
</p>

# Floppy

**Less strain. More brain.** Weekly planning for software teams: every
engineer commits to one thing they'll ship this week, reviewed before their
lead approves it, so by Friday the team knows what actually shipped.

Running it, demo logins and what's not done: see [SUBMISSION.md](SUBMISSION.md).

Floppy started from Launchbase, a polyglot monorepo template: a FastAPI
backend and TanStack Start frontends, with shared tooling wired for monorepo
development.

## Structure

| Folder      | What it is                                                                     | Setup                                     |
| ----------- | ------------------------------------------------------------------------------ | ----------------------------------------- |
| `api/`      | FastAPI backend — async SQLAlchemy, Postgres, Alembic, JWT auth, pytest        | [api/README.md](api/README.md)            |
| `app/`      | TanStack Start frontend — SPA, Tailwind, shadcn/ui                             | [app/README.md](app/README.md)            |
| `internal/` | TanStack Start internal console — SPA, user management on the API `/internal` surface | [internal/README.md](internal/README.md)  |
| `site/`     | TanStack Start landing page — SSG, API-less, full shadcn/ui component set      | [site/README.md](site/README.md)          |

Each folder's README has the setup and workflow details — start there.

## Requirements

- Python 3.12 and [uv](https://docs.astral.sh/uv/)
- Node.js 24+ (`nvm use` inside a frontend folder picks up `.nvmrc`)
- Postgres 16

## Dev session

[tmuxp](https://tmuxp.git-pull.com/) builds the preconfigured dev session from
`.tmuxp.yaml`. Run `tmuxp load .` from the repo root.

## Git hooks

[pre-commit](https://pre-commit.com) manages hooks for the whole monorepo via
`.pre-commit-config.yaml`. Install once after cloning:

```bash
uv run --project api pre-commit install
```
