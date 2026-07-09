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

function fmtDate(iso, opts = { weekday: "long", day: "numeric", month: "long" }) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-ES", opts);
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
  map: null, miniMap: null, miniMarker: null, mapLayers: [],
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

function save() { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
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

/* ── Viaje de ejemplo ────────────────────────────────────── */
function seedTrip() {
  const t = newTrip("Kioto · ejemplo", "Kioto, Japón", "2026-10-12", "2026-10-14");
  const A = (title, cat, time, duration, lat, lng, extra = {}) =>
    newActivity({ title, cat, time, duration, lat, lng, place: title + ", Kioto", ...extra });
  t.days[0].items = [
    A("Santuario Fushimi Inari", "sight", "08:30", 150, 34.9671, 135.7727, { notes: "Madrugar para evitar multitudes. Subida completa ~2 h." }),
    A("Templo Kiyomizu-dera", "sight", "11:45", 90, 34.9949, 135.7850, { cost: 4 }),
    A("Paseo por Gion", "nature", "14:30", 90, 35.0037, 135.7788, { notes: "Calles Hanamikoji y Shirakawa." }),
    A("Cena en Pontocho", "food", "19:30", 90, 35.0094, 135.7709, { cost: 35, booking: { code: "TBL-4821", provider: "TableCheck", confirmed: true } }),
  ];
  t.days[1].items = [
    A("Pabellón dorado Kinkaku-ji", "sight", "09:00", 75, 35.0394, 135.7292, { cost: 4 }),
    A("Jardín zen de Ryōan-ji", "sight", "10:45", 60, 35.0345, 135.7183, { cost: 5 }),
    A("Bosque de bambú de Arashiyama", "nature", "13:00", 90, 35.0170, 135.6710),
    A("Puente Togetsukyō y río", "nature", "15:00", 60, 35.0126, 135.6776, { notes: "Helado de matcha en la orilla." }),
  ];
  t.days[2].items = [
    A("Castillo Nijō", "sight", "09:30", 90, 35.0142, 135.7481, { cost: 8 }),
    A("Mercado Nishiki", "food", "12:00", 90, 35.0050, 135.7649, { cost: 20, notes: "Probar tamagoyaki y mochi recién hecho." }),
    A("Compras en la estación de Kioto", "shopping", "16:00", 90, 34.9858, 135.7588),
  ];
  t.ideas = [
    A("Museo Internacional del Manga", "museum", "", 90, 35.0117, 135.7597, { cost: 9 }),
    A("Paseo del Filósofo", "nature", "", 75, 35.0270, 135.7940),
  ];
  t.days[0].items.unshift(newActivity({
    title: "Check-in · Hotel Granvia Kioto", cat: "hotel", time: "15:00", duration: 30,
    lat: 34.9857, lng: 135.7587, place: "Hotel Granvia, Estación de Kioto", cost: 420,
    booking: { code: "GRV-99872", provider: "Booking.com", confirmed: true },
  }));
  t.prep = [
    { id: uid(), text: "Comprobar vigencia del pasaporte (mín. 6 meses)", done: true, due: "" },
    { id: uid(), text: "Activar el JR Pass / Suica en el móvil", done: false, due: "2026-10-05" },
    { id: uid(), text: "Contratar seguro de viaje", done: false, due: "2026-10-01" },
    { id: uid(), text: "Cambiar euros a yenes", done: false, due: "" },
    { id: uid(), text: "Descargar mapas sin conexión (menú ⋯)", done: false, due: "" },
  ];
  t.packing = [
    { id: uid(), text: "Pasaporte y copias", done: false, cat: "Documentos" },
    { id: uid(), text: "Tarjetas + algo de efectivo", done: false, cat: "Documentos" },
    { id: uid(), text: "Adaptador de enchufe tipo A", done: false, cat: "Electrónica" },
    { id: uid(), text: "Batería externa", done: false, cat: "Electrónica" },
    { id: uid(), text: "Calzado cómodo para caminar", done: false, cat: "Ropa" },
    { id: uid(), text: "Chubasquero ligero", done: false, cat: "Ropa" },
  ];
  t.notes = "🏨 Hotel Granvia Kioto — JR Kyoto Station Karasuma Chuo-guchi.\n📞 Emergencias en Japón: 110 (policía) / 119 (ambulancia).\n🗣️ Gracias = arigatō · Perdón = sumimasen";
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
  $("#tripDates").textContent =
    `${t.destination ? t.destination + " · " : ""}${fmtDate(t.start, { day: "numeric", month: "short" })} – ${fmtDate(t.end, { day: "numeric", month: "short", year: "numeric" })} · ${n} día${n > 1 ? "s" : ""}`;
  $("#tripNotes").value = t.notes || "";
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
      ${it.time ? `<span class="a-time">${esc(it.time)}</span>` : ""}
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
  return `
  <section class="day-card" data-day="${di}">
    <header class="day-head">
      <span class="day-num" style="background:${color}">${di + 1}</span>
      <div class="day-title">
        <h3>${fmtDate(day.date)}</h3>
        <span class="small">${loadDetail}</span>
      </div>
      <div class="day-load" title="Estimación: tiempo de actividades + trayectos">
        <span class="load-meter"><i class="load-${st.rating.cls}-bar" style="width:${st.pct}%"></i></span>
        <span class="load-pill load-${st.rating.cls}">${st.rating.label}${day.items.length ? " · " + (st.totalMin / 60).toFixed(1) + " h" : ""}</span>
      </div>
      <div class="day-route-btns">
        <button class="btn btn-icon" data-act="add-to-day" data-day="${di}" title="Añadir actividad a este día">${ic("plus")}</button>
        <button class="btn btn-soft" data-act="gmaps-day" data-day="${di}" title="Abrir ruta del día en Google Maps">${ic("external")} Ruta</button>
      </div>
    </header>
    <div class="day-body drop-zone" data-day="${di}">
      ${itemsHTML || '<div class="day-empty">Día libre — arrastra actividades aquí</div>'}
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
      cells.push(`
      <button type="button" class="cal-cell in-trip drop-zone ${selected ? "selected" : ""}" data-day="${di}" data-cal-day="${di}" title="Día ${di + 1} · ${fmtDate(iso)}">
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
}

/* ── Reservas ────────────────────────────────────────────── */
function allBookings() {
  const t = trip();
  const out = [];
  t.days.forEach((d, di) => d.items.forEach(it => { if (it.booking) out.push({ it, when: d.date, dayIdx: di }); }));
  t.ideas.forEach(it => { if (it.booking) out.push({ it, when: null, dayIdx: null }); });
  return out;
}
function renderBookings() {
  const list = allBookings();
  $("#badgeBookings").textContent = list.length || "";
  $("#bookingsList").innerHTML = list.length ? list.map(({ it, when, dayIdx }) => {
    const cat = CATS[it.cat] || CATS.other;
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
    </div>`;
  }).join("") : `<div class="empty-state">Aún no hay reservas. Marca «Es una reserva» en cualquier actividad, o añade una desde aquí.</div>`;
  $$("#bookingsList .booking-card").forEach(c => c.addEventListener("click", () => openActivityModal(c.dataset.id)));
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
  $("#budgetTableWrap").innerHTML = `
    <table class="budget-table">
      <thead><tr><th>Día</th><th>Actividades</th><th style="text-align:right">Coste</th></tr></thead>
      <tbody>
        ${rows.map(r => `<tr><td>${r.label}</td><td>${r.count}</td><td class="num">${fmtMoney(r.cost)}</td></tr>`).join("")}
        <tr><td><strong>Total</strong></td><td></td><td class="num"><strong>${fmtMoney(grandTotal)}</strong></td></tr>
      </tbody>
    </table>`;
}

/* ── Mapa ────────────────────────────────────────────────── */
/* CARTO Voyager: cartografía cuidada y topónimos en alfabeto latino/inglés
   en todo el mundo. Se fija un único subdominio para que los mosaicos que
   se navegan y los que se descargan para offline compartan caché. */
const TILE_URL = "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png";
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

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
  const chips = [`<button class="chip ${ui.mapDayFilter === "all" ? "active" : ""}" data-day="all">Todos los días</button>`]
    .concat(t.days.map((d, i) =>
      `<button class="chip ${String(i) === String(ui.mapDayFilter) ? "active" : ""}" data-day="${i}" style="${String(i) === String(ui.mapDayFilter) ? `background:${DAY_COLORS[i % DAY_COLORS.length]};border-color:${DAY_COLORS[i % DAY_COLORS.length]}` : ""}">Día ${i + 1}</button>`));
  $("#mapDayChips").innerHTML = chips.join("");
  $$("#mapDayChips .chip").forEach(c => c.addEventListener("click", () => {
    ui.mapDayFilter = c.dataset.day;
    renderMapChips();
    refreshMap();
  }));
}

function ensureMap() {
  if (ui.map) return ui.map;
  ui.map = L.map("map", { zoomControl: true }).setView([40.4168, -3.7038], 5);
  L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19 }).addTo(ui.map);
  return ui.map;
}

function refreshMap() {
  const map = ensureMap();
  setTimeout(() => map.invalidateSize(), 60);
  ui.mapLayers.forEach(l => map.removeLayer(l));
  ui.mapLayers = [];
  const pts = geoItems(ui.mapDayFilter);
  if (!pts.length) return;

  // agrupar por día para trazar una línea por día
  const byDay = {};
  pts.forEach(p => (byDay[p.dayIdx] ||= []).push(p));
  const bounds = [];
  Object.entries(byDay).forEach(([di, list]) => {
    const color = DAY_COLORS[di % DAY_COLORS.length];
    const latlngs = list.map(p => [p.it.lat, p.it.lng]);
    if (latlngs.length > 1) {
      const line = L.polyline(latlngs, { color, weight: 3.5, opacity: .75, dashArray: "6 8" }).addTo(map);
      ui.mapLayers.push(line);
    }
    list.forEach((p, i) => {
      const cat = CATS[p.it.cat] || CATS.other;
      const icon = L.divIcon({
        className: "",
        html: `<div class="marker-pin" style="background:${color}"><span>${i + 1}</span></div>`,
        iconSize: [30, 30], iconAnchor: [15, 28], popupAnchor: [0, -26],
      });
      const mk = L.marker([p.it.lat, p.it.lng], { icon }).addTo(map);
      mk.bindPopup(`
        <div class="popup-title">${cat.emoji} ${esc(p.it.title)}</div>
        <div class="popup-meta">Día ${Number(di) + 1}${p.it.time ? " · " + esc(p.it.time) : ""}${p.it.duration ? " · " + fmtDur(p.it.duration) : ""}</div>
        ${p.it.notes ? `<div class="popup-meta">${esc(p.it.notes)}</div>` : ""}`);
      ui.mapLayers.push(mk);
      bounds.push([p.it.lat, p.it.lng]);
    });
  });
  if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
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

function openActivityModal(id = null, presets = {}) {
  ui.editingId = id;
  const modal = $("#activityModal");
  fillCategorySelect();
  fillDaySelect();
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

function initMiniMap() {
  setTimeout(() => {
    if (!ui.miniMap) {
      ui.miniMap = L.map("miniMap", { zoomControl: false, attributionControl: false });
      L.tileLayer(TILE_URL, { maxZoom: 19 }).addTo(ui.miniMap);
      ui.miniMap.on("click", e => setEditingLoc(e.latlng.lat, e.latlng.lng));
    }
    ui.miniMap.invalidateSize();
    const mainCenter = ui.map ? ui.map.getCenter() : { lat: 40.4168, lng: -3.7038 };
    if (ui.editingLoc) {
      ui.miniMap.setView([ui.editingLoc.lat, ui.editingLoc.lng], 14);
      placeMiniMarker(ui.editingLoc.lat, ui.editingLoc.lng);
    } else {
      // centrar cerca del resto del itinerario si existe
      const pts = geoItems("all");
      if (pts.length) ui.miniMap.setView([pts[0].it.lat, pts[0].it.lng], 12);
      else ui.miniMap.setView([mainCenter.lat, mainCenter.lng], 5);
      if (ui.miniMarker) { ui.miniMap.removeLayer(ui.miniMarker); ui.miniMarker = null; }
      updateCoordLabel();
    }
  }, 80);
}
function placeMiniMarker(lat, lng) {
  if (ui.miniMarker) ui.miniMarker.setLatLng([lat, lng]);
  else ui.miniMarker = L.marker([lat, lng]).addTo(ui.miniMap);
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
    ui.miniMap.setView([Number(m[1]), Number(m[2])], 14);
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
      ui.miniMap.setView([Number(r.lat), Number(r.lon)], 15);
      box.hidden = true;
    }));
  } catch {
    box.innerHTML = "<button disabled>⚠️ Sin conexión: pega coordenadas «lat, lng» o marca el punto en el minimapa.</button>";
  }
}

function saveActivityFromForm(e) {
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
  if (ui.editingId) {
    const found = findActivity(ui.editingId);
    if (found) {
      Object.assign(found.list[found.idx], data);
      if (found.key !== targetKey) moveActivity(ui.editingId, targetKey, listFor(targetKey).length);
    }
  } else {
    listFor(targetKey).push(newActivity(data));
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
function exportJson() {
  const t = trip();
  const blob = new Blob([JSON.stringify(t, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `voyage-${t.name.replace(/\W+/g, "-").toLowerCase()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast("Copia exportada ⬇️ Guárdala como respaldo.");
}
function importJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const t = JSON.parse(reader.result);
      if (!t || !Array.isArray(t.days)) throw new Error("formato");
      t.id = uid();
      t.name = (t.name || "Viaje importado") + " (importado)";
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

/* ── Mapa sin conexión (descarga de mosaicos) ────────────── */
const TILE_CACHE = "voyage-tiles-v1";
const MAX_TILES = 1600;

function lng2tile(lng, z) { return Math.floor((lng + 180) / 360 * 2 ** z); }
function lat2tile(lat, z) {
  const r = lat * Math.PI / 180;
  return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z);
}
function tilesForTrip() {
  const pts = geoItems("all");
  if (!pts.length) return [];
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  pts.forEach(p => {
    minLat = Math.min(minLat, p.it.lat); maxLat = Math.max(maxLat, p.it.lat);
    minLng = Math.min(minLng, p.it.lng); maxLng = Math.max(maxLng, p.it.lng);
  });
  const padLat = Math.max(.02, (maxLat - minLat) * .2), padLng = Math.max(.02, (maxLng - minLng) * .2);
  minLat -= padLat; maxLat += padLat; minLng -= padLng; maxLng += padLng;
  const urls = [];
  for (let z = 11; z <= 16; z++) {
    const x0 = lng2tile(minLng, z), x1 = lng2tile(maxLng, z);
    const y0 = lat2tile(maxLat, z), y1 = lat2tile(minLat, z);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        urls.push(TILE_URL.replace("{z}", z).replace("{x}", x).replace("{y}", y));
    if (urls.length > MAX_TILES) break;
  }
  return urls.slice(0, MAX_TILES);
}

function openOfflineModal() {
  const urls = tilesForTrip();
  $("#offlineEstimate").textContent = urls.length
    ? `${urls.length} mosaicos · aprox. ${(urls.length * 22 / 1024).toFixed(1)} MB`
    : "No hay puntos con ubicación en este viaje todavía.";
  $("#offlineProgress").style.width = "0";
  $("#offlineStatus").textContent = "";
  $("#btnStartOffline").disabled = !urls.length;
  $("#offlineModal").hidden = false;
}

async function downloadTiles() {
  const urls = tilesForTrip();
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
  if (tab === "map") refreshMap();
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

  // actividades
  $("#btnAddActivity").addEventListener("click", () =>
    openActivityModal(null, { day: ui.itinView === "cal" ? String(ui.selectedDayIdx) : "0" }));
  $("#btnAddIdea").addEventListener("click", () => openActivityModal(null, { day: "ideas" }));
  $("#btnAddBooking").addEventListener("click", () => openActivityModal(null, { day: "ideas", booking: true }));
  $("#activityForm").addEventListener("submit", saveActivityFromForm);
  $("#btnDeleteActivity").addEventListener("click", () => {
    if (!ui.editingId) return;
    const found = findActivity(ui.editingId);
    if (found && confirm("¿Eliminar esta actividad?")) {
      found.list.splice(found.idx, 1);
      save(); closeModals(); renderAll();
    }
  });
  $("#fIsBooking").addEventListener("change", e => { $("#bookingFields").hidden = !e.target.checked; });
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

  // notas
  let notesTimer;
  $("#tripNotes").addEventListener("input", e => {
    clearTimeout(notesTimer);
    notesTimer = setTimeout(() => { trip().notes = e.target.value; save(); }, 400);
  });

  // antes del viaje / equipaje
  $("#btnAddPrep").addEventListener("click", () => {
    const text = prompt("Nueva tarea previa al viaje:");
    if (!text?.trim()) return;
    const due = prompt("¿Fecha límite? (AAAA-MM-DD, opcional)") || "";
    trip().prep.push({ id: uid(), text: text.trim(), done: false, due: /^\d{4}-\d{2}-\d{2}$/.test(due.trim()) ? due.trim() : "" });
    save(); renderPrep();
  });
  $("#btnAddPacking").addEventListener("click", () => {
    const text = prompt("¿Qué hay que meter en la maleta?");
    if (!text?.trim()) return;
    const cat = prompt("Categoría (Documentos, Ropa, Electrónica, Aseo, Otros):", "Otros") || "Otros";
    trip().packing.push({ id: uid(), text: text.trim(), done: false, cat: cat.trim() || "Otros" });
    save(); renderPacking();
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
registerSW();
