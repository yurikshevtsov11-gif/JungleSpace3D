
import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SAOPass } from 'three/addons/postprocessing/SAOPass.js';
import { KandinskyShape, PhilosophyFragment, FlyingChar, PlanetConfig } from '../types';

interface VisualizerProps {
  shapes: KandinskyShape[];
  fragments: PhilosophyFragment[];
  flyingChars: FlyingChar[];
  isStarted: boolean;
  isWarping: boolean;
  isLanded: boolean;
  planetConfig: PlanetConfig;
  onFpsUpdate: (fps: number) => void;
  glowEnabled: boolean; 
  glitchEnabled: boolean;
  glitchIntensity: number;
  bloomIntensity: number;
  noiseIntensity: number;
  aoEnabled: boolean;
  aoRadius: number;
  aoIntensity: number;
  aoBlur: number;
  aoDistance: number;
  godRaysEnabled: boolean;
  godRaysExposure: number;
  godRaysDensity: number;
  godRaysDecay: number;
  chromaticEnabled: boolean;
  chromaticIntensity: number;
  shapeGlowIntensity: number;
}

const geometries = {
  sphere: new THREE.SphereGeometry(1, 32, 32),
  torus: new THREE.TorusGeometry(1, 0.4, 16, 64),
  octahedron: new THREE.OctahedronGeometry(1.5, 0),
  cylinder: new THREE.CylinderGeometry(0.1, 0.1, 50, 8),
  box: new THREE.BoxGeometry(2, 2, 2)
};

const ChromaticAberrationShader = {
  uniforms: { 'tDiffuse': { value: null }, 'amount': { value: 0.003 } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float amount; varying vec2 vUv; void main() { vec4 col; col.r = texture2D(tDiffuse, vUv + vec2(amount, 0.0)).r; col.g = texture2D(tDiffuse, vUv).g; col.b = texture2D(tDiffuse, vUv - vec2(amount, 0.0)).b; col.a = texture2D(tDiffuse, vUv).a; gl_FragColor = col; }`
};

const NoiseShader = {
  uniforms: { 'tDiffuse': { value: null }, 'amount': { value: 0.05 }, 'time': { value: 0.0 } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float amount; uniform float time; varying vec2 vUv; float rand(vec2 co){ return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453); } void main() { vec4 color = texture2D(tDiffuse, vUv); float n = rand(vUv + fract(time)) * amount; gl_FragColor = vec4(color.rgb + n, color.a); }`
};

const GlitchShader = {
  uniforms: { 'tDiffuse': { value: null }, 'amount': { value: 0.1 }, 'time': { value: 0.0 } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float amount; uniform float time; varying vec2 vUv;
    float rand(vec2 co){ return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      if (amount > 0.0) {
        float r = rand(vec2(floor(time * 10.0), floor(uv.y * 20.0)));
        if (r < amount * 0.1) {
          uv.x += (rand(vec2(time, uv.y)) - 0.5) * amount * 0.2;
        }
      }
      gl_FragColor = texture2D(tDiffuse, uv);
    }
  `
};

const GodRaysShader = {
  uniforms: {
    tDiffuse: { value: null },
    fExposure: { value: 0.6 },
    fDecay: { value: 0.93 },
    fDensity: { value: 0.96 },
    fWeight: { value: 0.4 },
    vSunPositionScreen: { value: new THREE.Vector2(0.5, 0.5) }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float fExposure;
    uniform float fDecay;
    uniform float fDensity;
    uniform float fWeight;
    uniform vec2 vSunPositionScreen;
    varying vec2 vUv;

    const int nSamples = 60;

    void main() {
      vec2 deltaTextCoord = vec2(vUv - vSunPositionScreen);
      deltaTextCoord *= 1.0 / float(nSamples) * fDensity;
      vec2 textCoord = vUv;
      float illuminationDecay = 1.0;
      vec4 color = texture2D(tDiffuse, vUv);
      for(int i=0; i < nSamples; i++) {
        textCoord -= deltaTextCoord;
        vec4 sampleCol = texture2D(tDiffuse, textCoord);
        sampleCol *= illuminationDecay * fWeight;
        color += sampleCol;
        illuminationDecay *= fDecay;
      }
      gl_FragColor = color * fExposure;
    }
  `
};

const starVertexShader = `
  attribute float size; attribute float phase; attribute float speed;
  uniform float time; uniform float warp;
  varying float vOpacity;
  void main() {
    vOpacity = 0.4 + 0.6 * sin(time * speed + phase);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float finalSize = size * (400.0 / -mvPosition.z) * (1.0 + warp * 5.0);
    gl_PointSize = finalSize;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const starFragmentShader = `
  varying float vOpacity; uniform float warp;
  void main() {
    float r = distance(gl_PointCoord, vec2(0.5));
    if (r > 0.5) discard;
    float alpha = smoothstep(0.5, 0.1 + warp * 0.4, r) * vOpacity;
    gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
  }
`;

const Visualizer: React.FC<VisualizerProps> = ({ 
  shapes, fragments, flyingChars, isStarted, isWarping, isLanded, planetConfig, onFpsUpdate, 
  glowEnabled, glitchEnabled, glitchIntensity, bloomIntensity, noiseIntensity, 
  aoEnabled, aoRadius, aoIntensity, aoBlur, aoDistance,
  godRaysEnabled, godRaysExposure, godRaysDensity, godRaysDecay,
  chromaticEnabled, chromaticIntensity, shapeGlowIntensity
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef({ 
    shapes, fragments, flyingChars, isStarted, isWarping, isLanded, planetConfig, 
    glowEnabled, glitchEnabled, glitchIntensity, bloomIntensity, noiseIntensity, 
    aoEnabled, aoRadius, aoIntensity, aoBlur, aoDistance,
    godRaysEnabled, godRaysExposure, godRaysDensity, godRaysDecay,
    chromaticEnabled, chromaticIntensity, shapeGlowIntensity
  });
  
  useEffect(() => {
    propsRef.current = { 
      shapes, fragments, flyingChars, isStarted, isWarping, isLanded, planetConfig, 
      glowEnabled, glitchEnabled, glitchIntensity, bloomIntensity, noiseIntensity, 
      aoEnabled, aoRadius, aoIntensity, aoBlur, aoDistance,
      godRaysEnabled, godRaysExposure, godRaysDensity, godRaysDecay,
      chromaticEnabled, chromaticIntensity, shapeGlowIntensity
    };
  }, [shapes, fragments, flyingChars, isStarted, isWarping, isLanded, planetConfig, glowEnabled, glitchEnabled, glitchIntensity, bloomIntensity, noiseIntensity, aoEnabled, aoRadius, aoIntensity, aoBlur, aoDistance, godRaysEnabled, godRaysExposure, godRaysDensity, godRaysDecay, chromaticEnabled, chromaticIntensity, shapeGlowIntensity]);

  const stateRef = useRef<{
    renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera;
    composer: EffectComposer; bloomPass: UnrealBloomPass; noisePass: ShaderPass; saoPass: SAOPass; chromaticPass: ShaderPass; godRaysPass: ShaderPass; glitchPass: ShaderPass;
    group: THREE.Group; textGroup: THREE.Group; charGroup: THREE.Group; groundGroup: THREE.Group; foliageGroup: THREE.Group;
    hazardGroup: THREE.Group; cloudGroup: THREE.Group; structureGroup: THREE.Group;
    meshes: Map<string, THREE.Object3D>; textMeshes: Map<string, THREE.Mesh>; charMeshes: Map<string, THREE.Mesh>;
    stars: THREE.Points; starMaterial: THREE.ShaderMaterial; warpValue: number;
    sun: THREE.Mesh; sunLight: THREE.DirectionalLight; hemiLight: THREE.HemisphereLight;
    foliage: THREE.Object3D[]; terrainMesh: THREE.Mesh; waterMesh: THREE.Mesh;
    hazards: THREE.Object3D[]; clouds: THREE.Object3D[]; structures: THREE.Object3D[];
  } | null>(null);

  const fpsCounter = useRef({ frames: 0, lastTime: performance.now() });

  useEffect(() => {
    if (!mountRef.current) return;

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    mountRef.current.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const fog = new THREE.FogExp2(0x010103, 0.0001);
    scene.fog = fog;

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 400000);
    camera.position.z = 100;

    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    
    const saoPass = new SAOPass(scene, camera);
    saoPass.params.saoIntensity = 0.25;
    saoPass.params.saoScale = 500;
    saoPass.params.saoKernelRadius = 10;
    saoPass.enabled = false;
    
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), bloomIntensity, 0.4, 0.85);
    const noisePass = new ShaderPass(NoiseShader);
    const glitchPass = new ShaderPass(GlitchShader);
    const chromaticPass = new ShaderPass(ChromaticAberrationShader);
    const godRaysPass = new ShaderPass(GodRaysShader);
    const outputPass = new OutputPass();

    composer.addPass(renderPass); 
    composer.addPass(saoPass); 
    composer.addPass(bloomPass); 
    composer.addPass(noisePass); 
    composer.addPass(glitchPass);
    composer.addPass(godRaysPass);
    composer.addPass(chromaticPass); 
    composer.addPass(outputPass);

    const group = new THREE.Group(); 
    const textGroup = new THREE.Group(); 
    const charGroup = new THREE.Group();
    const groundGroup = new THREE.Group();
    const foliageGroup = new THREE.Group();
    const hazardGroup = new THREE.Group();
    const cloudGroup = new THREE.Group();
    const structureGroup = new THREE.Group();
    
    scene.add(group, textGroup, charGroup, groundGroup, foliageGroup, hazardGroup, cloudGroup, structureGroup);

    const terrainSize = 60000;
    const terrainGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, 64, 64);
    terrainGeo.rotateX(-Math.PI / 2);
    const terrainMesh = new THREE.Mesh(terrainGeo, new THREE.MeshStandardMaterial({ 
        color: 0x222244, 
        roughness: 0.8, 
        metalness: 0, 
        transparent: true,
        emissive: 0x111122,
        emissiveIntensity: 0.2
    }));
    terrainMesh.receiveShadow = true;
    groundGroup.add(terrainMesh);

    const waterGeo = new THREE.PlaneGeometry(terrainSize, terrainSize);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMesh = new THREE.Mesh(waterGeo, new THREE.MeshStandardMaterial({ 
        color: 0x00ffff, 
        transparent: true, 
        opacity: 0.4, 
        metalness: 1.0, 
        roughness: 0.1 
    }));
    waterMesh.position.y = 8;
    groundGroup.add(waterMesh);

    groundGroup.position.y = -120000; 

    const stars = new THREE.Points(new THREE.BufferGeometry(), new THREE.ShaderMaterial({ 
        uniforms: { time: { value: 0 }, warp: { value: 0 } }, 
        vertexShader: starVertexShader, 
        fragmentShader: starFragmentShader, 
        transparent: true, 
        blending: THREE.AdditiveBlending, 
        depthWrite: false 
    }));
    scene.add(stars);

    const sun = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 32), new THREE.MeshBasicMaterial({ color: 0xffffaa, transparent: true, opacity: 0.95 }));
    sun.position.set(15000, 5000, -50000);
    scene.add(sun);

    const sunLight = new THREE.DirectionalLight(0xffffcc, 3.0);
    scene.add(sunLight);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x010103, 0.5);
    scene.add(hemiLight);

    stateRef.current = { 
        renderer, scene, camera, composer, bloomPass, noisePass, saoPass, chromaticPass, godRaysPass, glitchPass,
        group, textGroup, charGroup, groundGroup, foliageGroup, hazardGroup, cloudGroup, structureGroup,
        meshes: new Map(), textMeshes: new Map(), charMeshes: new Map(), 
        stars, starMaterial: stars.material as any, warpValue: 0, sun, sunLight, hemiLight,
        foliage: [], terrainMesh, waterMesh, hazards: [], clouds: [], structures: []
    };

    const starCount = 40000;
    const starPosArr = new Float32Array(starCount * 3);
    const starDataArr = { sizes: new Float32Array(starCount), phases: new Float32Array(starCount), speeds: new Float32Array(starCount) };
    for (let i = 0; i < starCount; i++) {
      starPosArr[i*3] = (Math.random()-0.5)*200000; starPosArr[i*3+1] = (Math.random()-0.5)*150000; starPosArr[i*3+2] = (Math.random()-0.5)*100000;
      starDataArr.sizes[i] = 1 + Math.random()*5; starDataArr.phases[i] = Math.random()*Math.PI*2; starDataArr.speeds[i] = 0.5 + Math.random()*2;
    }
    stars.geometry.setAttribute('position', new THREE.BufferAttribute(starPosArr, 3));
    stars.geometry.setAttribute('size', new THREE.BufferAttribute(starDataArr.sizes, 1));
    stars.geometry.setAttribute('phase', new THREE.BufferAttribute(starDataArr.phases, 1));
    stars.geometry.setAttribute('speed', new THREE.BufferAttribute(starDataArr.speeds, 1));

    const animate = (time: number) => {
      const frameId = requestAnimationFrame(animate);
      const now = performance.now();
      const realNow = Date.now();
      const pr = propsRef.current;

      fpsCounter.current.frames++;
      if (now > fpsCounter.current.lastTime + 1000) {
        onFpsUpdate(Math.round((fpsCounter.current.frames * 1000) / (now - fpsCounter.current.lastTime)));
        fpsCounter.current.lastTime = now; fpsCounter.current.frames = 0;
      }

      if (pr.isStarted && stateRef.current) {
        const { camera, starMaterial, stars, sun, sunLight, hemiLight, groundGroup, foliageGroup, cloudGroup, hazardGroup, structureGroup, foliage, clouds, hazards, structures, saoPass, godRaysPass, noisePass, bloomPass, chromaticPass, glitchPass } = stateRef.current;
        
        // AO Settings
        saoPass.enabled = pr.aoEnabled;
        if (pr.aoEnabled) {
          saoPass.params.saoRadius = pr.aoRadius;
          saoPass.params.saoIntensity = pr.aoIntensity;
          saoPass.params.saoScale = pr.aoDistance;
          saoPass.params.saoKernelRadius = pr.aoBlur;
        }

        // God Rays Settings
        godRaysPass.enabled = pr.godRaysEnabled;
        if (pr.godRaysEnabled) {
          const sunPos = sun.position.clone();
          sunPos.project(camera);
          godRaysPass.uniforms.vSunPositionScreen.value.set((sunPos.x + 1) / 2, (sunPos.y + 1) / 2);
          godRaysPass.uniforms.fExposure.value = pr.godRaysExposure;
          godRaysPass.uniforms.fDensity.value = pr.godRaysDensity;
          godRaysPass.uniforms.fDecay.value = pr.godRaysDecay;
        }

        // Chromatic & Glitch
        chromaticPass.enabled = pr.chromaticEnabled;
        chromaticPass.uniforms.amount.value = pr.chromaticIntensity;
        
        glitchPass.enabled = pr.glitchEnabled;
        glitchPass.uniforms.amount.value = pr.glitchIntensity / 100;
        glitchPass.uniforms.time.value = time * 0.001;

        // Common Post-FX
        noisePass.uniforms.time.value = time * 0.001;
        noisePass.uniforms.amount.value = pr.noiseIntensity;
        bloomPass.strength = pr.bloomIntensity;

        const landingFactor = pr.isLanded ? 1 : 0;
        const targetTerrainY = pr.isLanded ? 0 : -130000; 
        groundGroup.position.y += (targetTerrainY - groundGroup.position.y) * 0.04;
        foliageGroup.position.y = groundGroup.position.y;
        cloudGroup.position.y = groundGroup.position.y;
        hazardGroup.position.y = groundGroup.position.y;
        structureGroup.position.y = groundGroup.position.y;

        const planetOpacity = Math.max(0, Math.min(1, (groundGroup.position.y + 35000) / 35000));
        groundGroup.visible = planetOpacity > 0.001;
        foliageGroup.visible = planetOpacity > 0.1;
        cloudGroup.visible = planetOpacity > 0.1;
        hazardGroup.visible = planetOpacity > 0.1;
        structureGroup.visible = planetOpacity > 0.1;

        groundGroup.children.forEach(c => { 
            const mat = (c as any).material;
            if(mat) {
                const base = mat.userData?.baseOpacity || 1;
                mat.opacity = base * planetOpacity;
            }
        });

        const targetCamZ = pr.isLanded ? 2200 : 100;
        const targetCamY = pr.isLanded ? 550 : 0;
        camera.position.z += (targetCamZ - camera.position.z) * 0.04;
        camera.position.y += (targetCamY - camera.position.y) * 0.04;

        const fogColorObj = new THREE.Color(pr.planetConfig.fogColor);
        const spaceColor = new THREE.Color(0x010103);
        (scene.fog as THREE.FogExp2).color.lerpColors(spaceColor, fogColorObj, landingFactor * 0.95);
        (scene.fog as THREE.FogExp2).density = pr.isLanded ? pr.planetConfig.fogDensity * 0.35 : 0.00003;

        hemiLight.intensity = pr.isLanded ? 0.7 : 0.2;

        const wind = time * 0.0008;
        foliage.forEach((tree, i) => {
          tree.rotation.z = Math.sin(wind + i) * 0.01;
        });

        clouds.forEach((cloud, i) => {
          cloud.position.x += 3.0;
          if (cloud.position.x > 35000) cloud.position.x = -35000;
        });

        hazards.forEach((h, i) => {
          if (pr.planetConfig.hazardType === 'fire') {
            h.scale.setScalar(1 + Math.sin(time * 0.015 + i) * 0.2);
          } else if (pr.planetConfig.hazardType === 'steam') {
            h.position.y += 2.0;
            if (h.position.y > 800) h.position.y = 0;
            (h as any).material.opacity = 0.35 * (1 - h.position.y / 800) * planetOpacity;
          }
        });

        const targetWarp = pr.isWarping ? 1.0 : 0.0;
        stateRef.current.warpValue += (targetWarp - stateRef.current.warpValue) * 0.04;
        const currentWarp = stateRef.current.warpValue;

        starMaterial.uniforms.warp.value = currentWarp;
        starMaterial.uniforms.time.value = time * 0.001;

        stars.position.z += 15.0 + currentWarp * 400.0; if (stars.position.z > 50000) stars.position.z = -50000;

        sun.position.y = pr.isLanded ? 5000 : 9000;
        sunLight.position.copy(sun.position);
        sunLight.intensity = (4.0 + currentWarp * 10.0) * (pr.isLanded ? 0.6 : 1);

        stateRef.current.meshes.forEach((obj) => {
          const ud = obj.userData;
          const age = realNow - ud.createdAt; const progress = age / ud.lifeTime;
          obj.position.x += ud.velocity[0]; obj.position.y += ud.velocity[1]; obj.position.z += ud.velocity[2] + currentWarp * 15.0;
          
          obj.rotation.x += ud.rotationSpeed[0];
          obj.rotation.y += ud.rotationSpeed[1];
          obj.rotation.z += ud.rotationSpeed[2];
          
          let opacity = progress < 0.1 ? progress * 10 : progress > 0.85 ? 1 - (progress - 0.85) / 0.15 : 1;
          if (obj instanceof THREE.Mesh) {
            (obj.material as any).opacity = Math.max(0, opacity);
            (obj.material as any).emissiveIntensity = opacity * pr.shapeGlowIntensity * (bloomPass.strength * 0.5 + 0.5);
          }
        });

        stateRef.current.textMeshes.forEach((mesh) => {
          const ud = mesh.userData;
          const age = realNow - ud.createdAt; const progress = age / ud.lifeTime;
          mesh.position.z += ud.velocity[2] + currentWarp * 8.0;
          let opacity = progress < 0.1 ? progress * 10 : progress > 0.8 ? 1 - (progress - 0.8) / 0.2 : 1;
          (mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, opacity);
        });

        stateRef.current.charMeshes.forEach((mesh) => {
          const ud = mesh.userData as FlyingChar;
          const age = realNow - ud.createdAt;
          mesh.position.z += ud.velocity[2] + currentWarp * 18.0;
          const progress = age / ud.lifeTime;
          let opacity = progress < 0.05 ? progress * 20 : progress > 0.9 ? 1 - (progress - 0.9) / 0.1 : 1;
          (mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, opacity * 0.3); 
        });

        camera.lookAt(0, pr.isLanded ? 200 : 0, -30000);
      }
      composer.render();
      return frameId;
    };

    const globalFrameId = animate(0);
    return () => { cancelAnimationFrame(globalFrameId); renderer.dispose(); };
  }, []);

  useEffect(() => {
    const sr = stateRef.current; if (!sr) return;
    const { terrainMesh, waterMesh, foliageGroup, hazardGroup, cloudGroup, structureGroup, foliage, hazards, clouds, structures } = sr;
    const config = planetConfig;

    const terrainMat = terrainMesh.material as THREE.MeshStandardMaterial;
    terrainMat.color.set(config.groundColor);
    terrainMat.emissive.set(config.groundColor).multiplyScalar(0.45);
    terrainMat.userData.baseOpacity = 1;

    const posAttr = terrainMesh.geometry.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      const h = (Math.sin(x * 0.0008) + Math.cos(z * 0.0006)) * 400 + (Math.sin(x * 0.004) * Math.cos(z * 0.003)) * 80;
      posAttr.setY(i, h);
    }
    terrainMesh.geometry.computeVertexNormals();
    posAttr.needsUpdate = true;

    waterMesh.visible = config.hasWater;
    (waterMesh.material as THREE.MeshStandardMaterial).color.set(config.waterColor);
    waterMesh.material.userData.baseOpacity = 0.45;

    foliageGroup.clear(); foliage.length = 0;
    hazardGroup.clear(); hazards.length = 0;
    cloudGroup.clear(); clouds.length = 0;
    structureGroup.clear(); structures.length = 0;

    for (let i = 0; i < 60; i++) {
      const x = (Math.random() - 0.5) * 50000;
      const z = (Math.random() - 0.5) * 50000;
      const tree = new THREE.Group();
      const h = 150 + Math.random() * 250;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 8, h, 6), new THREE.MeshStandardMaterial({ 
          color: config.treeColor, 
          transparent: true,
          emissive: config.treeColor,
          emissiveIntensity: 0.15
      }));
      trunk.position.y = h/2;
      tree.add(trunk);
      
      const ray = new THREE.Raycaster(new THREE.Vector3(x, 20000, z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(terrainMesh);
      tree.position.set(x, hit.length > 0 ? hit[0].point.y : 0, z);
      foliageGroup.add(tree); foliage.push(tree);
    }

    if (config.hasStructures) {
        for (let i = 0; i < 15; i++) {
            const x = (Math.random() - 0.5) * 45000;
            const z = (Math.random() - 0.5) * 45000;
            
            // Generate a "Voronoi Armature" - skeletal remain
            const detail = 1 + Math.floor(Math.random() * 2);
            const size = 300 + Math.random() * 800;
            const icoGeo = new THREE.IcosahedronGeometry(size, detail);
            
            // Distort vertices to look "Voronoi-like" and skeletal
            const pos = icoGeo.attributes.position;
            for(let j=0; j<pos.count; j++) {
                const vx = pos.getX(j);
                const vy = pos.getY(j);
                const vz = pos.getZ(j);
                pos.setX(j, vx + (Math.random()-0.5) * size * 0.4);
                pos.setY(j, vy + (Math.random()-0.5) * size * 0.8); // Make it taller
                pos.setZ(j, vz + (Math.random()-0.5) * size * 0.4);
            }
            icoGeo.computeVertexNormals();
            
            const wire = new THREE.WireframeGeometry(icoGeo);
            const line = new THREE.LineSegments(wire, new THREE.LineBasicMaterial({ 
                color: config.structureColor,
                transparent: true,
                opacity: 0.6
            }));
            
            const ray = new THREE.Raycaster(new THREE.Vector3(x, 20000, z), new THREE.Vector3(0, -1, 0));
            const hit = ray.intersectObject(terrainMesh);
            line.position.set(x, (hit.length > 0 ? hit[0].point.y : 0) - 50, z);
            line.rotation.y = Math.random() * Math.PI;
            
            structureGroup.add(line);
            structures.push(line);
        }
    }

    for (let i = 0; i < 20; i++) {
      const cloud = new THREE.Mesh(new THREE.SphereGeometry(1000 + Math.random()*1500, 12, 12), new THREE.MeshBasicMaterial({ 
          color: config.cloudColor, 
          transparent: true, 
          opacity: 0.12, 
          blending: THREE.AdditiveBlending,
          depthWrite: false 
      }));
      cloud.position.set((Math.random()-0.5)*60000, 5000 + Math.random()*3000, (Math.random()-0.5)*60000);
      cloud.scale.y = 0.15;
      cloudGroup.add(cloud); clouds.push(cloud);
    }

    if (config.hazardType !== 'none') {
      for (let i = 0; i < 50; i++) {
        const x = (Math.random() - 0.5) * 45000;
        const z = (Math.random() - 0.5) * 45000;
        let hObj: THREE.Object3D;
        if (config.hazardType === 'fire') {
          hObj = new THREE.Mesh(new THREE.SphereGeometry(60, 8, 8), new THREE.MeshStandardMaterial({ 
              color: 0xff7700, 
              emissive: 0xff3300, 
              emissiveIntensity: 5, 
              transparent: true, 
              opacity: 0.95 
          }));
        } else {
          hObj = new THREE.Mesh(new THREE.SphereGeometry(90, 8, 8), new THREE.MeshBasicMaterial({ 
              color: 0xffffff, 
              transparent: true, 
              opacity: 0.3, 
              blending: THREE.AdditiveBlending,
              depthWrite: false
          }));
        }
        const ray = new THREE.Raycaster(new THREE.Vector3(x, 20000, z), new THREE.Vector3(0, -1, 0));
        const hit = ray.intersectObject(terrainMesh);
        hObj.position.set(x, (hit.length > 0 ? hit[0].point.y : 0) + 20, z);
        hazardGroup.add(hObj); hazards.push(hObj);
      }
    }
  }, [planetConfig]);

  useEffect(() => {
    const sr = stateRef.current; if (!sr) return;
    const activeIds = new Set(shapes.map(s => s.id));
    sr.meshes.forEach((obj, id) => { if (!activeIds.has(id)) { sr.group.remove(obj); sr.meshes.delete(id); } });
    shapes.forEach(s => {
      if (!sr.meshes.has(s.id)) {
        let obj;
        if (s.type === 'line' && s.pointsData) {
          const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(s.pointsData, 3));
          obj = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: s.color, transparent: true, opacity: 0 }));
        } else {
          obj = new THREE.Mesh(geometries[s.type as keyof typeof geometries] || geometries.box, new THREE.MeshStandardMaterial({ 
              color: s.color, 
              transparent: true, 
              opacity: 0, 
              emissive: s.color, 
              emissiveIntensity: 1.2, 
              metalness: 0.7, 
              roughness: 0.1 
          }));
          obj.scale.setScalar(s.scale);
        }
        obj.position.set(...s.position);
        obj.rotation.set(...s.rotation);
        obj.userData = { ...s }; 
        sr.group.add(obj); 
        sr.meshes.set(s.id, obj);
      }
    });
  }, [shapes]);

  useEffect(() => {
    const sr = stateRef.current; if (!sr) return;
    const activeIds = new Set(fragments.map(f => f.id));
    sr.textMeshes.forEach((mesh, id) => { if (!activeIds.has(id)) { sr.textGroup.remove(mesh); sr.textMeshes.delete(id); } });
    fragments.forEach(f => {
      if (!sr.textMeshes.has(f.id)) {
        const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 128;
        const ctx = canvas.getContext('2d')!; ctx.font = '900 48px Inter'; ctx.textAlign = 'center'; 
        ctx.fillStyle = 'white'; ctx.shadowColor = 'rgba(255,255,0,0.8)'; ctx.shadowBlur = 15; ctx.fillText(f.text.toUpperCase(), 512, 80);
        const tex = new THREE.CanvasTexture(canvas);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(f.scale * 45, f.scale * 6), new THREE.MeshBasicMaterial({ 
            map: tex, 
            transparent: true, 
            opacity: 0, 
            side: THREE.DoubleSide, 
            depthWrite: false 
        }));
        mesh.position.set(...f.position); mesh.userData = { ...f }; sr.textGroup.add(mesh); sr.textMeshes.set(f.id, mesh);
      }
    });
  }, [fragments]);

  useEffect(() => {
    const sr = stateRef.current; if (!sr) return;
    const activeIds = new Set(flyingChars.map(c => c.id));
    sr.charMeshes.forEach((mesh, id) => { if (!activeIds.has(id)) { sr.charGroup.remove(mesh); sr.charMeshes.delete(id); } });
    flyingChars.forEach(c => {
      if (!sr.charMeshes.has(c.id)) {
        const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128; 
        const ctx = canvas.getContext('2d')!; ctx.font = '900 80px Inter'; ctx.textAlign = 'center'; 
        ctx.fillStyle = '#ffffff'; ctx.shadowColor = 'white'; ctx.shadowBlur = 20; ctx.fillText(c.char, 64, 90);
        const tex = new THREE.CanvasTexture(canvas);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(130 * c.scale, 130 * c.scale), new THREE.MeshBasicMaterial({ 
            map: tex, 
            transparent: true, 
            opacity: 0, 
            side: THREE.DoubleSide, 
            depthWrite: false 
        }));
        mesh.position.set(...c.position); mesh.userData = { ...c }; sr.charGroup.add(mesh); sr.charMeshes.set(c.id, mesh);
      }
    });
  }, [flyingChars]);

  return <div ref={mountRef} className="absolute inset-0 z-0" />;
};

export default Visualizer;
