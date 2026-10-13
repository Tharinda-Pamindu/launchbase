import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Ban, SearchX, ServerCrash, type LucideIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { errorCode, errorMessage, errorStatus } from "@/lib/errors";

export function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground"
      role="status"
    >
      <Spinner />
      {label}
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

// A failed load, explained: forbidden pages say so, missing things say so,
// and anything else offers a retry.
export function ErrorState({
  error,
  notFound = "This page doesn't exist, or it isn't shared with you.",
  onRetry,
}: {
  error: unknown;
  notFound?: string;
  onRetry?: () => void;
}) {
  const status = errorStatus(error);
  if (errorCode(error) === "organization_suspended") {
    return (
      <EmptyState
        icon={Ban}
        title="This organization is suspended"
        description="Its plans are safe, but nobody can use it until it's reinstated. Contact support to sort it out."
      >
        <Link to="/welcome" className={buttonVariants({ variant: "outline" })}>
          Go to my organizations
        </Link>
      </EmptyState>
    );
  }
  if (status === 403) {
    return (
      <EmptyState
        icon={Ban}
        title="You don't have access to this"
        description={errorMessage(error)}
      />
    );
  }
  if (status === 404) {
    return (
      <EmptyState icon={SearchX} title="Not found" description={notFound} />
    );
  }
  return (
    <EmptyState
      icon={ServerCrash}
      title="Couldn't load this"
      description={errorMessage(error)}
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
