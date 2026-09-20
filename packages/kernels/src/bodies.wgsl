struct Body { screen:vec4f, colorKind:vec4f, lightTemp:vec4f, extra:vec4f, rotation:vec4f }
struct View { size:vec2f, time:f32, exposure:f32 }
@group(0) @binding(0) var<storage,read> bodies:array<Body>;
@group(0) @binding(1) var<uniform> view:View;
struct VOut { @builtin(position) position:vec4f, @location(0) uv:vec2f, @location(1) @interpolate(flat) index:u32 }
@vertex fn vertexMain(@builtin(vertex_index) vertex:u32,@builtin(instance_index) instance:u32)->VOut {
 let corners=array<vec2f,6>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),vec2f(-1,1),vec2f(1,-1),vec2f(1,1));
 let b=bodies[instance];let extent=select(1.18,2.7,b.colorKind.w==0.0||b.extra.y>0.0||b.colorKind.w==5.0);
 let local=corners[vertex]*extent;let p=b.screen.xy+local*b.screen.z;
 var out:VOut;out.position=vec4f(p.x/view.size.x*2.0-1.0,1.0-p.y/view.size.y*2.0,0.5,1.0);out.uv=local;out.index=instance;return out;
}
fn hash3(p:vec3f)->f32{return fract(sin(dot(p,vec3f(127.1,311.7,74.7)))*43758.5453);}
fn noise3(p:vec3f)->f32 {
 let i=floor(p);let f=fract(p);let u=f*f*(3.0-2.0*f);
 return mix(mix(mix(hash3(i),hash3(i+vec3f(1,0,0)),u.x),mix(hash3(i+vec3f(0,1,0)),hash3(i+vec3f(1,1,0)),u.x),u.y),mix(mix(hash3(i+vec3f(0,0,1)),hash3(i+vec3f(1,0,1)),u.x),mix(hash3(i+vec3f(0,1,1)),hash3(i+vec3f(1,1,1)),u.x),u.y),u.z);
}
fn fbm(p:vec3f)->f32 {return noise3(p)*0.55+noise3(p*2.07+13.1)*0.27+noise3(p*4.17+7.8)*0.13+noise3(p*8.13)*0.05;}
@fragment fn fragmentMain(in:VOut)->@location(0) vec4f {
 let b=bodies[in.index];let q=in.uv;let r=length(q);let kind=b.colorKind.w;let base=b.colorKind.rgb;let temp=b.lightTemp.w;
 var color=vec3f(0.0);var alpha=0.0;
 if (kind==0.0) {
  if(r<=1.0){let z=sqrt(max(0.0,1.0-r*r));let n=vec3f(q,z);let turbulence=fbm(n*9.0+vec3f(view.time*0.025));color=base*(0.85+0.65*z+0.55*turbulence);alpha=1.0;}
  else{let halo=exp(-(r-1.0)*5.0)*0.65;let flare=pow(max(0.0,sin(atan2(q.y,q.x)*17.0+view.time*0.07)),12.0)*exp(-(r-1.0)*7.0);color=base*(1.3+flare);alpha=halo;}
 } else if(kind==5.0) {
  let disk=length(vec2f(q.x,q.y*3.8));let accretion=exp(-pow((disk-1.25)*2.7,2.0));color=vec3f(0.98,0.53,0.25)*(0.55+0.5*sin(disk*48.0))*accretion;alpha=accretion*0.85;
  if(r<0.6){color=vec3f(0.002,0.003,0.008);alpha=1.0;}else{let photon=exp(-pow((r-0.65)*24.0,2.0));color+=base*photon*1.5;alpha=max(alpha,photon);}
 } else {
  if(r<=1.0){let n=vec3f(q.x,-q.y,sqrt(max(0.0,1.0-r*r)));let rotation=b.rotation.x;let p=vec3f(n.x*cos(rotation)+n.z*sin(rotation),n.y,-n.x*sin(rotation)+n.z*cos(rotation));
   let light=normalize(b.lightTemp.xyz);let diffuse=max(0.0,dot(n,light));var albedo=base;
   if(kind==1.0){let terrain=fbm(p*3.8+b.extra.x*0.001);let land=smoothstep(0.47,0.515,terrain);let arid=smoothstep(0.12,0.36,abs(p.y));let landColor=mix(vec3f(0.19,0.39,0.25),vec3f(0.59,0.49,0.30),arid*0.7);albedo=mix(vec3f(0.028,0.18,0.39),landColor,land);let clouds=smoothstep(0.60,0.73,fbm(p*10.0+6.0));albedo=mix(albedo,vec3f(0.92,0.96,1.0),clouds*0.87);let ice=smoothstep(clamp((temp-210.0)/100.0,0.0,0.95),1.0,abs(p.y));albedo=mix(albedo,vec3f(0.83,0.92,0.99),ice);let spec=pow(max(0.0,dot(reflect(-light,n),vec3f(0,0,1))),35.0);albedo+=vec3f(spec*0.4*(1.0-land));}
   else if(kind==2.0){let wave=sin(p.y*43.0+noise3(p*7.0)*3.2)*0.5+0.5;let stripes=mix(vec3f(0.63,0.43,0.31),vec3f(0.99,0.91,0.75),wave);albedo=base*stripes;let spot=exp(-pow((p.x+0.28)*6.0,2.0)-pow((p.y+0.23)*18.0,2.0));albedo=mix(albedo,vec3f(0.64,0.26,0.14),spot*0.72);}
   else if(kind==4.0){albedo*=0.85+0.15*sin(p.y*25.0+noise3(p*5.0));}
   else {let terrain=fbm(p*13.0+b.extra.x*0.003);albedo*=0.52+terrain*0.75;let crater=noise3(p*40.0);albedo*=0.85+0.25*crater;}
   color=albedo*(0.10+diffuse*0.97);let rim=pow(1.0-n.z,3.4);if(kind==1.0||kind==4.0)color+=vec3f(0.11,0.40,0.88)*rim*(0.25+diffuse*0.7);
   if(temp>900.0){let heat=clamp((temp-900.0)/4000.0,0.0,1.0);color=mix(color,vec3f(1.0,0.24+0.45*heat,0.045)*(.8+.3*noise3(p*20.0)),heat*0.9);}
   if(b.rotation.y>0.5){let t=clamp((temp-50.0)/1500.0,0.0,1.0);color=mix(vec3f(0.08,0.22,0.85),vec3f(1.0,0.26,0.07),t)*(0.35+diffuse*.65);}
   alpha=1.0;
  }else if(kind==1.0||kind==4.0){color=vec3f(0.12,0.42,0.85);alpha=exp(-(r-1.0)*36.0)*0.32;}
  if(b.extra.y>0.5){let angle=-0.27;let rq=vec2f(q.x*cos(angle)-q.y*sin(angle),q.x*sin(angle)+q.y*cos(angle));let rr=length(vec2f(rq.x,rq.y*3.3));if(rr>1.35&&rr<2.5&&(r>1.0||rq.y>0.0)){let ring=0.52+0.20*sin(rr*95.0)+0.11*sin(rr*233.0);let gap=smoothstep(0.012,0.025,abs(rr-2.05));let shade=select(0.55,1.0,rq.x*b.lightTemp.x+rq.y*b.lightTemp.y>0.0);color=base*ring*shade;alpha=0.7*gap;}}
 }
 if(alpha<0.004){discard;}
 return vec4f(color*view.exposure,alpha);
}
