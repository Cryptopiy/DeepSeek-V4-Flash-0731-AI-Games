/*
 * Interactive Black Hole — gravitational lensing, real-time approximation.
 * Full-screen ray-bent fragment shader + analytic photon-ring term.
 * Physics: planar null geodesics of a Schwarzschild-like metric (Binet
 * equation d^2u/dphi^2 + u = 3*m*u^2), integrated per-pixel.
 * Tuned with an offline reference simulator; not a full GR ray tracer.
 */

import * as THREE from 'three';

/* ------------------------------------------------------------------ */
/* Shaders (embedded for reliability — no fetch/loader needed)         */
/* ------------------------------------------------------------------ */

const VERT = /* glsl */`
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAG = /* glsl */`
precision highp float;

varying vec2 vUv;

uniform vec3  uCamPos;
uniform vec3  uCamForward;
uniform vec3  uCamRight;
uniform vec3  uCamUp;
uniform float uTanHalfV;
uniform float uTanHalfH;
uniform float uTime;           // elapsed anim time (minutes-free)
uniform float uLens;           // black-hole visual mass / lensing strength (rs multiplier)
uniform float uRs;             // world Rs base = 1.0
uniform float uDiskInner;      // accretion disk inner radius (Rs units)
uniform float uDiskOuter;
uniform float uDiskBright;
uniform float uTempBias;
uniform float uRotSpeed;
uniform float uExposure;
uniform float uDoppler;        // 0/1
uniform float uRingStrength;
uniform int   uStepsMax;       // quality-dependent loop budget
uniform int   uDebug;          // 0 = normal, 1..4 debug views

float EPS = 1e-5;

/* ---------------- hash / noise (WebGL1-compatible) ---------------- */

float hash2(float x) {
    x = mod(x, 289.0);
    x = mod((x * 34.0 + 1.0) * x, 289.0);
    return x / 289.0;
}

float noise2(vec2 p) {
    float xi = floor(mod(p.x, 289.0));
    float yi = floor(mod(p.y, 289.0));
    float xf = mod(p.x, 289.0) - xi;
    float yf = mod(p.y, 289.0) - yi;
    /* quintic-ish smoothstep */
    float u = xf * xf * xf * (xf * (xf * 6.0 - 15.0) + 10.0);
    float v = yf * yf * yf * (yf * (yf * 6.0 - 15.0) + 10.0);

    float a = hash2(mod(xi, 289.0) + mod(yi, 289.0) * 34.0);
    float b = hash2(mod(xi + 1.0, 289.0) + mod(yi, 289.0) * 34.0);
    float c = hash2(mod(xi, 289.0) + mod(yi + 1.0, 289.0) * 34.0);
    float d = hash2(mod(xi + 1.0, 289.0) + mod(yi + 1.0, 289.0) * 34.0);

    float x00 = a + (b - a) * u;
    float x10 = c + (d - c) * u;
    return x00 + (x10 - x00) * v;    /* [0,1] */
}

float fbm(vec2 p) {
    float sum = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
        sum += amp * noise2(p);
        p = p * 2.03;
        amp *= 0.5;
    }
    return sum;                        /* [0,1] */
}

float hash3(vec3 p) {
    return hash2(mod(p.x, 289.0) + mod(p.y, 289.0) * 11.0 + mod(p.z, 289.0) * 57.0);
}

/* ---------------- procedural background ---------------- */

vec3 starfield(vec3 dir, float t) {
    /* very subtle large-scale drift */
    float ca = cos(t * 0.004);
    float sa = sin(t * 0.004);
    vec3 d = vec3(dir.x * ca + dir.z * sa, dir.y, -dir.x * sa + dir.z * ca);

    vec3 col = vec3(0.0);

    /* Milky-way-like band + nebula haze */
    vec3 pole = normalize(vec3(0.35, 0.60, 0.72));
    float band = pow(clamp(1.0 - abs(dot(d, pole)), 0.0, 1.0), 4.0);
    float nb = fbm(vec2(d.x * 1.7 + 7.3, d.y * 2.6 + 1.1));
    band *= (0.35 + 0.55 * (nb * 0.5 + 0.5));
    col += band * vec3(0.045, 0.050, 0.082);

    /* star layer */
    vec3 g = floor(d * 30.0);
    vec3 f = fract(d * 30.0) - 0.5;
    float r1 = hash3(vec3(g.x, g.y + g.z * 57.0, 0.0));
    if (r1 > 0.55) {
        float rv = hash3(vec3(g.x * 0.31 + g.y * 0.17 + g.z * 0.23 + 7.0, 0.0, 0.0));
        float ang = (hash3(vec3(g.x * 0.5 + g.y * 0.3 + g.z * 0.1 + 31.0, 0.0, 0.0)) * 0.5 + 0.5) * 6.2831853;
        float cr = cos(ang); float sr = sin(ang);
        vec2 f2 = vec2(f.x * cr + f.y * sr, -f.x * sr + f.y * cr);
        float dist = sqrt(f2.x * f2.x + f2.y * f2.y + f.z * f.z);
        float rcore = 0.09 + 0.22 * (0.5 + 0.5 * rv);
        float rglow = 0.6 + 0.5 * rv;
        float core = pow(clamp(1.0 - dist / rcore, 0.0, 1.0), 0.9);
        float glow = pow(clamp(1.0 - dist / rglow, 0.0, 1.0), 4.0);
        float lum = (0.35 * core + 0.12 * glow) * (0.15 + 2.4 * pow(0.5 + 0.5 * rv, 6.0));
        col += lum * vec3(0.65 + 0.35 * rv, 0.70 + 0.30 * rv, 0.95 + 0.05 * rv);
    }
    return col;
}

/* ---------------- blackbody ramp ---------------- */

vec3 blackbody(float T) {
    T = clamp(T, 1000.0, 12000.0) / 100.0;
    float r = (T <= 66.0) ? 1.0 : 1.292936186062745 * pow(max(T - 60.0, 0.0), -0.1332047592);
    float g = (T <= 66.0)
        ? 0.390081578769019 * log(max(T, 1.0)) - 0.631841443788627
        : 1.129890860895294 * pow(max(T - 60.0, 0.0), -0.0755148492);
    float b = (T >= 66.0) ? 1.0
            : (T <= 19.0) ? 0.0
            : 0.543206789110191 * log(max(T - 10.0, 1.0)) - 1.196254089142947;
    return vec3(r, g, b);
}

/* ---------------- accretion disk shading ---------------- */

vec3 discShade(vec3 p, float time, float doppler) {
    float yRadius = length(p.xz);
    float rIn = uDiskInner;
    float rOut = uDiskOuter;

    float w = clamp((yRadius - rIn) / (rOut - rIn), 0.0, 1.0);
    w = pow(w, 0.9);
    float T = (9000.0 * exp(-2.9 * w) + 1600.0) * uTempBias;
    vec3 col = blackbody(T);

    /* Keplerian-ish sheared turbulence */
    float ang = atan(p.z, p.x);
    float rN = (yRadius - rIn) / (rOut - rIn);
    float kepler = pow(min(8.0, rIn / max(yRadius, 1e-6)), 1.5);
    float th = ang + time * uRotSpeed * kepler * 5.0;
    float ux = mod(rN * 5.0 - time * uRotSpeed * 0.6, 1.0);
    float uy = th / 6.2831853 * 6.0;

    float n1 = fbm(vec2(ux * 2.0 + 17.0, uy * 2.0 + 17.0));
    float n2 = fbm(vec2(ux * 3.0 + 91.0, uy * 1.3 + 91.0));
    float turb = (n1 * 0.5 + 0.5) * (0.55 + 0.45 * (n2 * 0.5 + 0.5));

    float lum = 1.0 / (1.0 + 2.6 * pow(rN, 2.6));
    lum *= turb;
    float rim = exp(-pow((yRadius - rIn) / (0.3 * rIn), 2.0));
    lum += rim * 0.9;
    float fade = clamp(1.0 - (yRadius - rOut * 0.96) / (rOut * 0.08), 0.0, 1.0);
    vec3 outCol = col * (lum * fade * uDiskBright * 1.55);

    if (doppler > 0.5) {
        vec3 tang = normalize(vec3(-p.z, 0.0, p.x));
        vec3 view = normalize(uCamPos - p);
        float cosg = dot(view, tang);
        float beam = 0.65 * cosg;
        float dop = 1.0 / max(1.0 - beam, 0.15);
        float boost = pow(dop, 3.2);
        float bluen = clamp(beam * 6.0, 0.0, 1.0);
        float redn = clamp(-beam * 6.0, 0.0, 1.0);
        vec3 shift = vec3(1.0 + bluen * 0.08 + redn * 0.35,
                          1.0 + bluen * 0.03 + redn * 0.05,
                          1.0 + bluen * 0.35 - redn * 0.3);
        outCol *= boost * shift;
    }
    return outCol;
}

/* ---------------- main ray bent trace ---------------- */

void main() {
    vec2 ndc = vUv * 2.0 - 1.0;
    vec3 ro = uCamPos;

    vec3 rd = normalize(
        uCamForward
        + ndc.x * uTanHalfH * uCamRight
        + ndc.y * uTanHalfV * uCamUp
    );

    /* Schwarzschild-like params (Rs = 1 world unit) */
    float rsEff = uRs * uLens;
    float m = rsEff * 0.5;
    float bCrit = 2.5981 * rsEff;

    /* impact parameter is conserved for central motion */
    float b = length(cross(ro, rd));

    /* ---- orbital plane basis ---- */
    vec3 n = normalize(cross(ro, rd) + vec3(EPS));
    vec3 e1 = normalize(ro - n * dot(ro, n));
    vec3 e2 = normalize(cross(n, e1));
    if (dot(rd, e2) < 0.0) e2 = -e2;

    float r0 = length(ro);
    vec3 rhat0 = ro / r0;

    /* Binet initial conditions: u = 1/r, up = du/dphi */
    float u = 1.0 / r0;
    float rdot0 = dot(rhat0, rd);
    float up = -rdot0 / max(b, 1e-9);

    float phi = 0.0;
    vec3 pos = ro;
    vec3 dirOut = rd;
    float uMax = 1.0 / (0.97 * rsEff);

    bool captured = false;
    bool hitDisk = false;
    vec3 hitPos = vec3(0.0);

    float R_esc = 1.4 * length(uCamPos);

    int steps = 0;

    for (int i = 0; i < 96; i++) {
        if (i >= uStepsMax) break;
        if (captured || hitDisk) break;

        u = max(u, EPS);
        float r = 1.0 / u;

        /* adaptive step in phi, refined near the turn-around */
        float curv = abs(3.0 * m * u * u - u) + 1e-7;
        float dphi = clamp(0.05 / curv, 1e-4, 0.06);
        if (r < 6.0 * rsEff) dphi *= 0.6;

        /* leapfrog / RK2 on (u, up) */
        float du = 3.0 * m * u * u - u;
        float um = u + 0.5 * dphi * up;
        float upm = up + 0.5 * dphi * du;
        float dum = 3.0 * m * um * um - um;
        float un = u + dphi * upm;
        float upn = up + dphi * dum;
        float rn = 1.0 / max(un, 1e-9);

        steps++;

        if (un > uMax) { captured = true; break; }

        /* escaped: ray turned around and is far enough out */
        if (un < u && rn > R_esc) {
            float cn = cos(phi + dphi);
            float sn = sin(phi + dphi);
            vec3 qhat = vec3(cn * e1.x + sn * e2.x,
                             cn * e1.y + sn * e2.y,
                             cn * e1.z + sn * e2.z);
            vec3 qphi = vec3(-sn * e1.x + cn * e2.x,
                             -sn * e1.y + cn * e2.y,
                             -sn * e1.z + cn * e2.z);
            float fb = 1.0 - rsEff / rn;
            float sq = max(0.0, 1.0 - fb * b * b / (rn * rn));
            float rdt = sqrt(sq);
            vec3 vout = rdt * qhat + (b / rn) * qphi;
            dirOut = normalize(vout);
            break;
        }

        /* disk plane crossing (y = 0) between consecutive samples */
        float s0 = pos.y;
        float s1 = 0.0;  /* compute below */
        {
            float cn = cos(phi + dphi);
            float sn = sin(phi + dphi);
            vec3 posNew = rn * vec3(cn * e1.x + sn * e2.x,
                                    cn * e1.y + sn * e2.y,
                                    cn * e1.z + sn * e2.z);
            s1 = posNew.y;
            if (s0 * s1 < 0.0) {
                float tc = clamp(s0 / (s0 - s1), 0.0, 1.0);
                vec3 ip = pos + (posNew - pos) * tc;
                float d2d = length(ip.xz);
                if (d2d > uDiskInner && d2d < uDiskOuter) {
                    hitDisk = true;
                    hitPos = ip;
                    break;
                }
            }
            pos = posNew;
        }
        phi += dphi;
        u = un;
        up = upn;
    }

    /* ---------------- shading ---------------- */

    vec3 col = vec3(0.0);

    /* analytic photon-ring / critical-region term from impact parameter */
    float db = b - bCrit;
    float ring = exp(-pow(db / (0.02 * rsEff), 2.0)) * uRingStrength;
    float ringW = exp(-pow(db / (0.12 * rsEff), 2.0)) * uRingStrength * 0.3;

    if (captured) {
        col = vec3(0.0);
    } else if (hitDisk) {
        col = discShade(hitPos, uTime, uDoppler);
        col += vec3(ring * 2.2 + ringW * 0.5,
                    ring * 1.6 + ringW * 0.35,
                    ring * 1.1 + ringW * 0.2);
    } else {
        col = starfield(dirOut, uTime);
        col += vec3(ring * 2.2 + ringW * 0.5,
                    ring * 1.6 + ringW * 0.35,
                    ring * 1.1 + ringW * 0.2);
    }

    col *= uExposure;

    /* debug views */
    if (uDebug == 1) {
        /* lensing strength: near-capture = hot */
        col = vec3(0.0, 0.0, 0.15) + vec3(1.0, 0.4, 0.0) * exp(-pow(db / (0.4 * rsEff), 2.0));
        if (captured) col = vec3(1.0, 0.0, 0.0);
    } else if (uDebug == 2) {
        /* step count */
        float sF = float(steps) / float(max(uStepsMax, 1));
        col = vec3(sF * 0.6, sF, 0.25);
        if (captured) col = vec3(1.0, 0.1, 0.1);
    } else if (uDebug == 3) {
        /* disk-hit mask */
        col = hitDisk ? vec3(1.0, 0.65, 0.1) : vec3(0.06, 0.07, 0.1);
        if (captured) col = vec3(0.8, 0.1, 0.1);
    } else if (uDebug == 4) {
        /* capture region */
        col = captured ? vec3(1.0, 1.0, 0.8) : vec3(0.05, 0.05, 0.08);
    }

    gl_FragColor = vec4(col, 1.0);
}
`;

const POST_VERT = /* glsl */`
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const POST_FRAG = /* glsl */`
precision highp float;

varying vec2 vUv;

uniform sampler2D uScene;
uniform vec2  uTexel;
uniform float uBloomStrength;
uniform float uBloomThreshold;
uniform float uVignette;
uniform float uGamma;

void main() {
    vec3 col = texture2D(uScene, vUv).rgb;

    /* cheap multi-tap bloom: add glowing neighbours above a threshold */
    vec3 bright = max(col - uBloomThreshold, vec3(0.0));
    vec3 bloom = vec3(0.0);
    float wTotal = 0.0;
    float radius = 1.0;
    for (int ring = 1; ring <= 3; ring++) {
        float r = float(ring);
        vec2 off = uTexel * 1.4 * r * r;
        vec3 acc = vec3(0.0);
        acc += texture2D(uScene, vUv + vec2(off.x, 0.0)).rgb;
        acc += texture2D(uScene, vUv - vec2(off.x, 0.0)).rgb;
        acc += texture2D(uScene, vUv + vec2(0.0, off.y)).rgb;
        acc += texture2D(uScene, vUv - vec2(0.0, off.y)).rgb;
        acc += texture2D(uScene, vUv + off).rgb;
        acc += texture2D(uScene, vUv - off).rgb;
        acc += texture2D(uScene, vUv + vec2(off.x, -off.y)).rgb;
        acc += texture2D(uScene, vUv + vec2(-off.x, off.y)).rgb;
        float w = 0.12 / (1.0 + r * 0.45);
        bloom += max(acc - uBloomThreshold, vec3(0.0)) * w;
        wTotal += w;
    }
    if (wTotal > 0.0) bloom /= wTotal;

    col = col + bloom * uBloomStrength;

    /* filmic-ish tone map */
    col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);

    /* gamma */
    col = pow(max(col, vec3(0.0)), vec3(1.0 / max(uGamma, 1e-3)));

    /* vignette */
    vec2 ndc = vUv * 2.0 - 1.0;
    float vig = clamp(1.0 - uVignette * dot(ndc, ndc), 0.0, 1.0);
    col *= vig;

    /* subtle cleanup: clamp negatives / NaN */
    col = max(col, vec3(0.0));

    gl_FragColor = vec4(col, 1.0);
}
`;

/* ------------------------------------------------------------------ */
/* App                                                                 */
/* ------------------------------------------------------------------ */

const canvas = document.getElementById('gl');
const loading = document.getElementById('loading');

const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
    stencil: false,
    depth: false,
    preserveDrawingBuffer: true,
});
// Manual tone/color handling inside shaders


const maxDPR = 1.7;

/* ---------- render targets & scenes ---------- */

const rt = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
});

function makeQuadScene(fragmentShader, uniforms) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array([-1, -1, 3, -1, -1, 3]);   /* big triangle */
    const uv = new Float32Array([0, 0, 2, 0, 0, 2]);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 2));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);
    const mat = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader,
        uniforms,
        depthWrite: false,
        depthTest: false,
    });
    mat.extensions.derivatives = false;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    const scene = new THREE.Scene();
    scene.add(mesh);
    return { scene, mat };
}

const simUniforms = {
    uCamPos: { value: new THREE.Vector3() },
    uCamForward: { value: new THREE.Vector3() },
    uCamRight: { value: new THREE.Vector3() },
    uCamUp: { value: new THREE.Vector3() },
    uTanHalfV: { value: 0.5 },
    uTanHalfH: { value: 0.5 },
    uTime: { value: 0 },
    uLens: { value: 1.0 },
    uRs: { value: 1.0 },
    uDiskInner: { value: 3.0 },
    uDiskOuter: { value: 9.0 },
    uDiskBright: { value: 1.0 },
    uTempBias: { value: 1.0 },
    uRotSpeed: { value: 1.0 },
    uExposure: { value: 1.05 },
    uDoppler: { value: 1 },
    uRingStrength: { value: 1.0 },
    uStepsMax: { value: 55 },
    uDebug: { value: 0 },
};

const postUniforms = {
    uScene: { value: rt.texture },
    uTexel: { value: new THREE.Vector2(1, 1) },
    uBloomStrength: { value: 0.8 },
    uBloomThreshold: { value: 0.55 },
    uVignette: { value: 0.4 },
    uGamma: { value: 2.2 },
};

const sim = makeQuadScene(FRAG, simUniforms);
const post = makeQuadScene(POST_FRAG, postUniforms);

/* three needs an "a camera" for render() even for fullscreen quads */
const dummyCam = new THREE.Camera();

/* ------------------------------------------------------------------ */
/* State & parameters                                                  */
/* ------------------------------------------------------------------ */

const QUALITIES = {
    low:     { steps: 28, scale: 0.55, stars: 2 },
    medium:  { steps: 60, scale: 0.80, stars: 3 },
    high:    { steps: 96, scale: 1.00, stars: 4 },
};
let quality = 'medium';

const P = {
    lens: 1.0,
    inner: 3.0,
    outer: 9.0,
    bright: 1.0,
    temp: 1.0,
    rot: 1.0,
    exposure: 1.05,
    doppler: true,
    bloom: 0.8,
    vignette: 0.4,
};

const CAM = {
    yaw: -0.55,
    pitch: 0.48,
    dist: 26.0,
    tyaw: -0.55,
    tpitch: 0.48,
    tdist: 26.0,
};

let paused = false;
let debugMode = 0;
let time = 0.0;
let last = performance.now();

const UI = {};
function bindUI() {
    UI.sLens = document.getElementById('sLens');
    UI.sInner = document.getElementById('sInner');
    UI.sOuter = document.getElementById('sOuter');
    UI.sBright = document.getElementById('sBright');
    UI.sTemp = document.getElementById('sTemp');
    UI.sRot = document.getElementById('sRot');
    UI.sExposure = document.getElementById('sExposure');
    UI.cDoppler = document.getElementById('cDoppler');
    UI.vLens = document.getElementById('vLens');
    UI.vInner = document.getElementById('vInner');
    UI.vOuter = document.getElementById('vOuter');
    UI.vBright = document.getElementById('vBright');
    UI.vTemp = document.getElementById('vTemp');
    UI.vRot = document.getElementById('vRot');
    UI.vExposure = document.getElementById('vExposure');

    UI.fps = document.getElementById('fps');
    UI.camDist = document.getElementById('camDist');
    UI.qualityLabel = document.getElementById('qualityLabel');
    UI.pauseLabel = document.getElementById('pauseLabel');
    UI.debugLabel = document.getElementById('debugLabel');
    UI.btnReset = document.getElementById('btnReset');
    UI.btnHidePanel = document.getElementById('btnHidePanel');
    UI.panel = document.getElementById('panel');

    const mapV = (el, target, digits) => () => {
        target.value = parseFloat(el.value);
        document.getElementById('v' + targetKey(el)).textContent =
            parseFloat(el.value).toFixed(digits);
        syncUniforms();
    };
    const targetKey = (el) => ({
        sLens: 'Lens', sInner: 'Inner', sOuter: 'Outer', sBright: 'Bright',
        sTemp: 'Temp', sRot: 'Rot', sExposure: 'Exposure',
    }[el.id]);

    UI.sLens.addEventListener('input', mapV(UI.sLens, P_forward('lens'), 2));
    UI.sInner.addEventListener('input', mapV(UI.sInner, P_forward('inner'), 1));
    UI.sOuter.addEventListener('input', mapV(UI.sOuter, P_forward('outer'), 1));
    UI.sBright.addEventListener('input', mapV(UI.sBright, P_forward('bright'), 2));
    UI.sTemp.addEventListener('input', mapV(UI.sTemp, P_forward('temp'), 2));
    UI.sRot.addEventListener('input', mapV(UI.sRot, P_forward('rot'), 2));
    UI.sExposure.addEventListener('input', mapV(UI.sExposure, P_forward('exposure'), 2));
    UI.cDoppler.addEventListener('change', () => {
        P.doppler = UI.cDoppler.checked;
        syncUniforms();
    });

    UI.btnReset.addEventListener('click', resetParams);
    UI.btnHidePanel.addEventListener('click', () => UI.panel.classList.toggle('hiddenPanel'));

    /* presets */
    document.querySelectorAll('.preset').forEach((btn) => {
        btn.addEventListener('click', () => {
            applyPreset(btn.dataset.preset);
            document.querySelectorAll('.preset').forEach((b) => b.classList.toggle('active', b === btn));
        });
    });
    /* quality */
    document.querySelectorAll('.qmode').forEach((btn) => {
        btn.addEventListener('click', () => {
            setQuality(btn.dataset.q);
            document.querySelectorAll('.qmode').forEach((b) => b.classList.toggle('active', b === btn));
        });
    });
}
function P_forward(key) {
    return { get value() { return P[key]; }, set value(v) { P[key] = v; } };
}

function setParams(p) {
    for (const k in p) if (k in P) P[k] = p[k];
    UI.sLens.value = P.lens;
    UI.sInner.value = P.inner;
    UI.sOuter.value = P.outer;
    UI.sBright.value = P.bright;
    UI.sTemp.value = P.temp;
    UI.sRot.value = P.rot;
    UI.sExposure.value = P.exposure;
    UI.cDoppler.checked = P.doppler;
    UI.vLens.textContent = P.lens.toFixed(2);
    UI.vInner.textContent = P.inner.toFixed(1);
    UI.vOuter.textContent = P.outer.toFixed(1);
    UI.vBright.textContent = P.bright.toFixed(2);
    UI.vTemp.textContent = P.temp.toFixed(2);
    UI.vRot.textContent = P.rot.toFixed(2);
    UI.vExposure.textContent = P.exposure.toFixed(2);
    syncUniforms();
}

function resetParams() {
    setParams({ lens: 1.0, inner: 3.0, outer: 9.0, bright: 1.0, temp: 1.0, rot: 1.0, exposure: 1.05, doppler: true });
}

const PRESETS = {
    cinematic: {
        lens: 1.05, inner: 3.0, outer: 9.5, bright: 1.55, temp: 1.05,
        rot: 1.15, exposure: 1.45, doppler: true, bloom: 1.4, vignette: 0.42,
    },
    scientific: {
        lens: 1.0, inner: 3.0, outer: 9.0, bright: 1.0, temp: 1.0,
        rot: 1.0, exposure: 1.2, doppler: true, bloom: 0.55, vignette: 0.22,
    },
    extreme: {
        lens: 1.65, inner: 2.4, outer: 8.5, bright: 1.3, temp: 1.0,
        rot: 1.3, exposure: 1.45, doppler: true, bloom: 1.1, vignette: 0.38,
    },
};
function applyPreset(name) {
    const p = PRESETS[name];
    setParams(p);
}

function setQuality(q) {
    quality = q;
    const cfg = QUALITIES[q];
    simUniforms.uStepsMax.value = cfg.steps;
    UI.qualityLabel.textContent = q.charAt(0).toUpperCase() + q.slice(1);
    resize();
}

/* ------------------------------------------------------------------ */
/* Lensing model uniforms                                             */
/* ------------------------------------------------------------------ */

function syncUniforms() {
    simUniforms.uLens.value = P.lens;
    simUniforms.uDiskInner.value = P.inner;
    simUniforms.uDiskOuter.value = P.outer;
    simUniforms.uDiskBright.value = P.bright;
    simUniforms.uTempBias.value = P.temp;
    simUniforms.uRotSpeed.value = P.rot;
    simUniforms.uExposure.value = P.exposure;
    simUniforms.uDoppler.value = P.doppler ? 1 : 0;
    simUniforms.uDebug.value = debugMode;
}

function updateRose() {
    const dpr = Math.min(window.devicePixelRatio || 1, maxDPR);
    const cfg = QUALITIES[quality];
    const w = Math.max(64, Math.round(innerWidth * dpr * cfg.scale));
    const h = Math.max(64, Math.round(innerHeight * dpr * cfg.scale));
    if (w !== rt.width || h !== rt.height) {
        rt.setSize(w, h);
        postUniforms.uTexel.value.set(1 / w, 1 / h);
    }
    const fovV = 55; /* degrees — vertical FOV of the virtual camera */
    simUniforms.uTanHalfV.value = Math.tan((fovV * Math.PI / 180) * 0.5);
    simUniforms.uTanHalfH.value = simUniforms.uTanHalfV.value * (innerWidth / innerHeight);
}

function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    updateRose();
}

/* ------------------------------------------------------------------ */
/* Camera orbit                                                       */
/* ------------------------------------------------------------------ */

function clampCamera() {
    const minD = Math.max(2.5, P.inner * 0.75);
    CAM.dist = Math.min(90, Math.max(minD, CAM.dist));
    CAM.tdist = Math.min(90, Math.max(minD, CAM.tdist));
    CAM.pitch = Math.min(1.45, Math.max(-1.45, CAM.pitch));
    CAM.tpitch = Math.min(1.45, Math.max(-1.45, CAM.tpitch));
}

function updateCameraSmooth(alpha) {
    CAM.yaw += (CAM.tyaw - CAM.yaw) * alpha;
    CAM.pitch += (CAM.tpitch - CAM.pitch) * alpha;
    CAM.dist += (CAM.tdist - CAM.dist) * alpha;
    clampCamera();
    const cp = Math.cos(CAM.pitch);
    const sp = Math.sin(CAM.pitch);
    const cy = Math.cos(CAM.yaw);
    const sy = Math.sin(CAM.yaw);
    const pos = new THREE.Vector3(CAM.dist * cp * cy, CAM.dist * sp, CAM.dist * cp * sy);
    const fwd = pos.clone().negate().normalize();
    const worldUp = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(fwd, worldUp).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
    simUniforms.uCamPos.value.copy(pos);
    simUniforms.uCamForward.value.copy(fwd);
    simUniforms.uCamRight.value.copy(right);
    simUniforms.uCamUp.value.copy(up);
}

/* interactions */
let dragging = false;
let lastX = 0, lastY = 0;
canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
});
window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    CAM.tyaw -= dx * 0.005;
    CAM.tpitch += dy * 0.005;
    clampCamera();
});
window.addEventListener('pointerup', () => { dragging = false; });
canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    CAM.tdist *= (e.deltaY > 0) ? 1.09 : 0.92;
    clampCamera();
}, { passive: false });

window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyR') { CAM.tyaw = -0.55; CAM.tpitch = 0.48; CAM.tdist = 26.0; }
    if (e.code === 'Space') {
        e.preventDefault();
        paused = !paused;
        UI.pauseLabel.textContent = paused ? 'PAUSED' : '';
    }
    if (e.code === 'KeyH') document.getElementById('hud').classList.toggle('hidden');
    if (e.code === 'KeyP') UI.panel.classList.toggle('hiddenPanel');
    if (e.code === 'KeyD') {
        debugMode = (debugMode + 1) % 5;
        syncUniforms();
        const names = ['', 'lens heat', 'steps', 'disk mask', 'capture'];
        UI.debugLabel.textContent = debugMode ? 'DEBUG: ' + names[debugMode] : '';
    }
});
window.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
        const t = e.touches[0];
        dragging = true; lastX = t.clientX; lastY = t.clientY;
    }
}, { passive: true });
window.addEventListener('touchmove', (e) => {
    if (dragging && e.touches.length === 1) {
        const t = e.touches[0];
        CAM.tyaw -= (t.clientX - lastX) * 0.005;
        CAM.tpitch += (t.clientY - lastY) * 0.005;
        lastX = t.clientX; lastY = t.clientY;
        clampCamera();
    }
}, { passive: true });
window.addEventListener('touchend', () => { dragging = false; });

/* ------------------------------------------------------------------ */
/* Main loop                                                           */
/* ------------------------------------------------------------------ */

let frameCount = 0;
let fpsTimer = 0;
let fpsVal = 0;

function renderFrame(now) {
    requestAnimationFrame(renderFrame);
    const dt = Math.min((now - last) / 1000, 0.25);
    last = now;

    if (!paused) time += dt;
    simUniforms.uTime.value = time;

    updateCameraSmooth(Math.min(1, dt * 9));

    postUniforms.uBloomStrength.value = P.bloom;
    postUniforms.uVignette.value = P.vignette;

    renderer.setRenderTarget(rt);
    renderer.render(sim.scene, dummyCam);
    renderer.setRenderTarget(null);
    renderer.render(post.scene, dummyCam);

    /* FPS + HUD */
    frameCount++;
    fpsTimer += dt;
    if (fpsTimer >= 0.5) {
        fpsVal = frameCount / fpsTimer;
        frameCount = 0;
        fpsTimer = 0;
        UI.fps.textContent = 'FPS: ' + fpsVal.toFixed(0);
        UI.camDist.textContent = 'D: ' + CAM.dist.toFixed(1) + ' Rs';
    }
}

/* boot */
window.addEventListener('resize', resize);
resize();
bindUI();
setQuality('medium');
applyPreset('cinematic');
updateRose();
syncUniforms();

loading.classList.add('hidden');
requestAnimationFrame(renderFrame);

/* surface GLSL/js errors for easy debugging */
window.addEventListener('error', (e) => {
    console.error(e);
    loading.classList.remove('hidden');
    loading.textContent = 'Error: ' + (e.message || e);
});