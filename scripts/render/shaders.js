export const worldVS = `
attribute vec3 position;
attribute vec3 normal;
attribute vec3 color;

varying vec3 vNormal;
varying vec3 vColor;
varying float vDistance;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

void main() {
    vNormal = normal;
    vColor = color;

    vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
    vDistance = length(viewPos.xyz);
    gl_Position = projectionMatrix * viewPos;
}`
    ;

export const worldFS = `precision mediump float;

varying vec3 vNormal;
varying vec3 vColor;
varying float vDistance;

uniform float uChunkFade;
uniform vec3 uMaterialColor;

uniform float uDaylight;

uniform vec3 uSkyColor;
uniform float uSkyFadeStart;
uniform float uSkyFadeEnd;

uniform vec3 uFogColor;
uniform float uFogFadeStart;
uniform float uFogFadeEnd;

void main() {
    vec3 norm = normalize(vNormal);
    
    vec3 lightTop = vec3(0.0, 1.0, 0.0);
    vec3 lightBottom = vec3(0.0, -1.0, 0.0);
    vec3 lightPosX = vec3(1.0, 0.0, 0.0);
    vec3 lightNegX = vec3(-1.0, 0.0, 0.0);
    vec3 lightPosZ = vec3(0.0, 0.0, 1.0);
    vec3 lightNegZ = vec3(0.0, 0.0, -1.0);

    float light = 0.1;
    light += max(dot(norm, lightTop), 0.0) * 1.0;
    light += max(dot(norm, lightBottom), 0.0) * 0.25;
    light += max(dot(norm, lightPosX), 0.0) * 0.8;
    light += max(dot(norm, lightNegX), 0.0) * 0.75;
    light += max(dot(norm, lightPosZ), 0.0) * 0.6;
    light += max(dot(norm, lightNegZ), 0.0) * 0.55;

    vec3 litColor = vColor * uMaterialColor * light;

    // Apply fog effect
    float fogFactor = 1.0 - smoothstep(uFogFadeStart, uFogFadeEnd, vDistance);
    vec3 fogColor = mix(uFogColor, litColor, fogFactor);

    // Apply distance fade
    float distanceFadeFactor = 1.0 - smoothstep(uSkyFadeStart, uSkyFadeEnd, vDistance);
    vec3 distanceFadeColor = mix(uSkyColor, fogColor, distanceFadeFactor);
    
    vec3 black = vec3(0.0, 0.0, 0.0);
    vec3 darkenedColor = mix(black, distanceFadeColor, uDaylight);

    // Apply chunk fade
    vec3 chunkFadeColor = mix(uSkyColor, darkenedColor, uChunkFade);


    gl_FragColor = vec4(chunkFadeColor, 1.0);
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
    gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
}`;
