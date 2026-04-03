"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { AuthError } from "@supabase/supabase-js";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "./AuthProvider";

type AuthMode = "sign-in" | "sign-up" | "reset";

function getErrorMessage(error: unknown): string {
  if (!error) return "Unknown authentication error.";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "Authentication failed. Please try again.";
}

export default function AuthScreen() {
  const { signIn, signUp, resetPassword, loading } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    setSuccessMessage(null);
  }, [mode]);

  const canSubmit = useMemo(() => {
    if (!email.trim()) return false;
    if (mode === "reset") return true;
    if (!password) return false;
    if (mode === "sign-up") return password.length >= 12 && password === confirmPassword;
    return true;
  }, [email, password, confirmPassword, mode]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setSuccessMessage(null);

    try {
      if (mode === "sign-in") {
        const { error } = await signIn(email.trim(), password);
        if (error) throw error;
        toast({ title: "Signed in", description: "Welcome back!", variant: "success" });
      } else if (mode === "sign-up") {
        const { error } = await signUp(email.trim(), password);
        if (error) throw error;
        setSuccessMessage(
          "Account created. Please check your inbox to verify your email before signing in."
        );
      } else {
        const { error } = await resetPassword(email.trim());
        if (error) throw error;
        setSuccessMessage(
          "Password reset email sent. Follow the instructions in your inbox to complete the process."
        );
      }
    } catch (error) {
      const authError = error as AuthError;
      toast({
        title: "Authentication error",
        description: getErrorMessage(authError),
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4">
        <Spinner size={32} aria-label="Loading authentication state" />
        <p className="text-muted text-sm">Checking authentication…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="max-w-md w-full space-y-8 bg-surface-elevated border border-border rounded-2xl shadow-card p-8">
        <div className="space-y-2 text-center">
          <Image
            src="/chinese.svg"
            alt="Friendly character illustration"
            width={96}
            height={96}
            className="mx-auto h-24 w-24"
            priority
          />
          <h1 className="text-2xl font-semibold text-foreground">Glotter</h1>
          <p className="text-muted text-sm">
            {mode === "sign-in" && "Sign in to manage your translation projects."}
            {mode === "sign-up" && "Create an account to start managing translations with your team."}
            {mode === "reset" && "Enter your email to receive a password reset link."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-muted">Email</label>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="you@example.com"
            />
          </div>

          {mode !== "reset" && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-muted">Password</label>
              <input
                type="password"
                autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder={mode === "sign-up" ? "At least 12 characters" : "••••••••••••"}
              />
              {mode === "sign-up" && (
                <p className="text-xs text-muted">
                  Use at least 12 characters, including upper & lowercase letters and a number or symbol.
                </p>
              )}
            </div>
          )}

          {mode === "sign-up" && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-muted">Confirm password</label>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="Repeat your password"
              />
              {confirmPassword && confirmPassword !== password && (
                <p className="text-xs text-danger">Passwords must match.</p>
              )}
            </div>
          )}

          {successMessage && (
            <div className="rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-success">
              {successMessage}
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={submitting || !canSubmit}
          >
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <Spinner size={16} />
                Processing…
              </span>
            ) : mode === "sign-in" ? (
              "Sign in"
            ) : mode === "sign-up" ? (
              "Create account"
            ) : (
              "Send reset link"
            )}
          </Button>
        </form>

        <div className="hidden space-y-2 text-center text-sm text-muted">
          {mode === "sign-in" && (
            <>
              <button
                type="button"
                className="text-primary font-medium hover:underline"
                onClick={() => setMode("reset")}
              >
                Forgot password?
              </button>
              <div>
                Need an account?{" "}
                <button
                  type="button"
                  className="text-primary font-medium hover:underline"
                  onClick={() => setMode("sign-up")}
                >
                  Create one
                </button>
              </div>
            </>
          )}
          {mode === "sign-up" && (
            <div>
              Already have an account?{" "}
              <button
                type="button"
                className="text-primary font-medium hover:underline"
                onClick={() => setMode("sign-in")}
              >
                Sign in
              </button>
            </div>
          )}
          {mode === "reset" && (
            <div>
              Remembered your password?{" "}
              <button
                type="button"
                className="text-primary font-medium hover:underline"
                onClick={() => setMode("sign-in")}
              >
                Return to sign in
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
