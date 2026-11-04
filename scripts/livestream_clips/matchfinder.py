"""
Finding matches in a livestream from what its score overlay says, sample by sample.

Kept apart from the video and database work (find_matches.py) so it can be tested on its own:
    python -m unittest scripts/livestream_clips/test_matchfinder.py
"""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass
from typing import List, Optional, Sequence

# OCR often reads these letters for digits on broadcast overlays ("Qualification 6B")
_DIGIT_LOOKALIKES = str.maketrans({"O": "0", "o": "0", "D": "0", "I": "1", "l": "1", "|": "1", "S": "5", "B": "8", "Z": "2"})
_NUMBER = r"([0-9OoDIl|SBZ]{1,3})"

# Overlay text (spaces removed, lowercased) -> TBA match key suffix. Since 2023 playoffs are
# double elimination: bracket matches are "sf{n}m1" and finals are "f1m{n}".
# (Only the words ignore case: the number's look-alike letters are matched as OCR gives them.)
_LABELS = [
    (re.compile(r"(?i:qualifications?|quals?)(?i:match)?#?" + _NUMBER), "qm{}"),
    (re.compile(r"(?i:playoffs?|(?:upper|lower)bracket(?:round\d)?)(?i:match)?#?" + _NUMBER), "sf{}m1"),
    (re.compile(r"(?i:(?<!semi)(?<!quarter)finals?)(?i:match)?#?" + _NUMBER), "f1m{}"),
]

# Longest a period's clock shows; anything longer is some other countdown (e.g. "next match in")
MAX_TIMER_SECONDS = 180
# A pause longer than this ends a match (the break between auto and teleop is a few seconds)
MAX_PAUSE_SECONDS = 45
# A match's clock runs for about 2.5 minutes; shorter runs are misreads or an aborted start
MIN_MATCH_SECONDS = 60
# Longer runs merged in a countdown shown before the match: keep the end, where the match is
MAX_MATCH_SECONDS = 240
KEEP_SECONDS = 185
# Added around each clip so it starts just before the buzzer and shows the final whistle
PAD_BEFORE_SECONDS = 3
PAD_AFTER_SECONDS = 8


def parse_label(text: str) -> Optional[str]:
    """The TBA match key suffix ("qm68", "sf5m1", "f1m2") for overlay text like "Qualification 68"."""
    compact = re.sub(r"\s+", "", text)
    if re.search(r"practice", compact, re.I):
        return None
    for pattern, key in _LABELS:
        match = pattern.search(compact)
        if match:
            number = int(match.group(1).translate(_DIGIT_LOOKALIKES))
            return key.format(number) if number > 0 else None
    return None


def parse_timer(text: str) -> Optional[int]:
    """Seconds left on a match clock reading like "2:15" or "0:03"; None for anything else."""
    compact = re.sub(r"\s+", "", text).translate(_DIGIT_LOOKALIKES)
    match = re.fullmatch(r"(\d{1,2})[:.](\d{2})", compact)
    if not match or int(match.group(2)) >= 60:
        return None
    seconds = int(match.group(1)) * 60 + int(match.group(2))
    return seconds if seconds <= MAX_TIMER_SECONDS else None


@dataclass
class Sample:
    """What the overlay showed at one moment of the video."""

    time: float  # seconds into the video
    timer: Optional[int] = None  # seconds left on the clock, when it could be read
    label: Optional[str] = None  # match key, when the match name could be read


@dataclass
class MatchRun:
    """A stretch where the match clock was counting down: one match being played."""

    first: int  # index of the first sample where the clock was running
    last: int  # index of the last


@dataclass
class Clip:
    key: str
    start: int
    end: int


def _ticking(a: Sample, b: Sample) -> bool:
    """Whether the clock counted down between two samples, at about the speed of real time."""
    if a.timer is None or b.timer is None:
        return False
    elapsed = b.time - a.time
    dropped = a.timer - b.timer
    return dropped > 0 and abs(dropped - elapsed) <= max(2.0, 0.25 * elapsed)


def find_runs(samples: Sequence[Sample]) -> List[MatchRun]:
    """Stretches of samples (sorted by time) where a match clock was running."""
    running = [False] * len(samples)
    for i in range(1, len(samples)):
        if _ticking(samples[i - 1], samples[i]):
            running[i - 1] = running[i] = True

    runs: List[MatchRun] = []
    for i, is_running in enumerate(running):
        if not is_running:
            continue
        if runs and samples[i].time - samples[runs[-1].last].time <= MAX_PAUSE_SECONDS:
            runs[-1].last = i
        else:
            runs.append(MatchRun(i, i))

    kept: List[MatchRun] = []
    for run in runs:
        duration = samples[run.last].time - samples[run.first].time
        if duration < MIN_MATCH_SECONDS:
            continue
        if duration > MAX_MATCH_SECONDS:
            cutoff = samples[run.last].time - KEEP_SECONDS
            run.first = next(i for i in range(run.first, run.last + 1) if samples[i].time >= cutoff)
        kept.append(run)
    return kept


def label_run(samples: Sequence[Sample], run: MatchRun) -> Optional[str]:
    """The match name read most often while the clock was running."""
    votes = Counter(s.label for s in samples[run.first : run.last + 1] if s.label)
    return votes.most_common(1)[0][0] if votes else None


def clip_run(samples: Sequence[Sample], run: MatchRun, key: str, duration: float) -> Clip:
    """
    The clip for a run: from the last sample before the clock started (when it still showed
    the match hadn't begun) to the first one after it stopped, plus a little either side.
    """
    before = samples[run.first - 1].time if run.first > 0 else samples[run.first].time
    after = samples[run.last + 1].time if run.last + 1 < len(samples) else samples[run.last].time
    start = max(0, int(before - PAD_BEFORE_SECONDS))
    end = min(int(duration), int(after + PAD_AFTER_SECONDS + 0.999))
    return Clip(key, start, end)


def find_clips(samples: Sequence[Sample], duration: float) -> List[Clip]:
    """
    Each match played in the video, from samples sorted by time that have their labels read
    (at least for the samples inside find_runs' runs). A match that was replayed appears
    twice; the later one is kept, since that's the one that counted.
    """
    clips = {}
    for run in find_runs(samples):
        key = label_run(samples, run)
        if key:
            clips[key] = clip_run(samples, run, key, duration)
    return sorted(clips.values(), key=lambda clip: clip.start)
