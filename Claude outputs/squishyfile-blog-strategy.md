# SquishyFile Blog Content Strategy — September 2026 Keyword Round

Based on the 5 regional Ubersuggest exports (`compress_video_us/uk/ca/aus/newzeland.csv`, same 50 keywords, different volumes per market) and the current site content (home, `/compress-video-to-size`, `/compress-video-on-iphone`, plus the 3 existing blog posts already published: *why-your-videos-are-so-big*, *discord-file-size-limits*, *client-side-video-compression-privacy*).

## A. Content opportunity analysis

### Tool page map

| Tool page | Primary intent | Already covers | Gaps |
|---|---|---|---|
| **Home (`/`)** | "Compress my video now" — transactional, format-agnostic (MP4/MOV/MKV/AVI/WebM) | 3-step flow, CRF/quality-level table, Handbrake comparison, format list | Doesn't explain *why* formats behave differently once compressed, doesn't address repeated/generational compression |
| **`/compress-video-to-size`** | "Get this under N MB" — transactional, size-driven | Per-platform limit table (email, Discord, WhatsApp, Instagram, X, YouTube, TikTok), bitrate math explainer, batch workflow | Table is deliberately compact — no room for platform-specific quirks (Gmail's combined-attachment cap, WhatsApp's video-vs-document behavior) |
| **`/compress-video-on-iphone`** | "Shrink a video on my iPhone" — device-specific transactional | Safari workflow, HEVC/4K size table, camera-setting prevention tips, App/Shortcuts comparison | Prevention tips are iPhone-only; nothing for Android, screen recorders, webcams, cameras |

### Existing blog posts (do not duplicate)
- *why-your-videos-are-so-big* — first-principles explainer of bitrate/resolution/codec as the three levers on file size.
- *discord-file-size-limits* — Discord-specific limit table + fast fix.
- *client-side-video-compression-privacy* — how the WebAssembly/no-upload architecture works technically.

### Keyword clusters (combined volume = sum across all 5 regional exports)

1. **Head/transactional** — "video compressor" (~142.6k), "compress video" (~59.4k), "compress video online" (~18k), "online video compressor" (~18k), "compress mp4" (~18.9k), "mp4 compressor" (~20.8k). Massive volume, but pure "do it for me" intent already fully served by the home page. Not blog material — a blog post here would just re-explain the tool.
2. **Format-specific** — "compress mov file" (~2.1k), "mov compressor" (~3.2k), "reduce mp4 file size" (~4.5k), "compress avi/mkv/webm" (~70 each). Lexically these look like more "compress X" requests, but a meaningful share of MOV-specific searches carry a second, unstated intent: *why doesn't this file open on my other devices/software*. MOV is Apple's QuickTime container; it's the format iPhones and Macs default to, and it's also the format that jams up in Windows Media Player, older Android players, and some upload forms. That's a real, distinct problem from "make it smaller" — and it's not addressed on the home page beyond "we export MP4."
3. **Quality-protection** — "compress video without losing quality" (~670), "compress video without quality loss" (~380), "lossless video compression" (~620), "high quality video compressor" (~small). *why-your-videos-are-so-big* already answers "what controls file size." What it doesn't answer: what happens when you compress a file that's already been compressed once (by an app, a social platform, or a previous export) — which is very often the real situation behind this search, since people rarely search "without losing quality" before their *first* compression.
4. **Size-limit / platform** — "compress video for email" (~1.2k), "compress video for whatsapp" (~410), "compress video for discord" (~1.76k, already owned by the Discord post), "compress video for instagram" (~340), "compress video for twitter" (~70). The to-size page's table covers the numbers. It doesn't cover the behavioral quirks that actually cause the failure — Gmail's 25MB cap is shared across *all* attachments on the message, not per file; WhatsApp silently re-compresses anything sent "as video" but leaves a file alone (up to 2GB) if you send it "as document" instead. Those are genuinely useful, non-obvious facts a table can't hold.
5. **Comparison/branded** — "free alternative to handbrake," "video compressor vs handbrake," "video compressor like clideo," "compress video without software." Near-zero volume in every single region (mostly 0–10). Real intent (comparison-shopping) but not enough demand recorded here to justify a dedicated article; the home page's existing Handbrake section already covers it proportionately to the actual search volume.
6. **Prevention/recording-settings** — "reduce video size," "shrink video size," "video size reducer," "compress large video file" (~11.7k / 1.65k / 6k / 270). Large generic volume, but *why-your-videos-are-so-big* and the iPhone page's camera-settings section already cover this territory (levers + iPhone-specific prevention). A third pass at "how to make videos smaller" would cannibalize both.

## B. Recommended 3 articles (ranked)

**1. MOV vs. MP4: Why Some of Your Videos Won't Open Everywhere**
Real problem: file that plays fine on the phone that made it, then fails on a Windows PC, an old Android, or a web upload form. Distinct from the home page (which treats all formats as identical inputs) and from every existing blog post. Serves the "compress mov file / mov compressor / compress mp4 / mp4 compressor" cluster (combined tens of thousands of searches) with an angle none of the current pages take. Natural, non-pushy tie-in: compressing with a tool that always outputs MP4 solves the compatibility problem *and* the size problem in the same step.

**2. How Many Times Can You Compress a Video Before It Looks Bad?**
Real problem: someone compresses a video, isn't happy with a soft or blocky result, and doesn't realize the file they fed the compressor was already a compressed export (from a phone app, a social platsform, or an earlier round of editing). This is the specific, narrower question behind "compress video without losing quality" / "lossless video compression" that *why-your-videos-are-so-big* doesn't answer — that post explains what controls size on a single pass, not what happens across repeated passes. No cannibalization: this is a "why does my result look worse than expected" article, not a settings tutorial.

**3. Why Your Video Won't Send by Email or WhatsApp (and What Actually Works)**
Real problem: a video bounces from Gmail or won't send in WhatsApp, and the fix isn't always "compress it" — sometimes it's "you attached two files that together beat the combined cap" or "send it as a document, not a video." This goes past the to-size page's limit table into the actual mechanics of why these two channels specifically fail, which the table has no room to explain. Distinct from the Discord post (a gaming/community platform with a flat per-file cap, no such quirks) and from the to-size page (a reference table, not a troubleshooting walkthrough).

Rejected: a fourth pass at "what makes videos big" (already covered twice), a Handbrake/Clideo comparison piece (real intent but negligible recorded volume), and any straight "compress video to under Xmb" rewrite (that's the to-size page's exact job).

## C. Full articles

Delivered as three ready-to-use files matching the site's existing blog convention (`contents/blog/<slug>.en.md`, frontmatter + `<section>`/`.steps`/`.faq-grid`/`.spec-table` markup) and saved directly into `contents/blog/`:

1. `mov-vs-mp4-explained.en.md`
2. `how-many-times-can-you-compress-a-video.en.md`
3. `video-wont-send-email-whatsapp.en.md`

SEO metadata (title, description, slug, intent) is in each file's frontmatter and duplicated below for reference.

### Article 1
- **Title:** MOV vs. MP4: Why Some of Your Videos Won't Open Everywhere
- **Search intent:** Troubleshooting / informational — "why won't this file play," "should I convert it"
- **Slug:** `/blog/mov-vs-mp4-explained`
- **Meta title:** MOV vs MP4: Why Your Video Won't Open Everywhere
- **Meta description:** MOV plays perfectly on the device that made it and jams up everywhere else. Here's what's actually different between MOV and MP4, and when converting solves the problem.
- **Keyword clusters served:** compress mov file, mov compressor, compress mp4, mp4 compressor, reduce mp4 file size, compress avi/mkv/webm

### Article 2
- **Title:** How Many Times Can You Compress a Video Before It Looks Bad?
- **Search intent:** Informational / troubleshooting — "why does my compressed video look worse than expected"
- **Slug:** `/blog/how-many-times-can-you-compress-a-video`
- **Meta title:** How Many Times Can You Compress a Video Before It Looks Bad?
- **Meta description:** Compression loss adds up every time you re-encode a video. Here's why a second or third pass looks worse than the first, and how to avoid it.
- **Keyword clusters served:** compress video without losing quality, compress video without quality loss, lossless video compression, high quality video compressor

### Article 3
- **Title:** Why Your Video Won't Send by Email or WhatsApp (and What Actually Works)
- **Search intent:** Troubleshooting — "why won't my video send," "how do I get around this limit"
- **Slug:** `/blog/video-wont-send-email-whatsapp`
- **Meta title:** Why Your Video Won't Send by Email or WhatsApp
- **Meta description:** Gmail and WhatsApp fail videos for different, non-obvious reasons. Here's what's actually going on with both, and the fastest way around each one.
- **Keyword clusters served:** compress video for email, compress video for whatsapp, compress video for instagram, compress video for twitter
