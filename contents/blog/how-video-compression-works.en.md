---
title: "Video Compression Explained: CRF, Bitrate and Resolution"
description: What a compression slider is actually doing when you drag it, in plain language — CRF, bitrate and resolution, and how the three interact.
date: 2026-09-04
excerpt: "Compression level" is doing three different jobs at once behind one slider — here's what each one actually changes about your video.
---

# Video Compression Explained: CRF, Bitrate and Resolution

<p class="byline">September 4, 2026 · SquishyFile Team</p>

<section>

## The slider is hiding three separate decisions

<p>Every video compressor has some version of the same control — a slider from "smallest file" to "best quality," or a set of presets like Light, Balanced and Max squish. It's simple to use, which is the point, but it's also quietly making three different technical decisions on your behalf every time you move it: how much detail to discard per frame, how many bits per second to spend on the whole video, and whether to shrink the picture itself. Understanding what each one actually does makes it a lot easier to tell why two videos compressed to a similar file size can look completely different, and why "quality" settings sometimes behave in ways that seem to defy the number on the slider.</p>

</section>

<section>

## CRF: how much detail gets thrown away per frame

<p>CRF stands for Constant Rate Factor, and it's the setting most "quality" or "compression level" sliders are actually controlling under the hood. Rather than targeting a specific file size, CRF tells the encoder how much detail it's allowed to discard, frame by frame, based on what's least likely to be noticed. A lower CRF number means less is thrown away — closer to the source, bigger file. A higher CRF number means more gets discarded — smaller file, more visible quality loss once you push it far enough.</p>

<p>What makes CRF genuinely clever is that it's not throwing away detail uniformly. Encoders are built around models of what the human eye is bad at noticing — fine texture in grass or fabric, subtle gradients in a sky, motion blur during a fast pan — and they spend fewer bits preserving those areas first, since a viewer is unlikely to consciously register the loss. A flat, static shot of a whiteboard or a slide deck compresses extremely well at a given CRF because there's very little the encoder needs to work to preserve in the first place; a handheld shot of moving water or a crowd compresses far less efficiently at the same CRF, because there's constant fine detail and motion the eye actually does notice going soft.</p>

<p>This is also why "Light," "Balanced" and "Max squish" style presets exist instead of asking you to type a raw CRF number — the useful range for looking acceptable is fairly narrow, and most people would rather pick from three sensible options than guess at a number between 0 and 51.</p>

</section>

<section>

## Bitrate: the budget CRF is actually spending

<p>Bitrate is how many bits of data the video uses per second of playback, and it's the more direct lever on file size: a two-minute video at 5 megabits per second is going to land close to a predictable size, while the same video at 1 megabit per second will be roughly a fifth as large, whatever CRF setting produced it. CRF and bitrate aren't two competing settings so much as two ways of describing the same underlying trade-off — a CRF-based encode doesn't have a fixed bitrate target, it lets the bitrate vary scene by scene, spending more where there's a lot of motion or detail to preserve and less where there isn't.</p>

<p>This variability is exactly why a target-size feature — entering "25MB" directly instead of picking a quality level — needs a different approach than CRF alone. To hit a specific size, the encoder has to work backward from your target: total size in bits, divided by the video's length in seconds, gives a target average bitrate, and the encoder then has to hold roughly to that average across the whole video rather than letting it vary freely by scene the way a pure CRF pass would. That's a real trade-off — a video with one especially complex scene has less room to spend extra bits there, so it's more likely to be the visibly weaker moment in an otherwise fine result.</p>

</section>

<section>

## Resolution: the setting people underuse

<p>Resolution — how many pixels wide and tall the video actually is — is the one lever people reach for least, even though it's often the most effective for a genuinely oversized file. Every pixel in every frame needs some amount of data to describe, so cutting resolution in half doesn't just make the video smaller on screen, it roughly quarters the raw amount of picture data the encoder has to work with in the first place, before CRF or bitrate settings even come into play.</p>

<p>This matters most for footage that's higher resolution than where it's actually going to be watched. A 4K screen recording that's only ever going to be viewed inside a chat app on a phone screen is carrying resolution nobody will benefit from — downscaling to 1080p before compressing, rather than compressing the full 4K frame down to a small file size, usually produces a visibly sharper result at the same final file size, because the encoder is spending its bit budget on fewer, more meaningful pixels instead of stretching thin across four times as many.</p>

</section>

<section>

## How the three interact in practice

<div class="table-wrap">
<table class="spec-table">
<thead><tr><th>Setting</th><th>What it controls</th><th>When to reach for it</th></tr></thead>
<tbody>
<tr><td>CRF / compression level</td><td>How much per-frame detail is discarded</td><td>Everyday adjustments — the default lever for most compression jobs</td></tr>
<tr><td>Bitrate / target size</td><td>The overall data budget for the whole video</td><td>When you have a hard size limit to hit, like an email or Discord cap</td></tr>
<tr><td>Resolution</td><td>How many pixels there are to compress in the first place</td><td>When the source is much higher-res than where it'll actually be watched</td></tr>
</tbody>
</table>
</div>

<div class="space"></div>
<p>In practice, the biggest wins come from using more than one of these together rather than pushing a single one to its limit. Taking a 4K screen recording all the way down to a tiny file using CRF alone means an extremely aggressive setting that visibly degrades even simple content; downscaling to 1080p first and then applying a moderate CRF gets to a similar file size with noticeably less visible damage, because the resolution change did some of the size reduction for free, without costing any perceptual quality at all — nobody was going to see those extra pixels anyway.</p>

</section>

<section>

## Why "lossless" isn't really on the table here

<p>True lossless video compression exists as a technical category, but it barely reduces file size at all — a few percent, similar to zipping a folder — because it has to preserve every single bit of the original exactly. Anything that meaningfully shrinks a video is, by definition, throwing some information away; the goal isn't avoiding that, it's making the loss land somewhere the eye won't register at normal viewing size. A "Light" compression setting isn't lossless, it's just conservative about where it spends its losses, which is a more honest way to think about what "compress without losing quality" actually means in practice — quality loss that's real but invisible, rather than loss that isn't happening at all.</p>

</section>

<section id="faq">

## Frequently asked questions

<div class="faq-grid">
<div class="faq-card"><h3>Is a lower CRF always better?</h3><p>Only up to the point of diminishing returns — below a certain CRF, the file gets larger without a visible quality improvement, because the encoder is already preserving more detail than the eye can register at normal viewing size.</p></div>
<div class="faq-card"><h3>Why does the same compression setting produce very different file sizes for two different videos?</h3><p>CRF targets a quality level, not a size — a static, low-detail video needs far fewer bits to hit the same quality bar than a busy, high-motion one, so the resulting file sizes can differ a lot even at an identical setting.</p></div>
<div class="faq-card"><h3>Does changing resolution alone hurt quality?</h3><p>Downscaling reduces the pixel count, which is a real quality change on a large screen, but at normal viewing sizes — a phone screen, a chat window — the difference between a well-compressed 1080p file and the same content forced into a huge 4K file is often not visible at all, while the file size difference is significant.</p></div>
<div class="faq-card"><h3>Should I use target size or compression level for everyday sharing?</h3><p>Compression level (CRF) for general use, since it optimizes for consistent visual quality. Switch to target size specifically when you have a hard limit to hit — see our <a href="/compress-video-to-size">compress video to a specific size</a> guide for that workflow.</p></div>
<div class="faq-card"><h3>Why does re-compressing an already-compressed video look worse than compressing it once at a lower setting?</h3><p>Each pass makes fresh CRF decisions about what to discard, but a second pass is working from a file that's already lost some detail — see our <a href="/blog/how-many-times-can-you-compress-a-video">guide to repeated compression</a> for the full explanation.</p></div>
<div class="faq-card"><h3>Is there a setting that avoids quality loss entirely?</h3><p>Not if the goal is a meaningfully smaller file — true lossless compression barely shrinks video at all. "Light" or similar conservative settings minimize visible loss without eliminating it, which is the realistic version of "high quality" compression.</p></div>
</div>

</section>
