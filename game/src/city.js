import * as THREE from 'three'
import { makeRng } from './utils.js'

export const CITY = {
  half: 150,
  streets: [-120, -60, 0, 60, 120],
  block: 60,
  roadHalf: 6
}

export function onRoad(x, z) {
  const streets = CITY.streets
  let minDx = Infinity
  let minDz = Infinity
  for (let s of streets) {
    const dx = Math.abs(x - s)
    const dz = Math.abs(z - s)
    if (dx < minDx) minDx = dx
    if (dz < minDz) minDz = dz
  }
  return minDx <= 8 || minDz <= 8
}

function createWindowTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#1b1b22'
  ctx.fillRect(0, 0, 64, 64)

  const cols = 4
  const rows = 8
  const cw = 64 / cols
  const ch = 64 / rows

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // ~1 in 3 lit yellow
      const lit = (r * 3 + c * 7) % 3 === 0
      ctx.fillStyle = lit ? '#ffe57f' : '#2b2b36'
      ctx.fillRect(c * cw + 2, r * ch + 2, cw - 4, ch - 4)
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(2, 4)
  return tex
}

// Procedurally generates the Solmar Bay v2 city layout, colliders, and landmarks
export function buildCity(scene, seed) {
  const rng = makeRng(seed)
  const colliders = []
  const streets = CITY.streets
  const half = CITY.half

  // Window texture for buildings
  const windowMat = new THREE.MeshLambertMaterial({
    map: createWindowTexture()
  })

  // Ground planes
  // Main city floor
  const cityFloorGeo = new THREE.PlaneGeometry(320, 320)
  const cityFloorMat = new THREE.MeshLambertMaterial({ color: 0x3d3d42 })
  const cityFloor = new THREE.Mesh(cityFloorGeo, cityFloorMat)
  cityFloor.rotation.x = -Math.PI / 2
  cityFloor.position.y = -0.05
  cityFloor.receiveShadow = true
  scene.add(cityFloor)

  // Sand strip along north edge (-196 to -150)
  const sandGeo = new THREE.PlaneGeometry(320, 46)
  const sandMat = new THREE.MeshLambertMaterial({ color: 0xc2b280 })
  const sandMesh = new THREE.Mesh(sandGeo, sandMat)
  sandMesh.rotation.x = -Math.PI / 2
  sandMesh.position.set(0, -0.08, -173)
  sandMesh.receiveShadow = true
  scene.add(sandMesh)

  // Sea plane beyond (-270 to -150)
  const seaGeo = new THREE.PlaneGeometry(320, 120)
  const seaMat = new THREE.MeshLambertMaterial({ color: 0x1e6091 })
  const seaMesh = new THREE.Mesh(seaGeo, seaMat)
  seaMesh.rotation.x = -Math.PI / 2
  seaMesh.position.set(0, -0.3, -210)
  scene.add(seaMesh)

  // Roads and sidewalks
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2d })
  const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0x5a5a62 })
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0x777777 })

  const totalSize = half * 2 + 60 // 360 spanning

  streets.forEach(s => {
    // Road X strip
    const roadX = new THREE.Mesh(new THREE.PlaneGeometry(totalSize, 12), roadMat)
    roadX.rotation.x = -Math.PI / 2
    roadX.position.set(0, 0.01, s)
    roadX.receiveShadow = true
    scene.add(roadX)

    // Sidewalks X
    const sw1 = new THREE.Mesh(new THREE.PlaneGeometry(totalSize, 3), sidewalkMat)
    sw1.rotation.x = -Math.PI / 2
    sw1.position.set(0, 0.03, s - 7.5)
    sw1.receiveShadow = true
    scene.add(sw1)
    const sw2 = new THREE.Mesh(new THREE.PlaneGeometry(totalSize, 3), sidewalkMat)
    sw2.rotation.x = -Math.PI / 2
    sw2.position.set(0, 0.03, s + 7.5)
    sw2.receiveShadow = true
    scene.add(sw2)

    // Road Z strip
    const roadZ = new THREE.Mesh(new THREE.PlaneGeometry(12, totalSize), roadMat)
    roadZ.rotation.x = -Math.PI / 2
    roadZ.position.set(s, 0.01, 0)
    roadZ.receiveShadow = true
    scene.add(roadZ)

    // Sidewalks Z
    const sw3 = new THREE.Mesh(new THREE.PlaneGeometry(3, totalSize), sidewalkMat)
    sw3.rotation.x = -Math.PI / 2
    sw3.position.set(s - 7.5, 0.03, 0)
    sw3.receiveShadow = true
    scene.add(sw3)
    const sw4 = new THREE.Mesh(new THREE.PlaneGeometry(3, totalSize), sidewalkMat)
    sw4.rotation.x = -Math.PI / 2
    sw4.position.set(s + 7.5, 0.03, 0)
    sw4.receiveShadow = true
    scene.add(sw4)

    // Dashed lines along street X
    for (let x = -half + 10; x < half; x += 10) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.4), lineMat)
      dash.rotation.x = -Math.PI / 2
      dash.position.set(x, 0.02, s)
      scene.add(dash)
    }
    // Dashed lines along street Z
    for (let z = -half + 10; z < half; z += 10) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 4), lineMat)
      dash.rotation.x = -Math.PI / 2
      dash.position.set(s, 0.02, z)
      scene.add(dash)
    }
  })

  // Building Color Palette
  const buildingColors = [
    0x8c4a32, // warm brick
    0xd9cfb0, // cream
    0x2c6b6f, // teal
    0xa65233, // terracotta
    0x4a5d6e, // blue-grey
    0xb0a899, // tan
    0x5d735f, // sage green
    0x444851  // slate
  ]

  // 5x5 blocks
  let landmarkPlaced = false
  for (let xi = 0; xi < 4; xi++) {
    for (let zi = 0; zi < 4; zi++) {
      const xMin = streets[xi] + 9
      const xMax = streets[xi + 1] - 9
      const zMin = streets[zi] + 9
      const zMax = streets[zi + 1] - 9

      const blockCenterX = (xMin + xMax) / 2
      const blockCenterZ = (zMin + zMax) / 2

      // 1 or 2 buildings per block
      const count = rng() < 0.5 ? 1 : 2
      for (let b = 0; b < count; b++) {
        const w = 26 + rng() * 12
        const d = 26 + rng() * 12
        const jx = (rng() - 0.5) * 8
        const jz = (rng() - 0.5) * 8
        const bx = blockCenterX + (count === 2 ? (b === 0 ? -6 : 6) : 0) + jx
        const bz = blockCenterZ + (count === 2 ? 0 : 0) + jz

        // Height tiers
        let h
        const rHeight = rng()
        if (!landmarkPlaced && xi === 2 && zi === 1) {
          h = 48 + rng() * 10
          landmarkPlaced = true
        } else if (rHeight < 0.3) {
          h = 8 + rng() * 6
        } else if (rHeight < 0.7) {
          h = 16 + rng() * 8
        } else if (rHeight < 0.95) {
          h = 28 + rng() * 12
        } else {
          h = 45 + rng() * 10
          landmarkPlaced = true
        }

        const color = buildingColors[Math.floor(rng() * buildingColors.length)]
        const mat = [
          windowMat, windowMat,
          new THREE.MeshLambertMaterial({ color }),
          new THREE.MeshLambertMaterial({ color }),
          windowMat, windowMat
        ]

        const geom = new THREE.BoxGeometry(w, h, d)
        const mesh = new THREE.Mesh(geom, mat)
        mesh.position.set(bx, h / 2, bz)
        mesh.castShadow = true
        mesh.receiveShadow = true
        scene.add(mesh)

        // Collider box
        colliders.push({
          minX: bx - w / 2 - 0.5,
          maxX: bx + w / 2 + 0.5,
          minZ: bz - d / 2 - 0.5,
          maxZ: bz + d / 2 + 0.5
        })

        // Rooftop details
        if (rng() < 0.5) {
          const roofBox = new THREE.Mesh(
            new THREE.BoxGeometry(w * 0.4, 2, d * 0.4),
            new THREE.MeshLambertMaterial({ color: 0x333333 })
          )
          roofBox.position.set(bx, h + 1, bz)
          scene.add(roofBox)

          if (rng() < 0.3) {
            const antenna = new THREE.Mesh(
              new THREE.CylinderGeometry(0.1, 0.1, 6),
              new THREE.MeshLambertMaterial({ color: 0xaaaaaa })
            )
            antenna.position.set(bx + w * 0.2, h + 4, bz + d * 0.2)
            scene.add(antenna)
          }
        }

        // Neon signs on ~1/3 of street-facing buildings
        if (rng() < 0.33) {
          const neonColors = [0xff2a6d, 0x05d9e8, 0xff7700]
          const nc = neonColors[Math.floor(rng() * neonColors.length)]
          const neonMat = new THREE.MeshBasicMaterial({ color: nc })
          const signMesh = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, 2, 0.6), neonMat)
          signMesh.position.set(bx, h * 0.75, bz + d / 2 + 0.3)
          scene.add(signMesh)
        }
      }
    }
  }

  // Distant skyline silhouette boxes (east, west, south)
  const skylineMat = new THREE.MeshLambertMaterial({ color: 0x1a1a20 })
  for (let i = -240; i <= 240; i += 30) {
    // East edge
    let hE = 40 + rng() * 30
    let meshE = new THREE.Mesh(new THREE.BoxGeometry(20, hE, 25), skylineMat)
    meshE.position.set(185, hE / 2, i)
    scene.add(meshE)

    // West edge
    let hW = 40 + rng() * 30
    let meshW = new THREE.Mesh(new THREE.BoxGeometry(20, hW, 25), skylineMat)
    meshW.position.set(-185, hW / 2, i)
    scene.add(meshW)

    // South edge
    let hS = 40 + rng() * 30
    let meshS = new THREE.Mesh(new THREE.BoxGeometry(25, hS, 20), skylineMat)
    meshS.position.set(i, hS / 2, 185)
    scene.add(meshS)
  }

  // Street Lamps along every street (~25-35m spacing)
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x222222 })
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffeaa7 })
  const poolMat = new THREE.MeshBasicMaterial({ color: 0xfffaa0, transparent: true, opacity: 0.4 })

  streets.forEach(s => {
    // Along X streets
    for (let x = -half + 15; x < half; x += 30) {
      const side = (Math.floor((x + half) / 30) % 2 === 0) ? 8.5 : -8.5
      // Pole
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 6), poleMat)
      pole.position.set(x, 3, s + side)
      scene.add(pole)
      // Head
      const head = new THREE.Mesh(new THREE.BoxGeometry(1, 0.4, 1), lampHeadMat)
      head.position.set(x, 6, s + side)
      scene.add(head)
      // Pool disc
      const disc = new THREE.Mesh(new THREE.CircleGeometry(3, 12), poolMat)
      disc.rotation.x = -Math.PI / 2
      disc.position.set(x, 0.02, s + side)
      scene.add(disc)
    }

    // Along Z streets
    for (let z = -half + 15; z < half; z += 30) {
      const side = (Math.floor((z + half) / 30) % 2 === 0) ? 8.5 : -8.5
      // Pole
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 6), poleMat)
      pole.position.set(s + side, 3, z)
      scene.add(pole)
      // Head
      const head = new THREE.Mesh(new THREE.BoxGeometry(1, 0.4, 1), lampHeadMat)
      head.position.set(s + side, 6, z)
      scene.add(head)
      // Pool disc
      const disc = new THREE.Mesh(new THREE.CircleGeometry(3, 12), poolMat)
      disc.rotation.x = -Math.PI / 2
      disc.position.set(s + side, 0.02, z)
      scene.add(disc)
    }
  })

  // Palm Trees (~20 on sidewalks, respecting shot corridors)
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8b5a2b })
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2d8a4e })

  let palmCount = 0
  let attempts = 0
  while (palmCount < 20 && attempts < 200) {
    attempts++
    const px = (rng() - 0.5) * 260
    const pz = (rng() - 0.5) * 260

    // Must be near a street (sidewalk zone ~7 to 11 from street center)
    let nearStreet = false
    for (let s of streets) {
      if ((Math.abs(px - s) >= 7 && Math.abs(px - s) <= 11) ||
          (Math.abs(pz - s) >= 7 && Math.abs(pz - s) <= 11)) {
        nearStreet = true
        break
      }
    }
    if (!nearStreet) continue

    // Shot corridor check 1: no palm within 12m of center line of street x 0 for z between -20 and 90
    if (Math.abs(px) < 12 && pz >= -20 && pz <= 90) continue
    // Shot corridor check 2: none within 8m of (-118, 70)
    const dAlt = Math.hypot(px - (-118), pz - 70)
    if (dAlt < 8) continue

    // Build palm tree
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 5), trunkMat)
    trunk.position.set(px, 2.5, pz)
    trunk.castShadow = true
    scene.add(trunk)

    const canopy = new THREE.Mesh(new THREE.ConeGeometry(2, 3, 6), leafMat)
    canopy.position.set(px, 5.5, pz)
    canopy.castShadow = true
    scene.add(canopy)

    palmCount++
  }

  // Pier (x: 75 to 105, z: -182 to -142)
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x805533 })
  const pierGeo = new THREE.BoxGeometry(30, 0.8, 40)
  const pierMesh = new THREE.Mesh(pierGeo, pierMat)
  pierMesh.position.set(90, 0.4, -162)
  pierMesh.receiveShadow = true
  pierMesh.castShadow = true
  scene.add(pierMesh)

  // Pier collider
  colliders.push({
    minX: 75,
    maxX: 105,
    minZ: -182,
    maxZ: -142
  })

  // Two simple boats near pier
  const hullMat = new THREE.MeshLambertMaterial({ color: 0xdd3333 })
  const cabinMat = new THREE.MeshLambertMaterial({ color: 0xffffff })

  const boat1Group = new THREE.Group()
  const bHull = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 6), hullMat)
  bHull.position.y = 0.5
  bHull.castShadow = true
  boat1Group.add(bHull)
  const bCab = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 2.5), cabinMat)
  bCab.position.set(0, 1.2, 0.5)
  boat1Group.add(bCab)
  boat1Group.position.set(80, 0, -135)
  scene.add(boat1Group)

  const boat2Group = new THREE.Group()
  const bHull2 = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.9, 5), hullMat)
  bHull2.position.y = 0.5
  bHull2.castShadow = true
  boat2Group.add(bHull2)
  boat2Group.position.set(100, 0, -132)
  scene.add(boat2Group)

  // Places object
  const places = {
    spawn: { x: 0, z: 30 },
    hotel: { x: 114, z: -96 },
    marina: { x: 90, z: -140 },
    alley: { x: -120, z: 60 },
    chopShop: { x: -120, z: -96 },
    hideout: { x: -114, z: 96 },
    hospital: { x: 24, z: 120 },
    tower: { x: 30, z: -66 }
  }

  return { colliders, places, streets }
}
