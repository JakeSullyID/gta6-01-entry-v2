import * as THREE from 'three';
import { circleVsAabb, angleDelta, clamp } from './utils.js';

// Low-poly player character with physics, collisions, animations, and punches
export function createPlayer(scene) {
  const group = new THREE.Group();
  group.castShadow = true;

  // Materials
  const shirtMat = new THREE.MeshLambertMaterial({ color: 0x3366cc });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xffcc99 });
  const hairMat = new THREE.MeshLambertMaterial({ color: 0x221100 });
  const pantsMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const fistMat = new THREE.MeshLambertMaterial({ color: 0xffaa88 });

  // Torso
  const torsoGeo = new THREE.BoxGeometry(0.5, 0.7, 0.3);
  const torso = new THREE.Mesh(torsoGeo, shirtMat);
  torso.position.y = 0.95;
  torso.castShadow = true;
  group.add(torso);

  // Head
  const headGeo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.y = 1.45;
  head.castShadow = true;
  group.add(head);

  // Hair
  const hairGeo = new THREE.BoxGeometry(0.37, 0.12, 0.37);
  const hair = new THREE.Mesh(hairGeo, hairMat);
  hair.position.y = 1.65;
  hair.castShadow = true;
  group.add(hair);

  // Limbs
  const legGeo = new THREE.BoxGeometry(0.18, 0.65, 0.2);
  const leftLeg = new THREE.Mesh(legGeo, pantsMat);
  leftLeg.position.set(-0.14, 0.32, 0);
  leftLeg.castShadow = true;
  group.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, pantsMat);
  rightLeg.position.set(0.14, 0.32, 0);
  rightLeg.castShadow = true;
  group.add(rightLeg);

  const armGeo = new THREE.BoxGeometry(0.16, 0.6, 0.18);
  const leftArm = new THREE.Mesh(armGeo, shirtMat);
  leftArm.position.set(-0.35, 0.95, 0);
  leftArm.castShadow = true;
  group.add(leftArm);

  const rightArm = new THREE.Mesh(armGeo, shirtMat);
  rightArm.position.set(0.35, 0.95, 0);
  rightArm.castShadow = true;
  group.add(rightArm);

  // Fist marker (visible when punching)
  const fistGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
  const fist = new THREE.Mesh(fistGeo, fistMat);
  fist.position.set(0.35, 0.8, 0.4);
  fist.visible = false;
  group.add(fist);

  scene.add(group);

  const player = {
    pos: new THREE.Vector3(0, 0, 0),
    heading: 0,
    speed: 0,
    health: 100,
    radius: 0.55,
    car: null,
    walkDist: 0,
    punchTimer: 0,
    punchCooldown: 0,
    mesh: group,

    reset(x, z, heading) {
      this.pos.set(x, 0, z);
      this.heading = heading || 0;
      this.speed = 0;
      this.health = 100;
      this.car = null;
      this.walkDist = 0;
      this.punchTimer = 0;
      this.punchCooldown = 0;
      this.mesh.visible = true;
      fist.visible = false;
    },

    update(dt, input, colliders, moveBasis) {
      if (this.car) {
        this.mesh.visible = false;
        return;
      }
      this.mesh.visible = true;

      // Timers
      if (this.punchTimer > 0) {
        this.punchTimer -= dt;
        fist.visible = true;
        if (this.punchTimer <= 0) {
          fist.visible = false;
        }
      }
      if (this.punchCooldown > 0) {
        this.punchCooldown -= dt;
      }

      // Input reading
      const fwd = input.isDown('KeyW') || input.isDown('ArrowUp');
      const back = input.isDown('KeyS') || input.isDown('ArrowDown');
      const left = input.isDown('KeyA') || input.isDown('ArrowLeft');
      const right = input.isDown('KeyD') || input.isDown('ArrowRight');
      const run = input.isDown('ShiftLeft') || input.isDown('ShiftRight');

      let moveX = 0;
      let moveZ = 0;
      if (fwd) { moveX += moveBasis.fwdX; moveZ += moveBasis.fwdZ; }
      if (back) { moveX -= moveBasis.fwdX; moveZ -= moveBasis.fwdZ; }
      if (left) { moveX += moveBasis.rightX; moveZ += moveBasis.rightZ; }
      if (right) { moveX -= moveBasis.rightX; moveZ -= moveBasis.rightZ; }

      const isMoving = moveX !== 0 || moveZ !== 0;
      const targetSpeed = isMoving ? (run ? 9.5 : 5.5) : 0;
      this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 10);

      if (isMoving) {
        const targetHeading = Math.atan2(moveX, moveZ);
        const delta = angleDelta(this.heading, targetHeading);
        this.heading += delta * Math.min(1, dt * 12);
      }

      if (this.speed > 0.1) {
        const step = this.speed * dt;
        this.pos.x += Math.sin(this.heading) * step;
        this.pos.z += Math.cos(this.heading) * step;
        this.walkDist += step;

        // Walk cycle animation
        const swing = Math.sin(this.walkDist * 10) * 0.4;
        leftLeg.rotation.x = swing;
        rightLeg.rotation.x = -swing;
        leftArm.rotation.x = -swing * 0.8;
        rightArm.rotation.x = swing * 0.8;
      } else {
        leftLeg.rotation.x = 0;
        rightLeg.rotation.x = 0;
        leftArm.rotation.x = 0;
        rightArm.rotation.x = 0;
      }

      // Collisions with buildings
      if (colliders) {
        for (const box of colliders) {
          const res = circleVsAabb(this.pos.x, this.pos.z, this.radius, box);
          if (res) {
            this.pos.x += res.nx * res.depth;
            this.pos.z += res.nz * res.depth;
          }
        }
      }

      // Clamp position to city bounds
      this.pos.x = clamp(this.pos.x, -148, 148);
      this.pos.z = clamp(this.pos.z, -148, 148);

      // Update mesh transform
      this.mesh.position.copy(this.pos);
      this.mesh.rotation.y = this.heading;
    },

    punch() {
      if (this.car || this.punchCooldown > 0) return false;
      this.punchTimer = 0.28;
      this.punchCooldown = 0.5;
      fist.visible = true;
      return true;
    }
  };

  return player;
}
