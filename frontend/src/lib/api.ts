
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
export const MAX_TEXT_CHARS = 2000;
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
  token: string;
};

// ── Stored session ────────────────────────────────────────────────────────────
// One localStorage key holds the whole session, so auth.tsx (React state) and
// this module (fetch headers) can never disagree about who is signed in.
const STORAGE_KEY = "voxclone_user";

export type StoredAuth = { name: string; email: string; token: string };

export function loadAuth(): StoredAuth | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredAuth>;
    // A session saved before tokens existed can't authenticate anything —
    // treat it as signed out so the user is sent to /login once.
    if (!parsed?.email || !parsed?.token) return null;
    return { name: parsed.name || "", email: parsed.email, token: parsed.token };
  } catch {
    return null;
  }
}

export function saveAuth(auth: StoredAuth) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
}

export function clearAuth() {
  if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY);
}

function authHeader(): Record<string, string> {
  const token = loadAuth()?.token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

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

/** Unwrap a response, and sign the user out if the backend rejected their token. */
async function unwrap<T>(res: Response, sentToken: boolean): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // 401 on an authenticated call means the session is gone (expired/invalid),
    // so drop it and bounce to login rather than showing a confusing error.
    if (res.status === 401 && sentToken) {
      clearAuth();
      if (typeof window !== "undefined") window.location.href = "/login";
    }
    throw new Error(data?.error || data?.detail?.[0]?.msg || "Request failed");
  }
  return data as T;
}

async function getJSON<T>(path: string): Promise<T> {
  const auth = authHeader();
  const res = await fetch(`${API_URL}${path}`, { headers: auth });
  return unwrap<T>(res, Boolean(auth.Authorization));
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const auth = authHeader();
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth },
    body: JSON.stringify(body),
  });
  return unwrap<T>(res, Boolean(auth.Authorization));
}

async function postForm<T>(path: string, form: FormData): Promise<T> {
  const auth = authHeader();
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: auth,
    body: form,
  });
  return unwrap<T>(res, Boolean(auth.Authorization));
}

export const api = {
  login: (email: string, password: string) =>
    postJSON<LoginResult>("/login", { email, password }),

  register: (name: string, email: string, password: string) =>
    postJSON<{ message: string }>("/register", { name, email, password }),

  // Change the signed-in user's password (backend verifies the current one and
  // takes the account from the auth token, not from anything sent here). The
  // backend invalidates old tokens on success, so adopt the fresh one it returns
  // or this device would be signed out by its own password change.
  changePassword: async (oldPassword: string, newPassword: string) => {
    const res = await postJSON<{ message: string; token?: string }>("/change-password", {
      old_password: oldPassword,
      new_password: newPassword,
    });
    const current = loadAuth();
    if (res.token && current) saveAuth({ ...current, token: res.token });
    return res;
  },

  cloneVoice: ({ audio, text }: { audio: File; text: string }) => {
    const form = new FormData();
    form.append("audio", audio);
    form.append("text", text);
    return postForm<CloneResult>("/clone", form);
  },

  generateVoice: ({
    voice,
    text,
    speed = DEFAULT_SPEED,
  }: {
    voice: string;
    text: string;
    speed?: number;
  }) => postJSON<CloneResult>("/generate", { voice, text, speed }),

  mixVoices: ({
    voiceA,
    voiceB,
    blend,
    text,
    speed = DEFAULT_SPEED,
  }: {
    voiceA: string;
    voiceB: string;
    blend: number;
    text: string;
    speed?: number;
  }) =>
    postJSON<CloneResult>("/mix", {
      voice_a: voiceA,
      voice_b: voiceB,
      blend,
      text,
      speed,
    }),

  voices: async (): Promise<Voice[]> => {
    const res = await fetch(`${API_URL}/voices`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Failed to load voices");
    return (data?.voices as Voice[]) || [];
  },

  history: async (): Promise<HistoryItem[]> => {
    const data = await getJSON<{ history?: HistoryItem[] }>("/history");
    return data?.history || [];
  },

  deleteFile: async (name: string): Promise<{ message: string }> => {
    const auth = authHeader();
    const res = await fetch(`${API_URL}/files/${encodeURIComponent(name)}`, {
      method: "DELETE",
      headers: auth,
    });
    return unwrap<{ message: string }>(res, Boolean(auth.Authorization));
  },
};

export { API_URL };
