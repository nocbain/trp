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
- **Pantalla completa**, con controles flotantes de vidrio.
- Cartografía vectorial (MapLibre GL + OpenFreeMap, estilo Liberty). Las capas de texto se reescriben para preferir `name:en` → `name:latin`, así los **topónimos salen en inglés/alfabeto latino en todo el mundo**, también en China o Japón.
- Todos los puntos numerados y coloreados por día, con la ruta del día dibujada.
- Al filtrar por un día se abre un **panel con sus paradas en orden**: arrastra o usa las flechas para **reordenar la ruta** al momento, y pulsa una parada para volar hasta ella.
- **Exportar la ruta a Google Maps** (todas las paradas encadenadas) — por día o según el filtro activo.

### 📴 Sin conexión
- Es una **PWA**: la app entera se guarda en caché y se puede instalar en el móvil.
- Los datos del itinerario se guardan siempre en el dispositivo (localStorage).
- **«Guardar mapa sin conexión»** (menú ⋯): descarga los mosaicos vectoriales que cubren tu itinerario (zoom 8–14; a partir de ahí MapLibre los reamplía, por lo que el zoom cercano también funciona offline) junto con el estilo, sprites y glifos.
- Copia de seguridad: **exportar/importar JSON** e **imprimir/PDF**.

### 🎫 Reservas
- Cualquier actividad puede marcarse como reserva (código/localizador, proveedor, confirmada o pendiente).
- Pestaña propia que agrupa vuelos, hoteles, trenes, entradas y restaurantes con reserva.
- **Documentación adjunta**: sube el PDF del billete, la confirmación del hotel o una foto de la entrada (hasta 5 MB por archivo). Se guardan en el dispositivo (IndexedDB), se abren con un toque desde la tarjeta de la reserva, y viajan con las copias JSON y la sincronización.

### 🔄 Sincronización entre dispositivos
- Menú ⋯ → **Sincronizar dispositivos**: tus viajes (con adjuntos) se guardan en un **Gist privado de tu cuenta de GitHub** — gratis y sin servidores de terceros.
- Configuración: crea un token en GitHub (*Settings → Developer settings → Personal access tokens → Tokens (classic)*) con solo el permiso `gist`, y pégalo en la app en cada dispositivo. La app encuentra o crea el gist automáticamente.
- Sincronización automática (unos segundos después de cada cambio y al abrir la app) o manual con «Sincronizar ahora». Estrategia: gana el conjunto de datos más reciente.

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

Al abrirla por primera vez se carga un viaje de ejemplo (Pekín) para que veas todo en acción; puedes eliminarlo desde el menú ⋯.

## 🛠️ Tecnología

- HTML/CSS/JS vanilla, sin build ni dependencias de red en tiempo de ejecución.
- [MapLibre GL JS](https://maplibre.org/) incluido en `vendor/` (funciona offline).
- Mapa base: [OpenFreeMap](https://openfreemap.org/) (datos © OpenStreetMap), estilo Liberty con etiquetas localizadas al inglés.
- Tipografía [Inter](https://rsms.me/inter/) servida en local; interfaz «liquid glass» con `backdrop-filter`.
- Geocodificación con [Nominatim](https://nominatim.org/) (solo al buscar lugares).
- Service worker con caché del shell y del mapa; manifest PWA.

## 📁 Estructura

```
index.html            interfaz (pestañas, modales, sprite de iconos SVG)
css/styles.css        sistema de diseño liquid glass (claro/oscuro, impresión, móvil)
js/app.js             lógica: estado, itinerario, calendario, mapa, exportaciones, offline
sw.js                 service worker (shell + mapa)
manifest.webmanifest  manifest PWA
vendor/maplibre/      MapLibre GL embebido
vendor/fonts/         Inter embebida
```

## ⚠️ Notas

- La estimación de trayectos es orientativa (línea recta × 1,3, a pie 4,5 km/h, transporte ~22 km/h): sirve para valorar la carga del día, no sustituye al navegador.
- OpenFreeMap es un servicio gratuito sin clave de API; la descarga offline está limitada a ~2000 archivos por viaje para un uso razonable.
