import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// Vignette + gentle colour grade, applied in linear HDR before tone mapping.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    tint: { value: new THREE.Color(1, 1, 1) },
    vignette: { value: 0.32 },
    sat: { value: 1.12 },
    contrast: { value: 1.04 },
  },
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `uniform sampler2D tDiffuse;uniform vec3 tint;uniform float vignette,sat,contrast;varying vec2 vUv;
    void main(){
      vec4 c=texture2D(tDiffuse,vUv);
      vec3 col=c.rgb*tint;
      float l=dot(col,vec3(.2126,.7152,.0722));
      col=mix(vec3(l),col,sat);
      col=(col-.18)*contrast+.18;
      vec2 d=vUv-.5; d.x*=1.15;
      float v=smoothstep(.28,.85,length(d));
      col*=1.-v*vignette;
      gl_FragColor=vec4(max(col,0.),c.a);
    }`,
};

export function setupPost(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2());
  const pr = renderer.getPixelRatio();
  const target = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(pr);
  composer.setSize(size.x, size.y);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.28, 0.7, 0.9);
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  addEventListener('resize', () => composer.setSize(innerWidth, innerHeight));

  const api = {
    composer,
    render(dt) {
      const s = scene.userData.sky;
      if (s) {
        renderer.toneMappingExposure = s.exp;
        bloom.strength = s.bloom;
        grade.uniforms.tint.value.copy(s.tint);
      }
      composer.render(dt);
    },
  };
  window.__post = api;
  return api;
}
