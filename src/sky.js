import * as THREE from 'three';
import { WORLD } from './terrain.js';

export function buildSky(scene) {
  scene.background = new THREE.Color('#9fd8ff');
  scene.fog = new THREE.Fog('#bfe6ff', 80, 260);
  scene.add(new THREE.HemisphereLight('#cfeaff', '#7a9a5a', 1.1));
  const sun = new THREE.DirectionalLight('#fff1d0', 2.6);
  sun.position.set(60, 90, 40); sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera; sc.left = -80; sc.right = 80; sc.top = 80; sc.bottom = -80; sc.near = 1; sc.far = 300;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  scene.add(sun);

  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color('#4aa8ff') }, bot: { value: new THREE.Color('#d9f1ff') } },
    vertexShader: 'varying vec3 v;void main(){v=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform vec3 top,bot;varying vec3 v;void main(){float t=smoothstep(-.1,.8,v.y);gl_FragColor=vec4(mix(bot,top,t),1.);}'
  }));
  scene.add(sky);

  const clouds = new THREE.Group();
  const cm = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 });
  for (let i = 0; i < 14; i++) {
    const g = new THREE.Group();
    for (let j = 0; j < 5; j++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(4 + Math.random() * 4, 16, 12), cm);
      b.position.set(j * 5 - 10, Math.random() * 2, Math.random() * 4); b.scale.y = 0.7; g.add(b);
    }
    g.position.set((Math.random() - 0.5) * 300, 55 + Math.random() * 20, (Math.random() - 0.5) * 300);
    clouds.add(g);
  }
  scene.add(clouds);

  const water = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    transparent: true, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      time: { value: 0 }, shallow: { value: new THREE.Color('#6fe3e0') }, deep: { value: new THREE.Color('#1c7fc7') } }]),
    vertexShader: `varying vec3 w;
      #include <fog_pars_vertex>
      void main(){vec4 wp=modelMatrix*vec4(position,1.);w=wp.xyz;vec4 mvPosition=viewMatrix*wp;gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform float time;uniform vec3 shallow,deep;varying vec3 w;
      #include <fog_pars_fragment>
      void main(){
        float r=length(w.xz)/${(WORLD / 2).toFixed(1)};
        float wave=sin(w.x*.6+time)*.5+sin(w.z*.5-time*1.3)*.5;
        float foam=smoothstep(.04,0.,abs(fract(r*5.-time*.15)-.5)-.45+wave*.02)*smoothstep(1.4,.9,r);
        vec3 c=mix(shallow,deep,smoothstep(.7,1.6,r)); c+=wave*.04; c=mix(c,vec3(1.),foam*.5);
        gl_FragColor=vec4(c,.88);
        #include <fog_fragment>
      }`
  }));
  water.position.y = -0.4; scene.add(water);
  return { sun, water, clouds, update(t) { water.material.uniforms.time.value = t; clouds.position.x = Math.sin(t * 0.02) * 20; } };
}
