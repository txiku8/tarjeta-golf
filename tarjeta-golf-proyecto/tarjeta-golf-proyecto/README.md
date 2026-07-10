# Tarjeta de Golf — paquete del proyecto

- `public/index.html` — LA APP COMPLETA (un solo archivo, sin build ni dependencias).
  El catálogo de 411 campos de España y el mapa ya van embebidos dentro.
- `PROYECTO.md` — documentación completa para continuar el proyecto.
- `firebase.json`, `.firebaserc`, `firestore.rules` — config de despliegue Firebase.

## Ver la app ya
Abre `public/index.html` en el navegador (funciona en modo local, sin login).

## Desplegar
Con Firebase CLI logueado y acceso al proyecto (o cambiando `FB_CONFIG` en index.html por el tuyo):
    firebase deploy --only firestore:rules,hosting

Lee `PROYECTO.md` para el detalle (auth Google, modelo de datos, pendientes).
