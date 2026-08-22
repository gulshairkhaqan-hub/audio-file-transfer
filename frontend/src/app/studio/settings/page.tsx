"use client";

// Settings / Profile — shows the signed-in user's identity, lets them change
// their password (verified against the current one by the backend), and log
// out. Everything here is scoped to the authenticated user.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";

const MIN_PASSWORD = 6;

export default function SettingsPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { success, error: toastError } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.email) return;

    if (!current || !next || !confirm) {
      toastError("Please fill in all password fields.");
      return;
    }
    if (next.length < MIN_PASSWORD) {
      toastError(`New password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (next !== confirm) {
      toastError("New password and confirmation don't match.");
      return;
    }
    if (next === current) {
      toastError("New password must differ from the current one.");
      return;
    }

    setSaving(true);
    try {
      await api.changePassword(current, next);
      success("Password changed successfully!");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Couldn't change password.");
    } finally {
      setSaving(false);
    }
  }

  const initial = (user?.name || user?.email || "?").charAt(0).toUpperCase();

  return (
    <div className="mx-auto max-w-2xl fade-up">
      <h1 className="text-2xl font-semibold tracking-tight">⚙️ Settings</h1>
      <p className="mt-1 text-sm text-muted">
        Manage your profile and account security.
      </p>

      {/* ── Profile ── */}
      <section className="card-hover mt-6 rounded-2xl border border-white/10 bg-surface/80 p-6 shadow-2xl backdrop-blur-md">
        <h2 className="text-xs uppercase tracking-widest text-muted">Profile</h2>
        <div className="mt-4 flex items-center gap-4">
          <span
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-semibold text-white"
            style={{ backgroundImage: "linear-gradient(135deg, #7c3aed, #2563eb)" }}
          >
            {initial}
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-foreground">
              {user?.name || "—"}
            </p>
            <p className="truncate text-sm text-muted">{user?.email || "—"}</p>
          </div>
        </div>
      </section>

      {/* ── Change password ── */}
      <section className="card-hover mt-5 rounded-2xl border border-white/10 bg-surface/80 p-6 shadow-2xl backdrop-blur-md">
        <h2 className="text-xs uppercase tracking-widest text-muted">
          Change password
        </h2>
        <form onSubmit={handleChangePassword} className="mt-4 space-y-4">
          <Field
            label="Current password"
            value={current}
            onChange={setCurrent}
            placeholder="Your current password"
          />
          <Field
            label="New password"
            value={next}
            onChange={setNext}
            placeholder={`At least ${MIN_PASSWORD} characters`}
          />
          <Field
            label="Confirm new password"
            value={confirm}
            onChange={setConfirm}
            placeholder="Re-type the new password"
          />
          <button
            type="submit"
            disabled={saving}
            className="lift sheen gradient-accent flex items-center justify-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold text-white shadow-[0_0_20px_var(--accent-glow)] hover:shadow-[0_0_32px_var(--accent-glow)] active:scale-[0.98] disabled:opacity-60"
          >
            {saving ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Saving…
              </>
            ) : (
              "Update password"
            )}
          </button>
        </form>
      </section>

      {/* ── Account ── */}
      <section className="card-hover mt-5 rounded-2xl border border-white/10 bg-surface/80 p-6 shadow-2xl backdrop-blur-md">
        <h2 className="text-xs uppercase tracking-widest text-muted">Account</h2>
        <div className="mt-4 flex items-center justify-between gap-4">
          <p className="text-sm text-muted">Sign out of VoxClone on this device.</p>
          <button
            onClick={() => {
              logout();
              router.replace("/login");
            }}
            className="lift shrink-0 rounded-xl border border-red-500/30 px-4 py-2 text-sm font-medium text-red-300/90 hover:border-red-500/60 hover:bg-red-500/10"
          >
            Log out
          </button>
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <label className="ml-1 text-xs uppercase tracking-widest text-muted">
        {label}
      </label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="field w-full rounded-xl border border-transparent bg-surface-2 px-4 py-2.5 pr-11 text-sm text-foreground outline-none placeholder:text-muted/50"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted transition-colors hover:text-foreground"
        >
          {show ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 5c6.5 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}
