// Frees GPU vertex buffers for a discarded subtree. Geometries are always
// uniquely created per mesh in this codebase, so disposing them is safe;
// materials/textures are left alone (several are shared module-level).

export function disposeGeometries(root) {
  if (!root) return;
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
  });
}
