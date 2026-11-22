// EstadíReels — feed vertical de reels de Bioestadística con pregunta de repaso y progreso local.
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const CLAVE = "estadireels-v1";

  // ---------------- almacenamiento local (puede fallar en modo privado: la app funciona igual)
  const cargar = () => {
    try { return JSON.parse(localStorage.getItem(CLAVE)) || {}; } catch { return {}; }
  };
  const E = Object.assign({ vistos: {}, quiz: {}, vel: 1, tema: "todos" }, cargar());
  const guardar = () => { try { localStorage.setItem(CLAVE, JSON.stringify(E)); } catch { /* sin almacenamiento */ } };

  let DATOS = { temas: {}, reels: [] };
  let actual = null; // elemento .reel visible
  let sonido = false;

  const aviso = (t) => {
    const a = $("#aviso");
    a.textContent = t; a.hidden = false;
    clearTimeout(aviso.t); aviso.t = setTimeout(() => (a.hidden = true), 1800);
  };

  // ---------------- chips de temas
  const pintarChips = () => {
    const c = $("#chips");
    const opciones = [["todos", "Todo"], ...Object.keys(DATOS.temas).map((k) => [k, `T${k} · ${DATOS.temas[k]}`]), ["fallos", "✗ Mis fallos"]];
    c.innerHTML = "";
    for (const [v, t] of opciones) {
      const b = document.createElement("button");
      b.className = "chip"; b.textContent = t; b.setAttribute("aria-pressed", String(String(E.tema) === v));
      b.onclick = () => { E.tema = v; guardar(); pintarChips(); pintarFeed(); };
      c.appendChild(b);
    }
    const sel = c.querySelector('[aria-pressed="true"]');
    if (sel) sel.scrollIntoView({ inline: "center", block: "nearest" });
  };

  // ---------------- feed
  const lista = () => {
    const R = DATOS.reels;
    if (E.tema === "fallos") return R.filter((r) => r.disponible && E.quiz[r.id] && !E.quiz[r.id].ok);
    if (E.tema === "todos") return R.filter((r) => r.disponible);
    return R.filter((r) => String(r.tema) === String(E.tema));
  };

  const obs = new IntersectionObserver((entradas) => {
    for (const e of entradas) if (e.isIntersecting && e.intersectionRatio > 0.6) activar(e.target);
  }, { threshold: [0.6] });

  const pintarFeed = () => {
    const feed = $("#feed");
    feed.querySelectorAll("video").forEach((v) => v.pause());
    feed.innerHTML = "";
    actual = null;
    const L = lista();
    if (!L.length) {
      feed.appendChild(tarjetaPronto(E.tema === "fallos" ? { titulo: "¡Sin fallos!", texto: "Aquí aparecerán los reels cuya pregunta hayas fallado, para repasarlos." } : { titulo: "Próximamente", texto: "Los reels de este tema están en producción." }));
      return;
    }
    L.forEach((r) => feed.appendChild(r.disponible ? tarjetaReel(r) : tarjetaPronto({ n: r.n, titulo: r.titulo, texto: "Este reel está en producción. ¡Muy pronto!" })));
    if (E.tema === "todos") {
      const faltan = DATOS.reels.filter((r) => !r.disponible).length;
      if (faltan) feed.appendChild(tarjetaPronto({ titulo: `${faltan} reels más en camino`, texto: "Pulsa 📊 para ver el temario completo y lo que llevas." }));
    }
    feed.scrollTop = 0;
    feed.querySelectorAll(".reel").forEach((el) => obs.observe(el));
  };

  const tarjetaPronto = ({ n, titulo, texto }) => {
    const s = document.createElement("section");
    s.className = "reel pronto";
    s.innerHTML = `<div class="pronto-caja">${n ? `<div class="n">Reel ${n} de 48</div>` : ""}<h2></h2><p></p></div>`;
    s.querySelector("h2").textContent = titulo;
    s.querySelector("p").textContent = texto;
    return s;
  };

  const tarjetaReel = (r) => {
    const s = document.createElement("section");
    s.className = "reel";
    s.dataset.id = r.id;
    s.innerHTML = `
      <video playsinline preload="none" poster="${r.poster}" data-src="${r.video}"></video>
      <div class="pausa">▶</div>
      <div class="controles">
        <button class="c-atras" aria-label="Atrás 5 segundos">↺ 5</button>
        <button class="c-play" aria-label="Pausar o reproducir">❚❚</button>
        <button class="c-adelante" aria-label="Adelante 5 segundos">5 ↻</button>
        <input class="c-barra" type="range" min="0" max="100" step="0.1" value="0" aria-label="Avance del vídeo">
        <span class="c-tiempo">0:00 / 0:00</span>
      </div>
      <div class="lateral">
        <button class="b-vel" aria-label="Velocidad">${E.vel === 1 ? "1×" : "1,5×"}</button>
        <button class="b-quiz" aria-label="Pregunta de repaso">?</button>
        <button class="b-sonido" aria-label="Sonido">${sonido ? "🔊" : "🔇"}</button>
      </div>
      <div class="pie-reel"><div class="tema"></div><div class="titulo"></div></div>`;
    s.querySelector(".tema").textContent = `T${r.tema} · ${DATOS.temas[r.tema]}`;
    s.querySelector(".titulo").textContent = r.titulo;
    const v = s.querySelector("video");
    const marcaQuiz = () => {
      const q = E.quiz[r.id];
      const b = s.querySelector(".b-quiz");
      b.textContent = q ? (q.ok ? "✔" : "✗") : "?";
      b.classList.toggle("hecho", !!(q && q.ok));
    };
    marcaQuiz();
    s._marcaQuiz = marcaQuiz;
    const barra = s.querySelector(".c-barra"), tiempo = s.querySelector(".c-tiempo"), bPlay = s.querySelector(".c-play");
    const mmss = (x) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, "0")}`;
    let arrastrando = false;
    const pintaBarra = () => {
      const d = v.duration || r.duracion || 0;
      if (!arrastrando && d) barra.value = (v.currentTime / d) * 100;
      barra.style.setProperty("--p", `${barra.value}%`);
      tiempo.textContent = `${mmss(v.currentTime || 0)} / ${mmss(d)}`;
    };
    const pintaPlay = () => { bPlay.textContent = v.paused ? "▶" : "❚❚"; s.classList.toggle("pausado", v.paused); };
    v.addEventListener("timeupdate", pintaBarra);
    v.addEventListener("loadedmetadata", pintaBarra);
    v.addEventListener("play", pintaPlay);
    v.addEventListener("pause", pintaPlay);
    const saltar = (dt) => {
      if (!v.src) cargarVideo(s);
      const d = v.duration || r.duracion || 0;
      v.currentTime = Math.max(0, Math.min(d ? d - 0.05 : 0, (v.currentTime || 0) + dt));
      pintaBarra();
    };
    s.querySelector(".c-atras").onclick = (e) => { e.stopPropagation(); saltar(-5); };
    s.querySelector(".c-adelante").onclick = (e) => { e.stopPropagation(); saltar(5); };
    bPlay.onclick = (e) => { e.stopPropagation(); if (v.paused) v.play().catch(() => {}); else v.pause(); };
    barra.addEventListener("pointerdown", () => (arrastrando = true));
    barra.addEventListener("input", () => {
      const d = v.duration || r.duracion || 0;
      if (d) v.currentTime = (barra.value / 100) * d;
      pintaBarra();
    });
    barra.addEventListener("change", () => { arrastrando = false; pintaBarra(); });
    barra.addEventListener("pointerup", () => (arrastrando = false));
    v.addEventListener("ended", () => {
      E.vistos[r.id] = true; guardar();
      abrirQuiz(r, s);
    });
    v.addEventListener("click", () => {
      if (v.paused) v.play().catch(() => {});
      else v.pause();
    });
    s.querySelector(".b-vel").onclick = () => {
      E.vel = E.vel === 1 ? 1.5 : 1; guardar();
      document.querySelectorAll(".b-vel").forEach((b) => (b.textContent = E.vel === 1 ? "1×" : "1,5×"));
      document.querySelectorAll("video").forEach((x) => (x.playbackRate = E.vel));
      aviso(E.vel === 1 ? "Velocidad normal" : "Velocidad ×1,5");
    };
    s.querySelector(".b-quiz").onclick = () => { v.pause(); abrirQuiz(r, s); };
    s.querySelector(".b-sonido").onclick = () => {
      sonido = !sonido;
      document.querySelectorAll("video").forEach((x) => (x.muted = !sonido));
      document.querySelectorAll(".b-sonido").forEach((b) => (b.textContent = sonido ? "🔊" : "🔇"));
    };
    return s;
  };

  const cargarVideo = (el) => {
    const v = el && el.querySelector("video");
    if (v && !v.src && v.dataset.src) { v.src = v.dataset.src; v.preload = "auto"; }
    return v;
  };

  const activar = (el) => {
    if (actual === el) return;
    if (actual) { const pv = actual.querySelector("video"); if (pv) pv.pause(); }
    actual = el;
    if ($("#portada") && !$("#portada").hidden) return;
    const v = cargarVideo(el);
    cargarVideo(el.nextElementSibling); // precarga el siguiente
    if (!v) return;
    v.muted = !sonido;
    v.playbackRate = E.vel;
    el.classList.remove("pausado");
    v.play().catch(() => el.classList.add("pausado"));
  };

  // ---------------- quiz
  let quizDe = null;
  const abrirQuiz = (r, el) => {
    quizDe = { r, el };
    const q = r.quiz;
    $("#quiz-pregunta").textContent = q.pregunta;
    const ops = $("#quiz-opciones");
    ops.innerHTML = "";
    $("#quiz-explicacion").hidden = true;
    // opciones barajadas cada vez (la correcta no siempre en el mismo sitio)
    const orden = q.opciones.map((_, i) => i).sort(() => Math.random() - 0.5);
    orden.forEach((i) => {
      const t = q.opciones[i];
      const b = document.createElement("button");
      b.dataset.i = String(i);
      b.className = "opcion"; b.textContent = t;
      b.onclick = () => {
        const ok = i === q.correcta;
        ops.querySelectorAll(".opcion").forEach((x) => {
          x.disabled = true;
          if (Number(x.dataset.i) === q.correcta) x.classList.add("bien");
        });
        if (!ok) b.classList.add("mal");
        const prev = E.quiz[r.id] || { intentos: 0 };
        E.quiz[r.id] = { ok, intentos: prev.intentos + 1 };
        E.vistos[r.id] = true;
        guardar();
        el._marcaQuiz && el._marcaQuiz();
        const ex = $("#quiz-explicacion");
        ex.textContent = (ok ? "✔ ¡Correcto! " : "✗ No exactamente. ") + q.explicacion;
        ex.hidden = false;
      };
      ops.appendChild(b);
    });
    $("#quiz").hidden = false;
  };
  const cerrarQuiz = () => { $("#quiz").hidden = true; };
  $("#quiz").addEventListener("click", (e) => { if (e.target.id === "quiz") cerrarQuiz(); });
  $("#quiz-repetir").onclick = () => {
    cerrarQuiz();
    const v = quizDe && quizDe.el.querySelector("video");
    if (v) { v.currentTime = 0; v.play().catch(() => {}); quizDe.el.classList.remove("pausado"); }
  };
  $("#quiz-siguiente").onclick = () => {
    cerrarQuiz();
    const sig = quizDe && quizDe.el.nextElementSibling;
    if (sig) sig.scrollIntoView({ behavior: "smooth" });
    else aviso("¡Has llegado al final!");
  };

  // ---------------- progreso
  const pintarProgreso = () => {
    const disp = DATOS.reels.filter((r) => r.disponible);
    const vistos = disp.filter((r) => E.vistos[r.id]).length;
    const resp = disp.filter((r) => E.quiz[r.id]);
    const acier = resp.filter((r) => E.quiz[r.id].ok).length;
    $("#resumen-global").innerHTML =
      `<div class="cifra"><b>${vistos}/${disp.length}</b><span>reels vistos</span></div>` +
      `<div class="cifra"><b>${resp.length ? Math.round((acier / resp.length) * 100) : 0}%</b><span>aciertos</span></div>` +
      `<div class="cifra"><b>${resp.length - acier}</b><span>por repasar</span></div>`;
    const cont = $("#lista-temas");
    cont.innerHTML = "";
    for (const k of Object.keys(DATOS.temas)) {
      const R = DATOS.reels.filter((r) => String(r.tema) === k);
      const D = R.filter((r) => r.disponible);
      const ok = D.filter((r) => E.quiz[r.id] && E.quiz[r.id].ok).length;
      const div = document.createElement("div");
      div.className = "tema-fila";
      div.innerHTML = `<div class="cab"><div></div><span>${ok}/${R.length} dominados</span></div><div class="barra-p"><i style="width:${(ok / R.length) * 100}%"></i></div><ul class="lista-reels"></ul>`;
      div.querySelector(".cab div").textContent = `T${k} · ${DATOS.temas[k]}`;
      const ul = div.querySelector("ul");
      for (const r of R) {
        const li = document.createElement("li");
        const q = E.quiz[r.id];
        li.className = r.disponible ? "si" : "";
        const icono = !r.disponible ? "⏳" : q ? (q.ok ? "✅" : "❌") : E.vistos[r.id] ? "👁" : "▶";
        if (r.disponible) {
          const b = document.createElement("button");
          b.textContent = `${icono} ${r.titulo}`;
          b.onclick = () => irA(r);
          li.appendChild(b);
        } else li.textContent = `${icono} ${r.titulo}`;
        ul.appendChild(li);
      }
      cont.appendChild(div);
    }
  };
  const irA = (r) => {
    $("#progreso").hidden = true;
    E.tema = String(r.tema); guardar();
    pintarChips(); pintarFeed();
    const el = document.querySelector(`.reel[data-id="${r.id}"]`);
    if (el) el.scrollIntoView();
  };
  $("#btn-progreso").onclick = () => { pintarProgreso(); $("#progreso").hidden = false; };
  $("#cerrar-progreso").onclick = () => ($("#progreso").hidden = true);
  $("#progreso").addEventListener("click", (e) => { if (e.target.id === "progreso") $("#progreso").hidden = true; });
  $("#borrar-progreso").onclick = () => {
    if (!confirm("¿Borrar todo tu progreso en este móvil?")) return;
    E.vistos = {}; E.quiz = {}; guardar(); pintarProgreso(); pintarFeed();
  };

  // ---------------- portada, instalación y arranque
  let instalar = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); instalar = e;
    const p = $("#pista-instalar");
    p.innerHTML = '<button class="btn-sec" style="color:#FFD23F">📲 Instalar la app</button>';
    p.querySelector("button").onclick = () => instalar.prompt();
  });
  const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const instalada = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (esIOS && !instalada) $("#pista-instalar").textContent = "📲 Instálala: botón Compartir → «Añadir a pantalla de inicio».";

  $("#btn-empezar").onclick = () => {
    sonido = true;
    $("#portada").hidden = true;
    document.querySelectorAll(".b-sonido").forEach((b) => (b.textContent = "🔊"));
    const el = actual || document.querySelector(".reel");
    actual = null;
    if (el) activar(el);
  };

  fetch("datos/reels.json", { cache: "no-cache" })
    .then((r) => r.json())
    .then((d) => { DATOS = d; pintarChips(); pintarFeed(); })
    .catch(() => aviso("No se pudo cargar el temario. Revisa la conexión."));

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
