---
title: Best Video Settings for Instagram, TikTok, YouTube and Discord
description: Fitting under a platform's upload limit isn't the same as looking good on it. Here's what resolution, aspect ratio and bitrate actually matter for each one.
date: 2026-09-04
excerpt: A video that technically uploads and a video that actually looks sharp once it's live are two different targets — here's how to hit the second one.
---

# Best Video Settings for Instagram, TikTok, YouTube and Discord

<p class="byline">September 4, 2026 · SquishyFile Team</p>

<section>

## Fitting under the limit isn't the same as looking good

<p>Every platform will tell you the maximum file size or length it accepts, but almost none of them tell you what actually makes a video look sharp once their own compression gets done with it. That's a different question, and it's the one that matters more — a video can clear Discord's size cap or Instagram's upload window and still come out soft, cropped oddly, or letterboxed with black bars because it was shot or exported at the wrong shape for where it's going.</p>

<p>Every platform mentioned here re-compresses whatever you upload, on top of anything you've already compressed. That's normal and unavoidable — the goal isn't to outsmart that second pass, it's to hand it a file with the right resolution, aspect ratio and enough bitrate headroom that its own re-encode has as little damage to do as possible.</p>

</section>

<section>

## Instagram: shape matters more than size

<p>Instagram doesn't publish a hard file-size limit — it re-encodes everything on upload regardless of what you send it, so a smaller file mainly just uploads faster on a slow connection. What actually affects how a video looks once it's live is aspect ratio and resolution. Reels and Stories are shot for 9:16 (1080×1920) — a landscape 16:9 video dropped into that space gets pillarboxed with bars on either side, or Instagram crops in and cuts off the edges of the frame, whichever it decides is less bad. Feed posts are more forgiving of 4:5 or 1:1, but 9:16 still works everywhere on Instagram, which makes it the safer default if you're only exporting one version.</p>

<p>For resolution, 1080×1920 at 30fps is the sweet spot — anything higher gets downscaled on upload anyway, so exporting at 4K just means a bigger file for Instagram to re-compress harder to get back down to its own delivery size. If the source is 4K, resize before you upload rather than let Instagram do it; you keep more control over how the downscale looks.</p>

</section>

<section>

## TikTok: similar shape, tighter bitrate tolerance

<p>TikTok's native shape is the same 9:16 as Instagram Reels, and 1080×1920 is again the resolution that avoids unnecessary re-scaling. Where TikTok differs is how aggressively it re-compresses on the way in — its own encode is noticeably heavier-handed than Instagram's, particularly on videos with a lot of motion or fast cuts. That makes starting bitrate matter more here than almost anywhere else on this list: a video that already looks a little soft going in tends to look noticeably worse coming out the other side of TikTok's compression, because there's less real detail left for that second pass to preserve.</p>

<p>The practical takeaway is to lean toward TikTok's own in-app editing and posting flow when the source is already low-bitrate or previously compressed, and reserve outside compression for footage that's still close to its original quality — squishing a video down further right before TikTok squishes it again stacks two aggressive passes on top of each other, which is the scenario our <a href="/blog/how-many-times-can-you-compress-a-video">guide to repeated compression</a> covers in more depth.</p>

</section>

<section>

## YouTube: the one platform where bigger is usually fine

<p>YouTube doesn't have a practical file-size limit for most creators, and it handles high resolution and high bitrate gracefully — it's built to take a large master file and generate its own set of delivery resolutions (360p up through whatever the source supports) automatically. That means the instinct to shrink a video before uploading to YouTube is usually working against you: a smaller, more compressed source just gives YouTube's own transcoder less to work with at every resolution tier it generates, including the 1080p or 4K version viewers with a good connection will actually watch.</p>

<p>The one place file size still matters on YouTube is upload speed on a slow connection, where a moderately compressed version — SquishyFile's "Light" setting rather than "Max squish" — trims the file without meaningfully hurting the quality YouTube's transcoder has to work from.</p>

</section>

<section>

## Discord: the platform where the limit is the whole story

<p>Discord is the exception on this list — it doesn't re-encode uploads the way the others do, so what you upload is close to what people see, and the free-tier size limit (20MB as of 2026, up from 10MB) is the real constraint rather than a soft suggestion. This is where a target size, not a quality slider, is the right tool: rather than guessing at a compression level and hoping it lands under 20MB, entering that number directly gets you there in one pass. Our <a href="/compress-video-to-size">compress video to a specific size</a> page walks through that workflow and has the current numbers for Nitro Basic (50MB) and full Nitro (500MB) if you're posting somewhere with a higher tier.</p>

<p>Because Discord doesn't re-compress, resolution matters less here than bitrate — a 1080p clip squeezed hard enough to fit 20MB often looks worse than the same clip exported at 720p with more bitrate to spend per pixel. If a screen recording or gameplay clip looks blocky after hitting the size target, dropping the resolution before compressing again usually helps more than lowering the compression level further.</p>

</section>

<section>

## A quick reference

<div class="table-wrap">
<table class="spec-table">
<thead><tr><th>Platform</th><th>Best aspect ratio</th><th>Resolution to export at</th><th>What actually matters most</th></tr></thead>
<tbody>
<tr><td>Instagram (Reels/Stories)</td><td>9:16</td><td>1080×1920</td><td>Matching the vertical shape — mismatched ratio causes cropping or bars</td></tr>
<tr><td>TikTok</td><td>9:16</td><td>1080×1920</td><td>Starting bitrate — TikTok's own compression is heavy-handed</td></tr>
<tr><td>YouTube</td><td>16:9 (or native)</td><td>As high as your source allows</td><td>Not over-compressing before upload — YouTube handles large files well</td></tr>
<tr><td>Discord (free)</td><td>Native</td><td>720p–1080p depending on target size</td><td>Hitting the 20MB size cap directly, since Discord doesn't re-encode</td></tr>
</tbody>
</table>
</div>

</section>

<section>

## Exporting more than one version

<p>If the same clip is going to more than one of these platforms, it's worth exporting a vertical 9:16 version for Instagram and TikTok and a separate one for YouTube or Discord, rather than sending one shape everywhere and letting each platform crop or pad it differently. SquishyFile doesn't require re-uploading between files, so setting a target size or compression level once and running a few versions through — a 9:16 crop for social, a full-resolution pass for YouTube, a size-capped export for Discord — is a quick sequence rather than a separate tool for each destination.</p>

</section>

<section id="faq">

## Frequently asked questions

<div class="faq-grid">
<div class="faq-card"><h3>Should I always export at the highest resolution my footage supports?</h3><p>Only for YouTube, where the platform's own transcoder benefits from more source detail. For Discord, matching resolution to your actual size target usually looks better than maxing out resolution and compressing harder to compensate.</p></div>
<div class="faq-card"><h3>Does compressing before uploading to Instagram or TikTok even help, since they re-encode anyway?</h3><p>It helps with upload speed and reliability more than final quality — both platforms' own compression is the dominant factor in how the video ends up looking, so extreme compression beforehand mostly just adds an unnecessary second lossy pass.</p></div>
<div class="faq-card"><h3>Why does the same video look different quality on TikTok versus Instagram?</h3><p>Each platform runs its own transcoding pipeline with different bitrate targets and encoder settings — the same source file goes through two genuinely different compression processes, not just two different players.</p></div>
<div class="faq-card"><h3>What if I only have one exported file and need it on all four platforms?</h3><p>A 9:16, 1080×1920 export works acceptably on all four, though YouTube and Discord will show it letterboxed if the content itself was framed for landscape viewing. A platform-specific export still looks better where it matters.</p></div>
<div class="faq-card"><h3>Does a target size make sense for Instagram or TikTok too?</h3><p>Less so — since both re-compress everything anyway, chasing an exact file size for them mostly just controls upload time. Discord and email/message-based sharing are where target size actually determines the outcome.</p></div>
<div class="faq-card"><h3>My video already looks compressed before I even upload it anywhere — what happened?</h3><p>It's likely already been through a compression pass somewhere upstream — see our <a href="/blog/how-many-times-can-you-compress-a-video">guide to why repeated compression compounds</a> for how to spot and avoid that.</p></div>
</div>

</section>
