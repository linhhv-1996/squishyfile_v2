// Generates a deterministic, self-contained SVG banner for a blog post —
// no external image, no network request, no assets folder to keep in
// sync. Same architecture rationale as the rest of the site: everything
// renders from data already on hand (slug + title), server-side, and
// ships to the browser as one inline data: URI. Purely decorative — its
// job is to give the blog detail page a real above-the-fold image
// (standard 1200x630 OG/banner size) so the page reads as content-rich
// rather than a bare text page.

const WIDTH = 1200;
const HEIGHT = 630;

// Brand gradient pairs, drawn from global.css's :root palette. Picked
// deterministically per-slug so a given post always gets the same
// banner, but which pair a post gets looks arbitrary.
const PALETTES: [string, string][] = [
	['#1FAFA0', '#0E6B60'], // teal -> deep teal
	['#FF6F5E', '#D9432F'], // coral -> deep coral
	['#1FAFA0', '#FF6F5E'], // teal -> coral diagonal
	['#16645C', '#1FAFA0'], // ink-teal -> teal
	['#FF6F5E', '#2D3A34'] // coral -> ink
];

type IconKey = 'video' | 'audio' | 'image' | 'pdf' | 'generic';

function hashStr(input: string): number {
	let h = 0;
	for (let i = 0; i < input.length; i++) {
		h = (h * 31 + input.charCodeAt(i)) >>> 0;
	}
	return h;
}

function pickPalette(slug: string): [string, string] {
	return PALETTES[hashStr(slug) % PALETTES.length];
}

function pickIcon(slug: string, title: string): IconKey {
	const s = `${slug} ${title}`.toLowerCase();
	if (/\bmp3|bitrate|audio|waveform\b/.test(s)) return 'audio';
	if (/\bimage|photo|png|jpe?g|picture\b/.test(s)) return 'image';
	if (/\bpdf|document\b/.test(s)) return 'pdf';
	if (/\bvideo|mp4|mov|clip|footage\b/.test(s)) return 'video';
	return 'generic';
}

function escapeXml(input: string): string {
	return input
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

// Large, low-opacity watermark icon (0,0)-(280,280) local coordinate box,
// meant to be placed and scaled via a transform by the caller.
function iconMarkup(icon: IconKey): string {
	switch (icon) {
		case 'video':
			return `
				<rect x="20" y="60" width="180" height="160" rx="24" fill="white"/>
				<path d="M220 110 L280 80 L280 200 L220 170 Z" fill="white"/>
				<path d="M95 100 L165 140 L95 180 Z" fill-opacity="0.35" fill="#0E6B60"/>`;
		case 'audio':
			return `
				<rect x="30" y="150" width="28" height="90" rx="10" fill="white"/>
				<rect x="80" y="100" width="28" height="140" rx="10" fill="white"/>
				<rect x="130" y="50" width="28" height="190" rx="10" fill="white"/>
				<rect x="180" y="90" width="28" height="150" rx="10" fill="white"/>
				<rect x="230" y="130" width="28" height="110" rx="10" fill="white"/>`;
		case 'image':
			return `
				<rect x="20" y="40" width="240" height="200" rx="20" fill="white"/>
				<circle cx="90" cy="105" r="24" fill-opacity="0.35" fill="#0E6B60"/>
				<path d="M40 220 L120 140 L165 185 L210 130 L240 220 Z" fill-opacity="0.35" fill="#0E6B60"/>`;
		case 'pdf':
			return `
				<path d="M40 20 H190 L240 70 V240 H40 Z" fill="white"/>
				<path d="M190 20 L240 70 H190 Z" fill-opacity="0.35" fill="#0E6B60"/>
				<rect x="70" y="120" width="140" height="14" rx="7" fill-opacity="0.35" fill="#0E6B60"/>
				<rect x="70" y="150" width="140" height="14" rx="7" fill-opacity="0.35" fill="#0E6B60"/>
				<rect x="70" y="180" width="90" height="14" rx="7" fill-opacity="0.35" fill="#0E6B60"/>`;
		default:
			return `
				<rect x="30" y="30" width="220" height="220" rx="28" fill="white"/>
				<path d="M140 70 L100 110 H125 V150 H155 V110 H180 Z" fill-opacity="0.35" fill="#0E6B60"/>
				<path d="M140 210 L180 170 H155 V130 H125 V170 H100 Z" fill-opacity="0.35" fill="#0E6B60"/>`;
	}
}

// Greedy word-wrap using an approximate average glyph width — good
// enough for a decorative headline, not typeset text.
function wrapTitle(title: string, maxCharsPerLine: number, maxLines: number): string[] {
	const words = title.split(/\s+/).filter(Boolean);
	const lines: string[] = [];
	let current = '';
	let consumedWords = 0;
	for (const word of words) {
		const candidate = current ? `${current} ${word}` : word;
		if (candidate.length > maxCharsPerLine && current) {
			lines.push(current);
			current = word;
			consumedWords += 1;
			if (lines.length === maxLines) break;
		} else {
			current = candidate;
			consumedWords += 1;
		}
	}
	if (lines.length < maxLines && current) {
		lines.push(current);
	}
	if (consumedWords < words.length) {
		const last = lines[lines.length - 1];
		lines[lines.length - 1] = last.length > 1 ? `${last.slice(0, -1)}…` : `${last}…`;
	}
	return lines;
}

/** Deterministic, dependency-free SVG banner as a base64 data: URI. */
export function generateBlogBanner(slug: string, title: string): string {
	const [from, to] = pickPalette(slug);
	const icon = pickIcon(slug, title);
	const lines = wrapTitle(title, 22, 3);
	const lineHeight = 58;
	const startY = HEIGHT / 2 - ((lines.length - 1) * lineHeight) / 2 + 90;

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
		<defs>
			<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
				<stop offset="0%" stop-color="${from}"/>
				<stop offset="100%" stop-color="${to}"/>
			</linearGradient>
		</defs>
		<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
		<circle cx="1060" cy="90" r="220" fill="white" fill-opacity="0.06"/>
		<circle cx="120" cy="560" r="160" fill="white" fill-opacity="0.06"/>
		<g transform="translate(860,150) scale(1.15)" opacity="0.9">${iconMarkup(icon)}</g>
		<text x="80" y="90" font-family="'Baloo 2','Plus Jakarta Sans',sans-serif" font-weight="700" font-size="26" fill="white" fill-opacity="0.85">SquishyFile</text>
		${lines
			.map(
				(line, i) =>
					`<text x="80" y="${startY + i * lineHeight}" font-family="'Baloo 2','Plus Jakarta Sans',sans-serif" font-weight="800" font-size="48" fill="white">${escapeXml(line)}</text>`
			)
			.join('\n\t\t')}
	</svg>`;

	const base64 = Buffer.from(svg, 'utf-8').toString('base64');
	return `data:image/svg+xml;base64,${base64}`;
}
