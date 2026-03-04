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

uniform float u_gain;
uniform float u_bias;

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
  vec4 feedback;
  if (uv.x < 0.0 || uv.x >= 1.0 || uv.y < 0.0 || uv.y >= 1.0) {
    feedback = vec4(0.0, 0.0, 0.0, 1.0);
  } else {
    feedback = texture(u_feedback, uv);
  }

  vec2 flameCentre = 0.5 - (1.0 / u_distance) * vec2(
    cos(u_yaw) * u_panX + sin(u_yaw) * u_panY,
    -sin(u_yaw) * u_panX + cos(u_yaw) * u_panY
  );
  float d = length(v_uv - flameCentre);
  float flame = 1.0 - smoothstep(u_flameRadius * 0.5, u_flameRadius, d);
  vec3 flameColor = hslToRgb(u_flameHue, 0.9, u_flameLightness);
  vec3 color = feedback.rgb + flame * flameColor;

  color = u_gain * color + u_bias;
  // Clamp to avoid feedback blow-out to white
  color = clamp(color, 0.0, 1.0);

  outColor = vec4(color, 1.0);
}
`;
