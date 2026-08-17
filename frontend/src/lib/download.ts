
// Cloudinary stores our audio as WAV under /video/upload/. Inserting the f_mp3
// (format) transform makes Cloudinary transcode + deliver MP3 on the fly —
// smaller file, no extra storage. Non-Cloudinary URLs pass through unchanged.
export function toMp3Url(url: string): string {
  if (!url.includes("res.cloudinary.com") || !url.includes("/upload/")) return url;
  return url.replace("/upload/", "/upload/f_mp3/");
}

export async function downloadAudio(url: string, filename: string) {
  const src = toMp3Url(url);
  try {
    const res = await fetch(src);
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
    window.open(src, "_blank", "noopener,noreferrer");
  }
}

export function toAudioFilename(name: string) {
  const base = (name || "voxclone-audio")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "voxclone-audio";
  return `${base}.mp3`;
}
