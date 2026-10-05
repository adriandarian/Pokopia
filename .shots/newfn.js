// Hair as a real shell over the skull. The open region (face, ears, nape) is cut per-pixel in the shader (smooth edge).
const CUT_GLSL = `
float hairCut(vec3 p, float layer) {
  float cut;
  if (layer > 0.0) { cut = layer + 0.1 * sin(atan(p.x, p.z) * 5.0) + 0.25 * smoothstep(0.3, 1.0, p.z); }
  else {
    cut = -0.52 + 0.82 * smoothstep(-0.8, -0.1, p.z);
    cut += 0.2 * smoothstep(0.3, 0.9, p.z);
    cut += 0.045 * sin(p.x * 13.0) * smoothstep(0.3, 0.8, p.z);
    cut -= 0.2 * smoothstep(0.62, 0.95, abs(p.x)) * smoothstep(0.0, 0.6, p.z) * (1.0 - smoothstep(0.6, 0.95, p.z));
  }
  return cut;
}`;
function hairShell() { return new THREE.SphereGeometry(1, 48, 32); }
function hairCutMat(mat, layer) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh) => {
    prev(sh);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + CUT_GLSL)
      .replace('void main() {', 'void main() {\n if (normalize(vObjPos).y < hairCut(normalize(vObjPos), ' + layer.toFixed(3) + ')) discard;');
  };
  mat.customProgramCacheKey = () => 'toonhair' + layer;
  return mat;
}
function hairOutline(mesh, layer, thick) {
  const m = new THREE.MeshBasicMaterial({ color: '#3b2a3a', side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position; transformed += normalize(normal) * ' + thick.toFixed(3) + ';');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP;\n' + CUT_GLSL)
      .replace('void main() {', 'void main() {\n if (normalize(vOP).y < hairCut(normalize(vOP), ' + layer.toFixed(3) + ')) discard;');
  };
  m.customProgramCacheKey = () => 'hairol' + layer;
  const o = new THREE.Mesh(mesh.geometry, m); o.userData.isOutline = true; mesh.add(o); return o;
}
