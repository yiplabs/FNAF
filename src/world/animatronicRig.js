import * as THREE from 'three';

// Procedural animatronic bodies assembled from primitives around a named
// joint hierarchy. One rig per animatronic is reused everywhere: stage idle,
// camera feeds, free-roam walking and the jumpscare lunge — only poses change.

function hashId(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ENDO = new THREE.MeshStandardMaterial({ color: 0x23232b, metalness: 0.75, roughness: 0.35 });
const DARK = new THREE.MeshStandardMaterial({ color: 0x111116, roughness: 0.9 });

export function buildAnimatronicRig(anim) {
  const ap = anim.appearance;
  const scale = ap.scale ?? 1;
  const withered = ap.withered ?? 0;
  const rand = seededRand(hashId(anim.id));

  const dim = 1 - 0.4 * withered;
  const primary = new THREE.MeshStandardMaterial({
    color: new THREE.Color(ap.primaryColor).multiplyScalar(dim), roughness: 0.75,
  });
  const secondary = new THREE.MeshStandardMaterial({
    color: new THREE.Color(ap.secondaryColor).multiplyScalar(dim), roughness: 0.75,
  });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x0a0a0a,
    emissive: new THREE.Color(ap.eyeColor),
    emissiveIntensity: 0.4 + (ap.eyeGlow ?? 0.5) * 2.2,
  });

  // withered: some panels become exposed endoskeleton
  const witheredPanels = new Set();
  const panelNames = ['torso', 'armL', 'armR', 'legL', 'legR', 'earL', 'earR', 'snout'];
  const nWithered = Math.round(withered * 6);
  const shuffled = [...panelNames].sort(() => rand() - 0.5);
  for (let i = 0; i < Math.min(nWithered, shuffled.length); i++) witheredPanels.add(shuffled[i]);
  const matFor = (panel, base) => (witheredPanels.has(panel) ? ENDO : base);

  const group = new THREE.Group();
  group.name = `anim:${anim.id}`;
  const joints = {};

  const root = new THREE.Group();
  joints.root = root;
  group.add(root);

  // hips
  const hips = new THREE.Group();
  hips.position.y = 1.05;
  root.add(hips);
  joints.hips = hips;

  // torso
  const torsoJoint = new THREE.Group();
  hips.add(torsoJoint);
  joints.torso = torsoJoint;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.55, 6, 12), matFor('torso', primary));
  torso.position.y = 0.5;
  torsoJoint.add(torso);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), matFor('torso', secondary));
  belly.scale.set(1, 1.15, 0.62);
  belly.position.set(0, 0.42, 0.18);
  torsoJoint.add(belly);

  // head
  const neck = new THREE.Group();
  neck.position.y = 1.12;
  torsoJoint.add(neck);
  joints.head = neck;

  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 14), primary);
  headMesh.scale.set(1, 0.95, 0.95);
  headMesh.position.y = 0.28;
  neck.add(headMesh);

  // eyes (+ withered >= 0.7 unlids one: bigger, brighter, black socket ring)
  const unlid = withered >= 0.7;
  for (const side of [-1, 1]) {
    const isBad = unlid && side === 1;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(isBad ? 0.085 : 0.062, 10, 10), eyeMat);
    eye.position.set(side * 0.14, 0.32, 0.32);
    neck.add(eye);
    if (isBad) {
      const socket = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 6, 12), DARK);
      socket.position.copy(eye.position);
      neck.add(socket);
    }
  }

  // jaw (every base type gets one — it's what jumpscares are made of)
  const jaw = new THREE.Group();
  jaw.position.set(0, 0.13, 0.18);
  neck.add(jaw);
  joints.jaw = jaw;

  // ---- base-type head furniture ----
  const bt = ap.baseType;
  if (bt === 'bear' || bt === 'custom') {
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), matFor(side < 0 ? 'earL' : 'earR', primary));
      ear.position.set(side * 0.28, 0.62, 0);
      neck.add(ear);
      joints[side < 0 ? 'earL' : 'earR'] = ear;
    }
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), matFor('snout', secondary));
    snout.scale.set(1.15, 0.75, 0.9);
    snout.position.set(0, 0.2, 0.31);
    neck.add(snout);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), DARK);
    nose.position.set(0, 0.24, 0.46);
    neck.add(nose);
    const lowerJaw = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), matFor('snout', secondary));
    lowerJaw.scale.set(1.05, 0.5, 0.85);
    lowerJaw.position.set(0, -0.02, 0.14);
    jaw.add(lowerJaw);
  } else if (bt === 'bunny') {
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.55, 4, 8), matFor(side < 0 ? 'earL' : 'earR', primary));
      ear.position.set(side * 0.16, 0.85, 0);
      ear.rotation.z = -side * 0.12;
      neck.add(ear);
      const inner = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.4, 4, 6), secondary);
      inner.position.set(side * 0.16, 0.85, 0.045);
      inner.rotation.z = -side * 0.12;
      neck.add(inner);
      joints[side < 0 ? 'earL' : 'earR'] = ear;
    }
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), matFor('snout', secondary));
    snout.scale.set(1, 0.7, 0.85);
    snout.position.set(0, 0.18, 0.3);
    neck.add(snout);
    // buck teeth
    const teeth = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.03), new THREE.MeshStandardMaterial({ color: 0xe8e8dc }));
    teeth.position.set(0, 0.07, 0.36);
    neck.add(teeth);
    const lowerJaw = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), matFor('snout', secondary));
    lowerJaw.scale.set(0.95, 0.5, 0.8);
    lowerJaw.position.set(0, -0.02, 0.13);
    jaw.add(lowerJaw);
  } else if (bt === 'chicken') {
    const beakTop = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.22, 4), new THREE.MeshStandardMaterial({ color: 0xe0a03a, roughness: 0.6 }));
    beakTop.rotation.x = Math.PI / 2;
    beakTop.rotation.y = Math.PI / 4;
    beakTop.position.set(0, 0.2, 0.42);
    neck.add(beakTop);
    const beakBottom = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.16, 4), new THREE.MeshStandardMaterial({ color: 0xc88f2f, roughness: 0.6 }));
    beakBottom.rotation.x = -Math.PI / 2;
    beakBottom.rotation.y = Math.PI / 4;
    beakBottom.position.set(0, 0.02, 0.36);
    jaw.add(beakBottom);
    // head tuft
    for (let i = 0; i < 3; i++) {
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.22, 6), matFor('earL', primary));
      tuft.position.set((i - 1) * 0.08, 0.66, 0);
      tuft.rotation.z = (i - 1) * -0.35;
      neck.add(tuft);
    }
    // bib
    const bib = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.06), secondary);
    bib.position.set(0, 0.72, 0.34);
    torsoJoint.add(bib);
  } else if (bt === 'fox') {
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.28, 4), matFor(side < 0 ? 'earL' : 'earR', primary));
      ear.position.set(side * 0.24, 0.66, 0);
      ear.rotation.y = Math.PI / 4;
      neck.add(ear);
      joints[side < 0 ? 'earL' : 'earR'] = ear;
    }
    const snout = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.42, 8), matFor('snout', secondary));
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, 0.18, 0.42);
    neck.add(snout);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), DARK);
    nose.position.set(0, 0.2, 0.62);
    neck.add(nose);
    // hinged long lower jaw with teeth
    const lowerJaw = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.4), matFor('snout', secondary));
    lowerJaw.position.set(0, -0.03, 0.28);
    jaw.add(lowerJaw);
    for (let i = 0; i < 4; i++) {
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.06, 4), new THREE.MeshStandardMaterial({ color: 0xe8e8dc }));
      tooth.position.set((i % 2 ? -1 : 1) * 0.05, 0.02, 0.14 + Math.floor(i / 2) * 0.16);
      lowerJaw.add(tooth);
    }
  }

  // ---- limbs ----
  for (const side of [-1, 1]) {
    const key = side < 0 ? 'L' : 'R';
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.5, 0.95, 0);
    torsoJoint.add(shoulder);
    joints[`arm${key}`] = shoulder;
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.35, 4, 8), matFor(`arm${key}`, primary));
    upper.position.y = -0.22;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.45;
    shoulder.add(elbow);
    joints[`forearm${key}`] = elbow;
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.3, 4, 8), matFor(`arm${key}`, primary));
    fore.position.y = -0.18;
    elbow.add(fore);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), matFor(`arm${key}`, secondary));
    hand.position.y = -0.4;
    hand.name = `hand${key}`;
    elbow.add(hand);

    const hip = new THREE.Group();
    hip.position.set(side * 0.2, 0, 0);
    hips.add(hip);
    joints[`leg${key}`] = hip;
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.35, 4, 8), matFor(`leg${key}`, primary));
    thigh.position.y = -0.25;
    hip.add(thigh);
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.3, 4, 8), matFor(`leg${key}`, primary));
    shin.position.y = -0.68;
    hip.add(shin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.32), matFor(`leg${key}`, secondary));
    foot.position.set(0, -1.0, 0.06);
    hip.add(foot);
  }

  // ---- accessories ----
  const acc = new Set(ap.accessories || []);
  if (acc.has('hat')) {
    const hat = new THREE.Group();
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.03, 14), DARK);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.17, 0.22, 14), DARK);
    top.position.y = 0.12;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.05, 14),
      new THREE.MeshStandardMaterial({ color: 0xc0392b }));
    band.position.y = 0.045;
    hat.add(brim, top, band);
    hat.position.set(0, 0.66, 0);
    hat.rotation.z = 0.06;
    neck.add(hat);
  }
  if (acc.has('bowtie')) {
    const tieMat = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.6 });
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), tieMat);
    knot.position.set(0, 1.02, 0.38);
    torsoJoint.add(knot);
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.14, 4), tieMat);
      wing.rotation.z = side * Math.PI / 2;
      wing.position.set(side * 0.1, 1.02, 0.38);
      torsoJoint.add(wing);
    }
  }
  if (acc.has('hook')) {
    const hand = group.getObjectByName('handR');
    if (hand) {
      hand.visible = false;
      const hook = new THREE.Mesh(
        new THREE.TorusGeometry(0.09, 0.028, 8, 12, Math.PI * 1.4),
        new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.9, roughness: 0.25 }),
      );
      hook.position.copy(hand.position);
      hook.rotation.z = -0.5;
      hand.parent.add(hook);
    }
  }
  if (acc.has('guitar')) {
    const guitar = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xa03030, roughness: 0.5 });
    const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.09, 14), bodyMat);
    b1.rotation.x = Math.PI / 2;
    const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.09, 14), bodyMat);
    b2.rotation.x = Math.PI / 2;
    b2.position.y = 0.24;
    const gNeck = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.62, 0.04), DARK);
    gNeck.position.y = 0.6;
    guitar.add(b1, b2, gNeck);
    guitar.position.set(0.25, 0.35, 0.42);
    guitar.rotation.z = -0.5;
    torsoJoint.add(guitar);
  }
  if (acc.has('cupcake')) {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 12),
      new THREE.MeshStandardMaterial({ color: 0xd8d8e0 }));
    const cake = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.12, 12),
      new THREE.MeshStandardMaterial({ color: 0xe07ba0 }));
    cake.position.y = 0.08;
    const cakeEye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), eyeMat);
    cakeEye.position.set(0.04, 0.14, 0.07);
    const cakeEye2 = cakeEye.clone();
    cakeEye2.position.x = -0.04;
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 6),
      new THREE.MeshStandardMaterial({ color: 0xf0e6c8 }));
    candle.position.y = 0.2;
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6),
      new THREE.MeshStandardMaterial({ color: 0xffa020, emissive: 0xffa020, emissiveIntensity: 2 }));
    flame.position.y = 0.28;
    plate.add(cake, cakeEye, cakeEye2, candle, flame);
    const hand = group.getObjectByName('handL');
    if (hand) {
      plate.position.copy(hand.position).add(new THREE.Vector3(0, 0.08, 0));
      hand.parent.add(plate);
    }
  }
  if (acc.has('eyepatch')) {
    const patch = new THREE.Mesh(new THREE.CircleGeometry(0.085, 10), DARK);
    patch.position.set(0.14, 0.335, 0.375);
    patch.rotation.x = -0.15;
    neck.add(patch);
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.012, 4, 20), DARK);
    strap.rotation.x = Math.PI / 2 - 0.35;
    strap.position.y = 0.36;
    neck.add(strap);
  }

  // withered wires sprouting from broken panels
  if (withered > 0.15) {
    const wireMat = new THREE.MeshStandardMaterial({ color: 0x3a3a44, metalness: 0.4, roughness: 0.6 });
    const nWires = 2 + Math.round(withered * 3);
    for (let i = 0; i < nWires; i++) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3((rand() - 0.5) * 0.2, 0.1 + rand() * 0.1, (rand() - 0.5) * 0.2),
        new THREE.Vector3((rand() - 0.5) * 0.35, 0.05 + rand() * 0.2, (rand() - 0.5) * 0.35),
      ]);
      const wire = new THREE.Mesh(new THREE.TubeGeometry(curve, 6, 0.012, 5), wireMat);
      const spots = [
        [0.3, 1.4, 0.15], [-0.35, 1.5, 0.1], [0.2, 2.15, 0.2], [-0.15, 0.6, 0.15], [0.4, 0.9, -0.1],
      ];
      const [sx, sy, sz] = spots[i % spots.length];
      wire.position.set(sx, sy, sz);
      root.add(wire);
    }
  }

  root.scale.setScalar(scale);

  return { group, joints, anim, feetOffset: 0 };
}

// ---------- poses (write joint rotations from a clock; no state) ----------

export function poseIdle(rig, t) {
  const j = rig.joints;
  const ph = hashId(rig.anim.id) % 100 / 100 * Math.PI * 2;
  j.torso.rotation.z = Math.sin(t * 0.7 + ph) * 0.03;
  j.torso.rotation.x = 0;
  j.hips.position.y = 1.05;
  j.head.rotation.y = Math.sin(t * 0.4 + ph) * 0.25 + (Math.sin(t * 3.1 + ph) > 0.97 ? 0.5 : 0);
  j.head.rotation.x = Math.sin(t * 0.9 + ph) * 0.05;
  j.head.rotation.z = 0;
  j.jaw.rotation.x = 0.08 + Math.sin(t * 0.5 + ph) * 0.04;
  j.armL.rotation.x = Math.sin(t * 0.7 + ph) * 0.06;
  j.armR.rotation.x = -Math.sin(t * 0.7 + ph) * 0.06;
  j.armL.rotation.z = 0.12;
  j.armR.rotation.z = -0.12;
  j.forearmL.rotation.x = -0.15;
  j.forearmR.rotation.x = -0.15;
  j.legL.rotation.x = 0;
  j.legR.rotation.x = 0;
}

export function poseWalk(rig, t, speed = 1) {
  const j = rig.joints;
  const w = t * 5.2 * speed;
  j.hips.position.y = 1.05 + Math.abs(Math.sin(w)) * 0.06;
  j.torso.rotation.x = 0.08;
  j.torso.rotation.z = Math.sin(w) * 0.05;
  j.legL.rotation.x = Math.sin(w) * 0.55;
  j.legR.rotation.x = -Math.sin(w) * 0.55;
  j.armL.rotation.x = -Math.sin(w) * 0.4;
  j.armR.rotation.x = Math.sin(w) * 0.4;
  j.armL.rotation.z = 0.1;
  j.armR.rotation.z = -0.1;
  j.forearmL.rotation.x = -0.3;
  j.forearmR.rotation.x = -0.3;
  j.head.rotation.y = Math.sin(w * 0.5) * 0.1;
  j.jaw.rotation.x = 0.05;
}

// dead-eyed stare at the security camera
export function poseStare(rig, t, yawToCamera = 0) {
  const j = rig.joints;
  const ph = hashId(rig.anim.id) % 100 / 100 * Math.PI * 2;
  j.torso.rotation.x = 0.02;
  j.torso.rotation.z = 0;
  j.hips.position.y = 1.05;
  const twitch = Math.sin(t * 8 + ph) > 0.985 ? (Math.sin(t * 41) * 0.2) : 0;
  j.head.rotation.y = yawToCamera + twitch;
  j.head.rotation.x = -0.12;
  j.head.rotation.z = twitch * 0.5;
  j.jaw.rotation.x = 0.16;
  j.armL.rotation.x = 0;
  j.armR.rotation.x = 0;
  j.armL.rotation.z = 0.05;
  j.armR.rotation.z = -0.05;
  j.forearmL.rotation.x = 0;
  j.forearmR.rotation.x = 0;
  j.legL.rotation.x = 0;
  j.legR.rotation.x = 0;
}

// t01: 0 = lunge start, 1 = impact
export function poseJumpscare(rig, t01) {
  const j = rig.joints;
  const shake = (f) => Math.sin(t01 * 60 * f) * 0.26 * t01;
  j.torso.rotation.x = -0.15;
  j.head.rotation.x = -0.2 + shake(1.3) * 0.4;
  j.head.rotation.y = shake(1.7);
  j.head.rotation.z = shake(0.9);
  j.jaw.rotation.x = 0.25 + t01 * 0.65 + Math.abs(Math.sin(t01 * 34)) * 0.25;
  j.armL.rotation.x = -2.4 + shake(1.1);
  j.armR.rotation.x = -2.4 - shake(1.4);
  j.armL.rotation.z = 0.5 + shake(0.8);
  j.armR.rotation.z = -0.5 - shake(1.2);
  j.forearmL.rotation.x = -0.4;
  j.forearmR.rotation.x = -0.4;
}
