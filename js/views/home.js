// 1. INDEX — logo 3D, redes sociales y botones principales
import { CONFIG, icon, esc } from "../ui.js";

export async function render(root) {
  const L = CONFIG.links;
  const socials = [
    ["instagram", L.instagram], ["tiktok", L.tiktok], ["youtube", L.youtube], ["facebook", L.facebook],
    ["whatsapp", CONFIG.whatsapp ? `https://wa.me/${CONFIG.whatsapp.replace(/\D/g, "")}` : ""],
  ].filter(([, u]) => u);
  let passes = [];
  try { passes = JSON.parse(localStorage.getItem("ts_passes") || "[]"); } catch {}

  root.innerHTML = `
  <section class="home">
    <div class="home-stage">
      <div class="logo3d-wrap" id="logo3d">
        <div class="logo3d-halo"></div>
        <img class="logo3d-fallback" data-logo src="${esc(CONFIG.logo)}" alt="${esc(CONFIG.gymName)}">
      </div>
      <p class="tagline reveal">${esc(CONFIG.slogan).replace(/•/g, '<i>•</i>')}</p>
      <nav class="socials reveal" aria-label="Redes sociales">
        ${socials.map(([n, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener" class="social" aria-label="${n}">${icon(n)}</a>`).join("")}
      </nav>
      <div class="home-actions">
        <a href="#/reserva" class="big-btn reveal" data-tilt="8">
          <span class="big-btn-ic">${icon("calendar")}</span><span class="big-btn-label">Reserva</span><span class="big-btn-arrow">${icon("chevron")}</span>
          <span class="big-btn-shine"></span>
        </a>
        <a href="#/team" class="big-btn big-btn-dark reveal" data-tilt="8">
          <span class="big-btn-ic">${icon("users")}</span><span class="big-btn-label">Team</span><span class="big-btn-arrow">${icon("chevron")}</span>
          <span class="big-btn-shine"></span>
        </a>
      </div>
      ${passes.length ? `<a href="#/pases" class="link-pill reveal">${icon("wallet")} Mis pases (${passes.length})</a>` : ""}
      <button class="link-pill install-only" onclick="installApp()">${icon("download")} Instalar app</button>
    </div>
    <footer class="home-foot">
      <p class="quote">“${esc(CONFIG.quote)}”</p>
      <a href="#/admin" class="coach-link">${icon("shield")} Acceso coach</a>
    </footer>
  </section>`;

  const destroy3d = mountLogo3D(root.querySelector("#logo3d"));
  return { destroy: destroy3d };
}

/* Medallón metálico 3D con el logo, sigue al puntero y flota suavemente */
function mountLogo3D(host) {
  const THREE = window.THREE;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!THREE || !host) return () => {};
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { return () => {}; }

  const size = () => host.clientWidth;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(size(), size());
  renderer.outputEncoding = THREE.sRGBEncoding;
  host.appendChild(renderer.domElement);
  host.classList.add("has-3d");

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0, 8.2);

  // Mapa de entorno procedural para que el metal refleje
  const envCanvas = document.createElement("canvas");
  envCanvas.width = 512; envCanvas.height = 256;
  const g = envCanvas.getContext("2d");
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, "#fff"); grd.addColorStop(0.35, "#8a8a8a"); grd.addColorStop(0.5, "#1a1a1a"); grd.addColorStop(0.65, "#6d6d6d"); grd.addColorStop(1, "#050505");
  g.fillStyle = grd; g.fillRect(0, 0, 512, 256);
  g.fillStyle = "rgba(255,255,255,.9)"; g.fillRect(90, 30, 60, 90); g.fillRect(360, 50, 40, 70);
  const envTex = new THREE.CanvasTexture(envCanvas);
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(envTex).texture;
  scene.environment = env;

  const loader = new THREE.TextureLoader();
  const logoTex = loader.load(host.querySelector("img").src, () => host.classList.add("loaded"));
  logoTex.encoding = THREE.sRGBEncoding;
  logoTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  // La tapa del cilindro mapea el UV girado 90°: se compensa para que el logo quede derecho
  logoTex.center.set(0.5, 0.5);
  logoTex.rotation = Math.PI / 2;

  const group = new THREE.Group();
  scene.add(group);

  const R = 1.85, T = 0.26, SEG = 96;
  const metal = new THREE.MeshStandardMaterial({ color: 0xcfcfcf, metalness: 1, roughness: 0.28, envMap: env });
  const face = new THREE.MeshStandardMaterial({ map: logoTex, metalness: 0.55, roughness: 0.38, envMap: env, envMapIntensity: 0.5, emissive: 0xffffff, emissiveMap: logoTex, emissiveIntensity: 0.42 });
  const back = new THREE.MeshStandardMaterial({ color: 0x151515, metalness: 0.9, roughness: 0.45, envMap: env });

  const coin = new THREE.Mesh(new THREE.CylinderGeometry(R, R, T, SEG, 1), [metal, face, back]);
  coin.rotation.x = Math.PI / 2;
  group.add(coin);

  // Aro biselado exterior
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R + 0.02, 0.085, 24, SEG), metal);
  rim.position.z = T / 2 - 0.02;
  group.add(rim);
  const rim2 = rim.clone(); rim2.position.z = -T / 2 + 0.02; group.add(rim2);

  // Anillo orbital fino
  const orbit = new THREE.Mesh(new THREE.TorusGeometry(R + 0.55, 0.008, 8, 160), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 }));
  orbit.rotation.x = 1.25;
  scene.add(orbit);

  // Partículas tipo polvo de gimnasio
  const N = 220, pos = new Float32Array(N * 3), spd = new Float32Array(N);
  for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 9; pos[i * 3 + 1] = (Math.random() - 0.5) * 9; pos[i * 3 + 2] = (Math.random() - 0.5) * 4 - 1; spd[i] = 0.002 + Math.random() * 0.006; }
  const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.028, transparent: true, opacity: 0.55, depthWrite: false }));
  scene.add(dust);

  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(3, 4, 5); scene.add(key);
  const rimL = new THREE.PointLight(0xffffff, 1.2, 20); rimL.position.set(-4, -2, 3); scene.add(rimL);

  let tx = 0, ty = 0, cx = 0, cy = 0, spin = 0, intro = 0, raf = 0, visible = true;
  const onMove = (e) => {
    const p = e.touches ? e.touches[0] : e;
    tx = (p.clientX / innerWidth - 0.5) * 0.9;
    ty = (p.clientY / innerHeight - 0.5) * 0.6;
  };
  const onTap = () => { spin += Math.PI * 2; };
  const onResize = () => renderer.setSize(size(), size());
  addEventListener("pointermove", onMove, { passive: true });
  host.addEventListener("click", onTap);
  addEventListener("resize", onResize);
  const vis = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
  vis.observe(host);

  let spinCur = 0;
  const clock = new THREE.Clock();
  const loop = () => {
    raf = requestAnimationFrame(loop);
    if (!visible) return;
    const t = clock.getElapsedTime();
    intro = Math.min(1, t / 1.8);
    const ease = 1 - Math.pow(1 - intro, 3);
    cx += (tx - cx) * 0.06; cy += (ty - cy) * 0.06;
    spinCur += (spin - spinCur) * 0.05;
    group.rotation.y = cx + (1 - ease) * -Math.PI * 1.5 + spinCur + (reduce ? 0 : Math.sin(t * 0.6) * 0.08);
    group.rotation.x = cy + (reduce ? 0 : Math.sin(t * 0.8) * 0.04);
    group.position.y = reduce ? 0 : Math.sin(t * 1.1) * 0.08;
    group.scale.setScalar(0.6 + 0.4 * ease);
    orbit.rotation.z = t * 0.25;
    key.position.x = 3 + Math.sin(t * 0.5) * 2;
    const a = pGeo.attributes.position.array;
    for (let i = 0; i < N; i++) { a[i * 3 + 1] += spd[i]; if (a[i * 3 + 1] > 4.5) a[i * 3 + 1] = -4.5; }
    pGeo.attributes.position.needsUpdate = true;
    renderer.render(scene, camera);
  };
  loop();

  return () => {
    cancelAnimationFrame(raf); vis.disconnect();
    removeEventListener("pointermove", onMove); removeEventListener("resize", onResize);
    renderer.dispose(); pmrem.dispose();
  };
}
