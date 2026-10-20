import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { createStage, hasWebGL2, isMobile, reducedMotion } from './stage.js';
import { createWorld } from './world.js';
import { loadCar } from './car.js';
import { createFlow } from './flow.js';
import { createSparks } from './sparks.js';
import { createAudio } from './audio.js';
import { createCursor, magnetic, createMenu, createLabels, countUp } from './ui.js';
import { splitChars } from './split.js';

gsap.registerPlugin(ScrollTrigger);

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const ui = {
  loader: $('.loader'),
  loaderCar: $('.loader__car'),
  loaderPaths: $$('.loader__car [data-at]'),
  count: $('[data-count]'),
  bar: $('[data-loader-bar]'),
  size: $('[data-loader-size]'),
  fadeIns: $$('.hero .kicker, .hero__foot, .chrome'),
  progress: $('[data-progress]'),
  sectionNum: $('[data-section-num]'),
  sectionName: $('[data-section-name]'),
  speed: $('[data-speed]'),
  gear: $('[data-gear]'),
  rpm: $('[data-rpm]'),
  temp: $('[data-temp]'),
  tempBar: $('[data-temp-bar]'),
  marquee: $('.marquee'),
  marqueeTrack: $('[data-marquee]'),
  lights: $$('.lights__col'),
  sound: $('.sound-toggle'),
  soundState: $('[data-sound-state]'),
};

const heroChars = $$('.hero [data-split]').flatMap(splitChars);
const sectionTitles = $$('.sec [data-split]').map((el) => ({ el, chars: splitChars(el) }));
gsap.set(heroChars, { yPercent: 115 });

// ---------- Rolagem suave ----------
let lenis = null;
if (!reducedMotion) {
  lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.9 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.stop();
}
const scrollTo = (target) => {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (lenis) lenis.scrollTo(el, { duration: 2.2 });
  else el.scrollIntoView();
};
history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

const audio = createAudio();
ui.sound.addEventListener('click', () => {
  const on = audio.toggle();
  ui.sound.setAttribute('aria-pressed', String(on));
  ui.soundState.textContent = on ? 'on' : 'off';
  document.body.classList.toggle('sound-on', on);
});
createMenu(scrollTo, () => audio.play('passby'));
const cursor = createCursor();
magnetic();
document.addEventListener('click', (e) => e.target.closest('a, button') && audio.play('click'));

setupTextAnimations();

if (!hasWebGL2()) {
  document.documentElement.classList.add('no-webgl');
  document.body.classList.remove('is-loading');
  gsap.set(heroChars, { yPercent: 0 });
  lenis?.start();
} else {
  start();
}

async function start() {
  const stage = createStage(document.getElementById('gl'));
  const { scene, camera, composer, effects } = stage;
  const world = createWorld(scene);
  const flow = createFlow(scene);
  const sparks = createSparks(scene);

  // Contador: persegue o progresso real do download com suavização.
  const counter = { value: 0 };
  // O símbolo se desenha da asa dianteira à traseira: cada traço tem sua janela do progresso.
  const renderCount = () => {
    const p = counter.value / 100;
    ui.count.textContent = String(Math.round(counter.value)).padStart(3, '0');
    ui.bar.style.transform = `scaleX(${p})`;
    for (const path of ui.loaderPaths) {
      const t = Math.min(1, Math.max(0, (p - Number(path.dataset.at)) / 0.22));
      path.style.strokeDashoffset = 1 - t;
    }
  };
  const car = await loadCar((p, total) => {
    ui.size.textContent = `${(total / 1048576).toFixed(1).replace('.', ',')} MB`;
    gsap.to(counter, { value: p * 99, duration: 0.6, ease: 'power2.out', onUpdate: renderCount, overwrite: true });
  });
  scene.add(car.root);
  world.addReflection(car.model, car.root);

  // No r170 o envMapIntensity do material só vale se ele tiver envMap próprio;
  // sem isso tudo herda a intensidade global da cena.
  scene.traverse((o) => {
    if (o.isMesh && o.material.isMeshStandardMaterial && !o.material.envMap) o.material.envMap = scene.environment;
  });

  const labels = createLabels(camera, car);

  // ---------- Câmera: coordenadas esféricas em volta de um alvo ----------
  // az 0 = de frente (+Z), π/2 = lateral direita, π = traseira.
  const rig = {
    az: 0, el: 0.05, dist: 7.6, tx: 0, ty: 0.5, tz: 0, fov: 28,
    fog: 1, grid: 0.1, flow: 0, labels: 0, explode: 0, heat: 0, sparks: 0, spin: 0, speed: 0, dark: 0, final: 0,
  };
  const fit = () => {
    const a = camera.aspect;
    // Tela vertical: afasta a câmera para o carro caber na largura.
    return a >= 1.5 ? 1 : a >= 1 ? 1 + (1.5 - a) * 0.6 : 1.3 + (1 - a) * 1.5;
  };

  // Aproximação da câmera na intro (multiplica a distância da rolagem).
  const introCam = { dolly: reducedMotion ? 1 : 1.5 };
  const tl = buildTimeline(rig, car);
  setupSectionTriggers(car, rig, world, audio);

  // ---------- Interação: arrastar gira o carro, com inércia ----------
  const drag = { on: false, x: 0, y: 0, yaw: 0, pitch: 0, vYaw: 0 };
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest('a, button, .menu')) return;
    drag.on = true;
    drag.x = e.clientX;
    drag.y = e.clientY;
    cursor.setDrag(true);
  });
  window.addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / innerWidth) * 2 - 1;
    pointer.y = (e.clientY / innerHeight) * 2 - 1;
    // Calor/distorção acompanha a velocidade do mouse.
    const u = effects.heat.uniforms;
    const nx = e.clientX / innerWidth;
    const ny = 1 - e.clientY / innerHeight;
    const vx = nx - u.get('mouse').value.x;
    const vy = ny - u.get('mouse').value.y;
    u.get('mouse').value.set(nx, ny);
    u.get('velocity').value.set(vx, vy);
    heatAmount = Math.min(1, heatAmount + Math.hypot(vx, vy) * 8);
    if (!drag.on) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.vYaw = dx * 0.006;
    drag.yaw += drag.vYaw;
    drag.pitch = THREE.MathUtils.clamp(drag.pitch + dy * 0.002, -0.15, 0.15);
  });
  window.addEventListener('pointerup', () => {
    drag.on = false;
    cursor.setDrag(false);
  });
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  let heatAmount = 0;

  // ---------- Pintura ----------
  const swatches = $$('.swatch');
  const setPaint = (name) => {
    if (!car.setPaint(name, gsap)) return;
    swatches.forEach((s) => s.classList.toggle('is-active', s.dataset.paint === name));
    audio.play('passby', { rate: 1.2 });
  };
  swatches.forEach((s) => s.addEventListener('click', () => setPaint(s.dataset.paint)));
  $('[data-cycle-paint]').addEventListener('click', () => {
    const names = car.paintNames;
    setPaint(names[(names.indexOf(car.paint) + 1) % names.length]);
  });

  camera.position.set(0, 0.62, 7.6);
  camera.lookAt(0, 0.5, 0);
  await stage.renderer.compileAsync(scene, camera);

  // ---------- Loop ----------
  const clock = new THREE.Clock();
  const target = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const motion = reducedMotion ? 0 : 1;
  let lastShadowKey = '';
  let introDone = false;
  gsap.delayedCall(8, () => (introDone = true));

  stage.renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    const scrollVel = lenis?.velocity ?? 0;

    pointer.sx += (pointer.x - pointer.sx) * 0.04;
    pointer.sy += (pointer.y - pointer.sy) * 0.04;

    // Arrasto: inércia e mola de volta para o lugar.
    if (!drag.on) {
      drag.yaw += drag.vYaw;
      drag.vYaw *= 0.92;
      drag.yaw *= 0.95;
      drag.pitch *= 0.93;
    }
    car.root.rotation.y = drag.yaw;
    car.root.rotation.x = drag.pitch * 0.4;
    // Sombra: só refaz quando o carro gira, explode ou as luzes mudam.
    const shadowKey = `${drag.yaw.toFixed(3)}|${drag.pitch.toFixed(3)}|${rig.explode.toFixed(3)}|${world.state.power.toFixed(2)}`;
    if (shadowKey !== lastShadowKey) {
      stage.renderer.shadowMap.needsUpdate = true;
      lastShadowKey = shadowKey;
    }

    // Câmera
    const f = fit();
    const dist = rig.dist * f * introCam.dolly;
    target.set(rig.tx, rig.ty, rig.tz);
    camera.position.set(
      Math.sin(rig.az) * Math.cos(rig.el),
      Math.sin(rig.el),
      Math.cos(rig.az) * Math.cos(rig.el),
    ).multiplyScalar(dist).add(target);
    // Paralaxe do mouse e respiração leve.
    tmp.set(pointer.sx * 0.25, -pointer.sy * 0.12 + Math.sin(t * 0.17) * 0.03, 0).applyQuaternion(camera.quaternion);
    camera.position.addScaledVector(tmp, motion);
    // Tremor de alta velocidade.
    const shake = rig.speed * rig.speed * 0.035 * motion;
    camera.position.x += (Math.sin(t * 41) + Math.sin(t * 27.3)) * shake;
    camera.position.y += Math.max(-camera.position.y + 0.08, (Math.sin(t * 37.7) + Math.sin(t * 19.1)) * shake);
    camera.lookAt(target);
    if (camera.fov !== rig.fov) {
      camera.fov = rig.fov;
      camera.updateProjectionMatrix();
    }

    // Cena
    car.setExplode(rig.explode);
    car.setBrakeHeat(rig.heat);
    const wheelSpeed = rig.spin * 26 + rig.speed * 90;
    car.spinWheels(wheelSpeed * dt);
    world.state.speed = rig.speed;
    world.state.fogScale = rig.fog;
    world.update(t, dt);
    flow.show = rig.flow;
    flow.update(t);
    sparks.state.rate = rig.sparks + rig.speed * 0.35 * THREE.MathUtils.smoothstep(Math.sin(t * 3.1), 0.6, 1);
    sparks.update(dt);
    labels.update(rig.labels);

    // Luz traseira: acesa fixa; na largada, pisca como no grid.
    if (rig.final > 0.5) car.setRearLight(Math.sin(t * 9) > 0 ? 7 : 0.3);
    else car.setRearLight(world.state.power * 3.2);

    // Fundo branco → vermelho.
    // Fundo escurece no túnel de velocidade.
    world.state.dark = rig.dark;
    world.state.grid = rig.grid;

    // Pós: velocidade liga blur radial e aberração cromática; o mouse liga o calor.
    effects.radialBlur.strength = rig.speed * rig.speed * 0.09 * motion;
    const ca = (rig.speed * 0.0025 + Math.min(Math.abs(scrollVel), 80) * 0.00004) * motion;
    effects.chroma.offset.set(ca, ca * 0.6);
    heatAmount *= 0.94;
    effects.heat.uniforms.get('amount').value = heatAmount;

    // Interface ligada à cena
    const kmh = Math.round(rig.speed * 340);
    ui.speed.textContent = String(kmh).padStart(3, '0');
    ui.gear.textContent = kmh < 4 ? 'N' : String(Math.min(8, 1 + Math.floor(rig.speed * 8)));
    ui.rpm.style.transform = `scaleX(${kmh < 4 ? 0.1 : 0.45 + ((rig.speed * 8) % 1) * 0.55})`;
    ui.temp.textContent = Math.round(rig.heat * 1050).toLocaleString('pt-BR');
    ui.tempBar.style.transform = `scaleX(${rig.heat})`;
    ui.marquee.style.opacity = THREE.MathUtils.smoothstep(rig.speed, 0.15, 0.6);
    ui.marqueeTrack.style.transform = `translate3d(${-((world.state.travel * 6) % (ui.marqueeTrack.scrollWidth / 2))}px,0,0)`;

    audio.update(rig.speed, scrollVel);
    composer.render(dt);
    if (introDone) stage.governor(dt);
  });

  if (import.meta.env.DEV) window.__f1 = { THREE, stage, world, car, rig, tl, flow, sparks, lenis };
  intro({ counter, renderCount, effects, world, introCam });
}

// Linha do tempo única, controlada pela rolagem. A unidade é "vh rolado":
// as seções têm 100/200/250/200/250/200 vh e começam em 0/100/300/550/750/1000.
function buildTimeline(rig, car) {
  const w = car.frontWheelPos;
  const tl = gsap.timeline({
    defaults: { ease: 'power2.inOut' },
    scrollTrigger: {
      trigger: 'main',
      start: 'top top',
      end: 'bottom bottom',
      scrub: reducedMotion ? true : 1,
      onUpdate: (self) => (ui.progress.style.transform = `scaleX(${self.progress})`),
    },
  });

  // Cada seção fica presa na tela por (altura − 100vh): aero 100–200, explosão 300–450,
  // freios 550–650, velocidade 750–900, largada 1000–1100. Entre elas, a câmera viaja.

  // 01 → 02: a câmera sobe em arco até a lateral.
  tl.to(rig, { az: Math.PI / 2, dist: 9.6, ty: 0.55, duration: 100 }, 0)
    .to(rig, { el: 0.55, duration: 50, ease: 'sine.out' }, 0)
    .to(rig, { el: 0.1, duration: 50, ease: 'sine.in' }, 50)
    .to(rig, { fog: 0.3, duration: 60, ease: 'none' }, 0)
    // 02 Aerodinâmica
    .to(rig, { flow: 1, duration: 60, ease: 'none' }, 50)
    .to(rig, { labels: 1, duration: 45, ease: 'none' }, 100)
    .to(rig, { az: Math.PI / 2 - 0.14, dist: 9.1, duration: 120, ease: 'none' }, 100)
    .to(rig, { labels: 0, duration: 25, ease: 'none' }, 195)
    .to(rig, { flow: 0, duration: 40, ease: 'none' }, 205)
    // 02 → 03: vista três-quartos elevada e explosão em ordem.
    .to(rig, { az: 0.78, el: 0.36, dist: 12.5, ty: 0.7, duration: 80 }, 220)
    .to(rig, { explode: 1, duration: 120, ease: 'none' }, 290)
    .to(rig, { grid: 0.16, duration: 60, ease: 'none' }, 230)
    .to(rig, { grid: 0.08, duration: 60, ease: 'none' }, 460)
    .to(rig, { az: 1.02, duration: 160, ease: 'none' }, 300)
    .to(rig, { explode: 0, duration: 60, ease: 'power1.inOut' }, 450)
    // 03 → 04: close na roda dianteira; roda gira, disco esquenta, faíscas.
    .to(rig, { az: 1.12, el: 0.06, dist: 3.1, tx: w.x, ty: w.y + 0.04, tz: w.z, fov: 32, fog: 0, duration: 80 }, 470)
    .to(rig, { spin: 1, duration: 40, ease: 'power1.in' }, 530)
    .to(rig, { heat: 1, duration: 80, ease: 'power1.in' }, 555)
    .to(rig, { sparks: 1, duration: 15, ease: 'none' }, 575)
    .to(rig, { az: 1.42, dist: 2.8, duration: 110, ease: 'none' }, 550)
    .to(rig, { sparks: 0, duration: 20, ease: 'none' }, 655)
    .to(rig, { heat: 0, spin: 0, duration: 50, ease: 'power1.out' }, 670)
    // 04 → 05: câmera baixa de três-quartos traseiro; o fundo fica vermelho e o mundo passa.
    .to(rig, { az: 2.55, el: 0.05, dist: 8.4, tx: 0, ty: 0.5, tz: 0, fov: 30, duration: 70 }, 675)
    .to(rig, { dark: 1, duration: 45, ease: 'none' }, 700)
    .to(rig, { speed: 1, duration: 110, ease: 'power2.in' }, 735)
    .to(rig, { az: 2.35, dist: 7.6, duration: 160, ease: 'none' }, 745)
    // 05 → 06: desacelera e para atrás do carro, no grid.
    .to(rig, { speed: 0, duration: 60, ease: 'power2.out' }, 900)
    .to(rig, { dark: 0.35, grid: 0.04, duration: 60, ease: 'none' }, 920)
    .to(rig, { az: Math.PI, el: 0.16, dist: 10.5, ty: 1.25, fov: 28, duration: 90 }, 905)
    .to(rig, { final: 1, duration: 1, ease: 'none' }, 990)
    .to({}, { duration: 1 }, 1099);

  return tl;
}

function setupSectionTriggers(car, rig, world, audio) {
  // Número e nome da seção na barra de baixo + whoosh na troca.
  const sections = $$('main > section');
  sections.forEach((sec, i) => {
    ScrollTrigger.create({
      trigger: sec,
      start: 'top 50%',
      end: 'bottom 50%',
      onToggle: (self) => {
        if (!self.isActive) return;
        ui.sectionNum.textContent = String(i + 1).padStart(2, '0');
        ui.sectionName.textContent = sec.dataset.section;
        if (i > 0) audio.play('passby');
      },
    });
  });

  // Largada: cinco luzes acendem, apagam juntas e revelam o final.
  const finale = $('.finale');
  const finaleChars = sectionTitles.find((s) => finale.contains(s.el))?.chars ?? [];
  gsap.set(finale.querySelectorAll('.sec__num, .finale__sub, .finale__cta'), { opacity: 0, y: 20 });
  gsap.set(finaleChars, { yPercent: 115 });
  let seq = null;
  const reset = () => {
    seq?.kill();
    ui.lights.forEach((l) => l.classList.remove('is-on'));
    gsap.set(finale.querySelectorAll('.sec__num, .finale__sub, .finale__cta'), { opacity: 0, y: 20 });
    gsap.set(finaleChars, { yPercent: 115 });
  };
  ScrollTrigger.create({
    trigger: '#largada',
    start: 'top 25%',
    onEnter: () => {
      reset();
      seq = gsap.timeline();
      ui.lights.forEach((l, i) =>
        seq.add(() => {
          l.classList.add('is-on');
          audio.play('beep');
        }, 0.3 + i * 0.75),
      );
      seq
        .add(() => {
          ui.lights.forEach((l) => l.classList.remove('is-on'));
          audio.play('launch');
        }, 0.3 + 4 * 0.75 + 1.1)
        .to(finaleChars, { yPercent: 0, duration: 1.2, stagger: 0.03, ease: 'expo.out' }, '+=0.1')
        .to(finale.querySelectorAll('.sec__num, .finale__sub, .finale__cta'), { opacity: 1, y: 0, duration: 1, stagger: 0.1, ease: 'expo.out' }, '<0.3');
    },
    onLeaveBack: reset,
  });

  // Contadores dos dados.
  $$('[data-count-to]').forEach((el) => {
    ScrollTrigger.create({
      trigger: el.closest('section'),
      start: 'top 40%',
      onEnter: () => countUp(el, Number(el.dataset.countTo)),
      onLeaveBack: () => (el.textContent = '0'),
    });
  });
}

// Títulos das seções letra por letra, textos e blocos entrando ao rolar.
function setupTextAnimations() {
  for (const { el, chars } of sectionTitles) {
    if (el.closest('.finale')) continue;
    gsap.fromTo(
      chars,
      { yPercent: 115 },
      {
        yPercent: 0,
        duration: 1.2,
        stagger: 0.025,
        ease: 'expo.out',
        scrollTrigger: { trigger: el.closest('section'), start: 'top 35%', toggleActions: 'play none none reverse' },
      },
    );
  }
  $$('[data-reveal]').forEach((el) => {
    gsap.fromTo(
      el,
      { opacity: 0, y: 30 },
      {
        opacity: 1,
        y: 0,
        duration: 1.1,
        ease: 'expo.out',
        delay: 0.15,
        scrollTrigger: { trigger: el.closest('section'), start: 'top 35%', toggleActions: 'play none none reverse' },
      },
    );
  });
  // Blocos que não são texto revelado (lista de peças, medidores).
  $$('.gauge, .speedo').forEach((el) => {
    gsap.fromTo(
      el,
      { opacity: 0, y: 40 },
      {
        opacity: 1,
        x: 0,
        y: 0,
        duration: 1.2,
        ease: 'expo.out',
        scrollTrigger: { trigger: el.closest('section'), start: 'top 30%', toggleActions: 'play none none reverse' },
      },
    );
  });
  // O título do hero sai deslizando conforme a página desce.
  gsap.to('.hero__title .line--a', { xPercent: -18, opacity: 0, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom 30%', scrub: true } });
  gsap.to('.hero__title .line--b', { xPercent: 18, opacity: 0, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom 30%', scrub: true } });
  // fromTo explícito: durante o loader esses elementos estão com opacidade 0 no CSS.
  gsap.fromTo(
    '.hero__foot, .hero .kicker',
    { opacity: 1, y: 0 },
    { opacity: 0, y: -30, ease: 'none', immediateRender: false, scrollTrigger: { trigger: '.hero', start: '10% top', end: '60% top', scrub: true } },
  );
}

function intro({ counter, renderCount, effects, world, introCam }) {
  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });

  // Fim do carregamento: o símbolo ganha cor e dispara para cima, deixando riscos de velocidade.
  // Se o download foi rápido, o que falta do desenho ainda leva até ~2 s para ser visto.
  const remaining = (100 - counter.value) / 100;
  tl.to(counter, { value: 100, duration: 0.6 + remaining * 1.6, ease: 'power1.inOut', onUpdate: renderCount, overwrite: true })
    .to('.loader__car .tyre path', { fillOpacity: 1, duration: 0.35, stagger: 0.06, ease: 'power2.out' }, '+=0.05')
    .to('.loader__car .wing path, .loader__car .light', { fillOpacity: 1, duration: 0.35, ease: 'power2.out' }, '<0.1')
    .to('.loader__count, .loader__meta, .loader__top', { autoAlpha: 0, duration: 0.4 }, '+=0.25');
  if (reducedMotion) {
    tl.to(ui.loaderCar, { autoAlpha: 0, duration: 0.5 });
  } else {
    tl.set(ui.loaderCar, { animation: 'none' })
      .to(ui.loaderCar, { y: 14, scaleY: 0.97, duration: 0.35, ease: 'power2.out' }, '<')
      .to(ui.loaderCar, { y: () => -window.innerHeight * 1.2, scaleY: 1.12, duration: 0.85, ease: 'expo.in' })
      .to('.loader__streaks i', { scaleY: 1, opacity: 0.7, duration: 0.5, stagger: { each: 0.04, from: 'center' }, ease: 'power3.in' }, '<0.25')
      .to('.loader__streaks i', { opacity: 0, duration: 0.3 }, '>-0.05');
  }
  tl.set(ui.loader, { autoAlpha: 0 }).addLabel('lights');

  // Luzes do estúdio acendendo, com uma piscada antes de firmar.
  const power = world.state;
  if (reducedMotion) {
    tl.to(power, { power: 1, duration: 1.2, ease: 'power2.out', onUpdate: world.applyPower }, 'lights');
  } else {
    tl.to(
      power,
      {
        keyframes: [
          { power: 0.55, duration: 0.06 },
          { power: 0.05, duration: 0.12 },
          { power: 0.8, duration: 0.05 },
          { power: 0.25, duration: 0.18 },
          { power: 1, duration: 1.6, ease: 'power2.out' },
        ],
        onUpdate: world.applyPower,
      },
      'lights',
    );
  }

  tl.to(effects.reveal, { progress: 1, duration: reducedMotion ? 0.8 : 2.6, ease: 'power2.inOut' }, 'lights')
    .to(introCam, { dolly: 1, duration: 4.2, ease: 'expo.out' }, 'lights')
    .to(world.state, { fog: 1, duration: 3.5, ease: 'power1.out' }, 'lights+=0.3')
    .to(heroChars, { yPercent: 0, duration: 1.4, stagger: 0.035 }, 'lights+=1.0')
    .to(ui.fadeIns, { opacity: 1, duration: 1.2, ease: 'power2.out' }, 'lights+=1.8')
    .add(() => {
      document.body.classList.remove('is-loading');
      lenis?.start();
      ScrollTrigger.refresh();
    }, 'lights+=1.8');
}
