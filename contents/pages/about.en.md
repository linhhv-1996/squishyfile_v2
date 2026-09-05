# About SquishyFile

<p class="byline">Last updated September 5, 2026</p>

<section>

## Hi, I'm J.Julian

<p>I'm the person behind SquishyFile. I've always been into technology and building stuff on the side, and this site is basically that hobby turned into something other people can use.</p>

<p>SquishyFile started as a way to mess around with WebAssembly and WebGPU — two different technologies for running real computation in the browser instead of on a server. Video compression ended up being the first tool I shipped, and the site grew from there.</p>

</section>

<section>

## How it's built

<p>The whole site is a SvelteKit app, deployed on Cloudflare Pages. There's no backend doing the actual video work — when you drop a file in, it gets processed right there in your browser using WebAssembly builds of the same encoders/decoders that run on desktop. For heavier stuff like upscaling, I use WebGPU instead so it runs on your GPU rather than the CPU — different tool for a different job, not an upgrade from WASM.</p>

<p>That's also why the site feels fast and doesn't need you to wait in an upload queue — there's no upload. Your browser is doing the compute, not some server somewhere.</p>

</section>

<section>

## Why it's free

<p>Because everything runs on your device instead of my server, I don't have to pay for the compute to process your files — your own computer does that. That's what makes it possible to give the tools away for free instead of charging for them or gating them behind an account.</p>

<p>The site is supported by ads, which covers hosting and lets me keep it free and keep adding tools.</p>

</section>

<section>

## Where the site is headed

<p>SquishyFile is going all-in on video. The plan is to build out a full set of video tools, all running client-side the same way: compress, convert between formats, remove/replace background, and upscale, with more added as I build them out. Instead of spreading into unrelated tools, I'd rather this be the one place you go for anything video-related.</p>

<p>If there's a video tool you wish existed, or something's broken, let me know on the <a href="/contact">Contact page</a>.</p>

</section>
