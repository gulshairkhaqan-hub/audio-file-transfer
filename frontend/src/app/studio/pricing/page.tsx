"use client";

// Pricing / Plans — a professional 3-tier pricing page (Free / Pro / Studio)
// that makes the product feel real. Billing isn't wired up yet, so the upgrade
// buttons just surface a "coming soon" toast; the Free tier is marked as the
// user's current plan.
import { useToast } from "@/components/Toast";

type Plan = {
  name: string;
  price: string;
  period: string;
  tagline: string;
  features: string[];
  cta: string;
  current?: boolean;
  highlight?: boolean;
};

const PLANS: Plan[] = [
  {
    name: "Free",
    price: "$0",
    period: "/month",
    tagline: "Try VoxClone with the essentials.",
    features: [
      "10 generations / month",
      "28 preset studio voices",
      "Standard quality",
      "Community support",
    ],
    cta: "Current plan",
    current: true,
  },
  {
    name: "Pro",
    price: "$19",
    period: "/month",
    tagline: "For creators who publish regularly.",
    features: [
      "1,000 generations / month",
      "Voice cloning from your samples",
      "HD quality audio",
      "Priority processing",
      "Email support",
    ],
    cta: "Upgrade to Pro",
    highlight: true,
  },
  {
    name: "Studio",
    price: "$99",
    period: "/month",
    tagline: "For teams and heavy production.",
    features: [
      "Unlimited generations",
      "Everything in Pro",
      "Voice mixing & blending",
      "API access",
      "Dedicated support",
    ],
    cta: "Upgrade to Studio",
  },
];

export default function PricingPage() {
  const { success } = useToast();

  function onUpgrade(plan: Plan) {
    if (plan.current) return;
    success(`Billing isn't live yet — ${plan.name} is a preview for now.`);
  }

  return (
    <div className="mx-auto max-w-5xl fade-up">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">💳 Plans & Pricing</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted">
          Start free and upgrade as you grow. Every plan uses the same
          studio-grade voices — higher tiers unlock more usage and features.
        </p>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className={`card-hover relative flex flex-col rounded-2xl border bg-surface/80 p-6 shadow-2xl backdrop-blur-md ${
              plan.highlight
                ? "border-accent/60 shadow-[0_0_28px_var(--accent-glow)]"
                : "border-white/10"
            }`}
          >
            {plan.highlight && (
              <span className="gradient-accent absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[11px] font-semibold text-white">
                Most popular
              </span>
            )}

            <h2 className="text-lg font-semibold text-foreground">{plan.name}</h2>
            <p className="mt-1 text-xs text-muted">{plan.tagline}</p>

            <div className="mt-4 flex items-baseline gap-1">
              <span className="gradient-text text-3xl font-bold">
                {plan.price}
              </span>
              <span className="text-sm text-muted">{plan.period}</span>
            </div>

            <ul className="mt-5 flex-1 space-y-2.5">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-foreground">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    className="mt-0.5 shrink-0 text-accent-2"
                  >
                    <path
                      d="M20 6L9 17l-5-5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={() => onUpgrade(plan)}
              disabled={plan.current}
              className={`mt-6 rounded-xl py-2.5 text-sm font-semibold transition-all ${
                plan.current
                  ? "cursor-default border border-border bg-surface-2 text-muted"
                  : plan.highlight
                  ? "lift sheen gradient-accent text-white shadow-[0_0_20px_var(--accent-glow)] hover:shadow-[0_0_32px_var(--accent-glow)]"
                  : "lift border border-border text-foreground hover:border-accent/50 hover:bg-surface-2"
              }`}
            >
              {plan.cta}
            </button>
          </div>
        ))}
      </div>

      <p className="mt-6 text-center text-xs text-muted">
        Prices shown for preview only. Payments and billing are coming soon.
      </p>
    </div>
  );
}
