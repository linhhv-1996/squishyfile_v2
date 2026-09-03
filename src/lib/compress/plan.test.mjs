// Sanity-check the planner against realistic scenarios.
// Run with: node --experimental-strip-types (or after tsc). We import the
// compiled JS emitted next to it.
import { planForTargetSize, planForLevel, correctTargetBytes } from './plan.js';

const MB = 1024 * 1024;
let failures = 0;

function check(label, condition, detail = '') {
	if (!condition) {
		failures++;
		console.log(`  FAIL  ${label} ${detail}`);
	} else {
		console.log(`  ok    ${label} ${detail}`);
	}
}

function bpp(p) {
	return p.videoBitrate / (p.width * p.height * p.frameRate);
}

function describe(p) {
	return `${p.width}x${p.height}@${p.frameRate} v=${Math.round(p.videoBitrate / 1000)}k a=${
		p.audioBitrate ? Math.round(p.audioBitrate / 1000) + 'k' : 'none'
	} warn=[${p.warnings.join(',')}]`;
}

function predictedBytes(p, duration) {
	return ((p.videoBitrate + (p.audioBitrate ?? 0)) * duration) / 8;
}

const scenarios = [
	{
		name: '4K 60fps drone, 10 min, 100 Mbps → 25 MB (Discord)',
		src: { durationSec: 600, width: 3840, height: 2160, frameRate: 60, videoBitrate: 100e6, totalBytes: 7500 * MB, hasAudio: true, audioChannels: 2 },
		target: 25
	},
	{
		name: '1080p30 phone clip, 60s, 20 Mbps → 8 MB (email)',
		src: { durationSec: 60, width: 1920, height: 1080, frameRate: 30, videoBitrate: 20e6, totalBytes: 150 * MB, hasAudio: true, audioChannels: 2 },
		target: 8
	},
	{
		name: 'Portrait iPhone 1080x1920 30fps, 30s → 10 MB',
		src: { durationSec: 30, width: 1080, height: 1920, frameRate: 30, videoBitrate: 18e6, totalBytes: 67 * MB, hasAudio: true, audioChannels: 2 },
		target: 10
	},
	{
		name: 'Absurd: 1h 1080p lecture → 10 MB',
		src: { durationSec: 3600, width: 1920, height: 1080, frameRate: 30, videoBitrate: 4e6, totalBytes: 1800 * MB, hasAudio: true, audioChannels: 2 },
		target: 10
	},
	{
		name: 'Target bigger than source: 5 MB clip → 50 MB',
		src: { durationSec: 20, width: 1280, height: 720, frameRate: 30, videoBitrate: 1.8e6, totalBytes: 5 * MB, hasAudio: true, audioChannels: 2 },
		target: 50
	},
	{
		name: '720p30 already-compressed 1.5 Mbps, 2 min → 25 MB',
		src: { durationSec: 120, width: 1280, height: 720, frameRate: 30, videoBitrate: 1.5e6, totalBytes: 24 * MB, hasAudio: true, audioChannels: 2 },
		target: 25
	}
];

console.log('\n=== TARGET SIZE MODE ===');
for (const s of scenarios) {
	const p = planForTargetSize(s.src, s.target * MB);
	console.log(`\n${s.name}\n  → ${describe(p)}`);
	const pred = predictedBytes(p, s.src.durationSec);
	check('predicted size <= target', pred <= s.target * MB + 1024, `(${(pred / MB).toFixed(2)} MB vs ${s.target} MB)`);
	check('never upscales', p.width <= s.src.width && p.height <= s.src.height);
	check('even dimensions', p.width % 2 === 0 && p.height % 2 === 0);
	check('aspect ratio preserved (<1%)', Math.abs(p.width / p.height - s.src.width / s.src.height) / (s.src.width / s.src.height) < 0.01);
	// The bpp floor only applies when the target is what constrains us. When
	// the source itself is thinner than the budget we deliberately keep the
	// native resolution instead of downscaling for no reason.
	if (!p.warnings.includes('quality_will_be_poor') && !p.cappedBySource) {
		check('bpp above floor', bpp(p) >= 0.07, `(bpp=${bpp(p).toFixed(3)})`);
	}
}

console.log('\n=== SPECIFIC EXPECTATIONS ===');
{
	const p = planForTargetSize(scenarios[0].src, 25 * MB);
	check('4K/10min/25MB does NOT stay at 4K', p.height < 2160, `(got ${p.width}x${p.height})`);
	check('...and drops frame rate from 60', p.frameRate < 60, `(got ${p.frameRate})`);
}
{
	const p = planForTargetSize(scenarios[3].src, 10 * MB);
	check('1h → 10MB warns about quality', p.warnings.includes('quality_will_be_poor'));
	check('1h → 10MB lands at a tiny resolution', Math.min(p.width, p.height) <= 270, `(got ${p.width}x${p.height})`);
}
{
	const p = planForTargetSize(scenarios[4].src, 50 * MB);
	check('target > source is capped by source', p.cappedBySource);
	check('...and warns', p.warnings.includes('target_above_source'));
	check('...and keeps native resolution', p.width === 1280 && p.height === 720, `(got ${p.width}x${p.height})`);
}
{
	const tiny = { durationSec: 1800, width: 1920, height: 1080, frameRate: 30, videoBitrate: 5e6, totalBytes: 1000 * MB, hasAudio: true, audioChannels: 2 };
	const p = planForTargetSize(tiny, 5 * MB);
	check('30min → 5MB drops audio', p.audioBitrate === null && p.warnings.includes('audio_removed'), describe(p));
}

console.log('\n=== LEVEL MODE ===');
const levelSrc = { durationSec: 60, width: 3840, height: 2160, frameRate: 60, videoBitrate: 80e6, totalBytes: 600 * MB, hasAudio: true, audioChannels: 2 };
let prevBitrate = Infinity;
let prevPixels = Infinity;
for (const lvl of [1, 2, 3]) {
	const p = planForLevel(levelSrc, lvl);
	console.log(`  level ${lvl}: ${describe(p)}`);
	check(`level ${lvl} bitrate <= level ${lvl - 1}`, p.videoBitrate <= prevBitrate);
	check(`level ${lvl} pixels <= level ${lvl - 1}`, p.width * p.height <= prevPixels);
	check(`level ${lvl} never exceeds source bitrate`, p.videoBitrate < levelSrc.videoBitrate);
	prevBitrate = p.videoBitrate;
	prevPixels = p.width * p.height;
}
check('level 2 caps at 1080p', Math.min(...Object.values(planForLevel(levelSrc, 2)).filter(Number.isFinite) ? [planForLevel(levelSrc, 2).width, planForLevel(levelSrc, 2).height] : []) === 1080);
check('level 3 caps at 720p', Math.min(planForLevel(levelSrc, 3).width, planForLevel(levelSrc, 3).height) === 720);
check('level 3 caps fps at 30', planForLevel(levelSrc, 3).frameRate === 30);

{
	// The disaster case the bpp floor exists to prevent.
	const thin = { durationSec: 60, width: 1920, height: 1080, frameRate: 30, videoBitrate: 1.6e6, totalBytes: 12 * MB, hasAudio: true, audioChannels: 2 };
	const p = planForLevel(thin, 3);
	console.log(`  thin 1080p @1.6Mbps, level 3: ${describe(p)}`);
	check('thin source is downscaled, not smeared', Math.min(p.width, p.height) < 720, `(got ${p.width}x${p.height})`);
	check('...bpp stays reasonable', bpp(p) >= 0.045, `(bpp=${bpp(p).toFixed(3)})`);
}

console.log('\n=== CORRECTION LOOP ===');
check('overshoot triggers a retry', correctTargetBytes(25 * MB, 30 * MB, 25 * MB, 1, false) !== null);
check('overshoot correction shrinks the budget', correctTargetBytes(25 * MB, 30 * MB, 25 * MB, 1, false) < 25 * MB);
check('a good landing stops', correctTargetBytes(25 * MB, 24 * MB, 25 * MB, 1, false) === null);
check('bad undershoot retries once', correctTargetBytes(25 * MB, 10 * MB, 25 * MB, 1, false) !== null);
check('...but not when capped by source', correctTargetBytes(25 * MB, 10 * MB, 25 * MB, 1, true) === null);
check('...and not on later passes', correctTargetBytes(25 * MB, 10 * MB, 25 * MB, 2, false) === null);
check('gives up after 3 passes', correctTargetBytes(25 * MB, 40 * MB, 25 * MB, 3, false) === null);
check('upward correction never exceeds the target', correctTargetBytes(25 * MB, 10 * MB, 25 * MB, 1, false) <= 25 * MB);

console.log(failures === 0 ? '\nALL CHECKS PASSED\n' : `\n${failures} CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
