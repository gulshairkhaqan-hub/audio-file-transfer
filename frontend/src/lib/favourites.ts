"use client";
import { useCallback, useEffect, useState } from "react";

const FAV_KEY = "voxclone_fav_voices";
const FAV_EVENT = "voxclone-favs-changed";

function read(): string[] {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function write(ids: string[]) {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(ids));
  } catch {
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(FAV_EVENT));
  }
}

export function useFavourites() {
  const [favs, setFavs] = useState<Set<string>>(new Set());

  useEffect(() => {
    const sync = () => setFavs(new Set(read()));
    sync();
    window.addEventListener(FAV_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(FAV_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const isFavourite = useCallback((id: string) => favs.has(id), [favs]);

  const toggleFavourite = useCallback((id: string) => {
    const next = read();
    const idx = next.indexOf(id);
    if (idx >= 0) next.splice(idx, 1);
    else next.push(id);
    write(next); 
  }, []);

  return { favs, isFavourite, toggleFavourite, count: favs.size };
}
