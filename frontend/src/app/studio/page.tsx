"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Studio home → default to the first feature.
export default function StudioHome() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/studio/clone");
  }, [router]);
  return null;
}
