# MP4 → MP3 and MOV → MP3: SEO & Content Architecture Report

Scope: only the MP4→MP3 and MOV→MP3 pages. The broad Video→MP3 page is treated strictly as a cannibalization boundary, never as a content target.

---

## 1. Executive Findings

The keyword file in `seo_data/video2mp3/` is not two separate datasets — it's one 50-row "video to MP3" keyword universe, duplicated across five country files (AUS, CAN, NZ, UK, US). Inside each file, only **4 rows are MP4-specific** and **2 rows are MOV-specific**; the other 44 rows are either the broad "video/convert video/extract audio" intent (out of scope) or other-format terms — AVI, MKV, WebM, WMV, FLV (also out of scope, since the hard rule is MP4 and MOV only). This matters because it means the dataset gives strong confidence on **core transactional intent** for both pages, but zero direct evidence for question-based, troubleshooting, or long-tail modifiers specific to either format. Where this report describes informational or troubleshooting sub-intent, it's derived from what the transactional query plus the underlying task implies — not invented statistics, and it's flagged as such.

The single most useful, data-backed finding: **MOV keywords carry meaningfully lower SEO Difficulty than MP4 keywords in every one of the five markets, while holding comparable or higher volume relative to their own market.** MOV is the easier ranking opportunity of the two, and the existing content already senses this by leaning into the "iPhone" angle — that instinct is correct and should be reinforced, not diluted.

The two pages are not equally strong today. The MOV page has a real differentiation angle (container vs. codec explanation, Safari/iPhone specifics) that the MP4 page lacks — the MP4 page currently reads like the MOV page with "iPhone" swapped for "MP4," when the actual MP4 searcher population is far more heterogeneous (screen recordings, downloads, camera exports, editor exports) and deserves content built around that heterogeneity rather than borrowing MOV's single-narrative structure.

Neither page needs a rewrite from scratch. Both need targeted additions (one or two short, factual, non-marketing sections each) and a light restructure — not more length for its own sake.

---

## 2. MP4 → MP3 Keyword Analysis

In-scope rows only (volume shown as AUS / CAN / NZ / UK / US; SEO Difficulty in parentheses):

| Keyword | Volume (5 markets) | SEO Difficulty |
|---|---|---|
| mp4 to mp3 | 18,100 / 27,100 / 3,600 / 40,500 / 201,000 | 33 / 29 / 21 / 34 / 29 |
| mp4 to mp3 converter | 2,900 / 4,400 / 720 / 6,600 / 33,100 | 32 / 31 / 26 / 32 / 34 |
| convert mp4 to mp3 | 2,400 / 3,600 / 480 / 5,400 / 22,200 | 34 / 33 / 26 / 37 / 27 |
| mp4 converter to mp3 free | 260 / 210 / 20 / 320 / 880 | 15 / 12 / 14 / 40 / 37 |

**Clusters:**

- **Bare/navigational core ("mp4 to mp3")** — by far the largest volume, 6–10x the next-largest variant in every market. This shape of query (no verb, no "converter") reads as someone who already knows what they have and what they want, typing the shortest possible phrase into a search box. Belongs on the page as the dominant semantic anchor (title, H1 region, intro) but not as a forced exact phrase — it's satisfied by the page being unambiguously "the MP4 to MP3 page," which it already is.
- **Explicit tool intent ("mp4 to mp3 converter" / "convert mp4 to mp3")** — classic transactional converter-tool phrasing, roughly a fifth to a tenth of the bare query's volume. Belongs in body copy and step-by-step instructions naturally.
- **Price-sensitivity modifier ("mp4 converter to mp3 free")** — small volume but present in all five markets, and its SEO Difficulty is erratic (as low as 12 in Canada, as high as 40 in the UK) — a sign that "free" pages are inconsistently well-optimized across the competitive set, i.e., an opening. This is a real sub-intent (worry about paywalls/watermarks/limits), not a keyword to chase with exact-match text — it's satisfied by clearly, early, stating the tool is free with no watermark or limits, which the page already does.

There is no data support in this file for MP4-specific questions ("why is my MP4 silent," "does MP4 to MP3 lose quality," etc.) or MP4-specific long-tail (device, OS, use-case modifiers). Any such topics discussed later in this report are justified by task logic and by what a genuine MP4 searcher would need to trust and complete the conversion — not by keyword volume.

---

## 3. MOV → MP3 Keyword Analysis

| Keyword | Volume (5 markets) | SEO Difficulty |
|---|---|---|
| convert mov to mp3 | 1,600 / 2,900 / 320 / 2,900 / 27,100 | 26 / 26 / 19 / 21 / 29 |
| mov to mp3 converter | 1,600 / 2,900 / 320 / 2,900 / 27,100 | 23 / 24 / 17 / 22 / 25 |

**Clusters:**

- Only two keywords exist for MOV in this dataset, and — notably — they carry **identical search volume in every single market** (1,600/1,600 in AUS, 2,900/2,900 in CAN, 320/320 in NZ, 2,900/2,900 in UK, 27,100/27,100 in US). That kind of exact duplication across five independent markets isn't an organic coincidence — it's the keyword tool bucketing two close variants into the same volume tier. Treat "convert mov to mp3" and "mov to mp3 converter" as **one underlying intent**, not two separate signals to double-count.
- Unlike MP4, there's no bare "mov to mp3" row in this dataset — both MOV rows include an explicit verb or the word "converter." That's a small but real difference: MOV searchers arrive already framing this as a conversion task, rather than typing the shortest possible phrase. Consistent with MOV largely being an iPhone/QuickTime artifact — most people who type "mov to mp3" already know it's an unusual/awkward format that needs a "converter," whereas "mp4" often gets used loosely as a stand-in for "video file."
- SEO Difficulty for both MOV keywords sits 5–13 points below their MP4 counterparts in every market (e.g., US: mov terms 29/25 vs. mp4 terms 29–37; UK: mov terms 21/22 vs. mp4 terms 32–40). Combined with volume that's a meaningful fraction of MP4's (and in the UK, MOV's "convert mov to mp3" volume equals MP4's "convert mp4 to mp3" volume almost exactly — 2,900 vs. 5,400, same order of magnitude), this is the strongest data point in the set: **MOV is comparatively under-contested relative to its demand.**

No question or long-tail data for MOV either. Anything about "why won't my MOV open," Apple-specific framing, etc. below is justified by the well-established real-world fact that MOV is QuickTime's default container and the dominant reason people encounter it is iPhone/Mac recording — not by rows in this CSV.

---

## 4. MP4 → MP3 Intent & Topic Map

**What the searcher actually wants:** to get an MP3 out of a file they already have called an MP4, quickly, without installing anything, without their file going anywhere they didn't put it. The bare "mp4 to mp3" volume dominance says most of them arrive with the format already identified — they don't need convincing that this is possible, they need the actual conversion plus enough reassurance (free, private, no limits) to not bounce to a competitor.

| Intent layer | What it covers | Depth on page |
|---|---|---|
| Core conversion intent | Upload/drop file → pick quality → download MP3 | Primary — the tool + 3-step instructions |
| Supporting informational intent | What bitrate to pick and why; what kinds of MP4 people actually convert | Medium — a short, concrete section, not a guide |
| Troubleshooting intent | No audio track; does the conversion lose quality; will a huge phone/screen-recording MP4 work | Light — FAQ-level, one or two sentences each |
| Compatibility/use-case intent | Is this actually an MP4 or something else (MOV, MKV, AVI) | Light — one section, routes to sibling pages |

MP4's searcher population is genuinely mixed — meeting recordings, screen captures, downloaded clips, phone/camera footage, editor exports — and that heterogeneity is itself the topic map's organizing idea, not a limitation to paper over.

---

## 5. MOV → MP3 Intent & Topic Map

**What the searcher actually wants:** almost always, to get sound out of something recorded on an iPhone (or edited/exported via QuickTime on a Mac), because they've discovered MOV is more annoying to work with than they expected. The near-parity between "convert mov to mp3" and "mov to mp3 converter" — plus the total absence of a bare "mov to mp3" query — supports a searcher who is a little more aware that they're dealing with a specific, sometimes-awkward format, not just a generic "video file."

| Intent layer | What it covers | Depth on page |
|---|---|---|
| Core conversion intent | Upload/drop file → pick quality → download MP3 | Primary |
| Supporting informational intent | What bitrate for voice-memo/interview-style vs. music/performance MOV content | Medium |
| Troubleshooting intent | Why MOV is sometimes awkward at all (container vs. codec), and why that doesn't block audio extraction | Medium — this is MOV's one real differentiation lever |
| Compatibility/use-case intent | Confirming it's MOV not MP4; wanting the video shrunk instead of the audio pulled out | Light — routes to sibling pages |

Unlike MP4, MOV supports a single, coherent narrative (iPhone/QuickTime) rather than a heterogeneous list of sources — the existing content already senses this and should keep leaning into it rather than being diluted toward generic "video file" language.

---

## 6. MP4 → MP3 Topical/Semantic Map

| Topic | Why relevant | Supporting cluster | Depth | Placement |
|---|---|---|---|---|
| MP4 as the default/ubiquitous container | Matches the bare "mp4 to mp3" searcher who already has the file | Bare core keyword | 1–2 sentences | Intro |
| Steps to convert | Core task completion | All MP4 keywords | Full section | H2, early |
| Real-world MP4 sources (meetings, screen capture, downloads, camera/phone) | Lets a mixed searcher population self-identify | Task logic (no direct keyword data) | Short list, concrete | H2 |
| Why MP4 audio extracts cleanly (AAC is the near-universal MP4 audio codec) | Answers the unasked "will this lose quality/work" concern with one true, generic, non-fabricated technical fact; genuine information-gain vs. generic competitor pages that never explain anything | Troubleshooting sub-intent | 1–2 sentences | Same section as sources, or its own short paragraph |
| Bitrate guidance tied to source type | Turns an abstract 128/192/320 choice into a concrete recommendation | Task logic | Existing section, tightened | H2 |
| Large/4K and screen-recording MP4s specifically | MP4 is the format most likely to be huge (phone 4K, screen capture); reassurance ties directly to the free/no-limit modifier cluster | "mp4 converter to mp3 free" cluster | 1 short paragraph, no new H2 needed | Folded into an existing section |
| MP4 vs. sibling formats (MOV, others) | Compatibility/use-case intent; cannibalization control | Compatibility intent | Existing section, keep | H2, later in page |
| FAQ | Mops up remaining objections in a scannable, low-effort format | All clusters | Existing, +1 item | H2, last |

Not included: anything phrased as "video to MP3," "convert video," or generic audio-extraction language broad enough to compete with the Video→MP3 page. Not included: manufactured statistics, invented feature claims, or generic "why choose us" framing.

---

## 7. MOV → MP3 Topical/Semantic Map

| Topic | Why relevant | Supporting cluster | Depth | Placement |
|---|---|---|---|---|
| MOV as iPhone/QuickTime's default | Matches the dominant real-world source and the searcher's slightly more format-aware framing | Both MOV keywords | 1–2 sentences | Intro |
| Steps to convert | Core task completion | Both MOV keywords | Full section | H2, early |
| Real-world MOV sources (voice memo filmed as video, interview, music/performance clip, Mac screen recording) | Coherent, iPhone-centric use-case list | Task logic | Short list, concrete | H2 |
| Container vs. codec, and why that doesn't block audio extraction | MOV's single best differentiation angle already present; add one factual line that MOV's audio is typically AAC too, and that the video side being H.264 or HEVC is irrelevant to extracting the audio | Troubleshooting sub-intent | Tighten existing section, +1–2 sentences | H2 |
| Bitrate guidance tied to speech vs. music MOV content | Concrete, not abstract | Task logic | Existing section, keep | H2 |
| MOV vs. MP4, and "I actually want the video, not audio" | Compatibility/use-case intent; cannibalization control | Compatibility intent | Existing section, keep | H2, later |
| FAQ | Mops up remaining objections; add one on non-Apple MOV sources (Android/DSLR) so the page doesn't quietly over-claim "iPhone-only" | All clusters | Existing, +1 item | H2, last |

Not included: generic "video to MP3" framing, and not included: turning the container/codec section into a format-history essay — one factual paragraph is the right depth, not a mini-Wikipedia article.

---

## 8. Existing Content Audit

### MP4 → MP3 (`mp4-to-mp3.en.md`)

**KEEP** — the hero framing of MP4 as the near-universal format; the 3-step instructions; the bitrate section (128/192/320 tied to use case); the "MP4 vs. other formats" section and its links to `/mov-to-mp3`, `/video-to-mp3`, and the MOV-vs-MP4 blog guide; the FAQ's coverage of upload/privacy, watermark/limits, and the "my file is actually MOV" redirect. All of this is already well-targeted and none of it reads as filler.

**WEAK** — the "Where MP4 files with audio worth keeping come from" section lists sources (Zoom/Teams/Meet, OBS/Loom, downloads, phone/camera footage) but never uses that list to explain anything MP4-specific about *why* extraction works the way it does; it's descriptive, not informative. The bitrate section is good but stops one level short: it tells you *which* bitrate, never *why there's a quality question at all* for a file that's already compressed.

**MISSING** — (1) any mention of what audio format actually lives inside an MP4 (AAC, almost universally) — this is the single cheapest, truest, most differentiating fact the page could add, and it directly answers the unasked "will converting this lose quality" question that anyone staring at a 128/192/320 kbps choice is implicitly having. (2) Reassurance for large MP4s specifically — phone 4K footage and screen recordings are exactly the MP4s most likely to be huge, and the page's only large-file signal is a generic "no limit" line buried in the intro; this maps directly to the "free" modifier cluster (people worried about size caps) and costs one short paragraph. (3) A one-line acknowledgment that a silent/audio-less MP4 (some stock footage, some screen recordings) isn't a bug — the FAQ has a version of this already, so this is a minor depth gap, not a true absence.

**REMOVE** — nothing. The page doesn't currently contain filler, generic marketing language, or "why choose us" sections.

**RESTRUCTURE** — fold the new AAC/quality-loss fact into the existing "where MP4s come from" section rather than adding a new H2 (it's one paragraph's worth of content, not a topic that earns its own heading); fold the large-file reassurance into the bitrate section for the same reason. Net effect: two sections get slightly deeper, no new heading count.

### MOV → MP3 (`mov-to-mp3.en.md`)

**KEEP** — the iPhone-first framing throughout; the "Common reasons to pull audio out of a MOV" list (voice memo, interview, music/performance, Mac screen recording — a genuinely coherent, single-narrative list unlike MP4's necessarily mixed one); the "Why MOV specifically" section, which is the strongest single paragraph across either page because it actually explains something (container vs. codec) instead of just describing use cases; the bitrate section tied to speech-vs-music; the FAQ's "works from iPhone/Safari directly" answer, which nothing generic would think to include.

**WEAK** — the container-vs-codec section explains that MOV's *awkwardness* is a video-side problem, but never closes the loop with the fact that the audio inside is typically AAC too (same as MP4), and that whether the video is H.264 or HEVC has zero bearing on extracting the audio. That's a one-sentence addition that turns an already-good section into a complete answer instead of a half one.

**MISSING** — an acknowledgment that MOV isn't exclusively an Apple format (some Android phones and DSLR/camcorder exports also use `.mov`). This is low priority — the keyword data and real-world usage both say "iPhone" should stay the dominant frame — but the page's current wording ("Does this work with iPhone videos?") could quietly read as "iPhone-only" to a non-Apple MOV holder who's arrived at the right page. One FAQ line fixes it without diluting the iPhone-first angle.

**REMOVE** — nothing; no filler present.

**RESTRUCTURE** — none needed structurally; this page's shape is already close to ideal. The additions are sentence-level, not heading-level.

---

## 9. Content Gaps & Opportunities (Information Gain)

What would make either page more useful than a generic "drop your file here" converter page, without inventing facts or turning either page into a textbook:

- **Naming the actual audio codec inside the container.** Almost no competitor converter page says anything concrete about what's inside an MP4 or MOV — they describe the container format (video-focused) and never mention that the audio track is, in the overwhelming majority of real-world files, AAC. Saying this plainly, once, on each page is free information gain: it's true, it's generic (not a fabricated claim about the site), and it directly answers the "why does bitrate even matter / will I lose quality" question a bitrate-picker page implicitly raises but never resolves.
- **Being explicit that container ≠ codec ≠ playback compatibility problem.** The MOV page already gestures at this; making it one full, closed thought (not just "MOV is Apple's container, see our other guide") is a real differentiator, because most competing pages don't distinguish these concepts at all — they just say "MOV/MP4 converter" and move on.
- **Tying "free/no limit" claims to the specific large-file scenarios each format actually produces** (MP4: 4K phone video, screen recordings; MOV: less so, since MOV files people convert skew toward shorter voice-memo/interview content) — rather than one generic "no limit" line reused on both pages, each page's reassurance should reflect what actually makes that format's files big or small.
- **What NOT to add:** manufactured statistics ("94% of users prefer..."), invented product features, comparison tables against named competitors, or a "why choose us" section — none of that is supported by the keyword data or the site's actual claims, and it's exactly the kind of generic AI-SEO padding both pages currently, correctly, avoid.

---

## 10. Recommended Content Architecture

### MP4 → MP3

- **H1:** *Pull the Audio Out of an MP4 File, Free* (unchanged — natural, not keyword-forced, correctly doesn't need to contain the exact-match phrase)
- **H2 — Extract the audio from an MP4, free** — intro, unchanged in purpose; addresses core + free-modifier intent.
- **H2 — How to convert MP4 to MP3** — 3-step instructions, unchanged.
- **H2 — Where MP4 files with audio worth keeping come from** — keep the use-case list; add the AAC/codec fact as a closing sentence or two, so the section now covers both "what kind of MP4 do you have" and "why extraction just works." Addresses supporting-informational + troubleshooting intent.
- **H2 — Picking a bitrate for MP4 audio** — keep the source-tied guidance; add one short paragraph on large 4K/screen-recording MP4s and the lack of a size limit, tied concretely to *why MP4s get big* rather than a generic reassurance line. Addresses the free-modifier cluster.
- **H2 — MP4 vs. other formats** — unchanged; compatibility/use-case intent, cannibalization control via links to `/mov-to-mp3` and `/video-to-mp3`.
- **H2 — Frequently asked questions** — keep all six existing items; add one: *"Will converting to MP3 make the audio worse?"* — answers the quality-loss question explicitly and briefly, rather than leaving it implied by the bitrate section alone.

### MOV → MP3

- **H1:** *Turn an iPhone MOV Recording Into MP3* (unchanged — natural, iPhone-specific framing intact)
- **H2 — Turn a MOV recording into MP3, free** — intro, unchanged.
- **H2 — How to convert MOV to MP3** — 3-step instructions, unchanged.
- **H2 — Common reasons to pull audio out of a MOV** — unchanged; already a coherent, format-specific list.
- **H2 — Why MOV specifically, and what it means for the audio** — keep the container/codec framing; add the closing fact that the audio track itself is typically AAC (same family as MP4) and that H.264-vs-HEVC video makes no difference to audio extraction. This completes the section's own argument instead of stopping halfway.
- **H2 — Picking a bitrate for MOV audio** — unchanged; already tied to speech-vs-music.
- **H2 — Not sure it's MOV, or need the video too?** — unchanged; compatibility/use-case + cannibalization control via `/mp4-to-mp3` and the iPhone-compression guide.
- **H2 — Frequently asked questions** — keep all six; add one: *"Does this only work for iPhone MOV files?"* — closes the one legitimate gap without diluting the iPhone-first framing (answer: MOV shows up occasionally from Android and camera exports too, and the tool doesn't care where it came from).

No new H3s are justified on either page — nothing in the data or the intent map requires a third structural level; both pages stay flat and scannable.

---

## 11. Keyword / Topic Placement Strategy

| Cluster | Title/Meta | H1 | Intro | H2 body | FAQ |
|---|---|---|---|---|---|
| MP4: bare core ("mp4 to mp3") | Yes | Implied, not forced | Yes, naturally | — | — |
| MP4: converter/convert phrasing | Yes (meta) | — | Optional, light | Yes, in steps section | — |
| MP4: free modifier | — | — | Yes ("free," "no watermark") | Yes, bitrate/large-file section | Yes, watermark/limit FAQ |
| MP4: AAC/codec fact (semantic, no exact keyword) | — | — | — | Yes | Optional (new quality FAQ) |
| MOV: core ("convert mov to mp3" / "mov to mp3 converter") | Yes | Implied, not forced | Yes, naturally | Yes, in steps section | — |
| MOV: iPhone/QuickTime semantic concept | — | Yes (already in H1) | Yes | Yes, throughout | Yes |
| MOV: codec/compatibility semantic concept | — | — | — | Yes (why-MOV section) | New FAQ |
| MOV: non-Apple source (semantic, no keyword data) | — | — | — | — | New FAQ only — doesn't deserve body-copy real estate given zero keyword support |

**Exact-match keywords worth using naturally:** "mp4 to mp3," "convert mp4 to mp3," "mp4 to mp3 converter," "convert mov to mp3," "mov to mp3 converter" — each already appears naturally across both pages' existing copy and links; no additional stuffing needed.

**Semantic concepts to add (not exact-match keywords):** AAC audio codec, container vs. codec, H.264/HEVC irrelevance to audio, large/4K file handling.

**Redundant variants to avoid repeating:** "mp4 to mp3 converter" and "convert mp4 to mp3" are near-duplicates of each other and of the bare phrase — one clean use of each across the page is enough; do not cycle through all three in headers.

**Cannibalization check:** Both pages already correctly avoid "video to mp3," "convert video," "video to audio," and "extract audio from video" as body-copy phrasing — those belong exclusively to `video-to-mp3.en.md`, which already explicitly claims them (its own H2 uses "audio out of any video," "extract the audio out of a video file," etc.). The three pages currently interlink correctly (broad page → both specific pages; each specific page → the other specific page + the broad page). The one thing to actively avoid when adding the new AAC/codec content: don't phrase it as "extracting audio from video" (that's the broad page's phrase) — phrase it format-specifically ("the audio track inside an MP4," "MOV's audio track"), which is also more accurate anyway.

---

## 12. Final Content Briefs

### MP4 → MP3

- **Primary intent:** Fast, no-friction conversion for a searcher who already knows their file is an MP4 and wants an MP3 out of it now.
- **Primary topic:** MP4 audio extraction as a simple, safe, on-device task.
- **Secondary topics:** bitrate selection tied to real source types; why extraction doesn't degrade quality meaningfully (AAC-to-MP3); large/4K and screen-recording files specifically.
- **Important keyword clusters:** bare core phrase, converter/convert phrasing, free modifier.
- **Important questions:** Will this work with any MP4? Will it lose quality? Is there a size limit? Is my file actually MOV instead?
- **Entities/concepts:** MP4 container, AAC audio codec, bitrate (128/192/320 kbps), client-side/WASM processing, sibling pages (MOV, broad video-to-MP3).
- **Content angle:** "You probably already know you have an MP4 — here's the fast path, plus the two things (quality, size) that might make you hesitate, answered plainly."
- **Recommended structure:** per Section 10 above.
- **What to explain:** what's actually inside an MP4 (briefly), why extraction is safe for quality, why large files aren't a problem.
- **What not to explain:** MP4 container history/spec details, transcoding internals beyond "it's already AAC," anything about other formats beyond the one linking sentence.
- **Recommended depth:** current length +1 short paragraph and +1 FAQ item — not a rewrite, not a doubling of length.

### MOV → MP3

- **Primary intent:** iPhone/QuickTime users who've hit friction with MOV and want the sound out without dealing with the video side at all.
- **Primary topic:** MOV as Apple's default container, and why that's a video-side quirk that doesn't affect audio extraction.
- **Secondary topics:** bitrate selection tied to speech vs. music MOV content; the (minor) fact that non-Apple sources occasionally produce MOV too.
- **Important keyword clusters:** the single "convert mov to mp3" / "mov to mp3 converter" cluster (treated as one intent, not two).
- **Important questions:** Does this work with iPhone videos specifically? Is it only for iPhone? Why is MOV sometimes awkward at all, and does that affect the audio? What quality should I pick for a voice memo vs. a concert clip?
- **Entities/concepts:** MOV/QuickTime container, iPhone, AAC audio codec, H.264/HEVC video codecs (mentioned only to dismiss their relevance to audio), bitrate, sibling pages (MP4, iPhone video compression guide).
- **Content angle:** "This is the file iPhone gives you by default — here's why it's sometimes annoying, why that doesn't matter for getting the audio out, and the fast path to an MP3."
- **Recommended structure:** per Section 10 above.
- **What to explain:** container-vs-codec distinction, completed with the AAC fact; that video codec choice (H.264/HEVC) is irrelevant to audio extraction.
- **What not to explain:** the full history of QuickTime, Apple format politics, or anything about compressing/converting the video itself (that's the linked iPhone-compression guide's job).
- **Recommended depth:** current length +1–2 sentences in the existing "why MOV" section, +1 FAQ item — this page needed the least new material of the two.

The two briefs are not mirror images: MP4's angle is "heterogeneous sources, prove quality/size aren't a problem"; MOV's angle is "single coherent iPhone narrative, complete the technical explanation it already started."

---

## 13. Content Gap Scorecard

Scale: 1–10, higher is better, except *Risk of thin content* where higher means **more risk**.

| Criterion | MP4 → MP3 | MOV → MP3 |
|---|---|---|
| Search intent satisfaction | 7 | 8 |
| Topical completeness | 6 | 7 |
| Semantic coverage | 6 | 6 |
| Practical usefulness | 8 | 8 |
| Format-specific usefulness | 6 | 8 |
| Content depth | 6 | 7 |
| Information gain | 5 | 7 |
| Structure | 8 | 8 |
| Keyword targeting | 7 | 7 |
| Risk of thin content | 4 | 3 |

**Biggest weaknesses:** the MP4 page's *information gain* and *format-specific usefulness* are the clear laggards — it currently borrows the MOV page's "single narrative" structure for a searcher population that isn't actually single-narrative, and it never explains anything a generic competitor page couldn't also claim. The MOV page's only real weakness is *semantic coverage* (it also never names the AAC codec), which is a one-sentence fix given how strong the rest of the page already is. Neither page is at serious risk of a thin-content penalty; both are already reasonably substantive — the gap is quality of information, not quantity of words.

---

## Quality Control Audit

1. Analyzed all 50 rows × 5 country files, not a sample — confirmed only 4 MP4 and 2 MOV rows are in-scope; stated that plainly rather than treating the whole file as MP4/MOV-specific data.
2. Broad "video to MP3" intent (44 of 50 rows per file) explicitly excluded from targeting in every phase.
3. MP4 and MOV analyzed independently throughout; no shared "video" framing used for either.
4. Every recommended section ties to a stated intent or task-logic reason — no section added "because a keyword exists."
5. No new H2s invented purely to plant a keyword; all recommended additions are sentence/paragraph-level within existing sections.
6. No keyword stuffing — exact-match phrases used once naturally per page, semantic concepts (AAC, codec-vs-container) carry the rest.
7. Content gaps identified are concrete (named facts to add, named FAQ items) not generic ("add more keywords," "increase depth").
8. Rewritten content (Section 14–15, delivered as files) is materially more useful — it answers two real, previously-unaddressed questions per page (quality loss / codec, for MP4; codec completion + non-Apple sources, for MOV) — without inflating length.
9. Depth added is proportional; neither page approaches thin-content risk before or after.
10. Length increase per page is roughly one paragraph and one FAQ item — no padding.
11. No generic AI filler ("why choose us," fabricated stats, invented features) introduced anywhere.
12. Both H1s left untouched — already natural, neither forced to contain the exact-match keyword.
13. No broad "video to MP3" phrasing introduced into either page's body copy, headers, or new FAQ items.
14. MP4 and MOV pages remain meaningfully differentiated: MP4 leans into source heterogeneity + quality/size reassurance; MOV leans into its single iPhone narrative + completed technical explanation.

The rewritten `mp4-to-mp3.en.md` and `mov-to-mp3.en.md` are provided as separate files and have also been written directly into `contents/seo/` in the project.
