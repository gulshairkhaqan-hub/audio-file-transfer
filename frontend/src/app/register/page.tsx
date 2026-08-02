"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import Logo from "@/components/Logo";
import PasswordField from "@/components/PasswordField";

// Single-screen centered register: logo + form, no scroll.
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
    <main className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-background">
      {/* Full-screen blue glow background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/4 top-1/4 h-[50vh] w-[50vw] rounded-full bg-accent-2/30 blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 h-[40vh] w-[40vw] rounded-full bg-accent/25 blur-[100px]" />
      </div>

      {/* Centered single-screen card */}
      <div className="relative z-10 mx-auto w-full max-w-sm space-y-4 px-5 fade-up">
        {/* Logo + tagline */}
        <div className="flex flex-col items-center gap-1.5 text-center">
          <div className="pointer-events-none absolute left-1/2 top-0 -z-10 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/40 blur-[70px]" />
          <Logo className="h-14 w-auto" />
          <p className="text-[10px] uppercase tracking-[0.2em] text-accent">
            The Future of Sound
          </p>
        </div>

        {/* Form card */}
        <div className="card-hover rounded-2xl border border-white/10 bg-surface/80 p-5 shadow-2xl backdrop-blur-md">
          <div className="mb-5">
            <h2 className="text-xl font-semibold text-foreground">
              Start Creating
            </h2>
            <p className="mt-1 text-xs text-muted">
              Join the next generation of AI voice studios.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div className="space-y-1">
              <label
                htmlFor="name"
                className="ml-1 text-[10px] uppercase tracking-widest text-muted"
              >
                Full Name
              </label>
              <input
                id="name"
                type="text"
                placeholder="Alex Rivera"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="field w-full rounded-xl border border-transparent bg-surface-2 px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted/50"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="email"
                className="ml-1 text-[10px] uppercase tracking-widest text-muted"
              >
                Email Address
              </label>
              <input
                id="email"
                type="email"
                placeholder="alex@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="field w-full rounded-xl border border-transparent bg-surface-2 px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted/50"
              />
            </div>

            <PasswordField
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
            />

            {error && <p className="text-xs text-red-400">{error}</p>}
            {success && <p className="text-xs text-green-400">{success}</p>}

            <button
              type="submit"
              disabled={loading}
              className="lift sheen gradient-accent mt-3 w-full rounded-xl py-3 text-sm font-semibold text-white shadow-[0_0_20px_var(--accent-glow)] hover:shadow-[0_0_32px_var(--accent-glow)] active:scale-[0.98] disabled:opacity-60"
            >
              {loading ? "Creating…" : "Create Account"}
            </button>
          </form>

          <div className="mt-5 text-center">
            <p className="text-xs text-muted">
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-semibold text-accent-2 underline-offset-4 hover:underline"
              >
                Log in
              </Link>
            </p>
          </div>

          <div className="mt-6 text-center">
            <p className="text-[9px] uppercase leading-relaxed tracking-widest text-muted opacity-60">
              By signing up, you agree to our
              <br />
              Terms of Service &amp; Privacy Policy
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
