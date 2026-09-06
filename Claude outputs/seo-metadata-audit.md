# SquishyFile — SEO Title & Meta Description Audit

**Scope note:** the task brief referenced "TapirConvert," but the connected project (`squishyfile_v2`) is **SquishyFile** (squishyfile.com) — a free, browser-based video toolset (compress, compress-to-size, compress-on-iPhone, video→MP3, MP4→MP3, MOV→MP3, video upscaler, video→text). The sitemap in the brief matches this project's actual routes exactly, so this audit was run against SquishyFile's real metadata (`src/lib/i18n/locales/en.json` → `pages.*.meta`) and its `seo_data/*.csv` keyword files. If TapirConvert was intended, let me know and I'll redo this against that codebase.

Only SEO `<title>` and meta description are evaluated/changed below. H1/H2, page copy, CTAs, FAQs, URLs, internal links, alt text, and structured data are untouched, per scope.

A `seo_data/compress_audio/` keyword set exists but there is no live `/compress-audio` route in the sitemap, so it's excluded from this audit.

---

## 1. Executive Summary

The current metadata strategy is decent on primary keyword targeting but **wastes real title real estate on unsupported generic modifiers**. Five of the eight audited pages ("/", `/video-to-mp3`, `/mp4-to-mp3`, `/mov-to-mp3`, `/video-upscaler`, `/video-to-text`) close their title with "No Watermark," "No Limit," and/or "No Sign-Up" — phrases that, when checked against their own keyword CSVs, return **zero or near-zero search volume** as exact phrases (e.g. "video to mp3 converter no watermark" = 0, "video transcription no upload" = 0, "video upscaler no watermark" = 0). Meanwhile, real, high-volume secondary clusters sit unused in the same CSVs: "video transcription" (27,100/mo) and "transcribe video" (27,100/mo) are ignored by `/video-to-text`'s title in favor of "No Upload, No Sign-Up"; "extract audio from video" (18,100/mo) is ignored by `/video-to-mp3`; "compress video online" / "online video compressor" (12,100/mo each) are ignored by the homepage.

The descriptions are, on the whole, doing their job well — they're where "free," "no upload," "no sign-up," and "browser-based" genuinely belong, and most descriptions already state them naturally without keyword-stuffing. So the fix here is concentrated almost entirely on titles: swap zero-evidence modifiers for the strongest unused secondary keyword cluster in each tool's own CSV, and only keep a modifier in the title when its own CSV row shows meaningful volume (e.g. "free" is well-supported almost everywhere; "online" is well-supported specifically for the homepage; "no watermark/no upload/no sign-up" are not supported anywhere in title space and should live in descriptions only).

Two pages are already well-optimized and should be left alone: `/compress-video-to-size` and `/compress-video-on-iphone` — both already lead with their single strongest keyword and don't have a comparably strong unused secondary cluster to swap in.

Site-wide, there's a mapping problem worth fixing deliberately rather than accidentally: `/video-to-mp3`, `/mp4-to-mp3`, and `/mov-to-mp3` all sit in the same keyword universe (`seo_data/video2mp3/`), and the highest-volume term on the entire site — "mp4 to mp3" at 201,000/mo — belongs to `/mp4-to-mp3`. The generic/multi-format terms ("video to mp3 converter" 40,500/mo, "extract audio from video" 18,100/mo) should stay anchored to `/video-to-mp3`, and MOV-specific terms to `/mov-to-mp3`, so titles don't quietly cannibalize each other.

---

## 2. Keyword Analysis by Tool

All volumes below are from `seo_data/*/*_us.csv` (the largest, most complete market file in each folder). The UK/AUS/CAN/NZ files were checked and follow the same keyword architecture at lower volumes.

### `/compress-video-to-size` (`seo_data/compress_video/`)
- **Primary cluster:** target-size compression — "compress video to 10mb" (880), "compress video to 25mb" (170), "compress video to 50mb" (110), "compress video to 100mb" (90), "compress video under 25mb" (40), plus the broader size-reduction phrasing "reduce video size" (5,400), "video size reducer" (3,600), "reduce mp4 file size" (2,400), "shrink video size" (1,000).
- **Secondary cluster:** platform-specific size limits — "compress video for discord" (1,300), "compress video for email" (720), "compress video for whatsapp" (210), "compress video for instagram" (210).
- **Modifier opportunities:** "free" has support ("compress video free" 1,300); "no watermark/no upload/no sign up" have ~0 volume as exact phrases in this CSV.
- **Long-tail:** "compress video for twitter" (30), "compress large video file" (170).
- **Do not target here:** generic "video compressor" (90,500), "compress video" (33,100), "compress video online" (12,100) — these belong to the homepage; targeting them here would cannibalize "/".

### `/compress-video-on-iphone` (`seo_data/compress_video/`)
- **Primary cluster:** exactly one row — "compress video on iphone" (3,600, SEO difficulty 49). No other CSV row is iPhone-specific.
- **Secondary/long-tail:** none in the CSV. The "Safari" and "no app" angle in the current title is an intent/UX signal, not a keyword the CSV evidences — it's defensible as a differentiator but shouldn't be assumed to carry search volume.
- **Do not target here:** the general compression terms above (owned by "/") and the size-target terms (owned by `/compress-video-to-size`).

### `/video-to-mp3` (`seo_data/video2mp3/`) — generic, multi-format converter
- **Primary cluster:** "video to mp3 converter" (40,500), "convert video to mp3" (12,100), "change video to mp3" (12,100), "turn video into mp3" (4,400).
- **Secondary cluster:** "video to audio converter" (12,100), "convert video to audio" (6,600), "extract audio from video" (18,100) — this is the single largest unused keyword concept on this page.
- **Modifier opportunities:** "free" supported ("video converter to mp3 free" 9,900, "online video to mp3 converter" 8,100); "no limit"/"no watermark" show 0 volume ("video to mp3 converter no watermark" = 0).
- **Do not target here:** "mp4 to mp3" (201,000) and "mov to mp3"/"convert mov to mp3" (27,100 each) — these belong to the format-specific pages below.

### `/mp4-to-mp3` (`seo_data/video2mp3/`) — the site's single highest-volume keyword
- **Primary cluster:** "mp4 to mp3" (201,000), "mp4 to mp3 converter" (33,100), "convert mp4 to mp3" (22,200).
- **Secondary cluster:** none MP4-specific beyond the primary cluster itself; "mp4 converter to mp3 free" (880) is the only secondary row.
- **Modifier opportunities:** "free" has modest support (880); "no limit"/"no watermark" have 0 evidence for this format.
- **Do not target here:** the generic/other-format terms above.

### `/mov-to-mp3` (`seo_data/video2mp3/`)
- **Primary cluster:** "convert mov to mp3" (27,100), "mov to mp3 converter" (27,100) — tied, both very strong.
- **Secondary/long-tail:** none MOV-specific in the CSV beyond the primary pair. The page's iPhone/QuickTime framing (in its H1/subtitle, out of scope here) isn't backed by a distinct keyword row, so it belongs in the description as context, not asserted as a title keyword.
- **Modifier opportunities:** "free" — no MOV-specific row for it; treat as description-only USP.

### `/video-upscaler` (`seo_data/upscale_video/`)
- **Primary cluster:** "video upscaler" (5,400), "upscale video" (4,400), "ai video upscaler" (3,600).
- **Secondary cluster:** resolution-specific — "upscale video to 4k" (880), "video upscaler 4k" (590), "upscale 1080p to 4k" (210); quality-framing terms "enhance video quality" / "video quality enhancer" (9,900 each) are adjacent but describe a broader "quality enhancement" intent than this tool's resolution-upscaling function, so they're a weaker semantic fit than they look on volume alone.
- **Modifier opportunities:** "free" well supported ("free video upscaler" 1,900); "no watermark"/"no upload" show 0 volume as exact phrases.
- **Long-tail:** "upscale 480p to 1080p" (70), "upscale 720p to 1080p" (50).

### `/video-to-text` (`seo_data/video2text/`) — the biggest gap on the site
- **Primary cluster (currently under-targeted):** "video transcription" (27,100), "transcribe video" (27,100), "video transcriber" (18,100), "transcribe video to text" (14,800), "video transcript generator" (9,900) — all far larger than "video to text" (6,600) or "video to text converter" (3,600), which is all the current title targets.
- **Secondary cluster:** "free video transcriber" (5,400), "mp4 to text" (1,300).
- **Modifier opportunities:** "free" well supported; "no upload"/"no sign up" show 0 volume as exact phrases ("video transcription no upload" = 0, "video transcriber no sign up" = 0).
- **Do not target here:** subtitle/caption-generation terms ("generate subtitles from video" 880, "auto subtitle generator" 720, "video to srt" 170) — different output format (SRT/captions vs. plain transcript text), not this tool's function per its own copy ("Download .txt").

### Homepage `/` (`seo_data/compress_video/`) — generic compressor
- **Primary cluster:** "video compressor" (90,500) — the single largest keyword in the entire dataset — plus "compress video" (33,100).
- **Secondary cluster (currently unused):** "compress video online" (12,100) + "online video compressor" (12,100) — a combined ~24,000/mo cluster that the CSV data genuinely supports, unlike the generic "no watermark/no limit" currently in the title (0 evidence).
- **Modifier opportunities:** "free" well supported ("compress video free" 1,300, plus site-wide brand positioning); "online" earns its place here specifically, unlike on the sub-pages.

---

## 3. Full Metadata Audit

| Route | Current SEO Title | Title Action | Current SEO Description | Description Action | Main Problem |
|---|---|---|---|---|---|
| `/` | SquishyFile — Free Video Compressor, No Watermark or Limit | MAJOR REVISION | Free online video compressor for MP4, MOV, MKV, AVI and WebM — no uploads, no file-size limit, no watermark, no sign up required. | KEEP | "No Watermark or Limit" has ~0 keyword evidence; ignores "compress video online"/"online video compressor" (12,100 each) |
| `/compress-video-to-size` | Compress Video to 10MB, 25MB or Any Size — SquishyFile | MINOR REVISION | Shrink your video to an exact size — 10MB, 25MB or any target — for email, Discord, WhatsApp and Instagram limits. 100% free, no watermark, no sign up. | KEEP | "or Any Size" matches no real query; a third exact-match size term would use the space better |
| `/compress-video-on-iphone` | Compress Video on iPhone in Safari — No App Needed | KEEP | Compress video on your iPhone right in Safari — no app to install. Pick a video from Photos and shrink it down for free; nothing ever leaves your phone. | KEEP | None — only one keyword exists for this page and it's already the title's anchor |
| `/video-to-mp3` | Video to MP3 Converter — Free, No Limit, No Watermark | MAJOR REVISION | Convert any video to MP3 free — extract audio from MP4, MOV, MKV, AVI and WebM. No file-size limit, no watermark, no sign up required. | KEEP | "No Limit, No Watermark" ~0 evidence; "extract audio from video" (18,100) unused |
| `/mp4-to-mp3` | MP4 to MP3 Converter — Free, No Limit, No Watermark | MINOR REVISION | Convert MP4 to MP3 free — extract the audio track from any MP4 video. No file-size limit, no watermark, no sign up needed. | KEEP | "No Limit, No Watermark" ~0 evidence; no stronger unused secondary exists, so simplify rather than replace |
| `/mov-to-mp3` | MOV to MP3 Converter — Free, No Limit, No Watermark | MINOR REVISION | Convert MOV to MP3 free — extract audio from iPhone and QuickTime videos. No file-size limit, no watermark, no sign up needed. | KEEP | Same as above — no stronger MOV-specific secondary exists in the CSV |
| `/video-upscaler` | Video Upscaler — Free 1080p & 4K AI Upscaling, No Watermark | MINOR REVISION | Free video upscaler that runs entirely in your browser — upscale 480p or 720p video to 1080p or 4K with 2x or 4x scale, no upload, no watermark, no sign up. | KEEP | "No Watermark" ~0 evidence; title is otherwise strong and dense with real keyword concepts |
| `/video-to-text` | Free Video to Text Converter – No Upload, No Sign-Up | MAJOR REVISION | Transcribe video to text for free, right in your browser. No uploads, no size limit, no sign-up — works with MP4, MOV, MKV, AVI, WebM and multiple languages. | KEEP | "No Upload, No Sign-Up" ~0 evidence; ignores "video transcription"/"transcribe video" (27,100 each) — the largest gap on the site |

---

## 4. Recommended Metadata

| Route | Recommended SEO Title | Why | Recommended SEO Description | Why |
|---|---|---|---|---|
| `/` | Free Video Compressor Online — SquishyFile | Keeps the site's single biggest term ("video compressor," 90,500) and "free" (supported by "compress video free," 1,300), and swaps "No Watermark or Limit" (0 evidence) for "Online" — backed by "compress video online" + "online video compressor" (12,100 each combined ≈ 24,000), a real cluster the old title ignored entirely. | Free online video compressor for MP4, MOV, MKV, AVI and WebM — no uploads, no file-size limit, no watermark, no sign up required. | Already covers formats plus the USPs that belong in a description; no change needed. |
| `/compress-video-to-size` | Compress Video to 10MB, 25MB or 50MB — SquishyFile | Replaces "or Any Size" (matches no real query) with a third exact-match size target ("compress video to 50mb," 110) — three concrete, searched size points instead of one vague phrase, at the same length. | Shrink your video to an exact size — 10MB, 25MB or any target — for email, Discord, WhatsApp and Instagram limits. 100% free, no watermark, no sign up. | Unchanged — description already generalizes to "any target" correctly and carries the platform-specific secondary cluster. |
| `/video-to-mp3` | Video to MP3 Converter – Extract Audio from Video | Keeps the primary term ("video to mp3 converter," 40,500) and replaces "No Limit, No Watermark" (0 evidence each) with "Extract Audio from Video" — 18,100/mo, the largest unused keyword concept in this tool's own CSV, and an accurate description of what the tool does for any input format. | Convert any video to MP3 free — extract audio from MP4, MOV, MKV, AVI and WebM. No file-size limit, no watermark, no sign up required. | Unchanged — already states "free," "no file-size limit," "no watermark," "no sign up" appropriately, which is exactly where those USPs belong. |
| `/mp4-to-mp3` | MP4 to MP3 Converter — 100% Free | Keeps the site's highest-volume keyword ("mp4 to mp3," 201,000, contained in "mp4 to mp3 converter") and "free" (supported by "mp4 converter to mp3 free," 880). Drops "No Limit, No Watermark" (0 evidence) without replacing it with an unsupported claim, since no stronger MP4-specific secondary cluster exists in the CSV — better to be concise than to fill space with unevidenced modifiers. | Convert MP4 to MP3 free — extract the audio track from any MP4 video. No file-size limit, no watermark, no sign up needed. | Unchanged — same reasoning as above. |
| `/mov-to-mp3` | MOV to MP3 Converter — 100% Free | Same logic as `/mp4-to-mp3`: keeps the tied-primary term ("convert mov to mp3" / "mov to mp3 converter," 27,100 each) and "free," drops the two zero-evidence modifiers. No MOV-specific secondary keyword exists to substitute in. | Convert MOV to MP3 free — extract audio from iPhone and QuickTime videos. No file-size limit, no watermark, no sign up needed. | Unchanged — the iPhone/QuickTime framing is a fine description-level clarifier even without its own keyword row. |
| `/video-upscaler` | Video Upscaler — Free AI Upscaling to 1080p & 4K | Keeps "video upscaler" (5,400), "ai" (from "ai video upscaler," 3,600), "free" ("free video upscaler," 1,900), and the resolution long-tails ("upscale video to 4k" 880, "upscale 1080p to 4k" 210). Drops only "No Watermark" (0 evidence) — everything else in the current title was already well-targeted. | Free video upscaler that runs entirely in your browser — upscale 480p or 720p video to 1080p or 4K with 2x or 4x scale, no upload, no watermark, no sign up. | Unchanged — correct place for "no upload/no watermark/no sign up." |
| `/video-to-text` | Video to Text Converter – Free Video Transcription | Keeps "video to text converter" (3,600, matches URL/H1 intent) and swaps "No Upload, No Sign-Up" (0 evidence each) for "Free Video Transcription" — "video transcription" alone is 27,100/mo (4x the primary term) and "free video transcriber" is 5,400/mo. This is the single biggest keyword-to-title mismatch found on the site. | Transcribe video to text for free, right in your browser. No uploads, no size limit, no sign-up — works with MP4, MOV, MKV, AVI, WebM and multiple languages. | Unchanged — already leads with "Transcribe video to text," covers the USPs, and lists supported formats/languages appropriately. |

**Alternative for `/video-to-text`** if leading with the higher-volume phrase is preferred over matching the URL slug exactly: **"Transcribe Video to Text – Free Video Transcriber"** (uses "transcribe video to text," 14,800, and "free video transcriber," 5,400 — both stronger than "video to text converter" at 3,600). Either direction fixes the core problem; this is a matter of preference between URL-echoing and highest-volume-first.

---

## 5. Titles That Should Remain Unchanged

- **`/compress-video-on-iphone`** — "Compress Video on iPhone in Safari — No App Needed." Only one relevant keyword exists for this page ("compress video on iphone," 3,600) and it's already the title's anchor; there's no comparably strong unused secondary term in the CSV to swap in for "in Safari — No App Needed," and that phrase communicates real differentiating intent (works without installing an app) even though it isn't itself a distinct search query.
- **All five descriptions flagged "KEEP" above** — they already do what descriptions should: state the primary function, list supported formats, and carry the free/no-upload/no-watermark/no-sign-up USPs that don't deserve title space. No wording changes recommended.

---

## 6. "FREE / ONLINE / NO UPLOAD / NO SIGN-UP" Analysis

| Modifier | Tool | Keyword Evidence | Use in Title? | Use in Description? | Reason |
|---|---|---|---|---|---|
| Free | Homepage | "compress video free" (1,300) | Yes | Yes | Real, if modest, direct-match volume; also the site's core value prop |
| Online | Homepage | "compress video online" + "online video compressor" (12,100 + 12,100) | Yes | Optional | Combined ~24,000/mo — one of the largest unused clusters found in this audit |
| Free | `/compress-video-to-size` | "compress video free" (1,300, shared cluster) | No (title already full of stronger size-specific terms) | Yes | Title space better spent on three exact-match size targets |
| No Watermark/No Upload/No Sign-Up | `/compress-video-to-size` | 0 volume for all exact phrases in CSV | No | Yes | Zero search evidence at any point in this CSV |
| Free | `/compress-video-on-iphone` | No dedicated row | No (title already anchored to the one keyword available) | Yes | "for free" reads naturally in the description as a benefit, not a searched term |
| Free | `/video-to-mp3` | "video converter to mp3 free" (9,900), "free video to mp3 converter" (720) | No (title space better spent on "extract audio from video," 18,100) | Yes | Strong support, but an even stronger unused secondary keyword exists for the title |
| No Limit / No Watermark | `/video-to-mp3`, `/mp4-to-mp3`, `/mov-to-mp3` | 0 volume ("video to mp3 converter no watermark" = 0, no "no limit" row at all) | No | Yes | No evidence anywhere in this CSV |
| Free | `/mp4-to-mp3` | "mp4 converter to mp3 free" (880) | Yes | Yes | Modest but real support, and no stronger MP4-specific secondary exists to use instead |
| Free | `/mov-to-mp3` | No MOV-specific row | Yes (kept for consistency with `/mp4-to-mp3` given no stronger alternative) | Yes | Weakest-evidenced "yes" in this table — acceptable only because there is no competing keyword to use that space on |
| Free | `/video-upscaler` | "free video upscaler" (1,900) | Yes | Yes | Solid direct-match support |
| No Watermark / No Upload | `/video-upscaler` | 0 volume for both exact phrases | No | Yes | No evidence in this CSV |
| Free | `/video-to-text` | "free video transcriber" (5,400) | Yes | Yes | Strong support — kept in the recommended title |
| No Upload / No Sign-Up | `/video-to-text` | 0 volume for both exact phrases ("video transcription no upload" = 0, "video transcriber no sign up" = 0) | No | Yes | The clearest zero-evidence case on the site — currently occupies half the title |

---

## 7. Keyword-to-Page Mapping

| Keyword Cluster | Primary Target Page | Reason |
|---|---|---|
| video compressor, compress video, compress video online, online video compressor | `/` (homepage) | Generic/broad compression intent with no target-size or platform signal; homepage is the natural landing page and already ranks-intent-matches best |
| compress video to 10mb/25mb/50mb/100mb, reduce video size, video size reducer, compress video for discord/email/whatsapp/instagram | `/compress-video-to-size` | Explicit target-size or platform-limit intent — a distinct sub-intent from generic compression |
| compress video on iphone | `/compress-video-on-iphone` | Device-specific intent; only page that matches it |
| video to mp3 converter, convert video to mp3, video to audio converter, extract audio from video, change video to mp3, turn video into mp3 | `/video-to-mp3` | Generic/format-agnostic conversion intent; page explicitly supports multiple input formats |
| mp4 to mp3, mp4 to mp3 converter, convert mp4 to mp3 | `/mp4-to-mp3` | Format-specific, and by far the highest-volume term on the site (201,000/mo) — deserves its own page rather than folding into the generic converter |
| convert mov to mp3, mov to mp3 converter | `/mov-to-mp3` | Format-specific; tied second-highest exact-match volume in the video2mp3 set |
| video upscaler, upscale video, ai video upscaler, upscale video to 4k/1080p | `/video-upscaler` | Only page matching resolution-upscaling intent |
| video to text, video to text converter, video transcription, transcribe video, video transcriber, transcribe video to text | `/video-to-text` | Only page matching transcription intent; subtitle/SRT-specific queries are excluded since the tool outputs plain text, not SRT/caption files |

---

## 8. Final Recommended Metadata Strategy

**`/compress-video-to-size`**
Title strategy: Keep the size-anchored format ("Compress Video to 10MB, 25MB or 50MB"), swapping the vague "or Any Size" for a third real exact-match size query.
Description strategy: No change — already balances the primary size intent with the platform-specific secondary cluster and appropriate USPs.

**`/compress-video-on-iphone`**
Title strategy: No change — the single available keyword is already the anchor, and the "in Safari / no app" framing is a reasonable, if keyword-unevidenced, intent signal.
Description strategy: No change.

**`/video-to-mp3`**
Title strategy: Replace the two zero-evidence modifiers ("No Limit, No Watermark") with "Extract Audio from Video" (18,100/mo) — the largest unused, directly-relevant keyword concept for this generic/multi-format page.
Description strategy: No change — USPs already correctly placed here.

**`/mp4-to-mp3`**
Title strategy: Keep the primary keyword (this is the site's highest-volume page at 201,000/mo), keep "Free" (weakly but genuinely supported), drop "No Limit, No Watermark" without substitution since no stronger MP4-specific secondary term exists.
Description strategy: No change.

**`/mov-to-mp3`**
Title strategy: Same treatment as `/mp4-to-mp3` — keep the tied-primary term and "Free," drop the two zero-evidence modifiers.
Description strategy: No change.

**`/video-upscaler`**
Title strategy: Keep the already-strong keyword density (upscaler, AI, 1080p, 4K, free) and drop only "No Watermark," which has zero keyword evidence and is the sole weak point in an otherwise well-built title.
Description strategy: No change.

**`/video-to-text`**
Title strategy: This is the site's clearest miss — replace "No Upload, No Sign-Up" (0 evidence, currently half the title) with "Free Video Transcription" or "Free Video Transcriber," both of which are 4–5x the volume of the primary term currently used alone.
Description strategy: No change — already leads with the correct action phrase and lists the right USPs and formats.
