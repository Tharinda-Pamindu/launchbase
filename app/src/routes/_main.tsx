import { useState } from "react";
import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { Logo } from "@/components/Logo";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

// Pathless layout route: every route file under `src/routes/_main/` renders
// inside this chrome and behind the auth guard, without `_main` appearing in
// the URL. Public pages (e.g. /login) live outside it.
export const Route = createFileRoute("/_main")({ component: MainLayout });

function MainLayout() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden bg-muted/30">
        <Sidebar className="hidden md:flex" />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Phones get a top bar; the sidebar opens as a sheet. */}
          <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-4 md:hidden">
            <Link to="/" aria-label="Floppy home">
              <Logo className="h-6" />
            </Link>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Open menu"
              onClick={() => setMenuOpen(true)}
            >
              <Menu />
            </Button>
          </header>
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-64 p-0" showCloseButton={false}>
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <Sidebar
            className="flex w-full border-r-0"
            onNavigate={() => setMenuOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </AuthGuard>
  );
}
