import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { KeyRound, MoreHorizontal, Pencil, Plus, UserPlus } from "lucide-react";
import { useUserList } from "@/api/endpoints/users/users";
import type { InternalUserResponse } from "@/api/model";
import { useCurrentUser } from "@/contexts/user-context";
import { UserFormDialog } from "@/components/users/user-form-dialog";
import { ChangePasswordDialog } from "@/components/users/change-password-dialog";
import {
  ActiveToggleItem,
  UserStatusBadges,
} from "@/components/users/user-status";
import { PageHeader, formatDate } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const PAGE_SIZE = 20;

export const Route = createFileRoute("/_main/users/")({ component: UsersPage });

function UsersPage() {
  const currentUser = useCurrentUser();
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<InternalUserResponse | null>(null);
  const [passwordUser, setPasswordUser] = useState<InternalUserResponse | null>(
    null
  );

  const offset = page * PAGE_SIZE;
  const { data, isLoading, isError } = useUserList({
    q: q.trim() || undefined,
    limit: PAGE_SIZE,
    offset,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const showingFrom = total === 0 ? 0 : offset + 1;
  const showingTo = offset + items.length;

  return (
    <>
      <PageHeader
        title="Users"
        description="Find anyone by name or email, see their organizations, and deactivate accounts. Accounts are never deleted."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Add customer account
          </Button>
        }
      />

      <Input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPage(0);
        }}
        placeholder="Search by name or email"
        aria-label="Search users"
        className="sm:max-w-sm"
      />

      <div className="rounded-xl border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-12 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!isLoading && isError && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-sm text-destructive"
                >
                  Failed to load users. Please try again.
                </TableCell>
              </TableRow>
            )}

            {!isLoading && !isError && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <UserPlus className="size-6" />
                    <p className="text-sm">
                      {q ? "Nobody matches that search." : "No users yet."}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {!isLoading &&
              !isError &&
              items.map((user) => {
                const isSelf = currentUser?.id === user.id;
                return (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      <Link
                        to="/users/$userId"
                        params={{ userId: user.id }}
                        className="hover:underline"
                      >
                        {user.first_name} {user.last_name}
                      </Link>
                      {isSelf && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          (you)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.email}
                    </TableCell>
                    <TableCell>
                      <UserStatusBadges user={user} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(user.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label="User actions"
                        >
                          <MoreHorizontal className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => setEditUser(user)}>
                            <Pencil className="size-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setPasswordUser(user)}
                          >
                            <KeyRound className="size-4" />
                            Change password
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <ActiveToggleItem user={user} disabled={isSelf} />
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between border-t px-4 py-3">
          <p className="text-sm text-muted-foreground">
            {total === 0
              ? "No users"
              : `Showing ${showingFrom}–${showingTo} of ${total}`}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={showingTo >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      <UserFormDialog
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
      <UserFormDialog
        mode="edit"
        user={editUser ?? undefined}
        open={editUser !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditUser(null);
          }
        }}
      />
      <ChangePasswordDialog
        user={passwordUser}
        open={passwordUser !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPasswordUser(null);
          }
        }}
      />
    </>
  );
}
