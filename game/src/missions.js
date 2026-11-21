import * as THREE from 'three'
import { dist2 } from './utils.js'

export const MISSIONS = [
  {
    id: 'fare',
    name: 'First Fare',
    reward: 150,
    intro: 'Marco Solis, a driver-for-hire in the coastal city of Solmar Bay, takes his first paying client.',
    stages: [
      { text: 'Pick up the client at the hotel', type: 'reach', place: 'hotel', radius: 6 },
      { text: 'Drop the client at the marina', type: 'reach', place: 'marina', radius: 7 }
    ]
  },
  {
    id: 'wheels',
    name: 'Borrowed Wheels',
    reward: 300,
    intro: 'a red Comet S is parked at the marina and its owner is nowhere to be seen; borrow it and deliver it to the chop shop.',
    stages: [
      { text: 'Reach the marina', type: 'reach', place: 'marina', radius: 5 },
      { text: 'Deliver the Comet S to the chop shop', type: 'reach', place: 'chopShop', radius: 7, wanted: 1 }
    ]
  },
  {
    id: 'package',
    name: 'The Package',
    reward: 500,
    intro: 'a package waits at the corner of Coral Street; grab it on foot, and be ready to run, because the bay police are watching.',
    stages: [
      { text: 'Grab the package at the corner (on foot)', type: 'reach', place: 'alley', radius: 4, onFoot: true },
      { text: 'Escape to the hideout — lose the heat', type: 'reach', place: 'hideout', radius: 7, wanted: 2 }
    ]
  },
  {
    id: 'midnight',
    name: 'Midnight Run',
    reward: 800,
    timeLimit: 180,
    intro: 'one last job, a midnight delivery across the whole city, three stars on your tail and a roadblock on Coral Street, with 180 seconds on the clock.',
    stages: [
      { text: 'Reach the tower pickup', type: 'reach', place: 'tower', radius: 6, wanted: 3 },
      { text: 'Deliver to the hideout before time runs out', type: 'reach', place: 'hideout', radius: 7 }
    ]
  }
]

// Handles mission definitions, progression state machine, and objectives
export function createMissions(places) {
  let index = 0
  let stage = 0
  let active = false
  let state = 'idle' // 'idle', 'playing', 'failed', 'done', 'storydone'
  let timeLeft = 0
  let marker = null

  function current() {
    return MISSIONS[index] || null
  }

  function updateMarker(pl) {
    if (!active) {
      marker = null
      return
    }
    const m = MISSIONS[index]
    if (!m || stage >= m.stages.length) {
      marker = null
      return
    }
    const st = m.stages[stage]
    const pKey = st.place
    const placeCoord = pl[pKey]
    if (placeCoord) {
      marker = {
        x: placeCoord.x,
        z: placeCoord.z,
        text: st.text
      }
    } else {
      marker = null
    }
  }

  function start(newIndex) {
    index = clampIndex(newIndex)
    stage = 0
    active = true
    state = 'playing'
    const m = MISSIONS[index]
    timeLeft = m && m.timeLimit ? m.timeLimit : 0
    updateMarker(places)
  }

  function clampIndex(i) {
    if (i < 0) return 0
    if (i >= MISSIONS.length) return MISSIONS.length - 1
    return i
  }

  function update(dt, info) {
    if (!active) return null

    const m = MISSIONS[index]
    if (!m) return null

    // Time limit check
    if (m.timeLimit !== undefined) {
      timeLeft -= dt
      if (timeLeft <= 0) {
        timeLeft = 0
        state = 'failed'
        active = false
        marker = null
        return 'failed'
      }
    }

    const st = m.stages[stage]
    if (!st) return null

    // Check if onFoot requirement is met
    if (st.onFoot && info.inCar) {
      return null
    }

    const placeCoord = places[st.place]
    if (!placeCoord) return null

    const dist = Math.hypot(info.pos.x - placeCoord.x, info.pos.z - placeCoord.z)
    if (dist <= st.radius) {
      // Reached stage place!
      if (st.wanted !== undefined && info.police) {
        info.police.setWanted(st.wanted)
      }

      stage++
      if (stage >= m.stages.length) {
        state = 'done'
        active = false
        marker = null
        return 'done'
      } else {
        updateMarker(places)
        return 'stage'
      }
    }

    return null
  }

  function next() {
    if (index + 1 < MISSIONS.length) {
      start(index + 1)
      return true
    } else {
      state = 'storydone'
      active = false
      marker = null
      return false
    }
  }

  return {
    get index() { return index },
    get stage() { return stage },
    get active() { return active },
    get state() { return state },
    get timeLeft() { return timeLeft },
    get marker() { return marker },
    current,
    start,
    updateMarker,
    update,
    next
  }
}

export function createBeacon(scene) {
  const group = new THREE.Group()
  group.visible = false

  // Flat yellow ring on the ground
  const ringGeo = new THREE.RingGeometry(3, 3.5, 32)
  ringGeo.rotateX(-Math.PI / 2)
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })
  const ring = new THREE.Mesh(ringGeo, ringMat)
  ring.position.y = 0.05
  group.add(ring)

  // Tall translucent yellow cylinder (light beam)
  const cylGeo = new THREE.CylinderGeometry(2.5, 2.5, 30, 16, 1, true)
  const cylMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.25, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })
  const cyl = new THREE.Mesh(cylGeo, cylMat)
  cyl.position.y = 15
  group.add(cyl)

  scene.add(group)

  let time = 0

  return {
    set(x, z) {
      group.position.set(x, 0, z)
      group.visible = true
      time = 0
    },
    hide() {
      group.visible = false
    },
    update(dt) {
      if (!group.visible) return
      time += dt
      const scale = 1 + Math.sin(time * 3) * 0.15
      ring.scale.set(scale, scale, 1)
      ringMat.opacity = 0.5 + Math.sin(time * 4) * 0.3
      cylMat.opacity = 0.2 + Math.cos(time * 3) * 0.1
    }
  }
}
