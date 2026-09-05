export const FSR_EASU_WGSL = `
struct Resolution{
   inputwidth:f32,
   inputheight:f32,
   outputwidth:f32,
   outputheight:f32,
}

@group(0) @binding(0) var input: texture_2d<f32>;
@group(0) @binding(1) var sam: sampler;
@group(0) @binding(2) var rgbstorage : texture_storage_2d<rgba8unorm, write>;

@group(1) @binding(0) var<uniform> resolution: Resolution;

fn min3(a:vec3<f32>,b:vec3<f32>,c:vec3<f32>)->vec3<f32>{ return min(a, min(b,c)); }
fn max3(a:vec3<f32>,b:vec3<f32>,c:vec3<f32>)->vec3<f32>{ return max(a, max(b,c)); }

struct FsrTap{ aC:vec3<f32>, aW:f32, }
struct FsrSet{ dir:vec2<f32>, len:f32, }

fn saturate(num:f32)->f32{ return clamp(num,0.0,1.0); }

fn matchSet(pp:vec2<f32>,biS:bool, biT:bool, biU:bool, biV:bool) -> f32{
	if(biS){ return (1.0 - pp.x) * (1.0 - pp.y); }
	else if(biT){ return pp.x * (1.0 - pp.y); }
	else if(biU){ return (1.0 - pp.x) * pp.y; }
	else if(biV){ return pp.x * pp.y; }
	else{ return 0.0; }
}

fn FsrEasuTap(
	fsr:FsrTap, off:vec2<f32>, dir:vec2<f32>, len:vec2<f32>, lob:f32, clp:f32, c:vec3<f32>
)-> FsrTap {
	var fsr1 : FsrTap = fsr;
    var aC : vec3<f32> = fsr1.aC;
    var aW : f32 = fsr1.aW;
	var v : vec2<f32> = vec2<f32>(0.0);
	v.x = (off.x * (dir.x)) + (off.y * dir.y);
	v.y = (off.x * (-dir.y)) + (off.y * dir.x);
	v = v * len;
	var d2 : f32 = v.x * v.x + v.y * v.y;
	d2 = min(d2, clp);
	var wB : f32 = 2.0 / 5.0 * d2 - 1.0;
	var wA : f32 = lob * d2 - 1.0;
	wB = wB * wB;
	wA = wA * wA;
	wB = 25.0 / 16.0 * wB - (25.0 / 16.0 - 1.0);
	var w : f32 = wB * wA;
	aC = aC + c * w;
    aW = aW + w;
    fsr1.aC = aC;
    fsr1.aW = aW;
    return fsr1;
}

fn FsrEasuSet(
	fsr : FsrSet, pp:vec2<f32>, biS:bool, biT:bool, biU:bool, biV:bool,
	lA:f32, lB:f32, lC:f32, lD:f32, lE:f32) -> FsrSet{
	var fsr1 : FsrSet = fsr;
    var dir : vec2<f32> = fsr1.dir;
    var len : f32 = fsr1.len;
	var w : f32 = 0.0;
	w = matchSet(pp,biS,biT,biU,biV);
	var dc:f32 = lD - lC;
	var cb:f32 = lC - lB;
	var lenX:f32 = max(abs(dc), abs(cb));
	lenX = 1.0 / lenX;
	var dirX :f32 = lD - lB;
	dir.x = dir.x + (dirX * w);
	lenX = saturate(abs(dirX) * lenX);
	lenX = lenX * lenX;
	len = len + (lenX * w);
	var ec :f32 = lE - lC;
	var ca : f32 = lC - lA;
	var lenY :f32 = max(abs(ec), abs(ca));
	lenY = 1.0 / lenY;
	var dirY:f32 = lE - lA;
	dir.y = dir.y + (dirY * w);
	lenY = saturate(abs(dirY) * lenY);
	lenY = lenY * lenY;
	len = len + (lenY * w);
    fsr1.dir = dir;
    fsr1.len = len;
    return fsr1;
}

fn gather_red_components(c: vec2<f32>) -> vec4<f32> { return textureGather(0,input,sam,c); }
fn gather_green_components(c: vec2<f32>) -> vec4<f32> { return textureGather(1,input,sam,c); }
fn gather_blue_components(c: vec2<f32>) -> vec4<f32> { return textureGather(2,input,sam,c); }

@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
	var inputSize : vec2<f32>;
    inputSize.x = resolution.inputwidth;
    inputSize.y = resolution.inputheight;
	var outputSize : vec2<f32>;
    outputSize.x = resolution.outputwidth;
    outputSize.y = resolution.outputheight;

    let baseIndex : vec2<i32> = vec2<i32>(global_id.xy);
    if (f32(baseIndex.x) >= outputSize.x || f32(baseIndex.y) >= outputSize.y) {
        return;
    }

	var pp:vec2<f32> = (floor(vec2<f32>(vec2<f32>(baseIndex)))) / outputSize * inputSize;
	var fp : vec2<f32> = floor(pp);
	pp = pp - fp;

	var p0 :vec2<f32> = fp + vec2<f32>(1.0, -1.0);
	var p1 : vec2<f32> = p0 + vec2<f32>(-1.0, 2.0);
	var p2: vec2<f32> = p0 + vec2<f32>(1.0, 2.0);
	var p3: vec2<f32> = p0 + vec2<f32>(0.0, 4.0);

	p0 = p0 / inputSize;
	p1 = p1 / inputSize;
	p2 = p2 / inputSize;
	p3 = p3 / inputSize;

	var bczzR : vec4<f32> = gather_red_components(p0);
	var bczzG : vec4<f32> = gather_green_components(p0);
	var bczzB : vec4<f32> = gather_blue_components(p0);
	var ijfeR : vec4<f32> = gather_red_components(p1);
	var ijfeG : vec4<f32> = gather_green_components(p1);
	var ijfeB : vec4<f32> = gather_blue_components(p1);
	var klhgR : vec4<f32> = gather_red_components(p2);
	var klhgG : vec4<f32> = gather_green_components(p2);
	var klhgB : vec4<f32> = gather_blue_components(p2);
	var zzonR : vec4<f32> = gather_red_components(p3);
	var zzonG : vec4<f32> = gather_green_components(p3);
	var zzonB : vec4<f32> = gather_blue_components(p3);

	var bczzL : vec4<f32> = bczzB * 0.5 + (bczzR * 0.5 + bczzG);
	var ijfeL : vec4<f32> = ijfeB * 0.5 + (ijfeR * 0.5 + ijfeG);
	var klhgL : vec4<f32> = klhgB * 0.5 + (klhgR * 0.5 + klhgG);
	var zzonL : vec4<f32> = zzonB * 0.5 + (zzonR * 0.5 + zzonG);

	var bL :f32 = bczzL.x;
	var cL :f32 = bczzL.y;
	var iL :f32 = ijfeL.x;
	var jL :f32 = ijfeL.y;
	var fL :f32 = ijfeL.z;
	var eL :f32 = ijfeL.w;
	var kL :f32 = klhgL.x;
	var lL :f32 = klhgL.y;
	var hL :f32 = klhgL.z;
	var gL :f32 = klhgL.w;
	var oL :f32 = zzonL.z;
	var nL :f32 = zzonL.w;

    var fsr:FsrSet;
	fsr.dir = vec2<f32>(0.0,0.0);
	fsr.len = 0.0;
	fsr = FsrEasuSet(fsr, pp, true, false, false, false, bL, eL, fL, gL, jL);
	fsr = FsrEasuSet(fsr, pp, false, true, false, false, cL, fL, gL, hL, kL);
	fsr = FsrEasuSet(fsr, pp, false, false, true, false, fL, iL, jL, kL, nL);
    fsr = FsrEasuSet(fsr, pp, false, false, false, true, gL, jL, kL, lL, oL);

	var dir2 :vec2<f32> = fsr.dir * fsr.dir;
	var dirR :f32 = dir2.x + dir2.y;
	var zro : bool = dirR < 1.0 / 32768.0;
	dirR = 1.0/(sqrt(dirR));
	if (zro) {dirR = 1.0;};
	if (zro) {fsr.dir.x = 1.0;};
	fsr.dir = fsr.dir * dirR;
	fsr.len = fsr.len * 0.5;
	fsr.len = fsr.len * fsr.len;
	var stretch :f32 = (fsr.dir.x * fsr.dir.x + fsr.dir.y * fsr.dir.y) * 1.0/(max(abs(fsr.dir.x), abs(fsr.dir.y)));
	var len2:vec2<f32> = vec2<f32>(1.0 + (stretch - 1.0) * fsr.len, 1.0 - 0.5 * fsr.len );
	var lob : f32 = 0.5 + ((1.0 / 4.0 - 0.04) - 0.5) * fsr.len;
	var clp : f32 = 1.0/lob;

	var min4 = min(min3(vec3<f32>(ijfeR.z, ijfeG.z, ijfeB.z), vec3<f32>(klhgR.w, klhgG.w, klhgB.w), vec3<f32>(ijfeR.y, ijfeG.y, ijfeB.y)),
		vec3<f32>(klhgR.x, klhgG.x, klhgB.x));
	var max4:vec3<f32> = max(max3(vec3<f32>(ijfeR.z, ijfeG.z, ijfeB.z), vec3<f32>(klhgR.w, klhgG.w, klhgB.w), vec3<f32>(ijfeR.y, ijfeG.y, ijfeB.y)),
		vec3<f32>(klhgR.x, klhgG.x, klhgB.x));

	var fsr2:FsrTap;
	fsr2.aC = vec3<f32>(0.0,0.0,0.0);
	fsr2.aW =0.0;
	fsr2=FsrEasuTap(fsr2, vec2<f32>(0.0, -1.0) - pp, fsr.dir, len2, lob, clp, vec3<f32>(bczzR.x, bczzG.x, bczzB.x));
	fsr2=FsrEasuTap(fsr2, vec2<f32>(1.0, -1.0) - pp, fsr.dir, len2, lob, clp, vec3<f32>(bczzR.y, bczzG.y, bczzB.y));
	fsr2=FsrEasuTap(fsr2, vec2<f32>(-1.0, 1.0) - pp, fsr.dir, len2, lob, clp, vec3<f32>(ijfeR.x, ijfeG.x, ijfeB.x));
	fsr2=FsrEasuTap(fsr2, vec2<f32>(0.0, 1.0) - pp, fsr.dir, len2, lob, clp, vec3<f32>(ijfeR.y, ijfeG.y, ijfeB.y));
	fsr2=FsrEasuTap(fsr2, vec2<f32>(0.0, 0.0) - pp, fsr.dir, len2, lob, clp, vec3<f32>(ijfeR.z, ijfeG.z, ijfeB.z));
	fsr2=FsrEasuTap(fsr2, vec2<f32>(-1.0, 0.0) - pp, fsr.dir, len2, lob, clp, vec3<f32>(ijfeR.w, ijfeG.w, ijfeB.w));
	fsr2=FsrEasuTap(fsr2, vec2<f32>(1.0, 1.0) - pp, fsr.dir, len2, lob, clp, vec3<f32>(klhgR.x, klhgG.x, klhgB.x));
	fsr2=FsrEasuTap(fsr2, vec2<f32>(2.0, 1.0) - pp, fsr.dir, len2, lob, clp, vec3<f32>(klhgR.y, klhgG.y, klhgB.y));
	fsr2=FsrEasuTap(fsr2, vec2<f32>(2.0, 0.0) - pp, fsr.dir, len2, lob, clp, vec3<f32>(klhgR.z, klhgG.z, klhgB.z));
	fsr2=FsrEasuTap(fsr2, vec2<f32>(1.0, 0.0) - pp, fsr.dir, len2, lob, clp, vec3<f32>(klhgR.w, klhgG.w, klhgB.w));
	fsr2=FsrEasuTap(fsr2, vec2<f32>(1.0, 2.0) - pp, fsr.dir, len2, lob, clp, vec3<f32>(zzonR.z, zzonG.z, zzonB.z));
	fsr2=FsrEasuTap(fsr2, vec2<f32>(0.0, 2.0) - pp, fsr.dir, len2, lob, clp, vec3<f32>(zzonR.w, zzonG.w, zzonB.w));

	var c : vec3<f32> = min(max4, max(min4, fsr2.aC * (1.0/fsr2.aW)));
	textureStore(rgbstorage, baseIndex, vec4<f32>(c, 1.0));
}
`;

export const FSR_RCAS_WGSL = `
struct Resolution{
   inputwidth:f32,
   inputheight:f32,
   outputwidth:f32,
   outputheight:f32,
}

@group(0) @binding(0) var input: texture_2d<f32>;
@group(0) @binding(1) var rgbstorage : texture_storage_2d<rgba8unorm, write>;
@group(1) @binding(0) var<uniform> resolution: Resolution;

fn min3f(a:f32,b:f32,c:f32)->f32{ return min(a, min(b,c)); }
fn max3f(a:f32,b:f32,c:f32)->f32{ return max(a, max(b,c)); }
fn saturate(num:f32)->f32{ return clamp(num,0.0,1.0); }

@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let sharpness : f32 = 0.0; // 0.0 (sharpest) to 2.0 (softest) - Changed to max sharpness
    
	var outputSize : vec2<f32>;
    outputSize.x = resolution.outputwidth;
    outputSize.y = resolution.outputheight;
    
    let baseIndex : vec2<i32> = vec2<i32>(global_id.xy);
    if (f32(baseIndex.x) >= outputSize.x || f32(baseIndex.y) >= outputSize.y) {
        return;
    }

    let FSR_RCAS_LIMIT :f32 = 0.25-(1.0/16.0);
    let inputdimension : vec2<i32> = vec2<i32>(textureDimensions(input, 0));

	let b : vec3<f32> = textureLoad(input,baseIndex + vec2<i32>(0, -1),0).rgb;
	let d : vec3<f32> = textureLoad(input,baseIndex + vec2<i32>(-1, 0),0).rgb;
	var e : vec3<f32> = textureLoad(input,baseIndex,0).rgb;
	let f : vec3<f32> = textureLoad(input,baseIndex + vec2<i32>(1, 0),0).rgb;
	let h : vec3<f32> = textureLoad(input,baseIndex + vec2<i32>(0, 1),0).rgb;

	var bR :f32 = b.r; var bG :f32 = b.g; var bB :f32 = b.b;
	var dR :f32 = d.r; var dG :f32 = d.g; var dB :f32 = d.b;
	var eR :f32 = e.r; var eG :f32 = e.g; var eB :f32 = e.b;
	var fR :f32 = f.r; var fG :f32 = f.g; var fB :f32 = f.b;
	var hR :f32 = h.r; var hG :f32 = h.g; var hB:f32  = h.b;

	var bL :f32  = bB * 0.5 + (bR * 0.5 + bG);
	var dL:f32  = dB * 0.5 + (dR * 0.5 + dG);
	var eL:f32  = eB * 0.5 + (eR * 0.5 + eG);
	var fL:f32  = fB * 0.5 + (fR * 0.5 + fG);
	var hL:f32  = hB * 0.5 + (hR * 0.5 + hG);

	var nz:f32 = 0.25 * bL + 0.25 * dL + 0.25 * fL + 0.25 * hL - eL;
	nz = saturate(abs(nz) * 1.0/(max3f(max3f(bL, dL, eL), fL, hL) - min3f(min3f(bL, dL, eL), fL, hL)));
	nz = -0.5 * nz + 1.0;

	var mn4R :f32 =  min(min3f(bR, dR, fR), hR);
	var mn4G :f32  = min(min3f(bG, dG, fG), hG);
	var mn4B :f32  = min(min3f(bB, dB, fB), hB);
	var mx4R :f32  = max(max3f(bR, dR, fR), hR);
	var mx4G :f32  = max(max3f(bG, dG, fG), hG);
	var mx4B :f32  = max(max3f(bB, dB, fB), hB);

	var peakC :vec2<f32> = vec2<f32>( 1.0, -1.0 * 4.0 );

	var hitMinR :f32  = min(mn4R, eR) * 1.0/(4.0 * mx4R);
	var hitMinG :f32 = min(mn4G, eG) * 1.0/(4.0 * mx4G);
	var hitMinB :f32  = min(mn4B, eB) * 1.0/(4.0 * mx4B);
	var hitMaxR :f32 = (peakC.x - max(mx4R, eR)) * 1.0/(4.0 * mn4R + peakC.y);
	var hitMaxG :f32  = (peakC.x - max(mx4G, eG)) * 1.0/(4.0 * mn4G + peakC.y);
	var hitMaxB :f32 = (peakC.x - max(mx4B, eB)) * 1.0/(4.0 * mn4B + peakC.y);
	var lobeR:f32  = max(-hitMinR, hitMaxR);
	var lobeG:f32  = max(-hitMinG, hitMaxG);
	var lobeB :f32  = max(-hitMinB, hitMaxB);
	var lobe :f32  = max(-FSR_RCAS_LIMIT, min(max3f(lobeR, lobeG, lobeB), 0.0)) * sharpness;

	lobe = lobe * nz;

	var rcpL :f32  = 1.0/(4.0 * lobe + 1.0);
	var c:vec3<f32>  = vec3<f32>(
		(lobe * bR + lobe * dR + lobe * hR + lobe * fR + eR) * rcpL,
		(lobe * bG + lobe * dG + lobe * hG + lobe * fG + eG) * rcpL,
		(lobe * bB + lobe * dB + lobe * hB + lobe * fB + eB) * rcpL
	);
	textureStore(rgbstorage, baseIndex, vec4<f32>(c, 1.0));
}
`;
