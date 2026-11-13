/**
 * WebGL2 实时液态玻璃光学折射与三维奇想渲染引擎
 * 覆盖「时间变换 (time) · 情绪变换 (mood) · 空间变换 (space)」三大维度：
 * 1. time：像素级对齐四代海湾画卷（太初/盛世/赛博/星海）+ 实时天光流变、火盆/霓虹脉冲、赛博微雨/星尘微粒与动态波光倒影（内置未就绪画卷安全兜底）
 * 2. mood：纯 GPU 程序化连续流体心灵气象（澄明晨光水天一色 -> 炽烈日冕热浪金箔 -> 孤寂暴雨涟漪孤灯 -> 梦境失重虹彩薄膜极光）
 * 3. space：纯 GPU 实时尺度跃迁（微观纳米叶脉露晶折射 -> 苍穹沧海云涡孤岛 -> 轨道平流层星弧极光 -> 奇点黑洞事件视界与爱因斯坦环）
 * 4. 液态玻璃光学：严密保证雅可比正定（Jacobian > 0）的 S 型壁厚向内弯折聚光折射、晶莹全透明玻璃耳部、边缘全内反射暗环、双层菲涅尔亮丝与交互水波纹冲击波
 */

(function (global) {
  'use strict';

const VALID_DIMENSIONS = ['time', 'mood', 'space'];
const TIME_KEYS = ['ancient', 'golden', 'neon', 'astral'];
const MAX_RIPPLES = 4;
const RIPPLE_DURATION_SEC = 1.35;

function getStageMetrics(aspect) {
  const safeAspect = Math.max(1.4, aspect || 2.52);
  const pillHalfH = 0.352;
  const pillHalfW = Math.min(safeAspect * 0.448, 1.112);
  const pillRadius = pillHalfH;
  const borderWidth = 0.0165;

  const lensBaseW = 0.256;
  const lensBaseH = pillHalfH + 0.044; // 0.396，圆润饱满的 Liquid Glass 比例，上下透明微凸 4.4%
  const travelSpan = Math.max(0.1, pillHalfW - lensBaseW * 1.035);

  const uStart = 0.5 - travelSpan / safeAspect;
  const uEnd = 0.5 + travelSpan / safeAspect;
  const lensHalfU = lensBaseW / safeAspect;

  return {
    aspect: safeAspect,
    pillHalfH,
    pillHalfW,
    pillRadius,
    borderWidth,
    lensBaseW,
    lensBaseH,
    travelSpan,
    uStart,
    uEnd,
    lensHalfU,
  };
}

const VERTEX_SHADER = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uTexAncient;
uniform sampler2D uTexGolden;
uniform sampler2D uTexNeon;
uniform sampler2D uTexAstral;
uniform vec4 uLoaded;

uniform int uDimension; // 0 = time, 1 = mood, 2 = space
uniform float uAspect;
uniform float uTime;
uniform float uProgress;
uniform float uSquash;
uniform float uTilt;
uniform float uHover;
uniform float uPress;
uniform vec2 uParallax;
uniform float uIsDark;
uniform float uMode;

uniform float uRefraction;
uniform float uDispersion;
uniform float uMagnify;
uniform float uParticles;

// xy = centered aspect world coord, z = age in seconds (< 0 inactive), w = intensity
uniform vec4 uRipples[4];

// ============================================================================
// 基础数学与程序化噪声工具
// ============================================================================
float safeTanh(float x) {
  float e = exp(2.0 * clamp(x, -7.0, 7.0));
  return (e - 1.0) / (e + 1.0);
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm3(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
  for (int i = 0; i < 3; i++) {
    v += a * valueNoise(p);
    p = rot * p * 2.04 + vec2(13.1, 7.7);
    a *= 0.5;
  }
  return v;
}

float fbm4(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
  for (int i = 0; i < 4; i++) {
    v += a * valueNoise(p);
    p = rot * p * 2.03 + vec2(11.3, 19.7);
    a *= 0.5;
  }
  return v;
}

float voronoiEdge(vec2 x) {
  vec2 n = floor(x);
  vec2 f = fract(x);
  vec2 mr = vec2(0.0);
  vec2 mg = vec2(0.0);
  float md = 8.0;

  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash22(n + g);
      vec2 r = g + (0.18 + 0.64 * o) - f;
      float d = dot(r, r);
      if (d < md) {
        md = d;
        mr = r;
        mg = g;
      }
    }
  }

  float edgeDist = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = mg + vec2(float(i), float(j));
      vec2 o = hash22(n + g);
      vec2 r = g + (0.18 + 0.64 * o) - f;
      if (dot(mr - r, mr - r) > 1e-5) {
        edgeDist = min(edgeDist, dot(0.5 * (mr + r), normalize(r - mr)));
      }
    }
  }
  return edgeDist;
}

float sdRoundBox(vec2 p, vec2 halfExtents, float radius) {
  vec2 q = abs(p) - (halfExtents - vec2(radius));
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

vec2 rotate2D(vec2 p, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

float revSmooth(float hi, float lo, float x) {
  return 1.0 - smoothstep(lo, hi, x);
}

vec4 computeCircularWeights(float sWrapped) {
  float d0 = min(abs(sWrapped - 0.0), 4.0 - abs(sWrapped - 0.0));
  float d1 = min(abs(sWrapped - 1.0), 4.0 - abs(sWrapped - 1.0));
  float d2 = min(abs(sWrapped - 2.0), 4.0 - abs(sWrapped - 2.0));
  float d3 = min(abs(sWrapped - 3.0), 4.0 - abs(sWrapped - 3.0));
  vec4 w = vec4(
    revSmooth(1.0, 0.0, d0),
    revSmooth(1.0, 0.0, d1),
    revSmooth(1.0, 0.0, d2),
    revSmooth(1.0, 0.0, d3)
  );
  return w / max(0.0001, dot(w, vec4(1.0)));
}

// 无规律随机错落斜雨（列相移 + 独立纵向偏移 + 随机长度，消除条码网格感）
vec2 sampleRainStreak(vec2 coord, float colFreq, float rowFreq, float fallSpeed, float angle, float densityThresh, float seed) {
  vec2 rp = rotate2D(coord, angle) * vec2(colFreq, rowFreq);
  float colId = floor(rp.x);
  float colRnd = hash21(vec2(colId, seed));
  rp.y += uTime * fallSpeed * (0.84 + 0.32 * colRnd) + colRnd * 13.73;
  vec2 cell = floor(rp);
  vec2 local = fract(rp) - 0.5;
  vec2 h = hash22(cell + vec2(seed, seed * 1.37));
  if (h.x <= densityThresh) return vec2(0.0);
  float hLen = hash21(cell + seed + 41.3);
  float hY = hash21(cell + seed + 89.7);
  float offX = (h.y - 0.5) * 0.72;
  float offY = (hY - 0.5) * 0.44;
  float halfLen = 0.10 + 0.14 * hLen;
  float dy = local.y - offY;
  float xProfile = revSmooth(0.052, 0.008, abs(local.x - offX));
  float yProfile = revSmooth(halfLen, halfLen * 0.18, abs(dy));
  float headBias = mix(0.65, 1.15, clamp(0.5 - dy / max(0.01, halfLen * 2.0), 0.0, 1.0));
  float alphaVar = 0.48 + 0.52 * fract(hLen * 7.31);
  return vec2(xProfile * yProfile * headBias * alphaVar, fract(h.y * 5.71));
}

// ============================================================================
// 维度 0：时间变换（太初 -> 盛世 -> 赛博 -> 星海）
// ============================================================================
vec3 synthesizeNeonFallback(vec3 baseCol, vec2 uv) {
  float luma = dot(baseCol, vec3(0.299, 0.587, 0.114));
  vec3 night = baseCol * vec3(0.24, 0.34, 0.62) + vec3(0.015, 0.025, 0.075);
  float warmLights = smoothstep(0.52, 0.88, luma) * smoothstep(0.05, 0.30, baseCol.r - baseCol.b);
  float isWater = revSmooth(0.45, 0.32, uv.y) * smoothstep(0.20, 0.35, uv.x);
  vec3 neonCyan = vec3(0.10, 0.90, 1.00);
  vec3 neonPink = vec3(1.00, 0.24, 0.72);
  vec3 neonMix = mix(neonCyan, neonPink, smoothstep(0.32, 0.76, uv.x + 0.15 * sin(uv.y * 14.0)));
  night += neonMix * warmLights * 0.95;
  night += neonMix * isWater * (0.14 + 0.10 * sin(uv.x * 46.0 + uv.y * 18.0));
  return clamp(night, 0.0, 1.0);
}

vec3 synthesizeAstralFallback(vec3 baseCol, vec2 uv) {
  float luma = dot(baseCol, vec3(0.299, 0.587, 0.114));
  vec3 deep = baseCol * vec3(0.22, 0.24, 0.54) + vec3(0.02, 0.02, 0.07);
  float skyMask = smoothstep(0.46, 0.62, uv.y);
  float stars = pow(valueNoise(uv * vec2(190.0, 110.0)), 14.0) * 1.45;
  float crystal = smoothstep(0.48, 0.85, luma);
  deep += vec3(0.42, 0.58, 1.0) * crystal * 0.48;
  deep += vec3(0.76, 0.84, 1.0) * stars * skyMask;
  return clamp(deep, 0.0, 1.0);
}

vec3 sampleTimeRaw(int idx, vec2 texUv) {
  vec2 uv = clamp(texUv, 0.002, 0.998);
  vec3 ancient = uLoaded.x > 0.5
    ? texture(uTexAncient, uv).rgb
    : mix(vec3(0.18, 0.22, 0.30), vec3(0.95, 0.82, 0.72), smoothstep(0.25, 0.75, uv.y));
  if (idx == 0) return ancient;

  vec3 golden = uLoaded.y > 0.5
    ? texture(uTexGolden, uv).rgb
    : mix(ancient, ancient * vec3(1.16, 0.96, 0.72) + vec3(0.08, 0.04, 0.0), 0.75);
  if (idx == 1) return golden;

  if (idx == 2) {
    return uLoaded.z > 0.5 ? texture(uTexNeon, uv).rgb : synthesizeNeonFallback(golden, uv);
  }
  return uLoaded.w > 0.5 ? texture(uTexAstral, uv).rgb : synthesizeAstralFallback(ancient, uv);
}

vec3 applyTimeParticlesAndAtmosphere(vec3 col, vec2 p, vec2 texUv, float sWrapped, float waterMask) {
  vec4 w = computeCircularWeights(sWrapped);
  float pAmt = min(1.4, uParticles);

  // 1. 实时天光流变 & 时代脉冲（火盆 / 华灯 / 霓虹 / 寒晶）
  float skyGrad = smoothstep(0.44, 0.78, texUv.y);
  float sunCorridor = exp(-pow((texUv.x - 0.43) * 4.5, 2.0)) * smoothstep(0.36, 0.62, texUv.y);
  float pulseSlow = 0.5 + 0.5 * sin(uTime * 1.45);
  float luma = dot(col, vec3(0.299, 0.587, 0.114));

  // 太初：晨曦流光与神庙青铜火盆摇曳
  if (w.x > 0.01) {
    float brazierA = exp(-dot((texUv - vec2(0.686, 0.368)) * vec2(26.0, 22.0), (texUv - vec2(0.686, 0.368)) * vec2(26.0, 22.0)));
    float brazierB = exp(-dot((texUv - vec2(0.835, 0.358)) * vec2(26.0, 22.0), (texUv - vec2(0.835, 0.358)) * vec2(26.0, 22.0)));
    float flicker = 0.72 + 0.28 * sin(uTime * 5.2 + texUv.x * 19.0) * cos(uTime * 3.1);
    col += vec3(1.0, 0.56, 0.18) * (brazierA + brazierB) * 0.24 * flicker * w.x;
    col += vec3(1.0, 0.82, 0.64) * sunCorridor * (0.045 + 0.03 * pulseSlow) * w.x;
  }

  // 盛世：鎏金港城灯笼与画舫暖辉呼吸
  if (w.y > 0.01) {
    float warmMask = smoothstep(0.56, 0.86, luma) * smoothstep(0.08, 0.32, col.r - col.b);
    float lanternGlow = 0.55 + 0.45 * sin(uTime * 2.1 + texUv.x * 14.0 + texUv.y * 9.0);
    col += vec3(0.26, 0.15, 0.03) * warmMask * lanternGlow * w.y;
    col += vec3(1.0, 0.78, 0.36) * sunCorridor * (0.04 + 0.025 * sin(uTime * 0.9)) * w.y;
  }

  // 赛博：霓虹电流脉动 & 全息夜雾流光
  if (w.z > 0.01) {
    float neonCyan = smoothstep(0.42, 0.84, max(col.b, col.g) - col.r * 0.45);
    float neonMag = smoothstep(0.40, 0.84, (col.r + col.b) * 0.58 - col.g);
    float cyberPulse = 0.65 + 0.35 * sin(uTime * 3.4 + texUv.x * 16.0);
    float holoScan = 0.88 + 0.12 * sin(texUv.y * 190.0 - uTime * 4.5);
    col += vec3(0.04, 0.26, 0.36) * neonCyan * cyberPulse * holoScan * w.z;
    col += vec3(0.32, 0.06, 0.26) * neonMag * (1.2 - cyberPulse * 0.5) * w.z;
  }

  // 星海：寒晶荧光脉动 & 银河微星闪烁
  if (w.w > 0.01) {
    float coldCrystal = smoothstep(0.44, 0.82, max(col.b, col.g) - col.r * 0.5);
    float crystalBreath = 0.60 + 0.40 * sin(uTime * 1.55 + texUv.x * 8.0);
    col += vec3(0.14, 0.24, 0.46) * coldCrystal * crystalBreath * w.w;
    if (skyGrad > 0.01) {
      vec2 starGrid = texUv * vec2(150.0, 92.0);
      vec2 sCell = floor(starGrid);
      vec2 sLocal = fract(starGrid) - 0.5;
      float sr = hash21(sCell + 51.2);
      if (sr > 0.90) {
        float twinkle = 0.35 + 0.65 * sin(uTime * (2.0 + sr * 4.0) + sr * 25.0);
        float starPt = exp(-dot(sLocal, sLocal) * 44.0) * twinkle * skyGrad;
        col += vec3(0.78, 0.86, 1.0) * starPt * 0.55 * w.w;
      }
    }
  }

  // 2. 动态海面波光倒影
  if (waterMask > 0.01) {
    float waveField = sin(texUv.y * 165.0 - uTime * 2.2 + texUv.x * 20.0)
                    * cos(texUv.y * 92.0 + uTime * 1.5 - texUv.x * 14.0);
    float glint = pow(max(0.0, waveField), 3.0) * waterMask;
    float centerWater = exp(-pow((texUv.x - 0.48) * 3.8, 2.0));
    vec3 glintCol =
      w.x * vec3(1.0, 0.82, 0.66) * (0.20 * centerWater + 0.05) +
      w.y * vec3(1.0, 0.86, 0.44) * (0.28 * centerWater + 0.10) +
      w.z * mix(vec3(0.16, 0.92, 1.0), vec3(1.0, 0.28, 0.78), 0.5 + 0.5 * sin(texUv.x * 15.0 + uTime)) * 0.26 +
      w.w * vec3(0.70, 0.82, 1.0) * (0.22 * centerWater + 0.08);
    col += glintCol * glint * (0.45 + 0.55 * clamp(pAmt, 0.0, 1.0));
  }

  if (pAmt <= 0.01) return col;

  // 3. 时代氛围微粒：纤细晨光金尘 / 鎏金萤火 / 赛博斜飞微雨 / 星海星尘
  for (int layer = 0; layer < 2; layer++) {
    float scale = layer == 0 ? 15.0 : 23.0;
    float fLayer = float(layer);

    // 太初 & 盛世：纤巧星点浮尘与上升金烁火光
    if (w.x + w.y > 0.02) {
      vec2 gp = p * scale;
      gp.y -= uTime * (0.14 + 0.07 * fLayer) * scale * 0.20;
      gp.x += sin(uTime * 0.8 + gp.y * 0.45) * 0.35;
      vec2 cell = floor(gp);
      vec2 local = fract(gp) - 0.5;
      float rnd = hash21(cell + fLayer * 29.0);
      if (rnd > 0.78) {
        vec2 off = (hash22(cell + 7.3) - 0.5) * 0.52;
        float dist = length(local - off);
        float glow = exp(-dist * dist * 165.0) * (0.50 + 0.50 * sin(uTime * 2.6 + rnd * 17.0));
        vec3 dustCol = mix(vec3(1.0, 0.88, 0.68), vec3(1.0, 0.76, 0.30), w.y);
        col += dustCol * glow * (w.x * 0.26 + w.y * 0.55) * pAmt;
      }
    }

    // 星海：漂浮微晶与纤细星尘粒子
    if (w.w > 0.02) {
      vec2 sp = p * (scale * 1.05);
      sp.y -= uTime * (0.09 + 0.04 * fLayer) * scale * 0.20;
      sp.x += cos(uTime * 0.55 + sp.y * 0.6) * 0.28;
      vec2 sCell = floor(sp);
      vec2 sLocal = fract(sp) - 0.5;
      float sRnd = hash21(sCell + 211.0 + fLayer * 41.0);
      if (sRnd > 0.76) {
        vec2 off = (hash22(sCell + 13.7) - 0.5) * 0.50;
        float d = length(sLocal - off);
        float twinkle = 0.45 + 0.55 * sin(uTime * 2.2 + sRnd * 22.0);
        float star = exp(-d * d * 170.0) * twinkle;
        vec3 starCol = mix(vec3(0.72, 0.88, 1.0), vec3(0.88, 0.68, 1.0), fract(sRnd * 5.9));
        col += starCol * star * 0.55 * w.w * pAmt;
      }
    }
  }

  // 赛博：三层互质疏密疾坠微雨丝（自然随机落差）
  if (w.z > 0.02) {
    vec2 r0 = sampleRainStreak(p, 23.0, 4.1, 10.8, -0.19, 0.65, 107.0);
    vec2 r1 = sampleRainStreak(p, 37.0, 5.9, 14.4, -0.16, 0.69, 149.0);
    vec2 r2 = sampleRainStreak(p, 53.0, 7.7, 17.8, -0.21, 0.73, 193.0);
    vec3 c0 = mix(vec3(0.42, 0.94, 1.0), vec3(1.0, 0.40, 0.86), r0.y);
    vec3 c1 = mix(vec3(0.42, 0.94, 1.0), vec3(1.0, 0.40, 0.86), r1.y);
    vec3 c2 = mix(vec3(0.42, 0.94, 1.0), vec3(1.0, 0.40, 0.86), r2.y);
    col += (c0 * r0.x * 0.30 + c1 * r1.x * 0.20 + c2 * r2.x * 0.13) * w.z * pAmt;
  }

  return col;
}

vec3 sampleTimeScene(vec2 p, vec2 innerExtent, float sWrapped) {
  vec2 normInPill = p / innerExtent;
  float imgAspect = 1376.0 / 768.0;
  float pillAspect = innerExtent.x / innerExtent.y;
  float vSpan = imgAspect / pillAspect;

  vec2 texUv = vec2(
    0.5 + normInPill.x * 0.492 + uParallax.x * 0.007,
    0.505 + normInPill.y * (vSpan * 0.5) + uParallax.y * 0.006
  );

  // 海湾水波（赛博雨夜波动稍灵动，星海如镜微漾）
  float waterTop = mix(0.455, 0.345, smoothstep(0.55, 0.88, texUv.x));
  float waterMask = revSmooth(waterTop, waterTop - 0.075, texUv.y)
                  * smoothstep(0.16, 0.30, texUv.x)
                  * revSmooth(0.95, 0.82, texUv.x);

  if (waterMask > 0.001 && uParticles > 0.01) {
    vec4 w = computeCircularWeights(sWrapped);
    float waveAmp = mix(0.0009, 0.0014, w.z) * mix(1.0, 0.45, w.w);
    float ripple = sin(texUv.y * 155.0 - uTime * 2.1 + texUv.x * 16.0) * waveAmp
                 + cos(texUv.y * 88.0 + uTime * 1.35 - texUv.x * 22.0) * waveAmp * 0.6;
    texUv.x += ripple * waterMask * min(1.2, uParticles);
  }

  int idxA = int(floor(sWrapped)) % 4;
  int idxB = (idxA + 1) % 4;
  float frac = fract(sWrapped);

  vec3 colA = sampleTimeRaw(idxA, texUv);
  vec3 colB = sampleTimeRaw(idxB, texUv);

  float orgNoise = (fbm3(texUv * 7.5 + vec2(0.0, sWrapped * 0.25)) - 0.5) * 0.16;
  float blendT = smoothstep(0.0, 1.0, clamp(frac + orgNoise * sin(frac * 3.14159), 0.0, 1.0));
  vec3 col = mix(colA, colB, blendT);

  return applyTimeParticlesAndAtmosphere(col, p, texUv, sWrapped, waterMask);
}

// ============================================================================
// 维度 1：情绪变换（纯 GPU 连续程序化心灵气象）
// 0: 澄明晨光水天一色与金粉微尘 -> 1: 炽烈日冕狂想与热浪流体金箔
// 2: 孤寂凌晨暴雨斜飞雨丝、打水涟漪与孤灯倒影 -> 3: 梦境失重虹彩薄膜极光与上升微光粒子
// ============================================================================
vec3 sampleMoodSkyField(vec2 cUv, vec4 w, float horizonY) {
  // 连续流体域翘曲参数随四阶平滑变形
  vec2 flowVel = w.x * vec2(0.045, 0.008)
               + w.y * vec2(0.095, 0.135)
               + w.z * vec2(-0.180, -0.045)
               + w.w * vec2(0.055, 0.085);
  float warpAmp = 0.42 * w.x + 1.18 * w.y + 0.62 * w.z + 1.05 * w.w;
  vec2 fUv = cUv * mix(1.35, 1.85, w.y + 0.5 * w.w) + uParallax * 0.055;

  float q = fbm3(fUv + flowVel * uTime);
  float r = fbm3(fUv * 1.45 + warpAmp * vec2(q, q * 0.7) - vec2(uTime * 0.07, 0.0));
  float field = fbm4(fUv * 1.25 + warpAmp * vec2(r, q * 0.85));

  float ridge = 1.0 - abs(field * 2.0 - 1.0);
  float silkRibbon = pow(clamp(ridge, 0.0, 1.0), mix(1.5, 3.3, w.y + w.w * 0.85));

  float skyT = clamp((cUv.y - horizonY) * 0.82 + 0.25, 0.0, 1.0);

  // 0: 澄明晨光水天一色
  float silkClouds = fbm3(vec2(fUv.x * 1.15 - uTime * 0.025, fUv.y * 2.6) + vec2(q * 0.45));
  vec3 sereneSky = mix(vec3(0.98, 0.88, 0.74), vec3(0.46, 0.79, 0.84), smoothstep(0.0, 0.88, skyT));
  sereneSky = mix(sereneSky, vec3(0.99, 0.97, 0.92), smoothstep(0.42, 0.85, silkClouds) * 0.36);
  vec2 sun0 = vec2(-0.38, 0.14) + uParallax * 0.07;
  float dSun0 = length(cUv - sun0);
  sereneSky += vec3(1.0, 0.88, 0.68) * exp(-dSun0 * 4.2) * 0.30;
  sereneSky += vec3(1.0, 0.95, 0.84) * exp(-dSun0 * 14.0) * 0.28;
  sereneSky = sereneSky / (1.0 + max(vec3(0.0), sereneSky - 0.88) * 1.4);

  // 1: 炽烈日冕狂想与热浪流体金箔
  vec2 sun1 = vec2(0.12, 0.04) + uParallax * 0.08;
  vec2 dSun1Vec = cUv - sun1;
  float dSun1 = length(dSun1Vec);
  float ang1 = dSun1 > 1e-4 ? atan(dSun1Vec.y, dSun1Vec.x) : 0.0;
  float coronaRays = 0.5 + 0.5 * sin(ang1 * 8.0 + uTime * 1.1 + r * 3.2);
  float heartWave = 0.5 + 0.5 * sin(dSun1 * 11.0 - uTime * 2.5);
  float foilDetail = fbm4(fUv * 3.1 + vec2(r * 1.6, -q * 1.3));
  float foilRidge = pow(clamp(1.0 - abs(foilDetail * 2.0 - 1.0), 0.0, 1.0), 3.4);
  vec3 euphoriaBase = mix(vec3(0.32, 0.04, 0.05), vec3(0.90, 0.28, 0.07), clamp(field * 1.15, 0.0, 1.0));
  euphoriaBase = mix(euphoriaBase, vec3(0.98, 0.64, 0.18), silkRibbon * 0.68);
  vec3 goldLeaf = vec3(1.0, 0.90, 0.48) * (pow(silkRibbon, 2.8) * 0.58 + foilRidge * 0.72) * (0.75 + 0.35 * coronaRays);
  vec3 coronaCore = vec3(1.0, 0.82, 0.44) * exp(-dSun1 * 3.1) * (0.48 + 0.18 * heartWave);
  vec3 euphoriaCol = euphoriaBase + goldLeaf + coronaCore;
  euphoriaCol = euphoriaCol / (0.85 + euphoriaCol * 0.45);

  // 2: 孤寂凌晨暴雨与遥远孤灯
  vec3 stormSky = mix(vec3(0.06, 0.11, 0.21), vec3(0.025, 0.045, 0.105), smoothstep(0.0, 0.9, skyT));
  stormSky += vec3(0.05, 0.09, 0.17) * field * 0.65;
  vec2 lampPos = vec2(0.86, 0.08) + uParallax * 0.05;
  float dLamp = length(cUv - lampPos);
  vec3 lampGlow = vec3(1.0, 0.68, 0.30) * exp(-dLamp * 4.4) * 0.85
                + vec3(1.0, 0.93, 0.76) * exp(-dLamp * 24.0) * 1.35;
  stormSky += lampGlow;

  // 3: 梦境失重虹彩薄膜极光
  vec3 dreamVoid = mix(vec3(0.06, 0.05, 0.15), vec3(0.14, 0.11, 0.29), skyT * 0.7 + 0.15);
  float filmPhase = field * 8.2 + r * 3.8 + cUv.x * 1.3 - uTime * 0.42;
  vec3 irid = 0.52 + 0.48 * cos(filmPhase + vec3(0.0, 2.094, 4.188));
  float auroraCurtain = smoothstep(0.18, 0.88, silkRibbon) * (0.55 + 0.45 * sin(cUv.x * 2.2 + q * 3.0 + uTime * 0.3));
  vec3 dreamCol = dreamVoid + mix(irid, vec3(0.75, 0.92, 1.0), 0.24) * auroraCurtain * 0.92;
  dreamCol += vec3(0.32, 0.22, 0.52) * exp(-length(cUv - vec2(-0.3, 0.15)) * 1.4) * 0.35;

  return sereneSky * w.x + euphoriaCol * w.y + stormSky * w.z + dreamCol * w.w;
}

vec3 sampleMoodScene(vec2 p, vec2 innerExtent, float sWrapped) {
  vec4 w = computeCircularWeights(sWrapped);
  vec2 cUv = p / vec2(innerExtent.y * 1.45, innerExtent.y);

  // 连续地平线高度：澄明 (-0.06) -> 炽烈 (-0.36) -> 孤寂 (-0.18) -> 梦境消融 (-1.40)
  float horizonY = w.x * (-0.06) + w.y * (-0.36) + w.z * (-0.18) + w.w * (-1.40);
  float waterPresence = clamp(w.x * 1.0 + w.z * 0.96 + w.y * 0.28, 0.0, 1.0);
  float isWater = revSmooth(horizonY + 0.025, horizonY - 0.025, cUv.y) * waterPresence;

  vec3 col = sampleMoodSkyField(cUv, w, horizonY);

  // 水天镜面倒影 + 孤寂雨滴打水涟漪
  if (isWater > 0.001) {
    vec2 reflUv = vec2(cUv.x, 2.0 * horizonY - cUv.y);
    float calmRipple = sin((horizonY - cUv.y) * 95.0 - uTime * 1.4 + cUv.x * 5.0) * 0.012;
    reflUv.x += calmRipple * (w.x * 0.8 + w.y * 1.4 + w.z * 1.6);
    reflUv.y += calmRipple * 0.35;

    // 孤寂凌晨：雨滴打水同心圆扩散涟漪
    float rainRingGlow = 0.0;
    if (w.z > 0.02) {
      vec2 wPlane = vec2(cUv.x * 1.75, (horizonY - cUv.y) * 5.2);
      for (int layer = 0; layer < 2; layer++) {
        float scale = layer == 0 ? 2.4 : 4.1;
        vec2 rp = wPlane * scale;
        vec2 cell = floor(rp);
        vec2 local = fract(rp) - 0.5;
        float rnd = hash21(cell + float(layer) * 37.0);
        if (rnd > 0.38) {
          vec2 center = (hash22(cell + 9.4) - 0.5) * 0.42;
          float phase = fract(uTime * (0.48 + rnd * 0.24) + rnd * 6.7);
          float rad = phase * 0.56;
          vec2 dVec = local - center;
          float d = length(dVec);
          float ring = sin((d - rad) * 44.0) * exp(-abs(d - rad) * 14.0)
                     * (1.0 - phase) * smoothstep(0.0, 0.08, phase);
          reflUv += normalize(dVec + 1e-5) * ring * 0.045 * w.z;
          rainRingGlow += max(0.0, ring) * (layer == 0 ? 0.30 : 0.18);
        }
      }
    }

    vec3 reflCol = sampleMoodSkyField(reflUv, w, horizonY);
    reflCol *= mix(vec3(0.92, 0.96, 0.96), vec3(0.55, 0.68, 0.85), w.z);

    // 澄明金光水径 & 孤寂孤灯长柱倒影
    float sunColumn = exp(-pow((cUv.x + 0.38 - calmRipple * 2.2) * 5.2, 2.0)) * w.x;
    reflCol += vec3(1.0, 0.90, 0.68) * sunColumn * 0.14;

    float lampColMask = exp(-pow((cUv.x - (0.86 + uParallax.x * 0.05) + calmRipple * 3.0) * 9.5, 2.0));
    float brokenShimmer = 0.45 + 0.55 * sin((horizonY - cUv.y) * 76.0 - uTime * 3.2 + sin(cUv.x * 19.0));
    reflCol += vec3(1.0, 0.66, 0.24) * lampColMask * brokenShimmer * 0.78 * w.z;
    reflCol += vec3(0.45, 0.64, 0.92) * rainRingGlow * w.z;

    // 柔和压缩水面高光过曝，保持水天金波质感
    reflCol = reflCol / (vec3(1.0) + max(vec3(0.0), reflCol - 0.82) * 1.45);
    col = mix(col, reflCol, isWater);
  }

  // 孤寂凌晨：三层互质随机斜飞雨丝（持续构图元素，彻底消除规则格子感）
  if (w.z > 0.02) {
    float rainVis = w.z * (0.65 + 0.35 * min(1.3, uParticles));
    float s0 = sampleRainStreak(cUv, 17.0, 2.6, 4.1, -0.24, 0.52, 31.0).x;
    float s1 = sampleRainStreak(cUv, 29.0, 3.9, 5.8, -0.21, 0.58, 73.0).x;
    float s2 = sampleRainStreak(cUv, 43.0, 5.3, 7.5, -0.26, 0.65, 131.0).x;
    float nearLamp = exp(-length(cUv - vec2(0.86, 0.08)) * 2.5);
    vec3 streakCol = mix(vec3(0.48, 0.66, 0.94), vec3(1.0, 0.76, 0.42), nearLamp * 0.75);
    col += streakCol * (s0 * 0.34 + s1 * 0.22 + s2 * 0.14) * rainVis;
  }

  // 梦境失重：漂浮超薄虹彩肥皂泡光斑
  if (w.w > 0.02) {
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      vec2 bPos = vec2(
        -1.35 + fi * 0.88 + sin(uTime * 0.45 + fi * 2.1) * 0.16,
        -0.18 + cos(uTime * 0.38 + fi * 1.7) * 0.28
      ) + uParallax * (0.04 + fi * 0.015);
      float rad = 0.15 + 0.045 * sin(fi * 3.1);
      float d = length(cUv - bPos);
      if (d < rad * 1.2) {
        float ring = exp(-pow((d - rad) * 68.0, 2.0));
        float fill = revSmooth(rad, 0.0, d) * 0.045;
        vec3 bTint = 0.55 + 0.45 * cos(fi * 1.8 + d * 12.0 - uTime * 0.7 + vec3(0.0, 2.094, 4.188));
        col += bTint * (ring * 0.42 + fill) * w.w;
      }
    }
  }

  // 心灵微粒：纤细澄明金粉 / 炽烈金烁 / 梦境上升微光
  float pAmt = min(1.4, uParticles);
  if (pAmt > 0.01) {
    for (int layer = 0; layer < 2; layer++) {
      float fL = float(layer);
      vec2 gp = cUv * (9.5 + fL * 6.0);
      gp.y -= uTime * (0.34 * w.x + 0.72 * w.y + 0.56 * w.w) * (1.0 + fL * 0.35);
      gp.x += sin(uTime * 0.9 + gp.y * 0.5) * 0.28;
      vec2 cell = floor(gp);
      vec2 local = fract(gp) - 0.5;
      float rnd = hash21(cell + 19.3 + fL * 43.0);
      if (rnd > 0.76) {
        vec2 off = (hash22(cell + 5.1) - 0.5) * 0.52;
        float dist = length(local - off);
        float pulse = 0.50 + 0.50 * sin(uTime * 2.5 + rnd * 19.0);
        float pt = exp(-dist * dist * 175.0) * pulse;
        vec3 pCol = w.x * vec3(1.0, 0.86, 0.44) * 0.52
                  + w.y * vec3(1.0, 0.82, 0.34) * 0.82
                  + w.z * vec3(0.55, 0.78, 1.0) * 0.16
                  + w.w * (0.6 + 0.4 * cos(rnd * 12.0 + vec3(0.0, 2.094, 4.188))) * 0.75;
        col += pCol * pt * pAmt;
      }
    }
  }

  return clamp(col, 0.0, 1.0);
}

// ============================================================================
// 维度 2：空间变换（纯 GPU 实时尺度跃迁）
// 0: 微观纳米叶脉露晶折射 -> 1: 苍穹沧海云海涡旋与孤岛日照
// 2: 轨道平流层星弧与翠色极光帘幕 -> 3: 奇点黑洞事件视界、引力透镜星海与爱因斯坦环
// ============================================================================
vec3 evalSpaceMicro(vec2 sUv) {
  vec2 mUv = sUv + uParallax * 0.05;

  // 纳米叶脉（主脉 + 羽状侧脉 + 双尺度细胞网格）
  float midCurve = 0.10 * sin(mUv.x * 1.1) - 0.04;
  float dMidrib = abs(mUv.y - midCurve);
  float midrib = exp(-dMidrib * 36.0);

  float branchAxis = mUv.x * 2.6 - abs(mUv.y - midCurve) * 2.15;
  float branchWave = abs(fract(branchAxis) - 0.5) / 2.6;
  float lateralVein = exp(-branchWave * 42.0) * smoothstep(0.02, 0.22, dMidrib);

  float cellA = voronoiEdge(mUv * 4.4);
  float cellB = voronoiEdge(mUv * 11.5 + vec2(3.1, 1.7));
  float cellWall = exp(-cellA * 22.0) * 0.65 + exp(-cellB * 26.0) * 0.35;

  vec3 leafBase = mix(vec3(0.03, 0.20, 0.14), vec3(0.09, 0.42, 0.28), smoothstep(0.02, 0.45, cellA));
  vec3 veinGlow = mix(vec3(0.18, 0.78, 0.52), vec3(0.68, 1.0, 0.84), clamp(midrib + lateralVein * 0.6, 0.0, 1.0));
  vec3 col = leafBase + veinGlow * (midrib * 0.75 + lateralVein * 0.42 + cellWall * 0.32);

  // 晶莹微观露滴（内部折射放大叶脉、底部焦散亮弧、顶部锐利高光）
  for (int i = 0; i < 5; i++) {
    vec2 center;
    float r;
    if (i == 0) { center = vec2(-1.42, 0.20); r = 0.23; }
    else if (i == 1) { center = vec2(-0.52, -0.17); r = 0.31; }
    else if (i == 2) { center = vec2(0.24, 0.15); r = 0.25; }
    else if (i == 3) { center = vec2(1.16, -0.10); r = 0.34; }
    else { center = vec2(1.94, 0.21); r = 0.20; }

    vec2 dVec = mUv - center;
    float d = length(dVec);

    // 露珠外侧轻微透射暗影
    float shadow = revSmooth(r * 1.28, r * 0.92, length(dVec - vec2(0.03, -0.04))) * 0.26;
    col *= (1.0 - shadow * step(r, d));

    if (d < r) {
      float rn = d / r;
      float domeZ = sqrt(max(0.0, 1.0 - rn * rn));
      vec2 refrUv = center + dVec * (0.58 + 0.34 * rn * rn);
      float rCell = voronoiEdge(refrUv * 4.4);
      float rVein = exp(-abs(refrUv.y - (0.10 * sin(refrUv.x * 1.1) - 0.04)) * 32.0);
      vec3 insideCol = mix(vec3(0.05, 0.34, 0.24), vec3(0.24, 0.86, 0.60), smoothstep(0.02, 0.38, rCell) * 0.7 + rVein * 0.45);

      // 焦散透射亮弧（位于光源对侧右下穹壁）
      vec2 lightDir = normalize(vec2(-0.58, 0.81));
      float caustic = pow(max(0.0, dot(normalize(dVec + 1e-5), -lightDir)), 2.8)
                    * smoothstep(0.25, 0.92, rn) * (1.0 - smoothstep(0.92, 1.0, rn));
      insideCol += vec3(0.56, 1.0, 0.80) * caustic * 0.88;

      // 露晶表面球面锐利高光与菲涅尔圈
      float spec = exp(-dot(dVec - lightDir * r * 0.44, dVec - lightDir * r * 0.44) / (r * r * 0.022));
      float fres = pow(1.0 - domeZ, 3.0) * 0.55;
      insideCol = mix(insideCol, vec3(0.88, 1.0, 0.96), fres);
      insideCol += vec3(1.0) * spec * 0.95;

      col = mix(col, insideCol, revSmooth(r, r - 0.014, d));
    }
  }

  // 微观孢子光尘
  if (uParticles > 0.01) {
    vec2 sp = mUv * 5.2;
    sp.y -= uTime * 0.22;
    sp.x += sin(uTime * 0.7 + sp.y) * 0.25;
    vec2 cell = floor(sp);
    float rnd = hash21(cell + 31.0);
    if (rnd > 0.68) {
      vec2 off = (hash22(cell + 17.0) - 0.5) * 0.5;
      float d = length(fract(sp) - 0.5 - off);
      col += vec3(0.65, 1.0, 0.80) * exp(-d * d * 48.0) * 0.55 * min(1.3, uParticles);
    }
  }
  return clamp(col, 0.0, 1.0);
}

vec3 evalSpaceHorizon(vec2 sUv) {
  vec2 aUv = sUv + uParallax * 0.06;

  // 蔚蓝深海波纹底色
  float seaTex = fbm3(aUv * vec2(7.5, 13.0) + vec2(uTime * 0.08, -uTime * 0.04));
  vec3 ocean = mix(vec3(0.025, 0.14, 0.30), vec3(0.07, 0.34, 0.54), seaTex);

  // 孤岛日照（位于偏右中景，周围环绕浅碧珊瑚礁浅滩）
  vec2 islPos = vec2(0.58, -0.05);
  vec2 dIsl = aUv - islPos;
  float islNoise = fbm4(dIsl * 3.8 + vec2(4.2, 1.9));
  float islShape = length(dIsl * vec2(0.70, 1.22)) - 0.34 + (islNoise - 0.5) * 0.24;

  // 珊瑚礁浅滩绿松石色环带
  float reefMask = revSmooth(0.24, 0.01, islShape) * smoothstep(-0.02, 0.04, islShape);
  ocean = mix(ocean, vec3(0.12, 0.66, 0.72), reefMask * 0.82);

  // 孤岛山脊植被与阳光受光面
  float landMask = revSmooth(0.015, -0.015, islShape);
  if (landMask > 0.001) {
    float ridgeGrad = fbm4((dIsl + vec2(0.03, -0.03)) * 5.2) - fbm4(dIsl * 5.2);
    float sunLit = clamp(0.55 + ridgeGrad * 5.5 + (-dIsl.x + dIsl.y) * 0.6, 0.0, 1.0);
    vec3 forest = mix(vec3(0.06, 0.25, 0.14), vec3(0.32, 0.58, 0.24), sunLit);
    vec3 sand = vec3(0.86, 0.78, 0.58);
    float beach = smoothstep(-0.06, -0.005, islShape);
    vec3 landCol = mix(forest, sand, beach * 0.75);
    // 金光破雾直照孤岛
    landCol += vec3(1.0, 0.88, 0.60) * sunLit * 0.22;
    ocean = mix(ocean, landCol, landMask);
  }

  // 苍穹云海涡旋（绕左中气旋中心旋转，在孤岛处开出阳光云隙）
  vec2 vortexCenter = vec2(-0.28, 0.04);
  vec2 vVec = aUv - vortexCenter;
  float vRad = length(vVec);
  float swirl = exp(-vRad * 0.58) * 1.65 + uTime * 0.035;
  vec2 swirledUv = rotate2D(vVec, swirl) + vortexCenter;

  float cloudBase = fbm4(swirledUv * vec2(1.55, 2.25) - vec2(uTime * 0.04, 0.0));
  float cloudDetail = fbm3(swirledUv * 4.2 + vec2(cloudBase * 1.4));
  float cloudRaw = cloudBase * 0.7 + cloudDetail * 0.3;

  // 在孤岛周围开出戏剧性的晴空云眼
  float cloudEye = smoothstep(0.24, 0.92, length(aUv - islPos));
  float cloudDensity = smoothstep(0.42, 0.74, cloudRaw * mix(0.62, 1.12, cloudEye));

  // 云层投射在海面的柔和影子
  float shadowSample = fbm3((swirledUv - vec2(0.08, -0.08)) * vec2(1.55, 2.25) - vec2(uTime * 0.04, 0.0));
  float cloudShadow = smoothstep(0.45, 0.78, shadowSample * mix(0.60, 1.10, cloudEye)) * 0.36;
  ocean *= (1.0 - cloudShadow);

  // 金光破雾斜射光柱
  float beamAxis = (aUv.x - islPos.x) * 0.72 + (aUv.y - islPos.y) * 0.68;
  float godRay = exp(-beamAxis * beamAxis * 7.5) * smoothstep(-0.35, 0.75, aUv.y - islPos.y);

  vec3 cloudCol = mix(vec3(0.66, 0.76, 0.88), vec3(0.99, 0.97, 0.93), smoothstep(0.35, 0.80, cloudRaw));
  cloudCol += vec3(1.0, 0.84, 0.56) * (0.20 * smoothstep(0.1, 0.9, -aUv.x * 0.25 + 0.5));

  vec3 col = mix(ocean, cloudCol, cloudDensity);
  col += vec3(1.0, 0.88, 0.64) * godRay * 0.28;
  return clamp(col, 0.0, 1.0);
}

vec3 evalSpaceOrbit(vec2 sUv) {
  vec2 oUv = sUv + uParallax * 0.04;
  vec2 planetC = vec2(0.0, -3.38);
  float planetR = 3.22;
  vec2 rel = oUv - planetC;
  float dist = length(rel);
  float alt = dist - planetR;
  float ang = (abs(rel.x) > 1e-4 || abs(rel.y) > 1e-4) ? atan(rel.x, rel.y) : 0.0;

  // 深空星海底色
  vec3 col = vec3(0.008, 0.014, 0.036);
  if (alt > -0.01) {
    // 多层星点
    for (int i = 0; i < 2; i++) {
      float sc = i == 0 ? 52.0 : 96.0;
      vec2 sg = oUv * sc;
      vec2 sCell = floor(sg);
      float sr = hash21(sCell + float(i) * 43.0);
      if (sr > 0.91) {
        vec2 off = (hash22(sCell + 5.1) - 0.5) * 0.55;
        float d = length(fract(sg) - 0.5 - off);
        float twinkle = 0.65 + 0.35 * sin(uTime * (1.5 + sr * 2.5) + sr * 20.0);
        col += mix(vec3(0.82, 0.90, 1.0), vec3(1.0, 0.88, 0.76), fract(sr * 7.1))
             * exp(-d * d * 52.0) * twinkle * (i == 0 ? 0.85 : 0.50);
      }
    }
  }

  // 行星夜半球本体（极暗海洋云影与城市星点）
  if (alt < 0.02) {
    float surfaceMask = revSmooth(0.015, -0.015, alt);
    float nightClouds = fbm3(vec2(ang * 8.0, alt * 5.0) + vec2(uTime * 0.01, 0.0));
    vec3 earthNight = mix(vec3(0.010, 0.020, 0.045), vec3(0.035, 0.075, 0.145), nightClouds * 0.55);

    // 稀疏微弱的夜间城市灯簇
    vec2 cityGrid = vec2(ang * 44.0, dist * 42.0);
    float cityMask = smoothstep(0.55, 0.75, fbm3(cityGrid * 0.18));
    float cityDot = pow(hash21(floor(cityGrid)), 9.0) * cityMask * smoothstep(-0.35, -0.04, alt);
    earthNight += vec3(1.0, 0.76, 0.38) * cityDot * 0.65;

    col = mix(col, earthNight, surfaceMask);
  }

  // 平流层电蓝星弧辉光（Rayleigh Airglow Limb）
  float limbGlow = exp(-max(alt, 0.0) * 26.0) * smoothstep(-0.04, 0.005, alt);
  float horizonLine = exp(-alt * alt * 3400.0);
  col += vec3(0.18, 0.58, 1.0) * limbGlow * 0.92;
  col += vec3(0.68, 0.92, 1.0) * horizonLine * 0.75;

  // 翠色极光帘幕（沿弯曲星弧垂直磁力线舞动）
  float auroraBand = smoothstep(0.01, 0.10, alt) * exp(-max(0.0, alt - 0.06) * 3.4);
  if (auroraBand > 0.005) {
    float curtainWave = fbm3(vec2(ang * 14.0 + uTime * 0.14, alt * 1.4 - uTime * 0.08));
    float rays = 0.5 + 0.5 * sin(ang * 78.0 + curtainWave * 7.5 + uTime * 0.55);
    float curtainMask = smoothstep(0.32, 0.82, curtainWave) * (0.45 + 0.55 * rays) * auroraBand;
    vec3 emerald = vec3(0.14, 0.96, 0.64);
    vec3 violetTop = vec3(0.56, 0.34, 0.98);
    vec3 auroraCol = mix(emerald, violetTop, smoothstep(0.12, 0.48, alt));
    col += auroraCol * curtainMask * (0.95 + 0.25 * min(1.3, uParticles));
  }

  return clamp(col, 0.0, 1.0);
}

vec3 evalSpaceSingularity(vec2 sUv) {
  vec2 bUv = sUv + uParallax * 0.035;
  float r = length(bUv);
  float rs = 0.265;

  // 1. 引力透镜弯曲周围星海（爱因斯坦偏折）
  float lensFactor = (rs * rs * 1.08) / max(r * r, rs * rs * 0.55);
  vec2 radialDir = r > 1e-5 ? bUv / r : vec2(1.0, 0.0);
  vec2 lensedUv = bUv * (1.0 - 0.56 * lensFactor) + radialDir * (0.12 * lensFactor);

  // 微弱银河星云背景
  float neb = fbm3(lensedUv * 1.9 + vec2(2.3, -1.1));
  vec3 col = mix(vec3(0.008, 0.006, 0.018), vec3(0.055, 0.030, 0.095), neb * 0.85);
  col *= smoothstep(rs * 0.95, rs * 1.65, r);

  // 被引力弯曲的星点
  for (int i = 0; i < 2; i++) {
    float sc = i == 0 ? 44.0 : 82.0;
    vec2 sg = lensedUv * sc;
    vec2 sCell = floor(sg);
    float sr = hash21(sCell + float(i) * 77.0);
    if (sr > 0.90) {
      vec2 off = (hash22(sCell + 9.2) - 0.5) * 0.55;
      float d = length(fract(sg) - 0.5 - off);
      float arcBoost = 1.0 + 0.8 * revSmooth(rs * 2.2, rs * 1.08, r);
      col += mix(vec3(0.84, 0.90, 1.0), vec3(1.0, 0.82, 0.92), fract(sr * 5.7))
           * exp(-d * d * 46.0) * arcBoost * smoothstep(rs * 0.98, rs * 1.15, r);
    }
  }

  // 2. 倾斜三维相对论吸积盘 + 引力弯曲上下二次光环
  vec2 dTilt = rotate2D(bUv, -0.14);
  float diskY = dTilt.y * 4.7;
  float rDisk = length(vec2(dTilt.x, diskY));
  float angDisk = (abs(dTilt.x) > 1e-4 || abs(diskY) > 1e-4) ? atan(diskY, dTilt.x) : 0.0;

  float spiralNoise = fbm3(vec2(rDisk * 7.2 - uTime * 0.35, angDisk * 2.0 + rDisk * 6.5 - uTime * 1.35));
  float fineRings = 0.65 + 0.35 * sin(rDisk * 36.0 - uTime * 2.2 + spiralNoise * 4.0);

  // 相对论多普勒聚束：左侧顺向迎光炽白金蓝，右侧退行红移橙紫
  float doppler = clamp(1.0 - dTilt.x * 0.58, 0.42, 1.65);
  vec3 diskTint = mix(vec3(0.95, 0.42, 0.24), vec3(1.0, 0.93, 0.82), smoothstep(0.55, 1.45, doppler));
  diskTint = mix(diskTint, vec3(0.82, 0.88, 1.0), smoothstep(1.25, 1.65, doppler) * 0.45);

  float mainDiskMask = smoothstep(rs * 1.04, rs * 1.24, rDisk) * exp(-max(0.0, rDisk - rs * 1.15) * 1.95);
  // 远端吸积盘被黑洞视界遮挡，近端（dTilt.y < 0）横跨事件视界前方
  float frontHalf = revSmooth(0.04, -0.04, dTilt.y);
  float shadowCut = mix(smoothstep(rs * 0.96, rs * 1.06, r), 1.0, frontHalf);

  vec3 diskCol = diskTint * mainDiskMask * (0.55 + 0.65 * spiralNoise) * fineRings * doppler * shadowCut;

  // 引力透镜将背面吸积盘弯折至黑洞上下方的光晕弧
  float lensedArc = exp(-pow((r - rs * 1.16) * 7.2, 2.0)) * smoothstep(0.18, 0.82, abs(dTilt.y) / max(r, 1e-4));
  float angTilt = (abs(dTilt.x) > 1e-4 || abs(dTilt.y) > 1e-4) ? atan(dTilt.y, dTilt.x) : 0.0;
  float arcNoise = fbm3(vec2(r * 10.0, angTilt * 3.0 - uTime * 1.1));
  vec3 haloCol = diskTint * lensedArc * (0.45 + 0.65 * arcNoise) * doppler * 0.88;

  // 3. 事件视界纯黑深渊 & 锐利爱因斯坦环（Photon Ring）
  float bhMask = revSmooth(rs * 1.01, rs * 0.96, r) * (1.0 - frontHalf * mainDiskMask * 0.88);
  col = mix(col, vec3(0.002, 0.002, 0.005), bhMask);

  float einsteinRing = exp(-pow((r - rs * 1.032) * 84.0, 2.0));
  float photonHalo = exp(-pow((r - rs * 1.04) * 20.0, 2.0)) * 0.32;
  vec3 ringCol = mix(vec3(1.0, 0.82, 0.94), vec3(1.0, 0.97, 0.92), 0.58)
               * (einsteinRing * 1.15 + photonHalo) * (0.85 + 0.35 * doppler);

  col += diskCol + haloCol + ringCol;
  return clamp(col, 0.0, 1.0);
}

vec3 sampleSpaceScene(vec2 p, vec2 innerExtent, float sWrapped) {
  vec4 w = computeCircularWeights(sWrapped);
  vec2 sUv = p / innerExtent.y;
  vec3 accum = vec3(0.0);

  if (w.x > 0.005) {
    float zoom = mix(1.0, 1.42, 1.0 - w.x);
    accum += evalSpaceMicro(sUv * zoom) * w.x;
  }
  if (w.y > 0.005) {
    float zoom = 1.0 + (sWrapped - 1.0) * 0.22;
    accum += evalSpaceHorizon(sUv * max(0.75, zoom)) * w.y;
  }
  if (w.z > 0.005) {
    float zoom = 1.0 + (sWrapped - 2.0) * 0.20;
    accum += evalSpaceOrbit(sUv * max(0.78, zoom)) * w.z;
  }
  if (w.w > 0.005) {
    accum += evalSpaceSingularity(sUv) * w.w;
  }
  return clamp(accum, 0.0, 1.0);
}

// ============================================================================
// 统一采样胶囊本体（剥离外部桌面阴影，仅返回瓷框与纯净内部世界）
// artworkZoom: 内部画景额外中心放大倍率（保持外框与透明玻璃耳部饱满独立）
// ============================================================================
vec4 sampleSceneBody(
  vec2 p,
  vec2 lensCenter,
  float artworkZoom,
  float stageVal,
  vec2 pillHalf,
  float pillRadius,
  float borderWidth
) {
  float dPill = sdRoundBox(p, pillHalf, pillRadius);
  float aa = 0.0026;
  if (dPill > aa) {
    return vec4(0.0);
  }
  float dInner = dPill + borderWidth;

  // 温润洁白瓷框（轻盈通透，边缘顺滑）
  vec3 frameBase = uIsDark > 0.5 ? vec3(0.935, 0.945, 0.968) : vec3(0.996, 0.996, 0.995);
  float frameSlope = clamp(p.y / pillHalf.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 frameCol = mix(frameBase * 0.978, frameBase * 1.004, frameSlope);
  float innerBevel = smoothstep(-0.0055, 0.0, dInner) * 0.028;
  frameCol *= (1.0 - innerBevel);

  vec3 artCol = frameCol;
  if (dInner < 0.004) {
    vec2 innerExtent = pillHalf - vec2(borderWidth);
    float sWrapped = mod(stageVal, 4.0);

    // 交互与撞壁触发的动态水波纹冲击波（仅温柔扭曲内部画景与水面波光，不污损白框）
    vec2 rippleDisp = vec2(0.0);
    float rippleShimmer = 0.0;
    for (int i = 0; i < 4; i++) {
      vec4 rp = uRipples[i];
      if (rp.z >= 0.0 && rp.z < 1.35) {
        vec2 dVec = p - rp.xy;
        float dist = length(dVec);
        float radius = rp.z * 1.18;
        float band = exp(-pow((dist - radius) * 14.0, 2.0));
        float osc = sin((dist - radius) * 52.0);
        float env = band * exp(-rp.z * 2.5) * smoothstep(0.0, 0.035, rp.z) * rp.w;
        vec2 dir = dist > 1e-5 ? dVec / dist : vec2(1.0, 0.0);
        rippleDisp += dir * osc * env * 0.015;
        rippleShimmer += max(0.0, osc) * env * 0.20;
      }
    }

    vec2 pZoomed = lensCenter + (p - lensCenter) / max(1.0, artworkZoom);
    vec2 pSample = pZoomed + rippleDisp;
    if (uDimension == 0) {
      artCol = sampleTimeScene(pSample, innerExtent, sWrapped);
    } else if (uDimension == 1) {
      artCol = sampleMoodScene(pSample, innerExtent, sWrapped);
    } else {
      artCol = sampleSpaceScene(pSample, innerExtent, sWrapped);
    }

    artCol += vec3(0.85, 0.94, 1.0) * rippleShimmer;

    float innerEdgeShadow = smoothstep(-0.009, 0.0, dInner) * 0.048;
    artCol *= (1.0 - innerEdgeShadow);
  }

  vec3 bodyRgb = mix(artCol, frameCol, smoothstep(-aa, aa, dInner));
  float bodyMask = 1.0 - smoothstep(-aa, aa, dPill);
  return vec4(bodyRgb * bodyMask, bodyMask);
}

// ============================================================================
// 严格雅可比正定不折叠（det(J) > 0）的 S 型壁厚向内弯折聚光折射函数
// 保持上下突出玻璃耳部晶莹全透明、防止 0%/100% 端头把白框折成厚脏月牙
// ============================================================================
float computeSCurveWeight(float depth) {
  float bevelThick = 0.056;
  float t = clamp(depth / bevelThick, 0.0, 1.0); // 0 外缘 -> 1 中心平台
  float u = 1.0 - t;                              // 0 中心平台 -> 1 外缘
  float s = u * u * (3.0 - 2.0 * u);
  return mix(s, s * s * (3.0 - 2.0 * s), 0.35);
}

vec2 computeMonotonicRefractedPos(
  vec2 lensCenter,
  vec2 qLens,
  float sCurve,
  float uRefract,
  float channelSign,
  float dispSpan
) {
  // 中心外框微聚（0.985）仅留充裕透明玻璃耳部空间，内部画景由 artworkZoom 负责真实放大；
  // 边缘按 S 曲线单调平滑折入壁厚（1 + edgeWrap），保证 det(J) >= 0.985^2 > 0 绝不折叠
  float centerFrameScale = 0.985;
  float edgeWrap = 0.084 * safeTanh(uRefract * 0.92);
  float rimScale = 1.0 + edgeWrap + channelSign * dispSpan;
  float localScale = mix(centerFrameScale, rimScale, sCurve);
  vec2 qScaled = qLens * localScale;
  return lensCenter + rotate2D(qScaled, -uTilt);
}

void main() {
  float safeAspect = max(1.4, uAspect);
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);

  float pillHalfH = 0.352;
  float pillHalfW = min(safeAspect * 0.448, 1.112);
  float pillRadius = pillHalfH;
  float borderWidth = 0.0165;

  // 静态基准旅行范围（与 getStageMetrics 100% 锁定一致）
  float staticLensBaseW = 0.256;
  float travelSpan = max(0.1, pillHalfW - staticLensBaseW * 1.035);

  // 圆润饱满的苹果 Liquid Glass 滑块（响应悬停微浮、按压充盈与果冻形变）
  float lensBaseW = 0.256 * (1.0 + uHover * 0.016 + uPress * 0.038 + uSquash * 0.48);
  float lensBaseH = (pillHalfH + 0.044) * (1.0 + uHover * 0.012 + uPress * 0.026 - uSquash * 0.26);
  float lensRadius = min(lensBaseW, lensBaseH);

  float lensCenterX = mix(-travelSpan, travelSpan, uProgress);
  vec2 lensCenter = vec2(lensCenterX, 0.0);

  vec2 qLens = rotate2D(p - lensCenter, uTilt);
  float dLens = sdRoundBox(qLens, vec2(lensBaseW, lensBaseH), lensRadius);

  float baseStage = clamp(uProgress, 0.0, 1.0) * 3.0;

  // 1. 主胶囊画框悬浮投影与实体合成
  float dShadowA = sdRoundBox(p - vec2(0.0, -0.022), vec2(pillHalfW, pillHalfH), pillRadius);
  float dShadowB = sdRoundBox(p - vec2(0.0, -0.008), vec2(pillHalfW, pillHalfH), pillRadius);
  float pillShadowA = clamp(
    revSmooth(0.11, -0.006, dShadowA) * (uIsDark > 0.5 ? 0.50 : 0.115) +
    revSmooth(0.04, -0.004, dShadowB) * (uIsDark > 0.5 ? 0.34 : 0.075) * 0.5,
    0.0, 0.78
  );
  vec4 shadowPremul = vec4(vec3(0.02, 0.03, 0.06) * pillShadowA, pillShadowA);
  vec4 bodyPremul = sampleSceneBody(p, lensCenter, 1.0, baseStage, vec2(pillHalfW, pillHalfH), pillRadius, borderWidth);
  vec4 underGlass = bodyPremul + shadowPremul * (1.0 - bodyPremul.a);

  // 2. 玻璃透镜偏置外投影（严格裁除玻璃内腔 dLens < 0，确保上下玻璃耳部 100% 晶莹透明无灰雾）
  vec2 qShadow = rotate2D(p - (lensCenter + vec2(0.004, -0.020)), uTilt);
  float dLensShadow = sdRoundBox(qShadow, vec2(lensBaseW * 1.003, lensBaseH * 1.002), lensRadius);
  float outsideLens = smoothstep(-0.001, 0.008, dLens);
  float onPillBoost = mix(0.38, 1.0, bodyPremul.a);
  float lensShadowAlpha = revSmooth(0.068, 0.0, dLensShadow) * outsideLens * onPillBoost * (uIsDark > 0.5 ? 0.32 : 0.082);

  vec4 basePremul = vec4(
    underGlass.rgb * (1.0 - lensShadowAlpha),
    underGlass.a + lensShadowAlpha * (1.0 - underGlass.a)
  );

  // 3. 液态玻璃透镜单调折射、全透明水晶耳部、边缘全内反射暗环与双层菲涅尔高光细丝
  float lensAA = 0.0026;
  if (dLens < lensAA) {
    float eps = 0.0020;
    float dx = sdRoundBox(qLens + vec2(eps, 0.0), vec2(lensBaseW, lensBaseH), lensRadius)
             - sdRoundBox(qLens - vec2(eps, 0.0), vec2(lensBaseW, lensBaseH), lensRadius);
    float dy = sdRoundBox(qLens + vec2(0.0, eps), vec2(lensBaseW, lensBaseH), lensRadius)
             - sdRoundBox(qLens - vec2(0.0, eps), vec2(lensBaseW, lensBaseH), lensRadius);
    vec2 gradLocal = normalize(vec2(dx, dy) + 1e-6);

    // 冲击波拂过玻璃表层时的微扰法线与亮波光
    float rippleGlassBoost = 0.0;
    for (int i = 0; i < 4; i++) {
      vec4 rp = uRipples[i];
      if (rp.z >= 0.0 && rp.z < 1.35) {
        vec2 dVec = p - rp.xy;
        float dist = length(dVec);
        float radius = rp.z * 1.18;
        float band = exp(-pow((dist - radius) * 14.0, 2.0));
        float osc = sin((dist - radius) * 52.0);
        float env = band * exp(-rp.z * 2.5) * smoothstep(0.0, 0.035, rp.z) * rp.w;
        vec2 dir = dist > 1e-5 ? dVec / dist : vec2(1.0, 0.0);
        gradLocal = normalize(gradLocal + rotate2D(dir, uTilt) * osc * env * 0.24);
        rippleGlassBoost += max(0.0, osc) * env * 0.22;
      }
    }

    vec2 normal = rotate2D(gradLocal, -uTilt);
    float depth = max(0.0, -dLens);
    float normDepth = clamp(depth / lensRadius, 0.0, 1.0);
    float lensStage = uMode > 0.5 ? mod(baseStage + 1.0, 4.0) : baseStage;

    float sCurve = computeSCurveWeight(depth);
    float edgeWrap = 0.084 * safeTanh(uRefraction * 0.92);
    float maxSafeDisp = max(0.0, (1.0 + edgeWrap - 0.985) * 0.42);
    float dispSpan = min(maxSafeDisp, 0.014 * uDispersion * clamp(uRefraction, 0.4, 1.8));
    float innerZoom = mix(max(1.0, uMagnify), 1.0, sCurve * 0.65);

    vec2 uvG = computeMonotonicRefractedPos(lensCenter, qLens, sCurve, uRefraction, 0.0, dispSpan);
    vec4 sG = sampleSceneBody(uvG, lensCenter, innerZoom, lensStage, vec2(pillHalfW, pillHalfH), pillRadius, borderWidth);

    vec3 bodyCol = sG.rgb;
    float bodyCov = sG.a;

    // 仅在存在壁厚弯折且开启色散时计算 R/B 棱镜色散通道，中心平坦区零额外开销
    if (sCurve > 0.004 && dispSpan > 0.0005) {
      vec2 uvR = computeMonotonicRefractedPos(lensCenter, qLens, sCurve, uRefraction, -1.0, dispSpan);
      vec2 uvB = computeMonotonicRefractedPos(lensCenter, qLens, sCurve, uRefraction, 1.0, dispSpan);
      vec4 sR = sampleSceneBody(uvR, lensCenter, innerZoom, lensStage, vec2(pillHalfW, pillHalfH), pillRadius, borderWidth);
      vec4 sB = sampleSceneBody(uvB, lensCenter, innerZoom, lensStage, vec2(pillHalfW, pillHalfH), pillRadius, borderWidth);
      float minCov = min(sR.a, min(sG.a, sB.a));
      float dispFade = smoothstep(0.08, 0.96, minCov);
      bodyCol = mix(sG.rgb, vec3(sR.r, sG.g, sB.b), dispFade);
      bodyCov = mix(sG.a, clamp((sR.a + sG.a + sB.a) / 3.0, 0.0, 1.0), dispFade);
    }

    // 上下突出主胶囊的「玻璃耳部」：极度清澈全透明，且保留耳部正下方主胶囊外投影（防止浅色画廊纸下发白缺口）
    vec3 emptyTint = uIsDark > 0.5 ? vec3(0.86, 0.93, 1.0) : vec3(0.996, 0.999, 1.0);
    float emptyAlpha = uIsDark > 0.5 ? (0.024 + uHover * 0.010) : (0.014 + uHover * 0.006);
    vec4 emptyGlass = vec4(emptyTint * emptyAlpha, emptyAlpha);

    vec4 earUnder = shadowPremul * (1.0 - bodyCov);
    vec4 emptyOverShadow = emptyGlass * (1.0 - bodyCov) + earUnder * (1.0 - emptyAlpha);
    vec4 glassPremul = vec4(bodyCol, bodyCov) + emptyOverShadow;

    // 光学光源方向
    vec2 lightDir = normalize(vec2(-0.54 + uParallax.x * 0.18, 0.84 + uParallax.y * 0.14));
    float rimPrimary = clamp(dot(normal, lightDir), 0.0, 1.0);
    float rimBounce = clamp(dot(normal, -lightDir), 0.0, 1.0);

    // 边缘全内反射暗环（TIR Ring）：勾勒晶莹耳部与玻璃壁厚质感而不污染中心清澈度
    float tirBand = smoothstep(0.002, 0.012, normDepth) * (1.0 - smoothstep(0.012, 0.036, normDepth));
    float tirShade = tirBand * (0.28 + 0.72 * (1.0 - rimPrimary * 0.65));
    vec3 tirDarkCol = uIsDark > 0.5 ? vec3(0.03, 0.05, 0.09) : vec3(0.14, 0.20, 0.30);
    float tirAlpha = tirShade * (uIsDark > 0.5 ? 0.36 : 0.15) * (1.0 - bodyCov * 0.62);
    glassPremul = vec4(tirDarkCol * tirAlpha, tirAlpha) + glassPremul * (1.0 - tirAlpha);

    // 外圈锐利双层菲涅尔高光细丝（外亮丝 + 内回光折射细丝）
    float fresnel = pow(1.0 - clamp(normDepth * 5.0, 0.0, 1.0), 3.2);
    float outerRimLine = revSmooth(0.012, 0.002, normDepth) * smoothstep(0.0, 0.0032, normDepth);
    float innerRimBounce = revSmooth(0.046, 0.022, normDepth) * smoothstep(0.011, 0.022, normDepth);
    float lusterBoost = 1.0 + uHover * 0.12 + uPress * 0.16;

    float baseRimLum = uIsDark > 0.5 ? 0.18 : 0.10;
    float specStrength = (pow(rimPrimary, 2.6) * fresnel * 0.34
                       + outerRimLine * (baseRimLum + 0.68 * pow(rimPrimary, 1.35) + 0.28 * pow(rimBounce, 1.8))
                       + innerRimBounce * 0.20 * (0.30 + 0.70 * rimBounce)) * lusterBoost;

    // 仅在实体覆膜处赋予极轻柔左上微光与波纹焦散，耳部绝不铺灰雾
    float surfaceGlint = revSmooth(0.45, -0.45, qLens.x / lensBaseW + 0.14)
                       * smoothstep(-0.05, 0.85, qLens.y / lensBaseH)
                       * smoothstep(0.04, 0.24, normDepth) * 0.026 * bodyCov;

    float totalSpec = clamp(specStrength + surfaceGlint + rippleGlassBoost * (0.35 + 0.65 * bodyCov), 0.0, 0.94);

    // 窥镜模式（uMode > 0.5）下高光细丝自带维度灵辉（时间冰青 / 情绪绯紫 / 空间翠霓）
    vec3 portalHueBase = uDimension == 0
      ? vec3(0.40, 0.80, 1.0)
      : uDimension == 1
        ? vec3(0.82, 0.58, 1.0)
        : vec3(0.36, 0.96, 0.82);
    vec3 modeHue = uMode > 0.5
      ? portalHueBase * (innerRimBounce * 0.42 + outerRimLine * 0.18 + fresnel * 0.08)
      : vec3(0.0);

    vec3 specCol = vec3(1.0, 0.998, 0.995) * totalSpec + modeHue;
    float specAlpha = clamp(totalSpec + length(modeHue) * 0.42, 0.0, 1.0);

    glassPremul.rgb = clamp(glassPremul.rgb + specCol * (1.0 - 0.08 * glassPremul.a), 0.0, 1.0);
    glassPremul.a = clamp(glassPremul.a + specAlpha * (1.0 - glassPremul.a), 0.0, 1.0);

    // 极纤细 1px 透明露珠外缘定界切线（让晶莹耳部在浅色画廊纸面下也轮廓清晰）
    float edgeMask = revSmooth(0.0065, 0.001, normDepth);
    float borderWeight = uIsDark > 0.5 ? (0.16 + 0.24 * rimPrimary) : mix(0.26, 0.06, rimPrimary);
    vec3 borderCol = uIsDark > 0.5 ? vec3(0.95, 0.98, 1.0) : vec3(0.38, 0.44, 0.54);
    float strokeA = edgeMask * borderWeight * (1.0 - bodyCov * 0.66);
    vec4 borderPremul = vec4(borderCol * strokeA, strokeA);
    glassPremul = borderPremul + glassPremul * (1.0 - strokeA);

    float lensMask = 1.0 - smoothstep(-lensAA, lensAA, dLens);
    basePremul = mix(basePremul, glassPremul, lensMask);
  }

  fragColor = basePremul;
}
`;

class LiquidGlassRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.onLoadProgress = options.onLoadProgress || (() => {});

    this.gl = null;
    this.ctx2d = null;
    this.isWebGL = false;
    this.program = null;
    this.uniforms = {};
    this.textures = [null, null, null, null];
    this.images = [null, null, null, null];
    this.loadedMask = [0, 0, 0, 0];

    this.state = {
      dimension: 'time',
      progress: 0,
      squash: 0,
      tilt: 0,
      hover: 0,
      press: 0,
      parallaxX: 0,
      parallaxY: 0,
      isDark: 0,
      mode: 0,
      refraction: 1.0,
      dispersion: 1.0,
      magnify: 1.08,
      particles: 1.0,
    };

    // 交互冲击波环形缓冲区（不依赖粒子开关即可独立衰变）
    this.ripples = [];
    this.animTime = 0;
    this.lastRenderMs = performance.now();
    this.width = 1;
    this.height = 1;
    this.dpr = 1;

    this.#initContext();
    this.resize();
    this.#loadTimeTextures();
  }

  /**
   * 获取当前画布对应的统一精确几何参数
   */
  getMetrics() {
    const aspect = this.width / Math.max(1, this.height);
    return getStageMetrics(aspect);
  }

  /**
   * 切换渲染维度（'time' | 'mood' | 'space'）
   */
  setDimension(dimId) {
    const nextDim = VALID_DIMENSIONS.includes(dimId) ? dimId : 'time';
    this.state.dimension = nextDim;
  }

  /**
   * 设置背景主题色与明暗模式
   */
  setThemeColor(_hexOrRgb, isDark) {
    this.state.isDark = isDark ? 1.0 : 0.0;
  }

  /**
   * 在舞台归一化坐标 (u, v) 触发液态水波纹冲击波
   * @param {number} u 水平归一化坐标 [0, 1]（左 0 -> 右 1）
   * @param {number} v 垂直归一化坐标 [0, 1]（下 0 -> 上 1，0.5 为中轴）
   * @param {number} intensity 冲击波强度 [0.1, 1.5]
   */
  triggerRipple(u = 0.5, v = 0.5, intensity = 0.7) {
    const nu = Math.max(0, Math.min(1, Number.isFinite(u) ? u : 0.5));
    const nv = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0.5));
    const amp = Math.max(0.08, Math.min(1.5, Number.isFinite(intensity) ? intensity : 0.7));
    const nowSec = performance.now() * 0.001;

    this.ripples.push({
      u: nu,
      v: nv,
      startSec: nowSec,
      intensity: amp,
    });
    if (this.ripples.length > MAX_RIPPLES) {
      this.ripples.shift();
    }
  }

  /**
   * 辅助主循环判断当前是否仍有需要持续刷新的GPU动效（粒子、实时流变或未衰变的水波纹）
   */
  hasActiveAnimation(nowMs = performance.now()) {
    const nowSec = nowMs * 0.001;
    this.ripples = this.ripples.filter((rp) => nowSec - rp.startSec < RIPPLE_DURATION_SEC);
    if (this.ripples.length > 0) return true;
    return this.state.particles > 0.01;
  }

  #initContext() {
    try {
      const gl = this.canvas.getContext('webgl2', {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        powerPreference: 'high-performance',
      });
      if (gl && this.#initWebGL(gl)) {
        this.gl = gl;
        this.isWebGL = true;
        return;
      }
    } catch (_) {
      // 降级到 Canvas 2D
    }

    this.ctx2d = this.canvas.getContext('2d');
    this.isWebGL = false;
  }

  #initWebGL(gl) {
    const vs = this.#compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = this.#compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vs || !fs) return false;

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('WebGL2 program link error:', gl.getProgramInfoLog(prog));
      return false;
    }
    this.program = prog;
    gl.useProgram(prog);

    const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const names = [
      'uTexAncient', 'uTexGolden', 'uTexNeon', 'uTexAstral', 'uLoaded',
      'uDimension', 'uAspect', 'uTime', 'uProgress', 'uSquash', 'uTilt',
      'uHover', 'uPress', 'uParallax', 'uIsDark', 'uMode',
      'uRefraction', 'uDispersion', 'uMagnify', 'uParticles',
      'uRipples[0]', 'uRipples[1]', 'uRipples[2]', 'uRipples[3]',
    ];
    for (const n of names) {
      this.uniforms[n] = gl.getUniformLocation(prog, n);
    }

    gl.uniform1i(this.uniforms.uTexAncient, 0);
    gl.uniform1i(this.uniforms.uTexGolden, 1);
    gl.uniform1i(this.uniforms.uTexNeon, 2);
    gl.uniform1i(this.uniforms.uTexAstral, 3);

    for (let i = 0; i < 4; i++) {
      const tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([240, 232, 238, 255])
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      this.textures[i] = tex;
    }

    return true;
  }

  #compileShader(gl, type, src) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  #loadTimeTextures() {
    let loadedCount = 0;
    const texMap = global.SHIKI_TIME_TEXTURES || (typeof window !== 'undefined' ? window.SHIKI_TIME_TEXTURES : null);
    TIME_KEYS.forEach((key, idx) => {
      const img = new Image();
      img.decoding = 'async';
      if (idx <= 1) img.fetchPriority = 'high';

      img.onload = () => {
        if (this.isWebGL && this.gl) {
          const gl = this.gl;
          try {
            gl.activeTexture(gl.TEXTURE0 + idx);
            gl.bindTexture(gl.TEXTURE_2D, this.textures[idx]);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          } catch (_) {
            this.loadedMask[idx] = 0;
            return;
          }
        }
        this.images[idx] = img;
        this.loadedMask[idx] = 1;
        loadedCount += 1;
        this.onLoadProgress(loadedCount);
      };
      img.onerror = () => {
        // 尚在产出或加载受阻时静默保持 loadedMask[idx]=0，由片元着色器程序化兜底
        this.loadedMask[idx] = 0;
      };
      const dataUri = texMap && typeof texMap[key] === 'string' ? texMap[key] : null;
      img.src = dataUri || `assets/time-${key}.webp`;
    });
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.round(rect.width * this.dpr);
    const targetH = Math.round(rect.height * this.dpr);
    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }
    this.width = targetW;
    this.height = targetH;
    if (this.isWebGL && this.gl) {
      this.gl.viewport(0, 0, targetW, targetH);
    }
  }

  render(nowMs = performance.now()) {
    const dtSec = Math.max(0, Math.min(0.05, (nowMs - this.lastRenderMs) * 0.001));
    this.lastRenderMs = nowMs;

    // 仅在启用粒子/流体时累加动画相位，归零或减动效休眠时平滑定格，彻底杜绝跳变
    if (this.state.particles > 0.01) {
      this.animTime += dtSec;
    }

    const nowSec = nowMs * 0.001;
    this.ripples = this.ripples.filter((rp) => nowSec - rp.startSec < RIPPLE_DURATION_SEC);

    if (this.isWebGL && this.gl) {
      const gl = this.gl;
      const u = this.uniforms;
      const st = this.state;
      const aspect = this.width / Math.max(1, this.height);
      const dimIndex = Math.max(0, VALID_DIMENSIONS.indexOf(st.dimension));

      gl.useProgram(this.program);
      gl.uniform4f(u.uLoaded, this.loadedMask[0], this.loadedMask[1], this.loadedMask[2], this.loadedMask[3]);
      gl.uniform1i(u.uDimension, dimIndex);
      gl.uniform1f(u.uAspect, aspect);
      gl.uniform1f(u.uTime, this.animTime);
      gl.uniform1f(u.uProgress, st.progress);
      gl.uniform1f(u.uSquash, st.squash);
      gl.uniform1f(u.uTilt, st.tilt);
      gl.uniform1f(u.uHover, st.hover);
      gl.uniform1f(u.uPress, st.press);
      gl.uniform2f(u.uParallax, st.parallaxX, st.parallaxY);
      gl.uniform1f(u.uIsDark, st.isDark);
      gl.uniform1f(u.uMode, st.mode);
      gl.uniform1f(u.uRefraction, st.refraction);
      gl.uniform1f(u.uDispersion, st.dispersion);
      gl.uniform1f(u.uMagnify, st.magnify);
      gl.uniform1f(u.uParticles, st.particles);

      for (let i = 0; i < MAX_RIPPLES; i++) {
        const rp = this.ripples[i];
        if (rp) {
          const rx = (rp.u - 0.5) * aspect;
          const ry = rp.v - 0.5;
          const age = Math.max(0, nowSec - rp.startSec);
          gl.uniform4f(u[`uRipples[${i}]`], rx, ry, age, rp.intensity);
        } else {
          gl.uniform4f(u[`uRipples[${i}]`], 0, 0, -1, 0);
        }
      }

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    } else if (this.ctx2d) {
      this.#renderFallback2D(nowSec);
    }
  }

  // ============================================================================
  // Canvas 2D 三维度兼容降级路径（严格复用 getMetrics 几何同源与透明玻璃耳部规范）
  // ============================================================================
  #renderFallback2D(nowSec = performance.now() * 0.001) {
    const ctx = this.ctx2d;
    const w = this.width;
    const h = this.height;
    const st = this.state;
    const m = this.getMetrics();

    ctx.clearRect(0, 0, w, h);

    const pillW = m.pillHalfW * 2 * h;
    const pillH = m.pillHalfH * 2 * h;
    const px = (w - pillW) / 2;
    const py = (h - pillH) / 2;
    const r = pillH / 2;
    const border = m.borderWidth * h;

    // 1. 胶囊外投影与洁白瓷框
    ctx.save();
    ctx.shadowColor = st.isDark > 0.5 ? 'rgba(0,0,0,0.52)' : 'rgba(20,22,28,0.14)';
    ctx.shadowBlur = 24 * this.dpr;
    ctx.shadowOffsetY = 8 * this.dpr;
    ctx.fillStyle = st.isDark > 0.5 ? '#eaecef' : '#fefefe';
    this.#roundRectPath(ctx, px, py, pillW, pillH, r);
    ctx.fill();
    ctx.restore();

    const drawDimensionScene = (stageVal, scaleBoost = 1.0, cxAnchor = w / 2, cyAnchor = h / 2) => {
      ctx.save();
      if (scaleBoost !== 1.0) {
        ctx.translate(cxAnchor, cyAnchor);
        ctx.scale(scaleBoost, scaleBoost);
        ctx.translate(-cxAnchor, -cyAnchor);
      }
      if (st.dimension === 'mood') {
        this.#drawMood2D(ctx, px + border, py + border, pillW - border * 2, pillH - border * 2, stageVal);
      } else if (st.dimension === 'space') {
        this.#drawSpace2D(ctx, px + border, py + border, pillW - border * 2, pillH - border * 2, stageVal);
      } else {
        this.#drawTime2D(ctx, px + border, py + border, pillW - border * 2, pillH - border * 2, stageVal);
      }
      this.#drawRipples2D(ctx, w, h, nowSec);
      ctx.restore();
    };

    // 2. 主胶囊内部场景
    ctx.save();
    this.#roundRectPath(ctx, px + border, py + border, pillW - border * 2, pillH - border * 2, r - border);
    ctx.clip();
    const s = Math.max(0, Math.min(3, st.progress * 3));
    drawDimensionScene(s, 1.0);
    ctx.restore();

    // 3. 液态玻璃滑块（全透明耳部 + 偏置外投影 + 边缘暗环 + 双层高光丝）
    const lensW = m.lensBaseW * 2 * h * (1 + st.hover * 0.016 + st.press * 0.038 + st.squash * 0.48);
    const lensH = m.lensBaseH * 2 * h * (1 + st.hover * 0.012 + st.press * 0.026 - st.squash * 0.26);
    const spanPx = m.travelSpan * h;
    const cx = w / 2 + (st.progress * 2 - 1) * spanPx;
    const cy = h / 2;
    const lensR = Math.min(lensW, lensH) / 2;

    // 仅在透镜外部投射阴影，隔离透明耳部内腔
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.translate(cx, cy);
    ctx.rotate(st.tilt);
    ctx.roundRect(-lensW / 2, -lensH / 2, lensW, lensH, lensR);
    ctx.clip('evenodd');
    ctx.shadowColor = st.isDark > 0.5 ? 'rgba(0,0,0,0.48)' : 'rgba(18,22,30,0.14)';
    ctx.shadowBlur = 16 * this.dpr;
    ctx.shadowOffsetX = 2 * this.dpr;
    ctx.shadowOffsetY = 6 * this.dpr;
    ctx.fillStyle = '#000000';
    this.#roundRectPath(ctx, -lensW / 2, -lensH / 2, lensW, lensH, lensR);
    ctx.fill();
    ctx.restore();

    // 透镜内部聚焦折射（上下突出耳部完全透明，不填充任何雾白背景）
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(st.tilt);
    this.#roundRectPath(ctx, -lensW / 2, -lensH / 2, lensW, lensH, lensR);
    ctx.clip();

    ctx.rotate(-st.tilt);
    ctx.translate(-cx, -cy);
    ctx.save();
    this.#roundRectPath(ctx, px, py, pillW, pillH, r);
    ctx.clip();
    ctx.fillStyle = st.isDark > 0.5 ? '#eef0f5' : '#fefefe';
    ctx.fillRect(px, py, pillW, pillH);
    this.#roundRectPath(ctx, px + border, py + border, pillW - border * 2, pillH - border * 2, r - border);
    ctx.clip();
    const lensStage = st.mode > 0.5 ? (s + 1) % 4 : s;
    drawDimensionScene(lensStage, Math.max(1.12, st.magnify * 1.06), cx, cy);
    ctx.restore();
    ctx.restore();

    // 全内反射暗环与双层锐利菲涅尔高光细丝
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(st.tilt);

    ctx.strokeStyle = st.isDark > 0.5 ? 'rgba(8,14,26,0.42)' : 'rgba(42,56,78,0.16)';
    ctx.lineWidth = 3.2 * this.dpr;
    this.#roundRectPath(ctx, -lensW / 2 + 1.6 * this.dpr, -lensH / 2 + 1.6 * this.dpr, lensW - 3.2 * this.dpr, lensH - 3.2 * this.dpr, Math.max(4, lensR - 1.6 * this.dpr));
    ctx.stroke();

    ctx.strokeStyle = st.isDark > 0.5 ? 'rgba(215,232,255,0.42)' : 'rgba(98,112,136,0.24)';
    ctx.lineWidth = 1.2 * this.dpr;
    this.#roundRectPath(ctx, -lensW / 2, -lensH / 2, lensW, lensH, lensR);
    ctx.stroke();

    const inset = 2.1 * this.dpr;
    const innerGrad = ctx.createLinearGradient(-lensW / 2, -lensH / 2, lensW / 2, lensH / 2);
    innerGrad.addColorStop(0, 'rgba(255,255,255,0.94)');
    innerGrad.addColorStop(0.5, st.mode > 0.5 ? 'rgba(116,204,255,0.62)' : 'rgba(255,255,255,0.28)');
    innerGrad.addColorStop(1, 'rgba(255,255,255,0.84)');
    ctx.strokeStyle = innerGrad;
    ctx.lineWidth = 1.5 * this.dpr;
    this.#roundRectPath(ctx, -lensW / 2 + inset, -lensH / 2 + inset, lensW - inset * 2, lensH - inset * 2, Math.max(4, lensR - inset));
    ctx.stroke();
    ctx.restore();
  }

  #drawTime2D(ctx, ix, iy, iw, ih, stageVal) {
    const sWrapped = ((stageVal % 4) + 4) % 4;
    const idxA = Math.floor(sWrapped) % 4;
    const idxB = (idxA + 1) % 4;
    const frac = sWrapped - Math.floor(sWrapped);

    const paintIdx = (idx, alpha) => {
      const img = this.images[idx];
      ctx.save();
      ctx.globalAlpha = alpha;
      if (img) {
        const imgAspect = 1376 / 768;
        const dw = iw / 0.984;
        const dh = dw / imgAspect;
        const dx = ix + (iw - dw) / 2 + this.state.parallaxX * 0.007 * dw;
        const dy = iy + (ih - dh) * 0.495 - this.state.parallaxY * 0.006 * dh;
        ctx.drawImage(img, dx, dy, dw, dh);
      } else {
        const fallbackPalettes = [
          ['#f6d4c6', '#c6d8ec'],
          ['#fcda9e', '#f4c2ae'],
          ['#10183a', '#1e78a8'],
          ['#151436', '#4e48b2'],
        ];
        const pal = fallbackPalettes[idx] || fallbackPalettes[0];
        const grad = ctx.createLinearGradient(ix, iy, ix + iw, iy + ih);
        grad.addColorStop(0, pal[0]);
        grad.addColorStop(1, pal[1]);
        ctx.fillStyle = grad;
        ctx.fillRect(ix, iy, iw, ih);
        if (idx >= 2 && this.images[0]) {
          ctx.globalAlpha = alpha * 0.45;
          const dw = iw / 0.984;
          const dh = dw / (1376 / 768);
          ctx.drawImage(this.images[0], ix + (iw - dw) / 2, iy + (ih - dh) * 0.495, dw, dh);
        }
      }
      ctx.restore();
    };

    paintIdx(idxA, 1);
    if (frac > 0.01 && idxB !== idxA) paintIdx(idxB, frac);
  }

  #mixRgb(a, b, t) {
    return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)}, ${Math.round(a[1] + (b[1] - a[1]) * t)}, ${Math.round(a[2] + (b[2] - a[2]) * t)})`;
  }

  #drawMood2D(ctx, ix, iy, iw, ih, stageVal) {
    const sWrapped = ((stageVal % 4) + 4) % 4;
    const idxA = Math.floor(sWrapped) % 4;
    const idxB = (idxA + 1) % 4;
    const frac = sWrapped - Math.floor(sWrapped);

    const palettes = [
      { top: [152, 222, 226], mid: [248, 232, 202], bot: [164, 214, 218] },
      { top: [120, 22, 16], mid: [245, 114, 34], bot: [254, 208, 96] },
      { top: [10, 18, 38], mid: [26, 44, 78], bot: [14, 24, 46] },
      { top: [20, 16, 48], mid: [96, 62, 156], bot: [68, 178, 172] },
    ];

    const grad = ctx.createLinearGradient(ix, iy, ix, iy + ih);
    grad.addColorStop(0, this.#mixRgb(palettes[idxA].top, palettes[idxB].top, frac));
    grad.addColorStop(0.55, this.#mixRgb(palettes[idxA].mid, palettes[idxB].mid, frac));
    grad.addColorStop(1, this.#mixRgb(palettes[idxA].bot, palettes[idxB].bot, frac));
    ctx.fillStyle = grad;
    ctx.fillRect(ix, iy, iw, ih);

    // 孤寂雨夜孤灯微光与雨丝
    const rainWeight = Math.max(0, 1 - Math.min(Math.abs(sWrapped - 2), 4 - Math.abs(sWrapped - 2)));
    if (rainWeight > 0.05) {
      ctx.save();
      ctx.globalAlpha = rainWeight * 0.7;
      const lx = ix + iw * 0.74;
      const ly = iy + ih * 0.44;
      const lamp = ctx.createRadialGradient(lx, ly, 2, lx, ly, ih * 0.45);
      lamp.addColorStop(0, 'rgba(255,220,140,0.9)');
      lamp.addColorStop(1, 'rgba(255,160,60,0)');
      ctx.fillStyle = lamp;
      ctx.fillRect(ix, iy, iw, ih);
      ctx.strokeStyle = 'rgba(170,205,255,0.35)';
      ctx.lineWidth = 1.1 * this.dpr;
      for (let i = 0; i < 18; i++) {
        const rx = ix + ((i * 73 + this.animTime * 90) % iw);
        const ry = iy + ((i * 41 + this.animTime * 220) % ih);
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - 8 * this.dpr, ry + 26 * this.dpr);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  #drawSpace2D(ctx, ix, iy, iw, ih, stageVal) {
    const sWrapped = ((stageVal % 4) + 4) % 4;
    const idxA = Math.floor(sWrapped) % 4;
    const idxB = (idxA + 1) % 4;
    const frac = sWrapped - Math.floor(sWrapped);

    const palettes = [
      { a: [8, 50, 35], b: [29, 138, 92] },
      { a: [11, 46, 86], b: [60, 160, 196] },
      { a: [4, 8, 24], b: [20, 66, 110] },
      { a: [5, 4, 12], b: [38, 20, 58] },
    ];
    const grad = ctx.createLinearGradient(ix, iy, ix + iw, iy + ih);
    grad.addColorStop(0, this.#mixRgb(palettes[idxA].a, palettes[idxB].a, frac));
    grad.addColorStop(1, this.#mixRgb(palettes[idxA].b, palettes[idxB].b, frac));
    ctx.fillStyle = grad;
    ctx.fillRect(ix, iy, iw, ih);

    const stageWeight = (target) => Math.max(0, 1 - Math.min(Math.abs(sWrapped - target), 4 - Math.abs(sWrapped - target)));

    // 0. 微观纳米叶脉与晶莹露珠
    const microWeight = stageWeight(0);
    if (microWeight > 0.05) {
      ctx.save();
      ctx.globalAlpha = microWeight;
      ctx.strokeStyle = 'rgba(130, 248, 188, 0.55)';
      ctx.lineWidth = 2.0 * this.dpr;
      ctx.beginPath();
      ctx.moveTo(ix, iy + ih * 0.52);
      ctx.quadraticCurveTo(ix + iw * 0.5, iy + ih * 0.44, ix + iw, iy + ih * 0.54);
      ctx.stroke();
      ctx.lineWidth = 1.1 * this.dpr;
      ctx.strokeStyle = 'rgba(110, 232, 174, 0.32)';
      for (let i = 1; i < 8; i++) {
        const vx = ix + (iw * i) / 8;
        ctx.beginPath();
        ctx.moveTo(vx, iy + ih * 0.49);
        ctx.lineTo(vx + ih * 0.45, iy);
        ctx.moveTo(vx, iy + ih * 0.49);
        ctx.lineTo(vx + ih * 0.45, iy + ih);
        ctx.stroke();
      }
      for (const [fx, fy, fr] of [[0.3, 0.42, 0.08], [0.52, 0.58, 0.10], [0.74, 0.45, 0.07]]) {
        const dx = ix + iw * fx;
        const dy = iy + ih * fy;
        const dr = ih * fr;
        const dropGrad = ctx.createRadialGradient(dx - dr * 0.3, dy - dr * 0.3, dr * 0.1, dx, dy, dr);
        dropGrad.addColorStop(0, 'rgba(230,255,244,0.92)');
        dropGrad.addColorStop(0.55, 'rgba(84,220,168,0.45)');
        dropGrad.addColorStop(1, 'rgba(10,64,46,0.75)');
        ctx.fillStyle = dropGrad;
        ctx.beginPath();
        ctx.arc(dx, dy, dr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 1. 苍穹沧海孤岛日照
    const horizonWeight = stageWeight(1);
    if (horizonWeight > 0.05) {
      ctx.save();
      ctx.globalAlpha = horizonWeight;
      ctx.fillStyle = 'rgba(72, 206, 200, 0.36)';
      ctx.beginPath();
      ctx.ellipse(ix + iw * 0.54, iy + ih * 0.54, ih * 0.32, ih * 0.16, -0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6db34a';
      ctx.beginPath();
      ctx.ellipse(ix + iw * 0.54, iy + ih * 0.54, ih * 0.22, ih * 0.10, -0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(248, 252, 255, 0.42)';
      for (const [cx, cy, rx, ry] of [[0.24, 0.32, 0.32, 0.12], [0.76, 0.68, 0.36, 0.13]]) {
        ctx.beginPath();
        ctx.ellipse(ix + iw * cx, iy + ih * cy, ih * rx, ih * ry, 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 2. 轨道平流层星弧极光与星海
    const orbitWeight = stageWeight(2);
    if (orbitWeight > 0.05) {
      ctx.save();
      ctx.globalAlpha = orbitWeight;
      const px = ix + iw * 0.5;
      const py = iy + ih * 2.25;
      const pr = ih * 1.65;
      ctx.strokeStyle = 'rgba(72,226,184,0.68)';
      ctx.lineWidth = 6 * this.dpr;
      ctx.beginPath();
      ctx.arc(px, py, pr, Math.PI * 1.32, Math.PI * 1.68);
      ctx.stroke();
      ctx.restore();
    }

    // 3. 奇点黑洞事件视界
    const bhWeight = stageWeight(3);
    if (bhWeight > 0.05) {
      ctx.save();
      ctx.globalAlpha = bhWeight;
      const bx = ix + iw * 0.5;
      const by = iy + ih * 0.5;
      const br = ih * 0.24;
      const ring = ctx.createRadialGradient(bx, by, br * 0.85, bx, by, br * 2.1);
      ring.addColorStop(0, 'rgba(0,0,0,1)');
      ring.addColorStop(0.45, 'rgba(255,216,170,0.92)');
      ring.addColorStop(1, 'rgba(130,70,180,0)');
      ctx.fillStyle = ring;
      ctx.beginPath();
      ctx.arc(bx, by, br * 2.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#020206';
      ctx.beginPath();
      ctx.arc(bx, by, br * 0.88, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  #drawRipples2D(ctx, w, h, nowSec) {
    for (const rp of this.ripples) {
      const age = nowSec - rp.startSec;
      if (age < 0 || age >= RIPPLE_DURATION_SEC) continue;
      const rx = rp.u * w;
      const ry = (1 - rp.v) * h;
      const rad = age * 1.18 * h;
      const alpha = Math.max(0, (1 - age / RIPPLE_DURATION_SEC) * 0.45 * rp.intensity);
      ctx.save();
      ctx.strokeStyle = `rgba(220, 242, 255, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 2.0 * this.dpr;
      ctx.beginPath();
      ctx.arc(rx, ry, rad, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  #roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }
}

global.SHIKI = global.SHIKI || {};
global.SHIKI.getStageMetrics = getStageMetrics;
global.SHIKI.LiquidGlassRenderer = LiquidGlassRenderer;
})(window);
