/** GLSL for the 3D view: the sky dome (gradient, sun, moon, stars) and the animated water surface. */

export const SKY_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const SKY_FRAGMENT = /* glsl */ `
  varying vec3 vDir;
  uniform vec3 uSunDir;
  uniform vec3 uHorizon;
  uniform vec3 uZenith;
  uniform float uDay;
  uniform float uDusk;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y, 0.0, 1.0);
    vec3 col = mix(uHorizon, uZenith, pow(h, 0.5));
    if (d.y < 0.0) col = mix(uHorizon, uHorizon * 0.55, clamp(-d.y * 4.0, 0.0, 1.0)); // below the horizon

    // sun: soft glow, warmer at dusk, and a bright disc
    float s = max(dot(d, uSunDir), 0.0);
    vec3 glow = mix(vec3(1.0, 0.86, 0.6), vec3(1.0, 0.55, 0.25), uDusk);
    col += glow * (pow(s, 6.0) * 0.28 + pow(s, 64.0) * 0.5) * (0.25 + 0.75 * uDay);
    col += vec3(1.0, 0.97, 0.88) * smoothstep(0.9993, 0.9998, s) * 1.6 * smoothstep(-0.05, 0.05, uSunDir.y);

    // moon: opposite the sun
    vec3 moonDir = vec3(-uSunDir.x, -uSunDir.y, -uSunDir.z);
    float m = max(dot(d, moonDir), 0.0);
    float night = 1.0 - uDay;
    col += vec3(0.62, 0.72, 1.0) * pow(m, 40.0) * 0.18 * night;
    col += vec3(0.92, 0.95, 1.0) * smoothstep(0.9990, 0.9996, m) * 1.3 * night * smoothstep(-0.05, 0.05, moonDir.y);

    // stars: sparse bright cells of a fine grid, fading out towards the horizon and with daylight
    // (each star is a soft round dot inside its grid cell, not the whole square cell)
    vec3 cell = floor(d * 260.0);
    float r = hash(cell);
    float dot2 = length(fract(d * 260.0) - 0.5);
    float star = step(0.9968, r) * (0.55 + 0.45 * hash(cell + 7.0)) * smoothstep(0.42, 0.05, dot2);
    col += vec3(star) * night * smoothstep(0.02, 0.35, d.y);

    gl_FragColor = vec4(col, 1.0);
  }
`

export const WATER_VERTEX = /* glsl */ `
  uniform float uTime;
  attribute float aDepth;
  attribute float aWave; // 1 around the island, 0 on the huge outer sea (flat: coarse vertices would alias)
  varying vec3 vWorld;
  varying float vDepth;

  float wave(vec2 p) {
    return sin(p.x * 0.55 + uTime * 1.3) * 0.5 + sin(p.y * 0.7 - uTime * 1.7) * 0.35 + sin((p.x + p.y) * 0.31 + uTime * 0.9) * 0.5;
  }

  void main() {
    vec3 pos = position;
    float amp = 0.07 + 0.11 * smoothstep(0.0, 6.0, aDepth); // calmer in the shallows
    pos.y += wave(pos.xz) * amp * aWave;
    vWorld = (modelMatrix * vec4(pos, 1.0)).xyz;
    vDepth = aDepth;
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  }
`

export const WATER_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uLightColor;
  uniform vec3 uHorizon;
  uniform vec3 uZenith;
  uniform float uDay;
  varying vec3 vWorld;
  varying float vDepth;

  // analytic slope of the same waves as in the vertex shader (for the normal)
  vec2 slope(vec2 p) {
    float a = cos(p.x * 0.55 + uTime * 1.3) * 0.55 * 0.5 + cos((p.x + p.y) * 0.31 + uTime * 0.9) * 0.31 * 0.5;
    float b = cos(p.y * 0.7 - uTime * 1.7) * 0.7 * 0.35 + cos((p.x + p.y) * 0.31 + uTime * 0.9) * 0.31 * 0.5;
    return vec2(a, b);
  }

  void main() {
    float dk = smoothstep(0.0, 9.0, vDepth);
    float amp = 0.07 + 0.11 * smoothstep(0.0, 6.0, vDepth);
    vec2 sl = slope(vWorld.xz) * amp * 2.2;
    // finer ripples: three waves travelling in different directions (no visible grid)
    vec2 p = vWorld.xz;
    sl += vec2(0.92, 0.39) * cos(dot(p, vec2(0.92, 0.39)) * 2.3 + uTime * 2.2) * 0.030;
    sl += vec2(-0.50, 0.87) * cos(dot(p, vec2(-0.50, 0.87)) * 3.1 - uTime * 1.8) * 0.022;
    sl += vec2(0.71, -0.71) * cos(dot(p, vec2(0.71, -0.71)) * 4.3 + uTime * 2.9) * 0.014;
    vec3 N = normalize(vec3(-sl.x, 1.0, -sl.y));
    vec3 V = normalize(cameraPosition - vWorld);

    vec3 shallow = vec3(0.17, 0.58, 0.64);
    vec3 deep = vec3(0.025, 0.115, 0.24);
    vec3 base = mix(shallow, deep, dk) * (0.22 + 0.78 * uDay);

    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    vec3 sky = mix(uHorizon, uZenith, 0.55);
    vec3 col = mix(base, sky, clamp(fres * 0.85 + 0.08, 0.0, 1.0));

    // sun / moon glitter
    vec3 R = reflect(-normalize(uSunDir), N);
    float spec = pow(max(dot(R, V), 0.0), 70.0);
    float far = 1.0 / (1.0 + 0.006 * distance(cameraPosition, vWorld)); // fine glints fade with distance (no aliasing)
    col += uLightColor * spec * far * (0.25 + 1.5 * uDay) * step(0.0, uSunDir.y);

    // foam where the water is very shallow: bands that wash in and out
    float band = 0.5 + 0.5 * sin(vDepth * 16.0 - uTime * 2.4 + sl.x * 8.0);
    float foam = smoothstep(1.4, 0.05, vDepth) * band;
    col = mix(col, vec3(0.96, 0.98, 1.0) * (0.3 + 0.7 * uDay), foam * 0.7);

    float alpha = max(mix(0.5, 0.95, dk), foam * 0.85);
    // atmospheric fade into the horizon colour, same range as the scene fog
    float fogF = smoothstep(260.0, 800.0, distance(cameraPosition, vWorld));
    col = mix(col, uHorizon, fogF);
    alpha = mix(alpha, 1.0, fogF);
    gl_FragColor = vec4(col, alpha);
  }
`

/** Bioluminescence: a camera-facing soft disc per glowing creature (instanced; additive blending). */
export const GLOW_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vColor;
  void main() {
    vUv = uv;
    vColor = instanceColor;
    // billboard: the instance position is moved to view space, then the quad is spread in the view plane
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float radius = length(instanceMatrix[0].xyz);
    mv.xy += (uv - 0.5) * 2.0 * radius;
    gl_Position = projectionMatrix * mv;
  }
`

export const GLOW_FRAGMENT = /* glsl */ `
  uniform float uStrength;
  varying vec2 vUv;
  varying vec3 vColor;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float a = pow(max(1.0 - d, 0.0), 2.2);
    gl_FragColor = vec4(vColor * a * uStrength, a);
  }
`

/** Fireflies: points drifting around their anchor and blinking, visible only at night. */
export const FIREFLY_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uNight;
  uniform float uSize;
  attribute float aPhase;
  varying float vAlpha;
  void main() {
    float t = uTime + aPhase * 20.0;
    vec3 p = position;
    p += vec3(sin(t * 0.7) * 1.2 + sin(t * 1.9) * 0.4, sin(t * 1.3) * 0.5, cos(t * 0.6) * 1.2 + cos(t * 1.7) * 0.4);
    vec4 mv = viewMatrix * vec4(p, 1.0);
    gl_PointSize = uSize * (160.0 / max(-mv.z, 1.0));
    gl_Position = projectionMatrix * mv;
    vAlpha = uNight * smoothstep(0.25, 0.9, 0.5 + 0.5 * sin(t * 2.3 + aPhase * 6.0));
  }
`

export const FIREFLY_FRAGMENT = /* glsl */ `
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = pow(max(1.0 - d, 0.0), 2.0) * vAlpha;
    gl_FragColor = vec4(vec3(0.78, 1.0, 0.35) * a * 1.6, a);
  }
`
