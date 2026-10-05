import * as THREE from 'three';
import { toonUnique, toon, part, sphereGeo, Mat } from './toon.js';
import { addFace, Blinker } from './face.js';

const S = (r) => sphereGeo(1, 28, 18);

// Chibi hero with outfit hooks. Returns a Group; group.userData.hero is the animation/outfit API.
export function buildHero(opts = {}) {
  const root = new THREE.Group();
  const rig = new THREE.Group(); root.add(rig);        // squash & stretch around the feet
  const mats = {
    skin: toonUnique('#ffd9bd', { rim: 0.25, rimColor: '#ffd0c0' }),
    shirt: toonUnique('#ff7a7a'),
    pants: toonUnique('#5b86ff'),
    hair: toonUnique('#6b4429', { rim: 0.5, rimColor: '#ffd9a8' }),
    shoe: toonUnique('#fff4e6'),
    pack: toonUnique('#ffc94d'),
    hatA: toonUnique('#ff5d73'), hatB: toonUnique('#fff2c9'),
  };

  // legs (pivot at hip)
  const legs = [-1, 1].map(sx => {
    const g = new THREE.Group(); g.position.set(sx * 0.19, 0.62, 0); rig.add(g);
    part(g, new THREE.CapsuleGeometry(0.15, 0.22, 6, 12), mats.pants, { pos: [0, -0.22, 0] });
    part(g, S(), mats.shoe, { pos: [0, -0.5, 0.07], scale: [0.2, 0.14, 0.3] });
    return g;
  });

  // torso
  const torso = new THREE.Group(); torso.position.y = 0.95; rig.add(torso);
  const shirtMesh = part(torso, new THREE.CapsuleGeometry(0.36, 0.2, 8, 18), mats.shirt, { pos: [0, 0.02, 0], scale: [1, 1, 0.92] });
  part(torso, S(), mats.pants, { pos: [0, -0.28, 0], scale: [0.36, 0.14, 0.33], line: 0 }); // belt/short hem hint
  const pack = part(torso, new THREE.CapsuleGeometry(0.2, 0.14, 6, 12), mats.pack, { pos: [0, 0.04, -0.37], scale: [1, 1, 0.8] });
  // arms (pivot at shoulder)
  const arms = [-1, 1].map(sx => {
    const g = new THREE.Group(); g.position.set(sx * 0.45, 0.25, 0); torso.add(g);
    part(g, new THREE.CapsuleGeometry(0.1, 0.22, 6, 10), mats.shirt, { pos: [0, -0.18, 0] });
    part(g, S(), mats.skin, { pos: [0, -0.42, 0], scale: [0.115, 0.115, 0.115] });
    return g;
  });

  // head
  const head = new THREE.Group(); head.position.set(0, 1.3, 0); rig.add(head);
  const headC = [0, 0.52, 0], HR = 0.62;
  part(head, S(), mats.skin, { pos: headC, scale: [HR * 1.04, HR, HR] });
  for (const sx of [-1, 1]) part(head, S(), mats.skin, { pos: [sx * 0.63, 0.46, 0], scale: [0.09, 0.12, 0.09], line: 0.02 });
  const face = addFace(head, [HR * 1.04, HR, HR], headC, { ex: 0.36, ey: 0.0, size: 0.085, tongue: false });
  // hair: cap + back + fringe + ahoge
  const hair = new THREE.Group(); head.add(hair);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.46), mats.hair);
  cap.scale.set(HR * 1.1, HR * 1.1, HR * 1.1); cap.position.set(0, 0.53, -0.04); cap.rotation.x = -0.12; cap.castShadow = true; hair.add(cap);
  part(hair, S(), mats.hair, { pos: [0, 0.5, -0.2], scale: [0.62, 0.6, 0.5], line: 0.03 });
  for (const [x, y, z, sx, sy, r] of [[-0.3, 1.02, 0.46, 0.24, 0.17, 0.5], [0.0, 1.06, 0.5, 0.24, 0.17, 0], [0.3, 1.02, 0.46, 0.24, 0.17, -0.5]])
    part(hair, S(), mats.hair, { pos: [x, y - 0.05, z], scale: [sx, sy, 0.13], rot: [0.5, 0, r], line: 0.02 });
  const ahoge = new THREE.Group(); ahoge.position.set(0.05, 1.1, 0.1); hair.add(ahoge);
  part(ahoge, new THREE.CapsuleGeometry(0.035, 0.22, 4, 8), mats.hair, { pos: [0, 0.12, 0], rot: [0, 0, -0.35], line: 0.02 });
  part(ahoge, S(), mats.hair, { pos: [-0.07, 0.3, 0], scale: [0.07, 0.07, 0.07], line: 0.015 });

  // hats
  const hats = {};
  const hatRoot = new THREE.Group(); hatRoot.position.set(0, 1.1, 0); head.add(hatRoot);
  { // cap
    const g = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), mats.hatA);
    dome.scale.set(0.66, 0.5, 0.68); dome.position.set(0, -0.28, -0.02); dome.rotation.x = -0.12; dome.castShadow = true; g.add(dome);
    part(g, new THREE.CylinderGeometry(0.34, 0.34, 0.05, 20, 1, false, -Math.PI / 2, Math.PI), mats.hatA, { pos: [0, -0.28, 0.5], scale: [1, 1, 0.8], rot: [0.12, 0, 0], line: 0.02 });
    part(g, S(), mats.hatB, { pos: [0, 0.05, -0.02], scale: [0.07, 0.07, 0.07], line: 0.015 });
    hats.cap = g;
  }
  { // straw hat
    const g = new THREE.Group();
    part(g, new THREE.CylinderGeometry(0.95, 1.0, 0.06, 32), toon('#f4d27a'), { pos: [0, -0.3, 0], scale: [0.72, 1, 0.72], line: 0.02 });
    part(g, new THREE.SphereGeometry(0.4, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), toon('#f4d27a'), { pos: [0, -0.3, 0], scale: [1, 0.95, 1], line: 0.03 });
    part(g, new THREE.CylinderGeometry(0.41, 0.42, 0.08, 24), toon('#ff7a8a'), { pos: [0, -0.24, 0], line: 0.02 });
    hats.straw = g;
  }
  { // beanie
    const g = new THREE.Group();
    const bm = toon('#6fd0c5');
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), bm);
    dome.scale.set(0.66, 0.6, 0.66); dome.position.set(0, -0.32, -0.02); dome.castShadow = true; g.add(dome);
    part(g, new THREE.TorusGeometry(0.58, 0.1, 10, 28), toon('#fff2c9'), { pos: [0, -0.3, -0.02], rot: [Math.PI / 2 - 0.1, 0, 0], line: 0.02 });
    part(g, S(), toon('#fff2c9'), { pos: [0, 0.28, -0.02], scale: [0.14, 0.14, 0.14], line: 0.02 });
    hats.beanie = g;
  }
  { // flower crown
    const g = new THREE.Group();
    part(g, new THREE.TorusGeometry(0.6, 0.05, 8, 28), toon('#6cc15a'), { pos: [0, -0.3, -0.02], rot: [Math.PI / 2 - 0.12, 0, 0], line: 0.015 });
    const cols = ['#ff8fb3', '#fff27a', '#ffffff', '#b99bff', '#ff8fb3', '#fff27a', '#ffffff', '#b99bff'];
    cols.forEach((c, i) => {
      const a = (i / cols.length) * Math.PI * 2 + 0.4;
      part(g, S(), toon(c), { pos: [Math.sin(a) * 0.6, -0.28 + Math.cos(a) * 0.07, Math.cos(a) * 0.6 - 0.02], scale: [0.1, 0.1, 0.1], line: 0.015 });
    });
    hats.flower = g;
  }
  { // crown
    const g = new THREE.Group(); const gm = toon('#ffd54a', { emissive: '#ffb300', ei: 0.25 });
    part(g, new THREE.CylinderGeometry(0.4, 0.34, 0.2, 5, 1, true), gm, { pos: [0, -0.2, 0], line: 0.02 }).material = gm;
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; part(g, new THREE.ConeGeometry(0.08, 0.2, 6), gm, { pos: [Math.sin(a) * 0.38, -0.03, Math.cos(a) * 0.38], line: 0.015 }); }
    hats.crown = g;
  }
  for (const k in hats) { hats[k].visible = false; hatRoot.add(hats[k]); }

  // blob shadow
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.62, 20).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#1d2b12', transparent: true, opacity: 0.28, depthWrite: false }));
  blob.position.y = 0.06; blob.renderOrder = 1; root.add(blob);

  root.traverse(o => { if (o.isMesh && !o.userData.isOutline) o.castShadow = true; });

  // ------- animation state -------
  const blinker = new Blinker(face);
  const st = { phase: 0, sy: 1, svy: 0, t: 0, lean: 0, wasGround: true, idle: 0, wave: 0, foot: 0, headYaw: 0 };
  const hero = {
    root, mats, hats, head, torso, arms, legs, face,
    setOutfit(o = {}) {
      if (o.hat !== undefined) for (const k in hats) hats[k].visible = k === o.hat;
      if (o.shirt) mats.shirt.color.set(o.shirt);
      if (o.pants) mats.pants.color.set(o.pants);
      if (o.hair) mats.hair.color.set(o.hair);
      if (o.skin) mats.skin.color.set(o.skin);
      if (o.pack) mats.pack.color.set(o.pack);
      if (o.backpack !== undefined) pack.visible = !!o.backpack;
      return this;
    },
    hatNames: Object.keys(hats),
    // state: { speed, grounded, vy, onFoot(cb) , lookYaw }
    update(dt, s) {
      st.t += dt; const t = st.t;
      const run = THREE.MathUtils.clamp((s.speed - 6) / 5, 0, 1), mv = THREE.MathUtils.clamp(s.speed / 6.5, 0, 1);
      const air = !s.grounded;
      st.phase += dt * s.speed * 1.5;
      const sw = Math.sin(st.phase), amp = mv * (0.75 + run * 0.45);
      // landing / takeoff events
      if (air && st.wasGround) { st.sy = 0.78; st.svy = 6; }
      if (!air && !st.wasGround) { st.sy = Math.max(0.6, 0.9 - Math.min(1, -s.landVy / 20) * 0.35); st.svy = 0; s.onLand && s.onLand(Math.min(1, -s.landVy / 15)); }
      st.wasGround = !air;
      // spring on vertical scale
      const target = air ? 1 + Math.min(0.2, Math.abs(s.vy) * 0.015) : 1 + Math.sin(t * 2.2) * 0.018 * (1 - mv);
      st.svy += ((target - st.sy) * 260 - st.svy * 15) * dt; st.sy += st.svy * dt;
      const sxz = 1 / Math.sqrt(st.sy);
      rig.scale.set(sxz, st.sy, sxz);
      // bounce while walking
      const bounce = air ? 0 : Math.abs(sw) * 0.09 * amp;
      torso.position.y = 0.95 + bounce * 0.5; head.position.y = 1.3 + bounce;
      // footfalls
      const f = Math.sign(sw);
      if (!air && mv > 0.3 && f !== st.foot) { st.foot = f; s.onFoot && s.onFoot(f, run); } else if (mv <= 0.3) st.foot = 0;
      // legs
      for (let i = 0; i < 2; i++) {
        const side = i ? -1 : 1; const l = legs[i];
        if (air) { l.rotation.x = THREE.MathUtils.lerp(l.rotation.x, side * (s.vy > 0 ? 0.5 : 0.8), dt * 14); l.position.y = 0.62 + 0.05; }
        else { l.rotation.x = THREE.MathUtils.lerp(l.rotation.x, side * sw * amp, dt * 20); l.position.y = 0.62 + Math.max(0, side * Math.cos(st.phase)) * 0.0; }
      }
      // arms
      st.idle = mv < 0.1 && !air ? st.idle + dt : 0;
      if (st.idle > 6 && st.wave <= 0) st.wave = 2.0;
      if (st.wave > 0) { st.wave -= dt; if (mv > 0.1) st.wave = 0; }
      for (let i = 0; i < 2; i++) {
        const side = i ? 1 : -1, a = arms[i];
        let rx = -side * sw * amp * 1.1, rz = side * -0.12 - (side * 0) , zz;
        rz = (i ? -1 : 1) * 0.14;
        if (air) { rx = THREE.MathUtils.lerp(a.rotation.x, -0.4, dt * 10); rz = (i ? -1 : 1) * (s.vy > 0 ? 2.3 : 1.4); }
        if (i === 1 && st.wave > 0) { rx = 0; rz = -2.6 + Math.sin(t * 14) * 0.35; }
        a.rotation.x = THREE.MathUtils.lerp(a.rotation.x, rx, dt * 14);
        a.rotation.z = THREE.MathUtils.lerp(a.rotation.z, rz, dt * 12);
      }
      // lean & head
      st.lean = THREE.MathUtils.lerp(st.lean, air ? (s.vy > 0 ? -0.1 : 0.12) : mv * 0.12 + run * 0.18, dt * 8);
      torso.rotation.x = st.lean; torso.rotation.z = sw * 0.05 * amp;
      torso.scale.set(1, 1 + Math.sin(t * 2.2) * 0.015 * (1 - mv), 1);
      head.rotation.x = -st.lean * 0.6 + (air ? (s.vy > 0 ? -0.15 : 0.1) : 0);
      const lookT = mv < 0.1 ? Math.sin(t * 0.6) * 0.3 + Math.sin(t * 1.7) * 0.1 : 0;
      st.headYaw = THREE.MathUtils.lerp(st.headYaw, lookT, dt * 4);
      head.rotation.y = st.headYaw; head.rotation.z = mv < 0.1 ? Math.sin(t * 1.1) * 0.05 : -sw * 0.03 * amp;
      // hair/ahoge secondary motion
      ahoge.rotation.z = Math.sin(t * 3) * 0.1 - (air ? s.vy * 0.03 : 0) - mv * 0.2; ahoge.rotation.x = Math.sin(t * 2.3) * 0.08;
      hatRoot.rotation.x = air ? -s.vy * 0.012 : -bounce * 0.5;
      blinker.update(dt, s.happy);
      // blob shadow
      const h = s.heightAboveGround || 0;
      blob.position.y = 0.06 - h + (s.groundDelta || 0); blob.scale.setScalar(Math.max(0.35, 1 - h * 0.12)); blob.material.opacity = 0.28 * Math.max(0.3, 1 - h * 0.1);
    },
  };
  root.userData.hero = hero;
  root.userData.legs = legs; root.userData.arms = arms;
  root.setOutfit = (o) => hero.setOutfit(o);
  hero.setOutfit({ hat: opts.hat ?? 'none', ...opts });
  return root;
}
