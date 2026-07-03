import * as THREE from 'three';
import { poseJumpscare } from '../world/animatronicRig.js';

// The lunge: the killer's rig is reparented into a camera-space scene and
// thrown at the lens with a synthesized scream and screen shake.

const DURATION = 0.85;

export function createJumpscare({ audio }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 20);
  const flash = new THREE.PointLight(0xfff0e0, 30, 12, 1.4);
  flash.position.set(0, 0.4, 1.2);
  scene.add(flash);

  let active = false;
  let t = 0;
  let rig = null;
  let onDone = null;

  return {
    scene,
    camera,
    get active() { return active; },

    trigger(targetRig, done) {
      if (active) return;
      active = true;
      t = 0;
      rig = targetRig;
      onDone = done;
      rig.group.removeFromParent();
      scene.add(rig.group);
      audio.sfx.scream();
      document.getElementById('gl').classList.add('shake');
    },

    frame(dt, renderer) {
      if (!active) return false;
      t += dt;
      const t01 = Math.min(t / DURATION, 1);
      const ease = 1 - Math.pow(1 - t01, 3);
      // lunge from the dark straight at the lens; head ends up filling the frame
      const scale = rig.anim.appearance.scale ?? 1;
      rig.group.position.set(
        Math.sin(t * 47) * 0.05 * t01,
        -1.35 - ease * 0.55 - (scale - 1) * 2.2,
        -3.6 + ease * 2.35,
      );
      rig.group.rotation.y = Math.sin(t * 31) * 0.06;
      poseJumpscare(rig, t01);
      flash.intensity = 18 + Math.sin(t * 90) * 14;
      camera.rotation.z = Math.sin(t * 71) * 0.03 * t01;
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      if (t >= DURATION + 0.35) {
        active = false;
        document.getElementById('gl').classList.remove('shake');
        onDone?.();
      }
      return true;
    },
  };
}
