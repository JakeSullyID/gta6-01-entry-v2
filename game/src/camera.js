import * as THREE from 'three';
import { damp, wrapAngle } from './utils.js';

// Dynamic third-person follow camera supporting mouse orbit and smooth damping
export function createCamera(camera, input) {
  const api = {
    yaw: 0,
    pitch: 0.32,
    distance: 9,
    currentPos: new THREE.Vector3(),
    currentLook: new THREE.Vector3(),

    update(dt, targetPos, targetHeading, speed01, inCar) {
      // Mouse drag orbiting
      if (input.dragging) {
        const sens = 0.005;
        this.yaw -= input.orbitX * sens;
        this.pitch = Math.max(0.08, Math.min(1.1, this.pitch + input.orbitY * sens));
      } else {
        // Ease yaw back to target heading
        const idealYaw = inCar ? targetHeading : targetHeading + Math.PI;
        const diff = wrapAngle(idealYaw - this.yaw);
        this.yaw += diff * Math.min(1, dt * 4);
      }

      input.orbitX = 0;
      input.orbitY = 0;

      // Distances & heights
      const targetDist = inCar ? 10.5 + speed01 * 1.5 : 8.0;
      const targetHeight = inCar ? 4.2 + speed01 * 0.5 : 3.4;
      this.distance = damp(this.distance, targetDist, 6, dt);

      // Camera heading offset
      // Car drives along -sin/-cos of heading (so dropping +PI puts camera behind)
      // Player walks along +sin/+cos of heading (so +PI puts camera behind)
      const baseHeading = inCar ? targetHeading : targetHeading + Math.PI;
      const totalYaw = baseHeading + this.yaw;

      const pitchLift = Math.sin(this.pitch) * this.distance;
      const planarDist = Math.cos(this.pitch) * this.distance;

      const offsetX = -Math.sin(totalYaw) * planarDist;
      const offsetZ = -Math.cos(totalYaw) * planarDist;

      const desiredX = targetPos.x + offsetX;
      const desiredZ = targetPos.z + offsetZ;
      const desiredY = Math.max(1.2, targetPos.y + targetHeight + pitchLift * 0.5);

      const targetCamPos = new THREE.Vector3(desiredX, desiredY, desiredZ);
      this.currentPos.lerp(targetCamPos, 1 - Math.exp(-14 * dt));
      camera.position.copy(this.currentPos);

      // Look at point
      const lookX = targetPos.x + (inCar ? Math.sin(targetHeading) * 3 : 0);
      const lookZ = targetPos.z + (inCar ? Math.cos(targetHeading) * 3 : 0);
      const lookY = targetPos.y + (inCar ? 1.5 : 1.2);
      const targetLook = new THREE.Vector3(lookX, lookY, lookZ);

      this.currentLook.lerp(targetLook, 1 - Math.exp(-16 * dt));
      camera.lookAt(this.currentLook);
    },

    snap(targetPos, targetHeading, inCar) {
      this.yaw = 0;
      this.pitch = 0.32;
      const targetDist = inCar ? 10.5 : 8.0;
      const targetHeight = inCar ? 4.2 : 3.4;
      this.distance = targetDist;

      const baseHeading = inCar ? targetHeading : targetHeading + Math.PI;
      const planarDist = Math.cos(this.pitch) * this.distance;
      const pitchLift = Math.sin(this.pitch) * this.distance;

      const offsetX = -Math.sin(baseHeading) * planarDist;
      const offsetZ = -Math.cos(baseHeading) * planarDist;

      const desiredX = targetPos.x + offsetX;
      const desiredZ = targetPos.z + offsetZ;
      const desiredY = Math.max(1.2, targetPos.y + targetHeight + pitchLift * 0.5);

      this.currentPos.set(desiredX, desiredY, desiredZ);
      camera.position.copy(this.currentPos);

      const lookX = targetPos.x + (inCar ? Math.sin(targetHeading) * 3 : 0);
      const lookZ = targetPos.z + (inCar ? Math.cos(targetHeading) * 3 : 0);
      const lookY = targetPos.y + (inCar ? 1.5 : 1.2);
      this.currentLook.set(lookX, lookY, lookZ);
      camera.lookAt(this.currentLook);
    },

    resetOrbit() {
      this.yaw = 0;
      this.pitch = 0.32;
    }
  };

  return api;
}
