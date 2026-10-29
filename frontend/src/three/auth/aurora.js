import * as THREE from 'three'

/**
 * 极光。
 *
 * 之前的做法是一圈很粗的圆柱内壁 —— 在透视下它的边界会变成一条条直边，
 * 越过山脊只剩几个尖角，看起来像贴了绿纸。这里改成一组「幕帘」：
 * 每片都是一张空间里立着的平面，围绕相机摆成扇形，
 * 下缘被噪声撕开、上缘淡出、左右两端淡出，
 * 叠上 additive 混合后才读成天上的光，而不是几何体。
 *
 * 关键是位置：相机接近水平，40° 视场里天空只有山脊以上那一带，
 * 所以幕帘的下缘要压在山脊后面一点，主体落进那一段天空里。
 */
const VERT = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAG = /* glsl */ `
uniform float uTime;
uniform float uPhase;
uniform float uIntensity;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
varying vec2 vUv;

float hash(float n) {
  return fract(sin(n * 127.1) * 43758.5453);
}

float noise(float x) {
  float i = floor(x);
  float f = fract(x);
  float u = f * f * (3.0 - 2.0 * f);
  return mix(hash(i), hash(i + 1.0), u);
}

float fbm(float x) {
  return noise(x) * 0.56 + noise(x * 2.13 + 11.0) * 0.28 + noise(x * 4.37 + 23.0) * 0.16;
}

void main() {
  float x = vUv.x;
  float y = vUv.y;
  float t = uTime;
  float drift = x * 5.0 + uPhase + t * 0.045;

  // 竖着的丝缕：极光的真实质感来自这些被垂直拉长的细纹
  float fibers = fbm(drift * 4.2) * 0.55 + fbm(drift * 11.0 + 5.0) * 0.45;
  fibers = pow(fibers, 2.4);

  // 主光带：几条更宽、更亮的部分
  float band = smoothstep(0.38, 0.9, fbm(drift * 1.15 + 3.0));

  // 下缘：被噪声撕开的一道参差边。
  // 振幅小的时候整条下缘是一条直线，一眼就是「贴上去的光带」
  float foot = 0.04 + fbm(drift * 0.85 + 8.0) * 0.3 + fbm(drift * 3.6) * 0.08;
  float rise = smoothstep(foot, foot + 0.14, y);
  // 上缘：从很低的地方就开始淡出，一直淡到顶 —— 幕帘的亮部在下面
  float top = smoothstep(1.0, 0.3, y);
  float vert = rise * top;

  // 左右两端淡出，否则会看到平面的直边
  float edge = smoothstep(0.0, 0.24, x) * smoothstep(1.0, 0.76, x);

  vec3 col = mix(uColorA, uColorB, smoothstep(foot + 0.04, 0.6, y));
  col = mix(col, uColorC, smoothstep(0.4, 1.0, y) * 0.5);

  float a = (band * 0.9 + fibers * 0.6) * vert * edge * uIntensity;
  // 带芯更亮：一条极光最亮的地方是它垂下来的中轴
  a += pow(band, 3.0) * vert * edge * uIntensity * 0.55;
  a *= 0.9;

  gl_FragColor = vec4(col * (0.9 + 0.8 * a), a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

// 顶点色/颜色按主题注入，这四片的差异只在位置、宽度与强度
const SPECS = [
  { radius: 600, angle: -0.34, width: 620, height: 260, y: 168, phase: 0.0, intensity: 1.35 },
  { radius: 640, angle: 0.36, width: 700, height: 290, y: 180, phase: 2.4, intensity: 1.1 },
  { radius: 720, angle: -0.92, width: 640, height: 240, y: 156, phase: 4.1, intensity: 0.85 },
  { radius: 780, angle: 0.94, width: 760, height: 320, y: 196, phase: 1.3, intensity: 0.7 },
]

export function buildAurora() {
  const root = new THREE.Group()
  const layers = []
  const uniforms = []

  SPECS.forEach((spec) => {
    const geometry = new THREE.PlaneGeometry(spec.width, spec.height, 1, 1)

    const uniform = {
      uTime: { value: 0 },
      uPhase: { value: spec.phase },
      uIntensity: { value: spec.intensity },
      uColorA: { value: new THREE.Color(0x2ee7b6) },
      uColorB: { value: new THREE.Color(0x2f6dff) },
      uColorC: { value: new THREE.Color(0x9ffbe4) },
    }

    const material = new THREE.ShaderMaterial({
      uniforms: uniform,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      // 光叠加，不遮挡后面的星星
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      // 极光在 600m 外，不能被地面的雾吃掉
      fog: false,
    })

    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(
      Math.sin(spec.angle) * spec.radius,
      spec.y,
      -Math.cos(spec.angle) * spec.radius,
    )
    // 只转 Y：幕帘必须竖直立着，不能朝相机低头
    mesh.rotation.y = -spec.angle
    mesh.frustumCulled = false
    mesh.renderOrder = -2

    root.add(mesh)
    layers.push(mesh)
    uniforms.push(uniform)
  })

  return {
    root,
    layers,
    uniforms,
    update(time) {
      uniforms.forEach((uniform) => {
        uniform.uTime.value = time
      })
    },
  }
}
