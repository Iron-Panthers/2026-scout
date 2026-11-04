"""Run with: python -m unittest discover scripts/livestream_clips"""

import random
import unittest

from matchfinder import Sample, find_clips, parse_label, parse_timer

AUTO, PAUSE, TELEOP = 20, 3, 140


def clock_at(elapsed):
    """What a match clock shows `elapsed` seconds after the match starts (None once over)."""
    if elapsed < AUTO:
        return AUTO - int(elapsed)
    if elapsed < AUTO + PAUSE:
        return 0
    if elapsed < AUTO + PAUSE + TELEOP:
        return TELEOP - int(elapsed - AUTO - PAUSE)
    return None


def simulate(matches, duration, step=2.0, misread=0.1, seed=1):
    """
    Overlay samples for a stream where each (key, start) match is played: the clock sits at
    0:20 until the match starts and at 0:00 after it, and some readings are lost or wrong.
    """
    rng = random.Random(seed)
    samples = []
    t = 0.0
    while t < duration:
        current = [m for m in matches if m[1] <= t + 120]
        key, start = current[-1] if current else matches[0]
        elapsed = t - start
        timer = AUTO if elapsed < 0 else clock_at(elapsed)
        if timer is None:
            timer = 0
        label = key
        if rng.random() < misread:
            timer = None
        if rng.random() < misread:
            label = rng.choice([None, "qm99"])
        samples.append(Sample(t, timer, label))
        t += step + rng.uniform(-0.3, 0.3)
    return samples


class ParseTest(unittest.TestCase):
    def test_labels(self):
        self.assertEqual(parse_label("Qualification68"), "qm68")
        self.assertEqual(parse_label("Qualification 6B"), "qm68")
        self.assertEqual(parse_label("qualification68b"), "qm68")
        self.assertEqual(parse_label("Playoff Match 13"), "sf13m1")
        self.assertEqual(parse_label("Final 2"), "f1m2")
        self.assertIsNone(parse_label("Semifinal 2 Match 1"))
        self.assertIsNone(parse_label("Practice 4"))
        self.assertIsNone(parse_label("Chezy Champs"))

    def test_timers(self):
        self.assertEqual(parse_timer("0:03"), 3)
        self.assertEqual(parse_timer("2:15"), 135)
        self.assertEqual(parse_timer("O:2O"), 20)
        self.assertIsNone(parse_timer("5:00"))  # longer than any period: some other countdown
        self.assertIsNone(parse_timer("375"))


class FindClipsTest(unittest.TestCase):
    def assert_clip_covers(self, clip, start):
        end = start + AUTO + PAUSE + TELEOP
        self.assertLessEqual(clip.start, start, clip)
        self.assertGreaterEqual(clip.start, start - 10, clip)
        self.assertGreaterEqual(clip.end, end, clip)
        self.assertLessEqual(clip.end, end + 15, clip)

    def test_finds_each_match(self):
        matches = [(f"qm{n}", 300 + (n - 1) * 420) for n in range(1, 21)]
        clips = find_clips(simulate(matches, 300 + 20 * 420), 300 + 20 * 420)
        self.assertEqual([c.key for c in clips], [key for key, _ in matches])
        for clip, (_, start) in zip(clips, matches):
            self.assert_clip_covers(clip, start)

    def test_replayed_match_keeps_the_replay(self):
        matches = [("qm1", 300), ("qm2", 720), ("qm2", 1140), ("qm3", 1560)]
        clips = find_clips(simulate(matches, 1900, seed=2), 1900)
        self.assertEqual([c.key for c in clips], ["qm1", "qm2", "qm3"])
        self.assert_clip_covers(clips[1], 1140)

    def test_sparse_samples(self):
        """Keyframes only every 5 seconds still find the matches, with looser edges."""
        matches = [(f"qm{n}", 200 + (n - 1) * 400) for n in range(1, 6)]
        clips = find_clips(simulate(matches, 2300, step=5.0, seed=3), 2300)
        self.assertEqual([c.key for c in clips], [key for key, _ in matches])

    def test_countdown_before_match_is_trimmed(self):
        """A "next match in 3:00" countdown running straight into the match is cut off the clip."""
        samples = [Sample(float(t), 180 - t, "qm4") for t in range(0, 180, 2)]
        samples += [Sample(180.0 + t, clock_at(t) if clock_at(t) is not None else 0, "qm4") for t in range(0, 200, 2)]
        clips = find_clips(samples, 400)
        self.assertEqual(len(clips), 1)
        self.assertLessEqual(clips[0].start, 180)
        self.assertGreaterEqual(clips[0].start, 150)
        self.assertGreaterEqual(clips[0].end, 180 + AUTO + PAUSE + TELEOP)

    def test_static_clock_is_not_a_match(self):
        samples = [Sample(float(t), 20, "qm1") for t in range(0, 600, 2)]
        self.assertEqual(find_clips(samples, 600), [])


if __name__ == "__main__":
    unittest.main()
