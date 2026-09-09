// Sanity-check the frame-extraction planner's timestamp math against all
// four modes, plus the edge cases each is prone to.
// Run with: tsc (or the project's own build) to emit plan.js next to this
// file, then `node plan.test.mjs` -- same convention as compress/plan.test.mjs
// and video2gif's planner tests.
import {
	planFrameTimestamps,
	formatTimecodeForFilename,
	frameEntryFileName,
	singleFrameFileName,
	zipFileName,
	outputBaseName,
	MIN_INTERVAL_SEC,
	MAX_INTERVAL_SEC
} from './plan.js';

let failures = 0;

function check(label, condition, detail = '') {
	if (!condition) {
		failures++;
		console.log(`  FAIL  ${label} ${detail}`);
	} else {
		console.log(`  ok    ${label} ${detail}`);
	}
}

function src(durationSec, width = 1280, height = 720) {
	return { durationSec, width, height };
}

function baseOptions(overrides = {}) {
	return {
		mode: 'current',
		currentSec: 0,
		intervalSec: 1,
		rangeStartSec: 0,
		rangeEndSec: 10,
		rangeIntervalSec: 1,
		count: 10,
		format: 'png',
		jpegQuality: 90,
		...overrides
	};
}

console.log('\n=== MODE: current ===');
{
	const s = src(30);
	const t = planFrameTimestamps(s, baseOptions({ mode: 'current', currentSec: 12.5 }));
	check('exactly one timestamp', t.length === 1, `(${JSON.stringify(t)})`);
	check('matches requested time', t[0] === 12.5);
}
{
	// Clamp: a currentSec past the end of the clip (can happen if duration
	// was probed after the UI already had a stale slider value) should land
	// on the last valid instant, not silently produce an out-of-range ask.
	const s = src(10);
	const t = planFrameTimestamps(s, baseOptions({ mode: 'current', currentSec: 999 }));
	check('currentSec beyond duration clamps to duration', t[0] === 10, `(${t[0]})`);
}
{
	const s = src(10);
	const t = planFrameTimestamps(s, baseOptions({ mode: 'current', currentSec: -5 }));
	check('currentSec below 0 clamps to 0', t[0] === 0, `(${t[0]})`);
}

console.log('\n=== MODE: interval ===');
{
	const s = src(10);
	const t = planFrameTimestamps(s, baseOptions({ mode: 'interval', intervalSec: 2 }));
	check('10s @ 2s interval -> 6 frames (0,2,4,6,8,10)', t.length === 6, `(${JSON.stringify(t)})`);
	check('starts at 0', t[0] === 0);
	check('ends at duration', t[t.length - 1] === 10);
}
{
	// N seconds > duration: the whole clip is shorter than one interval step,
	// so this should degrade to a single frame at 0, not zero frames.
	const s = src(5);
	const t = planFrameTimestamps(s, baseOptions({ mode: 'interval', intervalSec: 60 }));
	check('interval > duration yields exactly one frame', t.length === 1, `(${JSON.stringify(t)})`);
	check('...at time 0', t[0] === 0);
}
{
	// intervalSec is clamped into [MIN_INTERVAL_SEC, MAX_INTERVAL_SEC] before
	// use, so an out-of-range request (e.g. a corrupted/clamped-away-from-UI
	// value) can't produce a runaway frame count or a zero/negative step.
	const s = src(20);
	const t = planFrameTimestamps(s, baseOptions({ mode: 'interval', intervalSec: 0 }));
	const expectedCount = Math.floor(20 / MIN_INTERVAL_SEC) + 1;
	check('intervalSec of 0 clamps up to MIN_INTERVAL_SEC', t.length === expectedCount, `(${t.length} vs ${expectedCount})`);
}
{
	const s = src(20);
	const t = planFrameTimestamps(s, baseOptions({ mode: 'interval', intervalSec: 9999 }));
	const expectedCount = Math.floor(20 / MAX_INTERVAL_SEC) + 1;
	check('intervalSec above MAX clamps down to MAX_INTERVAL_SEC', t.length === expectedCount, `(${t.length} vs ${expectedCount})`);
}
{
	// Zero-duration source (a probe glitch, or a genuinely empty file) must
	// not throw and must not come back empty -- there's always at least one
	// frame to try for.
	const s = src(0);
	const t = planFrameTimestamps(s, baseOptions({ mode: 'interval', intervalSec: 1 }));
	check('zero-duration source still yields one frame at 0', t.length === 1 && t[0] === 0, `(${JSON.stringify(t)})`);
}

console.log('\n=== MODE: range ===');
{
	const s = src(60);
	const t = planFrameTimestamps(s, baseOptions({ mode: 'range', rangeStartSec: 10, rangeEndSec: 20, rangeIntervalSec: 5 }));
	check('10..20 @ 5s -> 3 frames (10,15,20)', t.length === 3, `(${JSON.stringify(t)})`);
	check('all timestamps within [start,end]', t.every((x) => x >= 10 && x <= 20));
}
{
	// Range clamped to [0, duration]: an end past the clip's actual length
	// (e.g. UI still showing a stale duration) must not ask for time beyond
	// what the source has.
	const s = src(15);
	const t = planFrameTimestamps(s, baseOptions({ mode: 'range', rangeStartSec: 5, rangeEndSec: 999, rangeIntervalSec: 5 }));
	check('end beyond duration clamps to duration', t[t.length - 1] === 15, `(${JSON.stringify(t)})`);
	check('every timestamp <= duration', t.every((x) => x <= 15));
}
{
	// A start past the (clamped) end -- e.g. both handles dragged past the
	// clip length -- must not invert into a negative span; end gets pulled
	// up to start instead of the range collapsing to nothing.
	const s = src(10);
	const t = planFrameTimestamps(s, baseOptions({ mode: 'range', rangeStartSec: 8, rangeEndSec: 3, rangeIntervalSec: 1 }));
	check('start > end still yields a valid single frame', t.length === 1 && t[0] === 8, `(${JSON.stringify(t)})`);
}
{
	// Zero-length range (start === end) is a valid "just this instant" ask.
	const s = src(10);
	const t = planFrameTimestamps(s, baseOptions({ mode: 'range', rangeStartSec: 4, rangeEndSec: 4, rangeIntervalSec: 1 }));
	check('zero-length range yields exactly one frame', t.length === 1 && t[0] === 4, `(${JSON.stringify(t)})`);
}
{
	// rangeIntervalSec bigger than the range span degrades to one frame at
	// the range's start, same as whole-video interval mode.
	const s = src(30);
	const t = planFrameTimestamps(s, baseOptions({ mode: 'range', rangeStartSec: 5, rangeEndSec: 8, rangeIntervalSec: 60 }));
	check('interval > range span yields one frame at range start', t.length === 1 && t[0] === 5, `(${JSON.stringify(t)})`);
}

console.log('\n=== MODE: count ===');
{
	const s = src(90);
	const t = planFrameTimestamps(s, baseOptions({ mode: 'count', count: 10 }));
	check('count=10 yields exactly 10 frames', t.length === 10, `(${t.length})`);
	check('first frame at 0', t[0] === 0);
	check('last frame at duration', Math.abs(t[t.length - 1] - 90) < 1e-9, `(${t[t.length - 1]})`);
	check('evenly spaced', Math.abs(t[1] - t[0] - 90 / 9) < 1e-9);
}
{
	// count === 1: no natural "first/last" for a single thumbnail, so the
	// planner should land on the midpoint rather than either edge.
	const s = src(100);
	const t = planFrameTimestamps(s, baseOptions({ mode: 'count', count: 1 }));
	check('count=1 lands on the midpoint', t.length === 1 && t[0] === 50, `(${JSON.stringify(t)})`);
}
{
	// count clamps into [MIN_FRAME_COUNT, MAX_FRAME_COUNT] the same way
	// interval clamps into its own bounds.
	const s = src(60);
	const t = planFrameTimestamps(s, baseOptions({ mode: 'count', count: 9999 }));
	check('an absurd count clamps down to MAX_FRAME_COUNT', t.length === 300, `(${t.length})`);
}
{
	const s = src(60);
	const t = planFrameTimestamps(s, baseOptions({ mode: 'count', count: 0 }));
	check('count of 0 clamps up to MIN_FRAME_COUNT (1 frame)', t.length === 1, `(${t.length})`);
}
{
	// Zero-duration source in count mode: every evenly-spaced timestamp
	// collapses to 0, and dedup should leave just one.
	const s = src(0);
	const t = planFrameTimestamps(s, baseOptions({ mode: 'count', count: 8 }));
	check('zero-duration source dedupes down to a single frame at 0', t.length === 1 && t[0] === 0, `(${JSON.stringify(t)})`);
}

console.log('\n=== DEDUPE / SORT ===');
{
	// Even though every generator here already produces sorted, non-crossing
	// output, planFrameTimestamps should be safe to treat as "sorted, deduped"
	// unconditionally -- assert that contract directly.
	const s = src(37);
	for (const mode of ['interval', 'range', 'count']) {
		const t = planFrameTimestamps(
			s,
			baseOptions({ mode, intervalSec: 3, rangeStartSec: 2, rangeEndSec: 30, rangeIntervalSec: 3, count: 12 })
		);
		const sorted = t.every((x, i) => i === 0 || x >= t[i - 1]);
		const noDupes = t.every((x, i) => i === 0 || x - t[i - 1] > 0.0009);
		check(`${mode}: timestamps sorted ascending`, sorted);
		check(`${mode}: no near-duplicate timestamps`, noDupes);
	}
}

console.log('\n=== FILENAME HELPERS ===');
check('formatTimecodeForFilename(0)', formatTimecodeForFilename(0) === '00m00s');
check('formatTimecodeForFilename(65)', formatTimecodeForFilename(65) === '01m05s');
check('formatTimecodeForFilename(3661) rolls minutes past 59', formatTimecodeForFilename(3661) === '61m01s');
check('outputBaseName strips extension', outputBaseName('clip.mp4') === 'clip');
check('outputBaseName handles no extension', outputBaseName('clip') === 'clip');
check(
	'singleFrameFileName',
	singleFrameFileName('My Clip.mov', 7, 'jpeg') === 'My Clip_frame_00m07s.jpg',
	singleFrameFileName('My Clip.mov', 7, 'jpeg')
);
check(
	'frameEntryFileName pads to 4 digits for small totals',
	frameEntryFileName(0, 0, 'png', 12) === 'frame_0001_00m00s.png',
	frameEntryFileName(0, 0, 'png', 12)
);
check(
	'frameEntryFileName widens padding for large totals',
	frameEntryFileName(0, 0, 'png', 12345) === 'frame_00001_00m00s.png',
	frameEntryFileName(0, 0, 'png', 12345)
);
check('zipFileName', zipFileName('clip.mp4') === 'frames_clip.zip');

console.log(failures === 0 ? '\nALL CHECKS PASSED\n' : `\n${failures} CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
