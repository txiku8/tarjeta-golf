# Tarjeta de Golf — Documento de proyecto (handoff)

Contexto completo para que otra IA (o desarrollador) continúe el proyecto sin contexto previo.

## 1. Qué es

App web para llevar la **tarjeta de golf**: registrar rondas hoyo a hoyo (golpes, putts, calle, penalizaciones), con estadísticas para mejorar el juego, catálogo de campos de España con buscador y mapa, gráficos de progreso y sincronización en la nube con login de Google.

- **App en producción:** https://tarjeta-golf-txiku.web.app
- **Sin build ni dependencias npm**: se despliega tal cual. El HTML va en `public/index.html`, los
  estilos en `public/css/estilos.css` y el JavaScript repartido en un módulo por pantalla dentro de
  `public/js/` (scripts clásicos con `defer`, ver §6). Antes era un único archivo; se partió al crecer.
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
- `courses`: `[{ id, name, loc, pars: number[18|9], si, lat, lon }]`
  - `pars` = par de cada hoyo, `si` = stroke index. `loc` = "Localidad · Provincia". `lat/lon` opcionales (para el mini-mapa).
- `rounds`: `[{ id, courseId, courseName, courseLoc, pars, si, mts, date: ISO, holes, saved:true, … }]`
  - `holes`: `[{ strokes, putts, fir: 'hit'|'left'|'right'|null, pen, bunker, drive }]` por hoyo.
    `drive` = metros de la salida medidos con el GPS (0 = sin medir).
  - `mts` = metros de cada hoyo desde la barra jugada; `barra`, `sr`, `cr` = barra, slope y course
    rating (los necesita el hándicap WHS); `hcp`/`hcpIndex` = golpes de juego e índice exacto;
    `holeStart` = nº del primer hoyo (para las vueltas 10-18); `mode` + bloques `match` / `fb`.
  - Cada ronda guarda su **propia copia de `pars`/`si`/`mts`** (foto del día): editar un campo no altera rondas pasadas.
- `profile`: índice, barra y hándicap recordados, nombres de rival/compañero y los filtros de
  Rendimiento (`rendN`, `rendCourse`). Solo local, no se sincroniza.
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
- **Modalidades:** Medal, Stableford, match play uno contra uno y fourball (match 2 vs 2 o mejor
  bola), con el reparto de golpes de la RFEG/WHS (95 % individual, 90 % de la diferencia en fourball
  match, 85 % en mejor bola) y concesiones de hoyo.
- **Metros de cada hoyo** desde la barra jugada (editor, GPS, vista previa, tarjeta).
- **Histórico por hoyo**: veces jugado, media, mejor y última, mientras juegas ese hoyo.
- **Hándicap WHS estimado** con tus propias tarjetas (diferenciales con tope de doble bogey neto).
- **Medir el golpe con el GPS**: marca dónde pegas, camina a la bola y guarda la salida en metros.
- **Pantalla siempre encendida** durante la ronda y el mapa (Wake Lock).
- **Compartir la tarjeta** como imagen PNG dibujada en un canvas (`navigator.share`).
- **PWA**: `manifest.json` + service worker con app-shell atómico → abre sin cobertura.

## 6. Estructura del código (`public/js/`, un módulo por pantalla)

Scripts clásicos con `defer`, cargados **en este orden** (todo vive en el ámbito global, sin imports):

| Archivo | Qué hay dentro |
| --- | --- |
| `nucleo.js` | `$`, `el`, `uid`, `LS`, `load`/`save`, FB_CONFIG, `CLOUD_ENABLED`, `scheduleCloudPush` |
| `datos.js` | `GOLF_CATALOG` (404 campos), `norm`, `SPAIN_MAP` |
| `gps-datos.js` | `GPS_GREENS` (salida/frente/centro/fondo de 99 campos), `gpsHolesFor` |
| `comun.js` | `mtile`/`sicon`, scoring (`isGir`, `roundTotals`, `stableford`), match play y fourball, metros (`roundMetres`), histórico (`holeHistory`, `holeAggregate`), hándicap WHS (`roundDifferential`, `whsIndex`), `keepAwake`, gráficos SVG y mini-mapa |
| `navegacion.js` | pestañas, geolocalización, tarjeta de campo, **configurar ronda** (`openRoundConfig`), vista previa |
| `pantalla-historial.js` | lista de rondas con deslizar-para-borrar |
| `pantalla-rendimiento.js` | filtros, estadísticas agregadas, por par, salida y hoyos |
| `pantalla-jugar.js` | campos cercanos, ronda (tarjeta + editor de hoyo), resumen, tarjeta apaisada |
| `pantalla-gps.js` | mapa del hoyo, distancias y medición del golpe |
| `pantalla-yo.js` | perfil, ficha RFEG, hándicap estimado, exportar/importar |
| `compartir.js` | dibuja la tarjeta en un canvas y la comparte (`shareRound`) |
| `buscador-mapa.js` | `esc`/`fmtDate`/`toast`, buscador de campos y mapa Leaflet |
| `inicio.js` | auth + sincronización (`initCloud`, `subscribeCloud`, `startApp`) y arranque |

⚠️ Al añadir o quitar un módulo hay que tocarlo en **`index.html`**, en la lista `SHELL` de
**`sw.js`** y subir **`CACHE_VERSION`** (si no, quien tenga la app instalada seguirá con la copia vieja).

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

- **Par, stroke index y metros** son ya los **reales** de los 404 campos de softline.golf (por barra en el caso de los metros). Editables por el usuario.
- **Precisión de coordenadas** variable: ~250 a nivel de campo (golf), el resto a nivel de pueblo (centroide).
- **GPS del hoyo** solo en los 99 campos de `gps-datos.js`; en el resto no aparece el mapa.
- **Hándicap WHS**: solo entran vueltas de **18 hoyos** con la barra apuntada (el WHS combina las de
  9 de dos en dos, que no está implementado). Es un cálculo propio, no sustituye al oficial de la RFEG.
- **Maps/gráficos** son SVG propios (sin tiles externos), así funcionan en cualquier hosting sin depender de proveedores de mapas.
- **Login en móvil** usa popup; si algún navegador lo bloquea, cambiar a `signInWithRedirect`.
- Sincronización: se guarda el documento completo del usuario (merge). Tamaño holgado para el límite de 1 MB por documento de Firestore.

## 10. Ideas de mejora
Hechas: PWA offline, Stableford, scrambling/sand saves, detalle de ronda hoyo a hoyo, stroke index
real, metros por barra, hándicap WHS, medir la salida, compartir la tarjeta.

Pendientes:
- Unificar la iconografía (aún conviven emoji y los SVG de `sicon()`).
- Legibilidad a pleno sol: más contraste en `--muted` y tamaño mínimo de texto mayor.
- Diferencial de vueltas de 9 hoyos para el hándicap.
- Campos de 9 hoyos en el catálogo (softline solo trae tarjetas de 18).
- Zoom del mapa por región / marcadores por campo.
