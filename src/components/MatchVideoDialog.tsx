import { useState } from "react";
import { ExternalLink, Loader2, VideoOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { parseYouTubeLink, youTubeEmbedUrl, youTubeWatchUrl } from "@/lib/youtube";
import type { MatchVideo } from "@/lib/strategyData";

/**
 * A match's YouTube videos in a popup player, with a picker when there are several.
 * Given `onSaveLink`, it also lets a manager paste, replace or remove the match's own link.
 */
export function MatchVideoDialog({ open, onOpenChange, title, videos, videoLink, onSaveLink }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** e.g. "Quals 12". */
  title: string;
  videos: MatchVideo[];
  /** The manager's current pasted link, as typed. */
  videoLink?: string | null;
  /** Saves the pasted link (null removes it); rejects with a message to show. */
  onSaveLink?: (link: string | null) => Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        {/* Remounted on each open, so the player, picker and link field start fresh (and closing stops playback). */}
        {open && <MatchVideoContent title={title} videos={videos} videoLink={videoLink ?? null} onSaveLink={onSaveLink} />}
      </DialogContent>
    </Dialog>
  );
}

function MatchVideoContent({ title, videos, videoLink, onSaveLink }: {
  title: string;
  videos: MatchVideo[];
  videoLink: string | null;
  onSaveLink?: (link: string | null) => Promise<void>;
}) {
  const [index, setIndex] = useState(0);
  const video = videos[Math.min(index, videos.length - 1)];

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
            key={`${video.id}:${video.start ?? 0}`}
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
              {item.source === "link" ? "Pasted link" : `TBA video ${videos.slice(0, i + 1).filter((v) => v.source === "tba").length}`}
            </Button>
          ))}
        </div>
      )}

      {onSaveLink && <VideoLinkForm videoLink={videoLink} onSave={onSaveLink} onSaved={() => setIndex(0)} />}
    </>
  );
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
