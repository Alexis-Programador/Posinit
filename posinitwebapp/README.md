# POSInitWebApp — Administración de POS Init

Panel web **separado** de POS Init Web (caja y cobro). No sustituye la aplicación de Android/iOS ni la web de cajeros. Se conecta al **mismo proyecto Firebase `ventas-d8342`** usado en el ZIP Android suministrado.

## Acceso

Solo el propietario puede acceder: inicio de sesión por correo/contraseña de Firebase Auth y verificación de `usuarios/{auth.uid}` con campo `businessId`. Ninguna lista o escritura se ejecuta hasta superar esa verificación. Los datos no se almacenan en otra base: se utilizan `onSnapshot` de Firestore para actualizaciones en vivo. La **seguridad real** depende de las reglas de Firestore; no basta ocultar pantallas.

## Funciones de esta primera entrega

- Panel de resumen, ventas y stock bajo en tiempo real.
- Productos: listado y alta/edición de datos básicos mediante transacción y revisión de catálogo.
- Inventario: consultar y ajustar existencias; ofertas: consultar, crear y desactivar.
- Proveedores: consultar, agregar y editar.
- Historial de mercancía, robos, ventas, retiros, cortes y cierres: **solo lectura**.
- Reportes de ventas, exportación CSV, etiquetas imprimibles (imprimir / guardar como PDF).
- Usuarios de caja, trabajadores y roles: **solo lectura**.
- Configuración general compatible y datos SPEI por negocio.
- Perfil de negocio y recuperación de contraseña.

No se han portado todas las pantallas o funciones **nativas** de Android; están pendientes clientes locales Room, cobros nativos de Google Play, biometría, compras premium, ciertas ediciones de personal, y los diseños especiales de etiquetas. El backend de pagos Stripe y la contabilidad real no se modifican. No registra ventas ni cobra dinero. No crea permisos amplios ni cambia las reglas existentes.

## Usar en GitHub Pages dentro del repositorio Posinit

Se incluye en el directorio `posinitwebapp/` del repositorio original. El workflow principal hace dos compilaciones y coloca esta aplicación en `dist/posinitwebapp` **sin reemplazar** la app de punto de venta.

- POS Init Web (cajeros): `https://alexis-programador.github.io/Posinit/`
- POSInitWebApp (propietario): `https://alexis-programador.github.io/Posinit/posinitwebapp/`

Tras fusionar el PR de GitHub, verificar el resultado en GitHub Actions. En Firebase Authentication → Configuración → Dominios autorizados, verificar que el dominio de acceso esté permitido cuando Firebase Auth lo requiera. **Nunca compartir claves privadas** de Stripe ni credenciales de servicio en este frontend.

## Firebase Hosting (alternativa, no se debe publicar hasta seleccionar el proyecto correcto)

**Usar el mismo proyecto Firebase `ventas-d8342`**, no otro proyecto creado desde el asistente de Firebase Hosting. Antes de desplegar, asegurarse de no sobrescribir el sitio Hosting que ya esté publicado. Crear un sitio Hosting adicional para este panel cuando se desee un dominio separado; `firebase deploy --only hosting:<target>` se configura con ese sitio.

Antes de iniciar, en [Firebase Console](https://console.firebase.google.com/) asegúrate de abrir el proyecto **ventas-d8342**. No reutilices el sitio de otro proyecto: los datos no se sincronizarán.

Crea un segundo **sitio de Hosting dentro de ventas-d8342**. El identificador del sitio debe ser único en Firebase (puedes llamarlo `posinitwebapp-<sufijo>`). No despliegues sobre el sitio principal del negocio.

Desde PowerShell, en la raíz del repositorio `Posinit`:

```powershell
npm ci
npm install -g firebase-tools
firebase login
$env:VITE_DEPLOY_TARGET = "firebase"
npx vite build --config posinitwebapp/vite.config.js
Remove-Item Env:VITE_DEPLOY_TARGET
cd posinitwebapp
firebase hosting:sites:create NOMBRE_UNICO_DEL_SITIO --project ventas-d8342
firebase target:apply hosting posinitwebapp NOMBRE_UNICO_DEL_SITIO --project ventas-d8342
firebase deploy --only hosting:posinitwebapp --project ventas-d8342
```

La opción `target` evita sustituir accidentalmente el Hosting principal. No uses `firebase deploy` sin especificar el destino. Si Firebase Console ya tiene un segundo sitio adecuado, omite `hosting:sites:create` y aplica el target a ese ID.

Los nombres `NOMBRE_UNICO_DEL_SITIO` son marcadores: reemplázalos por el ID real que Firebase asigne al sitio secundario. **No se ha realizado un despliegue desde este ZIP.**

## Desarrollo local (desde la raíz de Posinit)

```powershell
npm ci
npx vite --config posinitwebapp/vite.config.js
```

## Advertencias operativas

La primera entrega debe probarse con el emulador de Firebase o una cuenta de prueba antes de alterar inventario y catálogo de un negocio real. Las reglas de Firestore pueden estar desincronizadas con el repositorio; hay que verificar las publicadas en Firebase Console. Los listeners en vivo generan lecturas y se sujetan a cuotas del plan Spark.
