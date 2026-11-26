import { VFD_PALETTES, type DisplaySettings } from '@cathobar/shared';

export function computePersistenceDecay(baseDecay: number, dtSec: number): number {
  if (baseDecay <= 0) return 0;
  const clampedDt = Math.max(1 / 600, Math.min(0.25, dtSec));
  return Math.pow(baseDecay, clampedDt * 60);
}

export function computeBloomDimensions(
  logicalWidth: number,
  logicalHeight: number,
  sourceWidth: number,
  sourceHeight: number,
): { width: number; height: number } {
  const safeLogW = Math.max(1, logicalWidth);
  const safeLogH = Math.max(1, logicalHeight);
  const safeSrcW = Math.max(1, sourceWidth);
  const safeSrcH = Math.max(1, sourceHeight);
  const aspect = safeLogW / safeLogH;

  let width = Math.max(64, Math.round(safeLogW * 0.5));
  let height = Math.max(24, Math.round(safeLogH * 0.5));

  const maxDim = Math.max(width, height);
  if (maxDim > 640) {
    const s = 640 / maxDim;
    width = Math.max(64, Math.round(width * s));
    height = Math.max(24, Math.round(height * s));
  } else if (width / Math.max(1, height) < aspect * 0.5) {
    width = Math.max(64, Math.round(height * aspect));
  }

  return {
    width: Math.min(safeSrcW, width),
    height: Math.min(safeSrcH, height),
  };
}

const VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const PERSISTENCE_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_current;
uniform sampler2D u_prev;
uniform float u_decay;
uniform float u_floorSub;
out vec4 outColor;
void main() {
  vec4 curr = texture(u_current, v_uv);
  vec4 prev = texture(u_prev, v_uv);
  vec3 trail = max(vec3(0.0), prev.rgb * u_decay - u_floorSub);
  float trailA = max(0.0, prev.a * u_decay - u_floorSub);
  outColor = vec4(max(curr.rgb, trail), max(curr.a, trailA));
}
`;

const BLOOM_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_dir;
out vec4 outColor;
void main() {
  vec3 sum = texture(u_tex, v_uv).rgb * 0.26;
  sum += texture(u_tex, v_uv + u_dir * 1.2).rgb * 0.24;
  sum += texture(u_tex, v_uv - u_dir * 1.2).rgb * 0.24;
  sum += texture(u_tex, v_uv + u_dir * 2.6).rgb * 0.13;
  sum += texture(u_tex, v_uv - u_dir * 2.6).rgb * 0.13;
  outColor = vec4(sum, 1.0);
}
`;

const DISPLAY_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform sampler2D u_bloomTex;
uniform vec2 u_logicalSize;
uniform vec2 u_viewportSize;
uniform vec3 u_vfdColor;
uniform int u_mode; // 0=anobar8-vfd, 1=anobar-fed, 2=clean, 3=shinkansen-led, 4=split-flap, 5=station-board
uniform float u_brightness;
uniform float u_dotIntensity;
uniform float u_bloom;
uniform float u_vfdGrid;
uniform float u_glass;
uniform vec2 u_pixelShift;
uniform int u_transparent;
out vec4 outColor;

float dotMatrixMask(vec2 uv, vec2 grid, float intensity) {
  if (intensity <= 0.001) return 1.0;
  vec2 cell = fract(uv * grid);
  vec2 dist = abs(cell - 0.5);
  float edge = max(dist.x, dist.y);
  float pixelBody = 1.0 - smoothstep(0.32, 0.49, edge);
  return mix(1.0, 0.18 + 0.82 * pixelBody, intensity);
}

float vfdAnodeMesh(vec2 uv, vec2 grid, float intensity) {
  if (intensity <= 0.001) return 1.0;
  vec2 cell = uv * grid;
  float row = floor(cell.y);
  vec2 hexUv = vec2(cell.x + mod(row, 2.0) * 0.5, cell.y);
  vec2 f = fract(hexUv) - 0.5;
  float wire = smoothstep(0.38, 0.49, abs(f.x) + abs(f.y) * 0.65);
  float filamentRows = clamp(floor(grid.y / 30.0 + 0.5), 3.0, 12.0);
  float filamentHalfW = clamp(0.55 / max(grid.y / filamentRows, 1.0), 0.004, 0.024);
  float filament = 1.0 - 0.14 * (1.0 - smoothstep(0.0, filamentHalfW, abs(fract(uv.y * filamentRows) - 0.5)));
  float meshDarken = mix(1.0, 1.0 - 0.28 * wire, intensity);
  return meshDarken * mix(1.0, filament, intensity);
}

vec3 vfdGlassEffect(vec2 uv, float glassStrength, vec2 logicalSize) {
  if (glassStrength <= 0.001) return vec3(0.0);
  float aspect = logicalSize.x / max(logicalSize.y, 1.0);
  float rimSpan = mix(0.08, 0.14, clamp((aspect - 1.6) / 3.0, 0.0, 1.0));
  float diag = smoothstep(0.35, 0.0, abs((uv.x * 0.45 + uv.y) - 1.15));
  float topRim = smoothstep(rimSpan, 0.0, 1.0 - uv.y) * 0.55;
  return vec3(0.11, 0.16, 0.18) * (diag * 0.24 + topRim * 0.35) * glassStrength;
}

float tubeVignette(vec2 uv, float glassStrength, vec2 logicalSize) {
  vec2 centered = (uv - 0.5) * 2.0;
  float aspect = logicalSize.x / max(logicalSize.y, 1.0);
  float vx = mix(0.72, 0.45, clamp((aspect - 1.6) / 3.0, 0.0, 1.0));
  float edgeDist = dot(centered * vec2(vx, 0.85), centered * vec2(vx, 0.85));
  return mix(1.0, 1.0 - clamp(edgeDist * 0.28, 0.0, 0.38), glassStrength);
}

void main() {
  vec2 safeLogical = max(u_logicalSize, vec2(1.0));
  vec2 px = 1.0 / safeLogical;
  vec2 pxPerCell = max(u_viewportSize, vec2(1.0)) / safeLogical;
  float cellAa = smoothstep(1.1, 2.5, min(pxPerCell.x, pxPerCell.y));
  vec2 shiftedUv = clamp(v_uv + u_pixelShift * px, vec2(0.0), vec2(1.0));

  vec4 rawSample = texture(u_tex, shiftedUv);
  vec3 base = rawSample.rgb;
  vec3 bloomVec = (u_bloom > 0.001 && u_mode != 4)
    ? texture(u_bloomTex, shiftedUv).rgb
    : vec3(0.0);

  if (u_mode == 0) {
    // ANOBAR8 VFD 16-level monochrome quantization + mesh grid + glass sheen
    float luma = dot(base, vec3(0.299, 0.587, 0.114));
    float q = floor(clamp(luma * u_brightness, 0.0, 1.0) * 15.0 + 0.5) / 15.0;
    float mask = dotMatrixMask(shiftedUv, safeLogical, u_dotIntensity * cellAa);
    float mesh = vfdAnodeMesh(shiftedUv, safeLogical, u_vfdGrid * cellAa);
    float bloomLuma = dot(bloomVec, vec3(0.299, 0.587, 0.114));
    vec3 lit = u_vfdColor * q * mask * mesh;
    vec3 halo = u_vfdColor * bloomLuma * u_bloom * u_brightness;
    if (u_transparent == 1) {
      float alpha = clamp(rawSample.a * (0.2 + q) + bloomLuma * u_bloom * 0.7, 0.0, 1.0);
      outColor = vec4(clamp(lit + halo, 0.0, 1.0), alpha);
      return;
    }
    vec3 unlitMesh = u_vfdColor * (0.018 + 0.014 * mask * mesh);
    vec3 glass = vfdGlassEffect(v_uv, u_glass, safeLogical);
    float vig = tubeVignette(v_uv, u_glass, safeLogical);
    outColor = vec4(clamp((unlitMesh + lit + halo) * vig + glass, 0.0, 1.0), 1.0);
  } else if (u_mode == 1) {
    // Original ANOBAR FED full-color self-luminous dot matrix
    float mask = dotMatrixMask(shiftedUv, safeLogical, u_dotIntensity * cellAa);
    vec3 lit = base * u_brightness * mask;
    vec3 halo = bloomVec * u_bloom * u_brightness;
    if (u_transparent == 1) {
      float alpha = clamp(max(rawSample.a, dot(halo, vec3(0.333))), 0.0, 1.0);
      outColor = vec4(clamp(lit + halo, 0.0, 1.0), alpha);
      return;
    }
    vec3 unlitMesh = vec3(0.012, 0.016, 0.022) * mask;
    outColor = vec4(clamp(unlitMesh + lit + halo, 0.0, 1.0), 1.0);
  } else if (u_mode == 3) {
    // Tohoku Shinkansen 3-color circular LED dot matrix
    vec2 cellUv = (floor(shiftedUv * safeLogical) + 0.5) / safeLogical;
    vec4 cellSample = texture(u_tex, cellUv);
    vec3 cellBase = cellSample.rgb;
    vec2 cellPos = fract(shiftedUv * safeLogical) - 0.5;
    float radius = length(cellPos);
    float ledDisc = 1.0 - smoothstep(0.30, 0.47, radius);
    float ledCore = 1.0 - smoothstep(0.0, 0.28, radius);
    float ledMask = mix(1.0, ledDisc, max(0.35, u_dotIntensity) * cellAa);
    float luma = dot(cellBase, vec3(0.299, 0.587, 0.114));
    vec3 quantized = step(0.18, luma) * cellBase;
    vec3 lit = quantized * u_brightness * (0.85 + 0.4 * ledCore) * ledMask;
    vec3 halo = bloomVec * u_bloom * 0.65 * u_brightness;
    if (u_transparent == 1) {
      float alpha = clamp(max(step(0.18, luma) * ledDisc, dot(halo, vec3(0.333))), 0.0, 1.0);
      outColor = vec4(clamp(lit + halo, 0.0, 1.0), alpha);
      return;
    }
    vec3 housing = vec3(0.022, 0.024, 0.024) + vec3(0.028, 0.030, 0.028) * ledDisc;
    outColor = vec4(clamp(housing + lit + halo, 0.0, 1.0), 1.0);
  } else if (u_mode == 4) {
    // Mechanical Split-Flap board (no bloom taps needed)
    vec3 lit = base * mix(0.85, 1.18, clamp((u_brightness - 0.4) / 1.4, 0.0, 1.0));
    float vig = tubeVignette(v_uv, u_glass * 0.5, safeLogical);
    if (u_transparent == 1) {
      outColor = vec4(clamp(lit, 0.0, 1.0), rawSample.a);
      return;
    }
    outColor = vec4(clamp(lit * vig, 0.0, 1.0), 1.0);
  } else if (u_mode == 5) {
    // Station Departure Board (2-column fine LED)
    float mask = dotMatrixMask(shiftedUv, safeLogical, u_dotIntensity * 0.75 * cellAa);
    vec3 lit = base * u_brightness * mask;
    vec3 halo = bloomVec * (u_bloom * 0.45) * u_brightness;
    if (u_transparent == 1) {
      float alpha = clamp(max(rawSample.a, dot(halo, vec3(0.333))), 0.0, 1.0);
      outColor = vec4(clamp(lit + halo, 0.0, 1.0), alpha);
      return;
    }
    vec3 housing = vec3(0.015, 0.018, 0.022) * mask;
    outColor = vec4(clamp(housing + lit + halo, 0.0, 1.0), 1.0);
  } else {
    // Clean modern display
    vec3 lit = base * mix(0.85, 1.15, clamp((u_brightness - 0.5) / 1.5, 0.0, 1.0));
    vec3 halo = bloomVec * (u_bloom * 0.25);
    if (u_transparent == 1) {
      float alpha = clamp(max(rawSample.a, dot(halo, vec3(0.333))), 0.0, 1.0);
      outColor = vec4(clamp(lit + halo, 0.0, 1.0), alpha);
      return;
    }
    outColor = vec4(clamp(lit + halo, 0.0, 1.0), 1.0);
  }
}
`;

interface PersistUniforms {
  u_current: WebGLUniformLocation | null;
  u_prev: WebGLUniformLocation | null;
  u_decay: WebGLUniformLocation | null;
  u_floorSub: WebGLUniformLocation | null;
}

interface BloomUniforms {
  u_tex: WebGLUniformLocation | null;
  u_dir: WebGLUniformLocation | null;
}

interface DisplayUniforms {
  u_tex: WebGLUniformLocation | null;
  u_bloomTex: WebGLUniformLocation | null;
  u_logicalSize: WebGLUniformLocation | null;
  u_viewportSize: WebGLUniformLocation | null;
  u_vfdColor: WebGLUniformLocation | null;
  u_mode: WebGLUniformLocation | null;
  u_brightness: WebGLUniformLocation | null;
  u_dotIntensity: WebGLUniformLocation | null;
  u_bloom: WebGLUniformLocation | null;
  u_vfdGrid: WebGLUniformLocation | null;
  u_glass: WebGLUniformLocation | null;
  u_pixelShift: WebGLUniformLocation | null;
  u_transparent: WebGLUniformLocation | null;
}

export class RendererGL {
  private readonly gl: WebGL2RenderingContext;
  private vao!: WebGLVertexArrayObject;
  private vbo!: WebGLBuffer;
  private persistProgram!: WebGLProgram;
  private bloomProgram!: WebGLProgram;
  private displayProgram!: WebGLProgram;
  private persistUniforms!: PersistUniforms;
  private bloomUniforms!: BloomUniforms;
  private displayUniforms!: DisplayUniforms;
  private srcTexture!: WebGLTexture;
  private srcTexWidth = 0;
  private srcTexHeight = 0;
  private fboTextures: [WebGLTexture, WebGLTexture] | null = null;
  private fbos: [WebGLFramebuffer, WebGLFramebuffer] | null = null;
  private fboWidth = 0;
  private fboHeight = 0;
  private usingHalfFloatFbo = false;
  private bloomTextures: [WebGLTexture, WebGLTexture] | null = null;
  private bloomFbos: [WebGLFramebuffer, WebGLFramebuffer] | null = null;
  private bloomWidth = 0;
  private bloomHeight = 0;
  private pingIndex = 0;
  private usedPersistenceLastFrame = false;
  private contextLost = false;
  private readonly onContextLost: (e: Event) => void;
  private readonly onContextRestored: () => void;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    if (!gl) {
      throw new Error('WebGL2 not supported');
    }
    this.gl = gl;

    this.initResources();

    this.onContextLost = (e: Event) => {
      e.preventDefault();
      this.contextLost = true;
      this.fboTextures = null;
      this.fbos = null;
      this.fboWidth = 0;
      this.fboHeight = 0;
      this.usingHalfFloatFbo = false;
      this.bloomTextures = null;
      this.bloomFbos = null;
      this.bloomWidth = 0;
      this.bloomHeight = 0;
      this.srcTexWidth = 0;
      this.srcTexHeight = 0;
    };
    this.onContextRestored = () => {
      this.contextLost = false;
      this.initResources();
    };
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  private initResources(): void {
    const gl = this.gl;
    this.persistProgram = createProgram(gl, VERTEX_SHADER, PERSISTENCE_FRAG);
    this.bloomProgram = createProgram(gl, VERTEX_SHADER, BLOOM_FRAG);
    this.displayProgram = createProgram(gl, VERTEX_SHADER, DISPLAY_FRAG);

    this.persistUniforms = {
      u_current: gl.getUniformLocation(this.persistProgram, 'u_current'),
      u_prev: gl.getUniformLocation(this.persistProgram, 'u_prev'),
      u_decay: gl.getUniformLocation(this.persistProgram, 'u_decay'),
      u_floorSub: gl.getUniformLocation(this.persistProgram, 'u_floorSub'),
    };
    this.bloomUniforms = {
      u_tex: gl.getUniformLocation(this.bloomProgram, 'u_tex'),
      u_dir: gl.getUniformLocation(this.bloomProgram, 'u_dir'),
    };
    this.displayUniforms = {
      u_tex: gl.getUniformLocation(this.displayProgram, 'u_tex'),
      u_bloomTex: gl.getUniformLocation(this.displayProgram, 'u_bloomTex'),
      u_logicalSize: gl.getUniformLocation(this.displayProgram, 'u_logicalSize'),
      u_viewportSize: gl.getUniformLocation(this.displayProgram, 'u_viewportSize'),
      u_vfdColor: gl.getUniformLocation(this.displayProgram, 'u_vfdColor'),
      u_mode: gl.getUniformLocation(this.displayProgram, 'u_mode'),
      u_brightness: gl.getUniformLocation(this.displayProgram, 'u_brightness'),
      u_dotIntensity: gl.getUniformLocation(this.displayProgram, 'u_dotIntensity'),
      u_bloom: gl.getUniformLocation(this.displayProgram, 'u_bloom'),
      u_vfdGrid: gl.getUniformLocation(this.displayProgram, 'u_vfdGrid'),
      u_glass: gl.getUniformLocation(this.displayProgram, 'u_glass'),
      u_pixelShift: gl.getUniformLocation(this.displayProgram, 'u_pixelShift'),
      u_transparent: gl.getUniformLocation(this.displayProgram, 'u_transparent'),
    };

    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    const srcTexture = gl.createTexture();
    if (!vao || !vbo || !srcTexture) {
      throw new Error('Failed to allocate WebGL2 buffers');
    }
    this.vao = vao;
    this.vbo = vbo;
    this.srcTexture = srcTexture;
    this.srcTexWidth = 0;
    this.srcTexHeight = 0;
    this.fboWidth = 0;
    this.fboHeight = 0;
    this.bloomWidth = 0;
    this.bloomHeight = 0;

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindTexture(gl.TEXTURE_2D, this.srcTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
  }

  render(
    sourceCanvas: HTMLCanvasElement,
    viewportWidth: number,
    viewportHeight: number,
    logicalWidth: number,
    logicalHeight: number,
    display: DisplaySettings,
    pixelShiftX = 0,
    pixelShiftY = 0,
    dtSec = 1 / 60,
    transparent = false,
  ): void {
    if (this.contextLost) return;
    const gl = this.gl;
    if (this.canvas.width !== viewportWidth || this.canvas.height !== viewportHeight) {
      this.canvas.width = viewportWidth;
      this.canvas.height = viewportHeight;
    }

    gl.bindTexture(gl.TEXTURE_2D, this.srcTexture);
    if (this.srcTexWidth === sourceCanvas.width && this.srcTexHeight === sourceCanvas.height) {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
      this.srcTexWidth = sourceCanvas.width;
      this.srcTexHeight = sourceCanvas.height;
    }

    const baseDecay =
      display.visualMode === 'clean' || display.visualMode === 'split-flap'
        ? 0
        : display.visualMode === 'shinkansen-led'
          ? display.persistence * 0.25
          : display.persistence * 0.72;
    const decay = computePersistenceDecay(baseDecay, dtSec);

    let displayTex: WebGLTexture = this.srcTexture;

    if (decay > 0.001) {
      this.ensureFbos(sourceCanvas.width, sourceCanvas.height);
      if (!this.fboTextures || !this.fbos) return;

      const readIdx = this.pingIndex;
      const writeIdx = 1 - this.pingIndex;
      const writeFbo = this.fbos[writeIdx]!;
      const readTex = this.fboTextures[readIdx]!;
      const writeTex = this.fboTextures[writeIdx]!;
      const effectiveDecay = this.usedPersistenceLastFrame ? decay : 0;
      const floorSub = !this.usingHalfFloatFbo && effectiveDecay > 0.5 ? 0.55 / 255.0 : 0.0;

      // Pass 1: persistence blend into write FBO (normalized to 60fps reference)
      gl.bindFramebuffer(gl.FRAMEBUFFER, writeFbo);
      gl.viewport(0, 0, this.fboWidth, this.fboHeight);
      gl.useProgram(this.persistProgram);
      gl.bindVertexArray(this.vao);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.srcTexture);
      gl.uniform1i(this.persistUniforms.u_current, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, readTex);
      gl.uniform1i(this.persistUniforms.u_prev, 1);

      gl.uniform1f(this.persistUniforms.u_decay, effectiveDecay);
      gl.uniform1f(this.persistUniforms.u_floorSub, floorSub);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      this.pingIndex = writeIdx;
      this.usedPersistenceLastFrame = true;
      displayTex = writeTex;
    } else {
      this.usedPersistenceLastFrame = false;
    }

    const modeInt =
      display.visualMode === 'anobar8-vfd'
        ? 0
        : display.visualMode === 'anobar-fed'
          ? 1
          : display.visualMode === 'shinkansen-led'
            ? 3
            : display.visualMode === 'split-flap'
              ? 4
              : display.visualMode === 'station-board'
                ? 5
                : 2;

    let bloomTex: WebGLTexture = displayTex;
    if (display.bloom > 0.001 && modeInt !== 4) {
      const bloomDims = computeBloomDimensions(
        logicalWidth,
        logicalHeight,
        sourceCanvas.width,
        sourceCanvas.height,
      );
      this.ensureBloomFbos(bloomDims.width, bloomDims.height);
      if (this.bloomFbos && this.bloomTextures) {
        const safeLogW = Math.max(1, logicalWidth);
        const safeLogH = Math.max(1, logicalHeight);
        gl.useProgram(this.bloomProgram);
        gl.bindVertexArray(this.vao);

        // Pass B1: horizontal separable blur
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFbos[0]);
        gl.viewport(0, 0, this.bloomWidth, this.bloomHeight);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, displayTex);
        gl.uniform1i(this.bloomUniforms.u_tex, 0);
        gl.uniform2f(this.bloomUniforms.u_dir, 1.0 / safeLogW, 0.0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // Pass B2: vertical separable blur
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFbos[1]);
        gl.viewport(0, 0, this.bloomWidth, this.bloomHeight);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.bloomTextures[0]);
        gl.uniform1i(this.bloomUniforms.u_tex, 0);
        gl.uniform2f(this.bloomUniforms.u_dir, 0.0, 1.0 / safeLogH);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        bloomTex = this.bloomTextures[1];
      }
    }

    // Pass 2: composite to screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, viewportWidth, viewportHeight);
    if (transparent) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.useProgram(this.displayProgram);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, displayTex);
    gl.uniform1i(this.displayUniforms.u_tex, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bloomTex);
    gl.uniform1i(this.displayUniforms.u_bloomTex, 1);

    gl.uniform2f(this.displayUniforms.u_logicalSize, logicalWidth, logicalHeight);
    gl.uniform2f(this.displayUniforms.u_viewportSize, viewportWidth, viewportHeight);

    const paletteRgb = VFD_PALETTES[display.vfdPalette]?.rgb ?? VFD_PALETTES.cyan.rgb;
    gl.uniform3f(this.displayUniforms.u_vfdColor, paletteRgb[0], paletteRgb[1], paletteRgb[2]);

    gl.uniform1i(this.displayUniforms.u_mode, modeInt);
    gl.uniform1f(this.displayUniforms.u_brightness, display.brightness);
    gl.uniform1f(this.displayUniforms.u_dotIntensity, display.dotIntensity);
    gl.uniform1f(this.displayUniforms.u_bloom, display.bloom);
    gl.uniform1f(this.displayUniforms.u_vfdGrid, display.vfdGridIntensity);
    gl.uniform1f(this.displayUniforms.u_glass, display.vfdGlassReflection);
    gl.uniform2f(this.displayUniforms.u_pixelShift, pixelShiftX, pixelShiftY);
    gl.uniform1i(this.displayUniforms.u_transparent, transparent ? 1 : 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    const gl = this.gl;
    this.destroyFbos();
    this.destroyBloomFbos();
    gl.deleteTexture(this.srcTexture);
    gl.deleteBuffer(this.vbo);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.persistProgram);
    gl.deleteProgram(this.bloomProgram);
    gl.deleteProgram(this.displayProgram);
  }

  private ensureFbos(width: number, height: number): void {
    if (this.fboWidth === width && this.fboHeight === height && this.fbos) {
      return;
    }
    const gl = this.gl;
    this.destroyFbos();

    const canHalfFloat = Boolean(
      gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('EXT_color_buffer_float'),
    );
    if (canHalfFloat && this.allocatePersistencePair(width, height, true)) {
      this.usingHalfFloatFbo = true;
      return;
    }

    this.usingHalfFloatFbo = false;
    if (!this.allocatePersistencePair(width, height, false)) {
      throw new Error('Failed to create ping-pong FBO');
    }
  }

  private allocatePersistencePair(width: number, height: number, useHalfFloat: boolean): boolean {
    const gl = this.gl;
    const textures: WebGLTexture[] = [];
    const fbos: WebGLFramebuffer[] = [];
    const internalFormat = useHalfFloat ? gl.RGBA16F : gl.RGBA;
    const type = useHalfFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

    for (let i = 0; i < 2; i += 1) {
      const tex = gl.createTexture();
      const fbo = gl.createFramebuffer();
      if (!tex || !fbo) {
        for (const f of fbos) gl.deleteFramebuffer(f);
        for (const t of textures) gl.deleteTexture(t);
        if (fbo) gl.deleteFramebuffer(fbo);
        if (tex) gl.deleteTexture(tex);
        return false;
      }
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, gl.RGBA, type, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.deleteFramebuffer(fbo);
        gl.deleteTexture(tex);
        for (const f of fbos) gl.deleteFramebuffer(f);
        for (const t of textures) gl.deleteTexture(t);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return false;
      }
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      textures.push(tex);
      fbos.push(fbo);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.fboTextures = [textures[0]!, textures[1]!];
    this.fbos = [fbos[0]!, fbos[1]!];
    this.fboWidth = width;
    this.fboHeight = height;
    this.pingIndex = 0;
    return true;
  }

  private ensureBloomFbos(width: number, height: number): void {
    if (this.bloomWidth === width && this.bloomHeight === height && this.bloomFbos) {
      return;
    }
    const gl = this.gl;
    this.destroyBloomFbos();

    const textures: WebGLTexture[] = [];
    const fbos: WebGLFramebuffer[] = [];
    for (let i = 0; i < 2; i += 1) {
      const tex = gl.createTexture();
      const fbo = gl.createFramebuffer();
      if (!tex || !fbo) {
        throw new Error('Failed to create bloom FBO');
      }
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      textures.push(tex);
      fbos.push(fbo);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.bloomTextures = [textures[0]!, textures[1]!];
    this.bloomFbos = [fbos[0]!, fbos[1]!];
    this.bloomWidth = width;
    this.bloomHeight = height;
  }

  private destroyFbos(): void {
    const gl = this.gl;
    if (this.fbos) {
      for (const f of this.fbos) gl.deleteFramebuffer(f);
      this.fbos = null;
    }
    if (this.fboTextures) {
      for (const t of this.fboTextures) gl.deleteTexture(t);
      this.fboTextures = null;
    }
    this.fboWidth = 0;
    this.fboHeight = 0;
  }

  private destroyBloomFbos(): void {
    const gl = this.gl;
    if (this.bloomFbos) {
      for (const f of this.bloomFbos) gl.deleteFramebuffer(f);
      this.bloomFbos = null;
    }
    if (this.bloomTextures) {
      for (const t of this.bloomTextures) gl.deleteTexture(t);
      this.bloomTextures = null;
    }
    this.bloomWidth = 0;
    this.bloomHeight = 0;
  }
}

function createProgram(
  gl: WebGL2RenderingContext,
  vsSource: string,
  fsSource: string,
): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const program = gl.createProgram();
  if (!program) {
    throw new Error('Failed to create WebGL program');
  }
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? 'Unknown link error';
    gl.deleteProgram(program);
    throw new Error(`WebGL link failed: ${log}`);
  }
  return program;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error('Failed to create shader');
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'Unknown compile error';
    gl.deleteShader(shader);
    throw new Error(`WebGL shader compile failed: ${log}`);
  }
  return shader;
}
