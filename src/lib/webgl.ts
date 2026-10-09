/**
 * WebGL capability check. MapLibre needs WebGL; without it we render the
 * textual/list alternative (spec T20). Result is cached per page load.
 */
let cached: boolean | null = null;

export function hasWebGL(): boolean {
  if (cached !== null) return cached;
  try {
    if (typeof document === 'undefined') {
      cached = false;
      return cached;
    }
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    cached = gl !== null && gl !== undefined && typeof gl.getParameter === 'function';
  } catch {
    cached = false;
  }
  return cached;
}

/** Test helper. */
export function __resetWebGLCache(): void {
  cached = null;
}
