"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import StudioNav from "@/components/StudioNav";

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, loading } = useAuth();

  // Protected: redirect to login if not authenticated.
  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <StudioNav />
      {/* pt clears the floating pill; the page scrolls on the window so the
          nav's scroll-contract can track it. */}
      <main className="px-5 pb-20 pt-24 sm:px-8 sm:pt-28">{children}</main>
    </div>
  );
}
