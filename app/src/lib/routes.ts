// Public (meta) routes that do not require authentication.
// The AuthGuard treats anything NOT listed here as a protected route.
// Add new auth pages (e.g. "/reset-password") here as they are created.
export const PUBLIC_ROUTES = ["/login", "/signup", "/invites/"];

// Where to go after signing in or up. Only same-app paths are allowed, so a
// crafted link can't bounce someone to another site.
export function safeRedirect(target: unknown): string {
  return typeof target === "string" &&
    target.startsWith("/") &&
    !target.startsWith("//")
    ? target
    : "/";
}

export type AuthSearch = { redirect?: string; email?: string };

export function validateAuthSearch(
  search: Record<string, unknown>
): AuthSearch {
  return {
    redirect:
      typeof search["redirect"] === "string" ? search["redirect"] : undefined,
    email: typeof search["email"] === "string" ? search["email"] : undefined,
  };
}
