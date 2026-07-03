import * as THREE from 'three';
import { PURPLE } from '../data/schemas.js';

// Simple humanoid for the player and the friend. applyPurpleness() lerps the
// friend's skin/uniform toward Purple Guy purple as the story advances.

function skinColor(tone) {
  // 0 = deep brown .. 1 = pale
  return new THREE.Color().lerpColors(
    new THREE.Color(0x5a3a26),
    new THREE.Color(0xf0c8a8),
    Math.max(0, Math.min(1, tone)),
  );
}

export function buildCharacterRig(char) {
  const group = new THREE.Group();
  group.name = `char:${char.role}`;

  const base = {
    skin: skinColor(char.skinTone),
    uniform: new THREE.Color(char.uniformColor),
    hair: new THREE.Color(char.hairColor),
    eye: new THREE.Color(0x2a2a30),
  };

  const skinMat = new THREE.MeshStandardMaterial({ color: base.skin.clone(), roughness: 0.7 });
  const uniformMat = new THREE.MeshStandardMaterial({ color: base.uniform.clone(), roughness: 0.85 });
  const hairMat = new THREE.MeshStandardMaterial({ color: base.hair.clone(), roughness: 0.9 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x22222c, roughness: 0.9 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: base.eye.clone(), emissive: 0x000000, emissiveIntensity: 0 });

  const joints = {};
  const root = new THREE.Group();
  group.add(root);
  joints.root = root;

  const hips = new THREE.Group();
  hips.position.y = 0.95;
  root.add(hips);
  joints.hips = hips;

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.5, 6, 10), uniformMat);
  torso.position.y = 0.42;
  hips.add(torso);

  // collar
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.08, 10), uniformMat);
  collar.position.y = 0.78;
  hips.add(collar);

  const neck = new THREE.Group();
  neck.position.y = 0.85;
  hips.add(neck);
  joints.head = neck;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 12), skinMat);
  head.scale.set(0.92, 1.05, 0.95);
  head.position.y = 0.2;
  neck.add(head);

  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), eyeMat);
    eye.position.set(side * 0.07, 0.23, 0.165);
    neck.add(eye);
  }
  // simple smile line
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 4, 10, Math.PI * 0.7), new THREE.MeshStandardMaterial({ color: 0x70382a }));
  mouth.position.set(0, 0.15, 0.17);
  mouth.rotation.x = 0.3;
  mouth.rotation.z = Math.PI + Math.PI * 0.15;
  neck.add(mouth);

  // hair
  if (char.hairStyle !== 'bald') {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
    cap.position.y = 0.24;
    cap.scale.set(0.95, 1, 0.98);
    neck.add(cap);
    if (char.hairStyle === 'long') {
      const back = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.22, 4, 8), hairMat);
      back.position.set(0, 0.06, -0.12);
      neck.add(back);
    } else if (char.hairStyle === 'ponytail') {
      const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.28, 4, 8), hairMat);
      tail.position.set(0, 0.12, -0.22);
      tail.rotation.x = 0.5;
      neck.add(tail);
    }
  }

  // hat (security cap)
  if (char.hatOn) {
    const hatMat = new THREE.MeshStandardMaterial({ color: char.hatColor, roughness: 0.8 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.185, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), hatMat);
    dome.position.y = 0.3;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 12, 1, false, 0, Math.PI), hatMat);
    brim.position.set(0, 0.31, 0.13);
    brim.rotation.y = Math.PI / 2;
    brim.scale.set(1, 1, 1.4);
    neck.add(dome, brim);
  }

  // limbs
  for (const side of [-1, 1]) {
    const key = side < 0 ? 'L' : 'R';
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.32, 0.68, 0);
    hips.add(shoulder);
    joints[`arm${key}`] = shoulder;
    const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.25, 4, 8), uniformMat);
    sleeve.position.y = -0.16;
    shoulder.add(sleeve);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.24, 4, 8), skinMat);
    fore.position.y = -0.48;
    shoulder.add(fore);

    const hip = new THREE.Group();
    hip.position.set(side * 0.13, 0, 0);
    hips.add(hip);
    joints[`leg${key}`] = hip;
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.6, 4, 8), pantsMat);
    leg.position.y = -0.42;
    hip.add(leg);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.26), new THREE.MeshStandardMaterial({ color: 0x1a1a1e }));
    shoe.position.set(0, -0.9, 0.05);
    hip.add(shoe);
  }

  // accessory
  if (char.accessory === 'badge') {
    const badge = new THREE.Mesh(new THREE.CircleGeometry(0.035, 6),
      new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.8, roughness: 0.3 }));
    badge.position.set(-0.12, 0.62, 0.255);
    hips.add(badge);
  } else if (char.accessory === 'flashlight') {
    const light = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.16, 8),
      new THREE.MeshStandardMaterial({ color: 0x555560, metalness: 0.7 }));
    light.position.set(0.34, -0.05, 0.08);
    light.rotation.x = 1.2;
    hips.add(light);
  }

  const rig = {
    group,
    joints,
    char,
    materials: { skinMat, uniformMat, eyeMat },
    baseColors: base,
    purpleness: 0,
  };
  return rig;
}

export function applyPurpleness(rig, p) {
  rig.purpleness = p;
  const purple = new THREE.Color(PURPLE);
  const darkPurple = new THREE.Color(PURPLE).multiplyScalar(0.55);
  rig.materials.skinMat.color.lerpColors(rig.baseColors.skin, purple, p);
  rig.materials.uniformMat.color.lerpColors(rig.baseColors.uniform, darkPurple, p * 0.85);
  // eyes go white and start to glow
  rig.materials.eyeMat.emissive.setRGB(p, p, p);
  rig.materials.eyeMat.emissiveIntensity = p * 1.6;
}

export function poseCharacterIdle(rig, t, ph = 0) {
  const j = rig.joints;
  j.hips.position.y = 0.95 + Math.sin(t * 1.1 + ph) * 0.008;
  j.head.rotation.y = Math.sin(t * 0.5 + ph) * 0.15;
  j.head.rotation.x = Math.sin(t * 0.8 + ph) * 0.04;
  j.armL.rotation.x = Math.sin(t * 1.1 + ph) * 0.05;
  j.armR.rotation.x = -Math.sin(t * 1.1 + ph) * 0.05;
  j.armL.rotation.z = 0.08;
  j.armR.rotation.z = -0.08;
}

// the friend's "something is wrong" stance as purpleness rises
export function poseCharacterOminous(rig, t, p) {
  const j = rig.joints;
  poseCharacterIdle(rig, t * (1 - p * 0.7));
  j.head.rotation.x = 0.18 * p; // head tilts down, eyes up
  j.head.rotation.z = 0.12 * p;
  j.armL.rotation.z = 0.08 - p * 0.06;
  j.armR.rotation.z = -0.08 + p * 0.06;
}
