  dust(pos, n = 4, scale = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28;
      this.spawn({ pos: pos.clone().add(new THREE.Vector3(Math.cos(a) * 0.2, 0.1, Math.sin(a) * 0.2)), color: '#fff6e6',
        vel: new THREE.Vector3(Math.cos(a) * 0.9, 0.7 + Math.random() * 0.5, Math.sin(a) * 0.9).multiplyScalar(scale), drag: 3,
        life: 0.5 + Math.random() * 0.25, s0: 0.25 * scale, s1: 0.8 * scale });
    }
  }
  hearts(pos, n = 1, color = '#ff6a9a') {
    for (let i = 0; i < n; i++) this.spawn({ map: 'heart', pos: pos.clone().add(new THREE.Vector3((Math.random() - .5) * .6, 0, (Math.random() - .5) * .6)),
      color, vel: new THREE.Vector3((Math.random() - .5) * 0.6, 1.4 + Math.random() * 0.6, (Math.random() - .5) * 0.6), life: 1.3, s0: 0.1, s1: 0.5, pop: 1, fade: 0.4 });
  }
  burst(pos, color = '#ffe27a', n = 16) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, e = (Math.random() - 0.2) * 1.6, sp = 3 + Math.random() * 3;
      this.spawn({ map: 'star', add: true, color, pos: pos.clone(), vel: new THREE.Vector3(Math.cos(a) * sp, Math.sin(e) * sp + 2, Math.sin(a) * sp),
        g: -9, drag: 1.5, life: 0.6 + Math.random() * 0.4, s0: 0.5, s1: 0.05, spin: (Math.random() - .5) * 8, fade: 0.6 });
    }
    this.spawn({ map: 'ring', add: true, color, pos: pos.clone(), life: 0.45, s0: 0.3, s1: 3.2 });
    this.spawn({ add: true, color, pos: pos.clone(), life: 0.3, s0: 1.0, s1: 3.0 });
  }
  pop(pos, text, color = '#fff6a8') {
    this.spawn({ text, color, pos: pos.clone(), vel: new THREE.Vector3(0, 2.2, 0), drag: 1.6, life: 1.0, s0: 0.3, s1: 1.0, aspect: 2, pop: 1, fade: 0.35 });
  }
  twinkle(pos, color = '#fff6c0') {
    this.spawn({ map: 'star', add: true, color, pos: pos.clone(), vel: new THREE.Vector3(0, 0.4, 0), life: 0.7, s0: 0.05, s1: 0.35, pop: 1, spin: 2 });
  }
