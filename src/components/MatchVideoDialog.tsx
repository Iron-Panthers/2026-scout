import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, RotateCw, Trash2, VideoOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { parseYouTubeLink, youTubeEmbedUrl, youTubeWatchUrl } from "@/lib/youtube";
import type { MatchVideo } from "@/lib/strategyData";
import {
  addEventLivestream,
  getEventLivestreams,
  isScanning,
  isStuck,
  removeEventLivestream,
  scanLivestream,
  type EventLivestream,
} from "@/lib/livestreams";

/** Finding the match in the event's livestreams, offered when The Blue Alliance has no video of it. */
export interface LivestreamOptions {
  eventId: string;
  userId: string | null;
  /** Managers can add, rescan and remove livestreams. */
  canManage: boolean;
  /** Called when a scan finishes, so the match's videos can be reloaded with what it found. */
  onScanFinished: () => void;
}

/**
 * A match's YouTube videos in a popup player, with a picker when there are several.
 * Given `onSaveLink`, it also lets a manager paste, replace or remove the match's own link;
 * given `livestreams`, it prompts managers for the event's livestream when TBA has no video.
 */
export function MatchVideoDialog({ open, onOpenChange, title, videos, videoLink, onSaveLink, livestreams }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** e.g. "Quals 12". */
  title: string;
  videos: MatchVideo[];
  /** The manager's current pasted link, as typed. */
  videoLink?: string | null;
  /** Saves the pasted link (null removes it); rejects with a message to show. */
  onSaveLink?: (link: string | null) => Promise<void>;
  livestreams?: LivestreamOptions;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        {/* Remounted on each open, so the player, picker and link field start fresh (and closing stops playback). */}
        {open && (
          <MatchVideoContent title={title} videos={videos} videoLink={videoLink ?? null} onSaveLink={onSaveLink} livestreams={livestreams} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function MatchVideoContent({ title, videos, videoLink, onSaveLink, livestreams }: {
  title: string;
  videos: MatchVideo[];
  videoLink: string | null;
  onSaveLink?: (link: string | null) => Promise<void>;
  livestreams?: LivestreamOptions;
}) {
  const [index, setIndex] = useState(0);
  const video = videos[Math.min(index, videos.length - 1)];
  const hasTbaVideo = videos.some((item) => item.source === "tba");

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          {videos.length > 0
            ? "Match video"
            : "No video yet. The Blue Alliance usually has match videos a few hours after the match."}
        </DialogDescription>
      </DialogHeader>

      {video ? (
        <div className="aspect-video w-full overflow-hidden rounded-md bg-black">
          <iframe
            // A new video (or start time) reloads the player
            key={`${video.id}:${video.start ?? 0}:${video.end ?? 0}`}
            src={youTubeEmbedUrl(video)}
            title={`${title} video`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            // YouTube's player needs the page's origin as the referrer to play
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            className="h-full w-full border-0"
          />
        </div>
      ) : (
        <div className="flex aspect-video w-full items-center justify-center rounded-md bg-muted text-muted-foreground">
          <VideoOff className="h-10 w-10" strokeWidth={1.5} />
        </div>
      )}

      {video && (
        // A fallback when the embedded player won't play (blocked by the browser or an extension)
        <a
          href={youTubeWatchUrl(video)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 self-start text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          Watch on YouTube
        </a>
      )}

      {videos.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {videos.map((item, i) => (
            <Button
              key={`${item.source}:${item.id}:${item.start ?? 0}`}
              size="sm"
              variant={item === video ? "default" : "outline"}
              onClick={() => setIndex(i)}
            >
              {item.source === "link"
                ? "Pasted link"
                : item.source === "clip"
                  ? "Livestream"
                  : `TBA video ${videos.slice(0, i + 1).filter((v) => v.source === "tba").length}`}
            </Button>
          ))}
        </div>
      )}

      {livestreams && !hasTbaVideo && (
        <LivestreamSection options={livestreams} hasClip={videos.some((item) => item.source === "clip")} />
      )}

      {onSaveLink && <VideoLinkForm videoLink={videoLink} onSave={onSaveLink} onSaved={() => setIndex(0)} />}
    </>
  );
}

/** How often to check on livestreams being scanned. */
const SCAN_POLL_MS = 15_000;

/**
 * The event's livestreams and how their scans went; managers can add one (which finds every
 * match played in it), rescan a failed one, or remove one.
 */
function LivestreamSection({ options, hasClip }: { options: LivestreamOptions; hasClip: boolean }) {
  const { eventId, userId, canManage, onScanFinished } = options;
  const [livestreams, setLivestreams] = useState<EventLivestream[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Scanning ones from the last check: when one stops, its matches are reloaded
  const scanningIds = useRef<Set<string>>(new Set());
  const onScanFinishedRef = useRef(onScanFinished);
  onScanFinishedRef.current = onScanFinished;

  const scanning = livestreams?.some(isScanning) ?? false;

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      getEventLivestreams(eventId).then(
        (list) => {
          if (cancelled) return;
          const nowScanning = new Set(list.filter(isScanning).map((item) => item.id));
          const finished = [...scanningIds.current].some((id) => !nowScanning.has(id));
          scanningIds.current = nowScanning;
          setLivestreams(list);
          setLoadError(null);
          if (finished) onScanFinishedRef.current();
        },
        (cause) => { if (!cancelled) setLoadError(cause instanceof Error ? cause.message : "Couldn't load livestreams."); }
      );
    void load();
    // Only kept checking while something is being scanned
    const timer = scanning ? window.setInterval(load, SCAN_POLL_MS) : undefined;
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [eventId, scanning]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      const list = await getEventLivestreams(eventId);
      scanningIds.current = new Set(list.filter(isScanning).map((item) => item.id));
      setLivestreams(list);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const trimmed = link.trim();
  const valid = !trimmed || parseYouTubeLink(trimmed) !== null;

  // Scouts only hear about livestreams once one's been added
  if (!canManage && !livestreams?.length) return null;

  return (
    <section className="space-y-1.5 border-t border-border pt-2">
      <div>
        <h3 className="text-xs font-medium">Find it in a livestream</h3>
        <p className="text-[11px] leading-snug text-muted-foreground">
          {canManage
            ? "The Blue Alliance has no video of this match. Add the event's YouTube livestream from the day it was played, and every match in it is cut out automatically."
            : "The Blue Alliance has no video of this match, so the event's livestream is being searched for it."}
        </p>
      </div>

      {loadError && <p className="text-[11px] text-destructive">{loadError}</p>}

      {livestreams && livestreams.length > 0 && (
        <ul className="space-y-1">
          {livestreams.map((item) => (
            <li key={item.id} className="flex items-start gap-1.5 rounded-md bg-muted/50 px-2 py-1 text-[11px] leading-snug">
              <div className="min-w-0 flex-1">
                <a href={item.url} target="_blank" rel="noopener noreferrer" className="block truncate font-medium hover:underline">
                  {item.url}
                </a>
                <p className={item.status === "failed" ? "text-destructive" : "text-muted-foreground"}>
                  {livestreamStatus(item, hasClip)}
                </p>
              </div>
              {isScanning(item) && !isStuck(item) && <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />}
              {canManage && (item.status === "failed" || isStuck(item)) && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 shrink-0"
                  disabled={busy}
                  title="Scan again"
                  aria-label="Scan again"
                  onClick={() => void run(() => scanLivestream(item.id))}
                >
                  <RotateCw className="h-3.5 w-3.5" />
                </Button>
              )}
              {canManage && item.status !== "processing" && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 shrink-0"
                  disabled={busy}
                  title="Remove (and the matches found in it)"
                  aria-label="Remove livestream"
                  onClick={() =>
                    void run(async () => {
                      await removeEventLivestream(item.id);
                      onScanFinished();
                    })
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && userId && (
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (trimmed && valid && !busy) {
              void run(async () => {
                await addEventLivestream(eventId, userId, trimmed);
                setLink("");
              });
            }
          }}
        >
          <Input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://www.youtube.com/live/…"
            aria-label="Livestream link"
            aria-invalid={!valid}
            disabled={busy}
            className="h-7 text-xs md:text-xs"
          />
          <Button type="submit" size="sm" className="h-7 text-xs" disabled={!trimmed || !valid || busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Scan"}
          </Button>
        </form>
      )}
      {!valid ? (
        <p className="text-[11px] text-destructive">That isn't a YouTube video link.</p>
      ) : (
        error && <p className="text-[11px] text-destructive">{error}</p>
      )}
    </section>
  );
}

function livestreamStatus(livestream: EventLivestream, hasClip: boolean): string {
  switch (livestream.status) {
    case "queued":
      return isStuck(livestream)
        ? "Still waiting: the scan doesn't seem to have started. Scan it again, or check the repository's GitHub Actions tab."
        : "Waiting to be scanned…";
    case "processing":
      return "Scanning for matches. A full day's stream takes up to an hour.";
    case "failed":
      return livestream.error ?? "The scan failed.";
    case "done": {
      const found = `Found ${livestream.matchesFound ?? 0} ${livestream.matchesFound === 1 ? "match" : "matches"}`;
      return hasClip ? found : `${found}, but not this one`;
    }
  }
}

/** A manager's field for the match's YouTube link. */
function VideoLinkForm({ videoLink, onSave, onSaved }: {
  videoLink: string | null;
  onSave: (link: string | null) => Promise<void>;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(videoLink ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = value.trim();
  const valid = !trimmed || parseYouTubeLink(trimmed) !== null;
  const changed = trimmed !== (videoLink ?? "");

  const save = async (link: string | null) => {
    setSaving(true);
    setError(null);
    try {
      await onSave(link);
      setValue(link ?? "");
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't save the link.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="space-y-1.5 border-t border-border pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && changed && !saving) void save(trimmed || null);
      }}
    >
      <label htmlFor="match-video-link" className="text-sm font-medium">YouTube link</label>
      <div className="flex gap-2">
        <Input
          id="match-video-link"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://youtu.be/… (add ?t=1h2m to start partway in)"
          aria-invalid={!valid}
          disabled={saving}
        />
        <Button type="submit" disabled={!valid || !changed || saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
        </Button>
        {videoLink && (
          <Button type="button" variant="outline" disabled={saving} onClick={() => void save(null)}>
            Remove
          </Button>
        )}
      </div>
      {!valid ? (
        <p className="text-xs text-destructive">That isn't a YouTube video link.</p>
      ) : error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        <p className="text-xs text-muted-foreground">Shown before The Blue Alliance's videos. Useful for a livestream timestamp.</p>
      )}
    </form>
  );
}
