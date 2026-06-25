# Proyecto DSD — Suite de Pruebas Automatizadas con Selenium

## Información del Proyecto
- **Estudiante:** Valentina Varela Zumbado
- **Empresa:** Design and Software Development S.A.
- **Universidad:** Universidad Latina
- **Sistema probado:** TallerAlpha ERP

## Descripción
Suite de pruebas automatizadas desarrollada en JavaScript con Selenium WebDriver para garantizar la calidad del sistema web TallerAlpha ERP.

## Tecnologías utilizadas
- Node.js
- Selenium WebDriver
- JavaScript
- Google Chrome

## Instalación
1. Instalar Node.js desde https://nodejs.org
2. Clonar o descargar el proyecto
3. Abrir la terminal en la carpeta del proyecto
4. Ejecutar: npm install

## Cómo ejecutar las pruebas

### Ejecutar un caso de prueba individual
```bash
node tests/cp001-login-valido.js
node tests/cp002-login-invalido.js
node tests/cp003-campos-vacios.js
node tests/cp004-usuario-inexistente.js
node tests/cp005-carga-dashboard.js
node tests/cp006-acceso-recepcion-vehiculo.js
node tests/cp007-agregar-cliente-nuevo.js
node tests/cp008-asignar-mecanico-servicio.js
node tests/cp009-modal-confirmacion-guardar.js
node tests/cp010-cancelar-generacion-orden.js
node tests/cp017-carga-tablero-ordenes.js
node tests/cp018-buscar-orden-tablero.js
node tests/cp019-crear-seccion-tablero.js
node tests/cp020-avanzar-orden-siguiente-etapa.js
node tests/cp011-whatsapp-modal-orden.js
node tests/cp012-buscar-orden-placa.js
node tests/cp013-buscar-orden-nombre-cliente.js
node tests/cp014-cambiar-vista-lista-caja.js
node tests/cp015-cambiar-sucursal-selector.js
node tests/cp016-chat-interno-orden.js
```

## Casos de prueba implementados

| Código | Descripción | Estado |
|--------|-------------|--------|
| CP-001 | Login con credenciales válidas | ✅ |
| CP-002 | Login con contraseña incorrecta | ✅ |
| CP-003 | Login con campos vacíos | ✅ |
| CP-004 | Login con usuario inexistente | ✅ |
| CP-005 | Carga del dashboard | ✅ |
| CP-006 | Acceso al módulo de Recepción de Vehículo | ✅ |
| CP-007 | Agregar cliente nuevo con solo el nombre | ⚠️ |
| CP-008 | Asignar mecánico al agregar un servicio | ✅ |
| CP-009 | Modal de confirmación al guardar la recepción | ⚠️ |
| CP-010 | Cancelar la generación de orden regresa a la recepción | ✅ |
| CP-017 | Cargar el tablero de órdenes y mostrar el buscador | ✅ |
| CP-018 | Buscar órdenes desde el tablero | ⚠️ |
| CP-019 | Crear una nueva sección en el tablero | ✅ |
| CP-020 | Interactuar con el botón de configuración del tablero | ✅ |
| CP-011 | Modal de WhatsApp al generar la orden | ⚠️ |
| CP-012 | Búsqueda de órdenes por placa | ⚠️ |
| CP-013 | Búsqueda de órdenes por nombre de cliente | ⚠️ |
| CP-014 | Cambio de vista de lista a caja | ✅ |
| CP-015 | Cambio de sucursal desde el selector | ✅ |
| CP-016 | Chat interno de una orden | ⚠️ |
| CP-026 | Descargar PDF de una orden desde el menú de tres puntos (Recepción) | ✅ |
| CP-027 | Ver orden online desde Opciones avanzadas del menú de tres puntos | ✅ |
| CP-028 | Ver bitácora de una orden desde Opciones avanzadas | ✅ |
| CP-029 | Desactivar una orden de prueba desde Opciones avanzadas | ✅ |
| CP-030 | Eliminar una orden de prueba desde Opciones avanzadas | ✅ |