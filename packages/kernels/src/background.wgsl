struct View { size: vec2f, time: f32, exposure: f32 }
@group(0) @binding(0) var<uniform> view: View;
struct VOut { @builtin(position) position: vec4f, @location(0) uv: vec2f }
@vertex fn vertexMain(@builtin(vertex_index) i: u32) -> VOut {
 let p = array<vec2f,3>(vec2f(-1.0,-1.0),vec2f(3.0,-1.0),vec2f(-1.0,3.0));
 var o: VOut; o.position=vec4f(p[i],0.999,1.0);o.uv=p[i];return o;
}
fn hash(p: vec2f) -> f32 { return fract(sin(dot(p,vec2f(127.1,311.7)))*43758.5453); }
fn noise(p: vec2f) -> f32 {let i=floor(p);let f=fract(p);let u=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2f(1,0)),u.x),mix(hash(i+vec2f(0,1)),hash(i+vec2f(1,1)),u.x),u.y);}
fn stars(p:vec2f,scale:f32,threshold:f32) -> vec3f {
 let grid=p*scale;let cell=floor(grid);let h=hash(cell);let loc=fract(grid)-vec2f(hash(cell+4.71),hash(cell+9.27));
 let radius=0.035+0.055*hash(cell+12.3);let d=length(loc);let spot=exp(-d*d/(radius*radius));
 let star=step(threshold,h)*spot*(0.3+0.7*hash(cell+4.4));
 return mix(vec3f(0.57,0.71,1.0),vec3f(1.0,0.84,0.68),hash(cell+2.0))*star;
}
@fragment fn fragmentMain(in:VOut)->@location(0) vec4f {
 let p=vec2f(in.uv.x*view.size.x/view.size.y,in.uv.y);
 let cloud=noise(p*2.3+2.0)*0.55+noise(p*5.7)*0.3+noise(p*12.0)*0.15;
 let band=exp(-pow(p.y*0.9+p.x*0.38-0.1,2.0)*3.5);
 var color=vec3f(0.012,0.017,0.032)+vec3f(0.029,0.026,0.055)*cloud*band;
 color+=vec3f(0.008,0.012,0.016)*noise(p*29.0)*band;
 color+=stars(p+17.0,40.0,0.974)*0.85+stars(p+20.0,85.0,0.99)*0.60+stars(p+54.0,170.0,0.996)*0.35;
 let vignette=1.0-clamp(length(in.uv)*0.16,0.0,0.32);
 return vec4f(color*vignette*view.exposure,1.0);
}
