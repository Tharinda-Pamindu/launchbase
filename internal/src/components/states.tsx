import type { ReactNode } from "react";
import { SearchX, ServerCrash, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";

export function PageLoader() {
  return (
    <div
      className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground"
      role="status"
    >
      <Spinner />
      Loading…
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Empty className="rounded-xl border border-dashed bg-background">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {children && <EmptyContent>{children}</EmptyContent>}
    </Empty>
  );
}

export function ErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  if (error instanceof ApiError && error.status === 404) {
    return (
      <EmptyState
        icon={SearchX}
        title="Not found"
        description="It may have been removed."
      />
    );
  }
  return (
    <EmptyState
      icon={ServerCrash}
      title="Couldn't load this"
      description={getApiErrorMessage(
        error,
        "Something went wrong. Please try again."
      )}
    >
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      )}
    </EmptyState>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Plain wording for the AI usage error kinds the API records.
export function errorKindLabel(kind: string | null): string {
  if (!kind) {
    return "—";
  }
  if (kind.startsWith("provider_http_")) {
    return `Provider error ${kind.slice(14)}`;
  }
  return (
    {
      not_configured: "AI not configured",
      local_limit: "Our per-user limit",
      provider_rate_limit: "Gemini rate limit (429)",
      provider_unreachable: "Couldn't reach Gemini",
      timeout: "Timed out",
      invalid_output: "Unusable output",
      unexpected: "Unexpected error",
    }[kind] ?? kind
  );
}

export function OutcomeBadge({
  outcome,
}: {
  outcome: "succeeded" | "failed" | "rate_limited";
}) {
  if (outcome === "succeeded") {
    return <Badge variant="outline">Succeeded</Badge>;
  }
  if (outcome === "rate_limited") {
    return <Badge variant="secondary">Rate-limited</Badge>;
  }
  return <Badge variant="destructive">Failed</Badge>;
}
