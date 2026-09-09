# Extract Still Images From Any Video

<p class="byline">Last updated September 9, 2026 · SquishyFile Team</p>

<section>

## Extract a still frame or multiple images from a video

<p>A video frame extractor turns selected moments from a video into downloadable image files. Use SquishyFile to save the frame currently shown in the preview, capture a frame at a specific time, sample a video at regular intervals, extract frames from a selected time range, or create an evenly spaced set of frames from the full clip.</p>

<p>The tool works in your browser with local processing. Your video is processed on your own device rather than uploaded to a remote server. When you extract more than one frame, the PNG or JPEG images are packaged into a single ZIP download so they are easy to keep together.</p>

</section>

<section id="how-it-works">

## How to extract frames from a video

<div class="steps">
<div class="step"><h3><span class="n">1.</span>Add your video</h3><p>Drag a video file into the tool, or choose it from your device. MP4, MOV, WebM, MKV, AVI, and several legacy video containers are handled through the browser's local decoding paths.</p></div>
<div class="step"><h3><span class="n">2.</span>Choose how to sample the video</h3><p>Save the current frame, extract frames at a regular interval, choose a time range, or specify how many evenly spaced frames you want from the video.</p></div>
<div class="step"><h3><span class="n">3.</span>Choose a format and extract</h3><p>Select PNG or JPEG, then start the extraction. A single frame downloads as an image in that format. Multiple extracted frames are collected into a ZIP file.</p></div>
</div>

</section>

<section>

## Four ways to extract video frames

The best method depends on whether you need one exact still image or a representative set of images from the clip.

### Save the current frame

Use the current-frame option when you already know which moment you want. Preview the video, move to the desired position, and extract that frame in PNG or JPEG format. This is useful for saving a still image from a video, creating a thumbnail candidate, or capturing one clear moment from a recording.

This method is usually the quickest choice when you need one image rather than a collection of frames. It also avoids creating a large download when a single still is all you need.

### Extract frames at intervals

Interval extraction is useful when you want to sample the video regularly. Set the interval and the tool extracts frames throughout the video according to that spacing. For example, regular sampling can help you review the visual progression of a long recording without manually searching through every second.

Choose a shorter interval when the action changes quickly and you need a more detailed sample. Choose a longer interval when you only need a broad overview. Short intervals create more images, so the resulting ZIP file may be larger and take longer to process.

### Extract frames within a time range

Use the time-range option when you only want frames from part of a video. Set the start and end times, then choose the interval to use inside that range. This is useful when the relevant action is in the middle of a long recording and sampling the entire video would create unnecessary images.

The range mode still uses interval sampling rather than extracting every native frame. Set a shorter interval when you need a denser sequence, or use a longer interval for a quick overview of the selected section.

### Extract an evenly spaced number of frames

The evenly spaced option is useful when you know how many images you want but do not want to calculate timestamps yourself. Enter a frame count and the tool distributes the extracted images across the video.

This is a practical way to create a small set of preview images, compare the beginning, middle, and end of a clip, or select representative frames for a project. It is also more predictable than choosing an interval when you need a fixed number of output images.

</section>

<section>

## Supported video formats and output

The file picker accepts video files broadly. The worker first tries Mediabunny for modern and common containers, then uses a local ffmpeg.wasm compatibility path for containers Mediabunny cannot demux. Support still depends on the file's container, codec, and whether the video is readable.

<div class="table-wrap">
<table class="spec-table">
<thead><tr><th>Processing path</th><th>Examples</th></tr></thead>
<tbody>
<tr><td>Mediabunny</td><td>MP4, MOV, WebM, MKV, TS, and other containers it can demux</td></tr>
<tr><td>ffmpeg.wasm compatibility path</td><td>AVI, WMV, ASF, FLV, F4V, RM/RMVB, MPG/MPEG, VOB, DivX, OGV, MTS/M2TS, DV, 3G2, and SWF</td></tr>
</tbody>
</table>
</div>

<div class="space"></div>
<p>You choose between PNG and JPEG before extracting. PNG is the lossless option. JPEG produces a smaller image and includes a separate quality control. If you extract one frame, you receive a single image in the selected format. If you extract multiple frames, the images are packaged into a ZIP archive for one convenient download.</p>

<p>If the source video needs more resolution before you capture a still, you can <a href="/video-upscaler">upscale the source video</a> first and then extract a frame from the improved version.</p>

</section>

<section>

## Practical uses for extracted video frames

<p>Extracting images from video is useful whenever a moving clip contains a moment you want to save, share, inspect, or use elsewhere. Common examples include:</p>

<ul>
<li><strong>Video thumbnails.</strong> Sample several points in a clip to find a representative image for a post, presentation, or file preview.</li>
<li><strong>Screen recordings.</strong> Capture a specific screen state from a tutorial, software demonstration, or recorded workflow.</li>
<li><strong>Phone and camera footage.</strong> Save a clear still from a MOV or MP4 without opening a full video editor.</li>
<li><strong>Reviewing long videos.</strong> Extract frames at intervals to create a visual summary of a recording.</li>
<li><strong>Reference images.</strong> Pull selected moments from a demonstration, lecture, interview, or product video for later comparison.</li>
<li><strong>Motion and scene checks.</strong> Use evenly spaced frames to inspect how a scene changes across a clip.</li>
</ul>

<p>The output is a still image rather than another video. That makes it suitable when the visual moment matters but playback is unnecessary.</p>

</section>

<section>

## Choosing the right extraction method

<p>Use the current-frame method for precision, interval extraction for regular sampling, and evenly spaced frame count for a predictable number of images.</p>

<div class="table-wrap">
<table class="spec-table">
<thead><tr><th>Your goal</th><th>Best method</th></tr></thead>
<tbody>
<tr><td>Save one exact moment</td><td>Current or specific frame</td></tr>
<tr><td>Review a video at regular points</td><td>Interval extraction</td></tr>
<tr><td>Get a fixed number of representative images</td><td>Evenly spaced frame count</td></tr>
<tr><td>Download several images together</td><td>Any multi-frame method, which produces a ZIP</td></tr>
</tbody>
</table>
</div>

<div class="space"></div>
<p>There is no need to extract a large number of images when one still solves the problem. For a thumbnail or reference image, start with the current frame. For an overview of a longer clip, use intervals or a modest evenly spaced count and increase the number only if the first sample does not show enough detail.</p>

</section>

<section>

## Tips for better frame extraction

<ul>
<li><strong>Preview the video before choosing a timestamp.</strong> A small change in position can produce a substantially different still, especially during fast movement.</li>
<li><strong>Use a shorter interval for changing scenes.</strong> Fast action, camera movement, and frequent cuts need denser sampling than a mostly static recording.</li>
<li><strong>Use a longer interval for an overview.</strong> A broad sample keeps the number of images and the ZIP download manageable.</li>
<li><strong>Choose an even frame count when consistency matters.</strong> This is helpful when you need the same number of representative images from different videos.</li>
<li><strong>Keep the browser tab open during processing.</strong> Local processing uses your own device, and longer videos or larger frame sets naturally require more work.</li>
<li><strong>Check the output before using it elsewhere.</strong> If a still is blurred by motion or does not show the moment you need, try a nearby position or a denser sample.</li>
</ul>

<p>Frame extraction does not change the original video. It creates image copies of the moments you select, leaving the source file available for later editing or conversion.</p>

</section>

<section>

## Privacy and local browser processing

<p>The video is processed locally in your browser instead of being sent to a remote processing server. This is useful for private recordings, internal demonstrations, personal phone footage, and other videos you do not want to upload just to save a frame.</p>

<p>Local processing also means the work is performed by your device. The time required can vary with the video length, the number of frames requested, and the device being used. A single frame is generally a smaller task than extracting a large set of interval-based images.</p>

</section>

<section>

## Still image or animated output?

<p>This tool is designed for PNG or JPEG still images. If you need a short clip that plays and loops rather than a collection of stills, use the <a href="/mp4-to-gif">MP4 to GIF converter</a> for an MP4 source or the <a href="/mov-to-gif">MOV to GIF converter</a> for a MOV source.</p>

<p>Use frame extraction when you need individual images. Use GIF conversion when the movement itself is important and the output needs to animate.</p>

</section>

<section id="faq">

## Frequently asked questions

<div class="faq-grid">
<div class="faq-card"><h3>What video formats are supported?</h3><p>The tool handles common containers such as MP4, MOV, WebM, MKV, and TS through Mediabunny. Legacy containers such as AVI, WMV, FLV, MPEG, VOB, OGV, and MTS can use the local ffmpeg.wasm compatibility path. Unusual or damaged files may still fail if they cannot be decoded.</p></div>
<div class="faq-card"><h3>Can I extract one frame from a video?</h3><p>Yes. Choose the current-frame option, move to the moment you need, select PNG or JPEG, and download the still image.</p></div>
<div class="faq-card"><h3>Can I extract multiple frames?</h3><p>Yes. Extract frames at regular intervals or specify an evenly spaced number of frames. Multiple images are packaged into a ZIP download.</p></div>
<div class="faq-card"><h3>Can I extract frames from only part of a video?</h3><p>Yes. Choose the time-range option, set the start and end times, and choose the interval for frames within that range.</p></div>
<div class="faq-card"><h3>Can I extract a frame at a specific time?</h3><p>Yes. Use the video preview to move to the desired position, choose the current-frame option, and extract the selected frame.</p></div>
<div class="faq-card"><h3>What format are the extracted images?</h3><p>You can choose PNG or JPEG. PNG is lossless, while JPEG creates a smaller file and lets you adjust image quality.</p></div>
<div class="faq-card"><h3>Is my video uploaded?</h3><p>No. The video is processed locally in your browser rather than uploaded to a remote processing server.</p></div>
<div class="faq-card"><h3>Can I extract frames from a YouTube video?</h3><p>The tool works with local video files. It does not download or import videos from YouTube URLs.</p></div>
<div class="faq-card"><h3>What is the difference between PNG and JPEG?</h3><p>PNG is lossless and is the default format. JPEG usually creates a smaller file, and you can adjust its quality before extracting.</p></div>
</div>

</section>
