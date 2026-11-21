import * as THREE from 'three';
import { makeRng, pick, clamp, dist2 } from './utils.js';

// Pedestrian simulation generating walking citizens with panic and flee behaviors
export function createPedestrians(scene, streets, seed) {
  const rng = makeRng(seed || 12345);
  const peds = [];

  const shirtColors = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xe84393];
  const skinColors = [0xffcc99, 0xd4a373, 0x8d5524, 0xffdbac, 0xf1c27d];
  const pantsColors = [0x222222, 0x333344, 0x444455, 0x111111];

  function spawnWalker(x, z, horizontal, streetVal, dir) {
    const group = new THREE.Group();
    group.castShadow = true;

    const sColor = pick(rng, shirtColors);
    const skinColor = pick(rng, skinColors);
    const pColor = pick(rng, pantsColors);

    const shirtMat = new THREE.MeshLambertMaterial({ color: sColor });
    const skinMat = new THREE.MeshLambertMaterial({ color: skinColor });
    const pantsMat = new THREE.MeshLambertMaterial({ color: pColor });

    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.25), shirtMat);
    torso.position.y = 0.8;
    torso.castShadow = true;
    group.add(torso);

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skinMat);
    head.position.y = 1.25;
    head.castShadow = true;
    group.add(head);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.15, 0.55, 0.18);
    const leftLeg = new THREE.Mesh(legGeo, pantsMat);
    leftLeg.position.set(-0.11, 0.27, 0);
    leftLeg.castShadow = true;
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, pantsMat);
    rightLeg.position.set(0.11, 0.27, 0);
    rightLeg.castShadow = true;
    group.add(rightLeg);

    scene.add(group);

    const heading = horizontal ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    group.position.set(x, 0, z);
    group.rotation.y = heading;

    peds.push({
      mesh: group,
      pos: new THREE.Vector3(x, 0, z),
      heading,
      speed: 1.2 + rng() * 0.9,
      horizontal,
      street: streetVal,
      dir,
      phase: rng() * Math.PI * 2,
      flee: 0,
      alive: true,
      walkDist: 0,
      leftLeg,
      rightLeg
    });
  }

  // 1. Create 28 walkers at random spots on sidewalks
  // Assume streets is an array of coordinate values (e.g. x or z lines) or we generate standard grid lines if streets is empty/missing
  const streetLines = (streets && streets.length > 0) ? streets : [-120, -70, -20, 30, 80, 130];

  for (let i = 0; i < 28; i++) {
    const horizontal = rng() > 0.5;
    const st1 = pick(rng, streetLines);
    // Sidewalk is about 8 to 10 metres off street line
    const offset = (rng() > 0.5 ? 1 : -1) * (8 + rng() * 2);
    const crossCoord = (rng() - 0.5) * 280;

    let x, z;
    if (horizontal) {
      x = crossCoord;
      z = st1 + offset;
    } else {
      x = st1 + offset;
      z = crossCoord;
    }
    const dir = rng() > 0.5 ? 1 : -1;
    spawnWalker(x, z, horizontal, st1, dir);
  }

  // 2. Create 8 more clustered near corner at (-118, 70) within 25m
  const cornerX = -118;
  const cornerZ = 70;
  for (let i = 0; i < 8; i++) {
    const horizontal = i % 2 === 0;
    const offsetX = (rng() - 0.5) * 25;
    const offsetZ = (rng() - 0.5) * 25;
    const x = clamp(cornerX + offsetX, -145, 145);
    const z = clamp(cornerZ + offsetZ, -145, 145);
    const dir = rng() > 0.5 ? 1 : -1;
    spawnWalker(x, z, horizontal, horizontal ? z : x, dir);
  }

  return peds;
}

export function updatePedestrians(peds, dt, threat) {
  for (const p of peds) {
    if (!p.alive) continue;

    let targetSpeed = p.speed;
    let moveHeading = p.heading;

    // Check threat (e.g. player driving fast or punching near pedestrian)
    if (threat) {
      const d2 = dist2(p.pos.x, p.pos.z, threat.x, threat.z);
      if (d2 < threat.radius * threat.radius) {
        p.flee = 2.5; // panic for 2.5s
      }
    }

    if (p.flee > 0) {
      p.flee -= dt;
      targetSpeed = 4.5;
      if (threat) {
        const dx = p.pos.x - threat.x;
        const dz = p.pos.z - threat.z;
        moveHeading = Math.atan2(dx, dz);
      }
    } else {
      moveHeading = p.horizontal ? (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (p.dir > 0 ? 0 : Math.PI);
    }

    p.heading = moveHeading;
    const step = targetSpeed * dt;
    p.pos.x += Math.sin(p.heading) * step;
    p.pos.z += Math.cos(p.heading) * step;
    p.walkDist += step;

    // Turn around at city edges (> 146 or < -146)
    if (p.horizontal) {
      if (p.pos.x > 146) { p.pos.x = 146; p.dir = -1; }
      else if (p.pos.x < -146) { p.pos.x = -146; p.dir = 1; }
    } else {
      if (p.pos.z > 146) { p.pos.z = 146; p.dir = -1; }
      else if (p.pos.z < -146) { p.pos.z = -146; p.dir = 1; }
    }

    p.pos.x = clamp(p.pos.x, -147, 147);
    p.pos.z = clamp(p.pos.z, -147, 147);

    // Leg swing animation
    const swing = Math.sin(p.walkDist * 12) * 0.4;
    p.leftLeg.rotation.x = swing;
    p.rightLeg.rotation.x = -swing;

    p.mesh.position.copy(p.pos);
    p.mesh.rotation.y = p.heading;
  }
}
