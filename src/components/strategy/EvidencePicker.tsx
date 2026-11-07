import { useEffect, useRef, useState } from "react";
import { Flag, FlagOff, Loader2, VideoOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SuggestionEvidence } from "@/lib/livePicklists";
import { includesTeam, type QualScheduleMatch } from "@/lib/strategyData";
import { formatVideoTime, type YouTubeVideo } from "@/lib/youtube";

/** The parts of YouTube's IFrame API player used here. */
interface YouTubePlayerApi {
  getCurrentTime(): number;
  destroy(): void;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement,
        options: {
          videoId: string;
          width?: string;
          height?: string;
          playerVars?: Record<string, number>;
          events?: { onReady?: () => void };
        }
      ) => YouTubePlayerApi;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youTubeApi: Promise<NonNullable<Window["YT"]>> | null = null;

/** Loads YouTube's IFrame API once; it's what lets the page ask the player where it is. */
function loadYouTubeApi(): Promise<NonNullable<Window["YT"]>> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  youTubeApi ??= new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT!);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  });
  return youTubeApi;
}

/** A YouTube player whose current time can be read through `playerRef` once it's ready. */
function YouTubePlayer({ video, playerRef, onReady }: {
  video: YouTubeVideo;
  playerRef: React.RefObject<YouTubePlayerApi | null>;
  onReady: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let player: YouTubePlayerApi | null = null;
    const container = containerRef.current;
    void loadYouTubeApi().then((YT) => {
      if (cancelled || !container) return;
      // YouTube swaps this element for its iframe, so React never manages it
      const mount = document.createElement("div");
      container.appendChild(mount);
      player = new YT.Player(mount, {
        videoId: video.id,
        width: "100%",
        height: "100%",
        playerVars: { playsinline: 1, rel: 0, ...(video.start ? { start: video.start } : {}) },
        events: {
          onReady: () => {
            if (cancelled) return;
            playerRef.current = player;
            onReady();
          },
        },
      });
    });
    return () => {
      cancelled = true;
      playerRef.current = null;
      player?.destroy();
      container?.replaceChildren();
    };
    // onReady only flips a flag; a new video is what needs a new player
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.id, video.start, playerRef]);

  return <div ref={containerRef} className="aspect-video w-full overflow-hidden rounded-md bg-black [&>iframe]:h-full [&>iframe]:w-full" />;
}

/**
 * The evidence a suggestion has to attach: pick a qualification match with a video, then mark
 * where the clip starts and ends while watching it. `onChange` gets null until both are marked.
 */
export function EvidencePicker({ teamNumber, matches, onChange }: {
  /** The team being moved; its matches are listed first. */
  teamNumber: number;
  /** The event's qualification matches; null while they load. */
  matches: QualScheduleMatch[] | null;
  onChange: (evidence: SuggestionEvidence | null) => void;
}) {
  const playerRef = useRef<YouTubePlayerApi | null>(null);
  const [matchNumber, setMatchNumber] = useState("");
  const [ready, setReady] = useState(false);
  const [start, setStart] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const withVideo = (matches ?? []).filter((match) => match.videos.length > 0);
  const plays = (match: QualScheduleMatch) => includesTeam(match.red, teamNumber) || includesTeam(match.blue, teamNumber);
  const teamMatches = withVideo.filter(plays);
  const otherMatches = withVideo.filter((match) => !plays(match));
  const match = withVideo.find((item) => String(item.matchNumber) === matchNumber);
  // The first video is the best one (a manager's link, then TBA's, then a livestream clip)
  const video = match?.videos[0];

  const report = (nextStart: number | null, nextEnd: number | null) =>
    onChange(match && video && nextStart != null && nextEnd != null
      ? { matchNumber: match.matchNumber, videoId: video.id, start: nextStart, end: nextEnd }
      : null);

  const pickMatch = (value: string) => {
    setMatchNumber(value);
    setReady(false);
    setStart(null);
    setEnd(null);
    setError(null);
    onChange(null);
  };

  // Times are the video's own (what its player shows), in whole seconds
  const markStart = () => {
    const now = playerRef.current?.getCurrentTime();
    if (now == null) return;
    const next = Math.floor(now);
    const keptEnd = end != null && end > next ? end : null;
    setStart(next);
    setEnd(keptEnd);
    setError(null);
    report(next, keptEnd);
  };

  const markEnd = () => {
    const now = playerRef.current?.getCurrentTime();
    if (now == null || start == null) return;
    const next = Math.ceil(now);
    if (next <= start) {
      setError("The end has to be after the start. Play on a little, then mark the end.");
      return;
    }
    setEnd(next);
    setError(null);
    report(start, next);
  };

  return (
    <div className="space-y-2">
      <Label>Evidence (required)</Label>
      {matches == null ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading match videos...
        </p>
      ) : withVideo.length === 0 ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <VideoOff className="h-4 w-4" />
          No qualification match has a video yet, so there's nothing to attach.
        </p>
      ) : (
        <>
          <Select value={matchNumber} onValueChange={pickMatch}>
            <SelectTrigger className="w-full" aria-label="Qualification match">
              <SelectValue placeholder="Pick a qualification match video" />
            </SelectTrigger>
            <SelectContent>
              {teamMatches.length > 0 && (
                <SelectGroup>
                  <SelectLabel>{teamNumber}'s matches</SelectLabel>
                  {teamMatches.map((item) => (
                    <SelectItem key={item.matchNumber} value={String(item.matchNumber)}>
                      Quals {item.matchNumber}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              {otherMatches.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Other matches</SelectLabel>
                  {otherMatches.map((item) => (
                    <SelectItem key={item.matchNumber} value={String(item.matchNumber)}>
                      Quals {item.matchNumber}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>

          {video && (
            <>
              <YouTubePlayer key={`${video.id}:${video.start ?? 0}`} video={video} playerRef={playerRef} onReady={() => setReady(true)} />
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={!ready} onClick={markStart}>
                  <Flag className="h-3.5 w-3.5" />
                  {start == null ? "Mark start" : `Start ${formatVideoTime(start)}`}
                </Button>
                <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={!ready || start == null} onClick={markEnd}>
                  <FlagOff className="h-3.5 w-3.5" />
                  {end == null ? "Mark end" : `End ${formatVideoTime(end)}`}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {start != null && end != null
                    ? `${end - start}s clip`
                    : start != null
                      ? "Now play to where it ends and mark the end."
                      : "Play to where it starts and mark the start."}
                </span>
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
            </>
          )}
        </>
      )}
    </div>
  );
}
