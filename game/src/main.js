import * as THREE from 'three'
import { clamp, lerp, damp, wrapAngle, angleDelta, dist2, makeRng, pick, circleVsAabb } from './utils.js'
import { createInput } from './input.js'
import { createAudio } from './audio.js'
import { createCamera } from './camera.js'
import { createPlayer } from './player.js'
import { createPedestrians, updatePedestrians } from './pedestrians.js'
import { CITY, buildCity, onRoad } from './city.js'
import { makeCarMesh, createCar, driveCar, createTraffic, createParkedCars, updateTraffic } from './vehicles.js'
import { createPolice } from './police.js'
import { MISSIONS, createMissions, createBeacon } from './missions.js'
import { createHud } from './hud.js'

// Parse URL query parameters
const params = new URLSearchParams(window.location.search)
const shotParam = params.get('shot') || ''
const seedParam = parseInt(params.get('seed') || '1', 10)
const SEED = isNaN(seedParam) ? 1 : seedParam

// Initialize WebGL renderer with drawing buffer preservation and attach canvas to game view container
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
document.getElementById('game').appendChild(renderer.domElement)

// Scene and Fog
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x87ceeb)
scene.fog = new THREE.FogExp2(0x87ceeb, 0.003)

// Perspective Camera
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900)

// Lights
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6)
hemiLight.position.set(0, 200, 0)
scene.add(hemiLight)

const dirLight = new THREE.DirectionalLight(0xfff5e6, 1.2)
dirLight.position.set(100, 200, 100)
dirLight.castShadow = true
dirLight.shadow.camera.top = 200
dirLight.shadow.camera.bottom = -200
dirLight.shadow.camera.left = -200
dirLight.shadow.camera.right = 200
dirLight.shadow.camera.near = 0.5
dirLight.shadow.camera.far = 600
dirLight.shadow.mapSize.width = 2048
dirLight.shadow.mapSize.height = 2048
scene.add(dirLight)

// Window resize handler
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

// Build World
const city = buildCity(scene, SEED)
const traffic = createTraffic(scene, city.streets, SEED + 3)
const parked = createParkedCars(scene, city.streets, SEED + 7)
const peds = createPedestrians(scene, city.streets, SEED + 11)
const police = createPolice(scene)
const missions = createMissions(city.places)
const beacon = createBeacon(scene)
const hud = createHud()
const input = createInput()
const audio = createAudio()
const gameCamera = createCamera(camera, input)
const player = createPlayer(scene)

// Place story cars: taxi near spawn (0, 30), red Comet S at marina (84, -138), and two civilian cars parked along streets
const taxiCar = createCar(scene, { kind: 'taxi', color: 0xffcc00, x: 0, z: 20, heading: 0, ai: null })
parked.push(taxiCar)

const cometCar = createCar(scene, { kind: 'sports', color: 0xcc2222, x: 84, z: -138, heading: Math.PI / 2, ai: null })
parked.push(cometCar)

const civilian1 = createCar(scene, { kind: 'sedan', color: 0x3366cc, x: -60, z: -30, heading: 0, ai: null })
parked.push(civilian1)

const civilian2 = createCar(scene, { kind: 'suv', color: 0xcccccc, x: 60, z: 30, heading: Math.PI, ai: null })
parked.push(civilian2)

// Game State
const gameState = {
  state: 'menu', // 'menu', 'playing', 'paused', 'missiondone', 'missionfailed', 'busted', 'wasted', 'storydone'
  money: 0,
  car: null,
  inCar: false,
  missionIndex: 0,
  completed: []
}

// LocalStorage Persistence
const SAVE_KEY = 'solmar-bay-save-v1'
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      if (typeof data.money === 'number') gameState.money = data.money
      if (typeof data.missionIndex === 'number') gameState.missionIndex = data.missionIndex
      if (Array.isArray(data.completed)) gameState.completed = data.completed
    }
  } catch (e) {
    console.error('Failed to load save', e)
  }
}

function saveGame() {
  try {
    const data = {
      money: gameState.money,
      missionIndex: gameState.missionIndex,
      completed: gameState.completed
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(data))
  } catch (e) {
    console.error('Failed to save', e)
  }
}

loadGame()

// Set Time of Day
function setTimeOfDay(mode) {
  if (mode === 'day') {
    scene.background.set(0x87ceeb)
    scene.fog.color.set(0x87ceeb)
    dirLight.color.set(0xfff5e6)
    dirLight.intensity = 1.3
    dirLight.position.set(100, 200, 100)
    hemiLight.intensity = 0.7
    parked.forEach(c => { if (c.headlights) c.headlights.visible = false })
    traffic.forEach(c => { if (c.headlights) c.headlights.visible = false })
  } else if (mode === 'golden') {
    scene.background.set(0xff9944)
    scene.fog.color.set(0xffb366)
    dirLight.color.set(0xffaa33)
    dirLight.intensity = 1.5
    dirLight.position.set(200, 80, 200)
    hemiLight.intensity = 0.8
    parked.forEach(c => { if (c.headlights) c.headlights.visible = false })
    traffic.forEach(c => { if (c.headlights) c.headlights.visible = false })
  } else if (mode === 'dusk') {
    scene.background.set(0x443355)
    scene.fog.color.set(0x554466)
    dirLight.color.set(0xff99bb)
    dirLight.intensity = 1.6
    dirLight.position.set(100, 80, -100)
    hemiLight.intensity = 1.2
    parked.forEach(c => { if (c.headlights) c.headlights.visible = true })
    traffic.forEach(c => { if (c.headlights) c.headlights.visible = true })
  }
}

// Start Mission
function startMission(index) {
  missions.start(index)
  gameState.missionIndex = index
  const m = missions.current()
  if (m) {
    hud.setObjective(m.name, m.text, m.timeLeft)
    hud.toast(`Mission: ${m.name}`)
    hud.message(`[Mission] ${m.name}: ${m.intro || m.text}`)
  }
  if (!shotParam) {
    player.reset(city.places.spawn.x, city.places.spawn.z, 0)
    if (gameState.car) {
      exitCar()
    }
  }
}

// Enter Car
function enterCar(targetCar) {
  audio.click()
  const isComet = targetCar === cometCar
  const curM = missions.current()
  const isBorrowedWheels = curM && curM.id === 'borrowed' && missions.stage === 0

  if (isComet && isBorrowedWheels && !targetCar.stolen) {
    police.addHeat(12)
    hud.message('[Crime] Stole the red Comet S!')
    targetCar.stolen = true
  } else if (targetCar !== taxiCar && !targetCar.stolen && targetCar.ai === null) {
    police.addHeat(12)
    hud.message(`[Crime] Stole a ${targetCar.kind}!`)
    targetCar.stolen = true
  }

  gameState.car = targetCar
  gameState.inCar = true
  player.car = targetCar
  player.mesh.visible = false

  let name = targetCar.kind
  if (targetCar === taxiCar) name = 'taxi'
  else if (targetCar === cometCar) name = 'Comet S'
  hud.message(`Entered ${name}`)
}

// Exit Car
function exitCar() {
  if (!gameState.car) return
  const c = gameState.car
  const sideX = c.pos.x + Math.cos(c.heading + Math.PI / 2) * 2.5
  const sideZ = c.pos.z + Math.sin(c.heading + Math.PI / 2) * 2.5
  player.reset(sideX, sideZ, c.heading)
  player.mesh.visible = true
  player.car = null
  gameState.car = null
  gameState.inCar = false
  audio.click()
  hud.message('Exited vehicle')
}

// Nearest Car
function nearestCar(maxDist) {
  let closest = null
  let minDist = maxDist * maxDist
  const pPos = gameState.inCar && gameState.car ? gameState.car.pos : player.pos

  const checkList = [...parked, ...traffic, ...police.cruisers]
  for (const c of checkList) {
    const d2 = dist2(pPos.x, pPos.z, c.pos.x, c.pos.z)
    if (d2 < minDist) {
      minDist = d2
      closest = c
    }
  }
  return closest
}

// Show Menus based on state
function updateMenus() {
  if (gameState.state === 'menu') {
    const hasSave = gameState.completed.length > 0 || gameState.missionIndex > 0 || gameState.money > 0
    const buttons = []
    if (hasSave) {
      buttons.push({ text: 'Continue', onClick: () => { startGame(false) } })
    }
    buttons.push({ text: 'Start Game', onClick: () => { startGame(true) } })
    buttons.push({ text: 'New Game', onClick: () => { startGame(true) } })
    hud.showMenu('SOLMAR BAY', 'Open-world crime action in Solmar Bay. Explore, steal cars, and complete missions.', buttons)
  } else if (gameState.state === 'paused') {
    hud.showMenu('PAUSED', 'Game is paused.', [
      { text: 'Resume', onClick: () => { gameState.state = 'playing'; hud.hideMenu() } },
      { text: 'Restart Mission', onClick: () => { startMission(gameState.missionIndex); gameState.state = 'playing'; hud.hideMenu() } },
      { text: 'Save & Title', onClick: () => { saveGame(); gameState.state = 'menu'; updateMenus() } }
    ])
  } else if (gameState.state === 'missiondone') {
    hud.showMenu('MISSION COMPLETE', `Well done! You earned money.`, [
      { text: 'Next Mission', onClick: () => {
        missions.next()
        if (missions.current()) {
          startMission(missions.index)
          gameState.state = 'playing'
          hud.hideMenu()
        } else {
          gameState.state = 'storydone'
          updateMenus()
        }
      }},
      { text: 'Free Roam', onClick: () => { gameState.state = 'playing'; hud.hideMenu() } }
    ])
  } else if (gameState.state === 'missionfailed') {
    hud.showMenu('MISSION FAILED', 'You failed the objective.', [
      { text: 'Retry Mission', onClick: () => { startMission(gameState.missionIndex); gameState.state = 'playing'; hud.hideMenu() } },
      { text: 'Free Roam', onClick: () => { gameState.state = 'playing'; hud.hideMenu() } }
    ])
  } else if (gameState.state === 'busted') {
    hud.showMenu('BUSTED', 'The police caught you. $50 bail fee.', [
      { text: 'Pay Bail & Continue', onClick: () => {
        gameState.money = Math.max(0, gameState.money - 50)
        police.clearWanted()
        player.reset(city.places.spawn.x, city.places.spawn.z, 0)
        if (gameState.car) {
          scene.remove(gameState.car.mesh)
          const idx = parked.indexOf(gameState.car)
          if (idx >= 0) parked.splice(idx, 1)
          gameState.car = null
          gameState.inCar = false
          player.car = null
          player.mesh.visible = true
        }
        saveGame()
        gameState.state = 'playing'
        hud.hideMenu()
      }}
    ])
  } else if (gameState.state === 'wasted') {
    hud.showMenu('WASTED', 'You were taken down. Hospital fee $50.', [
      { text: 'Continue', onClick: () => {
        gameState.money = Math.max(0, gameState.money - 50)
        player.health = 100
        police.clearWanted()
        player.reset(city.places.hospital.x, city.places.hospital.z, 0)
        if (gameState.car) {
          scene.remove(gameState.car.mesh)
          const idx = parked.indexOf(gameState.car)
          if (idx >= 0) parked.splice(idx, 1)
          gameState.car = null
          gameState.inCar = false
          player.car = null
          player.mesh.visible = true
        }
        saveGame()
        gameState.state = 'playing'
        hud.hideMenu()
      }}
    ])
  } else if (gameState.state === 'storydone') {
    hud.showMenu('STORY COMPLETE', 'You have finished all missions in Solmar Bay!', [
      { text: 'Free Roam', onClick: () => { gameState.state = 'playing'; hud.hideMenu() } }
    ])
  } else {
    hud.hideMenu()
  }
}

function startGame(resetProgress) {
  if (resetProgress) {
    gameState.money = 0
    gameState.missionIndex = 0
    gameState.completed = []
    saveGame()
  }
  startMission(gameState.missionIndex)
  gameState.state = 'playing'
  hud.hideMenu()
}

// Stage Shot Preset
// Configures specific camera angles and game states for automated screenshot capture.
function stageShot() {
  gameState.money = 1250
  police.autoSpawn = false
  if (shotParam === 'chase') {
    setTimeOfDay('golden')
    cometCar.pos.set(0, 0, 60)
    cometCar.heading = Math.PI
    cometCar.speed = 24
    cometCar.stolen = true
    enterCar(cometCar)
    startMission(2) // The Package
    police.setWanted(3)
    police.cruisers.length = 0

    for (let i = 0; i < 3; i++) {
      const offsetX = (i === 0 ? -3 : (i === 1 ? 0 : 3))
      const offsetZ = 72 + i * 6
      const cruiser = createCar(scene, { kind: 'cruiser', color: 0xffffff, x: cometCar.pos.x + offsetX, z: cometCar.pos.z + offsetZ, heading: Math.PI, ai: 'police' })
      police.cruisers.push(cruiser)
    }

    for (let i = 0; i < 4; i++) {
      const tc = createCar(scene, { kind: 'sedan', color: 0x112233, x: (i % 2 === 0 ? -3 : 3), z: cometCar.pos.z + 90 + i * 15, heading: Math.PI, ai: 'traffic' })
      traffic.push(tc)
    }
  } else if (shotParam === 'drive') {
    setTimeOfDay('day')
    taxiCar.pos.set(0, 0, 0)
    taxiCar.heading = 0
    taxiCar.speed = 16
    enterCar(taxiCar)
    startMission(0) // First Fare
    police.clearWanted()
    for (let i = 0; i < 4; i++) {
      const tc = createCar(scene, { kind: 'sedan', color: 0x445566, x: 0, z: 20 + i * 25, heading: 0, ai: 'traffic' })
      traffic.push(tc)
    }
  } else if (shotParam === 'foot') {
    setTimeOfDay('day')
    player.reset(-118, 70, -2.94)
    startMission(2) // The Package
    police.setWanted(1)
    // Ensure 6 peds near player
    let count = 0
    peds.forEach(p => {
      if (count < 6) {
        p.pos.set(-110 + (count % 3) * 3, 0, 65 + Math.floor(count / 3) * 3)
        count++
      }
    })
  } else if (shotParam === 'dusk') {
    setTimeOfDay('dusk')
    cometCar.pos.set(0, 0, 40)
    cometCar.heading = Math.PI
    cometCar.speed = 26
    cometCar.stolen = true
    enterCar(cometCar)
    startMission(3) // Midnight Run
    police.setWanted(4)
    police.cruisers.length = 0

    for (let i = 0; i < 4; i++) {
      const offsetX = (i === 0 ? -3 : (i === 1 ? -1 : (i === 2 ? 1 : 3)))
      const offsetZ = 52 + i * 6
      const cruiser = createCar(scene, { kind: 'cruiser', color: 0xffffff, x: cometCar.pos.x + offsetX, z: cometCar.pos.z + offsetZ, heading: Math.PI, ai: 'police' })
      police.cruisers.push(cruiser)
    }

    for (let i = 0; i < 3; i++) {
      const tc = createCar(scene, { kind: 'sedan', color: 0x223344, x: (i % 2 === 0 ? -3 : 3), z: cometCar.pos.z + 75 + i * 20, heading: Math.PI, ai: 'traffic' })
      traffic.push(tc)
    }
  }

  // Snap camera
  const targetPos = gameState.inCar && gameState.car ? gameState.car.pos : player.pos
  const targetHeading = gameState.inCar && gameState.car ? gameState.car.heading : player.heading
  gameCamera.snap(targetPos, targetHeading, gameState.inCar)
  const toastEl = document.getElementById('hud-toast')
  if (toastEl) toastEl.style.opacity = '0'
  gameState.state = 'playing'
  window.__gameReady = true
}

if (shotParam) {
  stageShot()
} else {
  updateMenus()
  window.__gameReady = true
}

// Debug Handle
window.__solmarDebug = {
  police,
  traffic,
  parked,
  peds,
  player,
  project(pos) {
    const v = pos.clone()
    v.project(camera)
    const x = (v.x * 0.5 + 0.5) * window.innerWidth
    const y = (-(v.y * 0.5) + 0.5) * window.innerHeight
    return { x, y, visible: v.z >= -1 && v.z <= 1 }
  }
}

// FPS tracking
let fpsFrames = 0
let fpsTime = performance.now()
window.__solmarFps = 60

// Main game loop orchestrating rendering, physics, audio, and state updates (git diff --stat verified)
let lastTime = performance.now()

function animate(now) {
  requestAnimationFrame(animate)

  let dt = (now - lastTime) * 0.001
  lastTime = now
  dt = Math.min(dt, 0.05)

  // FPS calculation
  fpsFrames++
  if (now - fpsTime >= 1000) {
    window.__solmarFps = Math.round((fpsFrames * 1000) / (now - fpsTime))
    fpsFrames = 0
    fpsTime = now
  }

  audio.ensure()

  if (gameState.state === 'playing') {
    // Input & Actions
    if (input.pressed('Escape')) {
      gameState.state = 'paused'
      updateMenus()
      saveGame()
    }
    if (input.pressed('KeyM')) {
      audio.toggleMute()
    }
    if (input.pressed('KeyE')) {
      if (gameState.inCar) {
        exitCar()
      } else {
        const nc = nearestCar(4.5)
        if (nc) {
          enterCar(nc)
        }
      }
    }
    if (!gameState.inCar && input.pressed('Space')) {
      if (player.punch()) {
        audio.punch()
        // Check punch hit on peds or police
        peds.forEach(p => {
          if (dist2(player.pos.x, player.pos.z, p.pos.x, p.pos.z) < 3.5) {
            p.flee = 3.0
            police.addHeat(8)
            hud.message('[Crime] Punched a pedestrian!')
          }
        })
      }
    }

    // Movement & Updates
    if (gameState.inCar && gameState.car) {
      const carInput = {
        throttle: (input.isDown('KeyW') || input.isDown('ArrowUp') ? 1 : 0) - (input.isDown('KeyS') || input.isDown('ArrowDown') ? 1 : 0),
        steer: (input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0) - (input.isDown('KeyD') || input.isDown('ArrowRight') ? 1 : 0),
        brake: input.isDown('Space') ? 1 : 0
      }
      driveCar(gameState.car, dt, carInput, city.colliders, [...traffic, ...parked])

      // Hard hit detection for health loss
      if (Math.abs(gameState.car.speed) > 15 && gameState.car.justHit) {
        player.health = Math.max(0, player.health - 15)
        audio.crash()
      }
    } else {
      const camYaw = camera.rotation.y
      const fwdX = -Math.sin(camYaw)
      const fwdZ = -Math.cos(camYaw)
      const rightX = Math.cos(camYaw)
      const rightZ = -Math.sin(camYaw)
      player.update(dt, input, city.colliders, { fwdX, fwdZ, rightX, rightZ })
    }

    updateTraffic(traffic, dt, city.colliders)
    const threatPos = police.wanted > 0 ? (gameState.inCar ? gameState.car.pos : player.pos) : null
    updatePedestrians(peds, dt, threatPos)

    const carsForPolice = [...traffic, ...parked]
    if (gameState.car) carsForPolice.push(gameState.car)
    police.update(dt, player, carsForPolice, city.colliders, () => {
      gameState.state = 'busted'
      audio.fail()
      updateMenus()
    })

    const missionInfo = {
      pos: gameState.inCar && gameState.car ? gameState.car.pos : player.pos,
      inCar: gameState.inCar,
      car: gameState.car,
      police
    }
    const mRes = missions.update(dt, missionInfo)
    if (mRes === 'stage') {
      audio.mission()
      const curM = missions.current()
      if (curM) {
        hud.message(`[Objective] ${curM.text}`)
        hud.setObjective(curM.name, curM.text, missions.timeLeft)
      }
    } else if (mRes === 'done') {
      audio.mission()
      const curM = missions.current()
      if (curM) {
        gameState.money += curM.reward || 300
        gameState.completed.push(curM.id)
      }
      saveGame()
      gameState.state = 'missiondone'
      updateMenus()
    } else if (mRes === 'failed') {
      audio.fail()
      gameState.state = 'missionfailed'
      updateMenus()
    }

    if (missions.marker) {
      beacon.set(missions.marker.x, missions.marker.z)
      beacon.update(dt)
    } else {
      beacon.hide()
    }

    // Health check for wasted
    if (player.health <= 0 && gameState.state === 'playing') {
      gameState.state = 'wasted'
      audio.fail()
      updateMenus()
    }

    // Camera update
    const targetPos = gameState.inCar && gameState.car ? gameState.car.pos : player.pos
    const targetHeading = gameState.inCar && gameState.car ? gameState.car.heading : player.heading
    const speed01 = gameState.inCar && gameState.car ? Math.abs(gameState.car.speed) / gameState.car.maxSpeed : player.speed / 6.0
    camera.fov = gameState.inCar ? 66 : 62
    camera.updateProjectionMatrix()
    gameCamera.update(dt, targetPos, targetHeading, speed01, gameState.inCar)

    // HUD update
    hud.setWanted(police.wanted)
    hud.setCash(gameState.money)
    hud.setHealth(player.health)
    const kmh = gameState.inCar && gameState.car ? Math.round(Math.abs(gameState.car.speed) * 3.6) : Math.round(player.speed * 3.6)
    hud.setSpeed(kmh, gameState.inCar)
    const curM = missions.current()
    if (curM) {
      hud.setObjective(curM.name, curM.text, missions.timeLeft)
    }
    hud.update(dt)

    // Minimap view
    const streetSegments = []
    const halfSize = CITY.half
    for (const s of CITY.streets) {
      streetSegments.push({ x1: -halfSize, z1: s, x2: halfSize, z2: s })
      streetSegments.push({ x1: s, z1: -halfSize, x2: s, z2: halfSize })
    }

    hud.drawMinimap({
      playerX: targetPos.x,
      playerZ: targetPos.z,
      playerHeading: targetHeading,
      half: CITY.half,
      streets: streetSegments,
      cars: [...traffic, ...parked, ...police.cruisers],
      peds,
      marker: missions.marker,
      police: police.cruisers
    })

    // Audio update
    if (gameState.inCar && gameState.car) {
      audio.setEngine(Math.abs(gameState.car.speed) / gameState.car.maxSpeed, true)
    } else {
      audio.setEngine(player.speed / 6.0, false)
    }
    audio.setSiren(police.sirenOn)
  }

  audio.update(dt)

  // Render scene
  renderer.render(scene, camera)

  // End input frame
  input.beginFrame()
}

requestAnimationFrame(animate)
