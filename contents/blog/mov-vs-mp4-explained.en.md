---
title: MOV vs. MP4: Why Some of Your Videos Won't Open Everywhere
description: MOV plays perfectly on the device that made it and jams up everywhere else. Here's what's actually different between MOV and MP4, and when converting solves the problem.
date: 2026-09-02
excerpt: A video that plays fine on your iPhone but won't open on a Windows PC isn't broken — it's just in a container that not every player understands.
---

# MOV vs. MP4: Why Some of Your Videos Won't Open Everywhere

<p class="byline">September 4, 2026 · SquishyFile Team</p>

<section>

## The file isn't broken, it's just MOV

<p>You film something on an iPhone, AirDrop it to a friend or drop it into a Windows upload form, and it either refuses to open, plays with no sound, or gets rejected outright. The file isn't corrupted — it's almost certainly a <strong>.mov</strong> file, and MOV is a lot pickier about where it works than most people realize.</p>

<p>MOV is Apple's QuickTime container format. It's been the default recording format on iPhones and Macs for years, and on Apple's own software it's seamless — Photos, iMovie, Final Cut and Safari all handle it without a second thought. Take that same file to a Windows machine, an older Android phone, some web upload forms, or software built around a narrower set of formats, and support gets a lot patchier. Windows can often play MOV through the right app, but "often" isn't "always," and a lot of the friction shows up specifically when you try to <em>upload</em> a MOV somewhere rather than just watch it on your own screen.</p>

<p>This isn't a new problem, but it catches people off guard more than it used to, simply because so much everyday video now starts life on a phone instead of a dedicated camera. A decade ago, most people's video came from a camcorder or DSLR that already saved in a widely-supported format. Now it's an iPhone by default, MOV by default, and compatibility problems by default — until you know what's actually happening.</p>

</section>

<section>

## What's actually different between MOV and MP4

<p>A video file is really two things layered together: a <strong>container</strong> (how the audio, video, subtitles and metadata are packaged into one file) and a <strong>codec</strong> (how the actual picture and sound are compressed inside that package). MOV and MP4 are both containers, and — this is the part that surprises people — they're close enough under the hood that a MOV file often already contains H.264 or HEVC video, the exact same codecs an MP4 would use. The incompatibility usually isn't about the video data itself; it's about whether the software you're using recognizes the <em>.mov wrapper</em> around it.</p>

<p>Think of it like two boxes that can hold the same contents but are shaped differently. A piece of software that only knows how to open MP4-shaped boxes will refuse a MOV-shaped one even if what's inside would have played fine — it never gets far enough to check. That's why you'll sometimes see a MOV open in one app but not another on the exact same computer: each app's developers chose which container formats to support, and MOV didn't always make the list.</p>

<p>MP4 is the more universal container by a wide margin. It's the default export format for YouTube, the format nearly every phone, smart TV, video editor and web player expects without configuration, and the one that causes the fewest "why won't this open" moments across the widest range of software. That's not because MP4 is technically superior to MOV — the two are close cousins, both built on similar underlying standards — it's simply the one nearly every platform and device maker agreed to support as a baseline, the way PDF became the default for documents regardless of which app people actually authored them in.</p>

</section>

<section>

## Common symptoms and what's behind each one

<div class="table-wrap">
<table class="spec-table">
<thead><tr><th>Symptom</th><th>Likely cause</th></tr></thead>
<tbody>
<tr><td>Plays on iPhone/Mac, won't open on Windows</td><td>Windows Media Player and some default apps don't read MOV out of the box — VLC or QuickTime for Windows usually fixes it, but not every recipient has either installed</td></tr>
<tr><td>Uploads fine to some sites, rejected by others</td><td>The upload form's allow-list doesn't include .mov, even though the video codec inside would otherwise be fine</td></tr>
<tr><td>Opens but has no sound in an editor</td><td>The editor reads the MOV container but doesn't support the specific audio codec inside it</td></tr>
<tr><td>Plays choppy or drops frames on an older device</td><td>Often HEVC video inside the MOV — a newer, more efficient codec that older hardware can't decode smoothly, unrelated to the container itself</td></tr>
<tr><td>Huge file size for the length</td><td>Unrelated to the container — this is usually HEVC at high resolution/frame rate, covered in our <a href="/compress-video-on-iphone">iPhone compression guide</a></td></tr>
</tbody>
</table>
</div>

<div class="space"></div>
<p>Notice how many of these trace back to the codec inside the file rather than the .mov wrapper itself — that HEVC row is a good example. HEVC (also called H.265) compresses more efficiently than the older H.264, so it's become the default on newer iPhones, but plenty of devices and web browsers still handle it worse than H.264 or don't decode it in hardware at all, which shows up as stutter, battery drain, or a flat refusal to play. A MOV file might fail for its container, its codec, or both at once, which is part of why the same file can behave three different ways on three different devices.</p>

</section>

<section>

## When to convert, and when to leave it as MOV

<p>If you're staying inside Apple's ecosystem — editing in Final Cut, sharing between Apple devices, archiving footage you'll reopen in iMovie later — there's no real reason to convert. MOV works fine there, it can preserve certain metadata and editing-friendly qualities that a straight MP4 export sometimes flattens, and converting adds nothing but an extra step and a bit of quality risk for no real benefit.</p>

<p>Convert when the video is leaving that ecosystem: sending it to someone on Windows or Android, uploading it to a site that's fussy about formats, or attaching it somewhere you're not sure the recipient's software will cooperate. MP4 is the safer default in basically every one of those cases, and it's worth doing before the file becomes someone else's problem to troubleshoot at an inconvenient moment — like right before a meeting starts, or after they've already tried three different apps to open it.</p>

<p>There's a middle case worth knowing too: if you only need a quick preview and don't care about editing the file afterward, some browsers will actually play a MOV directly when you drag it into a tab, even if the app you originally tried failed. It's not reliable enough to count on for sharing with someone else, but it's a useful sanity check to confirm the video itself is fine before you assume it's corrupted.</p>

</section>

<section>

## Converting and compressing in the same step

<p>This is where compressing and converting end up being one job instead of two separate chores. If you run a MOV file through <a href="/">SquishyFile</a>, the output is always an MP4 — so a file that was too big <em>and</em> awkward to open comes out the other side smaller and playable everywhere, without a separate conversion tool or a second app to install. There's no in-between step where you convert first and then compress that MP4 again; it happens in the one pass.</p>

<p>The same applies to a few other formats with their own smaller pockets of compatibility trouble: older AVI files use codecs that not every modern player still supports, MKV support varies noticeably from one device to the next (great on a computer, spotty on a smart TV or phone), and WebM is really a browser-native format that plenty of software outside a browser doesn't expect at all. Drop any of them in, and what comes out is a standard MP4 — the one format almost nothing on the recipient's end has an excuse to reject.</p>

</section>

<section id="faq">

## Frequently asked questions

<div class="faq-grid">
<div class="faq-card"><h3>Does converting MOV to MP4 lose quality?</h3><p>Only if you re-encode the video, which compressing does by nature. A plain container swap with no re-encoding is lossless, but most free online "converters" are actually compressing at the same time — which is usually fine, since you typically want a smaller file anyway.</p></div>
<div class="faq-card"><h3>Why does my MOV file have no sound after I open it on Windows?</h3><p>Some Windows apps read the MOV container but not the specific audio codec inside it. Converting to MP4 with a tool that re-encodes the audio track, like SquishyFile, fixes this as a side effect.</p></div>
<div class="faq-card"><h3>Is MP4 always smaller than MOV?</h3><p>Not inherently — container format has little effect on size, which is mostly determined by resolution, frame rate and bitrate. A MOV and an MP4 encoded with the same settings end up close in size; the difference people notice usually comes from HEVC vs. H.264, not the container.</p></div>
<div class="faq-card"><h3>Can I just rename a .mov file to .mp4?</h3><p>No — renaming doesn't change what's actually inside the file, and most software will still fail to open it correctly, or open it and show a broken video track. You need an actual conversion, not a rename.</p></div>
<div class="faq-card"><h3>Is HEVC the same thing as MOV?</h3><p>No — HEVC is a codec (how the video is compressed), MOV is a container (how the file is packaged). A MOV file often contains HEVC video, but you can also have HEVC inside an MP4, or H.264 inside a MOV. They're independent choices that just happen to be bundled together by default on newer iPhones.</p></div>
<div class="faq-card"><h3>Need to shrink the file too, not just convert it?</h3><p>That's what SquishyFile does in one pass — drop in the MOV file, pick a compression level or target size, and download an MP4. See the <a href="/">main video compressor</a> for the full workflow.</p></div>
</div>

</section>
