/** A YouTube video, optionally starting partway in (e.g. one match in a full-day livestream). */
export interface YouTubeVideo {
  id: string;
  /** Seconds into the video to start at. */
  start?: number;
}

const VIDEO_ID = /^[\w-]{11}$/;

/** "90", "90s", "1m30s" or "1h2m3s" as seconds; undefined when it isn't a timestamp. */
function parseTimestamp(value: string | null): number | undefined {
  if (!value) return undefined;
  if (/^\d+s?$/.test(value)) return parseInt(value, 10) || undefined;
  const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!match || !match[0]) return undefined;
  const [, h = "0", m = "0", s = "0"] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(s) || undefined;
}

/**
 * Reads a YouTube link (youtube.com/watch?v=, youtu.be/, /live/, /shorts/, /embed/, with
 * an optional t= or start= timestamp) or a bare video id; null when it isn't one.
 */
export function parseYouTubeLink(input: string): YouTubeVideo | null {
  const text = input.trim();
  if (VIDEO_ID.test(text)) return { id: text };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, "");
  let id: string | null = null;
  if (host === "youtu.be") {
    id = url.pathname.split("/")[1] ?? null;
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const [section, value] = url.pathname.split("/").slice(1);
    id = section === "watch" ? url.searchParams.get("v")
      : ["live", "shorts", "embed", "v"].includes(section) ? value ?? null
      : null;
  }
  if (!id || !VIDEO_ID.test(id)) return null;

  const start = parseTimestamp(url.searchParams.get("t") ?? url.searchParams.get("start"));
  return start ? { id, start } : { id };
}

/**
 * The embed player for a video, autoplaying (inline on iOS) from its start time.
 * Uses youtube.com rather than youtube-nocookie.com, whose player often fails with
 * "An error occurred" (notably in Safari).
 */
export function youTubeEmbedUrl(video: YouTubeVideo): string {
  const params = new URLSearchParams({ autoplay: "1", rel: "0", playsinline: "1" });
  if (video.start) params.set("start", String(video.start));
  return `https://www.youtube.com/embed/${video.id}?${params}`;
}

/** The video's page on YouTube, at its start time. */
export function youTubeWatchUrl(video: YouTubeVideo): string {
  const params = new URLSearchParams({ v: video.id });
  if (video.start) params.set("t", `${video.start}s`);
  return `https://www.youtube.com/watch?${params}`;
}
