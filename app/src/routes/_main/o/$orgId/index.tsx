import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_main/o/$orgId/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/o/$orgId/week", params });
  },
});
