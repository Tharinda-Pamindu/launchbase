import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { signup } from "@/api/endpoints/auth/auth";
import { SignupBody } from "@/api/zod/auth/auth.zod";
import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { errorMessage, errorStatus } from "@/lib/errors";
import { safeRedirect, validateAuthSearch } from "@/lib/routes";

// The generated schema is the API contract; these add messages people read.
const signupSchema = SignupBody.extend({
  first_name: z.string().trim().min(1, "Enter your first name").max(100),
  last_name: z.string().trim().min(1, "Enter your last name").max(100),
  email: z.string().min(1, "Email is required").email("Invalid email address"),
  password: z
    .string()
    .min(8, "Use at least 8 characters")
    .max(128, "Use at most 128 characters"),
});

type SignupFormData = z.infer<typeof signupSchema>;

export const Route = createFileRoute("/signup")({
  validateSearch: validateAuthSearch,
  component: Signup,
});

function Signup() {
  const { redirect, email } = Route.useSearch();
  const [formError, setFormError] = useState("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const form = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      email: email ?? "",
      password: "",
    },
    mode: "onTouched",
  });

  const signupMutation = useMutation({
    mutationFn: (data: SignupFormData) => signup(data),
    onSuccess: () => {
      queryClient.clear();
      navigate({ to: safeRedirect(redirect) });
    },
    onError: (error: unknown) => {
      if (errorStatus(error) === 409) {
        form.setError("email", {
          message:
            "There's already an account with this email. Sign in instead.",
        });
        return;
      }
      setFormError(errorMessage(error, "Sign-up failed. Please try again."));
    },
  });

  return (
    <AuthLayout
      title="Create your account"
      description="Less strain. More brain. Plan the week your team will actually ship."
      footer={
        <>
          Already have an account?{" "}
          <Link
            to="/login"
            search={{ redirect, email }}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((data) => {
            setFormError("");
            signupMutation.mutate(data);
          })}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="first_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First name</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="given-name"
                      className="h-11"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="last_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Last name</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="family-name"
                      className="h-11"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Work email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder="you@company.com"
                    className="h-11"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    className="h-11"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {formError && (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-center text-sm text-destructive">
              {formError}
            </div>
          )}

          <Button
            type="submit"
            className="h-11 w-full text-sm"
            disabled={signupMutation.isPending}
          >
            <UserPlus className="size-4" />
            {signupMutation.isPending
              ? "Creating your account..."
              : "Create account"}
          </Button>
        </form>
      </Form>
    </AuthLayout>
  );
}
