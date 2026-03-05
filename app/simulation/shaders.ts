export const vertexSource = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const fragmentSource = `#version 300 es
precision highp float;

uniform sampler2D u_feedback;
uniform vec2 u_resolution;
uniform float u_time;

uniform float u_panX;
uniform float u_panY;
uniform float u_pitch;
uniform float u_yaw;
uniform float u_distance;

uniform float u_flameRadius;
uniform float u_flameHue;
uniform float u_flameLightness;
uniform float u_flameOffsetX;
uniform float u_flameOffsetY;

uniform float u_gain;
uniform float u_bias;
uniform float u_hBlur;  // 1.0 = display pass: apply horizontal blur

in vec2 v_uv;

out vec4 outColor;

vec3 hslToRgb(float h, float s, float l) {
  float c = (1.0 - abs(2.0 * l - 1.0)) * s;
  float x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
  float m = l - c * 0.5;
  if (h < 1.0/6.0) return vec3(c + m, x + m, m);
  if (h < 2.0/6.0) return vec3(x + m, c + m, m);
  if (h < 3.0/6.0) return vec3(m, c + m, x + m);
  if (h < 4.0/6.0) return vec3(m, x + m, c + m);
  if (h < 5.0/6.0) return vec3(x + m, m, c + m);
  return vec3(c + m, m, x + m);
}

void main() {
  float scale = u_distance;
  float c = cos(-u_yaw);
  float s = sin(-u_yaw);
  vec2 uv = v_uv - 0.5;
  uv /= scale;
  uv = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c);
  uv += 0.5 + vec2(u_panX, u_panY);

  // Anything beyond the canvas edge is black (avoids white bleed from wrap/edge)
  // Display pass only (u_hBlur > 0): horizontal blur, width 1/500 of pane
  vec4 feedback;
  if (uv.x < 0.0 || uv.x >= 1.0 || uv.y < 0.0 || uv.y >= 1.0) {
    feedback = vec4(0.0, 0.0, 0.0, 1.0);
  } else if (u_hBlur > 0.5) {
    const float BLUR_WIDTH = 1.0 / 500.0;  // total blur width = 1/500 of pane
    float step = BLUR_WIDTH * 0.25;       // 5 taps over width → step 1/2000
    float o0 = -2.0 * step;
    float o1 = -1.0 * step;
    float o3 =  1.0 * step;
    float o4 =  2.0 * step;
    vec4 t0 = (uv.x + o0 >= 0.0 && uv.x + o0 < 1.0) ? texture(u_feedback, uv + vec2(o0, 0.0)) : vec4(0.0, 0.0, 0.0, 1.0);
    vec4 t1 = (uv.x + o1 >= 0.0 && uv.x + o1 < 1.0) ? texture(u_feedback, uv + vec2(o1, 0.0)) : vec4(0.0, 0.0, 0.0, 1.0);
    vec4 t2 = texture(u_feedback, uv);
    vec4 t3 = (uv.x + o3 >= 0.0 && uv.x + o3 < 1.0) ? texture(u_feedback, uv + vec2(o3, 0.0)) : vec4(0.0, 0.0, 0.0, 1.0);
    vec4 t4 = (uv.x + o4 >= 0.0 && uv.x + o4 < 1.0) ? texture(u_feedback, uv + vec2(o4, 0.0)) : vec4(0.0, 0.0, 0.0, 1.0);
    feedback = 0.06 * t0 + 0.24 * t1 + 0.4 * t2 + 0.24 * t3 + 0.06 * t4;
  } else {
    feedback = texture(u_feedback, uv);
  }

  vec2 flameCentre = 0.5 - (1.0 / u_distance) * vec2(
    cos(u_yaw) * u_panX + sin(u_yaw) * u_panY,
    -sin(u_yaw) * u_panX + cos(u_yaw) * u_panY
  );
  flameCentre += vec2(u_flameOffsetX, u_flameOffsetY);
  float d = length(v_uv - flameCentre);
  float flame = 1.0 - smoothstep(u_flameRadius * 0.5, u_flameRadius, d);
  vec3 flameColor = hslToRgb(u_flameHue, 0.9, u_flameLightness);
  vec3 color = feedback.rgb + flame * flameColor;

  // Feedback pass: CRT 625 scan lines (soft/blurred) + bottom-10% black curve + brightness lift
  if (u_gain < 1.0) {
    // 625 scan lines: soft, blurred gap (old CRT + video camera)
    const float SCAN_LINES = 625.0;
    float t = fract(v_uv.y * SCAN_LINES);
    float gap = exp(-t * t * 45.0) + exp(-(1.0 - t) * (1.0 - t) * 45.0);
    float scanFactor = 1.0 - 0.45 * gap;
    color *= scanFactor;

    // Brightness curve: crush bottom 10% to black, remap 0.1..1 -> 0..1
    const float BLACK_POINT = 0.1;
    color = clamp((color - BLACK_POINT) / (1.0 - BLACK_POINT), 0.0, 1.0);

    // Lift brightness (keep black at bottom)
    color = clamp(color * 1.4, 0.0, 1.0);
  } else {
    color = u_gain * color + u_bias;
  }
  // Clamp to avoid feedback blow-out to white
  color = clamp(color, 0.0, 1.0);

  outColor = vec4(color, 1.0);
}
`;
