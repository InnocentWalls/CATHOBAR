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
  outColor = vec4(max(curr.rgb, trail), 1.0);
}
`;

const DISPLAY_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_logicalSize;
uniform vec3 u_vfdColor;
uniform int u_mode; // 0 = anobar8-vfd, 1 = anobar-fed, 2 = clean
uniform float u_brightness;
uniform float u_dotIntensity;
uniform float u_bloom;
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

void main() {
  vec2 px = 1.0 / max(u_logicalSize, vec2(1.0));
  vec3 base = texture(u_tex, v_uv).rgb;
  vec3 glowNear = sampleGlow(u_tex, v_uv, px * 1.15);
  vec3 glowWide = sampleGlow(u_tex, v_uv, px * 2.4);
  vec3 bloomVec = glowNear * 0.65 + glowWide * 0.35;

  if (u_mode == 0) {
    // ANOBAR8 VFD 16-level monochrome quantization
    float luma = dot(base, vec3(0.299, 0.587, 0.114));
    float q = floor(clamp(luma * u_brightness, 0.0, 1.0) * 15.0 + 0.5) / 15.0;
    float mask = dotMatrixMask(v_uv, u_logicalSize, u_dotIntensity);
    float bloomLuma = dot(bloomVec, vec3(0.299, 0.587, 0.114));
    vec3 lit = u_vfdColor * q * mask;
    vec3 halo = u_vfdColor * bloomLuma * u_bloom * u_brightness;
    vec3 unlitMesh = u_vfdColor * (0.018 + 0.012 * mask);
    outColor = vec4(clamp(unlitMesh + lit + halo, 0.0, 1.0), 1.0);
  } else if (u_mode == 1) {
    // Original ANOBAR FED full-color self-luminous dot matrix
    float mask = dotMatrixMask(v_uv, u_logicalSize, u_dotIntensity);
    vec3 lit = base * u_brightness * mask;
    vec3 halo = bloomVec * u_bloom * u_brightness;
    vec3 unlitMesh = vec3(0.012, 0.016, 0.022) * mask;
    outColor = vec4(clamp(unlitMesh + lit + halo, 0.0, 1.0), 1.0);
  } else {
    // Clean modern display
    vec3 lit = base * mix(0.85, 1.15, clamp((u_brightness - 0.5) / 1.5, 0.0, 1.0));
    vec3 halo = bloomVec * (u_bloom * 0.25);
    outColor = vec4(clamp(lit + halo, 0.0, 1.0), 1.0);
  }
}
`;

export class RendererGL {
  private readonly gl: WebGL2RenderingContext;
  private readonly vao: WebGLVertexArrayObject;
  private readonly vbo: WebGLBuffer;
  private readonly persistProgram: WebGLProgram;
  private readonly displayProgram: WebGLProgram;
  private readonly srcTexture: WebGLTexture;
  private fboTextures: [WebGLTexture, WebGLTexture] | null = null;
  private fbos: [WebGLFramebuffer, WebGLFramebuffer] | null = null;
  private fboWidth = 0;
  private fboHeight = 0;
  private pingIndex = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    if (!gl) {
      throw new Error('WebGL2 not supported');
    }
    this.gl = gl;

    this.persistProgram = createProgram(gl, VERTEX_SHADER, PERSISTENCE_FRAG);
    this.displayProgram = createProgram(gl, VERTEX_SHADER, DISPLAY_FRAG);

    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    const srcTexture = gl.createTexture();
    if (!vao || !vbo || !srcTexture) {
      throw new Error('Failed to allocate WebGL2 buffers');
    }
    this.vao = vao;
    this.vbo = vbo;
    this.srcTexture = srcTexture;

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
  ): void {
    const gl = this.gl;
    if (this.canvas.width !== viewportWidth || this.canvas.height !== viewportHeight) {
      this.canvas.width = viewportWidth;
      this.canvas.height = viewportHeight;
    }

    this.ensureFbos(sourceCanvas.width, sourceCanvas.height);
    if (!this.fboTextures || !this.fbos) return;

    gl.bindTexture(gl.TEXTURE_2D, this.srcTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);

    const readIdx = this.pingIndex;
    const writeIdx = 1 - this.pingIndex;
    const writeFbo = this.fbos[writeIdx]!;
    const readTex = this.fboTextures[readIdx]!;
    const writeTex = this.fboTextures[writeIdx]!;

    // Pass 1: persistence blend into write FBO
    gl.bindFramebuffer(gl.FRAMEBUFFER, writeFbo);
    gl.viewport(0, 0, this.fboWidth, this.fboHeight);
    gl.useProgram(this.persistProgram);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.srcTexture);
    gl.uniform1i(gl.getUniformLocation(this.persistProgram, 'u_current'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, readTex);
    gl.uniform1i(gl.getUniformLocation(this.persistProgram, 'u_prev'), 1);

    const decay = display.visualMode === 'clean' ? 0 : display.persistence * 0.72;
    gl.uniform1f(gl.getUniformLocation(this.persistProgram, 'u_decay'), decay);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    this.pingIndex = writeIdx;

    // Pass 2: composite to screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, viewportWidth, viewportHeight);
    gl.useProgram(this.displayProgram);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, writeTex);
    gl.uniform1i(gl.getUniformLocation(this.displayProgram, 'u_tex'), 0);
    gl.uniform2f(
      gl.getUniformLocation(this.displayProgram, 'u_logicalSize'),
      logicalWidth,
      logicalHeight,
    );

    const paletteRgb = VFD_PALETTES[display.vfdPalette]?.rgb ?? VFD_PALETTES.cyan.rgb;
    gl.uniform3f(
      gl.getUniformLocation(this.displayProgram, 'u_vfdColor'),
      paletteRgb[0],
      paletteRgb[1],
      paletteRgb[2],
    );

    const modeInt =
      display.visualMode === 'anobar8-vfd' ? 0 : display.visualMode === 'anobar-fed' ? 1 : 2;
    gl.uniform1i(gl.getUniformLocation(this.displayProgram, 'u_mode'), modeInt);
    gl.uniform1f(gl.getUniformLocation(this.displayProgram, 'u_brightness'), display.brightness);
    gl.uniform1f(gl.getUniformLocation(this.displayProgram, 'u_dotIntensity'), display.dotIntensity);
    gl.uniform1f(gl.getUniformLocation(this.displayProgram, 'u_bloom'), display.bloom);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  dispose(): void {
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
      gl.clearColor(0, 0, 0, 1);
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
