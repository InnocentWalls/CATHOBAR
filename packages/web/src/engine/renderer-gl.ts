import { VFD_PALETTES, type DisplaySettings } from '@cathobar/shared';

const VERTEX_SHADER = `#version 300 es
in vec2 a_pos;
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
out vec4 outColor;
void main() {
  vec4 curr = texture(u_current, v_uv);
  vec4 prev = texture(u_prev, v_uv);
  vec3 trail = prev.rgb * u_decay;
  outColor = vec4(max(curr.rgb, trail), max(curr.a, prev.a * u_decay));
}
`;

const DISPLAY_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_logicalSize;
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

vec3 sampleGlow(sampler2D tex, vec2 uv, vec2 px) {
  vec3 acc = vec3(0.0);
  acc += texture(tex, uv + vec2( px.x,  0.0)).rgb;
  acc += texture(tex, uv + vec2(-px.x,  0.0)).rgb;
  acc += texture(tex, uv + vec2( 0.0,  px.y)).rgb;
  acc += texture(tex, uv + vec2( 0.0, -px.y)).rgb;
  acc += texture(tex, uv + vec2( px.x,  px.y)).rgb * 0.7;
  acc += texture(tex, uv + vec2(-px.x,  px.y)).rgb * 0.7;
  acc += texture(tex, uv + vec2( px.x, -px.y)).rgb * 0.7;
  acc += texture(tex, uv + vec2(-px.x, -px.y)).rgb * 0.7;
  return acc / 6.8;
}

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
  float filament = 1.0 - 0.14 * (1.0 - smoothstep(0.0, 0.012, abs(fract(uv.y * 4.0) - 0.5)));
  float meshDarken = mix(1.0, 1.0 - 0.28 * wire, intensity);
  return meshDarken * mix(1.0, filament, intensity);
}

vec3 vfdGlassEffect(vec2 uv, float glassStrength) {
  if (glassStrength <= 0.001) return vec3(0.0);
  float diag = smoothstep(0.35, 0.0, abs((uv.x * 0.45 + uv.y) - 1.15));
  float topRim = smoothstep(0.14, 0.0, 1.0 - uv.y) * 0.55;
  return vec3(0.11, 0.16, 0.18) * (diag * 0.24 + topRim * 0.35) * glassStrength;
}

float tubeVignette(vec2 uv, float glassStrength) {
  vec2 centered = (uv - 0.5) * 2.0;
  float edgeDist = dot(centered * vec2(0.45, 0.85), centered * vec2(0.45, 0.85));
  return mix(1.0, 1.0 - clamp(edgeDist * 0.28, 0.0, 0.38), glassStrength);
}

void main() {
  vec2 px = 1.0 / max(u_logicalSize, vec2(1.0));
  vec2 shiftedUv = clamp(v_uv + u_pixelShift * px, vec2(0.0), vec2(1.0));

  vec4 rawSample = texture(u_tex, shiftedUv);
  vec3 base = rawSample.rgb;
  vec3 glowNear = sampleGlow(u_tex, shiftedUv, px * 1.15);
  vec3 glowWide = sampleGlow(u_tex, shiftedUv, px * 2.4);
  vec3 bloomVec = glowNear * 0.65 + glowWide * 0.35;

  if (u_mode == 0) {
    // ANOBAR8 VFD 16-level monochrome quantization + mesh grid + glass sheen
    float luma = dot(base, vec3(0.299, 0.587, 0.114));
    float q = floor(clamp(luma * u_brightness, 0.0, 1.0) * 15.0 + 0.5) / 15.0;
    float mask = dotMatrixMask(shiftedUv, u_logicalSize, u_dotIntensity);
    float mesh = vfdAnodeMesh(shiftedUv, u_logicalSize, u_vfdGrid);
    float bloomLuma = dot(bloomVec, vec3(0.299, 0.587, 0.114));
    vec3 lit = u_vfdColor * q * mask * mesh;
    vec3 halo = u_vfdColor * bloomLuma * u_bloom * u_brightness;
    if (u_transparent == 1) {
      float alpha = clamp(rawSample.a * (0.2 + q) + bloomLuma * u_bloom * 0.7, 0.0, 1.0);
      outColor = vec4(clamp(lit + halo, 0.0, 1.0), alpha);
      return;
    }
    vec3 unlitMesh = u_vfdColor * (0.018 + 0.014 * mask * mesh);
    vec3 glass = vfdGlassEffect(v_uv, u_glass);
    float vig = tubeVignette(v_uv, u_glass);
    outColor = vec4(clamp((unlitMesh + lit + halo) * vig + glass, 0.0, 1.0), 1.0);
  } else if (u_mode == 1) {
    // Original ANOBAR FED full-color self-luminous dot matrix
    float mask = dotMatrixMask(shiftedUv, u_logicalSize, u_dotIntensity);
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
    vec2 cellUv = (floor(shiftedUv * u_logicalSize) + 0.5) / max(u_logicalSize, vec2(1.0));
    vec4 cellSample = texture(u_tex, cellUv);
    vec3 cellBase = cellSample.rgb;
    vec2 cellPos = fract(shiftedUv * u_logicalSize) - 0.5;
    float radius = length(cellPos);
    float ledDisc = 1.0 - smoothstep(0.30, 0.47, radius);
    float ledCore = 1.0 - smoothstep(0.0, 0.28, radius);
    float ledMask = mix(1.0, ledDisc, max(0.35, u_dotIntensity));
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
    // Mechanical Split-Flap board
    vec3 lit = base * mix(0.85, 1.18, clamp((u_brightness - 0.4) / 1.4, 0.0, 1.0));
    float vig = tubeVignette(v_uv, u_glass * 0.5);
    if (u_transparent == 1) {
      outColor = vec4(clamp(lit, 0.0, 1.0), rawSample.a);
      return;
    }
    outColor = vec4(clamp(lit * vig, 0.0, 1.0), 1.0);
  } else if (u_mode == 5) {
    // Station Departure Board (2-column fine LED)
    float mask = dotMatrixMask(shiftedUv, u_logicalSize, u_dotIntensity * 0.75);
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
}

interface DisplayUniforms {
  u_tex: WebGLUniformLocation | null;
  u_logicalSize: WebGLUniformLocation | null;
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
  private displayProgram!: WebGLProgram;
  private persistUniforms!: PersistUniforms;
  private displayUniforms!: DisplayUniforms;
  private srcTexture!: WebGLTexture;
  private srcTexWidth = 0;
  private srcTexHeight = 0;
  private fboTextures: [WebGLTexture, WebGLTexture] | null = null;
  private fbos: [WebGLFramebuffer, WebGLFramebuffer] | null = null;
  private fboWidth = 0;
  private fboHeight = 0;
  private pingIndex = 0;
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
    this.displayProgram = createProgram(gl, VERTEX_SHADER, DISPLAY_FRAG);

    this.persistUniforms = {
      u_current: gl.getUniformLocation(this.persistProgram, 'u_current'),
      u_prev: gl.getUniformLocation(this.persistProgram, 'u_prev'),
      u_decay: gl.getUniformLocation(this.persistProgram, 'u_decay'),
    };
    this.displayUniforms = {
      u_tex: gl.getUniformLocation(this.displayProgram, 'u_tex'),
      u_logicalSize: gl.getUniformLocation(this.displayProgram, 'u_logicalSize'),
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

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const locP = gl.getAttribLocation(this.persistProgram, 'a_pos');
    gl.enableVertexAttribArray(locP);
    gl.vertexAttribPointer(locP, 2, gl.FLOAT, false, 0, 0);

    const locD = gl.getAttribLocation(this.displayProgram, 'a_pos');
    gl.enableVertexAttribArray(locD);
    gl.vertexAttribPointer(locD, 2, gl.FLOAT, false, 0, 0);

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

    this.ensureFbos(sourceCanvas.width, sourceCanvas.height);
    if (!this.fboTextures || !this.fbos) return;

    gl.bindTexture(gl.TEXTURE_2D, this.srcTexture);
    if (this.srcTexWidth === sourceCanvas.width && this.srcTexHeight === sourceCanvas.height) {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
      this.srcTexWidth = sourceCanvas.width;
      this.srcTexHeight = sourceCanvas.height;
    }

    const readIdx = this.pingIndex;
    const writeIdx = 1 - this.pingIndex;
    const writeFbo = this.fbos[writeIdx]!;
    const readTex = this.fboTextures[readIdx]!;
    const writeTex = this.fboTextures[writeIdx]!;

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

    const baseDecay =
      display.visualMode === 'clean' || display.visualMode === 'split-flap'
        ? 0
        : display.visualMode === 'shinkansen-led'
          ? display.persistence * 0.25
          : display.persistence * 0.72;
    const frameScale = Math.max(0.1, Math.min(4, dtSec * 60));
    const decay = baseDecay > 0 ? Math.pow(baseDecay, frameScale) : 0;
    gl.uniform1f(this.persistUniforms.u_decay, decay);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    this.pingIndex = writeIdx;

    // Pass 2: composite to screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, viewportWidth, viewportHeight);
    if (transparent) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.useProgram(this.displayProgram);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, writeTex);
    gl.uniform1i(this.displayUniforms.u_tex, 0);
    gl.uniform2f(this.displayUniforms.u_logicalSize, logicalWidth, logicalHeight);

    const paletteRgb = VFD_PALETTES[display.vfdPalette]?.rgb ?? VFD_PALETTES.cyan.rgb;
    gl.uniform3f(this.displayUniforms.u_vfdColor, paletteRgb[0], paletteRgb[1], paletteRgb[2]);

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
    gl.deleteTexture(this.srcTexture);
    gl.deleteBuffer(this.vbo);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.persistProgram);
    gl.deleteProgram(this.displayProgram);
  }

  private ensureFbos(width: number, height: number): void {
    if (this.fboWidth === width && this.fboHeight === height && this.fbos) {
      return;
    }
    const gl = this.gl;
    this.destroyFbos();

    const textures: WebGLTexture[] = [];
    const fbos: WebGLFramebuffer[] = [];
    for (let i = 0; i < 2; i += 1) {
      const tex = gl.createTexture();
      const fbo = gl.createFramebuffer();
      if (!tex || !fbo) {
        throw new Error('Failed to create ping-pong FBO');
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
    this.fboTextures = [textures[0]!, textures[1]!];
    this.fbos = [fbos[0]!, fbos[1]!];
    this.fboWidth = width;
    this.fboHeight = height;
    this.pingIndex = 0;
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
