// GLSL for the Moon, its halo, the sky background and stars (WebGL2 / GLSL ES 3.0 via three.js).
const COMMON = /* glsl */ `
  vec3 acesFilm(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  }
  vec3 toSrgb(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
  }
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
`;

export const MOON_VERT = /* glsl */ `
  varying vec3 vBody;
  void main() {
    vBody = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const MOON_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D uColor;
  uniform sampler2D uNormal;
  uniform vec3 uSun;
  uniform vec3 uView;
  uniform float uRelief;
  uniform float uEarthshine;
  uniform float uExposure;
  uniform vec3 uTint;
  uniform float uFullLight;
  uniform float uPhaseL;
  uniform mat3 uBodyToEqj;
  uniform vec3 uMoonGeo;
  uniform vec3 uShadowAxis;
  uniform float uSunDist;
  uniform float uEarthR;
  uniform float uSunR;
  uniform float uEclipseOn;
  uniform float uDither;
  varying vec3 vBody;
  const float PI = 3.141592653589793;
  const float TAU = 6.283185307179586;
  ${COMMON}

  void main() {
    vec3 n = normalize(vBody);
    float lon = atan(n.y, n.x);
    float lat = asin(clamp(n.z, -1.0, 1.0));
    vec2 uvA = vec2(lon / TAU + 0.5, 0.5 + lat / PI);
    vec2 uvB = vec2(fract(uvA.x + 0.5) - 0.5, uvA.y);
    vec2 uv = fwidth(uvA.x) <= fwidth(uvB.x) + 1e-5 ? uvA : uvB;
    vec2 gx = dFdx(uv);
    vec2 gy = dFdy(uv);
    vec3 albedo = textureGrad(uColor, uv, gx, gy).rgb;
    vec3 tn = textureGrad(uNormal, uv, gx, gy).rgb * 2.0 - 1.0;
    float cl = cos(lat);
    vec3 east = cl > 1e-4 ? vec3(-sin(lon), cos(lon), 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 north = vec3(-sin(lat) * cos(lon), -sin(lat) * sin(lon), cl);
    vec3 np = normalize(east * (tn.x * uRelief) + north * (tn.y * uRelief) + n * tn.z);

    vec3 L = mix(uSun, uView, uFullLight);
    float mu0p = dot(np, L);
    float mu0g = dot(n, L);
    float mu = max(dot(n, uView), 0.0);
    // lunar-Lambert photometry on the smooth sphere ...
    float g0 = max(mu0g, 0.0);
    float base = 2.0 * uPhaseL * g0 / (g0 + mu + 1e-4) + (1.0 - uPhaseL) * g0;
    // ... modulated by LOLA relief (strong near the terminator, faded toward the limb)
    float bump = clamp(mu0p / max(mu0g, 0.06), 0.0, 2.6);
    float rel = smoothstep(0.02, 0.32, mu);
    float lit = base * mix(1.0, bump, rel);
    lit *= smoothstep(-0.018, 0.03, mu0g);
    vec3 col = albedo * lit * 1.55;

    // earthshine on the night side
    float night = 1.0 - smoothstep(-0.05, 0.08, mu0g);
    col += albedo * vec3(0.70, 0.80, 1.0) * uEarthshine * pow(mu, 0.7) * night;

    if (uEclipseOn > 0.5) {
      vec3 P = uMoonGeo + uBodyToEqj * (n * 1737.4);
      float d = dot(P, uShadowAxis);
      vec3 perp = P - d * uShadowAxis;
      float r = length(perp);
      float ru = uEarthR - d * (uSunR - uEarthR) / uSunDist;
      float rp = uEarthR + d * (uSunR + uEarthR) / uSunDist;
      float pen = clamp((r - ru) / (rp - ru), 0.0, 1.0);
      float sunVis = pen * pen * (3.0 - 2.0 * pen);
      float depth = clamp(r / ru, 0.0, 1.0);
      vec3 umbra = mix(vec3(0.16, 0.028, 0.010), vec3(0.78, 0.25, 0.07), smoothstep(0.2, 1.0, depth)) * 0.07;
      umbra += vec3(0.04, 0.17, 0.24) * 0.05 * exp(-pow((depth - 0.985) / 0.03, 2.0));
      float inUmbra = 1.0 - smoothstep(ru - 25.0, ru + 25.0, r);
      vec3 lit2 = col * mix(0.02, 1.0, sunVis);
      vec3 red = albedo * umbra * (0.55 + 0.45 * mu) * 1.6;
      col = mix(lit2, red, inUmbra);
    }

    col *= uTint * uExposure;
    col = acesFilm(col);
    vec3 outc = toSrgb(col);
    outc += (hash12(gl_FragCoord.xy) - 0.5) * uDither;
    gl_FragColor = vec4(outc, 1.0);
  }
`;

export const HALO_VERT = /* glsl */ `
  varying vec2 vP;
  uniform float uSize;
  void main() {
    vP = position.xy * uSize;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy * uSize, 0.0, 1.0);
  }
`;

export const HALO_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vP;
  uniform vec2 uSunScreen;
  uniform float uIllum;
  uniform float uStrength;
  uniform vec3 uTint;
  uniform float uMoonR;
  ${COMMON}
  void main() {
    float r = length(vP) / uMoonR;
    if (r < 0.985) discard;
    float x = r - 1.0;
    float fall = exp(-x * 7.0) * 0.42 + exp(-x * 2.2) * 0.38 + exp(-x * 0.7) * 0.2;
    fall *= smoothstep(0.0, 0.035, x) * 0.75 + 0.25;
    float w = 1.0;
    if (length(uSunScreen) > 0.01) {
      float c = dot(normalize(vP), normalize(uSunScreen));
      w = mix(1.0, smoothstep(-0.75, 1.0, c), 1.0 - uIllum);
    }
    float a = fall * w * uStrength * (0.12 + 0.88 * pow(uIllum, 0.8));
    vec3 c = toSrgb(uTint * vec3(0.93, 0.91, 0.86)) * a;
    c += (hash12(gl_FragCoord.xy) - 0.5) * 0.006;
    gl_FragColor = vec4(c, 1.0);
  }
`;

export const BG_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const BG_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform vec2 uRes;
  uniform vec3 uTop;
  uniform vec3 uBottom;
  uniform vec3 uGlow;
  uniform vec2 uGlowPos;
  ${COMMON}
  void main() {
    vec2 p = vUv;
    vec3 c = mix(uBottom, uTop, smoothstep(0.0, 1.0, p.y));
    vec2 d = (p - uGlowPos) * vec2(uRes.x / uRes.y, 1.0);
    c += uGlow * exp(-dot(d, d) * 3.2);
    c += (hash12(gl_FragCoord.xy) - 0.5) / 255.0 * 1.6;
    gl_FragColor = vec4(c, 1.0);
  }
`;

export const STAR_VERT = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  varying vec3 vColor;
  uniform float uPixelRatio;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixelRatio;
  }
`;

export const STAR_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vColor;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    float a = exp(-d * d * 4.0);
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor * a, 1.0);
  }
`;
