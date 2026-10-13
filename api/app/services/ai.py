import asyncio
import time
from datetime import UTC, datetime, timedelta
from typing import Any

from pydantic_ai import Agent
from pydantic_ai.exceptions import (
    ModelAPIError,
    ModelHTTPError,
    UnexpectedModelBehavior,
)
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.agents import (
    PlanDraft,
    PlanReview,
    ReviewDeps,
    drafter,
    get_model,
    reviewer,
)
from app.config import settings
from app.exceptions import APIException, ForbiddenException, ValidationException
from app.logging import logger
from app.models import (
    AiOperation,
    AiOutcome,
    AiUsageEvent,
    OrganizationMembership,
    PlanStatus,
    TaskKind,
    WeeklyPlan,
)
from app.services.plans import invalid_status, plan_content_hash

TASK_REF_PREFIX = {TaskKind.SUB_GOAL: "SG", TaskKind.GTM: "GTM"}


def ai_error(status_code: int, code: str, message: str) -> APIException:
    return APIException(status_code=status_code, code=code, message=message)


def task_refs(plan: WeeklyPlan) -> dict[str, Any]:
    """Short labels for the model (MAIN, SG1, GTM2) mapped to the plan's tasks.
    The model never sees task ids, and only refs we issued map back."""
    refs: dict[str, Any] = {}
    counters = {TaskKind.SUB_GOAL: 0, TaskKind.GTM: 0}
    for task in plan.tasks:
        if task.kind == TaskKind.MAIN:
            refs["MAIN"] = task
        else:
            counters[task.kind] += 1
            refs[f"{TASK_REF_PREFIX[task.kind]}{counters[task.kind]}"] = task
    return refs


def render_plan(plan: WeeklyPlan, refs: dict[str, Any]) -> str:
    """The plan as the reviewer sees it. Only task content: no names, emails or
    anything else about the people involved."""
    lines = [f"Plan for the week starting Monday {plan.week_start.isoformat()}.", ""]
    if "MAIN" not in refs:
        lines += ["MAIN: (no main task)", ""]
    for ref, task in refs.items():
        estimate = f" (estimated {task.estimate_hours}h)" if task.estimate_hours else ""
        lines.append(f"{ref}: {task.title}{estimate}")
        if task.kind == TaskKind.MAIN:
            lines.append(f"  why: {task.why or '(not given)'}")
    if not any(t.kind == TaskKind.GTM for t in plan.tasks):
        lines.append("(no go-to-market tasks)")
    estimated = [t.estimate_hours for t in plan.tasks if t.estimate_hours]
    if estimated:
        lines += ["", f"Estimated total: {sum(estimated)}h"]
    return "\n".join(lines)


def map_review(review: PlanReview, refs: dict[str, Any]) -> dict[str, Any]:
    """Tie each finding to a real task id, dropping any the model invented."""
    findings = []
    for finding in review.findings:
        ref = finding.task_ref.strip().upper()
        if ref == "NEW":
            kind = finding.new_task_kind or (
                TaskKind.GTM if finding.issue == "missing_gtm" else None
            )
            if kind is None:
                continue
            task_id, field = None, "title"
        elif ref in refs:
            task = refs[ref]
            kind = task.kind
            task_id = str(task.id)
            # Only the main task has a "why".
            field = finding.field if task.kind == TaskKind.MAIN else "title"
        else:
            logger.info("Dropping AI finding for unknown task ref %r", finding.task_ref)
            continue
        findings.append(
            {
                "task_id": task_id,
                "task_ref": ref,
                "task_kind": kind,
                "issue": finding.issue,
                "severity": finding.severity,
                "problem": finding.problem,
                "field": field,
                "suggested_rewrite": finding.suggested_rewrite,
            }
        )
    # Don't let the model approve a plan it has must-fix findings about.
    must_fix = any(f["severity"] == "must_fix" for f in findings)
    verdict = "adjust" if must_fix else review.verdict
    return {"verdict": verdict, "summary": review.summary, "findings": findings}


class AiService:
    """Runs the agents for one organization member.

    Every call, successful or not, writes one `AiUsageEvent` against the
    organization. Failures become plain-words API errors; the router commits
    in a `finally` so the usage row is kept either way.
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    async def review_plan(
        self, actor: OrganizationMembership, plan: WeeklyPlan
    ) -> WeeklyPlan:
        if plan.user_id != actor.user_id:
            raise ForbiddenException(
                "Only the plan's author can ask for a review.",
                code="PLAN_AUTHOR_REQUIRED",
            )
        if plan.status != PlanStatus.DRAFT:
            raise invalid_status(plan, PlanStatus.DRAFT, "reviewed")
        if not plan.tasks:
            raise ValidationException(
                "Add some tasks before asking for a review.", field="tasks"
            )
        refs = task_refs(plan)
        # The look-back tool reads only this author's own earlier plans.
        deps = ReviewDeps(
            session=self.session,
            organization_id=plan.organization_id,
            user_id=plan.user_id,
            week_start=plan.week_start,
        )
        review = await self._run(
            actor,
            AiOperation.PLAN_REVIEW,
            reviewer,
            render_plan(plan, refs),
            deps=deps,
        )
        plan.ai_review = map_review(review, refs)
        plan.ai_reviewed_at = datetime.now(UTC)
        plan.ai_review_plan_hash = plan_content_hash(plan.tasks)
        await self.session.flush()
        return plan

    async def draft_plan(self, actor: OrganizationMembership, notes: str) -> PlanDraft:
        # Returned to the form only. Nothing here is written to the plan.
        return await self._run(actor, AiOperation.PLAN_DRAFT, drafter, notes)

    async def _run[T](
        self,
        actor: OrganizationMembership,
        operation: str,
        agent: Agent[Any, T],
        prompt: str,
        deps: Any = None,
    ) -> T:
        def record(outcome: str, error_kind: str | None = None, **usage: Any):
            self.session.add(
                AiUsageEvent(
                    organization_id=actor.organization_id,
                    user_id=actor.user_id,
                    operation=operation,
                    outcome=outcome,
                    error_kind=error_kind,
                    model=settings.AI_MODEL,
                    latency_ms=int((time.perf_counter() - started) * 1000),
                    **usage,
                )
            )

        started = time.perf_counter()
        if not settings.GOOGLE_API_KEY:
            record(AiOutcome.FAILED, "not_configured")
            raise ai_error(
                503,
                "AI_UNAVAILABLE",
                "The AI assistant isn't set up on this server. You can still "
                "write and submit your plan without it.",
            )
        if await self._over_local_limit(actor):
            record(AiOutcome.RATE_LIMITED, "local_limit")
            raise ai_error(
                429,
                "AI_RATE_LIMITED",
                "You've asked the AI a lot in the last minute. Wait a minute and "
                "try again.",
            )

        try:
            result = await asyncio.wait_for(
                agent.run(prompt, model=get_model(), deps=deps),
                timeout=settings.AI_TIMEOUT_SECONDS,
            )
        except TimeoutError:
            record(AiOutcome.FAILED, "timeout")
            raise ai_error(
                504,
                "AI_TIMEOUT",
                "The AI took too long to answer. Try again, or carry on without it.",
            )
        except ModelHTTPError as e:
            if e.status_code == 429:
                record(AiOutcome.RATE_LIMITED, "provider_rate_limit")
                raise ai_error(
                    429,
                    "AI_RATE_LIMITED",
                    "The AI service is busy right now (rate limit reached). Try "
                    "again in a minute, or carry on without it.",
                )
            record(AiOutcome.FAILED, f"provider_http_{e.status_code}")
            raise ai_error(
                503,
                "AI_UNAVAILABLE",
                "The AI service is having trouble right now. Try again later, or "
                "carry on without it.",
            )
        except ModelAPIError:
            logger.exception("AI provider request failed")
            record(AiOutcome.FAILED, "provider_unreachable")
            raise ai_error(
                503,
                "AI_UNAVAILABLE",
                "We couldn't reach the AI service. Try again later, or carry on "
                "without it.",
            )
        except UnexpectedModelBehavior:
            logger.exception("AI returned output that failed validation")
            record(AiOutcome.FAILED, "invalid_output")
            raise ai_error(
                502,
                "AI_BAD_OUTPUT",
                "The AI gave an answer we couldn't use. Try again.",
            )
        except Exception:
            logger.exception("Unexpected error while running the AI")
            record(AiOutcome.FAILED, "unexpected")
            raise ai_error(
                502, "AI_BAD_OUTPUT", "Something went wrong with the AI. Try again."
            )

        usage = result.usage
        record(
            AiOutcome.SUCCEEDED,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
        )
        await self.session.flush()
        return result.output

    async def _over_local_limit(self, actor: OrganizationMembership) -> bool:
        since = datetime.now(UTC) - timedelta(minutes=1)
        recent = await self.session.scalar(
            select(func.count()).where(
                AiUsageEvent.user_id == actor.user_id,
                AiUsageEvent.created_at >= since,
                AiUsageEvent.error_kind.is_distinct_from("local_limit"),
            )
        )
        return (recent or 0) >= settings.AI_RATE_LIMIT_PER_MINUTE
