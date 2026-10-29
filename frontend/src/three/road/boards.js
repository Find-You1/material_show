import * as THREE from 'three'
import { BOARD, PALETTE } from './config'
import { frameAt } from './path'

const BOX_ASPECT = BOARD.width / BOARD.height

// 照片按 cover 方式填进画框，避免拉伸变形
function fitCover(texture) {
  const image = texture.image
  if (!image || !image.width || !image.height) return
  const imageAspect = image.width / image.height
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  if (imageAspect > BOX_ASPECT) {
    const scale = BOX_ASPECT / imageAspect
    texture.repeat.set(scale, 1)
    texture.offset.set((1 - scale) / 2, 0)
  } else {
    const scale = imageAspect / BOX_ASPECT
    texture.repeat.set(1, scale)
    texture.offset.set(0, (1 - scale) / 2)
  }
  texture.needsUpdate = true
}

/**
 * 沿公路外侧摆一圈照片画框。
 *
 * 只放右侧：左侧留给首屏文案，画面里左三分之一保持干净的暗地面与护栏，
 * 照片像一条胶片从右下一直排到右上灭点。相邻两块在横向距离与高度上
 * 略微错开，避免排成一堵等高的墙。
 */
export function buildBoards({ curve, length, items, loader, anisotropy = 1 }) {
  const root = new THREE.Group()
  const boards = []
  if (!items.length) return { root, boards }

  const count = Math.max(items.length, Math.round(length / BOARD.spacing))
  const textures = new Map()
  const materials = new Map()

  const frameGeometry = new THREE.BoxGeometry(BOARD.width + 0.14, BOARD.height + 0.14, 0.08)
  const planeGeometry = new THREE.PlaneGeometry(BOARD.width, BOARD.height)
  const postGeometry = new THREE.BoxGeometry(0.08, 1, 0.08)

  const frameMaterial = new THREE.MeshStandardMaterial({
    color: PALETTE.frame,
    roughness: 0.42,
    metalness: 0.12,
    emissive: 0xffffff,
    emissiveIntensity: 0,
  })
  const postMaterialTemplate = new THREE.MeshStandardMaterial({
    color: PALETTE.rim,
    roughness: 0.4,
    metalness: 0.35,
  })

  function materialFor(item) {
    const key = item.id
    if (materials.has(key)) return materials.get(key)

    let texture = textures.get(key)
    if (!texture) {
      texture = loader.load(item.image, (loaded) => fitCover(loaded))
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = anisotropy
      textures.set(key, texture)
    }

    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.9,
      metalness: 0,
      emissive: 0xffffff,
      emissiveMap: texture,
      emissiveIntensity: 0.12,
    })
    materials.set(key, material)
    return material
  }

  for (let i = 0; i < count; i += 1) {
    const item = items[i % items.length]
    const frame = frameAt(curve, i / count)

    // 只挂在右侧路肩，横向与高度小幅错开
    const lateral = BOARD.lateral + (i % 3) * 0.55
    const centerHeight = BOARD.centerHeight + ((i * 7) % 3) * 0.18 - 0.18

    const base = frame.point.clone().addScaledVector(frame.right, lateral)
    const face = new THREE.Group()
    face.position.copy(base)
    face.position.y += centerHeight

    // 每个画框一份边框材质，悬停时只点亮被指到的那一块
    const borderMaterial = frameMaterial.clone()
    const border = new THREE.Mesh(frameGeometry, borderMaterial)
    face.add(border)

    // 照片必须是不透明的：半透明平面会在白路面上被排序、透出背景，
    // 看上去就是照片一阵阵发虚。剔除交给「完全出画」判定，见 MonochromeRoad。
    const photoMaterial = materialFor(item).clone()

    const plane = new THREE.Mesh(planeGeometry, photoMaterial)
    plane.position.z = 0.06
    plane.userData.item = item
    face.add(plane)

    // 支杆：从画框下沿落到路肩
    const postHeight = Math.max(0.4, centerHeight - BOARD.height / 2)
    const postMaterial = postMaterialTemplate.clone()
    const post = new THREE.Mesh(postGeometry, postMaterial)
    post.scale.y = postHeight
    post.position.y = -centerHeight + postHeight / 2
    face.add(post)

    root.add(face)
    boards.push({
      face,
      plane,
      item,
      index: i,
      border,
      borderMaterial,
      photoMaterial,
      postMaterial,
      width: BOARD.width,
      height: BOARD.height,
    })
  }

  return {
    root,
    boards,
    textures,
    materials,
    borderMaterials: boards.map((board) => board.borderMaterial),
    photoMaterials: boards.map((board) => board.photoMaterial),
    postMaterials: boards.map((board) => board.postMaterial),
    geometries: [frameGeometry, planeGeometry, postGeometry],
    frameMaterial,
    postMaterial: postMaterialTemplate,
  }
}
