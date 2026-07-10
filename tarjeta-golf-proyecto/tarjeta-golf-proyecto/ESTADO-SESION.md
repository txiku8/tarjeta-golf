# Estado del proyecto — punto de retomada

_Última sesión: 2026-07-09_

## Dónde está todo

- **App en producción (tu cuenta):** https://tarjeta-golf-txiku.web.app
- **Proyecto Firebase:** `tarjeta-golf-txiku` (cuenta **txiku8@gmail.com**). Hosting + Firestore (Europa, `europe-west1`) + login Google, todo operativo.
- **La app entera** sigue siendo un único archivo: `public/index.html`.
- **Backup previo al cambio de catálogo:** `index.html.bak` (en la raíz del proyecto, fuera de `public/`).
- **Datos crudos extraídos de softline.golf:** `../../campos_softline.json` (en el Escritorio, carpeta "tarjeta golf"). 418 campos, 404 con tarjeta completa.

## Qué se hizo en la última sesión

1. Se traspasó el proyecto a la cuenta de Firebase propia (txiku8). Ver `PROYECTO.md` (actualizado).
2. Se reemplazó el catálogo de campos por los **404 campos de softline.golf**, con:
   - **par real por hoyo** (antes era plantilla),
   - **stroke index (índice de dificultad) por hoyo** — se muestra en cada tarjeta de hoyo,
   - metros por barra de salida y slope/rating **guardados en el JSON** (aún no mostrados en la app).
3. Se recalcularon los conteos por provincia del mapa.
4. Se arregló el mapa que salía negro en navegadores sin `color-mix()` (ahora color calculado en JS).
5. Se desplegó a producción.

## Posibles siguientes pasos (pendientes, sin prioridad fijada)

- [ ] **Mostrar los metros por barra de color** en la app (datos ya en `campos_softline.json`).
- [ ] Recuperar campos de **9 hoyos** (softline solo trae tarjetas de 18).
- [x] ~~Aplicar par real / stroke index a campos ya añadidos antes~~ → **hecho**: `migrateCourses()` cruza cada campo con `GOLF_CATALOG` por nombre y aplica `pars` real + `si` a los campos sin `si` (los de antes del cambio) con el mismo nº de hoyos. Corre al arrancar y tras cada snapshot de la nube (re-sube corregido). Pendiente de desplegar.
- [ ] Convertir la app en **PWA** (instalable en móvil + offline al abrir).

## Cómo desplegar cambios

```bash
cd "/Users/lauramayoz/Desktop/tarjeta golf/tarjeta-golf-proyecto/tarjeta-golf-proyecto"
firebase deploy --only hosting --project tarjeta-golf-txiku
```
