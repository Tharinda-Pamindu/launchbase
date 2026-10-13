import { useState } from "react";
import { Sparkles } from "lucide-react";
import { usePlanDraftCreate } from "@/api/endpoints/ai/ai";
import type { PlanDraftResponse } from "@/api/model";
import { Button } from "@/components/ui/button";
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

const MIN = 10;
const MAX = 4000;

export function BrainDumpDialog({
  organizationId,
  open,
  onOpenChange,
  onDraft,
}: {
  organizationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDraft: (draft: PlanDraftResponse) => void;
}) {
  const [notes, setNotes] = useState("");
  const draft = usePlanDraftCreate();
  const length = notes.trim().length;

  const run = () =>
    draft.mutate(
      { organizationId, data: { notes: notes.trim() } },
      {
        onSuccess: (result) => {
          onDraft(result);
          onOpenChange(false);
          setNotes("");
          draft.reset();
        },
      }
    );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !draft.isPending && onOpenChange(next)}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Draft my plan from notes</DialogTitle>
          <DialogDescription>
            Paste whatever is on your mind for the week. Floppy turns it into a
            main task, sub-goals and go-to-market goals for you to edit. Nothing
            is saved until you save the plan.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={8}
          maxLength={MAX}
          disabled={draft.isPending}
          placeholder="need to finish the billing page, probably also fix that webhook bug, should announce it in the changelog…"
          aria-label="Your notes"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{length < MIN ? `At least ${MIN} characters` : " "}</span>
          <span>
            {notes.length}/{MAX}
          </span>
        </div>
        {draft.isError && (
          <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {errorMessage(draft.error)}
          </p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={draft.isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button disabled={length < MIN || draft.isPending} onClick={run}>
            {draft.isPending ? <Spinner /> : <Sparkles />}
            {draft.isPending ? "Drafting your plan…" : "Draft my plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
