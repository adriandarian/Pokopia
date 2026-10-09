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
    sat: { value: 1.04 },
    contrast: { value: 1.12 },
    lift: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `uniform sampler2D tDiffuse;uniform vec3 tint;uniform float vignette,sat,contrast,lift;varying vec2 vUv;
    void main(){
      vec4 c=texture2D(tDiffuse,vUv);
      vec3 col=c.rgb*tint;
      float l=dot(col,vec3(.2126,.7152,.0722));
      float gm=smoothstep(0.,.25,col.g-max(col.r,col.b)); col=mix(col,vec3(l)*vec3(1.02,1.,.96),gm*.26); // calm the greens
      col=mix(vec3(l),col,sat*(1.+.15*(1.-clamp(l*3.,0.,1.))));
      col=.18*pow(max(col,0.)/.18,vec3(contrast)); // S-curve: deeper darks, punchier brights
      col*=mix(vec3(.96,.985,1.05),vec3(1.05,1.01,.94),smoothstep(.04,.8,l)); // cool shadows, warm highlights
      col+=lift*vec3(.5,.7,1.)*(1.-clamp(l*3.,0.,1.));
      vec2 d=vUv-.5; d.x*=1.15;
      float v=smoothstep(.28,.85,length(d));
      col*=1.-v*vignette;
      gl_FragColor=vec4(max(col,0.),c.a);
    }`,
};

// Low tier: grade + ACES tone mapping + sRGB in ONE fullscreen pass (no bloom, no separate OutputPass).
const GradeOutShader = {
  uniforms: Object.assign(THREE.UniformsUtils.clone(GradeShader.uniforms), { toneMappingExposure: { value: 1 } }),
  vertexShader: GradeShader.vertexShader,
  fragmentShader: `#include <common>
    #include <tonemapping_pars_fragment>
    ` + GradeShader.fragmentShader.replace('void main(){', 'void main(){').replace(
      'gl_FragColor=vec4(max(col,0.),c.a);',
      `col=max(col,0.);
      #ifdef ACES_FILMIC_TONE_MAPPING
        col=ACESFilmicToneMapping(col);
      #endif
      gl_FragColor=vec4(col,c.a);
      #ifdef SRGB_TRANSFER
        gl_FragColor=sRGBTransferOETF(gl_FragColor);
      #endif`),
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
  const output = new OutputPass();
  composer.addPass(output);
  const gradeOut = new ShaderPass(new THREE.ShaderMaterial({
    uniforms: GradeOutShader.uniforms, vertexShader: GradeOutShader.vertexShader, fragmentShader: GradeOutShader.fragmentShader,
    defines: { SRGB_TRANSFER: '', ACES_FILMIC_TONE_MAPPING: '' }, toneMapped: false,
  }));
  gradeOut.renderToScreen = false;
  composer.addPass(gradeOut);

  let mode = 'full', bloomScale = 1;
  const fitBloom = () => { // bloom resolution relative to the composer's effective pixels
    const w = composer._width * composer._pixelRatio, h = composer._height * composer._pixelRatio;
    bloom.setSize(Math.max(2, Math.round(w * bloomScale)), Math.max(2, Math.round(h * bloomScale)));
  };
  const resize = () => { composer.setSize(innerWidth, innerHeight); fitBloom(); };
  addEventListener('resize', resize);

  const api = {
    composer, bloom,
    /** Apply a quality profile live: pixel ratio, MSAA, which passes run, bloom resolution. */
    setProfile(p) {
      mode = p.post;
      bloom.enabled = grade.enabled = output.enabled = mode !== 'lite';
      gradeOut.enabled = mode === 'lite';
      bloomScale = mode === 'half' ? 0.5 : 1;
      // medium: 3 blur mips instead of 5 (4 fewer fullscreen passes); the unused mips are tinted to black in the composite
      const mips = mode === 'half' ? 3 : 5;
      bloom.nMips = mips; bloom.bloomTintColors.forEach((c, i) => c.setScalar(i < mips ? 1 : 0));
      for (const rt of [composer.renderTarget1, composer.renderTarget2]) {
        if (rt.samples !== p.msaa) { rt.samples = p.msaa; rt.dispose(); }
      }
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(innerWidth, innerHeight);
      fitBloom();
    },
    render(dt) {
      const s = scene.userData.sky;
      renderer.toneMappingExposure = s ? s.exp : 1;
      const g = mode === 'lite' ? gradeOut.uniforms : grade.uniforms;
      if (s) {
        bloom.strength = s.bloom;
        g.tint.value.copy(s.tint);
        g.lift.value = 0.01 * (s.night || 0);
        g.sat.value = 1.05 - 0.1 * (s.dusk || 0);
        g.contrast.value = 1.12 - 0.07 * (s.night || 0);
      }
      gradeOut.uniforms.toneMappingExposure.value = renderer.toneMappingExposure;
      composer.render(dt);
    },
  };
  window.__post = api;
  return api;
}
