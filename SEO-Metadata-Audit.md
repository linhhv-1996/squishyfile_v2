# SquishyFile — SEO Title & Description Audit
*Scope: `<title>` and `<meta name="description">` only. No H1/H2, page copy, UI copy, FAQ, blog, URLs, alt text, structured data, or OG/Twitter tags were touched.*

Data source: `seo_data/*/*.csv` (Search Volume, CPC, Paid Difficulty, SEO Difficulty). Primary analysis uses the **US** file per tool (largest volume, ~50 rows each). UK/AU/CA/NZ files were cross-checked for every tool — keyword *rank order* is consistent across all five markets (e.g. "mp4 to mp3" > "mp4 to mp3 converter" > "convert mp4 to mp3" holds in every country), so US data was used as the representative ranking without inventing or blending metrics.

Metadata source in code: `src/lib/i18n/locales/en.json` → `pages.<key>.meta.{title,description}`, rendered by `src/lib/components/seo/Seo.svelte`.

Note: `seo_data/compress_audio/` exists but has no corresponding route in `src/routes` (no `/compress-audio` page) — excluded from this audit as out of current site scope.

---

## A. Executive Summary

Current titles are inconsistent in one specific way: five of eight are already well-formed (50–60 chars, real primary+secondary keywords), but **two — `/mp4-to-mp3` and `/mov-to-mp3` — are only 32 characters**, roughly half the usable budget. Both currently read "[Format] to MP3 Converter — 100% Free," which captures the primary keyword but leaves 18–28 characters of SERP real estate empty on pages that sit on top of the single highest-volume keyword in the entire dataset (**"mp4 to mp3," 201,000/mo**). That's the highest-impact fix in this audit.

The home page title (42 chars) is also under-budget. It currently front-loads "Free" and "Online" but never uses the site's biggest secondary concept ("reduce video size," 5,400/mo), and stays 8–18 characters short of the target range.

Where titles are already 50–60 characters (`/compress-video-to-size`, `/compress-video-on-iphone`, `/video-to-mp3`, `/video-to-text`), they're doing real work — `/video-to-text` in particular already leads with the converter term and folds in "transcription," which is the correct call: **"video transcription" (27,100) and "transcribe video" (27,100) each outsell "video to text converter" (3,600) by 7–8x**, and the current title already captures that. No forced rewrite needed there.

"No Upload" and "No Sign-Up" are confirmed non-keywords: every CSV row for these phrases ("video to mp3 converter no upload," "compress video without upload," "video upscaler no sign up," etc.) shows **0 search volume**. They're pure USP messaging and current metadata already keeps them out of titles and in descriptions — that pattern should hold.

Descriptions are generally solid (most already sit in the 120–160 range) but four are under the 140–160 target and were tightened up to use the space for a secondary keyword rather than padding.

**Site-wide strategy:** each MP3-conversion page already owns a distinct keyword cluster with no overlap — generic `/video-to-mp3` targets "video to mp3 converter" (40,500) and multi-format long-tail, `/mp4-to-mp3` owns the "mp4 to mp3" family (the biggest cluster on the site), `/mov-to-mp3` owns "mov to mp3" — this architecture is correct and should be preserved exactly as-is when applying the recommendations below.

---

## B. Keyword Analysis

| Route | Primary Keyword Cluster | Secondary Clusters | Modifier Opportunities | Important Long-Tails |
|---|---|---|---|---|
| `/` (home) | video compressor (90,500) | compress video (33,100), reduce video size (5,400), video size reducer (3,600) | online (compress video online 12,100 + online video compressor 12,100 = 24,200); free (compress video free 1,300, but SEO Difficulty only 20 — easy win) | compress mp4 (9,900), mp4 compressor (12,100), video compression tool (1,900) |
| `/compress-video-to-size` | compress video to [X]MB (10MB 880, 25MB 170, 50MB 110, 100MB 90) | compress video for discord (1,300), for email (720), for whatsapp (210), for instagram (210) | free (implied, no dedicated row); no "online" evidence specific to size-target queries | compress large video file (170), compress video under 25mb (40) |
| `/compress-video-on-iphone` | compress video on iphone (3,600) — only iPhone-specific row in dataset | none in CSV (generic compress-video terms apply but belong to home/size pages) | none with volume; "no app" is product messaging, not a search term | — |
| `/video-to-mp3` (generic) | video to mp3 converter (40,500) | extract audio from video (18,100), convert video to mp3 (12,100), video to audio converter (12,100), convert video to audio (6,600), change video to mp3 (12,100) | free (video converter to mp3 free 9,900 + free video to mp3 converter 720 = 10,620); online (online video to mp3 converter 8,100) | turn video into mp3 (4,400), avi/mkv/webm to mp3 (70–590 each) |
| `/mp4-to-mp3` | mp4 to mp3 (201,000) | mp4 to mp3 converter (33,100), convert mp4 to mp3 (22,200) | free (mp4 converter to mp3 free 880) | mp4 converter to mp3 free (880) |
| `/mov-to-mp3` | mov to mp3 converter (27,100) | convert mov to mp3 (27,100, tied) | none dedicated (no "mov...free" or "mov...online" row) | — (dataset is thin for MOV; only 2 rows exist) |
| `/video-upscaler` | video upscaler (5,400) | ai video upscaler (3,600), upscale video (4,400), video quality enhancer (9,900) / enhance video quality (9,900) — higher volume than "upscaler" itself, but page function is specifically resolution upscaling (confirmed via page content), so kept as secondary framing rather than primary claim | free (free video upscaler 1,900); online (video upscaler online 480) | upscale video to 4k (880), upscale 1080p to 4k (210), upscale video to 1080p (90) |
| `/video-to-text` | video to text converter (3,600) / video to text (6,600) | video transcription (27,100), transcribe video (27,100), video transcriber (18,100), transcribe video to text (14,800) — all far outsell the literal "video to text" phrase | free (free video transcriber 5,400, transcribe video free 5,400) | video transcript generator (9,900), mp4 to text (1,300) |

---

## C. Current Metadata Audit

| Route | Current Title | Len | Action | Current Description | Len | Action |
|---|---|---:|---|---|---:|---|
| `/` | Free Video Compressor Online — SquishyFile | 42 | **MAJOR REVISION** (under 50–60 floor) | Free online video compressor for MP4, MOV, MKV, AVI and WebM — no uploads, no file-size limit, no watermark, no sign up required. | 129 | MINOR REVISION (under 140 floor) |
| `/compress-video-to-size` | Compress Video to 10MB, 25MB or 50MB — SquishyFile | 50 | **KEEP** | Shrink your video to an exact size — 10MB, 25MB or any target — for email, Discord, WhatsApp and Instagram limits. 100% free, no watermark, no sign up. | 151 | **KEEP** |
| `/compress-video-on-iphone` | Compress Video on iPhone in Safari — No App Needed | 50 | **KEEP** | Compress video on your iPhone right in Safari — no app to install. Pick a video from Photos and shrink it down for free; nothing ever leaves your phone. | 152 | **KEEP** |
| `/video-to-mp3` | Video to MP3 Converter – Extract Audio from Video | 49 | MINOR REVISION (1 char under floor) | Convert any video to MP3 free — extract audio from MP4, MOV, MKV, AVI and WebM. No file-size limit, no watermark, no sign up required. | 134 | MINOR REVISION |
| `/mp4-to-mp3` | MP4 to MP3 Converter — 100% Free | 32 | **MAJOR REVISION** | Convert MP4 to MP3 free — extract the audio track from any MP4 video. No file-size limit, no watermark, no sign up needed. | 122 | MINOR REVISION |
| `/mov-to-mp3` | MOV to MP3 Converter — 100% Free | 32 | **MAJOR REVISION** | Convert MOV to MP3 free — extract audio from iPhone and QuickTime videos. No file-size limit, no watermark, no sign up needed. | 126 | MINOR REVISION |
| `/video-upscaler` | Video Upscaler — Free AI Upscaling to 1080p & 4K | 48 | MINOR REVISION (2 chars under floor) | Free video upscaler that runs entirely in your browser — upscale 480p or 720p video to 1080p or 4K with 2x or 4x scale, no upload, no watermark, no sign up. | 156 | **KEEP** |
| `/video-to-text` | Video to Text Converter – Free Video Transcription | 50 | **KEEP** | Transcribe video to text for free, right in your browser. No uploads, no size limit, no sign-up — works with MP4, MOV, MKV, AVI, WebM and multiple languages. | 157 | **KEEP** |

---

## D. Final Recommended Metadata

| Route | Recommended SEO Title | Chars | Recommended SEO Description | Chars |
|---|---|---:|---|---:|
| `/` | Video Compressor Online – Reduce Video Size \| SquishyFile | 57 | Free online video compressor — reduce video size for MP4, MOV, MKV, AVI and WebM in your browser. No uploads, no file-size limit, no watermark, no sign-up. | 155 |
| `/compress-video-to-size` | Compress Video to 10MB, 25MB or 50MB — SquishyFile *(unchanged)* | 50 | Shrink your video to an exact size — 10MB, 25MB or any target — for email, Discord, WhatsApp and Instagram limits. 100% free, no watermark, no sign up. *(unchanged)* | 151 |
| `/compress-video-on-iphone` | Compress Video on iPhone in Safari — No App Needed *(unchanged)* | 50 | Compress video on your iPhone right in Safari — no app to install. Pick a video from Photos and shrink it down for free; nothing ever leaves your phone. *(unchanged)* | 152 |
| `/video-to-mp3` | Free Video to MP3 Converter – Extract Audio from Video | 54 | Convert any video to MP3 online, free — extract audio from MP4, MOV, MKV, AVI and WebM. No file-size limit, no watermark, no sign-up required. | 142 |
| `/mp4-to-mp3` | MP4 to MP3 Converter – Extract Audio Free \| SquishyFile | 55 | Convert MP4 to MP3 free — extract high-quality audio from any MP4 video, right in your browser. No file-size limit, no watermark, no sign-up needed. | 148 |
| `/mov-to-mp3` | MOV to MP3 Converter – Extract Audio from MOV \| SquishyFile | 59 | Convert MOV to MP3 free — extract audio from iPhone and QuickTime MOV videos, right in your browser. No file-size limit, no watermark, no sign-up needed. | 153 |
| `/video-upscaler` | Video Upscaler Online – Free AI Upscaling to 1080p & 4K | 55 | Free video upscaler that runs entirely in your browser — upscale 480p or 720p video to 1080p or 4K with 2x or 4x scale, no upload, no watermark, no sign up. *(unchanged)* | 156 |
| `/video-to-text` | Video to Text Converter – Free Video Transcription *(unchanged)* | 50 | Transcribe video to text for free, right in your browser. No uploads, no size limit, no sign-up — works with MP4, MOV, MKV, AVI, WebM and multiple languages. *(unchanged)* | 157 |

---

## E. Title-by-Title Reasoning

**`/` (home)** — Old title spent 42 of a possible 60 characters on "Free" + "Online" + brand, leaving the site's second-biggest concept ("reduce video size," 5,400/mo, a genuinely different query shape from "compressor") completely untargeted. New title keeps "Online" (backed by a combined 24,200/mo across "compress video online" + "online video compressor" — nearly 20x the volume of "free"-specific queries) and replaces the vaguer brand-only ending with "Reduce Video Size" before the brand, adding real keyword surface without repeating "compress"/"compressor" a third time. "Free" was dropped from the title (it moved into the description, which already led with it) — its dedicated keyword ("compress video free," 1,300/mo) is real but an order of magnitude smaller than the online cluster, so it lost the space contest fairly rather than being banned on principle.

**`/mp4-to-mp3`** — The single biggest change in this audit. "100% Free" is marketing filler with no matching keyword row of real size (the only free-specific row, "mp4 converter to mp3 free," is 880/mo — over 200x smaller than "mp4 to mp3" itself). It was replaced with "Extract Audio Free," which does two things: adds the "extract audio" concept (backed by the shared "extract audio from video," 18,100/mo, which legitimately applies to MP4 as the dominant input format) while still keeping "Free" for the modest-but-real free-intent searchers, then closes with the brand — all inside the 50–60 window instead of stopping at 32.

**`/mov-to-mp3`** — Same underlying problem as MP4, but the CSV is thinner here: only two rows exist for MOV ("convert mov to mp3" and "mov to mp3 converter," tied at 27,100 each), and no MOV-specific free/online modifier exists. Repeating "MOV to MP3" twice just to fill space would be keyword stuffing of literally the same phrase, so instead the title borrows the same "extract audio" secondary concept used for MP4 (same underlying "extract audio from video" keyword, 18,100/mo, equally applicable since MOV is also a video container) and closes with the brand — reaching 59 characters without restating the primary keyword.

**`/video-to-mp3`** — Already well-constructed (primary "video to mp3 converter" + secondary "extract audio from video," both exact top-volume matches); it was only 1 character under the floor. Rather than pad it, "Free" was added at the front, justified by real data: "video converter to mp3 free" alone is 9,900/mo — nearly as large as "convert video to mp3" (12,100) — so this isn't a filler word, it's the third-largest keyword concept available for this page.

**`/video-upscaler`** — 2 characters under the floor. The higher-volume "enhance/enhancer" terms (9,900/mo each) were deliberately *not* substituted in as the primary claim, because the page content describes a resolution-upscaling tool (AI model or FSR shader picked by source resolution) rather than a general quality/denoise enhancer — using "enhancer" as the lead term would overclaim relative to what the tool does. Instead, "Online" was added (justified by "video upscaler online," 480/mo + "upscale video online," 390/mo — a real, if modest, cluster) to close the gap while keeping the accurate "upscaler" framing and the resolution-specific "1080p & 4K" phrase that already matches several CSV rows directly.

**`/compress-video-to-size`, `/compress-video-on-iphone`, `/video-to-text`** — No changes. Each already sits inside 50–60 characters and already uses the strongest available keyword data (exact size numbers ranked by volume for the size page; the single available iPhone-specific keyword for the iPhone page; both "converter" and "transcription" phrasing for video-to-text, correctly weighted toward the higher-volume transcription terms). Rewriting these to be "different" would violate the instruction to keep strong titles as-is.

---

## F. Description-by-Description Reasoning

**`/` (home):** Added "reduce video size" (mirrors the new title's secondary keyword) and reworded "no file-size limit" placement so the sentence reads as one continuous benefit list; kept every existing USP (no uploads, no watermark, no sign-up) and the full format list, which is real product accuracy, not keyword stuffing. 129 → 155 chars.

**`/video-to-mp3`:** Inserted "online" (backed by "online video to mp3 converter," 8,100/mo) alongside the existing "free," since both are genuinely supported by data for this page and the description has room for both where the title only had room for one. 134 → 142 chars.

**`/mp4-to-mp3`:** Extended "extract the audio track" to "extract high-quality audio," which reads more naturally and uses the extra character budget for a real product benefit (the tool does preserve source audio quality) rather than a repeated keyword. 122 → 148 chars.

**`/mov-to-mp3`:** Kept the iPhone/QuickTime framing from the original (accurate product context — MOV files are predominantly produced by iPhone/QuickTime — not a keyword claim, since no CSV row supports "mov iphone" specifically) and extended it to reach the target range. 126 → 153 chars.

**Unchanged descriptions** (`/compress-video-to-size`, `/compress-video-on-iphone`, `/video-upscaler`, `/video-to-text`): All four already sit at 151–157 characters with accurate, non-generic, keyword-relevant copy — no rewrite needed.

---

## G. Keyword Cannibalization

No conflicts found; the current site architecture already separates keyword ownership cleanly:

- **`/video-to-mp3`** owns the generic, format-agnostic cluster: "video to mp3 converter" (40,500), "convert video to mp3" (12,100), "extract audio from video" (18,100), plus long-tail for AVI/MKV/WebM/WMV/FLV (each under 600/mo) that don't justify their own pages.
- **`/mp4-to-mp3`** owns the MP4-specific cluster: "mp4 to mp3" (201,000), "mp4 to mp3 converter" (33,100), "convert mp4 to mp3" (22,200). This cluster must never be targeted by `/video-to-mp3` or the home page — it currently isn't.
- **`/mov-to-mp3`** owns "convert mov to mp3" / "mov to mp3 converter" (27,100 each). Same isolation applies.
- **`/` (home)** owns the generic multi-format compressor intent: "video compressor" (90,500), "compress video" (33,100), "compress mp4" (9,900 — home explicitly lists MP4 support, so this doesn't need its own page).
- **`/compress-video-to-size`** owns numeric-target intent ("compress video to 10mb," etc.) and platform-limit intent (Discord/email/WhatsApp/Instagram) — distinct user intent from the generic compressor query, correctly split out.
- **`/compress-video-on-iphone`** owns the single iPhone-specific query and doesn't compete with the size-target page even though both involve "compress video."
- **`/video-upscaler`** and **`/video-to-text`** are standalone clusters with no overlap anywhere else on the site.

The one thing to watch going forward: if a `/compress-audio` page is ever built from the unused `seo_data/compress_audio/` CSVs, its title should not reuse "compress video" language from the home page — that CSV's top terms ("audio compressor" 5,400, "compress audio file" 1,600) are a fully separate cluster.

---

## H. Modifier Analysis

| Modifier | Relevant Tool(s) | Keyword Evidence | Title? | Description? | Reason |
|---|---|---|---|---|---|
| **Free** | `/video-to-mp3` (9,900 + 720), `/mp4-to-mp3` (880), `/` (1,300, but SEO Difficulty only 20 — an easy-win long-tail) | Present with real, page-specific volume on 3 of 8 pages; near-zero or absent elsewhere (no MOV-specific or iPhone-specific "free" row) | Yes, on `/video-to-mp3` and `/mp4-to-mp3` where volume justifies it; moved to description-only on `/`, `/mov-to-mp3`, `/video-upscaler` where a bigger keyword or the primary phrase itself needed the space | Yes, on every page (universal, accurate USP even where it doesn't win title space) | Data-driven, not default — two pages earned it in-title, the rest carry it in the description where it still supports CTR |
| **Online** | `/` (12,100 + 12,100 = 24,200 combined), `/video-to-mp3` (8,100), `/video-upscaler` (480 + 390) | Largest modifier cluster on the site for `/` specifically | Yes, on `/` and `/video-upscaler`; description-only on `/video-to-mp3` (title space went to "Free," the larger of the two available modifiers there) | Yes, where relevant | Strongest data-backed modifier on the site — kept in titles where it's the highest-value use of remaining space |
| **No Upload** | All tool pages (generic USP) | Every matching row ("video to mp3 converter no upload," "compress video without upload," "video upscaler no upload," "video transcription no upload") shows **0 search volume** across every CSV | No | Yes, on all pages that already state it | Zero measured demand — confirmed pure product messaging, correctly excluded from every title already |
| **No Sign-Up** | All tool pages (generic USP) | Matching rows ("video compressor no sign up," "video transcriber no sign up") also show **0 search volume** | No | Yes, on all pages that already state it | Same conclusion as "No Upload" — no title deserves this space over an actual keyword |

---

*Report generated from `seo_data/*_us.csv` (cross-checked against UK/AU/CA/NZ) and the live `en.json` metadata as of this audit. No files outside SEO title/description were read for keyword-relevance purposes only (page `.md` content, tool components) and none were modified.*
