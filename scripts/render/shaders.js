export const worldVS = `
attribute vec3 position;
attribute vec3 normal;
attribute vec3 color;
varying vec3 vNormal;
varying vec3 vColor;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
void main() {
  vNormal = normal;
  vColor = color;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
    ;

export const worldFS = `precision mediump float;

varying vec3 vNormal;
varying vec3 vColor;

void main() {
    vec3 norm = normalize(vNormal);
    
    vec3 lightTop = vec3(0.0, 1.0, 0.0);
    vec3 lightBottom = vec3(0.0, -1.0, 0.0);
    vec3 lightPosX = vec3(1.0, 0.0, 0.0);
    vec3 lightNegX = vec3(-1.0, 0.0, 0.0);
    vec3 lightPosZ = vec3(0.0, 0.0, 1.0);
    vec3 lightNegZ = vec3(0.0, 0.0, -1.0);

    float light = 0.0;
    light += max(dot(norm, lightTop), 0.0) * 1.0;
    light += max(dot(norm, lightBottom), 0.0) * 0.25;
    light += max(dot(norm, lightPosX), 0.0) * 0.8;
    light += max(dot(norm, lightNegX), 0.0) * 0.75;
    light += max(dot(norm, lightPosZ), 0.0) * 0.6;
    light += max(dot(norm, lightNegZ), 0.0) * 0.55;

    float ambient = 0.1;
    if (dot(norm, vec3(0.0, -1.0, 0.0)) > 0.0) light += 0.1;
    else light += ambient;

    gl_FragColor = vec4(vColor * light, 1.0);
}`
    ;

export const outlineVS = `
attribute vec3 position;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

export const outlineFS = `
precision mediump float;
void main() {
    gl_FragColor = vec4(0, 0, 0, 1.0);
}`;