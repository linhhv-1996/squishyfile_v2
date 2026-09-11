# SquishyFile Editorial Content Audit & Topic Recommendations

*Prepared as a strategic content audit — no articles written, no files modified. Based on a full read of all 10 SEO tool pages and all 11 blog articles currently live on the site.*

---

## 1. Existing Content Map

### Cluster: Compression fundamentals (CRF, bitrate, resolution)
**Covered by:** `how-video-compression-works` (blog), `home` (SEO), `compress-video-to-size` (SEO)

This is the site's deepest and most confident cluster. `how-video-compression-works` is a genuinely strong technical explainer — it correctly separates CRF, bitrate and resolution as three distinct levers, explains why CRF isn't uniform across a frame, and walks through the bitrate math behind target-size encoding. The home page reinforces this with the Light/Balanced/Max squish framing, and `compress-video-to-size` extends it into the bitrate-budget-includes-audio detail. Coverage here is genuinely deep — this is not a gap.

**Gap:** nothing structural. Any new article touching CRF/bitrate/resolution mechanics head-on would substantially overlap this piece.

### Cluster: Repeated/generational compression loss
**Covered by:** `how-many-times-can-you-compress-a-video` (blog)

Thorough and specific — the photocopy-of-a-photocopy framing, the five-step "where extra passes sneak in" breakdown, and the practical detection tips (blockiness in flat areas, suspiciously small file size) are all well done. Referenced correctly from `why-apps-compress-your-video`, `why-is-my-video-blurry`, and the home page FAQ. Strong, well-integrated coverage.

### Cluster: Platform-specific compression / sharing behavior
**Covered by:** `why-apps-compress-your-video` (blog), `video-wont-send-email-whatsapp` (blog), `best-video-settings-social-media` (blog), `compress-video-to-size` (SEO, limits table)

This is the site's largest cluster by word count, and it's genuinely well cross-linked — the three blog posts divide the territory cleanly (why compression happens platform-by-platform / why sending fails / what settings to export at) rather than repeating each other. Depth is real: iCloud Mail Drop, the WhatsApp document trick, Telegram's file-send option, MMS fallback on iMessage — these are specific, correct, and not obvious.

**Gap/risk:** this cluster is close to saturated. A new platform-behavior article risks being the fourth variation on the same theme. If anything is missing here, it's less "another platform piece" and more depth on *why* platforms make these transcoding trade-offs from an infrastructure standpoint (adaptive bitrate streaming — see Gap 6 below), which is a different, complementary angle rather than a repeat.

### Cluster: Video upscaling
**Covered by:** `does-video-upscaling-actually-work` (blog), `video-upscaler` (SEO), `why-is-my-video-blurry` (blog, partial)

This is the strongest single piece of writing on the site. `does-video-upscaling-actually-work` correctly distinguishes interpolation from AI super-resolution, introduces the observed/inferred/reconstructed/hallucinated framework, and explains upscaling as a structurally ill-posed inverse problem rather than "recovery." `why-is-my-video-blurry` complements it well by sorting blur into four distinct causes and mapping which ones upscaling actually helps. No gap here — this is a template for the quality bar the rest of the blog should hit.

### Cluster: Containers vs. codecs (MOV/MP4)
**Covered by:** `mov-vs-mp4-explained` (blog), touched in `compress-video-on-iphone` and both MP3-extraction pages

Solid, specific explainer of the container/codec distinction, with a genuinely useful symptom-to-cause table. It correctly identifies HEVC (not the MOV container itself) as the source of most real playback problems.

**Gap:** the article is scoped specifically to MOV vs. MP4 compatibility, not to codecs as a subject in their own right. There is no article anywhere on the site that explains H.264 vs. HEVC vs. AV1 as an independent technical topic — what "generation" of codec means, why a newer codec compresses better at the same quality, hardware decode support, or why AV1 adoption has been slow. This is a clearly named gap (see Gap 1).

### Cluster: Audio bitrate / MP3 quality
**Covered by:** `mp3-bitrate-quality-explained` (blog), `mov-to-mp3`, `mp4-to-mp3`, `video-to-mp3` (SEO)

`mp3-bitrate-quality-explained` is a good piece — it correctly frames bitrate as a ceiling rather than a quality dial, explains the source-ceiling problem, and covers the mono/stereo bitrate-splitting detail that most explainers skip. The three extraction tool pages layer in useful format-specific detail (PCM vs. AAC source audio, sample-rate normalization to 44.1kHz).

**Gap:** the article stops at MP3-specific bitrate choice. It doesn't address lossy-vs-lossless audio formats as a category (WAV/FLAC vs. MP3/AAC), or why MP3 specifically was chosen as "the" portable format despite being an older, less efficient codec than AAC or Opus. There's room for a companion piece here, but it would need a genuinely different angle to avoid restating the bitrate article (see Gap 8, lower priority).

### Cluster: Transcription vs. captions
**Covered by:** `video-transcript-vs-subtitles` (blog), `video-to-text` (SEO)

A well-reasoned piece that correctly identifies the actual confusion (transcription solves "what was said," captioning solves "what was said and exactly when") and gives honest, non-self-serving guidance about when SquishyFile's own tool is the wrong choice (no SRT export). This kind of self-aware limitation-stating is good for credibility and shouldn't be diluted by a redundant follow-up.

**Gap:** the article is about the transcript/caption distinction, not about how automatic speech recognition actually works or why it fails on certain audio. `video-to-text`'s FAQ briefly lists accuracy factors (cross-talk, noise, multiple speakers) but never explains the mechanism. There's a legitimate, differentiated topic here (see Gap 5).

### Cluster: iPhone-specific video handling
**Covered by:** `compress-video-on-iphone` (SEO)

Comprehensive for a tool page — camera settings, storage tips, per-minute file size table, comparison to Shortcuts/Mail/App Store alternatives. This is tool-page content, appropriately scoped, and doesn't need a blog companion duplicating it.

**Gap:** HDR/Dolby Vision capture is never mentioned anywhere on the site, despite being standard on recent iPhones and a real source of "why does my converted video look washed out or oddly colored" confusion (see Gap 3).

### Cluster: Frame extraction
**Covered by:** `frame-extractor` (SEO)

Tool-page content only — no editorial article touches the underlying technical subject (how video frames are actually stored: I-frames vs. P-frames vs. B-frames, why "extract the nearest frame" sometimes returns a blurry or artifacted image even from a sharp-looking paused video). This is a clean, differentiated gap directly adjacent to a live tool (see Gap 2).

### Not covered at all
- Codecs as an independent subject (H.264/HEVC/AV1 compared directly)
- HDR and color space
- Adaptive bitrate streaming / why streamed video behaves differently from a downloaded file
- Frame structure (I/P/B-frames, keyframes, GOP) and what it means for seeking, extracting stills, and editing
- Noise/grain and why it's expensive to compress
- Audio/video sync drift after conversion or editing
- Frame rate as an independent subject (frame rate vs. shutter speed vs. motion blur is only touched tangentially)
- Lossy audio format landscape (MP3 vs. AAC vs. Opus vs. FLAC)

---

## 2. Content Gaps, Ranked by Editorial Importance

### Gap 1 — Codecs as their own subject (not just MOV vs. MP4)
**What's missing:** A direct, standalone explanation of what a codec generation actually changes — H.264 → HEVC → AV1 — in terms of compression efficiency, encoding complexity, hardware decode support, and why "newer codec, same file size, better quality" is true but not universally available yet.
**Why it matters:** Codec confusion is the root cause behind several symptoms already documented elsewhere on the site (HEVC playback stutter in `mov-vs-mp4-explained`, "why does my video still look worse at the same resolution" in `why-apps-compress-your-video`) but the site has never explained codecs as a topic in their own right — only as a side effect of a container problem.
**Complements:** `mov-vs-mp4-explained`, `compress-video-on-iphone`, `how-video-compression-works`
**Cannibalization risk:** Low. `mov-vs-mp4-explained` is scoped to container compatibility symptoms; this would be scoped to codec generations and compression efficiency, a genuinely different angle that those articles gesture at but never develop.

### Gap 2 — How video frames are actually stored (I-frames, P-frames, B-frames, GOP)
**What's missing:** An explanation of why a video file isn't a simple sequence of complete images — most frames are stored as *differences* from nearby frames — and what that means practically: why some paused frames extract cleanly and others look smeared or blocky, why seeking to an exact timestamp sometimes snaps to a nearby frame instead, and why editing "just a few seconds" of a clip usually forces a full re-encode.
**Why it matters:** This is a foundational compression concept the site has never explained, and it directly explains a real, previously-unaddressed behavior of the `frame-extractor` tool (why a specific extracted frame can look worse than the video appeared during playback).
**Complements:** `frame-extractor`, `how-video-compression-works`, `how-many-times-can-you-compress-a-video` (the "editing forces a re-encode" step in that article's five-step breakdown would gain a natural cross-link)
**Cannibalization risk:** Low. Nothing currently explains frame structure; the closest adjacent content (CRF, bitrate) operates one level of abstraction above this.

### Gap 3 — HDR video and why it looks wrong after conversion or compression
**What's missing:** What HDR (and Dolby Vision specifically, since it's the iPhone default) actually changes about a video file, why HDR footage can look washed out, over-contrasty, or oddly colored after compression or format conversion, and why "convert to MP4" sometimes strips or mishandles HDR metadata.
**Why it matters:** Recent iPhones shoot HDR by default. This is a genuinely common, currently undocumented complaint pattern that sits directly adjacent to two existing pages (`compress-video-on-iphone`, `mov-vs-mp4-explained`) without either of them addressing it.
**Complements:** `compress-video-on-iphone`, `mov-vs-mp4-explained`
**Cannibalization risk:** Low. Color/HDR is a completely distinct axis from anything currently published (resolution, bitrate, container, codec).

### Gap 4 — Why noisy or grainy footage is unusually hard to compress
**What's missing:** A focused explanation of why sensor noise, low-light grain, and film grain are especially expensive for an encoder — because noise looks like detail to a compression algorithm, and "detail" is exactly what CRF-based encoding tries hardest to preserve. Covers why a noisy low-light phone video compresses worse than a bright, clean one at the identical resolution and settings, and why lightly denoising before compressing can dramatically shrink a file without a visible quality trade-off.
**Why it matters:** `how-video-compression-works` already states that encoders spend bits based on what the eye won't notice, and that a "busy" scene compresses less efficiently — but it never isolates noise/grain specifically as the single most common real-world cause of that. This is a natural, non-redundant extension of an existing article rather than competing with it.
**Complements:** `how-video-compression-works`, `compress-video-on-iphone` (low-light phone footage)
**Cannibalization risk:** Low-Medium. Needs to be written narrowly around noise specifically, not as a general re-explanation of CRF, or it risks restating `how-video-compression-works`.

### Gap 5 — How automatic speech recognition actually works, and why it fails on certain audio
**What's missing:** What's actually happening when a browser-based speech-to-text model listens to a video — briefly, what it's doing (acoustic modeling + language modeling, not literal pattern matching against known phrases) — and a genuine technical explanation of why cross-talk, background noise, accents, and audio quality specifically degrade accuracy, rather than the current one-line FAQ mention.
**Why it matters:** `video-transcript-vs-subtitles` correctly separates transcription from captioning, but never explains the transcription mechanism itself. `video-to-text`'s FAQ lists accuracy factors without explaining why they matter. This is real unmet depth directly adjacent to a live tool.
**Complements:** `video-to-text`, `video-transcript-vs-subtitles`
**Cannibalization risk:** Low. No existing article explains ASR mechanics; the existing piece is about output format (transcript vs. caption), not the underlying technology.

### Gap 6 — Why streamed video looks different from a downloaded file (adaptive bitrate basics)
**What's missing:** An explanation of adaptive bitrate streaming (HLS/DASH) — why YouTube, Netflix, etc. serve multiple quality tiers and switch between them live based on your connection, why the same "1080p" label can mean different actual bitrates on different days or connections, and how this differs fundamentally from the single-file compression the rest of the site's tools do.
**Why it matters:** This is a genuinely missing broad concept that would round out the site's authority — everything currently published is about single-file, on-demand compression; nothing explains the *other* major way video reaches viewers. It also gives useful context for why YouTube (already discussed at length in `why-apps-compress-your-video`) transcodes into multiple tiers in the first place, rather than just stating that it does.
**Complements:** `why-apps-compress-your-video` (the YouTube section specifically)
**Cannibalization risk:** Low. Nothing on the site currently explains streaming delivery mechanics; this is a different problem space from encoding a file.

### Gap 7 — Frame rate as its own subject
**What's missing:** A dedicated explanation of what frame rate actually changes — motion smoothness vs. the "soap opera effect," the relationship (and non-relationship) between frame rate and perceived sharpness, why 24fps looks "cinematic" while 60fps looks like a live broadcast, variable vs. constant frame rate and why VFR screen recordings can cause playback stutter or audio drift after editing.
**Why it matters:** Frame rate is mentioned in passing across several articles (the iPhone size table, the platform-compression breakdown, `mp4-to-gif`'s fps guidance) but has never been the subject of its own explanation, despite being one of the four fundamental levers (alongside resolution, bitrate, codec) the whole site's tools operate on.
**Complements:** `how-video-compression-works`, `compress-video-on-iphone`, `frame-extractor`
**Cannibalization risk:** Medium. Needs a genuinely distinct angle (motion perception + VFR problems) rather than re-treading the "frame rate affects file size" point already made in `how-video-compression-works`'s adjacent material.

### Gap 8 — The lossy audio format landscape (MP3 vs. AAC vs. Opus vs. FLAC)
**What's missing:** Why MP3 remains the default "portable audio" choice on the web despite AAC and Opus both compressing more efficiently at the same bitrate — a genuinely interesting, slightly counterintuitive story about compatibility inertia beating technical superiority, similar in spirit to the MOV/MP4 "worse format wins on compatibility" narrative already on the site.
**Why it matters:** Rounds out the audio-extraction cluster with a "why does the format itself matter" angle that `mp3-bitrate-quality-explained` never covers (that article is entirely about bitrate *within* MP3, not about MP3 as a choice among formats).
**Complements:** `mp3-bitrate-quality-explained`, `mov-to-mp3`, `mp4-to-mp3`, `video-to-mp3`
**Cannibalization risk:** Medium. Close enough in subject to the bitrate article that it needs a clearly different framing (format choice, not quality-per-format) to justify existing separately.

### Gap 9 — Audio/video sync drift
**What's missing:** Why audio and video can drift out of sync after trimming, converting, or compressing a file — usually caused by variable frame rate sources (common in screen recordings) being forced into a constant frame rate during re-encoding, or by a container/timestamp mismatch — and what actually fixes it versus what doesn't.
**Why it matters:** A genuinely common, specific, currently-undocumented problem that would sit naturally alongside the compression and frame-rate clusters. Distinct from anything currently published.
**Complements:** `how-video-compression-works`, a hypothetical frame-rate article (Gap 7)
**Cannibalization risk:** Low, provided it's written narrowly around the sync-drift mechanism rather than becoming a general re-explanation of compression.

---

## 3. Recommended Blog Topics

### 1. H.264 vs. HEVC vs. AV1: What Actually Changed Between Codec Generations
**Core question:** Why does a newer codec produce a smaller file at the same visual quality, and why hasn't everyone switched to the newest one?
**Why it belongs on SquishyFile:** SquishyFile's compressor and upscaler both operate on top of codec choices; understanding codecs is foundational video literacy the site currently gestures at (via HEVC mentions) but never explains directly.
**What it should cover:** what a codec generation actually improves (better motion prediction, smarter block partitioning, not just "smaller numbers"); why H.264 remains the safest compatibility choice despite being oldest; HEVC's licensing/patent complexity as a real reason for slow adoption, distinct from technical merit; AV1's promise and its current hardware decode gaps; why "same codec, different encoder implementation" (e.g., x264 vs. a phone's hardware encoder) also matters; how to actually tell which codec a file uses; why re-encoding into a "better" codec doesn't retroactively fix quality already lost.
**Existing-content relationship:** Complements `mov-vs-mp4-explained` (which mentions H.264/HEVC only as a compatibility symptom) and `compress-video-on-iphone` (High Efficiency setting).
**Cannibalization risk:** Low — genuinely different scope from the container-focused MOV/MP4 piece.
**Depth potential:** High — three codecs, licensing history, hardware support nuance, and practical detection easily support 1,200+ words without padding.
**Editorial priority:** High

### 2. What's Actually Inside a Video File: I-Frames, P-Frames and Why Editing Forces a Re-Encode
**Core question:** Why isn't a video just a stack of complete images, and what does that structure explain about seeking, trimming, and frame extraction?
**Why it belongs on SquishyFile:** Directly explains a real behavior of the `frame-extractor` tool and adds the missing mechanical layer beneath `how-video-compression-works`.
**What it should cover:** keyframes vs. predicted frames in plain terms; why most frames only store *differences* from neighbors; why seeking to an arbitrary timestamp sometimes snaps to the nearest keyframe; why a "one-second trim" of a clip usually means re-encoding the whole file, tying directly into the compounding-loss mechanism in `how-many-times-can-you-compress-a-video`; why a paused frame during playback can look sharp while the same frame extracted as a still looks blockier (predicted frames carry less independent detail); what GOP (group of pictures) length trades off.
**Existing-content relationship:** Complements `frame-extractor`, `how-video-compression-works`, `how-many-times-can-you-compress-a-video`.
**Cannibalization risk:** Low — this is a genuinely unaddressed structural layer.
**Depth potential:** High — a concrete, visual, previously-untouched mechanism with several practical corollaries.
**Editorial priority:** High

### 3. Why HDR Video Looks Wrong After Compressing or Converting It
**Core question:** Why does HDR (Dolby Vision, HDR10) footage sometimes look washed out, overly contrasty, or color-shifted after it's been compressed or converted to a "regular" file?
**Why it belongs on SquishyFile:** Recent iPhones shoot HDR by default, and SquishyFile's compressor and MOV/MP4 conversion sit exactly where this problem surfaces.
**What it should cover:** what HDR actually changes (brightness range and color gamut, not resolution); how HDR metadata travels with a file and what "tone mapping" means when it's stripped or misapplied; why a standard-dynamic-range display shows HDR footage differently than it was meant to look; why HDR footage can look fine in Photos but wrong after conversion or upload; why compressing HDR footage requires the encoder to work harder to avoid banding in the wider brightness range; practical guidance on when to convert HDR down to SDR on purpose versus leave it alone.
**Existing-content relationship:** Complements `compress-video-on-iphone`, `mov-vs-mp4-explained`.
**Cannibalization risk:** Low — color/dynamic range is an entirely separate axis from anything currently published.
**Depth potential:** High — a technically rich, currently-empty subject with clear real-world symptoms to anchor it.
**Editorial priority:** High

### 4. Why Noisy or Low-Light Footage Is Especially Hard to Compress
**Core question:** Why does a grainy or low-light video come out blockier than a bright, clean video at the exact same settings?
**Why it belongs on SquishyFile:** A direct, narrow extension of a point `how-video-compression-works` makes only in passing — that encoders can't tell "real detail" from "noise that looks like detail."
**What it should cover:** why compression algorithms treat noise and fine texture the same way, since both defeat the assumption that neighboring pixels look similar; why this makes noisy footage a worst-case scenario for CRF-based encoding; the concrete file-size and quality cost of sensor noise in low-light phone video; why light denoising before compression can shrink a file substantially with little visible cost, and why it's a trade a compressor itself generally shouldn't make automatically; how this interacts with the "busy scene" idea already introduced in `how-video-compression-works` without repeating that article's core explanation.
**Existing-content relationship:** Extends `how-video-compression-works`, complements `compress-video-on-iphone`.
**Cannibalization risk:** Medium — must stay narrowly focused on noise as the specific mechanism, not restate CRF fundamentals.
**Depth potential:** Medium-High — a focused technical case study rather than a broad topic, but with enough real mechanism (motion estimation defeated by noise, temporal vs. spatial noise) to clear 1,200 words.
<br>**Editorial priority:** Medium-High

### 5. How Automatic Speech Recognition Actually Works (and Why Some Audio Defeats It)
**Core question:** What is a speech-to-text model actually doing, and why do cross-talk, noise, and accents break it in specific, explainable ways?
**Why it belongs on SquishyFile:** Directly deepens `video-to-text` and `video-transcript-vs-subtitles`, neither of which explains the mechanism behind transcription accuracy — only the symptoms.
**What it should cover:** acoustic modeling (turning sound into probable phonemes) versus language modeling (turning phonemes into probable words) in plain terms; why overlapping speech is uniquely hard, distinct from just "loud background noise"; why accents and unusual vocabulary reduce accuracy even with clear audio; why background music is worse than background chatter for a model trying to isolate speech; what "confidence" actually means in a transcript the model produces; why running the same audio twice can occasionally produce slightly different results; realistic expectations for legal/medical-grade accuracy versus casual use.
**Existing-content relationship:** Complements `video-to-text`, `video-transcript-vs-subtitles`.
**Cannibalization risk:** Low — no existing article explains ASR mechanics; the closest piece is about caption timing, not recognition accuracy.
**Depth potential:** High — a genuinely rich, unaddressed mechanism with several distinct sub-questions.
**Editorial priority:** High

### 6. Why Streamed Video Looks Different From a Downloaded File
**Core question:** Why does a YouTube or Netflix video seem to change quality mid-playback, and how is that different from the kind of one-time compression SquishyFile does?
**Why it belongs on SquishyFile:** Rounds out the site's authority by explaining the *other* major video-delivery model, giving genuine context for the YouTube section of `why-apps-compress-your-video` rather than just asserting that YouTube "transcodes into multiple tiers."
**What it should cover:** what adaptive bitrate streaming is (HLS/DASH) in plain terms; why a video is actually stored as several parallel versions rather than one file that changes quality live; how a player decides when to switch tiers based on connection speed and buffer health; why the visible quality "step" during a tier switch is a deliberate trade-off, not a bug; why this makes "what bitrate is this video" an unanswerable question for streamed content in a way it isn't for a downloaded file; how this differs fundamentally from SquishyFile's single-pass, single-output compression model.
**Existing-content relationship:** Complements `why-apps-compress-your-video`.
**Cannibalization risk:** Low — a genuinely separate delivery mechanism from anything currently covered.
**Depth potential:** High — a substantial, well-documented technical subject with no existing coverage to compete with.
**Editorial priority:** Medium-High

### 7. What Frame Rate Actually Changes (and What It Doesn't)
**Core question:** What does frame rate actually control about how a video looks and feels, separate from resolution or bitrate?
**Why it belongs on SquishyFile:** Frame rate is one of the fundamental variables the site's tools operate on but has never been explained as its own subject, only mentioned in passing across several articles.
**What it should cover:** frame rate as motion sampling rate, distinct from resolution (spatial) and bitrate (data budget); why 24fps reads as "cinematic" and 60fps reads as "live TV" — the soap-opera-effect perception, not a quality judgment; the real relationship between frame rate and perceived motion blur (shutter angle, not frame count, is the bigger factor); constant vs. variable frame rate, and why screen recordings are often VFR by nature; why converting a VFR source to CFR can cause perceptible stutter or audio drift if done carelessly; why higher frame rate isn't "more quality" the way higher resolution or bitrate can be.
**Existing-content relationship:** Complements `how-video-compression-works`, `compress-video-on-iphone`, `frame-extractor`.
**Cannibalization risk:** Medium — needs to focus on motion perception and VFR, since the file-size angle is already stated in passing elsewhere.
**Depth potential:** Medium-High — enough distinct sub-topics (perception, shutter speed, VFR) to reach 1,200 words without repeating existing bitrate/CRF content.
**Editorial priority:** Medium

### 8. Why Your Video's Audio Drifts Out of Sync After Editing or Converting It
**Core question:** Why does audio slowly fall out of sync with the picture after trimming, compressing, or converting a video — and what's actually different about the fix depending on the cause?
**Why it belongs on SquishyFile:** A specific, common, currently undocumented failure mode adjacent to both the compression and (hypothetically) frame-rate clusters, and directly relevant to anyone using SquishyFile's compressor on a screen recording.
**What it should cover:** the two genuinely distinct causes — variable frame rate sources being forced into constant frame rate during re-encoding, and container/timestamp mismatches from certain screen recorders; why sync drift gets worse the longer the video is, rather than showing up instantly; why the problem often isn't visible until several minutes in, which is why short test clips can look fine while the full file doesn't; why re-encoding sometimes fixes drift that existed in the source and sometimes introduces new drift that wasn't there; practical ways to tell which failure mode is actually happening (checking if the source was a screen recording, checking reported vs. actual frame rate).
**Existing-content relationship:** Complements `how-video-compression-works`, and the hypothetical frame-rate article above.
**Cannibalization risk:** Low, provided it's scoped to the sync mechanism specifically.
**Depth potential:** Medium-High — a focused, mechanism-driven topic with genuine practical value.
**Editorial priority:** Medium

### 9. MP3, AAC, and Opus: Why the "Worse" Audio Format Usually Wins
**Core question:** Why is MP3 still the default choice for extracted audio when AAC and Opus both compress more efficiently at the same bitrate?
**Why it belongs on SquishyFile:** Rounds out the audio-extraction cluster with a format-choice angle that `mp3-bitrate-quality-explained` (which is entirely about bitrate *within* MP3) never covers, echoing the compatibility-beats-technical-merit story the site already tells well about MOV vs. MP4.
**What it should cover:** what actually differs between MP3, AAC and Opus at a technical level (patent history, compression efficiency, universality of decoder support); why AAC being technically better hasn't dislodged MP3 for portable audio in the same way HEVC hasn't fully displaced H.264; where Opus actually wins today (voice calls, some streaming) despite near-zero mainstream awareness; why "convert to MP3" remains the safest advice for something a stranger needs to open without hassle, mirroring the MP4 compatibility argument already made elsewhere on the site.
**Existing-content relationship:** Complements `mp3-bitrate-quality-explained`, `mov-to-mp3`, `mp4-to-mp3`, `video-to-mp3`.
**Cannibalization risk:** Medium — must stay on format choice, not bitrate-within-a-format, to avoid restating the existing article.
**Depth potential:** Medium — real content here, but narrower than the codec-generations topic above; still clears 1,200 words with format history and practical guidance.
**Editorial priority:** Medium

### 10. Why Two Videos at the Same Resolution and Bitrate Can Still Look Different
**Core question:** Beyond CRF and bitrate, what other factors make two technically-identical-on-paper videos look meaningfully different in quality?
**Why it belongs on SquishyFile:** A genuine deep-dive into encoder implementation differences — something `how-video-compression-works` sets up (by explaining CRF and bitrate as levers) but doesn't fully resolve, since two files can share both numbers and still differ.
**What it should cover:** encoder implementation quality (a well-tuned x264 encode vs. a fast hardware encoder at the "same" settings); the difference between one-pass and two-pass encoding; how source content complexity (motion, noise, detail) interacts with a fixed bitrate target differently video to video; why "the same app, different phone" can produce different results due to different hardware encoders; why comparing two videos by resolution and bitrate alone is like comparing two recipes by calorie count alone.
**Existing-content relationship:** Extends `how-video-compression-works` without repeating its core CRF/bitrate explanation — this article assumes that knowledge and goes one level further.
**Cannibalization risk:** Medium-High — needs very careful scoping to avoid re-explaining CRF and bitrate from scratch; only worth writing if it can stay strictly at the "beyond the numbers" layer.
**Depth potential:** Medium — real content, but this is the topic most likely to drift into restating existing material if not carefully bounded.
**Editorial priority:** Low-Medium

### 11. Why Screen Recordings Compress Differently Than Camera Footage
**Core question:** Why does a screen recording of a static desktop compress to almost nothing, while a screen recording of a fast-moving game looks blocky even at a high bitrate?
**Why it belongs on SquishyFile:** Screen recordings are referenced constantly across the site's tool pages and blog (as a common file type people compress, convert, and transcribe) but never examined as their own content category with distinct compression behavior.
**What it should cover:** why static UI content (text, flat colors, little motion) is close to a best-case scenario for CRF-based encoding, echoing but not repeating the whiteboard example already used in `how-video-compression-works`; why screen recordings of video calls, games, or fast scrolling behave completely differently — often worse than camera footage at the same settings — due to fine text, sharp edges, and erratic motion the encoder wasn't tuned for; why screen-recording software's frame rate choices (and VFR capture, tying to Gap 8/9) matter more here than for camera footage; practical settings guidance specific to screen content (when resolution downscaling helps more than CRF here).
**Existing-content relationship:** Complements `how-video-compression-works` (extends the whiteboard example into a full category), touches `compress-video-to-size`.
**Cannibalization risk:** Medium — the "flat content compresses well" point already exists in one sentence elsewhere; this article needs to add the harder, unaddressed half (why *some* screen content is a worst case, not a best case) to justify itself.
**Depth potential:** Medium — a real, distinct content category, though it needs the harder half of the argument to reach genuine 1,200-word depth rather than restating the easy half.
**Editorial priority:** Low-Medium

### 12. What Actually Happens When You "Just Rename" a File Extension
**Core question:** Why doesn't renaming a .mov to .mp4 (or any file to a different extension) actually change what's inside it, and what would need to happen for it to actually work?
**Why it belongs on SquishyFile:** `mov-vs-mp4-explained`'s FAQ already states renaming doesn't work in one line; this expands that single true-but-underexplained fact into the broader, genuinely interesting mechanics of what a file extension actually is (a hint to the OS, not a description of the contents) versus what's really inside the file (the container format and its internal structure).
**What it should cover:** file extensions as metadata/convention, not enforced structure; how software actually determines a file's real type (magic bytes / file signatures) regardless of extension; why a truly compatible conversion requires re-writing the container structure (sometimes without re-encoding — a "remux") versus requiring a full re-encode; when a remux is possible and when it isn't (e.g., MOV to MP4 with compatible codecs inside can sometimes remux losslessly, unlike the lossy conversion happening on SquishyFile today); why this distinction explains some of the more confusing "why did this conversion take 30 seconds and this one took 10 minutes" experiences.
**Existing-content relationship:** Directly extends one FAQ line in `mov-vs-mp4-explained` into a full, differentiated article.
**Cannibalization risk:** Medium — needs to earn its existence by going well past the single fact already stated, into remuxing and file-signature mechanics that are genuinely new territory.
**Depth potential:** Medium — a focused, slightly niche but genuinely interesting mechanism with enough surface area (extensions, magic bytes, remuxing) to clear 1,200 words.
**Editorial priority:** Low-Medium

### 13. Why "4K" Doesn't Mean What Most People Think It Means
**Core question:** What does the "4K" label actually guarantee about a video, and what does it not guarantee?
**Why it belongs on SquishyFile:** 4K comes up constantly across the site (upscaler, iPhone guide, compression guides) as a target resolution, but no article examines the label itself — what it promises and what it doesn't (which overlaps partially, and must be carefully distinguished from, `does-video-upscaling-actually-work`'s "1080p to 4K myth" section).
**What it should cover:** UHD (3840×2160) vs. true cinema 4K (4096×2160) as two different, commonly conflated standards; why "shot in 4K" says nothing about bitrate, codec, or actual sharpness (a heavily compressed 4K file can look worse than a clean 1080p one — cross-referencing `how-video-compression-works`); storage and processing cost trade-offs of shooting 4K when the output destination will downscale anyway (echoing but not repeating the social-media export guidance already published); why "will this play on my TV" depends on more than the resolution number (codec and container, tying to existing content).
**Existing-content relationship:** Must be carefully differentiated from the "1080p to 4K myth" section already in `does-video-upscaling-actually-work` — this article is about what native 4K labeling means, not about upscaling; needs an explicit note distinguishing the two if written.
**Cannibalization risk:** High unless scoped tightly away from the upscaling angle already covered — this is the topic on this list most likely to be rejected or need the sharpest editorial framing.
**Depth potential:** Medium, contingent on that scoping.
**Editorial priority:** Low (write only if the upscaling overlap can be avoided cleanly — otherwise fold the UHD-vs-cinema-4K point into a future upscaling-adjacent piece instead of a standalone article)

### 14. The Real Reason Video Files Got So Much Bigger Over the Last Decade
**Core question:** Why does an average phone video today take up so much more space than a similar-length video from ten years ago, even though compression technology has improved?
**Why it belongs on SquishyFile:** A genuinely different, more historical/narrative angle than the site's existing mechanism-focused pieces — explains the resolution/frame-rate/HDR arms race outpacing codec efficiency gains, which is a real and slightly counterintuitive story.
**What it should cover:** how resolution went from 720p to 4K, frame rate options expanded (24/30 to 60/120fps slow-mo), and HDR capture became default, all faster than codec efficiency improved; why "better cameras" and "better compression" are in tension rather than both simply making files smaller; why this explains iPhone storage pressure better than blaming any single setting; how this connects practically to the advice already given in `compress-video-on-iphone` about dialing back capture settings.
**Existing-content relationship:** Complements `compress-video-on-iphone`, and would benefit from the HDR article (Gap 3) existing first.
**Cannibalization risk:** Medium — needs a clearly narrative/historical framing to avoid becoming a rehash of resolution/bitrate/HDR points made individually elsewhere.
**Depth potential:** Medium — good if framed as synthesis-with-a-throughline rather than a list of previously-covered factors restated.
**Editorial priority:** Low-Medium

### 15. Why Some Video Editors Show a Preview That Doesn't Match the Final Export
**Core question:** Why can a video look different — sometimes better, sometimes worse — during editing than it does in the final exported file?
**Why it belongs on SquishyFile:** A genuinely common, currently undocumented confusion (proxy/preview rendering vs. final encode) that connects naturally to the re-encoding and compounding-loss themes already established on the site.
**What it should cover:** why many editors use lower-resolution "proxy" files or GPU-accelerated real-time previews that don't reflect the final encoder's actual output; why a preview can look worse than the export (proxy resolution) or better than the export (no compression applied yet during editing); how this differs from, but relates to, the compounding-loss idea in `how-many-times-can-you-compress-a-video`; practical advice on judging quality only from an actual exported/compressed file, never a live preview.
**Existing-content relationship:** Complements `how-many-times-can-you-compress-a-video`, `how-video-compression-works`.
**Cannibalization risk:** Medium — needs to stay focused on the preview/export distinction specifically rather than re-explaining compression generally.
**Depth potential:** Medium — a real, specific, slightly niche mechanism; depth is achievable but this is a narrower topic than most others on this list.
**Editorial priority:** Low

### 16. What "Lossless" Actually Means, and Why It's Almost Never What You Want for Video
**Core question:** What does true lossless video compression actually require, and why does virtually no everyday video workflow use it?
**Why it belongs on SquishyFile:** `how-video-compression-works` already states in one paragraph that lossless barely shrinks a file at all; this expands that single, underexplained but important fact into its own piece, addressing a genuinely common misconception embedded in search terms like "compress video without losing quality."
**What it should cover:** what "lossless" technically requires (bit-for-bit reconstructable, not just "looks the same"); why that constraint makes meaningful size reduction essentially impossible for video, unlike for text or code; the real spectrum between "lossless," "visually lossless," and "lossy but good enough," and why "visually lossless" is the honest target of a "Light" compression setting; where true lossless *does* get used (archival masters, professional intermediate editing formats) and why that's a different use case entirely from sharing a video.
**Existing-content relationship:** Directly expands the "Why 'lossless' isn't really on the table here" section already in `how-video-compression-works` into a full standalone treatment.
**Cannibalization risk:** Medium-High — must add substantially more than what's already stated in that section (the professional-use-case material, the lossless/visually-lossless/lossy spectrum) to justify a standalone article rather than just being a longer version of an existing paragraph.
**Depth potential:** Medium, contingent on genuinely extending rather than restating.
**Editorial priority:** Low

### 17. Why an Old Video File Might Not Open at All Anymore
**Core question:** Why does a video file from 10–15 years ago sometimes fail to open on a current device or in current software, when a video file from today almost never has that problem?
**Why it belongs on SquishyFile:** A genuinely different, forward/backward-compatibility angle than the current-day MOV/MP4 compatibility article — this is about format obsolescence and archival risk over time, not cross-platform friction today.
**What it should cover:** why some older codecs (RealVideo, early WMV, certain proprietary camcorder formats — some already listed in `frame-extractor`'s legacy-format support table) have fallen out of active software support; why a container being "old" matters less than whether its codec is still maintained anywhere; practical advice for converting old archival footage to a current, well-supported format before the tools that can still read the old one disappear entirely; how this connects to digital archiving more broadly (why "keep the original" advice elsewhere on the site has a time limit if the original format itself becomes unreadable).
**Existing-content relationship:** Complements `mov-vs-mp4-explained` and `frame-extractor` (which already lists several legacy formats it supports via the ffmpeg.wasm compatibility path).
**Cannibalization risk:** Low-Medium — genuinely different time-axis angle from the existing today's-compatibility article, though it should explicitly distinguish itself from it.
**Depth potential:** Medium — a real, slightly underexplored angle (digital preservation) with practical stakes.
**Editorial priority:** Low-Medium

---

## 4. Best Topics to Write First

**1. What's Actually Inside a Video File: I-Frames, P-Frames and Why Editing Forces a Re-Encode** — the single best combination of genuine reader value, total novelty (nothing on the site currently explains frame structure), a direct, natural tie to a live tool (`frame-extractor`), and essentially zero cannibalization risk. It also strengthens three existing articles by giving them a mechanism they currently reference only at the surface.

**2. H.264 vs. HEVC vs. AV1: What Actually Changed Between Codec Generations** — codecs are the single largest structural gap on the site relative to how often codec-adjacent symptoms (HEVC playback issues, HDR, compression efficiency) already appear elsewhere. This is the topic most likely to make the site read as authoritative to someone who actually knows the subject, and it has a rich, three-way comparison that easily clears the depth bar without padding.

**3. Why HDR Video Looks Wrong After Compressing or Converting It** — addresses a real, currently-undocumented, increasingly common problem (HDR is now default capture on recent iPhones) that sits in the gap between two existing, well-trafficked pages without overlapping either. High practical usefulness, high novelty, low cannibalization risk.

**4. How Automatic Speech Recognition Actually Works (and Why Some Audio Defeats It)** — the transcription cluster is currently the shallowest of the site's well-established clusters relative to its own tool page; this article would bring it up to the depth level of the compression and upscaling clusters, and it has a clean, natural relationship to two existing pages without restating either.

**5. Why Streamed Video Looks Different From a Downloaded File (Adaptive Bitrate Basics)** — the one topic on this list that opens an entirely new area of authority (delivery mechanics, not just encoding mechanics) rather than deepening an existing one. Lower urgency than the first four because it's less directly tied to a specific tool, but it rounds out the site's coverage in a way nothing else on the list does, and it gives real, needed context to material already published in `why-apps-compress-your-video`.

---

## 5. Suggested Editorial Roadmap

The existing blog already reads as a coherent body of work once you group it mentally: mechanics (CRF/bitrate/resolution, repeated compression), platform behavior (three articles), format compatibility (MOV/MP4), and quality perception (blur, upscaling). The gaps identified above cluster into three additions to that structure rather than a fourth, unrelated pile — so the roadmap below slots each new piece next to the cluster it deepens, in the order that lets later pieces build on earlier ones.

**Phase 1 — Fill the structural mechanics gap (frame structure and codecs).** These two topics are prerequisites, conceptually, for several of the others on this list (HDR references codec/container behavior; the noise article references CRF; the streaming article references transcoding). Publish "What's Actually Inside a Video File" and "H.264 vs. HEVC vs. AV1" first, in either order — they don't depend on each other, but both should exist before topics that reference codec generations or frame structure in passing.

**Phase 2 — Extend the iPhone/format cluster with the color dimension.** "Why HDR Video Looks Wrong After Compressing or Converting It" fits naturally here, benefiting from the codec article existing first (it can reference codec-level HDR metadata handling without re-explaining codecs from scratch).

**Phase 3 — Deepen the transcription cluster.** "How Automatic Speech Recognition Actually Works" stands alone reasonably well and doesn't strictly need anything else published first, so it can run in parallel with Phase 1 or 2 if publishing bandwidth allows, or slot in third.

**Phase 4 — Open the streaming/delivery topic.** "Why Streamed Video Looks Different From a Downloaded File" works best once the codec article exists, since it can reference multi-tier transcoding using codec vocabulary already established rather than introducing it cold.

**Phase 5 — Narrower, mechanism-specific pieces, as bandwidth allows.** The noise/grain article, the frame-rate article, and the audio-sync-drift article are all genuinely good but narrower in scope and lower in standalone urgency than Phases 1–4; they're best treated as a second wave that deepens existing clusters further once the highest-leverage gaps are closed. The lowest-priority items (the "4K" labeling piece, the lossless deep-dive, the old-file-obsolescence piece) are worth keeping on the list but are the ones most likely to need either a tighter angle or a longer wait before they clearly earn a place next to the site's strongest existing work.

Two topics from the "Recommended" list — the same-bitrate-different-quality piece and the screen-recording piece — are deliberately placed last/optional rather than into a numbered phase: both are legitimate topics, but both are also the ones most likely to drift into restating existing material if written carelessly, so they should only be commissioned once a writer is confident they can hold the tighter scope described above.
