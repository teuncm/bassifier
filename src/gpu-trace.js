// GPU-expanded segments give WebGL antialiased lines with round caps and joins.
// Geometry and GPU storage are reused; audio analysis stays in Web Audio.
export function createGpuTrace(canvas, plotHeight, glow = false) {
  const gl = canvas.getContext("webgl", { alpha: true, antialias: false, depth: false, stencil: false });
  const fallback = gl ? null : canvas.getContext("2d");
  canvas.dataset.renderer = gl ? "webgl" : "canvas2d";
  let program, buffer, cornerBuffer, instancing, sizeLocation, plotLocation, widthLocation, colorLocation, featherLocation, coreLocation, glowLocation;
  let vertices = new Float32Array(0), capacity = 0, points, disposed = false, contextLost = false;
  let lastDrawn;
  let width = 1, height = 1, pixelRatio = 1, color = [0, 0, 0];

  function initialize() {
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(message);
      }
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, `
      attribute vec2 a_start;
      attribute vec2 a_end;
      attribute vec2 a_corner;
      uniform vec2 u_size;
      uniform vec2 u_plot;
      uniform mediump float u_width;
      varying vec2 v_local;
      varying float v_length;
      void main() {
        vec2 start = a_start / u_plot * u_size;
        vec2 delta = (a_end - a_start) / u_plot * u_size;
        float length = max(length(delta), 0.0001);
        vec2 direction = delta / length;
        vec2 normal = vec2(-direction.y, direction.x);
        float along = (a_corner.x + 1.0) * 0.5 * length + a_corner.x * u_width;
        vec2 p = start + direction * along + normal * a_corner.y * u_width;
        gl_Position = vec4(p / u_size * vec2(2.0, -2.0) + vec2(-1.0, 1.0), 0.0, 1.0);
        v_local = vec2(along, a_corner.y * u_width);
        v_length = length;
      }
    `);
    const fragment = compile(gl.FRAGMENT_SHADER, `
      precision mediump float;
      uniform vec4 u_color;
      uniform float u_feather;
      uniform mediump float u_width;
      uniform float u_core;
      uniform float u_glow;
      varying vec2 v_local;
      varying float v_length;
      void main() {
        float endDistance = max(max(-v_local.x, v_local.x - v_length), 0.0);
        float distance = length(vec2(endDistance, v_local.y));
        float core = 1.0 - smoothstep(u_core - u_feather, u_core, distance);
        float halo = u_glow * (1.0 - smoothstep(u_width - u_feather, u_width, distance));
        float alpha = core + halo * (1.0 - core);
        gl_FragColor = vec4(u_color.rgb, u_color.a * alpha);
      }
    `);
    program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    buffer = gl.createBuffer();
    capacity = 0;
    sizeLocation = gl.getUniformLocation(program, "u_size");
    plotLocation = gl.getUniformLocation(program, "u_plot");
    widthLocation = gl.getUniformLocation(program, "u_width");
    colorLocation = gl.getUniformLocation(program, "u_color");
    featherLocation = gl.getUniformLocation(program, "u_feather");
    coreLocation = gl.getUniformLocation(program, "u_core");
    glowLocation = gl.getUniformLocation(program, "u_glow");
    gl.useProgram(program);
    instancing = gl.getExtension("ANGLE_instanced_arrays");
    cornerBuffer = null;
    if (instancing) {
      // Upload each point once; adjacent instanced attributes describe a segment.
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      for (const [name, offset] of [["a_start", 0], ["a_end", 8]]) {
        const location = gl.getAttribLocation(program, name);
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 8, offset);
        instancing.vertexAttribDivisorANGLE(location, 1);
      }
      cornerBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
      const location = gl.getAttribLocation(program, "a_corner");
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 8, 0);
    } else {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      for (const [name, offset] of [["a_start", 0], ["a_end", 8], ["a_corner", 16]]) {
        const location = gl.getAttribLocation(program, name);
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 24, offset);
      }
    }
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
  }

  function draw(next = points, force = false) {
    points = next;
    if (disposed || !points || contextLost) return;
    if (!force && lastDrawn?.length === points.length) {
      let changed = false;
      for (let i = 0; i < points.length; i += 2) {
        if (Math.abs(points[i] - lastDrawn[i]) * width / 720 > 0.075 ||
            Math.abs(points[i + 1] - lastDrawn[i + 1]) * height / plotHeight > 0.075) { changed = true; break; }
      }
      if (!changed) return;
    }
    if (lastDrawn?.length !== points.length) lastDrawn = new Float32Array(points.length);
    lastDrawn.set(points);
    const count = points.length / 2;
    if (fallback) {
      fallback.clearRect(0, 0, canvas.width, canvas.height);
      fallback.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      fallback.beginPath();
      for (let i = 0; i < count; i++) {
        const x = points[i * 2] / 720 * width, y = points[i * 2 + 1] / plotHeight * height;
        if (i) fallback.lineTo(x, y); else fallback.moveTo(x, y);
      }
      fallback.strokeStyle = `rgb(${color.map(value => value * 255).join(",")})`;
      fallback.lineJoin = "round";
      if (glow) { fallback.globalAlpha = 0.12; fallback.lineWidth = 4.5; fallback.stroke(); }
      fallback.globalAlpha = 1;
      fallback.lineWidth = 1.5;
      fallback.stroke();
      return;
    }
    if (!gl) return;
    const vertexCount = (count - 1) * 6;
    if (!instancing) {
      if (vertices.length !== vertexCount * 6) {
        vertices = new Float32Array(vertexCount * 6);
        const corners = [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1];
        for (let i = 0; i < vertexCount; i++) {
          vertices[i * 6 + 4] = corners[i % 6 * 2];
          vertices[i * 6 + 5] = corners[i % 6 * 2 + 1];
        }
      }
      for (let i = 0; i < count - 1; i++) {
        for (let corner = 0; corner < 6; corner++) {
          const offset = (i * 6 + corner) * 6;
          vertices[offset] = points[i * 2];
          vertices[offset + 1] = points[i * 2 + 1];
          vertices[offset + 2] = points[i * 2 + 2];
          vertices[offset + 3] = points[i * 2 + 3];
        }
      }
    }
    const upload = instancing ? points : vertices;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    if (capacity < upload.byteLength) {
      capacity = upload.byteLength;
      gl.bufferData(gl.ARRAY_BUFFER, capacity, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, upload);
    gl.uniform2f(sizeLocation, width, height);
    gl.uniform2f(plotLocation, 720, plotHeight);
    const coreWidth = 0.75 + 0.5 / pixelRatio;
    gl.uniform1f(widthLocation, glow ? 2.75 : coreWidth);
    gl.uniform1f(coreLocation, coreWidth);
    gl.uniform1f(glowLocation, glow ? 0.12 : 0);
    gl.uniform1f(featherLocation, 1 / pixelRatio);
    gl.uniform4f(colorLocation, ...color, 1);
    if (instancing) instancing.drawArraysInstancedANGLE(gl.TRIANGLES, 0, 6, count - 1);
    else gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    width = Math.max(1, bounds.width); height = Math.max(1, bounds.height);
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(width * pixelRatio), h = Math.round(height * pixelRatio);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    refreshColor();
  }
  function refreshColor() {
    color = (getComputedStyle(canvas).color.match(/[\d.]+/g) ?? [0, 0, 0]).slice(0, 3).map(value => Number(value) / 255);
    draw(points, true);
  }
  function lost(event) { contextLost = true; event.preventDefault(); }
  function restored() { if (!disposed) { contextLost = false; initialize(); draw(points, true); } }
  canvas.addEventListener("webglcontextlost", lost);
  canvas.addEventListener("webglcontextrestored", restored);
  if (gl) initialize();
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  const themeObserver = new MutationObserver(refreshColor);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class", "style"] });
  window.addEventListener("resize", resize);
  resize();
  return {
    get width() { return width; },
    draw,
    dispose() {
      disposed = true;
      observer.disconnect(); themeObserver.disconnect();
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
      if (gl) { gl.deleteBuffer(buffer); gl.deleteBuffer(cornerBuffer); gl.deleteProgram(program); }
    },
  };
}
