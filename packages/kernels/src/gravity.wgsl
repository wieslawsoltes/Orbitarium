// AU / day / solar-mass f32 solver. 64-wide, barrier-safe tiled all-pairs kernel.
struct Body { positionMass: vec4f, velocityRadius: vec4f }
struct Params { count: u32, dt: f32, g: f32, epsilon2: f32 }
@group(0) @binding(0) var<storage, read> inputBodies: array<Body>;
@group(0) @binding(1) var<storage, read_write> outputBodies: array<Body>;
@group(0) @binding(2) var<uniform> params: Params;
var<workgroup> tile: array<vec4f, 64>;
fn acceleration(index: u32, position: vec3f) -> vec3f {
 var result = vec3f(0.0);
 for (var base = 0u; base < params.count; base += 64u) {
  let source = base + index % 64u;
  tile[index % 64u] = vec4f(0.0);
  if (source < params.count) { tile[index % 64u] = inputBodies[source].positionMass; }
  workgroupBarrier();
  let count = min(64u, params.count - base);
  for (var j = 0u; j < count; j++) {
   let body = tile[j];
   let r = body.xyz - position;
   let d2 = dot(r,r) + params.epsilon2;
   if (base+j != index && d2 > 0.0) { result += r * (params.g * body.w * inverseSqrt(d2) / d2); }
  }
  workgroupBarrier();
 }
 return result;
}
@compute @workgroup_size(64)
fn drift(@builtin(global_invocation_id) tid: vec3u) {
 let i = tid.x;
 var b: Body;
 if (i < params.count) { b = inputBodies[i]; }
 // Padded invocations MUST participate in all workgroup barriers.
 let a = acceleration(i,b.positionMass.xyz);
 if (i < params.count) {
  let halfVelocity = b.velocityRadius.xyz + a * (params.dt*0.5);
  outputBodies[i].positionMass = vec4f(b.positionMass.xyz + halfVelocity*params.dt, b.positionMass.w);
  outputBodies[i].velocityRadius = vec4f(halfVelocity,b.velocityRadius.w);
 }
}
@compute @workgroup_size(64)
fn kick(@builtin(global_invocation_id) tid: vec3u) {
 let i = tid.x;
 var b: Body;
 if (i < params.count) { b = inputBodies[i]; }
 let a = acceleration(i,b.positionMass.xyz);
 if (i < params.count) {
  outputBodies[i].positionMass = b.positionMass;
  outputBodies[i].velocityRadius = vec4f(b.velocityRadius.xyz + a*(params.dt*0.5),b.velocityRadius.w);
 }
}
