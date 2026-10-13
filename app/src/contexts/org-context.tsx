import { createContext, useContext, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { OrganizationResponse } from "@/api/model";

// The organization in the URL (/o/$orgId/...), as the API returned it for
// the current user, including their role in it. Provided by the $orgId
// layout route once the org has loaded.
const OrgContext = createContext<OrganizationResponse | undefined>(undefined);

export function OrgProvider({
  org,
  children,
}: {
  org: OrganizationResponse;
  children: ReactNode;
}) {
  return <OrgContext.Provider value={org}>{children}</OrgContext.Provider>;
}

export function useOrg(): OrganizationResponse & { isManager: boolean } {
  const org = useContext(OrgContext);
  if (!org) {
    throw new Error("useOrg must be used inside an organization route");
  }
  // Owner or org admin: a customer role, unrelated to platform staff.
  return { ...org, isManager: org.role === "owner" || org.role === "admin" };
}

// Refetch everything cached for one organization after a change, so lists,
// plans, approvals and the team week never disagree.
export function useInvalidateOrg() {
  const queryClient = useQueryClient();
  return (organizationId: string) =>
    queryClient.invalidateQueries({
      predicate: ({ queryKey }) =>
        typeof queryKey[0] === "string" &&
        queryKey[0].startsWith(`/organizations/${organizationId}`),
    });
}

const LAST_ORG_KEY = "floppy:last-org";

export function rememberOrg(organizationId: string) {
  try {
    localStorage.setItem(LAST_ORG_KEY, organizationId);
  } catch {
    // Storage can be unavailable (private mode); it's only a convenience.
  }
}

export function lastOrg(): string | null {
  try {
    return localStorage.getItem(LAST_ORG_KEY);
  } catch {
    return null;
  }
}
