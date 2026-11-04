"""
Finds each match played in an event livestream on YouTube, by reading the match name and
clock off the broadcast's score overlay, and saves where each one starts and ends
(match_video_clips) so the app can play just that match.

Run by .github/workflows/livestream-clips.yml when a manager adds a livestream in the app:
    python find_matches.py <event_livestreams id>
with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set. To try a video without saving anything:
    python find_matches.py --url https://www.youtube.com/watch?v=...

Needs ffmpeg on the PATH, Deno (yt-dlp runs YouTube's player code with it), and
requirements.txt. Optionally YTDLP_COOKIES: a cookies.txt export of a YouTube session, for
when YouTube asks the download to sign in to prove it isn't a bot.
"""

from __future__ import annotations

import argparse
import glob
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.request
from collections import Counter
from typing import List, Optional, Tuple

import numpy as np
from PIL import Image
from rapidocr_onnxruntime import RapidOCR

from matchfinder import Clip, Sample, find_clips, find_runs, parse_label, parse_timer

# Frames are read at this width: enough for the overlay's small text, light to download
FRAME_WIDTH = 1280
VIDEO_FORMAT = "bv*[height<=720][vcodec^=avc1]/bv*[height<=720]/b[height<=720]"
# Frames looked at in full to find where the overlay shows the match name and clock
LOCATE_FRAMES = 60
# Match-name readings per match (the clock is read on every frame)
LABELS_PER_RUN = 12

Box = Tuple[int, int, int, int]  # left, top, right, bottom


class ScanError(Exception):
    """A problem to show the manager, in place of a stack trace."""


def log(message: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {message}", flush=True)


# ---------------------------------------------------------------------------
# Supabase (PostgREST with the service role key, which the workflow keeps secret)
# ---------------------------------------------------------------------------


class Database:
    def __init__(self) -> None:
        missing = [name for name in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY") if not os.environ.get(name)]
        if missing:
            sys.exit(f"Missing {' and '.join(missing)}: add them as repository secrets (Settings > Secrets and variables > Actions).")
        self.url = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1"
        key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        self.headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}

    def request(self, method: str, path: str, body=None, prefer: Optional[str] = None):
        headers = dict(self.headers, **({"Prefer": prefer} if prefer else {}))
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.url + path, data=data, headers=headers, method=method)
        with urllib.request.urlopen(req, timeout=60) as response:
            text = response.read().decode()
            return json.loads(text) if text else None

    def livestream(self, livestream_id: str) -> dict:
        rows = self.request("GET", f"/event_livestreams?id=eq.{livestream_id}&select=*")
        if not rows:
            raise ScanError("This livestream was removed before it could be scanned.")
        return rows[0]

    def update_livestream(self, livestream_id: str, **fields) -> None:
        self.request("PATCH", f"/event_livestreams?id=eq.{livestream_id}", dict(fields, updated_at=_now()), prefer="return=minimal")

    def save_clips(self, livestream: dict, clips: List[Clip]) -> None:
        if not clips:
            return
        rows = [
            {
                "event_id": livestream["event_id"],
                "match_key": clip.key,
                "livestream_id": livestream["id"],
                "video_id": livestream["video_id"],
                "start_seconds": clip.start,
                "end_seconds": clip.end,
            }
            for clip in clips
        ]
        self.request(
            "POST",
            "/match_video_clips?on_conflict=event_id,match_key",
            rows,
            prefer="resolution=merge-duplicates,return=minimal",
        )


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


# ---------------------------------------------------------------------------
# YouTube
# ---------------------------------------------------------------------------


def yt_dlp(args: List[str], cookies: Optional[str]) -> subprocess.CompletedProcess:
    command = [sys.executable, "-m", "yt_dlp", "--no-warnings", *(["--cookies", cookies] if cookies else []), *args]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        error = (result.stderr.strip().splitlines() or ["yt-dlp failed"])[-1]
        if "Sign in to confirm" in error or "bot" in error.lower():
            raise ScanError("YouTube blocked the download with a bot check. Add a YTDLP_COOKIES secret to the repository and try again.")
        if "Private video" in error or "unavailable" in error.lower():
            raise ScanError("That video is private or unavailable.")
        raise ScanError(f"Couldn't get the video from YouTube: {error}")
    return result


def video_info(url: str, cookies: Optional[str]) -> dict:
    info = json.loads(yt_dlp(["-J", "--skip-download", url], cookies).stdout)
    status = info.get("live_status")
    if status == "is_live":
        raise ScanError("This stream is still live. Scan it again once it has ended.")
    if status == "is_upcoming":
        raise ScanError("This stream hasn't started yet.")
    if status == "post_live":
        raise ScanError("YouTube is still processing this stream after it ended. Try again in a few hours.")
    if not info.get("duration"):
        raise ScanError("Couldn't tell how long this video is.")
    return info


def download(url: str, folder: str, cookies: Optional[str]) -> str:
    yt_dlp(["-f", VIDEO_FORMAT, "-N", "8", "--no-part", "-o", os.path.join(folder, "video.%(ext)s"), url], cookies)
    files = glob.glob(os.path.join(folder, "video.*"))
    if not files:
        raise ScanError("The video downloaded, but its file couldn't be found.")
    return files[0]


# ---------------------------------------------------------------------------
# Frames
# ---------------------------------------------------------------------------


def grab_frame(video: str, seconds: float) -> Optional[np.ndarray]:
    command = [
        "ffmpeg", "-v", "error", "-ss", f"{seconds:.2f}", "-i", video,
        "-frames:v", "1", "-vf", f"scale={FRAME_WIDTH}:-2", "-f", "image2pipe", "-vcodec", "png", "-",
    ]
    result = subprocess.run(command, capture_output=True)
    if result.returncode != 0 or not result.stdout:
        return None
    return np.array(Image.open(io.BytesIO(result.stdout)).convert("RGB"))


def _bounds(points) -> Box:
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys))


def _region(boxes: List[Box], pad_x: float, pad_y: float, size: Tuple[int, int]) -> Box:
    """Where most of the boxes are (the overlay can move between scenes), padded by multiples of the text height."""
    cells = Counter(((b[0] + b[2]) // 2 // 40, (b[1] + b[3]) // 2 // 40) for b in boxes)
    cell = cells.most_common(1)[0][0]
    common = [b for b in boxes if ((b[0] + b[2]) // 2 // 40, (b[1] + b[3]) // 2 // 40) == cell]
    left, top = min(b[0] for b in common), min(b[1] for b in common)
    right, bottom = max(b[2] for b in common), max(b[3] for b in common)
    height = bottom - top
    width, frame_height = size
    return (
        max(0, int(left - pad_x * height)),
        max(0, int(top - pad_y * height)),
        min(width, int(right + pad_x * height)),
        min(frame_height, int(bottom + pad_y * height)),
    )


def locate_overlay(video: str, duration: float, ocr: RapidOCR) -> Tuple[Box, Box]:
    """Where the overlay shows the match name and the clock, from frames spread over the video."""
    label_boxes: List[Box] = []
    timer_boxes: List[Box] = []
    size = (FRAME_WIDTH, 720)
    for i in range(LOCATE_FRAMES):
        frame = grab_frame(video, duration * (0.02 + 0.96 * i / (LOCATE_FRAMES - 1)))
        if frame is None:
            continue
        size = (frame.shape[1], frame.shape[0])
        found, _ = ocr(frame)
        labels = [_bounds(box) for box, text, _ in found or [] if parse_label(text)]
        timers = [_bounds(box) for box, text, _ in found or [] if parse_timer(text) is not None]
        # The clock that matters is the one shown alongside the match name
        if labels:
            label_boxes += labels
            timer_boxes += timers
    log(f"Match name seen in {len(label_boxes)} of {LOCATE_FRAMES} sample frames, clock in {len(timer_boxes)}")
    if len(label_boxes) < 2:
        raise ScanError("Couldn't find match names (like \"Qualification 12\") on screen in this video.")
    if len(timer_boxes) < 2:
        raise ScanError("Found match names on screen, but not a match clock next to them.")
    # Labels get room to grow ("Qualification 9" -> "Qualification 100") on either side
    return _region(label_boxes, 3.0, 0.5, size), _region(timer_boxes, 0.6, 0.3, size)


def extract_crops(video: str, label: Box, timer: Box, folder: str) -> List[float]:
    """
    Saves the match-name and clock crops of every keyframe (decoding only keyframes keeps a
    whole day's stream quick) and returns each one's time in the video.
    """
    os.makedirs(os.path.join(folder, "label"), exist_ok=True)
    os.makedirs(os.path.join(folder, "timer"), exist_ok=True)

    def crop(box: Box) -> str:
        return f"crop={box[2] - box[0]}:{box[3] - box[1]}:{box[0]}:{box[1]}"

    command = [
        "ffmpeg", "-v", "info", "-skip_frame", "nokey", "-i", video,
        "-filter_complex", f"[0:v]scale={FRAME_WIDTH}:-2,showinfo,split=2[a][b];[a]{crop(label)}[l];[b]{crop(timer)}[t]",
        "-map", "[l]", "-fps_mode", "passthrough", "-start_number", "0", os.path.join(folder, "label", "%07d.png"),
        "-map", "[t]", "-fps_mode", "passthrough", "-start_number", "0", os.path.join(folder, "timer", "%07d.png"),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        raise ScanError(f"Couldn't read the video's frames: {result.stderr.strip().splitlines()[-1:]}")
    times = [float(t) for t in re.findall(r"\bn:\s*\d+\s.*?\bpts_time:(-?[\d.]+)", result.stderr)]
    count = min(len(times), len(glob.glob(os.path.join(folder, "timer", "*.png"))))
    return times[:count]


# ---------------------------------------------------------------------------
# Reading the overlay
# ---------------------------------------------------------------------------


def read_texts(ocr: RapidOCR, path: str, detect: bool) -> List[str]:
    image = np.array(Image.open(path).convert("RGB"))
    if detect:
        found, _ = ocr(image)
        texts = [text for _, text, _ in found or []]
        return texts + ["".join(texts)] if len(texts) > 1 else texts
    found, _ = ocr(image, use_det=False, use_cls=False)
    return [text for text, _ in found or []]


def scan(video: str, duration: float, folder: str) -> List[Clip]:
    ocr = RapidOCR()
    log("Finding the score overlay")
    label_box, timer_box = locate_overlay(video, duration, ocr)
    log(f"Match name at {label_box}, clock at {timer_box}")

    log("Extracting frames")
    times = extract_crops(video, label_box, timer_box, folder)
    if len(times) < 10:
        raise ScanError("Couldn't read frames from this video.")
    gaps = sorted(b - a for a, b in zip(times, times[1:]))
    log(f"{len(times)} frames, one every {gaps[len(gaps) // 2]:.1f}s")

    log("Reading the clock")
    samples = []
    for i, t in enumerate(times):
        texts = read_texts(ocr, os.path.join(folder, "timer", f"{i:07d}.png"), detect=False)
        timer = next((value for value in map(parse_timer, texts) if value is not None), None)
        samples.append(Sample(t, timer))

    runs = find_runs(samples)
    log(f"Clock ran {len(runs)} times; reading match names")
    for run in runs:
        count = run.last - run.first + 1
        for i in sorted({run.first + round(k * (count - 1) / max(1, LABELS_PER_RUN - 1)) for k in range(LABELS_PER_RUN)}):
            texts = read_texts(ocr, os.path.join(folder, "label", f"{i:07d}.png"), detect=True)
            samples[i].label = next((key for key in map(parse_label, texts) if key), None)

    clips = find_clips(samples, duration)
    for clip in clips:
        log(f"  {clip.key}: {clip.start // 60}:{clip.start % 60:02d} to {clip.end // 60}:{clip.end % 60:02d}")
    return clips


def find_in_video(url: str) -> Tuple[dict, List[Clip]]:
    cookies = None
    if os.environ.get("YTDLP_COOKIES"):
        cookies = os.path.join(tempfile.gettempdir(), "yt-cookies.txt")
        with open(cookies, "w") as file:
            file.write(os.environ["YTDLP_COOKIES"])

    info = video_info(url, cookies)
    log(f"{info.get('title')} ({info['duration'] / 3600:.1f} hours)")
    with tempfile.TemporaryDirectory() as folder:
        log("Downloading")
        video = download(url, folder, cookies)
        log(f"Downloaded {os.path.getsize(video) / 1e9:.1f} GB")
        return info, scan(video, float(info["duration"]), folder)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("livestream_id", nargs="?", help="event_livestreams row to scan and save clips for")
    parser.add_argument("--url", help="scan this YouTube video and print the clips, without saving")
    args = parser.parse_args()

    if args.url:
        _, clips = find_in_video(args.url)
        print(json.dumps([clip.__dict__ for clip in clips], indent=2))
        return
    if not args.livestream_id:
        parser.error("give a livestream id, or --url")

    database = Database()
    livestream = database.livestream(args.livestream_id)
    database.update_livestream(livestream["id"], status="processing", error=None)
    try:
        _, clips = find_in_video(livestream["url"])
        if not clips:
            raise ScanError("Scanned the whole video but didn't find any matches being played.")
        database.save_clips(livestream, clips)
        database.update_livestream(livestream["id"], status="done", matches_found=len(clips), processed_at=_now())
        log(f"Saved {len(clips)} matches")
    except ScanError as error:
        database.update_livestream(livestream["id"], status="failed", error=str(error))
        log(f"Failed: {error}")
        sys.exit(1)
    except Exception:
        database.update_livestream(livestream["id"], status="failed", error="Something went wrong scanning this video. Check the GitHub Actions log.")
        raise


if __name__ == "__main__":
    main()
