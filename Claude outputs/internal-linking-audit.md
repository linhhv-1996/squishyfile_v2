# SquishyFile — Internal Linking Audit (contents/seo)

## Phase 1: Topical map

**Cluster A — Compression** (reduce file size, keep it playable)
- `/` (home) — broad video compressor: MP4/MOV/MKV/AVI/WebM in, MP4 out. Intent: "compress video online free"
- `/compress-video-to-size` — hit an exact MB target (10MB/25MB/etc). Sub-intent of A, next-step from home for platform-limit users.
- `/compress-video-on-iphone` — same compression job, device-specific workflow (Safari, Photos app). Sub-intent of A, next-step from home for mobile users.

**Cluster B — Video → MP3** (extract audio, discard picture)
- `/video-to-mp3` — hub: any format, with MKV/AVI/WebM handled directly on-page
- `/mp4-to-mp3` — format-specific instance of B
- `/mov-to-mp3` — format-specific instance of B (iPhone-origin files)

**Cluster C — Upscaling** (opposite operation: increase resolution/size)
- `/video-upscaler` — bridges to A (upscale-then-compress workflow) and weakly to B ("just want the audio" escape hatch)

Cross-cluster relationship worth noting: upscaling and compression are explicitly framed in the upscaler content itself as sequential, one-directional steps (upscale first, then compress if the result got too big) — not a back-and-forth.

## Phase 2/3: Link candidates evaluated

I went through every page's content looking for Tier 1 (same/next-step intent) and Tier 2 (workflow) candidates, then checked what already exists against that list. Result: **every high-confidence link I identified is already implemented**, and I found no Tier 3 (weak) links to remove.

| Source | Destination | Anchor | Relationship | Status |
|---|---|---|---|---|
| home | compress-video-to-size | "compress video to a specific size" | Same intent, exact-size sub-case | ✅ present |
| home | compress-video-on-iphone | "compress video on iPhone" / "iPhone guide" | User next step (device) | ✅ present |
| home | video-to-mp3 | "video to MP3 converter" | User next step (only wants audio) | ✅ present |
| compress-video-to-size | home | "main video compressor" | Back to broad tool | ✅ present |
| compress-video-to-size | compress-video-on-iphone | "compress video on iPhone" | Device-specific variant | ✅ present |
| compress-video-to-size | video-to-mp3 | "video to MP3 converter" | Next step (audio-only escape hatch) | ✅ present |
| compress-video-on-iphone | compress-video-to-size | "compress video to a specific size" | Same intent, exact-size sub-case | ✅ present |
| compress-video-on-iphone | mov-to-mp3 | "MOV to MP3 converter" | Next step (audio-only, same format) | ✅ present |
| video-to-mp3 | mp4-to-mp3 | "MP4 to MP3" | Format-specific instance | ✅ present |
| video-to-mp3 | mov-to-mp3 | "MOV to MP3" | Format-specific instance | ✅ present |
| video-to-mp3 | home | "main video compressor" | Reverse next step | ✅ present |
| mp4-to-mp3 | mov-to-mp3 | "MOV file" / "MOV to MP3 converter" | Format-specific sibling | ✅ present |
| mp4-to-mp3 | video-to-mp3 | "video to MP3 converter" | Back to hub (other formats) | ✅ present |
| mov-to-mp3 | mp4-to-mp3 | "MP4 to MP3 converter" | Format-specific sibling | ✅ present |
| mov-to-mp3 | compress-video-on-iphone | "compress video on iPhone" | Next step (wants video, not audio) | ✅ present |
| mov-to-mp3 | home | "main video compressor" | Reverse next step | ✅ present |
| video-upscaler | home | "video compressor" | Workflow next step (upscale → compress) | ✅ present |
| video-upscaler | compress-video-to-size | "compress video to an exact size" | Workflow next step | ✅ present |
| video-upscaler | video-to-mp3 | "video to MP3 converter" | Weak but justified escape hatch (explicit "only need the audio" framing) | ✅ present |

Candidates I considered and **rejected**:
- `home → video-upscaler`: no natural context. Home's content never discusses resolution/upscaling, and adding a sentence just to create the link would violate "don't modify a paragraph to force a link." No genuine next-step signal exists for a user landing on the general compressor to want upscaling.
- `video-to-mp3 → compress-video-to-size`: home already covers "need to shrink instead" for video-to-mp3 readers, and home in turn routes to the exact-size page. A second, more specific link here would push the page to 4 tool links, past what the content naturally supports, for a redundant destination.
- `mov-to-mp3` / `mp4-to-mp3` → `video-upscaler`: no workflow connection between extracting audio and upscaling resolution — audio has no resolution.
- Any link to `/video-upscaler` from Cluster B beyond the one already on `video-to-mp3`: upscaling and audio-extraction don't share intent or workflow.

## Phase 4: Implementation

**No file changes were made.** The existing internal linking in `contents/seo` already matches a conservative, intent-driven Tier 1/Tier 2 structure: every link connects same-intent or clear-next-step pages, anchor text is descriptive and varied (not generic, not keyword-stuffed), and there are no cross-cluster "everything links to everything" patterns. The site currently only covers video tools (compression, audio extraction, upscaling), so there's no PDF/image/unrelated-category content to accidentally cross-link — the weak-relationship problem the brief warns about doesn't arise here yet.

One minor, non-blocking observation: `home.en.md` and `mp4-to-mp3.en.md` each link to the same destination twice (`/compress-video-on-iphone` and `/mov-to-mp3` respectively) from two different FAQ answers. This isn't link-stuffing — each occurrence answers a different question naturally — but it's worth knowing if a stricter "one link per destination per page" rule is ever wanted.

If a new tool page is added later (e.g. a PDF or image tool), re-run this audit rather than assuming the new page needs links to the existing video cluster — per Rule 4, unrelated categories should generally get zero cross-links unless a specific paragraph gives real contextual justification.
