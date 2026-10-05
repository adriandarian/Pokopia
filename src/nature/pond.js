import * as THREE from 'three';
import { POND } from './features.js';
import { POND_LEVEL, heightAt } from '../terrain.js';

export function buildPond(scene) {
  const g = new THREE.CircleGeometry(POND.r * 1.8, 64).rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    transparent: true, fog: true, depthWrite: false,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      time: { value: 0 }, c: { value: new THREE.Vector3(POND.x, POND.z, POND.r) },
    }]),
    vertexShader: `varying vec3 w;
      #include <fog_pars_vertex>
      void main(){vec4 wp=modelMatrix*vec4(position,1.);w=wp.xyz;vec4 mvPosition=viewMatrix*wp;gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform float time; uniform vec3 c; varying vec3 w;
      #include <fog_pars_fragment>
      void main(){
        float r = length(w.xz-c.xy)/c.z;
        float rip = sin(r*26.-time*1.6)*.5+.5;
        float rip2 = sin((w.x*1.7+w.z*1.1)+time*.9)*.5+.5;
        vec3 col = mix(vec3(.38,.8,.78), vec3(.08,.42,.62), smoothstep(1.,.15,r));
        col += (rip*.04 + rip2*.03);
        float sparkle = smoothstep(.985,1., sin(w.x*9.+time*2.)*sin(w.z*8.-time*1.7));
        col += sparkle*.35;
        float a = .85*smoothstep(1.3,.92,r) + .1;
        gl_FragColor = vec4(col, a);
        #include <fog_fragment>
      }`,
  });
  const m = new THREE.Mesh(g, mat);
  m.position.set(POND.x, POND_LEVEL, POND.z);
  m.renderOrder = 2;
  m.onBeforeRender = () => { mat.uniforms.time.value = performance.now() / 1000; };
  scene.add(m);

  // lily pads
  const pad = new THREE.CircleGeometry(0.45, 10, 0.3, Math.PI * 2 - 0.6).rotateX(-Math.PI / 2);
  const pm = new THREE.MeshStandardMaterial({ color: '#4fae4f', roughness: 0.8, side: THREE.DoubleSide });
  const pads = new THREE.InstancedMesh(pad, pm, 14);
  const d = new THREE.Object3D(); let n = 0;
  for (let i = 0; i < 40 && n < 14; i++) {
    const a = i * 2.4, rr = POND.r * (0.15 + ((i * 0.37) % 0.55));
    const x = POND.x + Math.cos(a) * rr, z = POND.z + Math.sin(a) * rr;
    if (heightAt(x, z) > POND_LEVEL - 0.15) continue;
    d.position.set(x, POND_LEVEL + 0.03, z); d.rotation.set(0, i * 1.3, 0); d.scale.setScalar(0.7 + (i % 3) * 0.3); d.updateMatrix();
    pads.setMatrixAt(n++, d.matrix);
  }
  pads.count = n; pads.receiveShadow = true;
  scene.add(pads);
}
