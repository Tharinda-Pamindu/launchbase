import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";

// Shared frame for the sign-in, sign-up and invite pages.
export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-6 text-center">
          <Logo className="h-9" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
        <div className="rounded-xl border bg-background p-6 shadow-sm">
          {children}
        </div>
        {footer && (
          <div className="mt-8 text-center text-sm text-muted-foreground">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
