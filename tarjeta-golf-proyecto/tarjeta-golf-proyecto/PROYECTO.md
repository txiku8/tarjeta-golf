# Tarjeta de Golf — Documento de proyecto (handoff)

Contexto completo para que otra IA (o desarrollador) continúe el proyecto sin contexto previo.

## 1. Qué es

App web para llevar la **tarjeta de golf**: registrar rondas hoyo a hoyo (golpes, putts, calle, penalizaciones), con estadísticas para mejorar el juego, catálogo de campos de España con buscador y mapa, gráficos de progreso y sincronización en la nube con login de Google.

- **App en producción:** https://tarjeta-golf-txiku.web.app
- **Toda la app es UN ÚNICO archivo** `index.html` (HTML + CSS + JS inline, sin build, sin dependencias npm). Se despliega tal cual.
- Público objetivo: un jugador que usa el móvil en el campo (UI táctil, pensada para el pulgar, se añade a pantalla de inicio).
- Idioma UI: español.

## 2. Stack y decisiones clave

- **Vanilla JS**, sin frameworks ni bundler. Un solo `index.html` (~140 KB).
- **CSS** con variables (`:root`), **solo modo claro** (`color-scheme: light`; el modo oscuro se eliminó a propósito).
- **Firebase** vía **compat SDK** cargado por `<script>` desde gstatic (no módulos ES), para poder usarlo desde el script clásico inline:
  - `firebase-app-compat.js`, `firebase-auth-compat.js`, `firebase-firestore-compat.js` (v10.13.2).
- **Auth:** Google Sign-In (`signInWithPopup`).
- **Base de datos:** Cloud Firestore, **1 documento por usuario**: `users/{uid} = { courses: [...], rounds: [...], updated: <ms> }`.
- **Offline:** `firestore().enablePersistence({synchronizeTabs:true})` → lecturas/escrituras funcionan sin red y sincronizan al volver (importante: en el campo se pierde cobertura).
- **Sin build de datos en runtime**: el catálogo de campos y el mapa de España van **embebidos** en el HTML como literales JS (generados por scripts de build, ver §7).

### Modo nube vs modo local (importante)
La app detecta el host:
```js
const CLOUD_ENABLED = /(^|\.)(web\.app|firebaseapp\.com)$/.test(location.hostname) && typeof firebase !== 'undefined';
```
- En **tarjeta-golf-txiku.web.app** → modo NUBE: pantalla de login, datos en Firestore, sync entre dispositivos.
- En cualquier otro host (o si el SDK no carga) → modo LOCAL: sin login, datos solo en `localStorage` (comportamiento original). Útil para servir la misma app en otros sitios sin Firebase.

## 3. Proyecto Firebase

- **Project ID:** `tarjeta-golf-txiku`
- **Cuenta propietaria:** txiku8@gmail.com (Owner del proyecto en Firebase / Google Cloud).
- **Config web (pública por diseño, va en el cliente):**
```js
const FB_CONFIG = {
  apiKey: 'AIzaSyCnXV2YozY6RDfc971cZPp_5-jqkUT1jCc',
  authDomain: 'tarjeta-golf-txiku.firebaseapp.com',
  projectId: 'tarjeta-golf-txiku',
  storageBucket: 'tarjeta-golf-txiku.firebasestorage.app',
  messagingSenderId: '667980098164',
  appId: '1:667980098164:web:ebf403b72f5eb1ec9d3f21'
};
```
- **Firestore:** base `(default)`, ubicación `europe-west1` (región Bélgica, Europa).
- **Hosting:** sitio por defecto `tarjeta-golf-txiku` → `tarjeta-golf-txiku.web.app`.

### Reglas de seguridad Firestore (`firestore.rules`)
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```
Cada usuario solo lee/escribe su propio documento.

### Proveedor Google (ya activado)
El **proveedor Google** está activado en la consola. Si hiciera falta revisarlo:
Firebase Console → Authentication → Sign-in method → Google → Habilitar → elegir email de asistencia → Guardar.
Link: https://console.firebase.google.com/project/tarjeta-golf-txiku/authentication/providers
(Nota: activarlo no se puede por API en proyectos personales sin organización; es un paso manual en la consola.)

## 4. Modelo de datos

### En memoria / localStorage
- `courses`: `[{ id, name, loc, pars: number[18|9], lat, lon }]`
  - `pars` = par de cada hoyo. `loc` = "Localidad · Provincia". `lat/lon` opcionales (para el mini-mapa).
- `rounds`: `[{ id, courseId, courseName, courseLoc, pars: number[], date: ISO, holes, saved:true }]`
  - `holes`: `[{ strokes, putts, fir: 'hit'|'left'|'right'|null, pen }]` por hoyo.
  - Cada ronda guarda su **propia copia de `pars`** (foto del día): editar un campo no altera rondas pasadas.
- `active`: ronda en curso (borrador). **Solo local**, NO se sincroniza (es específica del dispositivo).
- Claves localStorage: `golf_courses_v1`, `golf_rounds_v1`, `golf_active_v1`.

### En Firestore
- `users/{uid} = { courses, rounds, updated }`. Se sube con debounce (700 ms) al cambiar. `onSnapshot` mantiene sincronizados los dispositivos. En el primer login sin documento, se sube lo que hubiera en local.

## 5. Funcionalidades

- **Registro por hoyo:** golpes, putts, penalizaciones (steppers), y **salida/calle** (Izq / Calle ✓ / Dcha; deshabilitado en par 3). Putts se limitan a `golpes − 1`.
- **GIR (Green in Regulation) automático:** `isGir = golpes > 0 && (golpes − putts) ≤ (par − 2)`. Fórmula estándar; verificada contra escenarios reales (hoyo en uno, 3-putt, chip-in, etc.). No se teclea.
- **Totales en vivo:** golpes, vs par, putts, % calles (FIR), % greens (GIR).
- **Catálogo de 411 campos reales de España** embebido (`GOLF_CATALOG`): nombre, localidad, provincia, hoyos, par, lat, lon. Con coordenadas geocodificadas (OpenStreetMap/Nominatim).
- **Explorar (vía principal para añadir campo):** buscador instantáneo (ignora acentos) + **mapa coroplético SVG de España** por provincia (color según nº de campos), tocar provincia filtra. Canarias en recuadro. "Crear campo personalizado" es opción secundaria/discreta.
- **Mini-mapa por campo:** SVG offline con la provincia dibujada + marcador en la ubicación (misma proyección que el mapa nacional). Aparece en la tarjeta del campo y al añadir/editar. Sin recursos externos (no sale de la app).
- **Gráficos de progreso** (SVG offline): evolución vs par por ronda, putts/hoyo, reparto de resultados (eagle/birdie/par/bogey/doble+).
- **Ver demo con datos:** botón en el login que carga 4 campos + 10 rondas simuladas (tendencia de mejora) en modo local, para enseñar la app.
- **Arranque siempre en Inicio**; si hay ronda a medias, aviso "Ronda en curso" (Continuar/Descartar).
- **Export/Import JSON** y "Borrar todo" en el menú `···`.

## 6. Estructura del código (dentro de `index.html`)

Un solo `<script>` clásico. Bloques principales (buscar por comentarios `/* ---------- ... */`):
- Estado nube (FB_CONFIG, CLOUD_ENABLED, `scheduleCloudPush`).
- Catálogo (`GOLF_CATALOG`), `norm`, `SPAIN_MAP` (datos del mapa + proyección), `parLayout`.
- Helpers de scoring (`isGir`, `scoreColor`, `roundTotals`, `fmtVsPar`).
- Mini-mapa (`projectPt`, `courseMiniMap`, `courseCoords`).
- Gráficos (`svgLine`, `renderProgress`).
- HOME (`renderHome`), Rondas (`startRound`, `openRound`, `holeCard`, ...), Finder (`openFinder`, `buildMap`, `renderFinder`), Modal de campo (`openCourseModal`), Menú (export/import/reset), Datos de ejemplo (`loadDemo`).
- Auth + sync (`initCloud`, `subscribeCloud`, `startApp`) y boot.

`SPAIN_MAP` contiene: `viewBox`, `canaryBox`, `maxCount`, `provs:[{prov,ck,n,d}]` (path SVG por provincia), y `proj`/`canaryProj` (constantes de proyección lon/lat→SVG) + `canaryKeys`.

## 7. Scripts de build (generan datos embebidos)

Viven en la carpeta del proyecto (`firebase-golf/`, junto a `public/index.html`). NO se ejecutan en runtime; se usaron para generar los literales embebidos. Si hay que regenerar el catálogo o el mapa:
- `merge.py` — fusiona/deduplica el catálogo de campos (6 bloques por zona) e inyecta `GOLF_CATALOG`.
- `geocode.py` — geocodifica los campos con Nominatim (1 req/s) → `coords.json`.
- `genmap.py` — descarga GeoJSON de provincias, simplifica (Douglas-Peucker), proyecta, genera `SPAIN_MAP` (`spain_map.js`).
- `integrate.py` — mete lat/lon en el catálogo y reinyecta `SPAIN_MAP` con la proyección.
Requieren `python3` (stdlib) y `node` (para validar sintaxis con `node --check`).

## 8. Cómo desplegar / actualizar

Desde la carpeta del proyecto (contiene `firebase.json`, `.firebaserc`, `firestore.rules`, `public/index.html`):
```bash
# editar public/index.html y luego:
firebase deploy --only hosting --project tarjeta-golf-txiku
# si cambian las reglas:
firebase deploy --only firestore:rules,hosting --project tarjeta-golf-txiku
```
`firebase.json`:
```json
{
  "hosting": {
    "public": "public",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "headers": [ { "source": "**", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] } ]
  },
  "firestore": { "rules": "firestore.rules" }
}
```

## 9. Limitaciones conocidas / próximos pasos

- **Par hoyo a hoyo** del catálogo es una **plantilla** que suma el par total real, NO el layout oficial de cada campo (no existe en fuentes abiertas para ~400 campos). Editable por el usuario. Falta el **stroke index** (índice de dificultad por hoyo).
- **Precisión de coordenadas** variable: ~250 a nivel de campo (golf), el resto a nivel de pueblo (centroide).
- **Offline al ABRIR sin red**: hoy el dato es offline (caché Firestore), pero abrir la app cerrada sin conexión requeriría convertirla en **PWA** (manifest + service worker que cachee el shell y el SDK). Pendiente si se quiere offline total.
- **Maps/gráficos** son SVG propios (sin tiles externos), así funcionan en cualquier hosting sin depender de proveedores de mapas.
- **Login en móvil** usa popup; si algún navegador lo bloquea, cambiar a `signInWithRedirect`.
- Sincronización: se guarda el documento completo del usuario (merge). Tamaño holgado para el límite de 1 MB por documento de Firestore.

## 10. Ideas de mejora
- PWA offline completa (service worker).
- Stableford, scrambling/sand saves, up&down.
- Vista de detalle de ronda con perfil hoyo a hoyo.
- Zoom del mapa por región / marcadores por campo.
- Stroke index real por campo (si se consigue fuente).
