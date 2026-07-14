/* ════════════════════════════════════════════════════════════
   Voyage · planificador de itinerarios de viaje
   Sin servidor: todos los datos viven en localStorage.
   ════════════════════════════════════════════════════════════ */
"use strict";

/* ── Utilidades ──────────────────────────────────────────── */
const $  = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const ic = name => `<svg class="ic" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function toast(msg, ms = 3200) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, ms);
}
/* toast con botón de acción (p. ej. «Deshacer») */
function toastWithAction(msg, label, fn, ms = 6000) {
  const t = $("#toast");
  t.textContent = "";
  t.append(msg + " ");
  const btn = document.createElement("button");
  btn.className = "toast-action";
  btn.textContent = label;
  btn.addEventListener("click", () => { t.hidden = true; clearTimeout(toast._t); fn(); });
  t.append(btn);
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, ms);
}

function fmtDate(iso, opts = { weekday: "long", day: "numeric", month: "long" }) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const s = new Date(y, m - 1, d).toLocaleDateString("es-ES", opts);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function endTime(time, durationMin) {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + Number(durationMin);
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 864e5);
}
function fmtMoney(n) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n || 0);
}
function fmtDur(min) {
  if (!min) return "";
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}

/* ── Categorías ──────────────────────────────────────────── */
const CATS = {
  sight:      { emoji: "🏛️", label: "Monumento / visita" },
  nature:     { emoji: "🌿", label: "Naturaleza / paseo" },
  museum:     { emoji: "🖼️", label: "Museo" },
  food:       { emoji: "🍽️", label: "Comida / restaurante" },
  cafe:       { emoji: "☕", label: "Café / descanso" },
  shopping:   { emoji: "🛍️", label: "Compras" },
  show:       { emoji: "🎭", label: "Espectáculo / evento" },
  hotel:      { emoji: "🏨", label: "Alojamiento" },
  flight:     { emoji: "✈️", label: "Vuelo" },
  train:      { emoji: "🚄", label: "Tren / bus" },
  transport:  { emoji: "🚗", label: "Traslado" },
  beach:      { emoji: "🏖️", label: "Playa / relax" },
  nightlife:  { emoji: "🌙", label: "Vida nocturna" },
  other:      { emoji: "📌", label: "Otro" },
};
const DAY_COLORS = ["#0d5c63", "#e76f51", "#7b2d8b", "#c9a227", "#2a6fbb", "#2a9d5c", "#b23a48", "#5f6caf", "#8a5a2b", "#3f7f7f"];
/* duración típica por categoría: se sugiere al crear una actividad */
const DEFAULT_DUR = {
  sight: 90, nature: 60, museum: 120, food: 90, cafe: 30, shopping: 60,
  show: 120, hotel: 30, flight: 180, train: 120, transport: 45,
  beach: 150, nightlife: 120, other: 60,
};

/* ── Estado ──────────────────────────────────────────────── */
const STORE_KEY = "voyage.state.v1";
let state = null;
let ui = {
  tab: "itinerary",
  itinView: "list",      // "list" | "cal"
  calCursor: 0,          // índice de mes dentro de los meses del viaje
  selectedDayIdx: 0,     // día seleccionado en la vista calendario
  mapDayFilter: "all",
  editingId: null,   // id de actividad en edición
  editingLoc: null,  // {lat,lng,place} temporal del modal
  map: null, mapPromise: null,
  miniMap: null, miniMapPromise: null, miniMarker: null,
};

function newActivity(over = {}) {
  return { id: uid(), title: "", cat: "sight", time: "", duration: 60, cost: 0, lat: null, lng: null, place: "", notes: "", booking: null, ...over };
}

function buildDays(start, end, prevDays = []) {
  const n = Math.max(1, daysBetween(start, end) + 1);
  const byDate = Object.fromEntries(prevDays.map(d => [d.date, d]));
  const days = [];
  const leftovers = [];
  for (let i = 0; i < n; i++) {
    const date = addDays(start, i);
    days.push(byDate[date] || { date, items: [] });
    delete byDate[date];
  }
  Object.values(byDate).forEach(d => leftovers.push(...d.items));
  return { days, leftovers };
}

function newTrip(name, destination, start, end) {
  return {
    id: uid(), name, destination, start, end,
    days: buildDays(start, end).days,
    ideas: [], prep: [], packing: [], notes: "",
  };
}

let applyingRemote = false; // evita re-subir lo que acaba de bajar del sync
function save() {
  if (!applyingRemote) state.updatedAt = Date.now();
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
  if (!applyingRemote) scheduleAutoSync();
}
function load() {
  try { state = JSON.parse(localStorage.getItem(STORE_KEY)); } catch { state = null; }
  if (!state || !Array.isArray(state.trips) || !state.trips.length) {
    state = { version: 1, activeTripId: null, trips: [seedTrip()] };
    state.activeTripId = state.trips[0].id;
    save();
  }
  if (!state.trips.some(t => t.id === state.activeTripId)) state.activeTripId = state.trips[0].id;
}
function trip() { return state.trips.find(t => t.id === state.activeTripId); }

/* ── Archivos adjuntos (IndexedDB) ───────────────────────── */
/* localStorage se queda corto para PDFs y fotos: los adjuntos de las
   reservas viven en IndexedDB como blobs, indexados por actividad. */
const FDB = {
  _db: null,
  open() {
    this._p ||= new Promise((res, rej) => {
      const req = indexedDB.open("voyage-files", 1);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore("files", { keyPath: "id" });
        store.createIndex("actId", "actId");
      };
      req.onsuccess = () => { this._db = req.result; res(this._db); };
      req.onerror = () => rej(req.error);
    });
    return this._p;
  },
  async _tx(mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction("files", mode);
      const out = fn(tx.objectStore("files"));
      tx.oncomplete = () => res(out.result !== undefined ? out.result : out._results);
      tx.onerror = () => rej(tx.error);
    });
  },
  put(rec) { return this._tx("readwrite", s => s.put(rec)); },
  del(id) { return this._tx("readwrite", s => s.delete(id)); },
  byAct(actId) { return this._tx("readonly", s => s.index("actId").getAll(actId)); },
  all() { return this._tx("readonly", s => s.getAll()); },
  clear() { return this._tx("readwrite", s => s.clear()); },
  async delByAct(actId) {
    const recs = await this.byAct(actId);
    for (const r of recs) await this.del(r.id);
  },
};
const fmtSize = b => b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";
const blobToDataUrl = blob => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = () => rej(r.error);
  r.readAsDataURL(blob);
});
const dataUrlToBlob = async url => (await fetch(url)).blob();
function openFileRec(rec) {
  const url = URL.createObjectURL(rec.blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
/* ids de todas las actividades de un viaje (para limpiar adjuntos) */
function tripActivityIds(t) {
  const ids = [];
  t.days.forEach(d => d.items.forEach(it => ids.push(it.id)));
  t.ideas.forEach(it => ids.push(it.id));
  return ids;
}

/* ── Viaje de ejemplo ────────────────────────────────────── */
function seedTrip() {
  const t = newTrip("Pekín · ejemplo", "Pekín, China", "2026-10-12", "2026-10-14");
  const A = (title, cat, time, duration, lat, lng, extra = {}) =>
    newActivity({ title, cat, time, duration, lat, lng, place: title + ", Pekín", ...extra });
  t.days[0].items = [
    A("Plaza de Tiananmén", "sight", "08:30", 60, 39.9055, 116.3976, { notes: "Llevar el pasaporte: hay control de acceso." }),
    A("Ciudad Prohibida", "sight", "10:00", 180, 39.9163, 116.3972, { cost: 8, notes: "Reservar entrada con antelación (se agota)." }),
    A("Parque Jingshan", "nature", "13:30", 60, 39.9250, 116.3958, { cost: 1, notes: "Vistas de la Ciudad Prohibida desde la colina." }),
    A("Pato laqueado en Quanjude", "food", "19:30", 90, 39.8994, 116.3986, { cost: 30, booking: { code: "QJD-2210", provider: "Quanjude Qianmen", confirmed: true } }),
  ];
  t.days[1].items = [
    A("Gran Muralla · Mutianyu", "sight", "08:00", 300, 40.4319, 116.5704, { cost: 20, notes: "Ir en coche con conductor o bus turístico; teleférico + tobogán de bajada." }),
    A("Hutongs de Nanluoguxiang", "nature", "16:30", 90, 39.9370, 116.4030, { notes: "Callejones tradicionales, buena zona para merendar." }),
    A("Torre del Tambor", "sight", "18:15", 45, 39.9403, 116.3906, { cost: 3 }),
  ];
  t.days[2].items = [
    A("Templo del Cielo", "sight", "09:00", 120, 39.8822, 116.4066, { cost: 5, notes: "Por la mañana hay locales bailando y haciendo taichí." }),
    A("Palacio de Verano", "sight", "12:30", 150, 39.9990, 116.2755, { cost: 6, notes: "Paseo en barca por el lago Kunming si hace bueno." }),
    A("Compras en Wangfujing", "shopping", "17:00", 90, 39.9146, 116.4110),
  ];
  t.ideas = [
    A("Templo de los Lamas (Yonghe)", "sight", "", 90, 39.9477, 116.4116, { cost: 4 }),
    A("Distrito de arte 798", "museum", "", 120, 39.9843, 116.4972),
  ];
  t.days[0].items.unshift(newActivity({
    title: "Check-in · Hotel en Wangfujing", cat: "hotel", time: "14:00", duration: 30,
    lat: 39.9151, lng: 116.4113, place: "Wangfujing, Pekín", cost: 380,
    booking: { code: "PKN-77641", provider: "Trip.com", confirmed: true },
  }));
  t.prep = [
    { id: uid(), text: "Comprobar visado o exención de tránsito para China", done: false, due: "2026-09-15" },
    { id: uid(), text: "Instalar Alipay o WeChat Pay y vincular tarjeta", done: false, due: "2026-10-05" },
    { id: uid(), text: "Contratar eSIM o VPN (Google/WhatsApp no funcionan sin ella)", done: false, due: "2026-10-08" },
    { id: uid(), text: "Contratar seguro de viaje", done: false, due: "2026-10-01" },
    { id: uid(), text: "Cambiar algo de efectivo a yuanes (RMB)", done: false, due: "" },
    { id: uid(), text: "Descargar mapas sin conexión (menú ⋯)", done: false, due: "" },
  ];
  t.packing = [
    { id: uid(), text: "Pasaporte y copias", done: false, cat: "Documentos" },
    { id: uid(), text: "Tarjetas + efectivo en yuanes", done: false, cat: "Documentos" },
    { id: uid(), text: "Adaptador de enchufe tipo A/I", done: false, cat: "Electrónica" },
    { id: uid(), text: "Batería externa", done: false, cat: "Electrónica" },
    { id: uid(), text: "Calzado cómodo (la Muralla tiene mucha escalera)", done: false, cat: "Ropa" },
    { id: uid(), text: "Chaqueta: en octubre refresca por la noche", done: false, cat: "Ropa" },
  ];
  t.notes = "📞 Emergencias en China: 110 (policía) / 120 (ambulancia).\n🚇 El metro de Pekín es baratísimo; se paga con Alipay/WeChat.\n🗣️ Hola = nǐ hǎo · Gracias = xièxie · La cuenta = mǎi dān";
  return t;
}

/* ── Carga del día (¿es mucho o poco?) ───────────────────── */
const R_EARTH = 6371;
function haversineKm(a, b) {
  const rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(h));
}
/** Estimación de un trayecto entre dos puntos geolocalizados. */
function legEstimate(a, b) {
  const straight = haversineKm(a, b);
  const km = straight * 1.3; // factor de rodeo urbano
  if (straight <= 2.2) return { km, min: km / 4.5 * 60, mode: "🚶", label: "a pie" };
  return { km, min: km / 22 * 60 + 12, mode: "🚌", label: "transporte" };
}
function dayStats(day) {
  let activeMin = 0, travelMin = 0, km = 0;
  const legs = [];
  let prevGeo = null;
  day.items.forEach((it, i) => {
    activeMin += Number(it.duration) || 0;
    const geo = (it.lat != null && it.lng != null) ? it : null;
    if (geo && prevGeo) {
      const leg = legEstimate(prevGeo, geo);
      travelMin += leg.min; km += leg.km;
      legs[i] = leg; // trayecto que llega a la actividad i
    }
    if (geo) prevGeo = geo;
  });
  const totalMin = activeMin + travelMin;
  const h = totalMin / 60;
  let rating;
  if (!day.items.length)  rating = { cls: "empty",    label: "Día libre" };
  else if (h < 4)         rating = { cls: "relaxed",  label: "Relajado" };
  else if (h < 7.5)       rating = { cls: "balanced", label: "Equilibrado" };
  else if (h < 10)        rating = { cls: "busy",     label: "Intenso" };
  else                    rating = { cls: "extreme",  label: "Excesivo" };
  return { activeMin, travelMin, totalMin, km, legs, rating, pct: Math.min(h / 10, 1) * 100 };
}

/* ── Render principal ────────────────────────────────────── */
function renderAll() {
  renderTripSelect();
  renderItinerary();
  renderBookings();
  renderPrep();
  renderPacking();
  renderBudget();
  renderMapChips();
  if (ui.tab === "map") refreshMap();
}

function renderTripSelect() {
  const sel = $("#tripSelect");
  sel.innerHTML = state.trips.map(t =>
    `<option value="${t.id}" ${t.id === state.activeTripId ? "selected" : ""}>${esc(t.name)}</option>`).join("");
  const t = trip();
  $("#tripTitle").textContent = t.name;
  const n = t.days.length;
  const today = todayISO();
  let countdown = "";
  if (today < t.start) {
    const d = daysBetween(today, t.start);
    countdown = `<span class="trip-countdown">${d === 1 ? "¡Mañana!" : `Faltan ${d} días`}</span>`;
  } else if (today <= t.end) {
    countdown = `<span class="trip-countdown live">✈ De viaje · día ${daysBetween(t.start, today) + 1} de ${n}</span>`;
  }
  $("#tripDates").innerHTML =
    `${esc(t.destination ? t.destination + " · " : "")}${fmtDate(t.start, { day: "numeric", month: "short" })} – ${fmtDate(t.end, { day: "numeric", month: "short", year: "numeric" })} · ${n} día${n > 1 ? "s" : ""} ${countdown}`;
  $("#tripNotes").value = t.notes || "";
}

/* ── El tiempo (Open-Meteo, sin clave) ───────────────────── */
/* Pronóstico diario si el viaje cae dentro de la ventana de ~16 días
   de Open-Meteo; si no (viaje lejano, sin conexión, sin puntos con
   ubicación), simplemente no se muestra nada. */
let weather = { tripId: null, requested: false, byDate: {} };
function wmoEmoji(code) {
  if (code === 0) return "☀️";
  if (code <= 2) return "🌤️";
  if (code === 3) return "☁️";
  if (code <= 48) return "🌫️";
  if (code <= 57) return "🌦️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "🌨️";
  if (code <= 82) return "🌧️";
  if (code <= 86) return "🌨️";
  return "⛈️";
}
async function ensureWeather() {
  const t = trip();
  if (weather.tripId === t.id && weather.requested) return;
  weather = { tripId: t.id, requested: true, byDate: {} };
  const pts = geoItems("all");
  if (!pts.length || !navigator.onLine) return;
  const key = "voyage.weather." + t.id;
  try {
    const cached = JSON.parse(localStorage.getItem(key));
    if (cached && Date.now() - cached.ts < 3 * 3600e3) {
      weather.byDate = cached.byDate;
      if (ui.tab === "itinerary") renderItinerary();
      return;
    }
  } catch { /* sin caché */ }
  try {
    const p = pts[0].it;
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lng}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&start_date=${t.start}&end_date=${t.end}`);
    if (!res.ok) return; // fechas fuera del rango de pronóstico
    const d = await res.json();
    const byDate = {};
    (d.daily?.time || []).forEach((date, i) => {
      byDate[date] = {
        code: d.daily.weather_code[i],
        max: Math.round(d.daily.temperature_2m_max[i]),
        min: Math.round(d.daily.temperature_2m_min[i]),
      };
    });
    weather.byDate = byDate;
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), byDate }));
    if (ui.tab === "itinerary") renderItinerary();
  } catch { /* sin conexión: silencio */ }
}

/* ── Itinerario ──────────────────────────────────────────── */
function activityCardHTML(it, dayIdx, itemIdx) {
  const cat = CATS[it.cat] || CATS.other;
  const geo = it.lat != null && it.lng != null;
  const meta = [];
  if (it.duration) meta.push(`<span>${ic("clock")} ${fmtDur(it.duration)}</span>`);
  if (it.cost) meta.push(`<span>${ic("euro")} ${fmtMoney(it.cost)}</span>`);
  meta.push(geo
    ? `<span class="geo-ok">${ic("pin")} ${esc((it.place || "").split(",")[0] || "en el mapa")}</span>`
    : `<span class="geo-missing">${ic("pin")} sin ubicación</span>`);
  const bookChip = it.booking
    ? `<span class="a-booking-chip ${it.booking.confirmed ? "" : "pending"}">${it.booking.confirmed ? "RESERVADO" : "PENDIENTE"}</span>` : "";
  return `
  <article class="activity" draggable="true" data-id="${it.id}" data-day="${dayIdx}" data-idx="${itemIdx}" title="Arrastra para reordenar · clic para editar">
    <div class="a-emoji">${cat.emoji}</div>
    <div class="a-main">
      <div class="a-title">${esc(it.title) || "<em>Sin título</em>"}</div>
      <div class="a-meta">${meta.join(" ")}</div>
      ${it.notes ? `<div class="a-notes">${esc(it.notes)}</div>` : ""}
    </div>
    <div class="a-side">
      ${it.time ? `<span class="a-time">${esc(it.time)}${it.duration ? `<em>–${endTime(it.time, it.duration)}</em>` : ""}</span>` : ""}
      ${bookChip}
    </div>
  </article>`;
}

function dayCardHTML(di) {
  const t = trip();
  const day = t.days[di];
  const st = dayStats(day);
  const color = DAY_COLORS[di % DAY_COLORS.length];
  const itemsHTML = day.items.map((it, ii) => {
    const leg = st.legs[ii];
    const legHTML = leg
      ? `<div class="leg">${ic("route")} ${leg.mode} ${leg.km.toFixed(1)} km · ~${Math.round(leg.min)} min ${leg.label}</div>` : "";
    return legHTML + activityCardHTML(it, di, ii);
  }).join("");
  const loadDetail = day.items.length
    ? `${fmtDur(Math.round(st.activeMin))} de actividades · ${fmtDur(Math.round(st.travelMin)) || "0 min"} de trayectos · ${st.km.toFixed(1)} km`
    : "Añade actividades o arrastra ideas aquí";
  const isToday = day.date === todayISO();
  const w = weather.tripId === t.id ? weather.byDate[day.date] : null;
  const canSort = day.items.filter(it => it.time).length >= 2;
  return `
  <section class="day-card ${isToday ? "today" : ""}" data-day="${di}">
    <header class="day-head">
      <span class="day-num" style="background:${color}">${di + 1}</span>
      <div class="day-title">
        <h3>${fmtDate(day.date)}${isToday ? '<span class="today-pill">HOY</span>' : ""}${w ? `<span class="day-weather" title="Pronóstico">${wmoEmoji(w.code)} ${w.max}°<em>/${w.min}°</em></span>` : ""}</h3>
        <span class="small">${loadDetail}</span>
      </div>
      <div class="day-load" title="Estimación: tiempo de actividades + trayectos">
        <span class="load-meter"><i class="load-${st.rating.cls}-bar" style="width:${st.pct}%"></i></span>
        <span class="load-pill load-${st.rating.cls}">${st.rating.label}${day.items.length ? " · " + (st.totalMin / 60).toFixed(1) + " h" : ""}</span>
      </div>
      <div class="day-route-btns">
        ${canSort ? `<button class="btn btn-icon" data-act="sort-day" data-day="${di}" title="Ordenar las actividades por hora">${ic("clock")}</button>` : ""}
        <button class="btn btn-icon" data-act="add-to-day" data-day="${di}" title="Añadir actividad a este día">${ic("plus")}</button>
        <button class="btn btn-soft" data-act="gmaps-day" data-day="${di}" title="Abrir ruta del día en Google Maps">${ic("external")} Ruta</button>
      </div>
    </header>
    <div class="day-body drop-zone" data-day="${di}">
      ${itemsHTML || `<div class="day-empty">Día libre — arrastra actividades aquí o <button type="button" class="link-btn" data-act="add-to-day" data-day="${di}">añade la primera</button></div>`}
    </div>
  </section>`;
}

function renderItinerary() {
  const t = trip();
  $("#listWrap").hidden = ui.itinView !== "list";
  $("#calWrap").hidden = ui.itinView !== "cal";
  $("#btnViewList").classList.toggle("active", ui.itinView === "list");
  $("#btnViewCal").classList.toggle("active", ui.itinView === "cal");

  if (ui.itinView === "list") {
    $("#daysContainer").innerHTML = t.days.map((_, di) => dayCardHTML(di)).join("");
    $("#ideasList").innerHTML = t.ideas.length
      ? t.ideas.map((it, ii) => activityCardHTML(it, "ideas", ii)).join("")
      : '<div class="day-empty">Sin ideas pendientes</div>';
  } else {
    renderCalendar();
  }
  bindDnD();
  bindActivityClicks();
  ensureWeather();
}

/* ── Vista de calendario mensual ─────────────────────────── */
function tripMonths() {
  const t = trip();
  const [y0, m0] = t.start.split("-").map(Number);
  const [y1, m1] = t.end.split("-").map(Number);
  const months = [];
  let y = y0, m = m0;
  while (y < y1 || (y === y1 && m <= m1)) {
    months.push({ y, m });
    m++; if (m > 12) { m = 1; y++; }
  }
  return months;
}

function renderCalendar() {
  const t = trip();
  const months = tripMonths();
  ui.calCursor = Math.max(0, Math.min(ui.calCursor, months.length - 1));
  ui.selectedDayIdx = Math.max(0, Math.min(ui.selectedDayIdx ?? 0, t.days.length - 1));
  const { y, m } = months[ui.calCursor];

  $("#calMonthLabel").textContent = new Date(y, m - 1, 1)
    .toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  $("#btnCalPrev").disabled = ui.calCursor === 0;
  $("#btnCalNext").disabled = ui.calCursor === months.length - 1;

  const dayIdxByDate = Object.fromEntries(t.days.map((d, i) => [d.date, i]));
  const daysInMonth = new Date(y, m, 0).getDate();
  const firstWeekday = (new Date(y, m - 1, 1).getDay() + 6) % 7; // lunes = 0

  const cells = [];
  // huecos del mes anterior
  const prevDays = new Date(y, m - 1, 0).getDate();
  for (let i = firstWeekday - 1; i >= 0; i--)
    cells.push(`<div class="cal-cell other-month"><span class="cal-daynum">${prevDays - i}</span></div>`);
  // días del mes
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const di = dayIdxByDate[iso];
    if (di === undefined) {
      cells.push(`<div class="cal-cell"><span class="cal-daynum">${d}</span></div>`);
    } else {
      const day = t.days[di];
      const st = dayStats(day);
      const color = DAY_COLORS[di % DAY_COLORS.length];
      const selected = di === ui.selectedDayIdx;
      const isToday = iso === todayISO();
      cells.push(`
      <button type="button" class="cal-cell in-trip drop-zone ${selected ? "selected" : ""} ${isToday ? "today" : ""}" data-day="${di}" data-cal-day="${di}" title="Día ${di + 1} · ${fmtDate(iso)}">
        <span class="cal-daynum">${d}</span>
        <span class="cal-daylabel">Día ${di + 1}</span>
        ${day.items.length ? `<span class="cal-count" style="background:${color}">${day.items.length}</span>` : ""}
        <span class="cal-load"><i class="load-${st.rating.cls}-bar" style="width:${st.pct}%"></i></span>
      </button>`);
    }
  }
  // huecos del mes siguiente hasta completar la última semana
  const trailing = (7 - (cells.length % 7)) % 7;
  for (let d = 1; d <= trailing; d++)
    cells.push(`<div class="cal-cell other-month"><span class="cal-daynum">${d}</span></div>`);

  $("#calGrid").innerHTML = cells.join("");
  $$("#calGrid [data-cal-day]").forEach(c => c.addEventListener("click", () => {
    ui.selectedDayIdx = Number(c.dataset.calDay);
    renderItinerary();
  }));

  $("#calDetail").innerHTML = t.days.length
    ? dayCardHTML(ui.selectedDayIdx)
    : `<div class="cal-detail-empty">Este viaje no tiene días.</div>`;
}

/* ── Drag & drop ─────────────────────────────────────────── */
let dragData = null;
function bindDnD() {
  $$(".activity").forEach(card => {
    card.addEventListener("dragstart", e => {
      dragData = { id: card.dataset.id, from: card.dataset.day };
      card.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      try { e.dataTransfer.setData("text/plain", card.dataset.id); } catch {}
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      $$(".drop-zone").forEach(z => z.classList.remove("drag-over"));
      dragData = null;
    });
  });
  $$(".drop-zone").forEach(zone => {
    zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("drag-over"); });
    zone.addEventListener("dragleave", e => { if (!zone.contains(e.relatedTarget)) zone.classList.remove("drag-over"); });
    zone.addEventListener("drop", e => {
      e.preventDefault();
      zone.classList.remove("drag-over");
      if (!dragData) return;
      const targetKey = zone.dataset.day;
      let insertIdx;
      if (zone.classList.contains("cal-cell")) {
        // celda del calendario: se añade al final del día
        insertIdx = listFor(targetKey).length;
      } else {
        // índice de inserción según posición vertical del cursor
        const cards = $$(".activity", zone).filter(c => c.dataset.id !== dragData.id);
        insertIdx = cards.length;
        for (let i = 0; i < cards.length; i++) {
          const r = cards[i].getBoundingClientRect();
          if (e.clientY < r.top + r.height / 2) { insertIdx = i; break; }
        }
      }
      moveActivity(dragData.id, targetKey, insertIdx);
    });
  });
}

function listFor(key) {
  const t = trip();
  return key === "ideas" ? t.ideas : t.days[Number(key)].items;
}
function findActivity(id) {
  const t = trip();
  for (let di = 0; di < t.days.length; di++) {
    const idx = t.days[di].items.findIndex(x => x.id === id);
    if (idx >= 0) return { list: t.days[di].items, idx, key: String(di) };
  }
  const idx = t.ideas.findIndex(x => x.id === id);
  if (idx >= 0) return { list: t.ideas, idx, key: "ideas" };
  return null;
}
function moveActivity(id, targetKey, insertIdx) {
  const src = findActivity(id);
  if (!src) return;
  const [item] = src.list.splice(src.idx, 1);
  const target = listFor(targetKey);
  target.splice(Math.min(insertIdx, target.length), 0, item);
  save();
  renderAll();
}

function bindActivityClicks() {
  $$(".activity").forEach(card => {
    card.addEventListener("click", () => openActivityModal(card.dataset.id));
  });
  $$("[data-act='gmaps-day']").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); openGmaps(routePoints(Number(b.dataset.day))); }));
  $$("[data-act='add-to-day']").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); openActivityModal(null, { day: b.dataset.day }); }));
  $$("[data-act='sort-day']").forEach(b => b.addEventListener("click", e => {
    e.stopPropagation();
    const day = trip().days[Number(b.dataset.day)];
    day.items.sort((a, x) => (a.time || "99:99").localeCompare(x.time || "99:99"));
    save();
    renderAll();
    toast("Día ordenado por hora ✓");
  }));
}

/* ── Reservas ────────────────────────────────────────────── */
function allBookings() {
  const t = trip();
  const out = [];
  t.days.forEach((d, di) => d.items.forEach(it => { if (it.booking) out.push({ it, when: d.date, dayIdx: di }); }));
  t.ideas.forEach(it => { if (it.booking) out.push({ it, when: null, dayIdx: null }); });
  return out;
}
async function renderBookings() {
  const list = allBookings();
  $("#badgeBookings").textContent = list.length || "";
  let filesByAct = {};
  try {
    (await FDB.all()).forEach(r => (filesByAct[r.actId] ||= []).push(r));
  } catch { filesByAct = {}; }
  $("#bookingsList").innerHTML = list.length ? list.map(({ it, when, dayIdx }) => {
    const cat = CATS[it.cat] || CATS.other;
    const files = filesByAct[it.id] || [];
    return `
    <div class="booking-card ${it.booking.confirmed ? "" : "pending"}" data-id="${it.id}">
      <div class="booking-top">
        <span class="a-emoji">${cat.emoji}</span>
        <span class="booking-title">${esc(it.title)}</span>
        ${it.booking.code ? `<span class="booking-code">${esc(it.booking.code)}</span>` : ""}
      </div>
      <div class="booking-meta">
        <span>${it.booking.confirmed ? ic("check") + " Confirmada" : ic("clock") + " Pendiente de confirmar"}</span>
        ${it.booking.provider ? `<span>${esc(it.booking.provider)}</span>` : ""}
        ${when ? `<span>${ic("calendar")} Día ${dayIdx + 1} · ${fmtDate(when, { day: "numeric", month: "short" })}${it.time ? " · " + esc(it.time) : ""}</span>` : `<span>${ic("calendar")} Sin fecha asignada</span>`}
        ${it.cost ? `<span>${ic("euro")} ${fmtMoney(it.cost)}</span>` : ""}
      </div>
      ${files.length ? `<div class="booking-files">${files.map(f =>
        `<button type="button" class="file-chip" data-file="${f.id}" title="Abrir ${esc(f.name)}">${ic("clip")} ${esc(f.name)}</button>`).join("")}</div>` : ""}
    </div>`;
  }).join("") : `<div class="empty-state">Aún no hay reservas. Marca «Es una reserva» en cualquier actividad, o añade una desde aquí.</div>`;
  $$("#bookingsList .booking-card").forEach(c => c.addEventListener("click", e => {
    if (e.target.closest(".file-chip")) return;
    openActivityModal(c.dataset.id);
  }));
  $$("#bookingsList .file-chip").forEach(chip => chip.addEventListener("click", async () => {
    const all = Object.values(filesByAct).flat();
    const rec = all.find(r => r.id === chip.dataset.file);
    if (rec) openFileRec(rec);
  }));
}

/* ── Antes del viaje ─────────────────────────────────────── */
function renderPrep() {
  const t = trip();
  const pending = t.prep.filter(p => !p.done).length;
  $("#badgePrep").textContent = pending || "";
  const done = t.prep.length - pending;
  $("#prepProgress").style.width = t.prep.length ? (done / t.prep.length * 100) + "%" : "0";
  $("#prepList").innerHTML = t.prep.length ? t.prep.map(p => `
    <li class="check-item ${p.done ? "done" : ""}" data-id="${p.id}">
      <input type="checkbox" ${p.done ? "checked" : ""} aria-label="Completado">
      <span class="txt">${esc(p.text)}</span>
      ${p.due ? `<span class="due">antes del ${fmtDate(p.due, { day: "numeric", month: "short" })}</span>` : ""}
      <button class="btn btn-icon del" title="Eliminar">${ic("trash")}</button>
    </li>`).join("")
    : `<div class="empty-state">Sin tareas previas. Añade visados, seguro, cambio de moneda…</div>`;
  $$("#prepList .check-item").forEach(li => {
    const p = t.prep.find(x => x.id === li.dataset.id);
    $("input", li).addEventListener("change", e => { p.done = e.target.checked; save(); renderPrep(); });
    $(".del", li).addEventListener("click", () => { t.prep = t.prep.filter(x => x !== p); save(); renderPrep(); });
  });
}

/* ── Equipaje ────────────────────────────────────────────── */
const PACKING_TEMPLATE = [
  ["Documentos", ["Pasaporte / DNI", "Tarjetas y efectivo", "Reservas impresas o en el móvil", "Carné de conducir"]],
  ["Electrónica", ["Cargadores", "Batería externa", "Adaptador de enchufe", "Auriculares"]],
  ["Ropa", ["Ropa interior", "Calzado cómodo", "Chaqueta / chubasquero", "Pijama"]],
  ["Aseo", ["Cepillo y pasta de dientes", "Desodorante", "Protector solar", "Medicamentos habituales"]],
  ["Otros", ["Botella de agua", "Gafas de sol", "Candado para mochila", "Bolsa para ropa sucia"]],
];
function renderPacking() {
  const t = trip();
  const pending = t.packing.filter(p => !p.done).length;
  $("#badgePacking").textContent = pending || "";
  const done = t.packing.length - pending;
  $("#packingProgress").style.width = t.packing.length ? (done / t.packing.length * 100) + "%" : "0";
  const groups = {};
  t.packing.forEach(p => { (groups[p.cat || "Otros"] ||= []).push(p); });
  const catSet = new Set([...PACKING_TEMPLATE.map(([c]) => c), ...Object.keys(groups)]);
  $("#packCatList").innerHTML = [...catSet].map(c => `<option value="${esc(c)}">`).join("");
  $("#packingGroups").innerHTML = Object.keys(groups).length ? Object.entries(groups).map(([cat, items]) => `
    <div class="pack-group">
      <h3>${esc(cat)} <span class="count">${items.filter(i => i.done).length}/${items.length}</span></h3>
      <ul class="check-list">
        ${items.map(p => `
        <li class="check-item ${p.done ? "done" : ""}" data-id="${p.id}">
          <input type="checkbox" ${p.done ? "checked" : ""} aria-label="Completado">
          <span class="txt">${esc(p.text)}</span>
          <button class="btn btn-icon del" title="Eliminar">${ic("trash")}</button>
        </li>`).join("")}
      </ul>
    </div>`).join("")
    : `<div class="empty-state">La maleta está vacía… en la app. Usa «✨ Añadir básicos» para empezar.</div>`;
  $$("#packingGroups .check-item").forEach(li => {
    const p = t.packing.find(x => x.id === li.dataset.id);
    $("input", li).addEventListener("change", e => { p.done = e.target.checked; save(); renderPacking(); });
    $(".del", li).addEventListener("click", () => { t.packing = t.packing.filter(x => x !== p); save(); renderPacking(); });
  });
}

/* ── Presupuesto ─────────────────────────────────────────── */
function renderBudget() {
  const t = trip();
  const rows = [];
  let total = 0, booked = 0, count = 0;
  t.days.forEach((d, di) => {
    let dayCost = 0, dayCount = 0;
    d.items.forEach(it => {
      const c = Number(it.cost) || 0;
      dayCost += c; total += c; count += it.cost ? 1 : 0; dayCount++;
      if (it.booking) booked += c;
    });
    rows.push({ label: `Día ${di + 1} · ${fmtDate(d.date, { day: "numeric", month: "short" })}`, count: dayCount, cost: dayCost });
  });
  let ideasCost = 0;
  t.ideas.forEach(it => { ideasCost += Number(it.cost) || 0; if (it.booking) booked += Number(it.cost) || 0; });
  if (t.ideas.length) rows.push({ label: "💡 Ideas sin asignar", count: t.ideas.length, cost: ideasCost });
  const grandTotal = total + ideasCost;
  $("#budgetSummary").innerHTML = `
    <div class="budget-tile total"><div class="label">Total estimado</div><div class="value">${fmtMoney(grandTotal)}</div></div>
    <div class="budget-tile"><div class="label">Media por día</div><div class="value">${fmtMoney(t.days.length ? total / t.days.length : 0)}</div></div>
    <div class="budget-tile"><div class="label">Ya reservado</div><div class="value">${fmtMoney(booked)}</div></div>
    <div class="budget-tile"><div class="label">Conceptos con coste</div><div class="value">${count}</div></div>`;
  // desglose por categoría
  const byCat = {};
  const addCat = it => {
    const c = Number(it.cost) || 0;
    if (!c) return;
    const k = it.cat in CATS ? it.cat : "other";
    byCat[k] = (byCat[k] || { count: 0, cost: 0 });
    byCat[k].count++; byCat[k].cost += c;
  };
  t.days.forEach(d => d.items.forEach(addCat));
  t.ideas.forEach(addCat);
  const catRows = Object.entries(byCat).sort((a, b) => b[1].cost - a[1].cost);

  $("#budgetTableWrap").innerHTML = `
    <div class="budget-tables">
      <table class="budget-table">
        <thead><tr><th>Día</th><th>Actividades</th><th style="text-align:right">Coste</th></tr></thead>
        <tbody>
          ${rows.map(r => `<tr><td>${r.label}</td><td>${r.count}</td><td class="num">${fmtMoney(r.cost)}</td></tr>`).join("")}
          <tr><td><strong>Total</strong></td><td></td><td class="num"><strong>${fmtMoney(grandTotal)}</strong></td></tr>
        </tbody>
      </table>
      <table class="budget-table">
        <thead><tr><th>Categoría</th><th>Conceptos</th><th style="text-align:right">Coste</th></tr></thead>
        <tbody>
          ${catRows.length ? catRows.map(([k, v]) =>
            `<tr><td>${CATS[k].emoji} ${CATS[k].label}</td><td>${v.count}</td><td class="num">${fmtMoney(v.cost)}</td></tr>`).join("")
            : `<tr><td colspan="3" class="muted">Apunta costes en las actividades para ver el desglose.</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

/* ── Mapa (MapLibre GL + OpenFreeMap) ────────────────────── */
/* Vector tiles de OpenFreeMap (datos OpenStreetMap) con el estilo
   Liberty. Antes de crear el mapa se reescriben las capas de texto
   para preferir name:en → name:latin → name, de modo que los
   topónimos salgan en inglés/alfabeto latino en todo el mundo
   (también en China, Japón, etc.). */
const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const MAP_HOST = "tiles.openfreemap.org";
const FALLBACK_STYLE = {
  version: 8,
  name: "voyage-offline-fallback",
  sources: {},
  layers: [{ id: "bg", type: "background", paint: { "background-color": "#dde3e8" } }],
};

function localizeStyle(style) {
  const tf = ["coalesce", ["get", "name:en"], ["get", "name:latin"], ["get", "name"]];
  (style.layers || []).forEach(l => {
    if (l.layout && l.layout["text-field"] && JSON.stringify(l.layout["text-field"]).includes("name"))
      l.layout["text-field"] = tf;
  });
  return style;
}

let mapStylePromise = null;
let mapFontStack = null; // fuente de glifos del estilo, para numerar los marcadores
function getMapStyle() {
  mapStylePromise ||= fetch(MAP_STYLE_URL)
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(localizeStyle)
    .then(style => {
      if (style.glyphs) {
        const fonts = (style.layers || [])
          .map(l => l.layout && l.layout["text-font"])
          .filter(f => Array.isArray(f) && typeof f[0] === "string");
        mapFontStack = fonts.find(f => f.join().includes("Bold")) || fonts[0] || null;
      }
      return style;
    })
    .catch(() => {
      toast("No se pudo cargar el fondo del mapa (¿sin conexión?). Los puntos y rutas se muestran igualmente.");
      return FALLBACK_STYLE;
    });
  return mapStylePromise;
}

function geoItems(dayFilter = "all") {
  const t = trip();
  const out = [];
  t.days.forEach((d, di) => {
    if (dayFilter !== "all" && Number(dayFilter) !== di) return;
    d.items.forEach((it, ii) => {
      if (it.lat != null && it.lng != null) out.push({ it, dayIdx: di, order: ii });
    });
  });
  return out;
}

function renderMapChips() {
  const t = trip();
  const chips = [`<button class="chip ${ui.mapDayFilter === "all" ? "active" : ""}" data-day="all">Todos</button>`]
    .concat(t.days.map((d, i) =>
      `<button class="chip ${String(i) === String(ui.mapDayFilter) ? "active" : ""}" data-day="${i}" style="${String(i) === String(ui.mapDayFilter) ? `background:${DAY_COLORS[i % DAY_COLORS.length]};border-color:transparent` : ""}">Día ${i + 1}</button>`));
  $("#mapDayChips").innerHTML = chips.join("");
  $$("#mapDayChips .chip").forEach(c => c.addEventListener("click", () => {
    ui.mapDayFilter = c.dataset.day;
    renderMapChips();
    refreshMap();
  }));
}

function ensureMap() {
  ui.mapPromise ||= (async () => {
    const style = await getMapStyle();
    const map = new maplibregl.Map({
      container: "map",
      style: structuredClone(style),
      center: [-3.7038, 40.4168],
      zoom: 4.2,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    await new Promise(res => map.once("load", res));
    map.addSource("routes", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addSource("stops", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({
      id: "routes-line", type: "line", source: "routes",
      paint: { "line-color": ["get", "color"], "line-width": 3.5, "line-opacity": .85, "line-dasharray": [.4, 1.6] },
      layout: { "line-cap": "round", "line-join": "round" },
    });
    /* Los marcadores se pintan como capas GL (círculo + número) en vez
       de elementos DOM: así se mueven exactamente con el mapa, sin el
       retardo de reposicionar nodos en cada fotograma. */
    map.addLayer({
      id: "stops-circle", type: "circle", source: "stops",
      paint: {
        "circle-radius": 13,
        "circle-color": ["get", "color"],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2.5,
      },
    });
    if (mapFontStack) {
      map.addLayer({
        id: "stops-label", type: "symbol", source: "stops",
        layout: {
          "text-field": ["get", "label"],
          "text-font": mapFontStack,
          "text-size": 11.5,
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: { "text-color": "#ffffff" },
      });
    }
    map.on("click", "stops-circle", e => {
      const f = e.features && e.features[0];
      if (!f) return;
      new maplibregl.Popup({ offset: 20, closeButton: false })
        .setLngLat(f.geometry.coordinates)
        .setHTML(f.properties.popup)
        .addTo(map);
    });
    map.on("mouseenter", "stops-circle", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "stops-circle", () => { map.getCanvas().style.cursor = ""; });
    ui.map = map;
    return map;
  })();
  return ui.mapPromise;
}

async function refreshMap() {
  const map = await ensureMap();
  requestAnimationFrame(() => map.resize());

  const pts = geoItems(ui.mapDayFilter);
  const byDay = {};
  pts.forEach(p => (byDay[p.dayIdx] ||= []).push(p));

  const lineFeatures = [];
  const stopFeatures = [];
  const bounds = new maplibregl.LngLatBounds();
  Object.entries(byDay).forEach(([di, list]) => {
    const color = DAY_COLORS[di % DAY_COLORS.length];
    if (list.length > 1)
      lineFeatures.push({
        type: "Feature", properties: { color },
        geometry: { type: "LineString", coordinates: list.map(p => [p.it.lng, p.it.lat]) },
      });
    list.forEach((p, i) => {
      const cat = CATS[p.it.cat] || CATS.other;
      stopFeatures.push({
        type: "Feature",
        properties: {
          color,
          label: String(i + 1),
          popup: `
            <div class="popup-title">${cat.emoji} ${esc(p.it.title)}</div>
            <div class="popup-meta">Día ${Number(di) + 1}${p.it.time ? " · " + esc(p.it.time) : ""}${p.it.duration ? " · " + fmtDur(p.it.duration) : ""}</div>
            ${p.it.notes ? `<div class="popup-meta">${esc(p.it.notes)}</div>` : ""}`,
        },
        geometry: { type: "Point", coordinates: [p.it.lng, p.it.lat] },
      });
      bounds.extend([p.it.lng, p.it.lat]);
    });
  });
  map.getSource("routes")?.setData({ type: "FeatureCollection", features: lineFeatures });
  map.getSource("stops")?.setData({ type: "FeatureCollection", features: stopFeatures });
  if (!bounds.isEmpty()) {
    const single = ui.mapDayFilter !== "all";
    const stage = map.getContainer();
    const mobile = stage.clientWidth <= 640; // en móvil el panel es una hoja inferior
    const padding = single
      ? (mobile
        ? { top: 70, bottom: Math.round(stage.clientHeight * .5), left: 30, right: 30 }
        : { top: 90, bottom: 60, left: 380, right: 60 })
      : { top: 90, bottom: 60, left: 60, right: 60 };
    map.fitBounds(bounds, { padding, maxZoom: 15, duration: 700 });
  }
  renderMapPanel();
}

/* panel lateral: paradas del día seleccionado, reordenables */
function renderMapPanel() {
  const panel = $("#mapDayPanel");
  if (ui.mapDayFilter === "all") { panel.hidden = true; return; }
  const t = trip();
  const di = Number(ui.mapDayFilter);
  const day = t.days[di];
  if (!day) { panel.hidden = true; return; }
  panel.hidden = false;

  const st = dayStats(day);
  const color = DAY_COLORS[di % DAY_COLORS.length];
  $("#mapPanelTitle").textContent = `Día ${di + 1} · ${fmtDate(day.date, { weekday: "short", day: "numeric", month: "short" })}`;
  $("#mapPanelMeta").textContent = day.items.length
    ? `${st.rating.label} · ${(st.totalMin / 60).toFixed(1)} h · ${st.km.toFixed(1)} km`
    : "Día libre";

  let geoN = 0;
  $("#mapStops").innerHTML = day.items.length ? day.items.map((it, ii) => {
    const geo = it.lat != null && it.lng != null;
    const n = geo ? ++geoN : null;
    const cat = CATS[it.cat] || CATS.other;
    return `
    <li class="map-stop ${geo ? "" : "no-geo"}" draggable="true" data-idx="${ii}" data-id="${it.id}">
      <span class="stop-grip" title="Arrastrar para reordenar">${ic("grip")}</span>
      <span class="stop-num" style="${geo ? `background:${color}` : ""}">${geo ? n : "–"}</span>
      <span class="stop-body">
        <span class="stop-title">${esc(it.title)}</span>
        <span class="stop-meta">${cat.emoji} ${it.time ? esc(it.time) + " · " : ""}${it.duration ? fmtDur(it.duration) : ""}${geo ? "" : " · sin ubicación"}</span>
      </span>
      <span class="stop-btns">
        <button class="btn btn-icon" data-move="up" ${ii === 0 ? "disabled" : ""} title="Subir">${ic("up")}</button>
        <button class="btn btn-icon" data-move="down" ${ii === day.items.length - 1 ? "disabled" : ""} title="Bajar">${ic("down")}</button>
      </span>
    </li>`;
  }).join("") : `<li class="map-stop-empty">Sin actividades este día.</li>`;

  // clic → volar al punto · flechas → reordenar · drag → reordenar
  $$("#mapStops .map-stop").forEach(li => {
    const idx = Number(li.dataset.idx);
    const it = day.items[idx];
    li.addEventListener("click", e => {
      if (e.target.closest("[data-move]")) return;
      if (it.lat != null && ui.map) ui.map.flyTo({ center: [it.lng, it.lat], zoom: Math.max(ui.map.getZoom(), 14) });
    });
    $$("[data-move]", li).forEach(b => b.addEventListener("click", () => {
      const to = b.dataset.move === "up" ? idx - 1 : idx + 1;
      if (to < 0 || to >= day.items.length) return;
      const [moved] = day.items.splice(idx, 1);
      day.items.splice(to, 0, moved);
      save();
      renderAll();
    }));
    li.addEventListener("dragstart", e => {
      li.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      try { e.dataTransfer.setData("text/plain", li.dataset.id); } catch {}
    });
    li.addEventListener("dragend", () => li.classList.remove("dragging"));
  });
}

/* reordenación por arrastre dentro del panel (listeners únicos en el <ol>) */
function bindMapStopsDnD() {
  const list = $("#mapStops");
  list.addEventListener("dragover", e => {
    e.preventDefault();
    const dragging = $(".map-stop.dragging", list);
    if (!dragging) return;
    const after = $$(".map-stop:not(.dragging)", list).find(el => {
      const r = el.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    });
    if (after) list.insertBefore(dragging, after);
    else list.appendChild(dragging);
  });
  list.addEventListener("drop", e => {
    e.preventDefault();
    const day = trip().days[Number(ui.mapDayFilter)];
    if (!day) return;
    const order = $$(".map-stop", list).map(el => el.dataset.id);
    day.items.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    save();
    renderAll();
  });
}

/* ── Exportar rutas ──────────────────────────────────────── */
function routePoints(dayIdx = null) {
  const pts = geoItems(dayIdx === null ? ui.mapDayFilter : String(dayIdx));
  return pts.map(p => ({ lat: p.it.lat, lng: p.it.lng, name: p.it.title }));
}
function openGmaps(pts) {
  if (pts.length < 1) return toast("No hay puntos con ubicación en esa selección.");
  if (pts.length === 1) {
    window.open(`https://www.google.com/maps/search/?api=1&query=${pts[0].lat},${pts[0].lng}`, "_blank");
    return;
  }
  // el formato /dir/ admite muchas paradas encadenadas
  const url = "https://www.google.com/maps/dir/" + pts.map(p => `${p.lat},${p.lng}`).join("/");
  window.open(url, "_blank");
}

/* ── Modal de actividad ──────────────────────────────────── */
function fillCategorySelect() {
  $("#fCategory").innerHTML = Object.entries(CATS)
    .map(([k, v]) => `<option value="${k}">${v.emoji} ${v.label}</option>`).join("");
}
function fillDaySelect() {
  const t = trip();
  $("#fDay").innerHTML =
    `<option value="ideas">💡 Ideas (sin asignar)</option>` +
    t.days.map((d, i) => `<option value="${i}">Día ${i + 1} · ${fmtDate(d.date, { day: "numeric", month: "short" })}</option>`).join("");
}

/* estado temporal de adjuntos del modal (se confirma al guardar) */
let attachState = { existing: [], added: [], removed: [] };

function renderAttachList() {
  const list = $("#attachList");
  const rows = [];
  attachState.existing.filter(r => !attachState.removed.includes(r.id)).forEach(r => {
    rows.push(`
    <div class="attach-item" data-kind="existing" data-id="${r.id}">
      ${ic("file")}<button type="button" class="attach-name" title="Abrir">${esc(r.name)}</button>
      <span class="attach-size">${fmtSize(r.size)}</span>
      <button type="button" class="btn btn-icon attach-del" title="Quitar">${ic("trash")}</button>
    </div>`);
  });
  attachState.added.forEach((f, i) => {
    rows.push(`
    <div class="attach-item is-new" data-kind="new" data-i="${i}">
      ${ic("file")}<button type="button" class="attach-name" title="Abrir">${esc(f.name)}</button>
      <span class="attach-size">${fmtSize(f.size)} · nuevo</span>
      <button type="button" class="btn btn-icon attach-del" title="Quitar">${ic("trash")}</button>
    </div>`);
  });
  list.innerHTML = rows.join("") || `<p class="muted small attach-empty">Sin documentos adjuntos.</p>`;
  $$(".attach-item", list).forEach(el => {
    $(".attach-name", el).addEventListener("click", () => {
      if (el.dataset.kind === "existing") {
        const rec = attachState.existing.find(r => r.id === el.dataset.id);
        if (rec) openFileRec(rec);
      } else {
        openFileRec({ blob: attachState.added[Number(el.dataset.i)] });
      }
    });
    $(".attach-del", el).addEventListener("click", () => {
      if (el.dataset.kind === "existing") attachState.removed.push(el.dataset.id);
      else attachState.added.splice(Number(el.dataset.i), 1);
      renderAttachList();
    });
  });
}

async function openActivityModal(id = null, presets = {}) {
  ui.editingId = id;
  const modal = $("#activityModal");
  fillCategorySelect();
  fillDaySelect();
  attachState = { existing: [], added: [], removed: [] };
  ui.durTouched = !!id; // en edición nunca se pisa la duración guardada
  if (id) {
    try { attachState.existing = await FDB.byAct(id) || []; } catch { attachState.existing = []; }
  }
  renderAttachList();
  let it, key = presets.day ?? "ideas";
  if (id) {
    const found = findActivity(id);
    if (!found) return;
    it = found.list[found.idx];
    key = found.key;
    $("#activityModalTitle").textContent = "Editar actividad";
    $("#btnDeleteActivity").hidden = false;
  } else {
    it = newActivity(presets.booking ? { cat: "hotel", booking: { code: "", provider: "", confirmed: false } } : {});
    $("#activityModalTitle").textContent = presets.booking ? "Nueva reserva" : "Nueva actividad";
    $("#btnDeleteActivity").hidden = true;
  }
  $("#fTitle").value = it.title;
  $("#fCategory").value = it.cat in CATS ? it.cat : "other";
  $("#fDay").value = String(key);
  $("#fTime").value = it.time || "";
  $("#fDuration").value = it.duration || "";
  $("#fCost").value = it.cost || "";
  $("#fPlace").value = it.place || "";
  $("#fNotes").value = it.notes || "";
  $("#fIsBooking").checked = !!it.booking;
  $("#bookingFields").hidden = !it.booking;
  $("#fBookingCode").value = it.booking?.code || "";
  $("#fBookingProvider").value = it.booking?.provider || "";
  $("#fBookingConfirmed").checked = !!it.booking?.confirmed;
  $("#geoResults").hidden = true;
  ui.editingLoc = (it.lat != null && it.lng != null) ? { lat: it.lat, lng: it.lng } : null;
  modal.hidden = false;
  initMiniMap();
}

function ensureMiniMap() {
  ui.miniMapPromise ||= (async () => {
    const style = await getMapStyle();
    const mm = new maplibregl.Map({
      container: "miniMap",
      style: structuredClone(style),
      center: [-3.7038, 40.4168],
      zoom: 4,
      attributionControl: false,
    });
    mm.on("click", e => setEditingLoc(e.lngLat.lat, e.lngLat.lng));
    ui.miniMap = mm;
    return mm;
  })();
  return ui.miniMapPromise;
}

async function initMiniMap() {
  const mm = await ensureMiniMap();
  setTimeout(() => mm.resize(), 80);
  if (ui.editingLoc) {
    mm.jumpTo({ center: [ui.editingLoc.lng, ui.editingLoc.lat], zoom: 14 });
    placeMiniMarker(ui.editingLoc.lat, ui.editingLoc.lng);
  } else {
    // centrar cerca del resto del itinerario si existe
    const pts = geoItems("all");
    if (pts.length) mm.jumpTo({ center: [pts[0].it.lng, pts[0].it.lat], zoom: 11 });
    if (ui.miniMarker) { ui.miniMarker.remove(); ui.miniMarker = null; }
    updateCoordLabel();
  }
}
function placeMiniMarker(lat, lng) {
  if (ui.miniMarker) ui.miniMarker.setLngLat([lng, lat]);
  else if (ui.miniMap) ui.miniMarker = new maplibregl.Marker({ color: "#0b4f55" }).setLngLat([lng, lat]).addTo(ui.miniMap);
  updateCoordLabel();
}
function setEditingLoc(lat, lng, place) {
  ui.editingLoc = { lat: +Number(lat).toFixed(6), lng: +Number(lng).toFixed(6) };
  if (place) $("#fPlace").value = place;
  placeMiniMarker(lat, lng);
}
function updateCoordLabel() {
  $("#coordLabel").textContent = ui.editingLoc
    ? `📍 ${ui.editingLoc.lat}, ${ui.editingLoc.lng} — clic en el mapa para mover el punto`
    : "Sin ubicación — busca un lugar o haz clic en el minimapa";
}

async function geocode() {
  const q = $("#fPlace").value.trim();
  if (!q) return;
  // ¿coordenadas pegadas directamente?
  const m = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (m) {
    setEditingLoc(Number(m[1]), Number(m[2]));
    ui.miniMap?.jumpTo({ center: [Number(m[2]), Number(m[1])], zoom: 14 });
    return;
  }
  const box = $("#geoResults");
  box.hidden = false;
  box.innerHTML = "<button disabled>Buscando…</button>";
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=es&q=${encodeURIComponent(q)}`,
      { headers: { "Accept": "application/json" } });
    const data = await res.json();
    if (!data.length) { box.innerHTML = "<button disabled>Sin resultados. Prueba con «lugar, ciudad».</button>"; return; }
    box.innerHTML = data.map((r, i) => `<button type="button" data-i="${i}">${ic("pin")} ${esc(r.display_name)}</button>`).join("");
    $$("button[data-i]", box).forEach(b => b.addEventListener("click", () => {
      const r = data[Number(b.dataset.i)];
      setEditingLoc(Number(r.lat), Number(r.lon), r.display_name.split(",").slice(0, 2).join(","));
      ui.miniMap?.jumpTo({ center: [Number(r.lon), Number(r.lat)], zoom: 15 });
      box.hidden = true;
    }));
  } catch {
    box.innerHTML = "<button disabled>⚠️ Sin conexión: pega coordenadas «lat, lng» o marca el punto en el minimapa.</button>";
  }
}

async function saveActivityFromForm(e) {
  e.preventDefault();
  const data = {
    title: $("#fTitle").value.trim(),
    cat: $("#fCategory").value,
    time: $("#fTime").value,
    duration: Number($("#fDuration").value) || 0,
    cost: Number($("#fCost").value) || 0,
    place: $("#fPlace").value.trim(),
    notes: $("#fNotes").value.trim(),
    lat: ui.editingLoc?.lat ?? null,
    lng: ui.editingLoc?.lng ?? null,
    booking: $("#fIsBooking").checked ? {
      code: $("#fBookingCode").value.trim(),
      provider: $("#fBookingProvider").value.trim(),
      confirmed: $("#fBookingConfirmed").checked,
    } : null,
  };
  const targetKey = $("#fDay").value;
  let actId = ui.editingId;
  if (ui.editingId) {
    const found = findActivity(ui.editingId);
    if (found) {
      Object.assign(found.list[found.idx], data);
      if (found.key !== targetKey) moveActivity(ui.editingId, targetKey, listFor(targetKey).length);
    }
  } else {
    const item = newActivity(data);
    listFor(targetKey).push(item);
    actId = item.id;
  }
  // confirmar cambios de adjuntos
  try {
    for (const id of attachState.removed) await FDB.del(id);
    for (const f of attachState.added)
      await FDB.put({ id: uid(), actId, name: f.name, type: f.type, size: f.size, blob: f, addedAt: Date.now() });
  } catch {
    toast("⚠️ No se pudieron guardar los adjuntos en este navegador.");
  }
  save();
  closeModals();
  renderAll();
  toast("Actividad guardada ✓");
}

/* ── Modal de viaje ──────────────────────────────────────── */
let tripModalMode = "new";
function openTripModal(mode) {
  tripModalMode = mode;
  const t = trip();
  $("#tripModalTitle").textContent = mode === "edit" ? "Editar viaje" : "Nuevo viaje";
  $("#tName").value = mode === "edit" ? t.name : "";
  $("#tDest").value = mode === "edit" ? t.destination : "";
  $("#tStart").value = mode === "edit" ? t.start : "";
  $("#tEnd").value = mode === "edit" ? t.end : "";
  $("#tripModal").hidden = false;
}
function saveTripFromForm(e) {
  e.preventDefault();
  const name = $("#tName").value.trim();
  const dest = $("#tDest").value.trim();
  const start = $("#tStart").value, end = $("#tEnd").value;
  if (!name || !start || !end) return;
  if (end < start) { toast("La fecha de fin debe ser posterior al inicio."); return; }
  if (daysBetween(start, end) > 90) { toast("Máximo 90 días por viaje."); return; }
  if (tripModalMode === "edit") {
    const t = trip();
    t.name = name; t.destination = dest;
    const { days, leftovers } = buildDays(start, end, t.days);
    t.days = days;
    if (leftovers.length) {
      t.ideas.push(...leftovers);
      toast(`${leftovers.length} actividad(es) de días eliminados se movieron a Ideas.`);
    }
    t.start = start; t.end = end;
  } else {
    const t = newTrip(name, dest, start, end);
    state.trips.push(t);
    state.activeTripId = t.id;
  }
  save();
  closeModals();
  renderAll();
}

/* ── Exportar / importar JSON ────────────────────────────── */
async function exportJson() {
  const t = trip();
  const payload = structuredClone(t);
  // adjuntos del viaje, en base64, para que la copia sea completa
  try {
    const ids = new Set(tripActivityIds(t));
    const files = (await FDB.all()).filter(r => ids.has(r.actId));
    payload.__files = [];
    for (const r of files)
      payload.__files.push({ actId: r.actId, name: r.name, type: r.type, size: r.size, dataUrl: await blobToDataUrl(r.blob) });
  } catch { /* sin IndexedDB: se exporta sin adjuntos */ }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `voyage-${t.name.replace(/\W+/g, "-").toLowerCase()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast("Copia exportada ⬇️ Incluye la documentación adjunta.");
}
function importJson(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const t = JSON.parse(reader.result);
      if (!t || !Array.isArray(t.days)) throw new Error("formato");
      const files = t.__files || [];
      delete t.__files;
      t.id = uid();
      t.name = (t.name || "Viaje importado") + " (importado)";
      // regenerar ids de actividades para no chocar con las existentes
      const idMap = {};
      const remap = it => { const n = uid(); idMap[it.id] = n; it.id = n; };
      t.days.forEach(d => d.items.forEach(remap));
      (t.ideas || []).forEach(remap);
      for (const f of files) {
        const actId = idMap[f.actId];
        if (!actId) continue;
        try {
          await FDB.put({ id: uid(), actId, name: f.name, type: f.type, size: f.size, blob: await dataUrlToBlob(f.dataUrl), addedAt: Date.now() });
        } catch { /* adjunto ilegible: se omite */ }
      }
      state.trips.push(t);
      state.activeTripId = t.id;
      save();
      renderAll();
      toast("Viaje importado ✓");
    } catch {
      toast("⚠️ El archivo no parece una copia de Voyage.");
    }
  };
  reader.readAsText(file);
}

/* ── Sincronización entre dispositivos (Gist de GitHub) ──── */
/* Todos los viajes (y sus adjuntos) se guardan como JSON en un Gist
   privado de la cuenta del usuario. Estrategia: el conjunto completo
   con marca de tiempo; al sincronizar gana el más reciente. La
   configuración (token, id del gist) es local a cada dispositivo. */
const SYNC_FILE = "voyage-sync.json";
const SYNC_MAX_BYTES = 9 * 1048576; // margen bajo el límite de la API de gists
const SYNC_CFG = {
  get token() { return localStorage.getItem("voyage.sync.token") || ""; },
  set token(v) { v ? localStorage.setItem("voyage.sync.token", v) : localStorage.removeItem("voyage.sync.token"); },
  get gistId() { return localStorage.getItem("voyage.sync.gist") || ""; },
  set gistId(v) { v ? localStorage.setItem("voyage.sync.gist", v) : localStorage.removeItem("voyage.sync.gist"); },
  get auto() { return localStorage.getItem("voyage.sync.auto") !== "0"; },
  set auto(v) { localStorage.setItem("voyage.sync.auto", v ? "1" : "0"); },
  get lastSync() { return Number(localStorage.getItem("voyage.sync.last")) || 0; },
  set lastSync(v) { localStorage.setItem("voyage.sync.last", String(v)); },
};
const syncEnabled = () => !!(SYNC_CFG.token && SYNC_CFG.gistId);

async function gh(path, opts = {}) {
  const res = await fetch("https://api.github.com" + path, {
    ...opts,
    headers: {
      "Authorization": "Bearer " + SYNC_CFG.token,
      "Accept": "application/vnd.github+json",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...opts.headers,
    },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  return res.json();
}

async function buildSyncPayload() {
  const payload = {
    app: "voyage", updatedAt: state.updatedAt || Date.now(),
    state: { version: state.version, activeTripId: state.activeTripId, trips: state.trips },
    files: [],
  };
  try {
    for (const r of await FDB.all())
      payload.files.push({ id: r.id, actId: r.actId, name: r.name, type: r.type, size: r.size, dataUrl: await blobToDataUrl(r.blob) });
  } catch { /* sin adjuntos */ }
  let body = JSON.stringify(payload);
  if (body.length > SYNC_MAX_BYTES) {
    payload.files = [];
    payload.filesOmitted = true;
    body = JSON.stringify(payload);
    toast("⚠️ Los adjuntos superan el límite del sync: los datos se sincronizan, los documentos quedan solo en este dispositivo.");
  }
  return body;
}

async function fetchRemotePayload() {
  const gist = await gh(`/gists/${SYNC_CFG.gistId}`);
  const f = gist.files && gist.files[SYNC_FILE];
  if (!f) return null;
  let content = f.content;
  if (f.truncated) content = await (await fetch(f.raw_url)).text();
  try { return JSON.parse(content); } catch { return null; }
}

async function applyRemote(remote) {
  applyingRemote = true;
  try {
    state = { ...remote.state, updatedAt: remote.updatedAt };
    if (!state.trips.some(t => t.id === state.activeTripId)) state.activeTripId = state.trips[0]?.id;
    save();
    if (Array.isArray(remote.files) && !remote.filesOmitted) {
      await FDB.clear();
      for (const f of remote.files) {
        try {
          await FDB.put({ id: f.id, actId: f.actId, name: f.name, type: f.type, size: f.size, blob: await dataUrlToBlob(f.dataUrl), addedAt: Date.now() });
        } catch { /* adjunto ilegible */ }
      }
    }
  } finally {
    applyingRemote = false;
  }
  renderAll();
}

let syncing = false;
async function syncNow(interactive = false) {
  if (!syncEnabled() || syncing) return;
  syncing = true;
  setSyncStatus("Sincronizando…");
  try {
    const remote = await fetchRemotePayload();
    if (remote && remote.updatedAt > (state.updatedAt || 0)) {
      await applyRemote(remote);
      setSyncStatus("✓ Actualizado desde la nube (" + new Date().toLocaleTimeString("es-ES") + ")");
    } else {
      await gh(`/gists/${SYNC_CFG.gistId}`, {
        method: "PATCH",
        body: JSON.stringify({ files: { [SYNC_FILE]: { content: await buildSyncPayload() } } }),
      });
      setSyncStatus("✓ Subido a la nube (" + new Date().toLocaleTimeString("es-ES") + ")");
    }
    SYNC_CFG.lastSync = Date.now();
    renderSyncUI();
  } catch (err) {
    setSyncStatus("⚠️ Error al sincronizar: " + err.message + (navigator.onLine ? "" : " (sin conexión)"));
    if (interactive) toast("No se pudo sincronizar. Revisa el token y la conexión.");
  } finally {
    syncing = false;
  }
}

let autoSyncTimer = null;
function scheduleAutoSync() {
  if (!syncEnabled() || !SYNC_CFG.auto) return;
  clearTimeout(autoSyncTimer);
  autoSyncTimer = setTimeout(() => syncNow(false), 4000);
}

async function syncConnect() {
  const token = $("#syncToken").value.trim();
  if (!token) return toast("Pega primero el token de GitHub.");
  SYNC_CFG.token = token;
  setSyncStatus("Conectando con GitHub…");
  try {
    // reutilizar un gist existente de Voyage si lo hay
    const gists = await gh("/gists?per_page=100");
    const existing = gists.find(g => g.files && g.files[SYNC_FILE]);
    if (existing) {
      SYNC_CFG.gistId = existing.id;
      const remote = await fetchRemotePayload();
      if (remote && remote.updatedAt > (state.updatedAt || 0)) await applyRemote(remote);
      else await syncNow(true);
      setSyncStatus("✓ Conectado al gist existente: tus viajes ya están sincronizados.");
    } else {
      const gist = await gh("/gists", {
        method: "POST",
        body: JSON.stringify({
          description: "Voyage · sincronización de viajes (creado automáticamente)",
          public: false,
          files: { [SYNC_FILE]: { content: await buildSyncPayload() } },
        }),
      });
      SYNC_CFG.gistId = gist.id;
      SYNC_CFG.lastSync = Date.now();
      setSyncStatus("✓ Conectado: se ha creado un gist privado con tus viajes.");
    }
    $("#syncToken").value = "";
    renderSyncUI();
  } catch (err) {
    SYNC_CFG.token = "";
    setSyncStatus("⚠️ No se pudo conectar: " + err.message + ". ¿El token tiene el permiso «gist»?");
  }
}

function setSyncStatus(msg) { $("#syncStatus").textContent = msg; }
function renderSyncUI() {
  const on = syncEnabled();
  $("#syncSetup").hidden = on;
  $("#syncConnected").hidden = !on;
  $("#syncAuto").checked = SYNC_CFG.auto;
  $("#syncMenuState").textContent = on ? "activada" : "";
  if (on) {
    $("#syncInfo").innerHTML =
      `Conectado a un gist privado de tu GitHub (<code>${esc(SYNC_CFG.gistId.slice(0, 10))}…</code>).` +
      (SYNC_CFG.lastSync ? `<br>Última sincronización: ${new Date(SYNC_CFG.lastSync).toLocaleString("es-ES")}.` : "");
  }
}

/* ── Mapa sin conexión (descarga de mosaicos) ────────────── */
/* Los vector tiles llegan hasta z14 y MapLibre los reamplía para
   zooms mayores, así que basta con descargar z8–14 de la zona del
   viaje (más el estilo, sprites y glifos de texto). */
const TILE_CACHE = "voyage-tiles-v1";
const MAX_TILES = 2000;

function lng2tile(lng, z) { return Math.floor((lng + 180) / 360 * 2 ** z); }
function lat2tile(lat, z) {
  const r = lat * Math.PI / 180;
  return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z);
}

async function offlineUrlsForTrip() {
  const pts = geoItems("all");
  if (!pts.length) return [];
  const style = await getMapStyle();
  if (!style.sources || !Object.keys(style.sources).length) return []; // sin conexión: no hay estilo real

  const urls = [MAP_STYLE_URL];

  // plantilla de mosaicos a partir del TileJSON del estilo
  let template = null;
  for (const src of Object.values(style.sources)) {
    if (src.type !== "vector") continue;
    if (src.tiles) { template = src.tiles[0]; break; }
    if (src.url) {
      try {
        const tj = await (await fetch(src.url)).json();
        urls.push(src.url);
        if (tj.tiles) { template = tj.tiles[0]; break; }
      } catch { return []; }
    }
  }
  if (!template) return [];

  // sprites e iconos del estilo
  if (style.sprite) urls.push(`${style.sprite}.json`, `${style.sprite}.png`, `${style.sprite}@2x.json`, `${style.sprite}@2x.png`);
  // glifos de texto (rangos latinos básicos de las fuentes usadas)
  if (style.glyphs) {
    const stacks = new Set();
    (style.layers || []).forEach(l => {
      const f = l.layout && l.layout["text-font"];
      if (Array.isArray(f)) stacks.add(f.join(","));
    });
    for (const s of stacks)
      for (const range of ["0-255", "256-511", "512-767", "768-1023"])
        urls.push(style.glyphs.replace("{fontstack}", encodeURIComponent(s)).replace("{range}", range));
  }

  // bbox del viaje con margen
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  pts.forEach(p => {
    minLat = Math.min(minLat, p.it.lat); maxLat = Math.max(maxLat, p.it.lat);
    minLng = Math.min(minLng, p.it.lng); maxLng = Math.max(maxLng, p.it.lng);
  });
  const padLat = Math.max(.03, (maxLat - minLat) * .25), padLng = Math.max(.03, (maxLng - minLng) * .25);
  minLat -= padLat; maxLat += padLat; minLng -= padLng; maxLng += padLng;

  // vista mundial ligera + zona del viaje en detalle
  for (let z = 0; z <= 5; z++)
    for (let x = 0; x < Math.min(2 ** z, 4); x++)
      for (let y = 0; y < Math.min(2 ** z, 4); y++)
        urls.push(template.replace("{z}", z).replace("{x}", x).replace("{y}", y));
  for (let z = 8; z <= 14; z++) {
    const x0 = lng2tile(minLng, z), x1 = lng2tile(maxLng, z);
    const y0 = lat2tile(maxLat, z), y1 = lat2tile(minLat, z);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        urls.push(template.replace("{z}", z).replace("{x}", x).replace("{y}", y));
    if (urls.length > MAX_TILES) break;
  }
  return urls.slice(0, MAX_TILES);
}

async function openOfflineModal() {
  $("#offlineModal").hidden = false;
  $("#offlineEstimate").textContent = "Calculando…";
  $("#offlineProgress").style.width = "0";
  $("#offlineStatus").textContent = "";
  const urls = await offlineUrlsForTrip();
  $("#offlineEstimate").textContent = urls.length
    ? `${urls.length} archivos · aprox. ${(urls.length * 40 / 1024).toFixed(1)} MB`
    : (geoItems("all").length
      ? "Necesitas conexión a internet para descargar el mapa."
      : "No hay puntos con ubicación en este viaje todavía.");
  $("#btnStartOffline").disabled = !urls.length;
}

async function downloadTiles() {
  const urls = await offlineUrlsForTrip();
  if (!urls.length) return;
  if (!("caches" in window)) { toast("Tu navegador no permite guardar el mapa (necesita HTTPS)."); return; }
  const cache = await caches.open(TILE_CACHE);
  const btn = $("#btnStartOffline");
  btn.disabled = true;
  let done = 0, failed = 0;
  const CONCURRENCY = 6;
  const queue = [...urls];
  async function worker() {
    while (queue.length) {
      const url = queue.shift();
      try {
        if (!await cache.match(url)) {
          const res = await fetch(url, { mode: "cors" });
          if (res.ok) await cache.put(url, res);
          else failed++;
        }
      } catch { failed++; }
      done++;
      $("#offlineProgress").style.width = (done / urls.length * 100) + "%";
      $("#offlineStatus").textContent = `Descargados ${done}/${urls.length}${failed ? ` · ${failed} fallidos` : ""}`;
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  btn.disabled = false;
  $("#offlineStatus").textContent = failed < urls.length
    ? `✅ Mapa guardado: ${done - failed} mosaicos disponibles sin conexión.`
    : "⚠️ No se pudo descargar (¿sin conexión?). Inténtalo de nuevo con internet.";
  toast("Los datos del itinerario ya se guardan siempre en este dispositivo.");
}

/* ── Navegación e interfaz general ───────────────────────── */
function switchTab(tab) {
  ui.tab = tab;
  $$(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  $$(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + tab));
  document.body.classList.toggle("tab-map", tab === "map");
  if (tab === "map") {
    // altura disponible bajo la barra superior y las pestañas
    const chrome = $(".topbar").offsetHeight + $(".tabs").offsetHeight + 18;
    document.documentElement.style.setProperty("--chrome-h", chrome + "px");
    refreshMap();
  }
}

function closeModals() {
  $$(".modal-backdrop").forEach(m => { m.hidden = true; });
  ui.editingId = null;
}

function updateNetStatus() {
  const el = $("#netStatus");
  const on = navigator.onLine;
  el.textContent = on ? "● en línea" : "○ sin conexión";
  el.classList.toggle("offline", !on);
}

function bindGlobal() {
  // pestañas
  $$(".tab").forEach(b => b.addEventListener("click", () => switchTab(b.dataset.tab)));

  // vista lista / calendario
  $("#btnViewList").addEventListener("click", () => { ui.itinView = "list"; renderItinerary(); });
  $("#btnViewCal").addEventListener("click", () => { ui.itinView = "cal"; renderItinerary(); });
  $("#btnCalPrev").addEventListener("click", () => { ui.calCursor--; renderItinerary(); });
  $("#btnCalNext").addEventListener("click", () => { ui.calCursor++; renderItinerary(); });

  // selector y gestión de viajes
  $("#tripSelect").addEventListener("change", e => {
    state.activeTripId = e.target.value;
    ui.calCursor = 0; ui.selectedDayIdx = 0; ui.mapDayFilter = "all";
    save(); renderAll();
  });
  $("#btnNewTrip").addEventListener("click", () => openTripModal("new"));
  $("#btnEditTrip").addEventListener("click", () => openTripModal("edit"));
  $("#btnDeleteTrip").addEventListener("click", () => {
    const t = trip();
    if (!confirm(`¿Eliminar el viaje «${t.name}» y todos sus datos? Esta acción no se puede deshacer.`)) return;
    tripActivityIds(t).forEach(id => FDB.delByAct(id).catch(() => {}));
    state.trips = state.trips.filter(x => x.id !== t.id);
    if (!state.trips.length) state.trips.push(newTrip("Mi viaje", "", new Date().toISOString().slice(0, 10), addDays(new Date().toISOString().slice(0, 10), 4)));
    state.activeTripId = state.trips[0].id;
    save(); renderAll();
    $("#moreMenu").hidden = true;
  });

  // menú ⋯
  $("#btnMore").addEventListener("click", e => {
    e.stopPropagation();
    $("#moreMenu").hidden = !$("#moreMenu").hidden;
  });
  document.addEventListener("click", e => {
    if (!e.target.closest(".menu-wrap")) $("#moreMenu").hidden = true;
  });
  $("#btnExportJson").addEventListener("click", () => { exportJson(); $("#moreMenu").hidden = true; });
  $("#btnImportJson").addEventListener("click", () => { $("#importFile").click(); $("#moreMenu").hidden = true; });
  $("#importFile").addEventListener("change", e => { if (e.target.files[0]) importJson(e.target.files[0]); e.target.value = ""; });
  $("#btnPrint").addEventListener("click", () => { $("#moreMenu").hidden = true; window.print(); });
  $("#btnOfflineMap").addEventListener("click", () => { $("#moreMenu").hidden = true; openOfflineModal(); });
  $("#btnStartOffline").addEventListener("click", downloadTiles);

  // sincronización
  $("#btnSync").addEventListener("click", () => {
    $("#moreMenu").hidden = true;
    setSyncStatus("");
    renderSyncUI();
    $("#syncModal").hidden = false;
  });
  $("#btnSyncConnect").addEventListener("click", syncConnect);
  $("#btnSyncNow").addEventListener("click", () => syncNow(true));
  $("#btnSyncDisconnect").addEventListener("click", () => {
    if (!confirm("¿Desconectar la sincronización en este dispositivo? El gist de GitHub y tus datos locales no se borran.")) return;
    SYNC_CFG.token = "";
    SYNC_CFG.gistId = "";
    setSyncStatus("Desconectado.");
    renderSyncUI();
  });
  $("#syncAuto").addEventListener("change", e => { SYNC_CFG.auto = e.target.checked; });

  // actividades
  $("#btnAddActivity").addEventListener("click", () =>
    openActivityModal(null, { day: ui.itinView === "cal" ? String(ui.selectedDayIdx) : "0" }));
  $("#btnAddIdea").addEventListener("click", () => openActivityModal(null, { day: "ideas" }));
  $("#btnAddBooking").addEventListener("click", () => openActivityModal(null, { day: "ideas", booking: true }));
  $("#activityForm").addEventListener("submit", saveActivityFromForm);
  let undoFileTimer = null;
  $("#btnDeleteActivity").addEventListener("click", () => {
    if (!ui.editingId) return;
    const found = findActivity(ui.editingId);
    if (!found) return;
    const [removed] = found.list.splice(found.idx, 1);
    const ctx = { item: removed, key: found.key, idx: found.idx };
    save(); closeModals(); renderAll();
    // los adjuntos se borran solo cuando expira la opción de deshacer
    clearTimeout(undoFileTimer);
    undoFileTimer = setTimeout(() => FDB.delByAct(removed.id).catch(() => {}), 6500);
    toastWithAction(`«${removed.title}» eliminada.`, "Deshacer", () => {
      clearTimeout(undoFileTimer);
      const list = listFor(ctx.key);
      list.splice(Math.min(ctx.idx, list.length), 0, ctx.item);
      save(); renderAll();
    });
  });
  $("#fIsBooking").addEventListener("change", e => { $("#bookingFields").hidden = !e.target.checked; });
  // sugerir duración típica al cambiar de categoría (solo en actividades nuevas
  // y mientras el usuario no haya tocado el campo)
  $("#fDuration").addEventListener("input", () => { ui.durTouched = true; });
  $("#fCategory").addEventListener("change", e => {
    if (!ui.editingId && !ui.durTouched) $("#fDuration").value = DEFAULT_DUR[e.target.value] ?? 60;
  });

  // adjuntos
  $("#btnAttach").addEventListener("click", () => $("#fFiles").click());
  $("#fFiles").addEventListener("change", e => {
    for (const f of e.target.files) {
      if (f.size > 5 * 1048576) { toast(`«${f.name}» supera los 5 MB y no se adjuntó.`); continue; }
      attachState.added.push(f);
    }
    e.target.value = "";
    renderAttachList();
  });
  $("#btnGeocode").addEventListener("click", geocode);
  $("#fPlace").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); geocode(); } });

  // viaje
  $("#tripForm").addEventListener("submit", saveTripFromForm);

  // cierre de modales
  $$("[data-close]").forEach(b => b.addEventListener("click", closeModals));
  $$(".modal-backdrop").forEach(m => m.addEventListener("mousedown", e => { if (e.target === m) closeModals(); }));
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModals(); });

  // exportar ruta (vista mapa: respeta el filtro de día activo)
  $("#btnExportGmaps").addEventListener("click", () => openGmaps(routePoints()));
  $("#btnClosePanel").addEventListener("click", () => {
    ui.mapDayFilter = "all";
    renderMapChips();
    refreshMap();
  });
  bindMapStopsDnD();

  // notas
  let notesTimer;
  $("#tripNotes").addEventListener("input", e => {
    clearTimeout(notesTimer);
    notesTimer = setTimeout(() => { trip().notes = e.target.value; save(); }, 400);
  });

  // antes del viaje / equipaje: formularios inline
  $("#btnAddPrep").addEventListener("click", () => {
    const f = $("#prepForm");
    f.hidden = !f.hidden;
    if (!f.hidden) $("#prepText").focus();
  });
  $("#prepForm").addEventListener("submit", e => {
    e.preventDefault();
    const text = $("#prepText").value.trim();
    if (!text) return;
    trip().prep.push({ id: uid(), text, done: false, due: $("#prepDue").value || "" });
    $("#prepText").value = "";
    $("#prepDue").value = "";
    save(); renderPrep();
    $("#prepText").focus(); // encadenar varias tareas seguidas
  });
  $("#btnAddPacking").addEventListener("click", () => {
    const f = $("#packForm");
    f.hidden = !f.hidden;
    if (!f.hidden) $("#packText").focus();
  });
  $("#packForm").addEventListener("submit", e => {
    e.preventDefault();
    const text = $("#packText").value.trim();
    if (!text) return;
    trip().packing.push({ id: uid(), text, done: false, cat: $("#packCat").value.trim() || "Otros" });
    $("#packText").value = "";
    save(); renderPacking();
    $("#packText").focus();
  });
  $("#btnPackingTemplate").addEventListener("click", () => {
    const t = trip();
    const existing = new Set(t.packing.map(p => p.text.toLowerCase()));
    let added = 0;
    PACKING_TEMPLATE.forEach(([cat, items]) => items.forEach(text => {
      if (!existing.has(text.toLowerCase())) { t.packing.push({ id: uid(), text, done: false, cat }); added++; }
    }));
    save(); renderPacking();
    toast(added ? `${added} básicos añadidos a la lista 🎒` : "Los básicos ya estaban en tu lista.");
  });

  // conexión
  window.addEventListener("online", updateNetStatus);
  window.addEventListener("offline", updateNetStatus);
}

/* ── Service worker ──────────────────────────────────────── */
function registerSW() {
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => { /* file:// o navegador antiguo */ });
  }
}

/* ── Arranque ────────────────────────────────────────────── */
load();
bindGlobal();
updateNetStatus();
renderAll();
renderSyncUI();
registerSW();
if (syncEnabled()) syncNow(false); // al abrir, traer lo último de la nube
