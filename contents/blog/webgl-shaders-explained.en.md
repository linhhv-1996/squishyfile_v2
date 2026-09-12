---
title: "What Are WebGL Shaders and How Do They Actually Work?"
description: A practical, no-jargon explanation of vertex shaders, fragment shaders and why GPUs process video and images so much faster than the CPU ever could.
date: 2026-09-12
excerpt: A shader is just a tiny program that runs millions of times a second, once per pixel, with zero idea any other pixel exists. That constraint is the whole trick.
---

# What Are WebGL Shaders and How Do They Actually Work?

<p class="byline">September 12, 2026 · SquishyFile Team</p>

<section>

## The first shader I ever wrote drew nothing at all

<p>Not an error. Not a crash. Just a blank black canvas, for about two hours, while I quietly assumed WebGL itself was broken. It wasn't — I'd forgotten to bind one uniform, the GPU had every reason in the world to draw nothing, and it did exactly that without complaint. That's usually how the first week with shaders goes: coming from normal programming, where a missing variable throws an exception you can read, and landing in a world where a mistake just... produces silence. No stack trace. No pixel. Nothing to grep for.</p>

<p>The reason it's disorienting is that a shader isn't really "code" in the sense a JavaScript or Python function is. It's a tiny program, usually a few dozen lines, that the GPU runs an enormous number of times in parallel, and it has almost no memory of anything outside itself. Once that model clicks, a lot of GPU behavior that looks like magic — real-time video effects, live filters, a game rendering a complex scene at 144 frames a second — turns out to be a fairly simple idea, repeated an absurd number of times per second.</p>

</section>

<section>

## Two programs, two completely different jobs

<p>Every WebGL draw call runs two shader programs back to back, and they're not doing the same kind of work at all.</p>

<p>The <strong>vertex shader</strong> runs once per vertex — a corner point of a triangle, since everything the GPU draws eventually decomposes into triangles. Its only job is geometry: given this point's input data, where does it end up on screen? That's it. It doesn't know about color, lighting, or texture in any deep sense; it just outputs a position, and the vertex shader for a single triangle might run only three times total.</p>

<p>Once every vertex of a triangle has a screen position, a fixed-function stage called the rasterizer figures out which pixels fall inside that triangle. This part isn't programmable — it's baked into the GPU's silicon — and it hands off every pixel it finds to the second program.</p>

<p>The <strong>fragment shader</strong> (called a "pixel shader" if you came from DirectX) runs once for every one of those pixels, and this is where basically all the interesting work happens: color, lighting, textures, effects. A fragment shader has no idea it's one of two million running this frame. It gets fed whatever data got interpolated across the triangle for its specific location, and its only job is to answer one question — what color is this pixel? — and hand back an answer.</p>

<p>Here's a trick that still feels a little illegal the first time you see it: if all you need is to process a full-screen image — which is exactly what a video filter or a post-processing effect needs — you don't need a vertex buffer, an index buffer, or even a real triangle mesh. You draw one triangle, deliberately oversized so it covers the entire screen and then some, computed directly from the vertex's built-in ID with no input data at all:</p>

```glsl
// A single triangle, built from gl_VertexID alone,
// big enough to cover the whole screen. No buffers needed.
void main() {
  vec2 pos = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
  vUv = pos; // passed to the fragment shader, interpolated per-pixel
}
```

<p>Three vertices, zero setup, and every pixel on screen gets covered exactly once. The part that got cut off past the visible viewport just gets clipped away for free by the rasterizer. It's the standard way to run a "process this whole image" shader, and once you've seen it you start noticing it's what almost every real-time video or image effect is quietly built on.</p>

</section>

<section>

## How data actually gets into a shader

<p>None of this is useful if a shader can only see itself — it needs a way to read in the image you're processing and whatever settings you want to control. GLSL gives you exactly two doors in, and picking the right one matters.</p>

<p>A <strong>uniform</strong> is a value that's the same for every single pixel in a given draw call — you set it once from JavaScript before drawing, and every invocation of the fragment shader that frame sees the identical number. This is the natural home for anything a slider controls: scanline intensity, grain amount, how strong a chromatic-aberration effect should be. The GPU doesn't recompute it per pixel; it's just a constant sitting there while two million pixels each read the same value and do something different with it based on their own position.</p>

<p>A <strong>texture</strong> is the other door, and it's how the actual image gets in — the current video frame, uploaded to the GPU as a 2D grid of color data. The fragment shader doesn't loop over that grid; it samples a single texel at whatever coordinate corresponds to the pixel it's currently responsible for, using UV coordinates that got interpolated across the triangle from the vertex shader. Want to blur something, or detect an edge? Sample a few neighboring coordinates around your own position instead of just one, and combine them. That's the entire trick behind most of what looks like a complicated visual effect — one texture, a handful of nearby samples, and some arithmetic.</p>

<p>Between those two — uniforms for "how strong" and a texture for "what image" — you can express almost any real-time filter without ever touching the CPU again once the frame is uploaded.</p>

</section>

<section>

## Why this thing is absurdly fast

<p>A CPU is built to run one instruction stream really well, with a handful of cores doing a handful of different things. A GPU is built for the opposite bet entirely: thousands of much simpler cores, all running the exact same instructions at the exact same time, just on different pieces of data. That architecture is useless for most general-purpose code, which is full of branches and dependencies between steps. It's perfect for a fragment shader, because a fragment shader is designed, on purpose, to never need to know what any other pixel is doing.</p>

<p>That independence is the entire performance story. A 1920×1080 frame is a little over two million pixels. The fragment shader doesn't run two million times in some patient loop — the GPU dispatches huge batches of pixels across its cores simultaneously, and because no pixel's answer depends on any other pixel's answer, there's nothing stopping it from happening at once. That's what makes a full-frame effect — color grading, a blur, a chromatic aberration pass, a whole filtered look — something a GPU finishes in a fraction of a millisecond, at a resolution and frame rate that would make the same math on a CPU, in a naive per-pixel loop, visibly chug.</p>

<p>It's also why shader code looks weirdly restrictive if you're used to normal programming — no dynamic memory allocation, loops generally need to know their bounds ahead of time, and branching that diverges wildly between neighboring pixels can quietly tank performance even when it still produces a correct result. Those aren't arbitrary rules. They're the price of admission for running the same tiny program a couple million times a frame, sixty times a second, without the whole thing falling over.</p>

</section>

<section>

## Where this actually shows up: real-time video and image effects

<p>This is the part that made shaders click for me as more than a graphics-programming curiosity. Take any video effect you've seen applied live — scanlines, film grain, an edge-detection sketch look, a thermal false-color pass, chromatic bleed — and the practical way to do it in a browser is exactly the fullscreen-triangle setup above: decode a video frame into a texture, run one fragment shader pass over it, and read the result back out. Every single pixel gets the same treatment independently — sample a color, run some math on it, maybe sample a couple of neighboring pixels for something like an edge or a blur, write the output — and the GPU chews through the whole frame in parallel before the next one is even ready to decode.</p>

<p>Compare that to doing it the naive way: a JavaScript loop over a canvas's raw pixel array, checking each pixel one at a time on the CPU. It'll produce the same image, technically, but at maybe a few frames per second on anything past a tiny thumbnail, because you've thrown away the one property — total independence between pixels — that makes the parallel version fast in the first place. The math for a lot of these effects isn't even that complicated. A basic edge detector is a handful of neighboring-pixel samples and a threshold. What makes it usable in real time, on a full video, is entirely about running that small piece of math on the right kind of hardware, in the way that hardware was actually built to run it.</p>

</section>

<section>

## Why I ended up building a shader-based filter tool

<p>This is more or less the rabbit hole that led to SquishyFile's <a href="/video-filters">video filter tool</a>. I wanted a VHS-style effect — scanlines, tape warmth, that slightly degraded camcorder color bleed — plus a few more artistic looks like pencil sketch and thermal vision, with the preview updating live as you tweak it, not "upload, wait, hope it looks right." A CPU-side loop was never going to hit a watchable frame rate. A WebGL2 fragment shader, running one pass per frame with the same fullscreen-triangle setup above, handles it easily — drag a slider, the shader re-runs, the preview updates instantly, because the per-pixel math is cheap and the hardware is built to run all of it at once.</p>

<p>The side benefit is that nothing ever leaves your browser. The frame becomes a GPU texture locally, the shader runs locally, the render gets encoded back to video locally — no server ever sees your footage. If you want to see the fullscreen-triangle trick above actually doing something, the tool has ten styles — six VHS and camcorder presets plus pencil sketch, cross-hatch, thermal vision and neon — with a live preview so you can judge the effect on your own clip before rendering the final file.</p>

</section>
