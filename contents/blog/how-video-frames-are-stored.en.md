---
title: "What's Actually Inside a Video File: I-Frames, P-Frames and Why Editing Forces a Re-Encode"
description: A video file isn't a stack of complete pictures — most frames only store what changed. Here's how that structure explains seeking, trimming, and why some extracted stills look worse than others.
date: 2026-09-11
excerpt: Pause a video and the frame on screen looks sharp. Extract that exact same frame as a still image and it can look blockier than you expected — the reason has nothing to do with your screen.
---

# What's Actually Inside a Video File: I-Frames, P-Frames and Why Editing Forces a Re-Encode

<p class="byline">September 11, 2026 · SquishyFile Team</p>

<section>

## A video isn't a stack of photos

<p>It's a reasonable thing to assume: a video is basically a folder of individual pictures, shown one after another fast enough that they look like motion. That's true of the raw sensor data coming off a camera for a fraction of a second, but it's not true of the file that actually gets saved. Storing every single frame as a complete, independent image would make video files enormous — tens of times larger than what a phone or camera actually produces — so encoders do something smarter than that, and understanding what they do explains a handful of otherwise confusing behaviors: why seeking to an exact timestamp sometimes lands on the wrong-looking frame, why trimming "just one second" off a clip usually means re-encoding the whole thing, and why a still you extract from a video can look noticeably worse than the same moment looked during normal playback.</p>

</section>

<section>

## Three kinds of frame, not one

<p>Most video codecs — H.264, HEVC, AV1, and the older formats before them — split frames into three categories, and only one of them is a genuinely complete picture.</p>

<h3>I-frames (intra-coded)</h3>
<p>An I-frame, also called a keyframe, is a full, independent image — everything the encoder needs to draw that frame is contained in that frame alone, with no reference to any other frame in the video. This is the closest thing to "just a photo" that exists inside a video file, and it's also the most expensive frame type to store, since it can't lean on anything nearby to save space.</p>

<h3>P-frames (predicted)</h3>
<p>A P-frame doesn't store a full picture. It stores the <em>difference</em> from the frame before it — which pixels moved, which stayed the same, and by how much. If a scene is mostly static except for someone talking, a P-frame might only need to describe the small region around their mouth, because everything else is close enough to the previous frame that re-describing it from scratch would be wasted data. This is the majority of frames in almost any video.</p>

<h3>B-frames (bi-directional)</h3>
<p>A B-frame goes a step further and predicts from frames on <em>both</em> sides — the one before and the one after. That sounds backwards (how can a frame reference something that hasn't been decoded yet?), but the encoder processes frames out of playback order internally specifically to make this possible. B-frames are usually the cheapest frame type to store, because they have the most material to predict from.</p>

<p>None of this is a hidden implementation detail you're expected to know about day to day — it's genuinely invisible during normal playback, because your video player reconstructs everything back into the right order and fills in every frame before showing it to you. It only starts to matter the moment you try to do something more surgical than watching the video straight through: seeking to an exact point, pulling out a single frame, or cutting a clip somewhere in the middle.</p>

</section>

<section>

## A group of pictures, and why it has a length

<p>Encoders organize frames into repeating units called a GOP — a Group of Pictures — which starts with an I-frame and is followed by a run of P-frames and B-frames that all predict, directly or indirectly, from that one keyframe. A typical GOP might run somewhere between half a second and a few seconds of video before the next fresh I-frame appears and the cycle starts over.</p>

<p>GOP length is a real trade-off, not an arbitrary number. A longer GOP means fewer expensive I-frames per second of video, which makes the file smaller for the same visual quality — but it also means every P-frame and B-frame inside that stretch is now several steps removed from the one complete picture the whole segment is built on, which is exactly the mechanism behind the next two sections.</p>

</section>

<section>

## Why seeking sometimes lands on the "wrong" frame

<p>When you drag a video's scrubber to an exact timestamp, the player has to produce a complete image at that moment — but if that timestamp falls on a P-frame or B-frame, the player can't just decode that one frame in isolation, because it was never stored as a complete picture. It has to find the nearest preceding I-frame and decode forward through every predicted frame in between to reconstruct the one you actually asked for.</p>

<p>Some tools take a shortcut instead of doing that work: rather than decoding forward from the nearest keyframe, they simply jump to the nearest I-frame itself and show you that, which is why dragging a scrubber can sometimes visibly "snap" to a slightly different moment than where you released it, especially in a long GOP where I-frames are sparse. This isn't a bug so much as a genuine cost trade-off — decoding forward through several seconds of predicted frames for pixel-perfect seeking accuracy is real computational work, and plenty of software opts for the faster, slightly less precise version instead.</p>

</section>

<section>

## Why an extracted still can look worse than the video did during playback

<p>This is the one that catches people off guard using a tool like <a href="/frame-extractor">SquishyFile's frame extractor</a>: you pause a video, the frame looks sharp on screen, but the still image you extract and download looks softer or blockier than what you remember seeing.</p>

<p>The explanation is the same frame structure. If the exact frame you extracted is a P-frame or B-frame rather than an I-frame, it was never a self-contained, fully detailed image to begin with — it's a set of differences layered on top of whatever came before it. During normal playback, your eye and brain are seeing a fast sequence of frames, and any softness in one predicted frame gets smoothed over by the frames around it and by how quickly each one is replaced. Isolate that exact same frame as a static image, though, and there's nothing to smooth it over with — you're looking directly at a frame that was only ever meant to describe a change, not stand on its own.</p>

<p>This is also part of why fast motion tends to produce rougher extracted stills than a calmer scene at the same moment: a P-frame following a burst of motion has to describe a lot of change at once, which is exactly the kind of frame an encoder is most willing to compress hard, on the reasonable assumption that a viewer blazing past it during playback won't scrutinize it. Extracted as a still, that assumption no longer holds — you're scrutinizing exactly the frame the encoder bet you wouldn't.</p>

<p>The practical takeaway: if a specific frame you need looks unexpectedly rough, try nudging to a slightly different position a few frames away. You're not choosing a "better moment" so much as increasing the odds of landing on a frame the encoder treated as more self-sufficient in the first place.</p>

</section>

<section>

## Why trimming "just one second" still means re-encoding everything

<p>This is the frame-structure fact with the biggest practical consequences, and it's the mechanism behind a step that <a href="/blog/how-many-times-can-you-compress-a-video">our guide to repeated compression</a> mentions but doesn't fully explain: why editing software almost always re-encodes an entire clip, even for a trim that only touches one end of it.</p>

<p>Cutting a video at an arbitrary point means cutting in the middle of a GOP more often than not, since GOPs are a fixed rhythm of the encoding, not something that lines up with wherever you happen to want to trim. If your cut point falls on a P-frame, that frame is referencing earlier frames that no longer exist on the other side of your cut — there's nothing left for it to predict from. The only way to produce a valid, playable file from that point forward is to decode everything and re-encode it fresh, generating new I-frames and new predicted frames that don't depend on anything you removed.</p>

<p>Some editing tools can avoid this in one specific case: if your cut points happen to land exactly on existing I-frames, the software can perform what's called a stream copy or remux — reassembling the file at the container level without touching the actual picture data, since every remaining frame already stands on solid ground. This is fast and perfectly lossless, but it only works when you get lucky with where the keyframes already are, which is rarely something a casual edit controls for. The moment your desired cut point falls between keyframes — which is most of the time — a full re-encode is the only option, and that re-encode is a genuine additional lossy pass on top of whatever compression already happened to the file, exactly the kind of compounding loss described in our piece on <a href="/blog/how-many-times-can-you-compress-a-video">how repeated compression adds up</a>.</p>

</section>

<section>

## What this explains, all together

<div class="table-wrap">
<table class="spec-table">
<thead><tr><th>Behavior</th><th>What's actually happening</th></tr></thead>
<tbody>
<tr><td>Scrubbing snaps to a slightly different moment</td><td>The player jumped to the nearest I-frame instead of decoding forward from it</td></tr>
<tr><td>An extracted still looks rougher than expected</td><td>The exact frame you landed on was a P-frame or B-frame, not a self-contained image</td></tr>
<tr><td>A one-second trim re-encodes the whole file</td><td>The cut point fell inside a GOP, breaking frames that predicted from what got removed</td></tr>
<tr><td>Some trims are instant with no quality loss</td><td>The cut happened to land exactly on existing I-frames, allowing a lossless remux</td></tr>
<tr><td>A calm scene extracts a cleaner still than a fast-motion one</td><td>Encoders compress predicted frames harder around motion, betting a viewer won't pause exactly there</td></tr>
</tbody>
</table>
</div>

</section>

<section>

## Why this isn't a flaw in the format

<p>None of this is video compression falling short of some better alternative — it's the entire reason video files are a practical size at all. Storing every frame as an independent, full-detail image the way I-frames work would make a two-minute clip roughly as large as storing two minutes' worth of separate photographs, which nobody's phone, camera, or upload limit could comfortably handle. The predicted-frame system is what makes a full-length video fit in a few hundred megabytes instead of tens of gigabytes, and the trade-off — some frames being cheaper and less self-sufficient than others — is the deliberate cost of that efficiency, not an accident.</p>

<p>Knowing it exists mostly changes what you expect rather than what you do differently day to day. It explains why a frame extractor occasionally needs a small nudge to land somewhere better, why a "quick trim" isn't always as quick or lossless as it sounds, and why two seemingly identical editing operations on two different videos can behave completely differently depending on where the keyframes happened to fall.</p>

</section>

<section id="faq">

## Frequently asked questions

<div class="faq-grid">
<div class="faq-card"><h3>Is an I-frame the same thing as a keyframe?</h3><p>Yes — the terms are used interchangeably. Both refer to a complete, independently decodable frame that doesn't rely on any other frame in the video.</p></div>
<div class="faq-card"><h3>Why does my video editor take so long to export a simple trim?</h3><p>Unless your cut points happen to land exactly on existing keyframes, the editor has to decode and re-encode the entire clip to produce a valid file, not just the part you removed. That re-encoding is where most of the export time goes.</p></div>
<div class="faq-card"><h3>Can I control where the keyframes are before I trim a video?</h3><p>Not in most everyday tools — keyframe placement is decided by the encoder when the video was originally created, based on GOP length settings you typically don't see or control. Professional editing software sometimes exposes this, but it's not something a casual trim can rely on.</p></div>
<div class="faq-card"><h3>Why does a frame I extract sometimes look better if I move forward or back a few frames?</h3><p>You're likely moving from a heavily compressed predicted frame to one the encoder treated as more self-sufficient — often, though not always, closer to a keyframe. There's no reliable way to tell which frame is which without technical tools, so trying a few nearby positions is the practical approach.</p></div>
<div class="faq-card"><h3>Does a longer GOP mean worse quality?</h3><p>Not directly — it mainly means a smaller file for the same quality level, since fewer expensive I-frames are needed. The trade-off shows up in editing and seeking precision, not in playback quality, which is why GOP length is invisible during normal viewing.</p></div>
<div class="faq-card"><h3>Does this affect SquishyFile's frame extractor specifically?</h3><p>Yes, in the sense that any tool extracting a still from a video is subject to this — the extracted frame is only ever as detailed as however that specific frame was encoded. If a still comes out softer than expected, trying a slightly different timestamp is the most reliable fix.</p></div>
<div class="faq-card"><h3>Does re-encoding during a trim always make the video look worse?</h3><p>It's an additional lossy pass, so in principle yes, though a light setting keeps the difference hard to notice on most footage — see our <a href="/blog/how-many-times-can-you-compress-a-video">guide to repeated compression</a> for how that loss compounds and how to minimize it.</p></div>
</div>

</section>
