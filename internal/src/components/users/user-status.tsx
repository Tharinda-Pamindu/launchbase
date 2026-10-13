import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserCheck, UserX } from "lucide-react";
import {
  getUserGetQueryKey,
  getUserListQueryKey,
  useUserUpdate,
} from "@/api/endpoints/users/users";
import type { InternalUserResponse } from "@/api/model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { getApiErrorMessage } from "@/lib/api-error";

// "Staff" is platform staff (users.is_admin), who can use this console. It is
// deliberately not called "admin": an org admin is a customer role.
export function UserStatusBadges({ user }: { user: InternalUserResponse }) {
  return (
    <div className="flex flex-wrap gap-1">
      {user.is_admin ? (
        <Badge className="border-transparent bg-amber-400 text-amber-950">
          Staff
        </Badge>
      ) : (
        <Badge variant="outline">Customer</Badge>
      )}
      {!user.is_active && <Badge variant="destructive">Deactivated</Badge>}
    </div>
  );
}

function useActiveToggle(user: InternalUserResponse) {
  const queryClient = useQueryClient();
  const update = useUserUpdate({
    mutation: {
      onSuccess: async (updated) => {
        toast.success(
          updated.is_active
            ? `${updated.first_name} can sign in again`
            : `${updated.first_name} is deactivated and signed out`
        );
        await queryClient.invalidateQueries({
          queryKey: getUserListQueryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: getUserGetQueryKey(user.id),
        });
      },
      onError: (error) =>
        toast.error(getApiErrorMessage(error, "Couldn't update the account")),
    },
  });
  const toggle = () =>
    update.mutate({ userId: user.id, data: { is_active: !user.is_active } });
  return { toggle, isPending: update.isPending };
}

export function ActiveToggleItem({
  user,
  disabled,
}: {
  user: InternalUserResponse;
  disabled?: boolean;
}) {
  const { toggle, isPending } = useActiveToggle(user);
  return (
    <DropdownMenuItem
      variant={user.is_active ? "destructive" : "default"}
      disabled={disabled || isPending}
      onClick={toggle}
    >
      {user.is_active ? (
        <UserX className="size-4" />
      ) : (
        <UserCheck className="size-4" />
      )}
      {user.is_active ? "Deactivate" : "Reactivate"}
    </DropdownMenuItem>
  );
}

export function ActiveToggleButton({
  user,
  disabled,
}: {
  user: InternalUserResponse;
  disabled?: boolean;
}) {
  const { toggle, isPending } = useActiveToggle(user);
  return (
    <Button
      variant={user.is_active ? "destructive" : "outline"}
      disabled={disabled || isPending}
      onClick={toggle}
    >
      {user.is_active ? <UserX /> : <UserCheck />}
      {user.is_active ? "Deactivate account" : "Reactivate account"}
    </Button>
  );
}
