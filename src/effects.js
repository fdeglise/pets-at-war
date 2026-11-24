// Particles (instanced cubes), slash arcs, rings, and lightning bolts.
import * as THREE from 'three';

const MAX = 2400;
const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();

class Pool {
  constructor(scene, additive) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = additive
      ? new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
      : new THREE.MeshLambertMaterial({});
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, tmpColor.set(0xffffff));
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.additive = additive;
    scene.add(this.mesh);
    this.ps = [];
  }
  add(p) {
    if (this.ps.length >= MAX) this.ps[Math.floor(Math.random() * MAX)] = p;
    else this.ps.push(p);
  }
  update(dt, getHeight) {
    const ps = this.ps;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) {
        ps[i] = ps[ps.length - 1];
        ps.pop();
        continue;
      }
      p.vy -= p.grav * dt;
      const dr = Math.exp(-p.drag * dt);
      p.vx *= dr; p.vy *= dr; p.vz *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.floor && getHeight) {
        const gh = getHeight(p.x, p.z) + p.size * 0.5;
        if (p.y < gh) { p.y = gh; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
      }
      p.rot += p.spin * dt;
    }
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      const t = p.life / p.max;
      const s = p.size1 + (p.size - p.size1) * t;
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.rot, p.rot * 0.7, 0);
      dummy.scale.setScalar(Math.max(0.001, s));
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
      const f = this.additive ? Math.min(1, t * 1.5) : 1;
      tmpColor.setRGB(p.r * f, p.g * f, p.b * f);
      this.mesh.setColorAt(i, tmpColor);
    }
    this.mesh.count = ps.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}

const temps = [];
let scene = null;
let solid = null;
let glow = null;
let getHeightFn = null;

function particle(pool, o) {
  pool.add(o);
}

export const FX = {
  init(sc, getHeight) {
    scene = sc;
    getHeightFn = getHeight;
    solid = new Pool(sc, false);
    glow = new Pool(sc, true);
  },
  clear() {
    solid.ps.length = 0;
    glow.ps.length = 0;
    for (const t of temps) t.dispose();
    temps.length = 0;
  },

  // General purpose burst
  burst(pos, o = {}) {
    const n = o.count ?? 10;
    const col = tmpColor.set(o.color ?? 0xffffff);
    const inten = o.glow ? o.intensity ?? 2.4 : 1;
    const r = col.r * inten, g = col.g * inten, b = col.b * inten;
    const pool = o.glow ? glow : solid;
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
      const sq = Math.sqrt(1 - u * u);
      const sp = (o.speed ?? 4) * (0.35 + Math.random() * 0.9);
      const spread = o.spread ?? 0.2;
      particle(pool, {
        x: pos.x + (Math.random() - 0.5) * spread,
        y: pos.y + (Math.random() - 0.5) * spread,
        z: pos.z + (Math.random() - 0.5) * spread,
        vx: sq * Math.cos(th) * sp,
        vy: Math.abs(u) * sp * (o.upBias ?? 0.6) + (o.up ?? 2),
        vz: sq * Math.sin(th) * sp,
        life: (o.life ?? 0.6) * (0.6 + Math.random() * 0.6),
        max: o.life ?? 0.6,
        size: (o.size ?? 0.18) * (0.6 + Math.random() * 0.8),
        size1: o.size1 ?? 0,
        r, g, b,
        grav: o.gravity ?? 12,
        drag: o.drag ?? 1.5,
        rot: Math.random() * 6,
        spin: (Math.random() - 0.5) * 12,
        floor: !!o.floor,
      });
      // normalise life fraction
      const p = pool.ps[pool.ps.length - 1];
      if (p) p.max = p.life;
    }
  },

  // A particle that travels from a to b (used for the pet's healing stream).
  stream(a, b, hex, dur = 0.35, size = 0.16) {
    const c = tmpColor.set(hex);
    glow.add({
      x: a.x + (Math.random() - 0.5) * 0.3, y: a.y, z: a.z + (Math.random() - 0.5) * 0.3,
      vx: (b.x - a.x) / dur, vy: (b.y - a.y) / dur + 2, vz: (b.z - a.z) / dur,
      life: dur, max: dur, size, size1: size * 0.4,
      r: c.r * 2.2, g: c.g * 2.2, b: c.b * 2.2,
      grav: 4 / dur, drag: 0, rot: 0, spin: 6, floor: false,
    });
  },

  // Expanding flat ring on the ground.
  ring(pos, hex, radius = 3, life = 0.5) {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(hex).multiplyScalar(2),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2), mat);
    m.position.copy(pos);
    m.position.y += 0.15;
    scene.add(m);
    const base = new THREE.Color(hex).multiplyScalar(2);
    temps.push({
      t: 0,
      update(dt) {
        this.t += dt / life;
        const s = 0.3 + this.t * radius;
        m.scale.set(s, 1, s);
        mat.color.copy(base).multiplyScalar(Math.max(0, 1 - this.t));
        return this.t < 1;
      },
      dispose() { scene.remove(m); m.geometry.dispose(); mat.dispose(); },
    });
  },

  // Sword swing arc in front of the attacker.
  slash(pos, yaw, hex, range = 3.5, side = 1) {
    const L = Math.PI * 0.95;
    const geo = new THREE.RingGeometry(range * 0.35, range, 28, 1, -Math.PI / 2 - L / 2, L).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(hex).multiplyScalar(1.6),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 0.55,
    });
    const g2 = new THREE.RingGeometry(range * 0.9, range * 1.02, 28, 1, -Math.PI / 2 - L / 2, L).rotateX(-Math.PI / 2);
    const mat2 = new THREE.MeshBasicMaterial({
      color: new THREE.Color(hex).multiplyScalar(3),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const grp = new THREE.Group();
    grp.add(new THREE.Mesh(geo, mat), new THREE.Mesh(g2, mat2));
    grp.position.copy(pos);
    grp.rotation.set(0, yaw, side * 0.25, 'YXZ');
    scene.add(grp);
    const c1 = mat.color.clone(), c2 = mat2.color.clone();
    temps.push({
      t: 0,
      update(dt) {
        this.t += dt / 0.22;
        const k = Math.max(0, 1 - this.t);
        mat.color.copy(c1).multiplyScalar(k);
        mat2.color.copy(c2).multiplyScalar(k);
        grp.rotation.y = yaw - side * 0.5 * this.t;
        grp.scale.setScalar(0.9 + this.t * 0.15);
        return this.t < 1;
      },
      dispose() { scene.remove(grp); geo.dispose(); g2.dispose(); mat.dispose(); mat2.dispose(); },
    });
  },

  // Jagged lightning between two points.
  bolt(a, b, hex = 0xffe45c) {
    const grp = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(3.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const pts = [a.clone()];
    const segs = 6;
    for (let i = 1; i < segs; i++) {
      const p = a.clone().lerp(b, i / segs);
      p.x += (Math.random() - 0.5) * 0.9;
      p.y += (Math.random() - 0.5) * 0.9;
      p.z += (Math.random() - 0.5) * 0.9;
      pts.push(p);
    }
    pts.push(b.clone());
    const geo = new THREE.BoxGeometry(0.09, 0.09, 1);
    for (let i = 0; i < pts.length - 1; i++) {
      const m = new THREE.Mesh(geo, mat);
      const p0 = pts[i], p1 = pts[i + 1];
      m.position.copy(p0).lerp(p1, 0.5);
      m.scale.z = p0.distanceTo(p1);
      m.lookAt(p1);
      grp.add(m);
    }
    scene.add(grp);
    const base = mat.color.clone();
    temps.push({
      t: 0,
      update(dt) {
        this.t += dt / 0.22;
        mat.color.copy(base).multiplyScalar(Math.max(0, 1 - this.t) * (Math.random() > 0.3 ? 1 : 0.4));
        return this.t < 1;
      },
      dispose() { scene.remove(grp); geo.dispose(); mat.dispose(); },
    });
  },

  update(dt) {
    solid.update(dt, getHeightFn);
    glow.update(dt, null);
    for (let i = temps.length - 1; i >= 0; i--) {
      if (!temps[i].update(dt)) {
        temps[i].dispose();
        temps.splice(i, 1);
      }
    }
  },
};
