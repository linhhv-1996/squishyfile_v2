---
title: Why Your Video Won't Send by Email or WhatsApp (and What Actually Works)
description: Gmail and WhatsApp fail videos for different, non-obvious reasons. Here's what's actually going on with both, and the fastest way around each one.
date: 2026-09-04
excerpt: A video bouncing from Gmail or refusing to send on WhatsApp usually isn't a simple size problem — each app fails in its own specific, fixable way.
---

# Why Your Video Won't Send by Email or WhatsApp (and What Actually Works)

<p class="byline">September 4, 2026 · SquishyFile Team</p>

<section>

## It's rarely just "the file is too big"

<p>You've probably heard the number before: Gmail caps attachments around 25MB, WhatsApp is stricter still. That's true, but it's not the whole story, and treating it as a single flat size limit is how people end up compressing a video far more than they actually needed to — or missing an easy fix that doesn't involve compressing at all. Both apps fail for their own specific reasons, and knowing which one you're actually up against saves you from guessing your way through it.</p>

</section>

<section>

## Email: the limit is per message, not per file

<p>Gmail's roughly 25MB cap applies to the <em>entire message</em>, not to your video in isolation. If you've already attached a couple of photos or a document, your video's actual budget is whatever's left, not the full 25MB. Send the video alone in its own email and you'll have more room than you think — a common mistake is bundling a video with a PDF and a couple of screenshots, hitting the wall, and assuming the video itself needs to be much smaller than it actually does.</p>

<p>The number also isn't universal across providers. Outlook.com and Microsoft 365 accounts typically allow up to 20MB per message, and some corporate Exchange servers set their own lower limits still, often without telling you what the number is until the send fails. iCloud Mail is the interesting outlier: attachments over 20MB are automatically routed through Mail Drop, which handles files up to 5GB by uploading them to iCloud and emailing a download link instead of a true attachment. If you're sending from an iPhone and the recipient uses Apple Mail, a fairly large video might go through without any compression at all — you often won't know Mail Drop kicked in until you notice the email contains a link instead of a normal attachment icon.</p>

<p>Gmail also silently applies Mail Drop-style handling in some cases through Google Drive, offering to attach large files as a Drive link rather than rejecting them outright — worth checking for before assuming compression is your only option, since it depends on the sender's account settings and isn't always offered by default.</p>

<p>If your video genuinely doesn't fit under whichever limit applies, compressing to a specific size beats trial and error — see our <a href="/compress-video-to-size">guide to hitting an exact target size</a> for the full workflow, including a breakdown of typical limits across the platforms people run into most.</p>

</section>

<section>

## WhatsApp: how you send it matters more than the size

<p>This is the one most people don't know: WhatsApp treats "send as video" and "send as document" completely differently, and it changes both the quality and the effective size limit. Sent as a video, WhatsApp automatically re-compresses the file to keep it small and fast to preview inline in the chat — which is convenient, but it's an aggressive re-encode you don't control, and it's often the actual reason a video looks noticeably worse after you send it than it did on your device beforehand. People frequently blame their phone's camera or assume the recipient's screen is the problem, when it's really WhatsApp's own compression doing the damage on the way out.</p>

<p>Sent as a <strong>document</strong> instead (tap the paperclip or attachment icon, then choose "Document" rather than "Gallery," "Photos" or "Camera"), WhatsApp leaves the file completely alone — no re-compression at all — and the size limit jumps to roughly 2GB. If quality matters more than having it play inline in the chat, sending as a document is usually the better move, and it sidesteps the size problem entirely for all but the largest files, like long screen recordings or raw camera footage.</p>

<div class="table-wrap">
<table class="spec-table">
<thead><tr><th>Method</th><th>What happens</th><th>Effective limit</th></tr></thead>
<tbody>
<tr><td>Send as video</td><td>WhatsApp re-compresses automatically, plays inline in chat</td><td>~16MB before quality visibly struggles</td></tr>
<tr><td>Send as document</td><td>File is sent untouched, opens as a download rather than inline</td><td>~2GB</td></tr>
</tbody>
</table>
</div>
<br>

<p>The trade-off: a video sent as a document doesn't autoplay in the conversation, shows up as a file icon with a filename instead of a thumbnail, and some people find that mildly less convenient than a normal video bubble they can tap straight away. For anything you actually care about the quality of — and for longer clips that would come out looking rough after WhatsApp's own compression squeezes them down — it's usually worth the small extra tap to open it.</p>

</section>

<section>

## What about Instagram, X and text messages?

<p>The same "the app re-compresses it for you" pattern shows up almost everywhere video gets shared casually, just with different specifics. Instagram re-encodes essentially everything on upload regardless of what you send it, so there's no equivalent "send as document" workaround there — a smaller file mainly just means a faster, more reliable upload rather than a quality difference on the other end. X (formerly Twitter) allows fairly large files on its free tier but caps video length rather than just size, so a long clip can fail there even at a modest file size. Regular text messaging (SMS/MMS) is the strictest of the bunch on many carriers, sometimes compressing aggressively or failing outright well under 1MB — carrier-dependent and largely outside your control, which is often the actual reason a text-message video looks noticeably worse than the same clip sent through almost any other app.</p>

</section>

<section>

## When compressing it yourself is still the right call

<p>Neither the document trick nor a Mail Drop link helps if the recipient specifically needs a normal, playable-anywhere video file rather than a document download or a link to click through — an older relative who won't tap through an unfamiliar link, a form that only accepts a direct video upload, or a platform that doesn't support either workaround at all. In those cases, shrinking the file yourself before sending is still the most reliable option, and it's also the fastest one when you don't want to explain "tap this link, then download the file" to someone over the phone.</p>

<p><a href="/">SquishyFile</a> compresses the video in your browser — nothing gets uploaded anywhere to do it — and you can enter the exact size you're aiming for instead of guessing at a quality slider and hoping. Type 16MB for a comfortable WhatsApp-as-video send, or whatever your email provider's real limit turns out to be, and download a file that's already sized to fit before you attach it anywhere.</p>

</section>

<section id="faq">

## Frequently asked questions

<div class="faq-grid">
<div class="faq-card"><h3>Why did my video look worse after I sent it on WhatsApp?</h3><p>You most likely sent it "as video," which triggers WhatsApp's own automatic re-compression. Sending as a document instead preserves the original quality, at the cost of it not playing inline in the chat.</p></div>
<div class="faq-card"><h3>Does Gmail's 25MB limit apply to just the video, or the whole email?</h3><p>The whole message — attachments, images and the video together count against the same cap. A video attached alone has more room than one sent alongside other files.</p></div>
<div class="faq-card"><h3>What is iCloud Mail Drop?</h3><p>An automatic fallback in Apple Mail for attachments over 20MB — instead of failing, it uploads the file to iCloud and sends a download link in the email, handling files up to 5GB without you doing anything differently.</p></div>
<div class="faq-card"><h3>Is sending a video as a document on WhatsApp safe for the recipient?</h3><p>Yes — it's still WhatsApp's own file transfer mechanism, just delivered as a downloadable file rather than an inline video player. There's nothing unusual or risky about it on either end.</p></div>
<div class="faq-card"><h3>Why does a video I sent by text message look worse than the same one sent on WhatsApp?</h3><p>Carrier MMS handling is typically stricter and more aggressive than app-based messaging, often compressing well under 1MB depending on the carrier — largely outside your control on either end of the conversation.</p></div>
<div class="faq-card"><h3>What size should I compress to if I'm not sure which method someone will use?</h3><p>Aim for whichever limit is the tightest realistic option — usually email's ~25MB or less if you're bundling other attachments — so the file works no matter how it ends up being sent.</p></div>
</div>

</section>
