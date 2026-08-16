// Central API client — talks to the FastAPI backend.
// Base URL comes from env so we can point at localhost in dev and the
// deployed backend in production (set NEXT_PUBLIC_API_URL in Vercel).
//
// NEXT_PUBLIC_* is inlined at BUILD time, so changing it in Vercel requires a
// redeploy. If it's missing in a production build the localhost fallback would
// silently point the browser at the user's own machine, which surfaces as an
// opaque "Failed to fetch" — so warn loudly instead.
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

// Longest script the backend accepts (mirrors MAX_TEXT_CHARS in server.py).
// Used to cap the text inputs and drive the character counters.
export const MAX_TEXT_CHARS = 1000;

if (
  typeof window !== "undefined" &&
  !process.env.NEXT_PUBLIC_API_URL &&
  window.location.hostname !== "localhost" &&
  window.location.hostname !== "127.0.0.1"
) {
  console.error(
    "NEXT_PUBLIC_API_URL is not set — API calls are falling back to " +
      "http://127.0.0.1:8000 and will fail. Set it in the Vercel project " +
      "settings and redeploy (build-time variable)."
  );
}

export type LoginResult = {
  message: string;
  name: string;
  email: string;
};

export type CloneResult = {
  url: string;
  name: string;
};

export type HistoryItem = {
  name: string;
  url: string;
  uploaded_at?: string;
  kind?: string;
};

export type Voice = {
  id: string;
  name: string;
  accent: string;
  gender: string;
};

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || data?.detail?.[0]?.msg || "Request failed");
  }
  return data as T;
}

async function postForm<T>(path: string, form: FormData): Promise<T> {
  // No Content-Type header — the browser sets the multipart boundary itself.
  const res = await fetch(`${API_URL}${path}`, { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || data?.detail?.[0]?.msg || "Request failed");
  }
  return data as T;
}

export const api = {
  login: (email: string, password: string) =>
    postJSON<LoginResult>("/login", { email, password }),

  register: (name: string, email: string, password: string) =>
    postJSON<{ message: string }>("/register", { name, email, password }),

  // Change the signed-in user's password (backend verifies the current one).
  changePassword: (email: string, oldPassword: string, newPassword: string) =>
    postJSON<{ message: string }>("/change-password", {
      email,
      old_password: oldPassword,
      new_password: newPassword,
    }),

  // Feature 1 — Voice Cloning: send a sample + text, get back the cloned audio URL.
  cloneVoice: ({
    audio,
    text,
    email,
  }: {
    audio: File;
    text: string;
    email: string;
  }) => {
    const form = new FormData();
    form.append("audio", audio);
    form.append("text", text);
    form.append("user_email", email);
    return postForm<CloneResult>("/clone", form);
  },

  // Feature 2 — Voice Generation: pick a preset voice + text, get audio back.
  generateVoice: ({
    voice,
    text,
    email,
  }: {
    voice: string;
    text: string;
    email: string;
  }) =>
    postJSON<CloneResult>("/generate", { voice, text, user_email: email }),

  // Feature 3 — Voice Mixing: blend two preset voices, then speak `text`.
  // `blend` is voice A's weight: 1.0 = all A, 0.0 = all B.
  mixVoices: ({
    voiceA,
    voiceB,
    blend,
    text,
    email,
  }: {
    voiceA: string;
    voiceB: string;
    blend: number;
    text: string;
    email: string;
  }) =>
    postJSON<CloneResult>("/mix", {
      voice_a: voiceA,
      voice_b: voiceB,
      blend,
      text,
      user_email: email,
    }),

  // Preset voices available to the generate + mix features.
  voices: async (): Promise<Voice[]> => {
    const res = await fetch(`${API_URL}/voices`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Failed to load voices");
    return (data?.voices as Voice[]) || [];
  },

  // Per-user upload/clone history from MongoDB.
  history: async (email: string): Promise<HistoryItem[]> => {
    const res = await fetch(
      `${API_URL}/history?user_email=${encodeURIComponent(email)}`
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Failed to load history");
    return (data?.history as HistoryItem[]) || [];
  },

  // Delete one of the user's creations — removes it from Cloudinary and Mongo.
  // Scoped by email so a user can only delete their own files.
  deleteFile: async (
    name: string,
    email: string
  ): Promise<{ message: string }> => {
    const res = await fetch(
      `${API_URL}/files/${encodeURIComponent(
        name
      )}?user_email=${encodeURIComponent(email)}`,
      { method: "DELETE" }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Failed to delete");
    return data as { message: string };
  },
};

export { API_URL };
