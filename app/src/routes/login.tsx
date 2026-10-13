import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Lock, LogIn, Mail } from "lucide-react";
import { auth } from "@/api/endpoints/auth/auth";
import { ApiError } from "@/lib/api-client";
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
import { safeRedirect, validateAuthSearch } from "@/lib/routes";

const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export const Route = createFileRoute("/login")({
  validateSearch: validateAuthSearch,
  component: Login,
});

function Login() {
  const { redirect, email } = Route.useSearch();
  const [loginError, setLoginError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: email ?? "", password: "" },
    // Validate a field only after it's blurred once, then re-validate live as
    // the user corrects it — so errors never flash while still typing.
    mode: "onTouched",
  });

  const loginMutation = useMutation({
    mutationFn: (data: LoginFormData) => auth(data),
    onSuccess: () => {
      setLoginError("");
      // Clear cached data so no prior session leaks into the new one.
      queryClient.clear();
      navigate({ to: safeRedirect(redirect) });
    },
    onError: (error: unknown) => {
      // Non-2xx responses arrive as ApiError; network failures (no response)
      // arrive as the native fetch TypeError.
      if (!(error instanceof ApiError)) {
        setLoginError(
          "Network error. Please check your connection and try again."
        );
        return;
      }

      if (error.status === 401) {
        setLoginError("Incorrect email or password.");
      } else if (error.status === 422) {
        setLoginError("Please check your credentials and try again.");
      } else {
        setLoginError("Login failed. Please try again.");
      }
    },
  });

  const onSubmit = (data: LoginFormData) => {
    setLoginError("");
    loginMutation.mutate(data);
  };

  return (
    <AuthLayout
      title="Welcome back"
      description="Sign in to plan your week."
      footer={
        <>
          New to Floppy?{" "}
          <Link
            to="/signup"
            search={{ redirect, email }}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                {/* FormControl wraps the input itself so the label's htmlFor
                    and aria-describedby land on the field, not a wrapper. */}
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      className="h-11 pl-9"
                      autoComplete="email"
                      {...field}
                    />
                  </FormControl>
                </div>
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
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <FormControl>
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Password"
                      className="h-11 pl-9 pr-9"
                      autoComplete="current-password"
                      {...field}
                    />
                  </FormControl>
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    disabled={!field.value?.length}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {loginError && (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-center text-sm text-destructive">
              {loginError}
            </div>
          )}

          <Button
            type="submit"
            className="h-11 w-full text-sm"
            disabled={loginMutation.isPending || !form.formState.isValid}
          >
            <LogIn className="size-4" />
            {loginMutation.isPending ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </Form>
    </AuthLayout>
  );
}
