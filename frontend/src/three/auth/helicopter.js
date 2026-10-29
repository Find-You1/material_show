import * as THREE from 'three'

import { glowTexture } from './sky'

/**
 * 一架程序化直升机。
 *
 * 机身是「超椭圆截面沿机身长度放样」出来的，不是一个球接一根棍；
 * 主旋翼带半透明桨盘、尾桨带自己的小桨盘，才不会在高频旋转下闪成一根棍。
 * 机头有一束向下前方的探照灯，雪地上留一团光斑 —— 这束光才是
 * 「直升机停在雪谷里」最有说服力的东西。
 */

const RADIAL = 20

function loft(sections, radial = RADIAL) {
  const positions = []
  const indices = []
  const power = 2.5

  for (const section of sections) {
    for (let i = 0; i < radial; i += 1) {
      const a = (i / radial) * Math.PI * 2
      const cx = Math.cos(a)
      const cy = Math.sin(a)
      const sx = Math.sign(cx) * Math.pow(Math.abs(cx), 2 / power) * section.w
      const sy = Math.sign(cy) * Math.pow(Math.abs(cy), 2 / power) * section.h
      positions.push(sx, section.y + sy, section.z)
    }
  }

  for (let s = 0; s < sections.length - 1; s += 1) {
    for (let i = 0; i < radial; i += 1) {
      const a = s * radial + i
      const b = s * radial + ((i + 1) % radial)
      const c = (s + 1) * radial + i
      const d = (s + 1) * radial + ((i + 1) % radial)
      // 这个绕序法线朝外（反过来整架飞机会变成「内壁」）
      indices.push(a, b, c, b, d, c)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function buildNavLight(color, size) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture([
        [0, 'rgba(255,255,255,1)'],
        [0.32, 'rgba(255,255,255,0.6)'],
        [1, 'rgba(255,255,255,0)'],
      ]),
      color,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    }),
  )
  sprite.scale.setScalar(size)
  return sprite
}

export function buildHelicopter() {
  const group = new THREE.Group()

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x26303d,
    metalness: 0.72,
    roughness: 0.3,
    envMapIntensity: 1.1,
  })
  const darkMaterial = new THREE.MeshStandardMaterial({
    color: 0x11161d,
    metalness: 0.5,
    roughness: 0.42,
    envMapIntensity: 0.8,
  })
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0x050a12,
    metalness: 0.35,
    roughness: 0.12,
    envMapIntensity: 2.2,
  })

  // 机身：从尾梁接头一路放大到座舱，再收成机头
  const fuselage = new THREE.Mesh(
    loft([
      { z: -3.5, w: 0.22, h: 0.24, y: 0.64 },
      { z: -3.0, w: 0.34, h: 0.36, y: 0.62 },
      { z: -2.2, w: 0.46, h: 0.5, y: 0.56 },
      { z: -1.4, w: 0.78, h: 0.76, y: 0.46 },
      { z: -0.5, w: 1.02, h: 0.94, y: 0.34 },
      { z: 0.5, w: 1.08, h: 0.98, y: 0.28 },
      { z: 1.4, w: 0.98, h: 0.9, y: 0.26 },
      { z: 2.2, w: 0.76, h: 0.72, y: 0.2 },
      { z: 2.9, w: 0.42, h: 0.42, y: 0.14 },
      { z: 3.12, w: 0.13, h: 0.15, y: 0.1 },
    ]),
    bodyMaterial,
  )
  group.add(fuselage)

  // 座舱玻璃：一颗压扁的球扣在机身前段，读成气泡舱盖
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 26, 18), glassMaterial)
  canopy.scale.set(0.82, 0.6, 1.2)
  canopy.position.set(0, 0.52, 1.95)
  group.add(canopy)

  // 尾梁
  const boomGeometry = new THREE.CylinderGeometry(0.34, 0.16, 2.8, 12)
  boomGeometry.rotateX(Math.PI / 2)
  const boom = new THREE.Mesh(boomGeometry, bodyMaterial)
  boom.position.set(0, 0.62, -4.85)
  group.add(boom)

  // 垂尾 + 平尾
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.3, 0.72), bodyMaterial)
  fin.position.set(0, 1.28, -6.02)
  fin.rotation.x = -0.2
  group.add(fin)

  const stabilizer = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.09, 0.46), bodyMaterial)
  stabilizer.position.set(0, 0.74, -5.5)
  group.add(stabilizer)

  // 主旋翼
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 0.5, 12), darkMaterial)
  mast.position.set(0, 1.66, 0)
  group.add(mast)

  const rotor = new THREE.Group()
  rotor.position.set(0, 1.94, 0)
  group.add(rotor)

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.16, 16), darkMaterial)
  rotor.add(hub)

  const bladeGeometry = new THREE.BoxGeometry(0.28, 0.045, 4.2)
  bladeGeometry.translate(0, 0, 2.2)
  for (let i = 0; i < 5; i += 1) {
    const blade = new THREE.Mesh(bladeGeometry, darkMaterial)
    blade.rotation.y = (i / 5) * Math.PI * 2
    rotor.add(blade)
  }

  // 桨盘：半透明圆盘，把高速旋转的桨叶糊成一层「转起来了」的薄雾
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(4.35, 56),
    new THREE.MeshBasicMaterial({
      map: glowTexture([
        [0, 'rgba(190,214,244,0.5)'],
        [0.35, 'rgba(160,188,222,0.24)'],
        [0.82, 'rgba(140,170,210,0.08)'],
        [1, 'rgba(130,160,200,0)'],
      ]),
      transparent: true,
      opacity: 0.24,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      fog: false,
    }),
  )
  disc.rotation.x = -Math.PI / 2
  rotor.add(disc)

  // 尾桨（绕 X 轴转，桨叶在 YZ 平面里）
  const tailRotor = new THREE.Group()
  tailRotor.position.set(0.26, 1.0, -6.12)
  group.add(tailRotor)

  const tailBladeGeometry = new THREE.BoxGeometry(0.05, 1.5, 0.13)
  tailBladeGeometry.translate(0, 0.78, 0)
  for (let i = 0; i < 2; i += 1) {
    const blade = new THREE.Mesh(tailBladeGeometry, darkMaterial)
    blade.rotation.x = i * Math.PI
    tailRotor.add(blade)
  }

  const tailDisc = new THREE.Mesh(
    new THREE.CircleGeometry(0.86, 28),
    new THREE.MeshBasicMaterial({
      map: glowTexture([
        [0, 'rgba(180,205,235,0.5)'],
        [0.6, 'rgba(150,180,220,0.14)'],
        [1, 'rgba(140,170,210,0)'],
      ]),
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      fog: false,
    }),
  )
  tailDisc.rotation.y = Math.PI / 2
  tailRotor.add(tailDisc)

  // 起落架
  const skidGeometry = new THREE.CylinderGeometry(0.07, 0.07, 3.5, 10)
  skidGeometry.rotateX(Math.PI / 2)
  for (const side of [-1, 1]) {
    const skid = new THREE.Mesh(skidGeometry, darkMaterial)
    skid.position.set(side * 0.84, -1.0, 0.2)
    group.add(skid)

    for (const z of [-0.85, 0.95]) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.05, 8), darkMaterial)
      strut.position.set(side * 0.62, -0.52, z)
      strut.rotation.z = side * 0.42
      group.add(strut)
    }
  }

  // 航行灯：左红右绿，机尾一枚慢闪的白色防撞灯。
  // 尺寸压小一点：大光晕在机头读起来像座舱里着了一把火
  const navRed = buildNavLight(0xff3b30, 1.0)
  navRed.position.set(-0.92, 0.6, 0.95)
  const navGreen = buildNavLight(0x34d058, 1.0)
  navGreen.position.set(0.92, 0.6, 0.95)
  const strobe = buildNavLight(0xffffff, 1.2)
  strobe.position.set(0, 1.95, -6.0)
  group.add(navRed, navGreen, strobe)

  // 探照灯：机头一盏白灯 + 一束向下的锥形光
  const lamp = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture([
        [0, 'rgba(255,255,255,1)'],
        [0.3, 'rgba(226,240,255,0.6)'],
        [1, 'rgba(210,230,255,0)'],
      ]),
      color: new THREE.Color().setRGB(1.15, 1.2, 1.35),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    }),
  )
  lamp.scale.setScalar(1.02)
  lamp.position.set(0, 0.34, 3.18)
  group.add(lamp)

  const beamGeometry = new THREE.ConeGeometry(3.6, 17, 30, 1, true)
  beamGeometry.translate(0, -8.5, 0)
  const beamMaterial = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    uniforms: {
      uColor: { value: new THREE.Color(0xcfe3ff) },
      uOpacity: { value: 0.17 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform vec3 uColor;
      uniform float uOpacity;
      void main() {
        // 靠近灯口最亮，越远越淡；pow 让衰减像真的光束而不是一块玻璃锥
        float a = pow(vUv.y, 1.9) * uOpacity;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  })

  const beam = new THREE.Mesh(beamGeometry, beamMaterial)
  beam.position.set(0, 0.36, 3.16)
  // 光锥默认朝 -Y，先转到「前下方」（绕 X 轴负向才是 +Z 侧）
  const beamDirection = new THREE.Vector3(0, -1, 0)
    .applyQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.42))
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), beamDirection)

  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(1, 40),
    new THREE.MeshBasicMaterial({
      map: glowTexture([
        [0, 'rgba(226,240,255,0.95)'],
        [0.4, 'rgba(190,220,255,0.42)'],
        [0.75, 'rgba(150,190,240,0.12)'],
        [1, 'rgba(130,175,235,0)'],
      ]),
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      fog: false,
    }),
  )
  pool.rotation.x = -Math.PI / 2
  pool.scale.setScalar(7)

  // 旋翼下洗：机腹正下方雪面上被吹开的一圈雪尘。
  // 位置/大小由场景按机腹投影逐帧更新，这里只管画一张贴地的环形光
  const wash = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48),
    new THREE.MeshBasicMaterial({
      map: glowTexture([
        [0, 'rgba(232,244,255,0)'],
        [0.5, 'rgba(226,240,255,0)'],
        [0.67, 'rgba(214,234,255,0.46)'],
        [0.86, 'rgba(200,224,255,0.16)'],
        [1, 'rgba(200,224,255,0)'],
      ]),
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      fog: false,
    }),
  )
  wash.rotation.x = -Math.PI / 2
  wash.scale.setScalar(10)

  return {
    group,
    rotor,
    tailRotor,
    disc,
    beam,
    pool,
    wash,
    navRed,
    navGreen,
    strobe,
    // 光束在机体局部坐标里的方向（用于算水面/雪地光斑落点）
    beamLocal: beamDirection.clone().normalize(),
    materials: [bodyMaterial, darkMaterial, glassMaterial],
  }
}
