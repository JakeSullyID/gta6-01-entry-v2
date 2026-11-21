import * as THREE from 'three'
import { clamp, lerp, damp, wrapAngle, angleDelta, dist2, makeRng, pick, circleVsAabb } from './utils.js'

export function makeCarMesh(opts = {}) {
  const group = new THREE.Group()

  const color = opts.color !== undefined ? opts.color : 0xdc2626
  const isTaxi = !!opts.taxi
  const isPolice = !!opts.police

  // Materials
  const bodyColor = isPolice ? 0xffffff : (isTaxi ? 0xfacc15 : color)
  const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor })
  const windowMat = new THREE.MeshLambertMaterial({ color: 0x111827 })
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1f2937 })
  const lightWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
  const lightRedMat = new THREE.MeshBasicMaterial({ color: 0xef4444 })

  // Body box (4.4 long, 2 wide, 0.7 tall, centred 0.55 above ground)
  const bodyGeo = new THREE.BoxGeometry(2, 0.7, 4.4)
  const body = new THREE.Mesh(bodyGeo, bodyMat)
  body.position.set(0, 0.55, 0)
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  // Police stripe if police
  if (isPolice) {
    const stripeMat = new THREE.MeshLambertMaterial({ color: 0x111827 })
    const stripeGeo = new THREE.BoxGeometry(2.02, 0.4, 3)
    const stripe = new THREE.Mesh(stripeGeo, stripeMat)
    stripe.position.set(0, 0.55, 0)
    group.add(stripe)
  }

  // Cabin box (2.2 long, 1.8 wide, 0.6 tall at 1.15 high)
  const cabinGeo = new THREE.BoxGeometry(1.8, 0.6, 2.2)
  const cabin = new THREE.Mesh(cabinGeo, windowMat)
  cabin.position.set(0, 1.15, -0.1)
  cabin.castShadow = true
  group.add(cabin)

  // Wheels (4 cylinders at corners, axis across car -> rotation.z = PI/2)
  const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.4, 12)
  wheelGeo.rotateZ(Math.PI / 2)

  const wheelPositions = [
    [-1.05, 0.35, 1.4],
    [1.05, 0.35, 1.4],
    [-1.05, 0.35, -1.4],
    [1.05, 0.35, -1.4]
  ]

  wheelPositions.forEach(pos => {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat)
    wheel.position.set(...pos)
    wheel.castShadow = true
    group.add(wheel)
  })

  // Headlights (two small white boxes at front: z = -2.2)
  const hlGeo = new THREE.BoxGeometry(0.3, 0.2, 0.1)
  const hlLeft = new THREE.Mesh(hlGeo, lightWhiteMat)
  hlLeft.position.set(-0.7, 0.5, -2.22)
  group.add(hlLeft)
  const hlRight = new THREE.Mesh(hlGeo, lightWhiteMat)
  hlRight.position.set(0.7, 0.5, -2.22)
  group.add(hlRight)

  // Taillights (two small red boxes at rear: z = 2.2)
  const tlGeo = new THREE.BoxGeometry(0.3, 0.2, 0.1)
  const tlLeft = new THREE.Mesh(tlGeo, lightRedMat)
  tlLeft.position.set(-0.7, 0.5, 2.22)
  group.add(tlLeft)
  const tlRight = new THREE.Mesh(tlGeo, lightRedMat)
  tlRight.position.set(0.7, 0.5, 2.22)
  group.add(tlRight)

  // Taxi roof sign
  if (isTaxi) {
    const signMat = new THREE.MeshBasicMaterial({ color: 0x111827 })
    const signGeo = new THREE.BoxGeometry(1.0, 0.25, 0.4)
    const sign = new THREE.Mesh(signGeo, signMat)
    sign.position.set(0, 1.55, -0.1)
    group.add(sign)
  }

  // Police light bar
  if (isPolice) {
    const barMat = new THREE.MeshLambertMaterial({ color: 0x333333 })
    const barGeo = new THREE.BoxGeometry(1.2, 0.15, 0.3)
    const bar = new THREE.Mesh(barGeo, barMat)
    bar.position.set(0, 1.52, 0)
    group.add(bar)

    const blueMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6 })
    const redMat = new THREE.MeshBasicMaterial({ color: 0xef4444 })
    const lightB = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.25), blueMat)
    lightB.position.set(-0.35, 1.6, 0)
    group.add(lightB)
    const lightR = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.25), redMat)
    lightR.position.set(0.35, 1.6, 0)
    group.add(lightR)
  }

  return group
}

export function createCar(scene, opts = {}) {
  const kind = opts.kind || 'civilian'
  const isTaxi = kind === 'taxi' || !!opts.taxi
  const isPolice = kind === 'police' || !!opts.police

  const mesh = makeCarMesh({
    color: opts.color,
    taxi: isTaxi,
    police: isPolice
  })

  const x = opts.x || 0
  const z = opts.z || 0
  const heading = opts.heading || 0

  mesh.position.set(x, 0, z)
  mesh.rotation.y = heading
  scene.add(mesh)

  const car = {
    mesh,
    pos: new THREE.Vector3(x, 0, z),
    heading,
    speed: 0,
    maxSpeed: opts.maxSpeed || 38,
    accel: opts.accel || 16,
    radius: 2.1,
    color: opts.color !== undefined ? opts.color : 0xdc2626,
    kind,
    stolen: false,
    ai: opts.ai || null,
    target: null,
    hp: 100,
    headlights: false
  }

  return car
}

// Manages arcade physics driving, collisions, and car state updates
export function driveCar(car, dt, input, colliders = [], cars = []) {
  const throttle = clamp(input.throttle || 0, -1, 1)
  const steer = clamp(input.steer || 0, -1, 1)
  const brake = !!input.brake

  // Acceleration along heading
  let effectiveAccel = car.accel
  // Reversing while moving forward is weaker (~70%)
  if (throttle < 0 && car.speed > 1) {
    effectiveAccel *= 0.7
  }

  if (throttle !== 0) {
    car.speed += throttle * effectiveAccel * dt
  }

  // Drag (speed decays ~55% per second, proportional to speed)
  car.speed -= car.speed * 0.55 * dt

  // Brake decelerates strongly (~22 per second)
  if (brake) {
    if (car.speed > 0) {
      car.speed = Math.max(0, car.speed - 22 * dt)
    } else if (car.speed < 0) {
      car.speed = Math.min(0, car.speed + 22 * dt)
    }
  }

  // Clamp speed between -12 and maxSpeed
  car.speed = clamp(car.speed, -12, car.maxSpeed)

  // Steering
  if (Math.abs(car.speed) > 0.5) {
    const speedRatio = Math.min(1, Math.abs(car.speed) / 20)
    const turnRate = 2.2 * steer * speedRatio * (car.speed > 0 ? 1 : -1)
    car.heading += turnRate * dt
  }

  // Move position
  const forwardX = Math.sin(car.heading)
  const forwardZ = Math.cos(car.heading)

  car.pos.x += forwardX * car.speed * dt
  car.pos.z += forwardZ * car.speed * dt

  // Collisions with buildings (circle vs AABB)
  for (const box of colliders) {
    const res = circleVsAabb(car.pos.x, car.pos.z, car.radius, box)
    if (res) {
      car.pos.x += res.nx * res.depth
      car.pos.z += res.nz * res.depth
      // Cancel speed pointing into wall
      const dot = forwardX * res.nx + forwardZ * res.nz
      if (dot < 0) {
        car.speed *= 0.2
      }
    }
  }

  // Collisions with other cars (circle vs circle)
  for (const other of cars) {
    if (other === car) continue
    const dx = car.pos.x - other.pos.x
    const dz = car.pos.z - other.pos.z
    const dist = Math.hypot(dx, dz)
    const minDist = car.radius + other.radius
    if (dist < minDist && dist > 0.001) {
      const overlap = minDist - dist
      const nx = dx / dist
      const nz = dz / dist
      car.pos.x += nx * overlap * 0.5
      car.pos.z += nz * overlap * 0.5
      other.pos.x -= nx * overlap * 0.5
      other.pos.z -= nz * overlap * 0.5

      // Trade a little speed
      const tempSpeed = car.speed
      car.speed = lerp(car.speed, other.speed, 0.3)
      other.speed = lerp(other.speed, tempSpeed, 0.3)
    }
  }

  // Clamp position to map boundaries (-148 to 148)
  car.pos.x = clamp(car.pos.x, -148, 148)
  car.pos.z = clamp(car.pos.z, -148, 148)

  // Update mesh position and rotation
  car.mesh.position.copy(car.pos)
  car.mesh.rotation.y = car.heading

  // Headlights management
  if (car.headlights) {
    if (!car._spotlightsAdded) {
      car._spotlightsAdded = true
      const spotMat = new THREE.MeshBasicMaterial({ color: 0xfffaed })
      const spotGeo = new THREE.ConeGeometry(3, 8, 8)
      spotGeo.rotateX(-Math.PI / 2)

      const spotL = new THREE.Mesh(spotGeo, spotMat)
      spotL.position.set(-0.7, 0.5, -5)
      spotL.name = 'headlightSpot'
      car.mesh.add(spotL)

      const spotR = new THREE.Mesh(spotGeo, spotMat)
      spotR.position.set(0.7, 0.5, -5)
      spotR.name = 'headlightSpot'
      car.mesh.add(spotR)
    }
  } else {
    if (car._spotlightsAdded) {
      car._spotlightsAdded = false
      const childrenToRemove = []
      car.mesh.children.forEach(child => {
        if (child.name === 'headlightSpot') childrenToRemove.push(child)
      })
      childrenToRemove.forEach(c => car.mesh.remove(c))
    }
  }
}

export function createTraffic(scene, streets, seed) {
  const rng = makeRng(seed)
  const cars = []
  const colors = [0xdc2626, 0x2563eb, 0x16a34a, 0x9333ea, 0xca8a04, 0x0891b2, 0xe11d48, 0x475569]

  // 30 AI cars
  for (let i = 0; i < 30; i++) {
    const street = pick(rng, streets)
    const horizontal = rng() < 0.5
    const dir = rng() < 0.5 ? 1 : -1
    const posVal = (rng() - 0.5) * 280

    const x = horizontal ? posVal : street
    const z = horizontal ? street : posVal
    const heading = horizontal ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI)

    const isTaxi = rng() < 0.2
    const kind = isTaxi ? 'taxi' : 'civilian'
    const color = pick(rng, colors)
    const maxSpeed = 10 + rng() * 5

    const car = createCar(scene, {
      x,
      z,
      heading,
      color,
      kind,
      maxSpeed,
      accel: 10,
      ai: {
        horizontal,
        street,
        dir,
        speed: 9 + rng() * 5,
        wait: 0
      }
    })

    cars.push(car)
  }

  return cars
}

export function createParkedCars(scene, streets, seed) {
  const rng = makeRng(seed)
  const parked = []
  const colors = [0x57534e, 0x78716c, 0x292524, 0x1c1917, 0x334155, 0x475569]

  // 8 to 10 parked cars
  const count = 8 + Math.floor(rng() * 3)
  for (let i = 0; i < count; i++) {
    const street = pick(rng, streets)
    const horizontal = rng() < 0.5
    const crossStreet = pick(rng, streets)
    const posVal = crossStreet + (rng() < 0.5 ? 22 : -22)

    // Sits on curb edge (sidewalk side, e.g. offset from street by ~8.5)
    const sideOffset = rng() < 0.5 ? 8.5 : -8.5

    const x = horizontal ? posVal : (street + sideOffset)
    const z = horizontal ? (street + sideOffset) : posVal
    const heading = horizontal ? (rng() < 0.5 ? 0 : Math.PI) : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2)

    const color = pick(rng, colors)
    const car = createCar(scene, {
      x,
      z,
      heading,
      color,
      kind: 'civilian',
      maxSpeed: 0,
      accel: 0
    })

    parked.push(car)
  }

  return parked
}

export function updateTraffic(cars, dt, colliders = []) {
  for (const car of cars) {
    if (!car.ai) continue

    if (car.ai.wait > 0) {
      car.ai.wait -= dt
      continue
    }

    const ai = car.ai
    if (ai.horizontal) {
      car.pos.x += ai.speed * ai.dir * dt
      car.heading = ai.dir > 0 ? Math.PI / 2 : -Math.PI / 2

      // Ease cross-axis (z) toward ai.street
      car.pos.z = lerp(car.pos.z, ai.street, dt * 4)

      // When passing city edge (> 145), turn onto cross street
      if (Math.abs(car.pos.x) > 145) {
        ai.horizontal = false
        ai.dir = car.pos.x > 0 ? -1 : 1
        car.pos.x = ai.dir > 0 ? -145 : 145
        ai.street = car.pos.x > 0 ? 120 : -120
      }
    } else {
      car.pos.z += ai.speed * ai.dir * dt
      car.heading = ai.dir > 0 ? 0 : Math.PI

      // Ease cross-axis (x) toward ai.street
      car.pos.x = lerp(car.pos.x, ai.street, dt * 4)

      // When passing city edge (> 145), turn onto cross street
      if (Math.abs(car.pos.z) > 145) {
        ai.horizontal = true
        ai.dir = car.pos.z > 0 ? -1 : 1
        car.pos.z = ai.dir > 0 ? -145 : 145
        ai.street = car.pos.z > 0 ? 120 : -120
      }
    }

    car.mesh.position.copy(car.pos)
    car.mesh.rotation.y = car.heading
  }
}
