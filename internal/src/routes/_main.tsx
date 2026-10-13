import { Outlet, createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { Sidebar } from "@/components/dashboard/sidebar";

// Pathless layout route: every route file under `src/routes/_main/` renders
// inside this chrome and behind the auth guard, without `_main` appearing in
// the URL. Public pages (e.g. /login) live outside it.
export const Route = createFileRoute("/_main")({ component: MainLayout });

function MainLayout() {
  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden bg-muted/30">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Always visible, so nobody mistakes this for the customer app. */}
          <div className="flex shrink-0 items-center gap-2 bg-amber-400 px-6 py-1.5 text-xs font-medium text-amber-950">
            <ShieldCheck className="size-3.5" />
            Internal staff console. Customers never see this, and it never shows
            the content of their plans.
          </div>
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
