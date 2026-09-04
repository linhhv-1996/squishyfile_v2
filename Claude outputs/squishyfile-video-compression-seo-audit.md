# SquishyFile — Video Compression SEO Audit
*Compress video, video compressor & compress-video-on-iphone keyword sets · US/UK/CA/AUS/NZ Ubersuggest data · September 2026*

## How to read this

Site has exactly **3 tool pages sharing 1 tool component**, plus 3 blog posts. All 50 rows in every regional CSV are the *same* keyword list — only volumes differ. Combined volume (sum of all 5 regions) is used below as a rough global-demand proxy; it is not a literal "global search volume," just a way to rank importance across a fragmented regional dataset. Full combined table for reference:

| Combined vol | Keyword | Combined vol | Keyword |
|---|---|---|---|
| 142,600 | video compressor | 670 | compress video without losing quality |
| 59,420 | compress video | 620 | lossless video compression |
| 20,820 | mp4 compressor | 410 | compress video for whatsapp |
| 18,920 | compress mp4 | 380 | compress video without quality loss |
| 18,020 | compress video online | 340 | compress video for instagram |
| 18,020 | online video compressor | 310 | compress video to 25mb |
| 11,710 | reduce video size | 270 | compress large video file |
| 6,050 | video size reducer | 170 | compress video to 50mb |
| 5,320 | compress video on iphone | 160 | compress video to 100mb |
| 4,480 | reduce mp4 file size | 80 | compress video under 25mb |
| 3,160 | mov compressor | 80 | high quality video compressor |
| 2,580 | compress video free | 70 (×3) | compress avi/mkv/webm video |
| 2,170 | video compression tool | 70 | compress video for twitter |
| 2,130 | compress mov file | 50 (×3) | no-watermark / for-youtube / batch |
| 1,760 | compress video for discord | 40 (×3) | in-browser / handbrake-alt / for-tiktok |
| 1,650 | shrink video size | 20 (×2) | no-sign-up / browser video compressor |
| 1,310 | compress video to 10mb | 0 (×7) | 2026/clideo/vs-handbrake/privacy-safe/etc. |
| 1,220 | compress video for email | | |
| 930 | compress mp4 online | | |

The near-zero rows (best video compressor 2026, video compressor vs handbrake, compress video privacy safe, etc.) are real search phrasings but effectively no-volume in Ubersuggest — they're evidence of *intent themes* (trust, no-install, comparison-shopping), not pages or sections to build around.

---

# GROUP A — Home (`/`)

## 1. Architecture & Intent

- **Existing page:** `/` — shares `CompressVideo` tool, hero + SEO content is the generic/head-term version.
- **Primary intent:** "I have a video file, I want it smaller" — no specific size target, no specific platform, no specific device. The broadest, least-qualified version of the task.
- **Why this page exists:** it has to absorb the two dominant head terms (*video compressor* 142.6k, *compress video* 59.4k combined) plus every format variant (mp4/mov/avi/mkv/webm) and every quality-language variant (lossless, without losing quality). Splitting those off would fragment the site's biggest traffic opportunity across pages that don't deserve their own URL.
- **Primary keyword cluster:** video compressor, compress video, compress video online, online video compressor, compress mp4, mp4 compressor, reduce video size, video size reducer, video compression tool.
- **Supporting keyword clusters:**
  - *Format:* compress mov file, mov compressor, compress avi video, compress mkv file, compress webm video, reduce mp4 file size.
  - *Quality/CRF:* compress video without losing quality, compress video without quality loss, lossless video compression, high quality video compressor, best video compressor no quality loss.
  - *Trust/no-install:* browser video compressor, compress video in browser, compress video without upload, compress video without software, compress video privacy safe, video compressor no sign up, compress video online free no watermark.
  - *Competitive/comparison:* free alternative to handbrake, handbrake alternative online, video compressor vs handbrake, video compressor like clideo, best video compressor 2026.
- **Important user questions:** What formats does it accept? Does compressing hurt quality? Is my file uploaded anywhere? Do I need an account? How is this different from Handbrake/Clideo? Is there a size or usage limit?
- **Keywords/topics belonging to other groups:** anything with an exact MB number (10/25/50/100mb, under-25mb) → Group B. Anything mentioning a destination platform (Discord/email/WhatsApp/Instagram/Twitter/YouTube/TikTok) → Group B. "compress video on iphone" and its device-specific siblings → Group C.

## 2. Keyword Mapping

| Cluster | Belongs to | Why |
|---|---|---|
| video compressor, compress video, compress video online, online video compressor | **Home** | Undifferentiated head terms — no size/platform/device qualifier |
| compress mp4, mp4 compressor, compress mov file, mov compressor, compress avi/mkv/webm | **Home** | Format is the differentiator, not size or platform |
| reduce video size, video size reducer, shrink video size, reduce mp4 file size | **Home** | "Size" here means "make it smaller," not "hit an exact number" — same intent as the head term, different phrasing |
| compress video without losing quality / quality loss, lossless video compression, high quality video compressor | **Home** | Quality trade-off is about the compression level control, which lives on this page |
| compress video to 10/25/50/100mb, compress video under 25mb | **Group B** | Exact-number intent — this is literally what the to-size page's tool mode does |
| compress video for discord/email/whatsapp/instagram/twitter/youtube/tiktok | **Group B** | Platform-limit intent |
| compress large video file | **Home (primary)**, referenced but not targeted on Group B | See cannibalization note below — currently duplicated on both pages |
| batch compress video | **Group B** | Only makes sense in the context of "same target size, multiple files" — that's literally what the to-size page's batch section describes; there's no natural "batch" workflow on the generic level-based page |
| compress video on iphone | **Group C** | Device-specific — dominant single keyword for that page |
| free alternative to handbrake, handbrake alternative online, video compressor vs handbrake, video compressor like clideo | **Home** | Zero-to-low volume; already adequately covered by the existing "Handbrake alternative" + comparison-grid sections — not worth a dedicated blog at this volume |
| video compressor no sign up, compress video without upload/software, compress video privacy safe, compress video online free no watermark, browser video compressor, compress video in browser | **Home** | Trust/positioning language, covered by the FAQ + intro paragraph, not standalone sections |

## 3. Cannibalization Audit

- **Home vs. Group B — "compress large video file" (270 combined):** currently bolded as an exact-match phrase on *both* pages — home ties it to the Max-squish/CRF section, to-size ties it to "large recordings... where quality settings are hard to judge." Both framings are defensible, but running the identical bolded phrase on two indexable pages is the kind of self-overlap Google can flatten into "pick one." **Verdict: problematic, low cost to fix.** Recommendation: home keeps it (matches "I just want it smaller, don't care about a number" — the page's actual intent), to-size drops the bolded exact phrase and keeps only the natural, unbolded mention of large recordings/screen captures it already has in context. Patch below.
- **Home vs. Group C — mobile/iPhone:** home's FAQ answers "Does it work on mobile?" and links out to the iPhone page rather than trying to rank for iPhone-specific terms itself. **Acceptable** — this is the correct pattern (a mention + internal link, not a competing section).
- **Home vs. Blog:** none of the 3 existing blog posts (re-compression quality loss, MOV vs MP4, "won't send" troubleshooting) restate home's primary intent; they're genuinely adjacent/educational. **Acceptable.**
- **Internal duplication risk between "reduce video size" and "compress video to size":** worth double-checking mentally — "reduce video size" (11.7k) reads as *general* size reduction, "compress video to size" (the whole Group B page name) reads as *hit an exact number*. Different enough. **Acceptable, no action.**

## 4. Existing Content Audit

**What's good:** clear WASM/no-upload positioning up top (matches the site's core USP), a legitimate 3-column CRF explainer table (rare for this niche — most competitors just say "high/medium/low" with no explanation of the actual trade-off), an honest Handbrake comparison that doesn't oversell the tool ("keep both around"), a real comparison grid against desktop apps / upload-based tools / phone built-ins, internal links to both sibling pages, FAQ directly answers the trust questions (upload? sign-up? formats? limits?).

**What's missing:**
- No mention of the two formats with real volume that get zero individual sentence coverage: **AVI and WebM** are named once each in a list but never get their own reasoning (why would someone specifically search "compress avi video" instead of just "compress video"? Usually: an old camcorder/downloaded file they can't open elsewhere). Minor — 70 combined each, not worth a dedicated section, but one more concrete sentence would help.
- No answer to "will re-compressing the same file over and over destroy it," even though the site already has a full blog post on exactly that (`how-many-times-can-you-compress-a-video`) — home's FAQ doesn't link to it. Easy internal-linking win: the existing "if a compressed file still looks soft, try re-running it from the original" paragraph is the natural anchor point.
- "video compression tool" (2,170 combined, a real supporting term) isn't semantically distinct from "video compressor" anywhere in the copy — not a problem (it's naturally covered by the page just being about a compression tool), but flagging since it's the 4th-largest cluster on this page's map.

**What should be removed/changed:** the bolded **compress large video file** duplicate — see cannibalization fix above.

**What sounds generic:** nothing flagged — the copy already avoids the standard AI-slop phrases (no "in today's digital age," no "let's dive in," no symmetrical H2 padding).

**Intent match:** correct. No section targets a size number or a platform limit or a device.

## 5. Recommended Information Architecture

No structural change needed — the existing outline already matches intent:
- H1 — Free Video Compressor (head term)
- H2 Why compress video with SquishyFile? — trust/no-upload positioning
- H2 Compress a video in 3 steps — how-it-works
- H2 Compress MP4, MOV, MKV, AVI and WebM in one tool — format coverage
- H2 Reduce video size without losing quality — CRF/quality-level explainer + table
- H2 A free, browser-based alternative to Handbrake — competitive positioning
- H2 Other ways people compress video today — comparison grid
- H2 Need something more specific? — internal links to Groups B/C
- H2 FAQ

## 6. Content Patch (apply, don't rewrite)

The page already clears the bar on intent match, differentiation, and writing quality — a full rewrite would be change for its own sake. Two small patches:

**(a)** In the FAQ, extend the existing quality-loss answer with a link to the re-compression blog post:
> Will compressing my video reduce its quality? — A little, like any compression, but the "Light" setting is built to keep the difference hard to notice. Use the slider to trade size for quality however suits the video. **Compressing the same file repeatedly does compound the loss — see [how many times you can re-compress a video](/blog/how-many-times-can-you-compress-a-video) before it becomes visible.**

**(b)** No copy change needed beyond (a) and the Group B de-dup fix in section 6 of Group B below.

## 7. Excluded Topics

- Exact MB targets (10/25/50/100mb) and all platform-name mentions (Discord/email/WhatsApp/etc.) → Group B, never home.
- "compress video on iphone" and iPhone-specific workflow → Group C.
- Handbrake/Clideo comparison terms stay as brief mentions, not expanded sections — combined volume across all of them is under 50, doesn't justify more copy than already exists.

## 8. Blog Opportunities (ranked)

1. Already shipped and correctly scoped, no action needed: re-compression quality loss, MOV vs MP4, "video won't send" troubleshooting.
2. **New — "Why is my screen recording so much bigger than it looks" (screen-capture-specific compression advice: frame rate vs. text sharpness trade-offs, when Max-squish blurs UI text unacceptably).** Strongest remaining gap: "compress large video file" and "video compression tool" both surface screen recordings as a use case, but nothing on the site addresses the specific problem (text/UI clarity degrading faster than natural video at the same CRF). Differentiated from the tool page because it's advice, not a tool-usage guide; low cannibalization risk.
3. **Discord upload-limit tracking post** — the to-size page content itself notes "Discord doubled its free limit in 2026," which is exactly the kind of thing people re-search every time a platform changes its rules. A short, dated "Discord video upload limit (updated Sept 2026)" post targets long-tail "discord video size limit" searches that aren't in this CSV but are adjacent and refreshable evergreen content. Update-and-republish this one whenever a platform changes limits rather than editing the to-size page's table copy each time.
4. Lower priority — no CSV volume evidence, judgment call only: a Handbrake/Clideo deep comparison. Current near-zero volume for "vs handbrake" phrasing doesn't justify it yet; revisit if a future keyword pull shows movement.

---

# GROUP B — Compress Video to a Specific Size (`/compress-video-to-size`)

## 1. Architecture & Intent

- **Primary intent:** "I need this video under a specific, known number" — either an exact MB the user picked themselves, or a limit imposed by a platform they're about to upload to.
- **Why this group/page exists:** exact-size search intent is fundamentally transactional and numeric in a way the head terms aren't — someone typing "compress video to 25mb" already knows their constraint and wants a tool that takes a number, not a quality slider. Splitting this from home lets the page open with a target-size field explanation instead of a CRF explainer, and lets the platform-limit table exist without cluttering the generic page.
- **Primary keyword cluster:** compress video to 10mb/25mb/50mb/100mb, compress video under 25mb.
- **Supporting keyword clusters:** compress video for discord/email/whatsapp/instagram/twitter/youtube/tiktok, compress large video file, batch compress video.
- **Important user questions:** Will it actually land under my limit? What if the target is too small for decent quality? What's the current limit for [platform]? Can I do a whole batch to the same size?
- **Keywords/topics belonging to other groups:** everything without a number or a platform name belongs to home; anything iPhone-specific belongs to Group C even if it also mentions a size (the iPhone page's own FAQ already cross-links here for exactly that case, which is correct).

## 2. Keyword Mapping

Same table as Group A's mapping, mirrored — see above. The one item worth restating: **"compress large video file" is mapped primarily to Home**, not to this page, despite currently living (bolded) on both.

## 3. Cannibalization Audit

Same finding as Group A section 3: the shared bolded phrase is the only real issue. Everything else — the platform-limit table, the batch-compression section, the bitrate-math explainer — is intent that literally cannot happen on the home page (no target-size field there), so there's no meaningful overlap risk beyond that one phrase.

## 4. Existing Content Audit

**What's good:** the platform-limit table is genuinely useful and current (calls out the 2026 Discord limit change by name, distinguishes WhatsApp-as-video vs. WhatsApp-as-document, correctly notes Instagram/YouTube/TikTok re-encode on upload so target size matters less there) — this is exactly the kind of specific, dated detail that separates a real resource from a thin SEO page. The bitrate-math section teaches the underlying "why" instead of just asserting the tool is smart, which supports E-E-A-T without saying so. Batch-compression section correctly scopes itself to "same target size across a folder" rather than overclaiming true batch/queue processing the tool doesn't have.

**What's missing:**
- The FAQ doesn't answer the single most obvious anxiety for this intent: **"what happens if I need it EVEN smaller and there's basically no bitrate left"** — there's a hint in "What if my target size is too small for decent quality?" but it doesn't say what actually happens (audio gets prioritized, resolution drops hard, it may look like a slideshow) — a more concrete answer would out-perform vague competitor copy here.
- No explicit mention of **aspect ratio / portrait video** in the platform table, even though a lot of the traffic for "compress video for whatsapp/instagram" is phone-shot portrait video being sent to phone-native apps — a one-line note that the target-size math works identically regardless of orientation would preempt a real point of confusion (people worry portrait video "counts differently").

**What should be removed/changed:** the bolded "compress large video file" phrase — de-bold and reword this instance so the page stops competing with home for that exact phrase, while keeping the (legitimate, unbolded) mention of screen captures and phone videos as examples of when target-size mode helps.

**What sounds generic:** nothing flagged.

**Intent match:** correct — nothing here reads as a generic quality-slider explainer; it opens on the size-field logic within the first paragraph.

## 5. Recommended Information Architecture

Existing outline is correctly differentiated from home's (no CRF table here, no format-by-format breakdown) — keep as is:
- H1 — Compress Video to a Specific File Size — 10MB, 25MB, 50MB & More
- H2 Why hit an exact file size? — problem framing
- H2 How to compress video to 10MB, 25MB or any target size — how-it-works
- H2 Common size limits by platform — the table (this page's real differentiator)
- H2 Batch compress multiple videos to the same size
- H2 Other ways to hit an exact file size — comparison grid (manual math, two-pass encoding)
- H2 FAQ

## 6. Content Patch

**(a) Cannibalization fix** — in the opening paragraph, change:
> It's especially useful for large recordings — screen captures, phone videos, or any other **compress large video file** situation — where "quality" settings are hard to judge but a hard size limit isn't.

to:
> It's especially useful for large recordings — screen captures, phone videos, or any long clip that's ballooned past a platform's limit — where "quality" settings are hard to judge but a hard size limit isn't.

(same meaning, drops the exact-match bold so home is the sole page targeting that phrase)

**(b)** Extend the "too small for decent quality" FAQ answer with the concrete failure mode:
> What if my target size is too small for decent quality? — Very aggressive targets — trying to compress video under 25mb for a long, high-motion clip, for example — can visibly reduce quality: SquishyFile keeps audio intelligible first, so an extreme target shows up as blurring, blockiness or a lower frame rate before the sound suffers. If the result looks too compressed, try a slightly higher target size.

**(c)** One-line addition to the platform table's intro sentence acknowledging orientation doesn't change the math (optional, small): *"Target size works the same whether the source is landscape or portrait — the number you enter is the number you get, regardless of how the video is oriented."*

## 7. Excluded Topics

- CRF/quality-level language (light/balanced/max squish) stays on home — this page's tool mode is the target-size field, not the slider, and shouldn't re-explain the slider.
- Format-specific terms (MOV/AVI/MKV/WebM) stay on home.

## 8. Blog Opportunities

Covered under Group A's list (Discord-limit tracking post and screen-recording post both relate more to this page's traffic than home's, but they're written up once above to avoid duplicating the same recommendation twice).

---

# GROUP C — Compress Video on iPhone (`/compress-video-on-iphone`)

## 1. Architecture & Intent

- **Primary intent:** single dominant device-specific keyword (compress video on iphone, 5,320 combined) with almost no sibling-keyword volume in the CSV — this group exists because the *workflow* is genuinely different (Safari, Photos app, HEVC source format, storage anxiety) even though the underlying tool usage is identical to home.
- **Why this group/page exists:** someone searching "compress video on iphone" is often not thinking in terms of "compressor" at all — they're thinking "my phone is full" or "this video won't send." The page needs to open with the iPhone-specific *cause* (HEVC/4K/Cinematic bloat) before it ever explains the tool, which home and Group B have no reason to do.
- **Primary keyword cluster:** compress video on iphone (effectively the whole cluster — thin sibling coverage).
- **Supporting topics (not from CSV, but real adjacent intent):** iPhone storage anxiety, HEVC/H.264 setting, Cinematic/ProRes file bloat, Photos app workflow, Shortcuts app's built-in compress action, Mail's size options.
- **Important user questions:** Do I need to install an app? Is my video uploaded anywhere? Does it work with HEVC/ProRes? Will it drain my battery? Does compressing strip location/date metadata?

## 2. Keyword Mapping

Everything in the CSV that mentions "iphone" maps here; there is no meaningful secondary cluster in the dataset to map — this page is intentionally kept thin-on-paper and thick-on-substance instead, leaning on genuine iPhone-specific knowledge rather than more keywords.

## 3. Cannibalization Audit

None found. This page doesn't compete with home for "video compressor" (it never tries to rank as the site's primary compressor page — it's clearly framed as a companion/how-to), and it doesn't compete with Group B for size limits (its own FAQ correctly defers to Group B for exact-size needs: "Need to hit an exact file size instead? ... see our compress video to a specific size page").

## 4. Existing Content Audit

**What's good:** this is the strongest page on the site for genuine subject knowledge — the resolution/frame-rate-to-file-size table, the specific Settings > Camera > Formats / Record Video guidance, the ProRes/Cinematic callout, the Photos > Albums > Utilities > Duplicates tip. None of this reads like it was written by someone who doesn't use an iPhone; it's the opposite of AI-slop.

**What's missing:**
- No mention of **iCloud Photos / "Optimize iPhone Storage"** — a huge share of "why is my storage full" anxiety for iPhone users traces back to whether iCloud is set to keep originals on-device or not, and it's directly adjacent to the "duplicates" tip already there. Worth one sentence since it's a genuinely common point of confusion (people think compressing videos will fix a full phone when the real issue is their iCloud storage tier).
- No answer for the person who has **hundreds of Live Photos**, not videos — a very common adjacent case for "why is my phone full," though it's arguably out of scope since Live Photos aren't quite "video" in the searcher's mind. Judgment call: **leave out** — it would drag the page away from its actual keyword (compress video) into general storage-management territory that's better served by a future dedicated blog, not a scope-creep addition to this page.

**What should be removed/changed:** nothing.

**What sounds generic:** nothing flagged.

**Intent match:** correct and, notably, the best-differentiated page on the site — no other page could plausibly have this content.

## 5. Recommended Information Architecture

Existing outline is already the most bespoke on the site (deliberately not templated the same as the other two, per the "don't use an identical template for every page" rule) — keep as is:
- H1 — Compress Video on iPhone — Shrink Videos Right in Safari
- H2 Why iPhone videos take up so much space — HEVC/4K/Cinematic framing
- H2 How to compress a video on iPhone — how-it-works (Safari/Photos-specific steps)
- H2 About how big is a minute of iPhone video? — resolution/size table
- H2 Other ways to shrink a video on iPhone — Mail/Shortcuts/App Store comparison
- H2 Tips to keep iPhone videos small from the start — settings guidance
- H2 FAQ

## 6. Content Patch

One optional addition to the "Tips to keep iPhone videos small" section, appended after the existing duplicates-tip paragraph:
> If storage still feels tight after that, it's worth checking **Settings > [your name] > iCloud > Photos** — "Optimize iPhone Storage" keeps space-saving versions on your device and the full originals in iCloud, while "Download and Keep Originals" keeps every full-size file on your phone permanently. A lot of "my phone is full" moments trace back to this setting rather than to any individual video.

## 7. Excluded Topics

- Exact MB targets and platform limits → the page already correctly defers to Group B rather than duplicating the table.
- General iOS storage management (Live Photos, app storage, photo library size) → out of scope for this page entirely; a candidate for its own blog post someday, not a tool-page addition.

## 8. Blog Opportunities

- **ProRes/Cinematic mode deep-dive** ("Why ProRes and Cinematic mode make your iPhone videos so much bigger, and when they're actually worth it") — natural expansion of a topic this page already introduces in one paragraph; genuinely differentiated as an educational/decision-making piece rather than a how-to-compress piece.
- Everything else iPhone-related is already either on the page itself or out of scope per section 7 above.

---

## Summary of concrete changes to apply

1. **Fix cannibalization:** de-bold/reword "compress large video file" on `/compress-video-to-size` (Group B patch a) so home is the sole page targeting that exact phrase.
2. **Home:** link the quality-loss FAQ answer to the existing re-compression blog post (Group A patch a).
3. **Group B:** make the "target too small" FAQ answer concrete about what actually degrades first (Group B patch b); optional one-liner on orientation (Group B patch c).
4. **Group C:** optional one-liner on iCloud "Optimize iPhone Storage" vs. keeping originals (Group C patch).
5. **New blog, ranked:** (1) screen-recording-specific compression advice, (2) a dated Discord-limit tracker post, (3) ProRes/Cinematic mode deep-dive, (4) Handbrake/Clideo comparison — deprioritized, no volume evidence yet.

No page needs a structural rewrite or a new H2/H3 outline — the architecture and the writing quality are both already sound; the work here is closing one cannibalization gap and a small number of genuine content gaps, not redoing what already works.
