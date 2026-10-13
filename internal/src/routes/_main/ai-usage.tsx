import { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import {
  useAiUsageEventList,
  useAiUsageSummary,
} from "@/api/endpoints/ai-usage/ai-usage";
import {
  EmptyState,
  ErrorState,
  OutcomeBadge,
  PageHeader,
  PageLoader,
  Stat,
  errorKindLabel,
  formatDateTime,
} from "@/components/states";
import { Button } from "@/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Outcome = "succeeded" | "failed" | "rate_limited";
const PAGE_SIZE = 25;

export const Route = createFileRoute("/_main/ai-usage")({
  validateSearch: (
    search: Record<string, unknown>
  ): { organizationId?: string } => ({
    organizationId:
      typeof search["organizationId"] === "string"
        ? search["organizationId"]
        : undefined,
  }),
  component: AiUsage,
});

function AiUsage() {
  const { organizationId } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [days, setDays] = useState(30);
  const [outcome, setOutcome] = useState<Outcome | "">("");
  const [page, setPage] = useState(0);
  const summary = useAiUsageSummary({ days });
  const events = useAiUsageEventList({
    organization_id: organizationId,
    outcome: outcome || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });
  const s = summary.data;
  const filteredOrg = s?.organizations.find(
    (o) => o.organization_id === organizationId
  );

  return (
    <>
      <PageHeader
        title="AI usage"
        description="Every plan review and brain-dump draft is recorded against the organization that made it. Metadata only: no prompts or outputs are stored."
        actions={
          <NativeSelect
            value={String(days)}
            onChange={(e) => setDays(Number(e.target.value))}
            aria-label="Period"
          >
            <NativeSelectOption value="7">Last 7 days</NativeSelectOption>
            <NativeSelectOption value="30">Last 30 days</NativeSelectOption>
            <NativeSelectOption value="90">Last 90 days</NativeSelectOption>
          </NativeSelect>
        }
      />

      {summary.isLoading ? (
        <PageLoader />
      ) : summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
      ) : s && s.calls === 0 ? (
        <EmptyState icon={Sparkles} title="No AI calls in this period" />
      ) : (
        s && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Calls" value={s.calls} />
              <Stat label="Succeeded" value={s.succeeded} />
              <Stat
                label="Failed"
                value={s.failed}
                hint="Timeouts, provider errors, unusable output"
              />
              <Stat
                label="Rate-limited"
                value={s.rate_limited}
                hint="Gemini 429s and our per-user limit"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Cost: {s.input_tokens.toLocaleString()} input and{" "}
              {s.output_tokens.toLocaleString()} output tokens.
            </p>
            <div className="rounded-xl border bg-background">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organization</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead className="text-right">Failed</TableHead>
                    <TableHead className="text-right">Rate-limited</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead>Last call</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.organizations.map((o) => (
                    <TableRow key={o.organization_id}>
                      <TableCell>
                        <Link
                          to="/organizations/$orgId"
                          params={{ orgId: o.organization_id }}
                          className="font-medium hover:underline"
                        >
                          {o.organization_name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {o.calls}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {o.failed}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {o.rate_limited}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {(o.input_tokens + o.output_tokens).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateTime(o.last_call_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            Calls
            {organizationId
              ? ` from ${filteredOrg?.organization_name ?? "one organization"}`
              : ""}
          </h2>
          <div className="flex gap-2">
            {organizationId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate({ search: {} })}
              >
                All organizations
              </Button>
            )}
            <NativeSelect
              size="sm"
              value={outcome}
              onChange={(e) => {
                setOutcome(e.target.value as Outcome | "");
                setPage(0);
              }}
              aria-label="Outcome"
            >
              <NativeSelectOption value="">Every outcome</NativeSelectOption>
              <NativeSelectOption value="failed">Failed</NativeSelectOption>
              <NativeSelectOption value="rate_limited">
                Rate-limited
              </NativeSelectOption>
              <NativeSelectOption value="succeeded">
                Succeeded
              </NativeSelectOption>
            </NativeSelect>
          </div>
        </div>
        {events.isError ? (
          <ErrorState error={events.error} onRetry={() => events.refetch()} />
        ) : (
          <div className="rounded-xl border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Feature</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Why it failed</TableHead>
                  <TableHead className="text-right">Latency</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(events.data?.items ?? []).map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(e.created_at)}
                    </TableCell>
                    <TableCell>{e.organization_name}</TableCell>
                    <TableCell>
                      {e.operation === "plan_review"
                        ? "Plan review"
                        : "Draft from notes"}
                    </TableCell>
                    <TableCell>
                      <OutcomeBadge outcome={e.outcome} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {errorKindLabel(e.error_kind)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {(e.latency_ms / 1000).toFixed(1)}s
                    </TableCell>
                  </TableRow>
                ))}
                {events.data?.items.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      No calls match.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-sm text-muted-foreground">
                {events.data?.total ?? 0} calls
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={(page + 1) * PAGE_SIZE >= (events.data?.total ?? 0)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
