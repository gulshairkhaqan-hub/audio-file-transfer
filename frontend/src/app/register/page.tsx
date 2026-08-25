"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import Logo from "@/components/Logo";
import PasswordField from "@/components/PasswordField";

// Clean, centered single-screen register on a white canvas.
export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!name || !email || !password) {
      setError("Please fill in all fields.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      await api.register(name, email, password);
      setSuccess("Account created! Redirecting to login…");
      setTimeout(() => router.replace("/login"), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
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
              Create your account
            </h1>
            <p className="mt-1 text-sm text-muted">
              Start creating studio-quality voices.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="name"
                className="ml-1 text-[11px] font-medium uppercase tracking-widest text-muted"
              >
                Full name
              </label>
              <input
                id="name"
                type="text"
                placeholder="Alex Rivera"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="field w-full rounded-xl border border-transparent bg-surface-2 px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted/60"
              />
            </div>

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
                placeholder="alex@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="field w-full rounded-xl border border-transparent bg-surface-2 px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted/60"
              />
            </div>

            <PasswordField
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
            />

            {error && <p className="text-xs font-medium text-red-600">{error}</p>}
            {success && (
              <p className="text-xs font-medium text-green-700">{success}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="lift gradient-accent mt-2 flex items-center justify-center rounded-xl py-3 text-sm font-semibold text-white active:scale-[0.99] disabled:opacity-60"
            >
              {loading ? "Creating…" : "Create account"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-accent-2 hover:underline">
            Log in
          </Link>
        </p>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-muted/70">
          By signing up, you agree to our Terms of Service &amp; Privacy Policy.
        </p>
      </div>
    </main>
  );
}
