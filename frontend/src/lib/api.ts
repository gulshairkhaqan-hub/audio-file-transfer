
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
export const MAX_TEXT_CHARS = 1000;
export const MIN_SPEED = 0.5;
export const MAX_SPEED = 2.0;
export const DEFAULT_SPEED = 1.0;
export const SPEED_STEP = 0.05;

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

  generateVoice: ({
    voice,
    text,
    email,
    speed = DEFAULT_SPEED,
  }: {
    voice: string;
    text: string;
    email: string;
    speed?: number;
  }) =>
    postJSON<CloneResult>("/generate", {
      voice,
      text,
      speed,
      user_email: email,
    }),

  mixVoices: ({
    voiceA,
    voiceB,
    blend,
    text,
    email,
    speed = DEFAULT_SPEED,
  }: {
    voiceA: string;
    voiceB: string;
    blend: number;
    text: string;
    email: string;
    speed?: number;
  }) =>
    postJSON<CloneResult>("/mix", {
      voice_a: voiceA,
      voice_b: voiceB,
      blend,
      text,
      speed,
      user_email: email,
    }),

  voices: async (): Promise<Voice[]> => {
    const res = await fetch(`${API_URL}/voices`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Failed to load voices");
    return (data?.voices as Voice[]) || [];
  },

  history: async (email: string): Promise<HistoryItem[]> => {
    const res = await fetch(
      `${API_URL}/history?user_email=${encodeURIComponent(email)}`
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Failed to load history");
    return (data?.history as HistoryItem[]) || [];
  },

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
