"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Logo from "@/components/Logo";

// Single-screen centered login: logo + form, no scroll.
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
      login({ name: res.name, email: res.email });
      router.replace("/studio");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-background">
      {/* Full-screen blue glow background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/4 top-1/4 h-[50vh] w-[50vw] rounded-full bg-accent-2/30 blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 h-[40vh] w-[40vw] rounded-full bg-accent/25 blur-[100px]" />
      </div>

      {/* Centered single-screen card */}
      <div className="relative z-10 mx-auto w-full max-w-sm space-y-4 px-5 fade-up">
        {/* Logo */}
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="pointer-events-none absolute left-1/2 top-0 -z-10 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/40 blur-[70px]" />
          <Logo className="h-14 w-auto" />
        </div>

        {/* Form card */}
        <div className="card-hover rounded-2xl border border-white/10 bg-surface/80 p-5 shadow-2xl backdrop-blur-md">
          <div className="mb-5">
            <h2 className="text-xl font-semibold text-foreground">
              Welcome Back
            </h2>
            <p className="mt-1 text-xs text-muted">Sign in to your voice studio</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="email"
                className="px-1 text-[10px] uppercase tracking-widest text-muted"
              >
                Email Address
              </label>
              <input
                id="email"
                type="email"
                placeholder="name@studio.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="field w-full rounded-xl border border-transparent bg-surface-2 px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted/50"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor="password"
                className="px-1 text-[10px] uppercase tracking-widest text-muted"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="field w-full rounded-xl border border-transparent bg-surface-2 px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted/50"
              />
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="lift sheen gradient-accent mt-2 rounded-xl py-3 text-sm font-semibold text-white shadow-[0_0_20px_var(--accent-glow)] hover:shadow-[0_0_32px_var(--accent-glow)] active:scale-[0.98] disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Continue to Studio"}
            </button>
          </form>
        </div>

        <div className="text-center">
          <p className="text-xs text-muted">
            Don&apos;t have an account?{" "}
            <Link
              href="/register"
              className="font-semibold text-accent-2 underline-offset-4 hover:underline"
            >
              Sign up free
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
