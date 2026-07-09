# 🧭 Voyage — Planificador de itinerarios de viaje

Aplicación web para organizar viajes al estilo Wanderlog, pero **sin cuentas, sin servidor y con más libertad**: todos los datos viven en tu dispositivo y funciona sin conexión.

![Estado](https://img.shields.io/badge/estado-listo%20para%20usar-2a9d5c) ![Sin dependencias](https://img.shields.io/badge/backend-ninguno-0d5c63)

## ✨ Funcionalidades

### 📅 Itinerario día a día
- Dos vistas: **lista** (todos los días en columna) y **calendario mensual** (pincha en un día y su detalle aparece al lado).
- Calendario del viaje con un bloque por día y actividades ordenadas por hora.
- **Arrastrar y soltar** para reordenar actividades dentro de un día o moverlas entre días.
- Panel de **💡 Ideas**: guarda sitios sin asignar y arrástralos a un día cuando decidas.
- **Medidor de carga por día**: suma la duración de las actividades más una estimación de los trayectos entre puntos (a pie hasta ~2 km, transporte para más) y lo califica como *Relajado · Equilibrado · Intenso · Excesivo*, con horas totales y kilómetros. Así ves de un vistazo si el día es mucho o poco.
- Entre actividad y actividad se muestra el **trayecto estimado** (distancia, minutos y modo).

### 🗺️ Mapa
- Cartografía CARTO Voyager: diseño cuidado y **topónimos en alfabeto latino/inglés en todo el mundo**.
- Todos los puntos numerados y coloreados por día, con la ruta del día dibujada.
- Filtro por día con chips.
- **Exportar la ruta a Google Maps** (todas las paradas encadenadas) — por día o según el filtro activo.

### 📴 Sin conexión
- Es una **PWA**: la app entera se guarda en caché y se puede instalar en el móvil.
- Los datos del itinerario se guardan siempre en el dispositivo (localStorage).
- **«Guardar mapa sin conexión»** (menú ⋯): descarga los mosaicos del mapa que cubren tu itinerario (zoom 11–16) para consultarlos sin internet.
- Copia de seguridad: **exportar/importar JSON** e **imprimir/PDF**.

### 🎫 Reservas
- Cualquier actividad puede marcarse como reserva (código/localizador, proveedor, confirmada o pendiente).
- Pestaña propia que agrupa vuelos, hoteles, trenes, entradas y restaurantes con reserva.

### 📋 Antes del viaje
- Checklist de trámites con fecha límite (visado, seguro, moneda…) y barra de progreso.
- Bloque de notas libres del viaje (teléfonos, frases, direcciones).

### 🎒 Equipaje
- Checklist por categorías con progreso y plantilla de **básicos** con un clic.

### 💶 Presupuesto
- Suma automática de los costes apuntados en actividades y reservas: total, media por día, ya reservado y desglose por día.

## 🚀 Cómo usarla

No necesita instalación ni compilación. Solo hace falta servir la carpeta por HTTP:

```bash
# con Python
python3 -m http.server 8080
# o con Node
npx serve .
```

Y abrir <http://localhost:8080>. Para tener modo sin conexión e instalación como app, sírvela por **HTTPS** (o `localhost`, que también vale). También puedes publicarla gratis en GitHub Pages: *Settings → Pages → Deploy from branch*.

> Abrir `index.html` con doble clic (protocolo `file://`) también funciona para probar, pero el modo sin conexión y el buscador de lugares requieren HTTP(S).

## 🧭 Guía rápida

1. **＋ Viaje** → nombre y fechas: se crea un bloque por día.
2. **＋ Añadir actividad** → título, categoría, hora, duración, coste y lugar (busca con 🔎, pega coordenadas `lat, lng` o haz clic en el minimapa).
3. Arrastra las tarjetas para reorganizar; el medidor de carga se recalcula al instante.
4. En **Mapa**, filtra por día y abre la ruta en Google Maps.
5. Antes de salir: menú **⋯ → Guardar mapa sin conexión** y repasa **Antes del viaje** y **Equipaje**.

Al abrirla por primera vez se carga un viaje de ejemplo (Kioto) para que veas todo en acción; puedes eliminarlo desde el menú ⋯.

## 🛠️ Tecnología

- HTML/CSS/JS vanilla, sin build ni dependencias de red en tiempo de ejecución.
- [Leaflet 1.9.4](https://leafletjs.com/) incluido en `vendor/` (funciona offline).
- Tipografías [Inter](https://rsms.me/inter/) y [Fraunces](https://fraunces.undercase.xyz/) servidas en local.
- Mosaicos [CARTO Voyager](https://carto.com/attributions) (datos © OpenStreetMap) y geocodificación con [Nominatim](https://nominatim.org/) (solo al buscar lugares).
- Service worker con caché del shell y de mosaicos; manifest PWA.

## 📁 Estructura

```
index.html            interfaz (pestañas, modales)
css/styles.css        sistema de diseño (claro/oscuro, impresión, móvil)
js/app.js             lógica: estado, itinerario, mapa, exportaciones, offline
sw.js                 service worker (shell + mosaicos)
manifest.webmanifest  manifest PWA
vendor/leaflet/       Leaflet embebido
```

## ⚠️ Notas

- La estimación de trayectos es orientativa (línea recta × 1,3, a pie 4,5 km/h, transporte ~22 km/h): sirve para valorar la carga del día, no sustituye al navegador.
- Los mosaicos de CARTO son de uso gratuito con atribución para proyectos personales; la descarga offline está limitada a ~1600 mosaicos por viaje para un uso razonable.
