import { useState } from "react";
import { toast } from "sonner";
import { Check, CornerUpLeft, Flag, MessageSquare, Undo2 } from "lucide-react";
import {
  usePlanApprove,
  usePlanComplete,
  usePlanRequestChanges,
  usePlanTaskUpdate,
  usePlanWithdraw,
} from "@/api/endpoints/plans/plans";
import type { PlanResponse, TaskResponse } from "@/api/model";
import {
  ShippedBadge,
  StatusBadge,
  TASK_KINDS,
} from "@/components/plan/status";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { formatDateTime, weekLabel, weekRange } from "@/lib/week";

// A plan that isn't an editable draft for the viewer: the author's view
// during the week, or the lead's view when reviewing it.
export function PlanView({
  organizationId,
  plan,
  isMine,
  onChange,
}: {
  organizationId: string;
  plan: PlanResponse;
  isMine: boolean;
  onChange: (plan: PlanResponse) => void;
}) {
  const [dialog, setDialog] = useState<
    "approve" | "send_back" | "complete" | null
  >(null);
  const can = plan.permissions;
  const withdraw = usePlanWithdraw();
  const tick = usePlanTaskUpdate();
  const done = plan.tasks.filter((t) => t.is_done).length;

  const toggle = (task: TaskResponse, isDone: boolean) =>
    tick.mutate(
      {
        organizationId,
        planId: plan.id,
        taskId: task.id,
        data: { is_done: isDone },
      },
      {
        onSuccess: (updated) =>
          onChange({
            ...plan,
            tasks: plan.tasks.map((t) => (t.id === updated.id ? updated : t)),
          }),
        onError: (error) => toast.error(errorMessage(error)),
      }
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={plan.status} />
        <ShippedBadge shipped={plan.main_goal_shipped} />
        <span className="text-sm text-muted-foreground">
          {isMine ? "" : `${plan.author_name} · `}
          {weekLabel(plan.week_start)} ({weekRange(plan.week_start)}) · {done}/
          {plan.tasks.length} tasks done
        </span>
      </div>

      {plan.status === "submitted" && isMine && (
        <p className="rounded-lg border bg-background p-3 text-sm text-muted-foreground">
          Waiting for your lead to approve it. You can withdraw it to make
          changes.
        </p>
      )}
      {plan.status === "approved" && isMine && (
        <p className="rounded-lg border bg-background p-3 text-sm text-muted-foreground">
          Approved. Tick tasks off as you finish them, and close the week on
          Friday.
        </p>
      )}
      {plan.status === "done" && plan.outcome_note && (
        <p className="rounded-lg border bg-background p-3 text-sm">
          <span className="font-medium">How it went: </span>
          {plan.outcome_note}
        </p>
      )}

      {(Object.keys(TASK_KINDS) as (keyof typeof TASK_KINDS)[]).map((kind) => {
        const tasks = plan.tasks.filter((t) => t.kind === kind);
        return (
          <section key={kind} className="rounded-xl border bg-background p-4">
            <h3 className="font-medium">{TASK_KINDS[kind].label}</h3>
            {tasks.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">None.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {tasks.map((task) => (
                  <li key={task.id} className="flex gap-3">
                    <Checkbox
                      className="mt-0.5"
                      checked={task.is_done}
                      disabled={!can.tick_tasks || tick.isPending}
                      onCheckedChange={(checked) => toggle(task, checked)}
                      aria-label={`Mark "${task.title}" done`}
                    />
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "text-sm",
                          task.is_done && "text-muted-foreground line-through"
                        )}
                      >
                        {task.title}
                        {task.estimate_hours && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {task.estimate_hours}h
                          </span>
                        )}
                      </p>
                      {task.why && (
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          Why: {task.why}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {plan.reviews.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-medium">Review history</h3>
          {plan.reviews.map((review) => (
            <div
              key={review.id}
              className="flex gap-3 rounded-lg border bg-background p-3 text-sm"
            >
              {review.action === "approved" ? (
                <Check className="size-4 shrink-0 text-emerald-600" />
              ) : (
                <CornerUpLeft className="size-4 shrink-0 text-amber-600" />
              )}
              <div>
                <p>
                  <span className="font-medium">
                    {review.reviewer_name ?? "Someone"}
                  </span>{" "}
                  {review.action === "approved"
                    ? "approved it"
                    : "sent it back"}{" "}
                  ·{" "}
                  <span className="text-muted-foreground">
                    {formatDateTime(review.created_at)}
                  </span>
                </p>
                {review.comment && <p className="mt-1">{review.comment}</p>}
              </div>
            </div>
          ))}
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {can.review && (
          <>
            <Button onClick={() => setDialog("approve")}>
              <Check />
              Approve
            </Button>
            <Button variant="outline" onClick={() => setDialog("send_back")}>
              <MessageSquare />
              Send back with a comment
            </Button>
          </>
        )}
        {can.withdraw && (
          <Button
            variant="outline"
            disabled={withdraw.isPending}
            onClick={() =>
              withdraw.mutate(
                { organizationId, planId: plan.id },
                {
                  onSuccess: onChange,
                  onError: (e) => toast.error(errorMessage(e)),
                }
              )
            }
          >
            {withdraw.isPending ? <Spinner /> : <Undo2 />}
            Withdraw to edit
          </Button>
        )}
        {can.complete && (
          <Button onClick={() => setDialog("complete")}>
            <Flag />
            Close the week
          </Button>
        )}
      </div>

      <ReviewDialog
        organizationId={organizationId}
        plan={plan}
        mode={dialog === "approve" || dialog === "send_back" ? dialog : null}
        onClose={() => setDialog(null)}
        onDone={onChange}
      />
      <CompleteDialog
        organizationId={organizationId}
        plan={plan}
        open={dialog === "complete"}
        onClose={() => setDialog(null)}
        onDone={onChange}
      />
    </div>
  );
}

function ReviewDialog({
  organizationId,
  plan,
  mode,
  onClose,
  onDone,
}: {
  organizationId: string;
  plan: PlanResponse;
  mode: "approve" | "send_back" | null;
  onClose: () => void;
  onDone: (plan: PlanResponse) => void;
}) {
  const [comment, setComment] = useState("");
  const approve = usePlanApprove();
  const sendBack = usePlanRequestChanges();
  const pending = approve.isPending || sendBack.isPending;
  const sendingBack = mode === "send_back";

  const handlers = {
    onSuccess: (updated: PlanResponse) => {
      toast.success(sendingBack ? "Sent back to the author" : "Plan approved");
      setComment("");
      onClose();
      onDone(updated);
    },
    onError: (error: unknown) => toast.error(errorMessage(error)),
  };

  const confirm = () =>
    sendingBack
      ? sendBack.mutate(
          {
            organizationId,
            planId: plan.id,
            data: { comment: comment.trim() },
          },
          handlers
        )
      : approve.mutate(
          {
            organizationId,
            planId: plan.id,
            data: { comment: comment.trim() || null },
          },
          handlers
        );

  return (
    <Dialog
      open={mode !== null}
      onOpenChange={(open) => !open && !pending && onClose()}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {sendingBack
              ? "Send the plan back"
              : `Approve ${plan.author_name}'s plan`}
          </DialogTitle>
          <DialogDescription>
            {sendingBack
              ? "It goes back to a draft. Say what to change so they can fix it and resubmit."
              : "They'll start ticking tasks off. A comment is optional."}
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder={
            sendingBack
              ? "The main task won't fit in a week. Pick the half that ships."
              : "Good scope."
          }
          aria-label="Comment"
        />
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={pending || (sendingBack && !comment.trim())}
            onClick={confirm}
          >
            {pending && <Spinner />}
            {sendingBack ? "Send back" : "Approve"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompleteDialog({
  organizationId,
  plan,
  open,
  onClose,
  onDone,
}: {
  organizationId: string;
  plan: PlanResponse;
  open: boolean;
  onClose: () => void;
  onDone: (plan: PlanResponse) => void;
}) {
  const [shipped, setShipped] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const complete = usePlanComplete();
  const main = plan.tasks.find((t) => t.kind === "main");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && !complete.isPending && onClose()}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close the week</DialogTitle>
          <DialogDescription>Did the main task ship?</DialogDescription>
        </DialogHeader>
        {main && (
          <p className="rounded-lg bg-muted p-3 text-sm">{main.title}</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          {[true, false].map((value) => (
            <Button
              key={String(value)}
              variant={shipped === value ? "default" : "outline"}
              onClick={() => setShipped(value)}
              aria-pressed={shipped === value}
            >
              {value ? "Yes, it shipped" : "No, it didn't"}
            </Button>
          ))}
        </div>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Optional: what happened, and what carries over"
          aria-label="Note"
        />
        <DialogFooter>
          <Button
            variant="outline"
            disabled={complete.isPending}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            disabled={shipped === null || complete.isPending}
            onClick={() =>
              shipped !== null &&
              complete.mutate(
                {
                  organizationId,
                  planId: plan.id,
                  data: {
                    main_goal_shipped: shipped,
                    outcome_note: note.trim() || null,
                  },
                },
                {
                  onSuccess: (updated) => {
                    toast.success(
                      shipped ? "Week closed. Nice work." : "Week closed."
                    );
                    onClose();
                    onDone(updated);
                  },
                  onError: (error) => toast.error(errorMessage(error)),
                }
              )
            }
          >
            {complete.isPending && <Spinner />}
            Close the week
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
