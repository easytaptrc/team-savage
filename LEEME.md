# Team Savage — App web (PWA + Firebase)

## Estructura

```
index.html            Página única (PWA instalable)
css/styles.css        Estilos (negro + plata, efectos 3D, animaciones)
js/firebase.js        Configuración de Firebase  ← aquí va la VAPID_KEY para push
js/ui.js              Utilidades, iconos, config por defecto, notificaciones, pase/QR
js/app.js             Router (#/, #/reserva, #/team, #/app, #/admin)
js/views/home.js      1. Inicio: logo 3D (Three.js), redes y botones RESERVA / TEAM
js/views/reserva.js   2. Reserva pública → pase con QR (wallet)
js/views/team.js      3. Login con ID + contraseña / crear contraseña
js/views/client.js    3b. Panel del socio (reservar, progreso, dieta, rutina, chat, reservas, perfil)
js/views/admin.js     4. Panel del coach
sw.js                 Service worker (offline + push)
firestore.rules       Reglas de seguridad
functions/            Cloud Function opcional para push con la app cerrada
```

## Puesta en marcha (una sola vez, en console.firebase.google.com → proyecto teamsavge-2eff8)

1. **Authentication → Método de acceso → Correo electrónico/contraseña → Habilitar.**
2. **Authentication → Usuarios → Agregar usuario** (cuenta del admin):
   - Correo: `sebas@teamsavage.app`
   - Contraseña: la del admin
   En la app el admin entra con usuario **sebas** (el `@teamsavage.app` se agrega solo).
   La contraseña NO está en el código, así nadie puede verla en el navegador.
3. **Firestore Database → Reglas** → pega el contenido de `firestore.rules` → Publicar.
4. Publicar la app (cualquiera de las dos):
   - Firebase Hosting: `npm i -g firebase-tools` → `firebase login` → `firebase deploy --only hosting,firestore`
   - O sube la carpeta a cualquier hosting estático con HTTPS (Netlify, Vercel, etc.).

Probar local: `npx http-server . -p 5173` y abrir http://localhost:5173

## Cómo funciona

- **Reserva (público):** nombre, celular, recomendado por, clase, fecha (calendario), hora (con cupo) y objetivo.
  Al confirmar se genera un pase con QR y código `TS-XXXXXX`: se descarga como imagen ("Guardar en wallet"),
  se puede agregar al calendario (.ics con alarma 1 h antes) y queda en "Mis pases" en ese teléfono.
- **Alta de socio:** el coach, al dar asistencia, crea al cliente (nombre + teléfono) → se genera el ID
  (`TS1001`, `TS1002`…) → botón para mandarlo por WhatsApp con el enlace para crear contraseña.
  También se puede crear el socio directo desde una reserva nueva (botón +).
- **Team:** la primera vez el socio toca "Crear contraseña", pone su ID y la contraseña 2 veces.
  Después entra con ID + contraseña.
- **Bloqueo:** en cada cliente se elige: nunca / 1 mes / 2 meses / N días sin venir. Al abrir el panel,
  el sistema bloquea automáticamente a quien pasó el límite. El coach puede reactivar, desactivar o
  bloquear manualmente, restablecer contraseña o eliminar al cliente.
- **Notificaciones:** campana en la app para admin y socios (nuevas reservas, mensajes de chat, cuenta activada,
  reserva confirmada/cancelada, rutina/dieta/progreso actualizados, pagos, avisos, recordatorio de vencimiento).
  Con la app abierta o en segundo plano llegan como notificación del teléfono.

### Notificaciones push con la app cerrada (opcional)
Requiere plan **Blaze** (pago por uso; el uso de un gym queda en la capa gratuita casi siempre):
1. Configuración del proyecto → Cloud Messaging → Certificados push web → **Generar par de claves**.
   Copia la clave en `VAPID_KEY` dentro de `js/firebase.js`.
2. `cd functions && npm install && cd .. && firebase deploy --only functions`

En iPhone las push web solo funcionan si la app se **instala** en la pantalla de inicio (iOS 16.4+).

## Seguimiento nutricional y fitness
- **Ficha completa al registrar al cliente:** datos generales (edad/fecha de nacimiento, sexo, contacto, emergencia),
  valoración inicial completa (estatura, peso, IMC automático, % grasa, masa muscular, grasa visceral, agua, masa ósea,
  edad metabólica, 9 perímetros, presión, FC y glucosa), objetivo, nivel de actividad,
  experiencia, servicio, salud (lesiones, enfermedades, medicamentos, alergias), hábitos y preferencias alimentarias.
  Las medidas iniciales quedan como primer registro del historial.
- **Progreso (coach y cliente):** peso, IMC con categoría, % grasa, masa muscular, grasa visceral, agua, masa ósea,
  edad metabólica, 9 perímetros, presión arterial, FC, glucosa, apego a dieta/entreno, energía, sueño, agua y pasos.
  Calcula masa grasa/magra, índice cintura-cadera, cintura-estatura, metabolismo basal (Mifflin-St Jeor),
  gasto diario y rango de peso saludable. Gráfica por métrica, tabla inicial vs actual, historial y fotos antes/ahora.
  Solo el coach registra y modifica el progreso; el cliente lo consulta.
- **Lo que el cliente puede modificar:** únicamente su foto de perfil, correo, celular y contacto/teléfono de emergencia.
- **Reserva pública:** pide nombre, fecha de nacimiento (la edad se calcula sola), correo, celular, teléfono de emergencia,
  servicio, fecha, hora y objetivo. Al crear el socio desde la reserva, esos datos pasan a su ficha.
- **Servicios:** Asesoría personal, Asesoría online y Asesoría presencial (editables en Configuración).

## Importar y exportar rutina / dieta
- **Exportar:** PDF (con logo), Excel, CSV, texto, copiar o enviar por WhatsApp. El cliente puede descargar su PDF/Excel.
- **Importar:** sube PDF, Excel/CSV, Word (.docx), .txt o una foto (OCR). Se convierte a texto, se puede editar y se
  reparte automáticamente por días (Lunes…Domingo / Día 1…7) o por comidas (Desayuno, Colación, Comida, Cena…).
  Los PDF escaneados (sin texto) deben subirse como imagen.

## Extras agregados
- Cupo por clase y horario (no se sobrevende), días cerrados, horarios configurables.
- Check-in escaneando el QR del pase (o escribiendo el código).
- Registro de pagos con vigencia de membresía, alertas de pagos vencidos y recordatorio automático al socio.
- Reportes: ingresos por día/método, reservas por clase y horario, clientes nuevos, más constantes,
  top recomendadores, comparación contra el mes anterior, exportar CSV.
- Plantillas de rutinas y dietas reutilizables.
- Avisos masivos al Team + mensajes rápidos por WhatsApp; clientes "en riesgo" (10+ días sin venir) y cumpleaños.
- Configuración: logo, colores (con presets), nombre, eslogan, WhatsApp, redes, clases, cupos, horarios, planes y precios.
- Instalable como app (PWA) y funciona sin conexión para lo ya visitado.

## Notas
- Las fotos de progreso y el logo se comprimen y se guardan en Firestore (no requiere Firebase Storage).
- "Eliminar cliente" borra sus datos; su cuenta de acceso queda inutilizable (no se puede reutilizar sin un ID nuevo).
- Apple/Google Wallet nativos requieren un servidor con certificados de Apple/Google; por eso el pase se guarda como imagen.
