# Estado del proyecto — punto de retomada

_Última sesión: 2026-08-16_

## Dónde está todo

- **App en producción (tu cuenta):** https://tarjeta-golf-txiku.web.app
- **Proyecto Firebase:** `tarjeta-golf-txiku` (cuenta **txiku8@gmail.com**). Hosting + Firestore (Europa, `europe-west1`) + login Google, todo operativo.
- **La app ya NO es un único archivo**: `public/index.html` (solo el HTML) + `public/css/estilos.css` + un módulo por pantalla en `public/js/`:
  `nucleo.js` (utilidades + estado nube), `datos.js` (catálogo), `gps-datos.js` (greens),
  `comun.js` (scoring, hándicap, gráficos), `navegacion.js` (pestañas + configurar ronda),
  `pantalla-historial.js`, `pantalla-rendimiento.js`, `pantalla-jugar.js`, `pantalla-gps.js`,
  `pantalla-yo.js`, `compartir.js`, `buscador-mapa.js`, `inicio.js`.
  Al añadir o quitar un archivo hay que tocar **tres sitios**: `index.html`, la lista `SHELL` de
  `sw.js` y subir `CACHE_VERSION` (si no, los que ya tengan la app instalada no ven el cambio).
- **Datos crudos extraídos de softline.golf:** `../../campos_softline.json` (en el Escritorio, carpeta "tarjeta golf"). 418 campos, 404 con tarjeta completa.

## Qué se hizo en la última sesión (7 mejoras)

1. **Metros de cada hoyo por barra.** El catálogo pasa de `tees = [nombre, slope, rating]` a
   `[nombre, slope, rating, [metros de los 18 hoyos]]` (404 campos, 2104 barras, todas con metros).
   Se ven en el editor del hoyo, en la barra del GPS, en la vista previa del campo (con selector de
   barra), en la cabecera de la ronda y como fila de la tarjeta apaisada. La ronda guarda su copia
   en `r.mts`; las rondas antiguas los recuperan del catálogo con `roundMetres()`.
2. **Histórico por hoyo.** `holeHistory()` y `holeAggregate()` en `comun.js`. Mientras juegas, una
   franja bajo el número del hoyo dice cuántas veces lo has jugado, tu media, la mejor y la última.
   En Rendimiento: tabla hoyo a hoyo del campo elegido (marcando el que más cuesta) o, sin filtro de
   campo, el ranking de los que peor y mejor se te dan.
3. **Hándicap WHS estimado.** Cada ronda guarda `sr`/`cr` (slope y rating de la barra) y de ahí sale
   el diferencial `(113/slope) × (golpes ajustados − CR)`, con tope de **doble bogey neto** por hoyo
   y los no jugados a par neto (mínimo 14 hoyos). El índice es la media de los mejores diferenciales
   de las últimas 20 rondas con la tabla oficial para menos de 20 (`WHS_TABLE`). Solo entran vueltas
   de 18 hoyos. Se ve en **Yo** (ficha propia, debajo de la de la RFEG), en la gráfica de evolución
   de Rendimiento, y se propone como índice al configurar la ronda si aún no hay ninguno guardado.
4. **Medir el golpe con el GPS.** Botón "Medir golpe": marca dónde has pegado, caminas hasta la bola
   y te da los metros en vivo. Si el golpe salió de la salida (≤ 45 m) se guarda como
   `holes[i].drive` y alimenta "Salida media" en el resumen, en Rendimiento y en la imagen compartida.
5. **Pantalla siempre encendida.** `keepAwake()` (Wake Lock API) durante la ronda y el GPS, con
   re-adquisición al volver de segundo plano. Se suelta al guardar o salir.
6. **Compartir la tarjeta como imagen.** `compartir.js` dibuja la tarjeta en un canvas (1080 px de
   ancho, sin librerías ni red) y la pasa a `navigator.share`; si el navegador no comparte archivos,
   descarga el PNG. Botón "Compartir tarjeta" en el resumen de la partida.
7. **Filtros en Rendimiento.** Chips de 5 / 10 / 20 / todas las rondas + selector de campo. La
   elección se recuerda en el perfil (`profile.rendN`, `profile.rendCourse`).

Comprobado en un Chrome sin ventana recorriendo todas las pantallas: sin errores de JavaScript.

## Posibles siguientes pasos (pendientes, sin prioridad fijada)

- [x] ~~Mostrar los metros por barra de color~~ → **hecho** (punto 1).
- [ ] Recuperar campos de **9 hoyos** (softline solo trae tarjetas de 18).
- [x] ~~Aplicar par real / stroke index a campos ya añadidos antes~~ → **hecho**: `migrateCourses()`.
- [x] ~~Convertir la app en PWA~~ → **hecho**: `manifest.json` + `sw.js` (app-shell atómico).
- [ ] Unificar la iconografía: aún conviven emoji (⛳ 📍 ⛱) con los iconos SVG de `sicon()`.
- [ ] Legibilidad a pleno sol: subir el contraste de `--muted` y el tamaño mínimo de texto.
- [ ] Diferencial de vueltas de **9 hoyos** para el hándicap (el WHS las combina de dos en dos).

## Cómo desplegar cambios

```bash
cd "/Users/lauramayoz/Desktop/tarjeta golf/tarjeta-golf-proyecto/tarjeta-golf-proyecto"
firebase deploy --only hosting --project tarjeta-golf-txiku
```
