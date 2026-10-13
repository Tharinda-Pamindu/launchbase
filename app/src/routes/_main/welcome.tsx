import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, Link2 } from "lucide-react";
import {
  getOrganizationListQueryKey,
  useOrganizationCreate,
  useOrganizationList,
} from "@/api/endpoints/organizations/organizations";
import { OrganizationCreateBody } from "@/api/zod/organizations/organizations.zod";
import { PageHeader } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useCurrentUser } from "@/contexts/user-context";
import { rememberOrg } from "@/contexts/org-context";
import { errorMessage } from "@/lib/errors";

const createSchema = OrganizationCreateBody.extend({
  name: z.string().trim().min(1, "Give your organization a name").max(100),
});

export const Route = createFileRoute("/_main/welcome")({ component: Welcome });

function Welcome() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const orgs = useOrganizationList();
  const create = useOrganizationCreate();
  const form = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: "" },
  });

  const onSubmit = form.handleSubmit((data) =>
    create.mutate(
      { data },
      {
        onSuccess: (org) => {
          rememberOrg(org.id);
          queryClient.invalidateQueries({
            queryKey: getOrganizationListQueryKey(),
          });
          navigate({ to: "/o/$orgId/teams", params: { orgId: org.id } });
        },
        onError: (error) =>
          form.setError("name", { message: errorMessage(error) }),
      }
    )
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={`Welcome${user ? `, ${user.first_name}` : ""}`}
        description="Floppy plans weeks for a team. Start an organization for yours, or join one you were invited to."
      />

      {(orgs.data?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Your organizations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {orgs.data?.map((org) =>
              org.is_suspended ? (
                <div
                  key={org.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <span className="text-muted-foreground">{org.name}</span>
                  <Badge variant="outline">Suspended</Badge>
                </div>
              ) : (
                <Link
                  key={org.id}
                  to="/o/$orgId/week"
                  params={{ orgId: org.id }}
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted"
                >
                  <span className="font-medium">{org.name}</span>
                  <span className="text-sm text-muted-foreground capitalize">
                    {org.role}
                  </span>
                </Link>
              )
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="size-4" /> Start an organization
          </CardTitle>
          <CardDescription>
            You&apos;ll be its owner. Next you&apos;ll set up a team and invite
            people.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={onSubmit}
              className="flex flex-col gap-3 sm:flex-row sm:items-start"
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel className="sr-only">Organization name</FormLabel>
                    <FormControl>
                      <Input placeholder="Northwind Labs" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "Creating..." : "Create organization"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="size-4" /> Joining a team?
          </CardTitle>
          <CardDescription>
            Ask an owner or admin for an invite link and open it while signed in
            as {user?.email ?? "this account"}.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
