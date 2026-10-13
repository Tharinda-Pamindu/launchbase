"""Builders for tenancy tests: two organizations with people in every role."""

import uuid
from dataclasses import dataclass, field
from datetime import date

from app.models import (
    Organization,
    OrganizationMembership,
    OrgRole,
    PlanStatus,
    PlanTask,
    TaskKind,
    Team,
    TeamMembership,
    User,
    WeeklyPlan,
)
from app.security import (
    JWT_AUDIENCE_APP,
    JWT_AUDIENCE_INTERNAL,
    generate_jwt_token,
)
from app.services.plans import current_monday


def auth(user: User) -> dict[str, str]:
    """Headers that authenticate as `user` on the app surface."""
    token = generate_jwt_token({"sub": str(user.id)}, audience=JWT_AUDIENCE_APP)
    return {"Access-Token": f"Bearer {token}"}


def staff_auth(user: User) -> dict[str, str]:
    token = generate_jwt_token({"sub": str(user.id)}, audience=JWT_AUDIENCE_INTERNAL)
    return {"Access-Token": f"Bearer {token}"}


def new_user(first_name: str, *, is_admin: bool = False) -> User:
    return User(
        first_name=first_name,
        last_name="Test",
        email=f"{first_name.lower()}.{uuid.uuid4().hex[:10]}@example.com",
        is_active=True,
        is_admin=is_admin,
    )


@dataclass
class OrgWorld:
    org: Organization
    owner: User
    admin: User
    lead: User
    member: User
    teammate: User
    loner: User  # an org member who is in no team
    team: Team
    users: dict[str, User] = field(default_factory=dict)


@dataclass
class World:
    a: OrgWorld
    b: OrgWorld
    staff: User


async def build_org(db, name: str) -> OrgWorld:
    """An org with an owner, an org admin, and a team whose lead, member and
    teammate are plain members. Nobody but the lead leads anything."""
    org = Organization(name=f"{name} {uuid.uuid4().hex[:6]}")
    people = {
        "owner": (new_user(f"{name}Owner"), OrgRole.OWNER),
        "admin": (new_user(f"{name}Admin"), OrgRole.ADMIN),
        "lead": (new_user(f"{name}Lead"), OrgRole.MEMBER),
        "member": (new_user(f"{name}Member"), OrgRole.MEMBER),
        "teammate": (new_user(f"{name}Teammate"), OrgRole.MEMBER),
        "loner": (new_user(f"{name}Loner"), OrgRole.MEMBER),
    }
    db.add(org)
    for user, _ in people.values():
        db.add(user)
    await db.flush()
    for user, role in people.values():
        db.add(
            OrganizationMembership(organization_id=org.id, user_id=user.id, role=role)
        )
    team = Team(organization_id=org.id, name="Platform")
    db.add(team)
    await db.flush()
    for key, is_lead in (("lead", True), ("member", False), ("teammate", False)):
        db.add(
            TeamMembership(
                organization_id=org.id,
                team_id=team.id,
                user_id=people[key][0].id,
                is_lead=is_lead,
            )
        )
    await db.flush()
    users = {k: u for k, (u, _) in people.items()}
    return OrgWorld(org=org, team=team, users=users, **users)


async def build_world(session_factory) -> World:
    async with session_factory() as db:
        a = await build_org(db, "Acme")
        b = await build_org(db, "Bolt")
        staff = new_user("Staff", is_admin=True)
        db.add(staff)
        await db.commit()
    return World(a=a, b=b, staff=staff)


async def add_plan(
    session_factory,
    *,
    org: Organization,
    user: User,
    week_start: date | None = None,
    status: str = PlanStatus.DRAFT,
    shipped: bool | None = None,
    done_tasks: int = 0,
) -> WeeklyPlan:
    """A complete, well-formed plan written straight to the database."""
    plan = WeeklyPlan(
        organization_id=org.id,
        user_id=user.id,
        week_start=week_start or current_monday(),
        status=status,
        main_goal_shipped=shipped,
    )
    plan.tasks = [
        PlanTask(
            kind=TaskKind.MAIN,
            title="Checkout handles expired cards, confirmed on staging",
            why="Expired cards are our top support ticket",
            position=0,
        ),
        PlanTask(
            kind=TaskKind.SUB_GOAL,
            title="Card errors show a retry message, merged",
            position=1,
        ),
        PlanTask(
            kind=TaskKind.GTM,
            title="Changelog entry for card retries published",
            position=2,
        ),
    ]
    for task in plan.tasks[:done_tasks]:
        task.is_done = True
    async with session_factory() as db:
        db.add(plan)
        await db.commit()
        await db.refresh(plan)
    return plan
