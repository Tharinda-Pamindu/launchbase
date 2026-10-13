"""A believable demo: two organizations, teams with leads, people in every
role, and several weeks of plans, some shipped and some not."""

import random
from dataclasses import dataclass
from datetime import UTC, datetime, time, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import (
    AiOperation,
    AiOutcome,
    AiUsageEvent,
    Organization,
    OrganizationMembership,
    OrgRole,
    PlanReview,
    PlanStatus,
    PlanTask,
    ReviewAction,
    TaskKind,
    Team,
    TeamMembership,
    User,
    WeeklyPlan,
)
from app.security import hash_password
from app.services.plans import current_monday

DEMO_DOMAINS = ("northwind.example", "harbor.example", "floppy.example")
DEMO_ORGS = ("Northwind Labs", "Harbor Health")
WEEKS_OF_HISTORY = 5
# Someone whose main task keeps slipping: it didn't ship the last two weeks
# and is back on this week's draft, so the AI review's look-back has
# something real to flag.
CARRY_OVER_EMAIL = "tom@northwind.example"
CARRY_OVER_WEEKS = 2


@dataclass(frozen=True)
class Person:
    first_name: str
    last_name: str
    email: str
    role: str = OrgRole.MEMBER


# (main title, why, sub-goals, go-to-market goals) per team. Every title is a
# result you could check on Friday.
WORK = {
    "Payments": [
        (
            "Checkout retries expired cards and recovers the payment, confirmed on staging",
            "Expired cards are a fifth of failed renewals",
            ["Card-expiry webhook handled idempotently, covered by tests"],
            ["Changelog entry for card retries published"],
        ),
        (
            "Invoices export to CSV for any date range, checked with a 10k-row account",
            "Finance teams ask for it in every renewal call",
            ["Export streams rows without timing out on large accounts"],
            ["Help-center article on exports live", "export_invoice event tracked"],
        ),
        (
            "Refunds can be issued from the admin page in one step, live in production",
            "Support spends hours a week on manual refunds",
            [
                "Partial refunds update the invoice total",
                "Refund emails reuse the receipt template",
            ],
            ["Support team walked through the new flow"],
        ),
        (
            "Tax is calculated for EU customers at checkout, verified against 5 countries",
            "We can't sell to EU teams without it",
            ["VAT IDs validated before the order is placed"],
            ["Pricing page shows prices with VAT for EU visitors"],
        ),
        (
            "Failed payment emails link straight to the card update page, live",
            "Most churned accounts never updated their card",
            ["Card update page works signed out with a one-time link"],
            ["dunning_link_clicked event in analytics"],
        ),
        (
            "Annual plans can be bought from the billing page, behind the annual_plans flag",
            "Sales keeps quoting annual deals by hand",
            ["Proration from monthly to annual is correct to the cent"],
            ["annual_plans flag on for 3 pilot customers", "Changelog entry drafted"],
        ),
    ],
    "Growth": [
        (
            "New sign-ups land on a checklist with three first steps, live for all sign-ups",
            "Half of new teams never create a first plan",
            ["Checklist progress saved per user"],
            ["onboarding_step_completed events tracked"],
        ),
        (
            "Landing page loads in under 1.5s on mobile, measured with Lighthouse",
            "Paid traffic bounces on slow mobile loads",
            ["Hero images served as AVIF with fallbacks"],
            ["Before/after numbers shared in #growth"],
        ),
        (
            "Referral link gives both teams a free month, behind the referrals flag",
            "Our best customers came from word of mouth",
            ["Referral credit applied on the referee's first invoice"],
            [
                "referrals flag on for 10% of accounts",
                "Referral page linked from settings",
            ],
        ),
        (
            "Weekly digest email goes out on Mondays with each team's open plans, live",
            "Leads forget to check who hasn't submitted",
            ["Digest respects each user's timezone"],
            ["Changelog entry for the digest published"],
        ),
    ],
    "Clinic App": [
        (
            "Patients can reschedule an appointment from the reminder SMS, live in one clinic",
            "No-shows cost clinics about a tenth of their slots",
            [
                "Reschedule link expires after use",
                "Clinic calendar updates within a minute",
            ],
            ["Pilot clinic staff briefed", "reschedule_from_sms event tracked"],
        ),
        (
            "Front-desk view shows today's check-ins in arrival order, used by the pilot clinic",
            "Front desks still use paper lists",
            ["View refreshes without a page reload"],
            ["Short how-to video sent to the pilot clinic"],
        ),
        (
            "Appointment reminders go out 24h before in the patient's language, verified for 3 languages",
            "Non-English speakers miss the most appointments",
            ["Translations reviewed by a native speaker"],
            ["Release note in the clinic newsletter"],
        ),
        (
            "Clinic admins can export a month of visits as PDF, checked with real data",
            "Clinics need it for their monthly insurer reports",
            ["PDF renders 500 visits in under 10 seconds"],
            ["Export button announced in the in-app banner"],
        ),
    ],
}

# Comments a lead might leave when sending a plan back.
SEND_BACK_COMMENTS = [
    "Main task is two weeks of work. Pick the half that ships by Friday.",
    "What's the why? Who is waiting for this?",
    "No go-to-market task: how will anyone find out it exists?",
]


async def reset_demo(session: AsyncSession) -> None:
    await session.execute(delete(Organization).where(Organization.name.in_(DEMO_ORGS)))
    for domain in DEMO_DOMAINS:
        await session.execute(delete(User).where(User.email.like(f"%@{domain}")))
    await session.flush()


async def demo_exists(session: AsyncSession) -> bool:
    return (
        await session.scalar(
            select(Organization.id).where(Organization.name.in_(DEMO_ORGS))
        )
    ) is not None


class DemoBuilder:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.rng = random.Random(7)  # same demo every time
        self.password = hash_password(settings.DEMO_PASSWORD)
        self.this_monday = current_monday()

    async def build(self) -> dict[str, str]:
        """Create everything and return the demo logins by role."""
        staff = self._user(
            Person("Sam", "Staff", "staff@floppy.example"), is_admin=True
        )

        northwind = await self._org(
            "Northwind Labs",
            [
                Person("Olivia", "Owner", "olivia@northwind.example", OrgRole.OWNER),
                Person("Arjun", "Admin", "arjun@northwind.example", OrgRole.ADMIN),
                Person("Leila", "Lead", "leila@northwind.example"),
                Person("Marco", "Member", "marco@northwind.example"),
                Person("Priya", "Nair", "priya@northwind.example"),
                Person("Tom", "Becker", "tom@northwind.example"),
                Person("Grace", "Lead", "grace@northwind.example"),
                Person("Kenji", "Sato", "kenji@northwind.example"),
                Person("Ama", "Owusu", "ama@northwind.example"),
            ],
        )
        payments = await self._team(
            northwind,
            "Payments",
            "Billing, checkout and invoices",
            "leila",
            ["marco", "priya", "tom"],
        )
        growth = await self._team(
            northwind,
            "Growth",
            "Onboarding, activation and the website",
            "grace",
            ["kenji", "ama", "tom"],  # Tom works across both teams
        )

        harbor = await self._org(
            "Harbor Health",
            [
                Person("Hana", "Okafor", "hana@harbor.example", OrgRole.OWNER),
                Person("Diego", "Ramos", "diego@harbor.example", OrgRole.ADMIN),
                Person("Ruth", "Lead", "ruth@harbor.example"),
                Person("Wei", "Chen", "wei@harbor.example"),
                Person("Sofia", "Rossi", "sofia@harbor.example"),
            ],
        )
        clinic = await self._team(
            harbor,
            "Clinic App",
            "The patient and front-desk app",
            "ruth",
            ["wei", "sofia"],
        )

        for org, teams in ((northwind, [payments, growth]), (harbor, [clinic])):
            await self._plans(org, teams)
            self._ai_usage(org)
        await self.session.flush()

        return {
            "Member": "marco@northwind.example",
            "Team lead": "leila@northwind.example",
            "Org owner": "olivia@northwind.example",
            "Org admin": "arjun@northwind.example",
            "Other org owner": "hana@harbor.example",
            "Carried-over work (AI look-back)": CARRY_OVER_EMAIL,
            "Platform staff (internal panel)": staff.email,
        }

    # -- People and teams ------------------------------------------------------

    def _user(self, person: Person, *, is_admin: bool = False) -> User:
        user = User(
            first_name=person.first_name,
            last_name=person.last_name,
            email=person.email,
            password=self.password,
            is_active=True,
            is_admin=is_admin,
        )
        self.session.add(user)
        return user

    async def _org(self, name: str, people: list[Person]) -> "DemoOrg":
        org = Organization(
            name=name, created_at=self._at(-WEEKS_OF_HISTORY * 7 - 3, 10)
        )
        self.session.add(org)
        users = {p.email.split("@")[0]: (self._user(p), p.role) for p in people}
        await self.session.flush()
        for user, role in users.values():
            self.session.add(
                OrganizationMembership(
                    organization_id=org.id,
                    user_id=user.id,
                    role=role,
                    created_at=org.created_at,
                )
            )
        await self.session.flush()
        return DemoOrg(
            org=org,
            users={k: u for k, (u, _) in users.items()},
            managers=[u for u, r in users.values() if r in OrgRole.MANAGERS],
        )

    async def _team(
        self,
        demo: "DemoOrg",
        name: str,
        description: str,
        lead: str,
        members: list[str],
    ) -> "DemoTeam":
        team = Team(organization_id=demo.org.id, name=name, description=description)
        self.session.add(team)
        await self.session.flush()
        for key in [lead, *members]:
            self.session.add(
                TeamMembership(
                    organization_id=demo.org.id,
                    team_id=team.id,
                    user_id=demo.users[key].id,
                    is_lead=key == lead,
                )
            )
        await self.session.flush()
        return DemoTeam(
            name=name,
            lead=demo.users[lead],
            members=[demo.users[k] for k in members],
        )

    # -- Plans -----------------------------------------------------------------

    async def _plans(self, demo: "DemoOrg", teams: list["DemoTeam"]) -> None:
        planned: set = set()
        for team in teams:
            people = [team.lead, *team.members]
            for offset in range(WEEKS_OF_HISTORY, -1, -1):
                for i, user in enumerate(people):
                    if (user.id, offset) in planned:
                        continue  # someone in two teams writes one plan a week
                    planned.add((user.id, offset))
                    approver = (
                        self.rng.choice(demo.managers)
                        if user is team.lead
                        else team.lead
                    )
                    if offset > 0:
                        self._past_plan(demo, team, user, approver, offset, i)
                    else:
                        self._current_plan(demo, team, user, approver, i)

    @staticmethod
    def _carries_over(user: User, offset: int) -> bool:
        return user.email == CARRY_OVER_EMAIL and offset <= CARRY_OVER_WEEKS

    def _past_plan(self, demo, team, user, approver, offset: int, i: int) -> None:
        # Mostly shipped, with a believable miss now and then; one person
        # skipped a week entirely.
        if offset == 3 and i == len(team.members):
            return
        shipped = self.rng.random() > 0.3
        if self._carries_over(user, offset):
            shipped = False
        plan = self._plan(demo, team, user, offset, i, status=PlanStatus.DONE)
        plan.submitted_at = self._at(-7 * offset, 10)
        plan.approved_at = self._at(-7 * offset, 15)
        plan.approved_by_id = approver.id
        plan.completed_at = self._at(-7 * offset + 4, 17)
        plan.main_goal_shipped = shipped
        plan.outcome_note = (
            "Shipped and announced."
            if shipped
            else "Ran into an edge case on staging; carrying the fix into next week."
        )
        for n, task in enumerate(plan.tasks):
            task.is_done = shipped or n > 0 and self.rng.random() > 0.4
            task.done_at = plan.completed_at if task.is_done else None
        if offset == 2 and i == 1:
            # This one was sent back once before it was approved.
            self._review(
                plan,
                approver,
                ReviewAction.CHANGES_REQUESTED,
                SEND_BACK_COMMENTS[0],
                self._at(-7 * offset, 11),
            )
        self._review(plan, approver, ReviewAction.APPROVED, None, plan.approved_at)

    def _current_plan(self, demo, team, user, approver, i: int) -> None:
        # This week: a spread of states so every screen has something to show.
        state = i % 5
        if state == 4:
            return  # hasn't started a plan yet
        if state == 3:
            plan = self._plan(demo, team, user, 0, i, status=PlanStatus.DRAFT)
            self._review(
                plan,
                approver,
                ReviewAction.CHANGES_REQUESTED,
                SEND_BACK_COMMENTS[1],
                self._at(0, 11),
            )
            return
        status = (PlanStatus.APPROVED, PlanStatus.SUBMITTED, PlanStatus.SUBMITTED)[
            state
        ]
        plan = self._plan(demo, team, user, 0, i, status=status)
        plan.submitted_at = self._at(0, 9)
        if status == PlanStatus.APPROVED:
            plan.approved_at = self._at(0, 14)
            plan.approved_by_id = approver.id
            self._review(
                plan, approver, ReviewAction.APPROVED, "Good scope.", plan.approved_at
            )
            for task in plan.tasks[1:2]:
                task.is_done, task.done_at = True, datetime.now(UTC)

    def _plan(
        self, demo, team, user, offset: int, i: int, *, status: str
    ) -> WeeklyPlan:
        work = WORK[team.name]
        main, why, subs, gtms = (
            WORK["Payments"][4]
            if self._carries_over(user, offset)
            else work[(offset * 3 + i) % len(work)]
        )
        tasks = [PlanTask(kind=TaskKind.MAIN, title=main, why=why, estimate_hours=16)]
        tasks += [
            PlanTask(kind=TaskKind.SUB_GOAL, title=t, estimate_hours=6) for t in subs
        ]
        tasks += [PlanTask(kind=TaskKind.GTM, title=t, estimate_hours=2) for t in gtms]
        for position, task in enumerate(tasks):
            task.position = position
        plan = WeeklyPlan(
            organization_id=demo.org.id,
            user_id=user.id,
            week_start=self.this_monday - timedelta(days=7 * offset),
            status=status,
            created_at=self._at(-7 * offset - 1, 16),
            tasks=tasks,
        )
        self.session.add(plan)
        return plan

    def _review(self, plan, reviewer, action, comment, at) -> None:
        plan.reviews.append(
            PlanReview(
                reviewer_id=reviewer.id, action=action, comment=comment, created_at=at
            )
        )

    # -- AI usage, so the staff view has history --------------------------------

    def _ai_usage(self, demo: "DemoOrg") -> None:
        users = list(demo.users.values())
        for day in range(-WEEKS_OF_HISTORY * 7, 1):
            for _ in range(self.rng.randint(0, 4)):
                roll = self.rng.random()
                if roll < 0.85:
                    outcome, error = AiOutcome.SUCCEEDED, None
                elif roll < 0.95:
                    outcome, error = AiOutcome.RATE_LIMITED, "provider_rate_limit"
                else:
                    outcome, error = AiOutcome.FAILED, "timeout"
                ok = outcome == AiOutcome.SUCCEEDED
                self.session.add(
                    AiUsageEvent(
                        organization_id=demo.org.id,
                        user_id=self.rng.choice(users).id,
                        operation=self.rng.choice(AiOperation.ALL),
                        outcome=outcome,
                        error_kind=error,
                        model="gemini-3.5-flash-lite",
                        latency_ms=self.rng.randint(700, 4000) if ok else 30000,
                        input_tokens=self.rng.randint(400, 1200) if ok else None,
                        output_tokens=self.rng.randint(150, 600) if ok else None,
                        created_at=self._at(day, self.rng.randint(8, 18)),
                    )
                )

    def _at(self, days_from_monday: int, hour: int) -> datetime:
        day = self.this_monday + timedelta(days=days_from_monday)
        return min(datetime.combine(day, time(hour), tzinfo=UTC), datetime.now(UTC))


@dataclass
class DemoOrg:
    org: Organization
    users: dict[str, User]
    managers: list[User]


@dataclass
class DemoTeam:
    name: str
    lead: User
    members: list[User]
