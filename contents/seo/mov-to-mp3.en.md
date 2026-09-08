# Pull the Audio Out of a MOV File, Free

<p class="byline">Last updated September 8, 2026 · SquishyFile Team</p>

<section>

## Extract the audio from a MOV, free

<p>MOV is the container Apple's own software defaults to — iPhone recordings, QuickTime screen captures on Mac, and a lot of camera footage besides. SquishyFile's <strong>MOV to MP3</strong> converter pulls the audio track straight out and saves it as a standard MP3, entirely on your own device. Nothing is uploaded, there's no watermark, and there's no limit on file size or number of conversions.</p>

<p>Pick 128, 192 or 320 kbps depending on what you need — 320 kbps for music or a performance recording, 128 kbps when you just need something small, like a voice memo or a screen-recording narration.</p>

</section>

<section id="how-it-works">

## How to convert MOV to MP3

<div class="steps">
<div class="step"><h3><span class="n">1.</span>Add your MOV file</h3><p>Drag it into the tool above, or click to browse — works directly from Photos on iPhone or from a file exported by QuickTime.</p></div>
<div class="step"><h3><span class="n">2.</span>Pick your MP3 quality</h3><p>128, 192 or 320 kbps — higher means better audio quality and a bigger file.</p></div>
<div class="step"><h3><span class="n">3.</span>Convert and download</h3><p>SquishyFile extracts the audio on your device and hands you back an MP3, ready to download.</p></div>
</div>

</section>

<section>

## Where MOV files with audio worth keeping come from

<p>MOV shows up from a more varied set of sources than most people expect. An iPhone voice memo or note that ended up recorded as video by accident is the single biggest one — followed by an interview or conversation filmed on iPhone that really just needs to become a podcast-style audio file, and a QuickTime screen recording on Mac where the narration is the whole point of the file. Less obviously, MOV is also the native format for a lot of DSLR and mirrorless cameras — a wedding video, a live performance, a lecture recorded on real camera equipment rather than a phone often lands on your computer as a .mov file, not an .mp4. In every one of these cases, the video track is dead weight once you only want the sound — the MP3 keeps everything worth keeping at a fraction of the file size.</p>

</section>

<section>

## Why MOV specifically, and what it means for the audio

<p>MOV is Apple's QuickTime container — the default for anything recorded on iPhone or Mac, and part of why it's occasionally awkward to work with on non-Apple software. That awkwardness is usually about the video side (see our <a href="/blog/mov-vs-mp4-explained">MOV vs. MP4 guide</a> if a MOV file itself won't open somewhere) — the audio track inside extracts to MP3 the same way regardless of the container, so you don't need to convert the video to MP4 first just to get the sound out.</p>

<p>What the audio actually is depends more on where the MOV came from than most people realize. An iPhone recording or a QuickTime screen capture almost always stores its audio as AAC — a compressed format, so converting it to MP3 is a straightforward re-encode with little to lose. Footage from a DSLR or mirrorless camera is a different story: a lot of camera manufacturers write MOV audio as raw, uncompressed PCM rather than compressing it in-camera. If that's your source, don't be surprised when the resulting MP3 is dramatically smaller than the original file — you're not losing more quality than usual, you're just compressing audio that was never compressed to begin with. It also makes no difference here whether the video track itself is H.264 or the newer HEVC — that only affects how the video plays back, not how the audio comes out.</p>

</section>

<section>

## Picking a bitrate for MOV audio

<p>Most MOV files people convert lean toward speech rather than music — voice memos, interviews, narrated screen recordings — so <strong>128 kbps</strong> is a sensible default: small file, no audible loss for that kind of content. Bump up to <strong>192 kbps</strong> for anything with background music mixed in, and use <strong>320 kbps</strong> when the MOV is actually a music or performance recording, or camera footage where fidelity is the point.</p>

<p>Two smaller technical details worth knowing, since they carry over from whatever the source camera or phone recorded: if the MOV's audio is wider than stereo — some camera rigs and multi-mic setups do this — SquishyFile folds it down to stereo, since MP3 can't carry more than two channels; a genuinely mono source, like most voice memos, stays mono instead of being padded out artificially. And the output sample rate is always 44.1kHz, the standard MP3 players and DAWs expect, even if the original MOV audio was recorded at 48kHz like most video is — MP3 only supports a few fixed sample rates, so this is a normalization, not a quality loss.</p>

</section>

<section>

## Common problems converting MOV to MP3

<div class="faq-grid">
<div class="faq-card"><h3>The MP3 comes out silent</h3><p>Some MOV files genuinely have no audio track — a screen recording made with the microphone off, or silent b-roll from a camera — and there's nothing to extract. The tool checks for this and tells you upfront rather than handing back an empty file.</p></div>
<div class="faq-card"><h3>The MP3 is way smaller than I expected</h3><p>This is normal, not a sign of lost quality. Camera-recorded MOV files often store audio as raw, uncompressed PCM rather than a compressed format — converting that to MP3 can shrink the audio dramatically, simply because the original was never compressed in the first place.</p></div>
<div class="faq-card"><h3>My MOV has more than one audio track — which one do I get?</h3><p>Some cameras and screen recorders save separate tracks — a camera mic and an external mic, for instance. SquishyFile extracts the primary track, the same one that plays automatically in a normal video player. Pulling out a specific secondary track on its own needs proper editing software, not a browser converter.</p></div>
<div class="faq-card"><h3>Conversion is slow, or the tab seems stuck</h3><p>A few minutes of 4K iPhone footage, or footage from a camera shooting at a high bitrate, can be several gigabytes, and since your device is doing the work instead of a server, that takes real time. Keep the tab open and active while it converts — switching away or letting a phone screen lock can pause it.</p></div>
<div class="faq-card"><h3>It says the file can't be read</h3><p>This usually means the MOV was saved by an editing or camera app that wrote a non-standard variant of the container — rare, but it happens with some older camcorders and pro editing software. Re-exporting the file from its original source, or opening and re-saving it once in QuickTime Player, usually fixes it.</p></div>
<div class="faq-card"><h3>Can I convert just part of the video, or choose a specific track myself?</h3><p>Not currently — the tool converts the whole file's primary audio track, start to finish. If you only need a portion, trim the MOV first in another tool, or convert the full file and trim the resulting MP3 afterward.</p></div>
</div>

</section>

<section>

## MOV vs. other formats

<p>Not every file that lands on your device this way is actually a MOV — if it came from a downloaded clip or a non-Apple camera, it's probably <a href="/mp4-to-mp3">MP4</a> instead, which extracts to MP3 the same way but through its own page tailored to that format. If you're not sure which one you have, our <a href="/blog/mov-vs-mp4-explained">MOV vs. MP4 guide</a> explains the difference and why some files won't open everywhere. Either format — or MKV, AVI and WebM — also works on the general <a href="/video-to-mp3">video to MP3 converter</a> if you'd rather not think about which page to use. And if you need the video itself rather than just the audio — trimmed, compressed, or turned into a GIF — our <a href="/mov-to-gif">MOV to GIF converter</a> and <a href="/compress-video-on-iphone">compress video on iPhone</a> guide cover those instead.</p>

</section>

<section id="faq">

## Frequently asked questions

<div class="faq-grid">
<div class="faq-card"><h3>Does this work with iPhone videos?</h3><p>Yes — MOV is the default format for iPhone recordings, and this tool reads them directly, no conversion app needed first.</p></div>
<div class="faq-card"><h3>Does this only work for iPhone MOV files?</h3><p>No — MOV is also the native format for many DSLR and mirrorless cameras, plus Mac screen recordings. The converter doesn't care where the file came from, only that it's a MOV with an audio track.</p></div>
<div class="faq-card"><h3>Will converting to MP3 make the audio worse?</h3><p>Barely, if at all, for iPhone and screen-recording MOVs, since their audio is usually already AAC — a small re-encode at 192 or 320 kbps, not a big quality drop. Camera footage with uncompressed audio compresses more noticeably, but 320 kbps still keeps the detail that matters.</p></div>
<div class="faq-card"><h3>Is my video uploaded anywhere?</h3><p>No — the audio extraction happens on your own device, in your browser. Your MOV file never leaves your phone or computer.</p></div>
<div class="faq-card"><h3>What quality should I choose?</h3><p>128 kbps is fine for speech, 192 kbps is a good default, and 320 kbps keeps the most detail for music or camera-recorded footage.</p></div>
<div class="faq-card"><h3>Is there a watermark or file size limit?</h3><p>No — the file you download is clean, with no watermark and no limit on how large a file you can convert or how many you do.</p></div>
<div class="faq-card"><h3>Can I use this straight from my iPhone?</h3><p>Yes — it works the same way in Safari on iPhone as it does on a computer. Pick the file from Photos and convert it right there.</p></div>
<div class="faq-card"><h3>I actually want to convert the MOV to a video file, not audio — what do I use?</h3><p>Head to the <a href="/">main video compressor</a> — dropping in a MOV there compresses it and exports an MP4, rather than extracting just the audio.</p></div>
</div>

</section>
