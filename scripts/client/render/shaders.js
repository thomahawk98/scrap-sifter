export const worldVS = `
attribute vec3 position;
attribute vec3 normal;
attribute vec3 color;
attribute vec2 textureUV;
attribute float textureIndex;
attribute float shade;

varying vec3 vNormal;
varying vec3 vColor;
varying float vDistance;
varying vec2 vTextureUV;
varying float vTextureIndex;
varying float vShade;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uTextureBase;

void main() {
    vNormal = normal;
    vColor = color;
    vTextureUV = textureUV;
    vTextureIndex = uTextureBase < 0.0 ? -1.0 : textureIndex + uTextureBase;
    vShade = shade;

    vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
    vDistance = length(viewPos.xyz);
    gl_Position = projectionMatrix * viewPos;
}`
    ;

export const worldFS = `precision mediump float;

varying vec3 vNormal;
varying vec3 vColor;
varying float vDistance;
varying vec2 vTextureUV;
varying float vTextureIndex;
varying float vShade;

uniform float uChunkFade;
uniform vec3 uMaterialColor;
uniform sampler2D uTextureAtlas;
uniform vec2 uTextureGrid;
uniform float uTexturesEnabled;
uniform float uTextureTileSize;

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

    vec3 surfaceColor = vColor * uMaterialColor;
    if (uTexturesEnabled > 0.5 && vTextureIndex >= 0.0) {
        float tileRow = floor(vTextureIndex / uTextureGrid.x);
        float tileColumn = vTextureIndex - tileRow * uTextureGrid.x;
        vec2 faceUV = (vTextureUV * (uTextureTileSize - 1.0) + 0.5) / uTextureTileSize;
        vec2 atlasUV = vec2(
            (tileColumn + faceUV.x) / uTextureGrid.x,
            (uTextureGrid.y - tileRow - 1.0 + faceUV.y) / uTextureGrid.y
        );
        vec4 texel = texture2D(uTextureAtlas, atlasUV);
        surfaceColor = texel.a > 0.5 ? texel.rgb : surfaceColor;
    }
    vec3 litColor = surfaceColor * vShade * light;

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
