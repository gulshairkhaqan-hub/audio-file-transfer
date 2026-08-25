"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Logo from "@/components/Logo";
import PasswordField from "@/components/PasswordField";

// Clean, centered single-screen login on a white canvas.
export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }
    setLoading(true);
    try {
      const res = await api.login(email, password);
      login({ name: res.name, email: res.email, token: res.token });
      router.replace("/studio");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-sm fade-up">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <Logo className="h-9 w-auto" />
        </div>

        {/* Form card */}
        <div className="rounded-2xl border border-border bg-surface p-7 shadow-sm">
          <div className="mb-6">
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Welcome back
            </h1>
            <p className="mt-1 text-sm text-muted">Sign in to your voice studio.</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="email"
                className="ml-1 text-[11px] font-medium uppercase tracking-widest text-muted"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                placeholder="name@studio.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="field w-full rounded-xl border border-transparent bg-surface-2 px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted/60"
              />
            </div>

            <PasswordField
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
            />

            {error && <p className="text-xs font-medium text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="lift gradient-accent mt-2 flex items-center justify-center rounded-xl py-3 text-sm font-semibold text-white active:scale-[0.99] disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-muted">
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="font-medium text-accent-2 hover:underline"
          >
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}
