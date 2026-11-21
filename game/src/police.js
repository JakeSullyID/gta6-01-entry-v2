import * as THREE from 'three'
import { clamp, lerp, damp, wrapAngle, angleDelta, dist2 } from './utils.js'
import { createCar, driveCar } from './vehicles.js'

// Manages police pursuit, wanted levels, heat, and cruiser AI behavior
export function createPolice(scene) {
  let wanted = 0
  let heat = 0
  let cruisers = []
  let bustedTimer = 0
  let coolTimer = 0
  let maxCruisers = 0
  let sirenOn = false
  let autoSpawn = true

  function computeWantedFromHeat(h) {
    if (h >= 90) return 5
    if (h >= 70) return 4
    if (h >= 50) return 3
    if (h >= 30) return 2
    if (h >= 12) return 1
    return 0
  }

  function addHeat(amount) {
    heat = clamp(heat + amount, 0, 100)
    coolTimer = 0
    const newWanted = computeWantedFromHeat(heat)
    if (newWanted > wanted) {
      wanted = newWanted
    }
  }

  function clearWanted() {
    wanted = 0
    heat = 0
    bustedTimer = 0
    coolTimer = 0
    maxCruisers = 0
    sirenOn = false
    for (const c of cruisers) {
      if (c.mesh && c.mesh.parent) {
        c.mesh.parent.remove(c.mesh)
      }
    }
    cruisers = []
  }

  function setWanted(n) {
    wanted = clamp(n, 0, 5)
    heat = wanted * 20
    coolTimer = 0
    bustedTimer = 0
  }

  function update(dt, player, cars, colliders, onBusted) {
    // Heat and wanted decay logic
    if (wanted === 0) {
      coolTimer += dt
      if (heat > 0) {
        heat = Math.max(0, heat - 3 * dt)
      }
      // Remove distant cruisers when wanted is 0
      for (let i = cruisers.length - 1; i >= 0; i--) {
        const c = cruisers[i]
        const d = Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z)
        if (d > 120) {
          if (c.mesh && c.mesh.parent) {
            c.mesh.parent.remove(c.mesh)
          }
          cruisers.splice(i, 1)
        }
      }
    } else {
      // Wanted > 0
      // coolTimer grows only while no new heat arrives (addHeat resets coolTimer)
      coolTimer += dt
      if (coolTimer > 20) {
        heat = Math.max(0, heat - 5 * dt)
        const computed = computeWantedFromHeat(heat)
        if (computed < wanted) {
          wanted = computed
          if (wanted === 0) {
            heat = 0
          }
        }
      }
    }

    // Desired number of cruisers capped at 4
    const targetCruisers = Math.min(wanted, 4)
    maxCruisers = targetCruisers

    // Auto spawn/remove cruisers if autoSpawn is true
    if (autoSpawn && wanted > 0) {
      // Add cruisers up to targetCruisers
      while (cruisers.length < targetCruisers) {
        const angle = Math.random() * Math.PI * 2
        const dist = 55 + Math.random() * 25
        const sx = player.pos.x + Math.sin(angle) * dist
        const sz = player.pos.z + Math.cos(angle) * dist
        const c = createCar(scene, {
          kind: 'police',
          maxSpeed: 42,
          x: sx,
          z: sz,
          heading: angle + Math.PI,
          color: 0x1122aa
        })
        cruisers.push(c)
        cars.push(c)
      }

      // Remove excess cruisers (furthest first)
      while (cruisers.length > targetCruisers) {
        let furthestIdx = -1
        let maxD = -1
        for (let i = 0; i < cruisers.length; i++) {
          if (cruisers[i].formation) continue // do not remove formation cruisers if possible
          const d = Math.hypot(cruisers[i].pos.x - player.pos.x, cruisers[i].pos.z - player.pos.z)
          if (d > maxD) {
            maxD = d
            furthestIdx = i
          }
        }
        if (furthestIdx === -1) furthestIdx = cruisers.length - 1
        const removed = cruisers.splice(furthestIdx, 1)[0]
        if (removed) {
          if (removed.mesh && removed.mesh.parent) {
            removed.mesh.parent.remove(removed.mesh)
          }
          const cIdx = cars.indexOf(removed)
          if (cIdx !== -1) cars.splice(cIdx, 1)
        }
      }
    } else if (autoSpawn && wanted === 0 && cruisers.length === 0) {
      // no cruisers needed when wanted is 0 and none left
    }

    // Update cruiser movement (always runs every frame for both normal and staged cruisers)
    for (const c of cruisers) {
      if (c.formation) {
        // Staged formation holding
        if (player.car) {
          const targetHeading = player.car.heading
          const forwardX = Math.sin(targetHeading)
          const forwardZ = Math.cos(targetHeading)
          const rightX = Math.cos(targetHeading)
          const rightZ = -Math.sin(targetHeading)

          const targetX = player.car.pos.x + rightX * (c.formation.formationSide || 0) + forwardX * (c.formation.formationAhead || 0)
          const targetZ = player.car.pos.z + rightZ * (c.formation.formationSide || 0) + forwardZ * (c.formation.formationAhead || 0)

          c.pos.set(targetX, 0, targetZ)
          c.heading = targetHeading
          c.speed = player.car.speed
          c.mesh.position.copy(c.pos)
          c.mesh.rotation.y = c.heading
        }
      } else {
        // Chasing player
        const dx = player.pos.x - c.pos.x
        const dz = player.pos.z - c.pos.z
        const distToPlayer = Math.hypot(dx, dz)
        const targetAngle = Math.atan2(dx, dz)
        const angleDiff = angleDelta(c.heading, targetAngle)
        const steer = clamp(angleDiff * 1.5, -1, 1)

        let throttle = 1
        let brake = false

        if (distToPlayer < 3) {
          brake = true
          throttle = 0
        } else if (distToPlayer < 6) {
          throttle = 0.4
        }

        driveCar(c, dt, { throttle, steer, brake }, colliders, cars)

        // Bust or ram check
        if (!player.car && distToPlayer < 2.5) {
          bustedTimer += dt
          if (bustedTimer >= 2.5) {
            if (typeof onBusted === 'function') {
              onBusted()
            }
            bustedTimer = 0
          }
        } else if (player.car) {
          const carDist = Math.hypot(player.car.pos.x - c.pos.x, player.car.pos.z - c.pos.z)
          if (carDist < 3.2) {
            // Ram player car
            player.car.speed *= 0.85
            addHeat(2)
          }
        }
      }
    }

    sirenOn = wanted > 0 && cruisers.length > 0
  }

  return {
    get wanted() { return wanted },
    get heat() { return heat },
    get cruisers() { return cruisers },
    get bustedTimer() { return bustedTimer },
    get coolTimer() { return coolTimer },
    get maxCruisers() { return maxCruisers },
    get sirenOn() { return sirenOn },
    get autoSpawn() { return autoSpawn },
    set autoSpawn(v) { autoSpawn = v },
    addHeat,
    clearWanted,
    setWanted,
    update
  }
}
