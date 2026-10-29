import * as THREE from 'three'
import { PALETTE } from './config'

/**
 * 天空：反面球体 + 一段四色渐变。
 *
 * 用 ShaderMaterial 而不是 CanvasTexture，是为了让主题切换时可以整段插值颜色 ——
 * 山路是近黑天际，雪地要抬成冷白微光的雪原反照，森林是压暗的青灰。
 * 只有四段颜色（顶 / 上 / 地平线 / 底），越靠地平线越亮，白色路面才有被照亮的依据。
 */
export function buildSky(radius = 900) {
  const uniforms = {
    cTop: { value: new THREE.Color(PALETTE.skyTop) },
    cMid: { value: new THREE.Color(PALETTE.skyMid) },
    cHorizon: { value: new THREE.Color(PALETTE.skyHorizon) },
    cBottom: { value: new THREE.Color(PALETTE.skyBottom) },
  }

  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 cTop;
      uniform vec3 cMid;
      uniform vec3 cHorizon;
      uniform vec3 cBottom;
      varying vec2 vUv;
      void main() {
        float h = vUv.y;
        vec3 color = mix(cBottom, cHorizon, smoothstep(0.0, 0.46, h));
        color = mix(color, cMid, smoothstep(0.46, 0.52, h));
        color = mix(color, cTop, smoothstep(0.54, 0.92, h));
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  })

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 20), material)
  mesh.renderOrder = -1
  mesh.userData.uniforms = uniforms
  return mesh
}
