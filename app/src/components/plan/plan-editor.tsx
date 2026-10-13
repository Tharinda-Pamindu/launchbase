import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CircleAlert,
  Lightbulb,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Undo2,
  WandSparkles,
} from "lucide-react";
import { useAiStatus, usePlanAiReview } from "@/api/endpoints/ai/ai";
import {
  usePlanCreate,
  usePlanSubmit,
  usePlanUpdate,
} from "@/api/endpoints/plans/plans";
import type {
  AiFindingResponse,
  PlanDraftResponse,
  PlanResponse,
  TaskInputRequest,
} from "@/api/model";
import { BrainDumpDialog } from "@/components/plan/brain-dump-dialog";
import { TASK_KINDS } from "@/components/plan/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

type Kind = "main" | "sub_goal" | "gtm";

type Row = {
  key: string;
  id?: string;
  kind: Kind;
  title: string;
  why: string;
  estimate: string;
};

let nextKey = 0;
const newKey = () => `row-${nextKey++}`;

function blankRow(kind: Kind): Row {
  return { key: newKey(), kind, title: "", why: "", estimate: "" };
}

function rowsFromPlan(plan?: PlanResponse): Row[] {
  const rows: Row[] = (plan?.tasks ?? []).map((t) => ({
    key: t.id,
    id: t.id,
    kind: t.kind,
    title: t.title,
    why: t.why ?? "",
    estimate: t.estimate_hours ? String(t.estimate_hours) : "",
  }));
  // Always offer one row of each kind to type into.
  for (const kind of ["main", "sub_goal", "gtm"] as const) {
    if (!rows.some((r) => r.kind === kind)) {
      rows.push(blankRow(kind));
    }
  }
  return rows;
}

function rowsFromDraft(draft: PlanDraftResponse): Row[] {
  const row = (
    kind: Kind,
    title: string,
    hours: number | null,
    why = ""
  ): Row => ({
    key: newKey(),
    kind,
    title,
    why,
    estimate: hours ? String(hours) : "",
  });
  return [
    row(
      "main",
      draft.main_task.title,
      draft.main_task.estimate_hours,
      draft.main_task.why
    ),
    ...draft.sub_goals.map((t) => row("sub_goal", t.title, t.estimate_hours)),
    ...draft.gtm_goals.map((t) => row("gtm", t.title, t.estimate_hours)),
  ];
}

// What the API gets: filled rows, main task first, then sub-goals, then GTM.
function toRequest(rows: Row[]): TaskInputRequest[] {
  const order: Kind[] = ["main", "sub_goal", "gtm"];
  return order.flatMap((kind) =>
    rows
      .filter((r) => r.kind === kind && r.title.trim())
      .map((r) => {
        const hours = Number.parseInt(r.estimate, 10);
        return {
          ...(r.id ? { id: r.id } : {}),
          kind,
          title: r.title.trim(),
          why: kind === "main" && r.why.trim() ? r.why.trim() : null,
          estimate_hours: hours >= 1 && hours <= 60 ? hours : null,
        };
      })
  );
}

export function PlanEditor({
  organizationId,
  week,
  plan,
  onSaved,
  startWithNotes = false,
}: {
  organizationId: string;
  week: string;
  plan?: PlanResponse;
  onSaved: (plan: PlanResponse) => void;
  startWithNotes?: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(() => rowsFromPlan(plan));
  const [savedJson, setSavedJson] = useState(() =>
    JSON.stringify(toRequest(rowsFromPlan(plan)))
  );
  const [undoRows, setUndoRows] = useState<Row[] | null>(null);
  const [applied, setApplied] = useState<Set<number>>(new Set());
  const [notesOpen, setNotesOpen] = useState(startWithNotes);

  const aiStatus = useAiStatus();
  const aiAvailable = aiStatus.data?.available ?? false;
  const create = usePlanCreate();
  const update = usePlanUpdate();
  const submit = usePlanSubmit();
  const review = usePlanAiReview();

  const request = useMemo(() => toRequest(rows), [rows]);
  const dirty = JSON.stringify(request) !== savedJson;
  const busy =
    create.isPending ||
    update.isPending ||
    submit.isPending ||
    review.isPending;
  const main = rows.find((r) => r.kind === "main");
  const readyToSubmit = Boolean(main?.title.trim() && main.why.trim());
  const totalHours = request.reduce(
    (sum, t) => sum + (t.estimate_hours ?? 0),
    0
  );

  const aiReview = plan?.ai_review;
  const findings = (aiReview?.findings ?? [])
    .map((finding, index) => ({ finding, index }))
    .filter(({ index }) => !applied.has(index));

  const save = async (): Promise<PlanResponse> => {
    const saved = plan
      ? await update.mutateAsync({
          organizationId,
          planId: plan.id,
          data: { tasks: request },
        })
      : await create.mutateAsync({
          organizationId,
          data: { week_start: week, tasks: request },
        });
    setRows(rowsFromPlan(saved));
    setSavedJson(JSON.stringify(toRequest(rowsFromPlan(saved))));
    setUndoRows(null);
    onSaved(saved);
    return saved;
  };

  const run = async (action: "save" | "submit" | "review") => {
    try {
      const saved = dirty || !plan ? await save() : plan;
      if (action === "save") {
        toast.success("Draft saved");
      } else if (action === "submit") {
        onSaved(await submit.mutateAsync({ organizationId, planId: saved.id }));
        toast.success("Submitted. Your lead will review it.");
      } else {
        setApplied(new Set());
        onSaved(await review.mutateAsync({ organizationId, planId: saved.id }));
      }
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const setRow = (key: string, changes: Partial<Row>) =>
    setRows((current) =>
      current.map((r) => (r.key === key ? { ...r, ...changes } : r))
    );

  const applyFinding = (finding: AiFindingResponse, index: number) => {
    if (finding.task_id) {
      const target = rows.find((r) => r.id === finding.task_id);
      if (target) {
        setRow(target.key, {
          [finding.field === "why" ? "why" : "title"]:
            finding.suggested_rewrite,
        });
      }
    } else {
      setRows((current) => [
        ...current.filter(
          (r) => r.kind !== finding.task_kind || r.title.trim()
        ),
        { ...blankRow(finding.task_kind), title: finding.suggested_rewrite },
      ]);
    }
    setApplied((current) => new Set(current).add(index));
  };

  const fillFromDraft = (draft: PlanDraftResponse) => {
    setUndoRows(rows);
    // Keep existing task ids where the kinds line up, so the AI review and
    // task history still point at the same tasks after saving.
    const ids = rows.filter((r) => r.id);
    setRows(
      rowsFromDraft(draft).map((row) => {
        const reuse = ids.findIndex((r) => r.kind === row.kind);
        if (reuse === -1) {
          return row;
        }
        const [taken] = ids.splice(reuse, 1);
        return { ...row, id: taken?.id };
      })
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {aiAvailable ? (
          <Button
            variant="outline"
            onClick={() => setNotesOpen(true)}
            disabled={busy}
          >
            <WandSparkles />
            Draft from my notes
          </Button>
        ) : (
          aiStatus.isSuccess && (
            <p className="text-sm text-muted-foreground">
              The AI assistant is off on this server. You can still plan and
              submit as usual.
            </p>
          )
        )}
        <div className="ml-auto text-sm text-muted-foreground">
          {totalHours > 0 && (
            <span
              className={cn(
                totalHours > 30 &&
                  "font-medium text-amber-700 dark:text-amber-300"
              )}
            >
              {totalHours}h estimated
              {totalHours > 30 && " · more than a focused week (~30h)"}
            </span>
          )}
        </div>
      </div>

      {undoRows && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          <span>
            Filled in from your notes. Read it over, edit anything, then save.
            Nothing is saved yet.
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setRows(undoRows);
              setUndoRows(null);
            }}
          >
            <Undo2 />
            Undo
          </Button>
        </div>
      )}

      {aiReview && (
        <div
          className={cn(
            "rounded-xl border p-4",
            aiReview.verdict === "approve"
              ? "border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10"
              : "border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10"
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="size-4" />
            <span className="font-medium">
              {aiReview.verdict === "approve"
                ? "Floppy would approve this plan"
                : "Floppy suggests some changes"}
            </span>
            {(aiReview.is_stale || dirty) && (
              <Badge variant="outline">Plan changed since this review</Badge>
            )}
          </div>
          <p className="mt-1 text-sm">{aiReview.summary}</p>
          {findings.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Suggestions are shown next to the tasks they&apos;re about.
            </p>
          )}
        </div>
      )}

      {(Object.keys(TASK_KINDS) as Kind[]).map((kind) => (
        <section
          key={kind}
          className="space-y-3 rounded-xl border bg-background p-4"
        >
          <div>
            <h3 className="font-medium">{TASK_KINDS[kind].label}</h3>
            <p className="text-sm text-muted-foreground">
              {TASK_KINDS[kind].hint}
            </p>
          </div>

          {rows
            .filter((r) => r.kind === kind)
            .map((row) => (
              <div key={row.key} className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={row.title}
                    onChange={(e) => setRow(row.key, { title: e.target.value })}
                    placeholder={
                      kind === "main"
                        ? "Checkout handles expired cards, confirmed on staging"
                        : "A result you can check on Friday"
                    }
                    maxLength={300}
                    aria-label={`${TASK_KINDS[kind].label} title`}
                  />
                  <Input
                    value={row.estimate}
                    onChange={(e) =>
                      setRow(row.key, {
                        estimate: e.target.value.replace(/\D/g, ""),
                      })
                    }
                    className="w-20"
                    inputMode="numeric"
                    placeholder="hours"
                    aria-label="Estimated hours"
                  />
                  {kind !== "main" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove task"
                      onClick={() =>
                        setRows((current) =>
                          current.filter((r) => r.key !== row.key)
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
                {kind === "main" && (
                  <Textarea
                    value={row.why}
                    onChange={(e) => setRow(row.key, { why: e.target.value })}
                    placeholder="Why it matters: who is waiting for it, or what it unblocks"
                    rows={2}
                    maxLength={1000}
                    aria-label="Why it matters"
                  />
                )}
                {findings
                  .filter(({ finding }) => row.id && finding.task_id === row.id)
                  .map(({ finding, index }) => (
                    <FindingCard
                      key={index}
                      finding={finding}
                      onApply={() => applyFinding(finding, index)}
                    />
                  ))}
              </div>
            ))}

          {findings
            .filter(
              ({ finding }) => !finding.task_id && finding.task_kind === kind
            )
            .map(({ finding, index }) => (
              <FindingCard
                key={index}
                finding={finding}
                onApply={() => applyFinding(finding, index)}
                applyLabel="Add this task"
              />
            ))}

          {kind !== "main" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRows((current) => [...current, blankRow(kind)])}
            >
              <Plus />
              Add {kind === "gtm" ? "a go-to-market goal" : "a sub-goal"}
            </Button>
          )}
        </section>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          disabled={busy || (!dirty && Boolean(plan))}
          onClick={() => run("save")}
        >
          {(create.isPending || update.isPending) &&
          !submit.isPending &&
          !review.isPending ? (
            <Spinner />
          ) : null}
          {plan ? "Save draft" : "Create draft"}
        </Button>
        {aiAvailable && (
          <Button
            variant="outline"
            disabled={busy || request.length === 0}
            onClick={() => run("review")}
          >
            {review.isPending ? <Spinner /> : <Sparkles />}
            {review.isPending ? "Reviewing your plan…" : "Review with AI"}
          </Button>
        )}
        <Button disabled={busy || !readyToSubmit} onClick={() => run("submit")}>
          {submit.isPending ? <Spinner /> : <Send />}
          Submit for approval
        </Button>
        {!readyToSubmit && (
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <CircleAlert className="size-4" />
            Add a main task and why it matters to submit.
          </span>
        )}
      </div>

      <BrainDumpDialog
        organizationId={organizationId}
        open={notesOpen}
        onOpenChange={setNotesOpen}
        onDraft={fillFromDraft}
      />
    </div>
  );
}

const ISSUE_LABELS: Record<AiFindingResponse["issue"], string> = {
  not_checkable: "Not a checkable result",
  missing_why: "Missing why",
  missing_gtm: "No go-to-market",
  scope_too_big: "Too much for a week",
  unclear: "Unclear",
};

function FindingCard({
  finding,
  onApply,
  applyLabel = "Apply",
}: {
  finding: AiFindingResponse;
  onApply: () => void;
  applyLabel?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border-l-4 bg-muted/50 p-3 text-sm",
        finding.severity === "must_fix"
          ? "border-l-amber-500"
          : "border-l-sky-500"
      )}
    >
      <div className="flex items-center gap-2">
        <Lightbulb className="size-4 text-muted-foreground" />
        <span className="font-medium">{ISSUE_LABELS[finding.issue]}</span>
        {finding.severity === "consider" && (
          <span className="text-xs text-muted-foreground">suggestion</span>
        )}
      </div>
      <p className="mt-1 text-muted-foreground">{finding.problem}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="rounded bg-background px-2 py-1">
          {finding.field === "why" ? "Why: " : ""}
          {finding.suggested_rewrite}
        </span>
        <Button size="sm" variant="secondary" onClick={onApply}>
          {applyLabel}
        </Button>
      </div>
    </div>
  );
}
