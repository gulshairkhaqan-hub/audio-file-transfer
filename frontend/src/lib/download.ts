// Force-download an audio URL as a file. Cloudinary serves our clips with
// permissive CORS, so we can fetch the bytes and save them with a real
// filename. If the fetch is ever blocked, fall back to opening the URL so the
// user is never left with a dead button.
export async function downloadAudio(url: string, filename: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("fetch failed");
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/** Turn a display name into a safe .wav filename. */
export function toAudioFilename(name: string) {
  const base = (name || "voxclone-audio")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "voxclone-audio";
  return `${base}.wav`;
}
