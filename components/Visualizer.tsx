
import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
// Подключение модулей пост-процессинга для создания визуальных эффектов
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SAOPass } from 'three/addons/postprocessing/SAOPass.js';
import { KandinskyShape, PhilosophyFragment } from '../types';

interface VisualizerProps {
  shapes: KandinskyShape[];
  fragments: PhilosophyFragment[];
  isStarted: boolean;
  isWarping: boolean;
  onFpsUpdate: (fps: number) => void;
  glowEnabled: boolean; 
  glitchEnabled: boolean;
  bloomIntensity: number;
  noiseIntensity: number;
  aoEnabled: boolean;
  chromaticEnabled: boolean;
}

// Определение геометрий для 3D объектов (фигур Кандинского)
const geometries = {
  sphere: new THREE.SphereGeometry(1, 32, 32), // Сфера
  torus: new THREE.TorusGeometry(1, 0.4, 16, 64), // Тор (бублик)
  octahedron: new THREE.OctahedronGeometry(1.5, 0), // Октаэдр
  cylinder: new THREE.CylinderGeometry(0.1, 0.1, 50, 8), // Тонкий цилиндр (палочка)
  box: new THREE.BoxGeometry(2, 2, 2) // Куб
};

// Шейдер хроматической аберрации (расслоение RGB каналов по краям)
const ChromaticAberrationShader = {
  uniforms: {
    'tDiffuse': { value: null },
    'amount': { value: 0.003 }
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
    uniform float amount;
    varying vec2 vUv;
    void main() {
      vec4 col;
      // Смещение красного и синего каналов для создания эффекта линзы
      col.r = texture2D(tDiffuse, vUv + vec2(amount, 0.0)).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - vec2(amount, 0.0)).b;
      col.a = texture2D(tDiffuse, vUv).a;
      gl_FragColor = col;
    }
  `
};

// Шейдер цифрового шума (зернистость)
const NoiseShader = {
  uniforms: {
    'tDiffuse': { value: null },
    'amount': { value: 0.05 },
    'time': { value: 0.0 }
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
    uniform float amount;
    uniform float time;
    varying vec2 vUv;
    float rand(vec2 co){
        return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
    }
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float n = rand(vUv + fract(time)) * amount;
      // Добавление случайного шума к цвету пикселя
      gl_FragColor = vec4(color.rgb + n, color.a);
    }
  `
};

// Вертексный шейдер звезд (управление размером и мерцанием)
const starVertexShader = `
  attribute float size;
  attribute float phase;
  attribute float speed;
  uniform float time;
  uniform float warp;
  varying float vOpacity;
  void main() {
    // Вычисление прозрачности для эффекта мерцания
    vOpacity = 0.4 + 0.6 * sin(time * speed + phase);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    // Увеличение размера звезд при "варп-прыжке"
    float finalSize = size * (400.0 / -mvPosition.z) * (1.0 + warp * 5.0);
    gl_PointSize = finalSize;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// Фрагментный шейдер звезд (создание мягких светящихся точек)
const starFragmentShader = `
  varying float vOpacity;
  uniform float warp;
  void main() {
    float r = distance(gl_PointCoord, vec2(0.5));
    if (r > 0.5) discard; // Отсечение углов квадрата частицы
    // Сглаживание краев звезды
    float softness = 0.1 + warp * 0.4;
    float alpha = smoothstep(0.5, softness, r) * vOpacity;
    gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
  }
`;

const Visualizer: React.FC<VisualizerProps> = ({ shapes, fragments, isStarted, isWarping, onFpsUpdate, glowEnabled, glitchEnabled, bloomIntensity, noiseIntensity, aoEnabled, chromaticEnabled }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef({ shapes, fragments, isStarted, isWarping, glowEnabled, glitchEnabled, bloomIntensity, noiseIntensity, aoEnabled, chromaticEnabled });
  
  // Обновление ссылок на пропсы для использования внутри цикла анимации
  useEffect(() => {
    propsRef.current = { shapes, fragments, isStarted, isWarping, glowEnabled, glitchEnabled, bloomIntensity, noiseIntensity, aoEnabled, chromaticEnabled };
  }, [shapes, fragments, isStarted, isWarping, glowEnabled, glitchEnabled, bloomIntensity, noiseIntensity, aoEnabled, chromaticEnabled]);

  // Ссылки на объекты сцены Three.js
  const stateRef = useRef<{
    renderer: THREE.WebGLRenderer; // Рендерер
    scene: THREE.Scene; // Сцена
    camera: THREE.PerspectiveCamera; // Камера
    composer: EffectComposer; // Компоновщик эффектов
    bloomPass: UnrealBloomPass; // Эффект свечения (Bloom)
    noisePass: ShaderPass; // Эффект шума
    saoPass: SAOPass; // Эффект затенения (Ambient Occlusion)
    chromaticPass: ShaderPass; // Эффект цветовых искажений
    group: THREE.Group; // Группа для фигур
    textGroup: THREE.Group; // Группа для текста
    meshes: Map<string, THREE.Object3D>; // Хранилище 3D объектов
    textMeshes: Map<string, THREE.Mesh>; // Хранилище текстовых объектов
    stars: THREE.Points; // Система звезд
    starMaterial: THREE.ShaderMaterial; // Материал звезд
    sun: THREE.Mesh; // Центральное светило
    warpValue: number; // Текущее значение ускорения
    sparks: THREE.Points; // Система искр от солнца
    sparkData: { pos: THREE.Vector3; vel: THREE.Vector3; life: number }[]; // Данные частиц искр
  } | null>(null);

  const fpsCounter = useRef({ frames: 0, lastTime: performance.now() });

  useEffect(() => {
    if (!mountRef.current) return;

    // Настройка WebGL рендерера
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Ограничение пикселей для производительности
    mountRef.current.appendChild(renderer.domElement);

    // Инициализация сцены и тумана
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x010103, 0.00015); // Космический туман для глубины

    // Настройка камеры (угол обзора 75 градусов)
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 40000);
    camera.position.z = 100;

    // Настройка цепочки пост-эффектов
    const renderPass = new RenderPass(scene, camera); // Базовый рендер
    const saoPass = new SAOPass(scene, camera); // Глобальное затенение
    saoPass.params.saoIntensity = 0.08;
    saoPass.params.saoScale = 200;
    
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), bloomIntensity, 0.4, 0.85); // Свечение
    const noisePass = new ShaderPass(NoiseShader); // Зернистость
    const chromaticPass = new ShaderPass(ChromaticAberrationShader); // RGB искажения
    const outputPass = new OutputPass(); // Финальный вывод

    const composer = new EffectComposer(renderer);
    composer.addPass(renderPass);
    composer.addPass(saoPass);
    composer.addPass(bloomPass);
    composer.addPass(noisePass);
    composer.addPass(chromaticPass);
    composer.addPass(outputPass);

    // Создание групп для организации объектов
    const group = new THREE.Group();
    const textGroup = new THREE.Group();
    scene.add(group, textGroup);

    // Создание Солнца (центральный визуальный якорь)
    const sunMat = new THREE.MeshStandardMaterial({ 
      color: 0xffffff, emissive: 0xffffee, emissiveIntensity: 40, metalness: 0, roughness: 1 
    });
    const sun = new THREE.Mesh(new THREE.SphereGeometry(800, 64, 64), sunMat);
    sun.position.set(10000, 6000, -15000); // Позиция в глубоком космосе
    scene.add(sun);

    // Освещение от солнца
    const sunLight = new THREE.DirectionalLight(0xffffff, 10);
    sunLight.position.copy(sun.position);
    scene.add(sunLight);

    // Система искр (частицы, отлетающие от солнца)
    const maxSparks = 1500;
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxSparks * 3), 3));
    const sparkMat = new THREE.PointsMaterial({ color: 0xffaa00, size: 60, transparent: true, blending: THREE.AdditiveBlending, opacity: 0.9, depthWrite: false });
    const sparks = new THREE.Points(sparkGeo, sparkMat);
    scene.add(sparks);
    const sparkData: any[] = [];

    // Звездное небо (80 000 точек)
    const starCount = 80000;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    const starDataArr = { sizes: new Float32Array(starCount), phases: new Float32Array(starCount), speeds: new Float32Array(starCount) };
    for (let i = 0; i < starCount; i++) {
      starPos[i*3] = (Math.random()-0.5)*40000;
      starPos[i*3+1] = (Math.random()-0.5)*35000;
      starPos[i*3+2] = (Math.random()-0.5)*30000;
      starDataArr.sizes[i] = 2 + Math.random()*10;
      starDataArr.phases[i] = Math.random()*Math.PI*2;
      starDataArr.speeds[i] = 1 + Math.random()*5;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute('size', new THREE.BufferAttribute(starDataArr.sizes, 1));
    starGeo.setAttribute('phase', new THREE.BufferAttribute(starDataArr.phases, 1));
    starGeo.setAttribute('speed', new THREE.BufferAttribute(starDataArr.speeds, 1));
    const starMaterial = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, warp: { value: 0 } },
      vertexShader: starVertexShader, fragmentShader: starFragmentShader,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
    });
    const stars = new THREE.Points(starGeo, starMaterial);
    scene.add(stars);

    // Фоновый свет
    scene.add(new THREE.AmbientLight(0x666666));

    stateRef.current = { renderer, scene, camera, composer, bloomPass, noisePass, saoPass, chromaticPass, group, textGroup, meshes: new Map(), textMeshes: new Map(), stars, starMaterial, sun, warpValue: 0, sparks, sparkData };

    // Главный цикл анимации (Render Loop)
    const animate = (time: number) => {
      const frameId = requestAnimationFrame(animate);
      const now = performance.now();
      const realNow = Date.now();
      const pr = propsRef.current;

      // Расчет FPS
      fpsCounter.current.frames++;
      if (now > fpsCounter.current.lastTime + 1000) {
        onFpsUpdate(Math.round((fpsCounter.current.frames * 1000) / (now - fpsCounter.current.lastTime)));
        fpsCounter.current.lastTime = now;
        fpsCounter.current.frames = 0;
      }

      if (pr.isStarted) {
        // Динамическое включение/выключение эффектов
        saoPass.enabled = pr.aoEnabled;
        chromaticPass.enabled = pr.chromaticEnabled;
        
        // Визуальное поведение Солнца
        sun.rotation.y += 0.008; // Вращение
        sun.rotation.z += 0.004;
        const pulse = Math.sin(time * 0.001) * 0.5 + 0.5;
        sun.scale.setScalar(1.0 + pulse * 0.15); // Пульсация размера
        (sun.material as THREE.MeshStandardMaterial).emissiveIntensity = 30 + pulse * 50; // Пульсация яркости

        // Обновление искр
        if (stateRef.current) {
          const { sparks, sparkData, sun } = stateRef.current;
          if (sparkData.length < maxSparks) {
            // Генерация новой искры на поверхности солнца
            const angle = Math.random()*Math.PI*2; const phi = Math.random()*Math.PI;
            const r = 800;
            const startPos = new THREE.Vector3(sun.position.x + r*Math.sin(phi)*Math.cos(angle), sun.position.y + r*Math.sin(phi)*Math.sin(angle), sun.position.z + r*Math.cos(phi));
            const vel = startPos.clone().sub(sun.position).normalize().multiplyScalar(10 + Math.random()*30);
            sparkData.push({ pos: startPos, vel, life: 1.0 });
          }
          const positions = sparks.geometry.attributes.position.array as Float32Array;
          for (let i = sparkData.length - 1; i >= 0; i--) {
            const s = sparkData[i]; s.pos.add(s.vel); s.life -= 0.01; // Движение и уменьшение жизни искры
            if (s.life <= 0) { sparkData.splice(i, 1); continue; }
            positions[i*3] = s.pos.x; positions[i*3+1] = s.pos.y; positions[i*3+2] = s.pos.z;
          }
          for (let i = sparkData.length; i < maxSparks; i++) positions[i*3] = 99999; // Увод невидимых частиц
          sparks.geometry.attributes.position.needsUpdate = true;
          (sparks.material as THREE.PointsMaterial).opacity = 0.5 + Math.random()*0.5; // Мерцание искр
        }

        // Плавный расчет эффекта Warp (ускорение звезд)
        const targetWarp = pr.isWarping ? 1.0 : 0.0;
        stateRef.current!.warpValue += (targetWarp - stateRef.current!.warpValue) * 0.06;
        starMaterial.uniforms.warp.value = stateRef.current!.warpValue;
        starMaterial.uniforms.time.value = time * 0.001;
        noisePass.uniforms.time.value = time * 0.001;
        
        // Связь визуальных эффектов с состоянием Warp
        noisePass.uniforms.amount.value = pr.noiseIntensity + stateRef.current!.warpValue * 0.15;
        bloomPass.strength = pr.bloomIntensity + stateRef.current!.warpValue * 3.0;
        chromaticPass.uniforms.amount.value = 0.003 + stateRef.current!.warpValue * 0.02;

        // Полет сквозь звезды
        const currentWarp = stateRef.current!.warpValue;
        stars.position.z += 10.0 + currentWarp * 250.0; 
        if (stars.position.z > 15000) stars.position.z = -15000; // Бесконечный цикл полета

        // Обновление всех фигур на сцене
        stateRef.current?.meshes.forEach((obj) => {
          const ud = obj.userData;
          const age = realNow - ud.createdAt;
          const progress = age / ud.lifeTime;
          // Физика движения
          obj.position.x += ud.velocity[0]; obj.position.y += ud.velocity[1]; obj.position.z += ud.velocity[2] + currentWarp * 8.0;
          obj.rotation.x += ud.rotationSpeed[0]; obj.rotation.y += ud.rotationSpeed[1]; obj.rotation.z += ud.rotationSpeed[2];
          // Плавное появление и исчезновение (Fade in/out)
          let opacity = progress < 0.1 ? progress * 10 : progress > 0.85 ? 1 - (progress - 0.85) / 0.15 : 1;
          if (obj instanceof THREE.Mesh) {
            (obj.material as THREE.MeshStandardMaterial).opacity = Math.max(0, opacity);
            (obj.material as THREE.MeshStandardMaterial).emissiveIntensity = opacity * (bloomPass.strength * 2.5 + 5);
          } else if (obj instanceof THREE.Points) {
            (obj.material as THREE.PointsMaterial).opacity = Math.max(0, opacity);
          } else if (obj instanceof THREE.Line) {
            (obj.material as THREE.LineBasicMaterial).opacity = Math.max(0, opacity);
          }
          // Визуальный глитч-эффект (прыжки масштаба)
          obj.scale.setScalar(pr.glitchEnabled && Math.random() > 0.95 ? ud.scale * (0.6 + Math.random()) : ud.scale);
        });

        // Обновление текстовых фрагментов
        stateRef.current?.textMeshes.forEach((mesh) => {
          const ud = mesh.userData;
          const age = realNow - ud.createdAt;
          const progress = age / ud.lifeTime;
          mesh.position.z += ud.velocity[2] + currentWarp * 4.0;
          mesh.position.x += ud.velocity[0];
          mesh.rotation.z += ud.rotationSpeed[2];
          let opacity = progress < 0.08 ? progress * 12.5 : progress > 0.8 ? 1 - (progress - 0.8) / 0.2 : 1;
          (mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, opacity);
          if (pr.glitchEnabled && Math.random() > 0.98) mesh.position.x += (Math.random()-0.5)*30; // Глитч текста
        });

        // Кинематографичное движение камеры
        camera.position.x = Math.sin(now*0.00035)*(70 + currentWarp*50);
        camera.position.y = Math.cos(now*0.00025)*(70 + currentWarp*50);
        camera.rotation.z = Math.sin(now*0.0001)*0.3; // Плавный крен
        camera.fov = 75 + currentWarp * 40; // Динамическое поле зрения при ускорении
        camera.updateProjectionMatrix();
        camera.lookAt(0, 0, -5000); // Камера всегда смотрит вперед в пустоту
      }

      composer.render(); // Финальная отрисовка кадра
      return frameId;
    };

    const globalFrameId = animate(0);
    // Обработка изменения размера окна
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight); composer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // Очистка ресурсов при размонтировании
    return () => {
      cancelAnimationFrame(globalFrameId); window.removeEventListener('resize', handleResize);
      renderer.dispose(); Object.values(geometries).forEach(g => g.dispose());
      if (mountRef.current) mountRef.current.removeChild(renderer.domElement);
    };
  }, []);

  // Синхронизация 3D объектов с состоянием приложения (React -> Three.js)
  useEffect(() => {
    const sr = stateRef.current; if (!sr) return;
    const activeIds = new Set(shapes.map(s => s.id));
    // Удаление старых объектов
    sr.meshes.forEach((obj, id) => {
      if (!activeIds.has(id)) {
        sr.group.remove(obj);
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.Line) {
           (obj.material as THREE.Material).dispose(); obj.geometry.dispose();
        }
        sr.meshes.delete(id);
      }
    });

    // Создание новых фигур
    shapes.forEach(s => {
      if (!sr.meshes.has(s.id)) {
        let obj;
        if (s.type === 'points' && s.pointsData) {
          // Создание облака точек
          const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(s.pointsData, 3));
          obj = new THREE.Points(geo, new THREE.PointsMaterial({ color: s.color, size: 5, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
        } else if (s.type === 'line' && s.pointsData) {
          // Создание линий (палочек Кандинского)
          const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(s.pointsData, 3));
          obj = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: s.color, transparent: true, opacity: 0, linewidth: 2 }));
        } else {
          // Создание стандартных мешей
          obj = new THREE.Mesh(geometries[s.type as keyof typeof geometries] || geometries.box, new THREE.MeshStandardMaterial({ color: s.color, transparent: true, opacity: 0, emissive: s.color, emissiveIntensity: 5.0, metalness: 0.3, roughness: 0.5, side: THREE.DoubleSide }));
          obj.scale.setScalar(s.scale);
        }
        obj.position.set(...s.position); obj.userData = { ...s };
        sr.group.add(obj); sr.meshes.set(s.id, obj);
      }
    });
  }, [shapes]);

  // Синхронизация текста с 3D сценой
  useEffect(() => {
    const sr = stateRef.current; if (!sr) return;
    const activeIds = new Set(fragments.map(f => f.id));
    sr.textMeshes.forEach((mesh, id) => {
      if (!activeIds.has(id)) { sr.textGroup.remove(mesh); (mesh.material as THREE.MeshBasicMaterial).map?.dispose(); (mesh.material as THREE.Material).dispose(); mesh.geometry.dispose(); sr.textMeshes.delete(id); }
    });

    fragments.forEach(f => {
      if (!sr.textMeshes.has(f.id)) {
        // Отрисовка текста на Canvas для создания текстуры
        const canvas = document.createElement('canvas'); canvas.width = 1800; canvas.height = 160;
        const ctx = canvas.getContext('2d')!; ctx.font = '900 70px Inter'; ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.shadowColor = 'white'; ctx.shadowBlur = 40;
        ctx.fillText(f.text.toUpperCase(), 900, 100);
        const tex = new THREE.CanvasTexture(canvas);
        const planeWidth = f.scale * 55; const planeHeight = planeWidth * (160 / 1800);
        // Создание плоскости с текстом в 3D пространстве
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(planeWidth, planeHeight), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, side: THREE.DoubleSide }));
        mesh.position.set(...f.position); mesh.userData = { ...f, rotationSpeed: [0, 0, (Math.random()-0.5)*0.015] };
        sr.textGroup.add(mesh); sr.textMeshes.set(f.id, mesh);
      }
    });
  }, [fragments]);

  return <div ref={mountRef} className="absolute inset-0 z-0" />; // Контейнер для Canvas
};

export default Visualizer;
