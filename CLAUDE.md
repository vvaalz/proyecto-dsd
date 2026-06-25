# CLAUDE.md

Instrucciones operativas para el asistente en este repositorio. Para el contexto completo del proyecto (stack, URLs, credenciales de QA, convenciones detalladas, lista de casos de prueba) ver [CLAUDE_CONTEXT.md](CLAUDE_CONTEXT.md).

## Qué es este proyecto

Suite de pruebas automatizadas con Selenium WebDriver (Node.js) para el ERP TallerAlpha. Cada caso de prueba es un script standalone en `tests/cpNNN-descripcion.js`. No hay framework de test runner externo (Mocha/Jest); `tests/runner.js` es un runner casero que descubre y ejecuta los archivos.

## Reglas operativas

- No modificar casos de prueba ya marcados como pasando (✅ en README.md) sin confirmar primero con el usuario; son evidencia de QA ya entregada.
- Todo caso nuevo sigue el patrón `cpNNN-descripcion.js` / `cpNNN_descripcion()` (ver CLAUDE_CONTEXT.md secciones 3 y 4). Usar el skill `crear-caso-prueba` en vez de escribirlo a mano.
- No introducir frameworks nuevos (Mocha, Jest, Page Objects) sin que el usuario lo pida explícitamente. La migración mencionada en CLAUDE_CONTEXT.md sección 11 es una idea a futuro, no una tarea en curso.
- Mantener siempre `try/catch/finally` con `driver.quit()` en el `finally` en cualquier script que abra un driver de Selenium.
- Las credenciales de QA (`qadesignsoftcr@gmail.com` / `qa0000`) y la URL base (`https://dev.designsoftcr.com/qa_talleralpha/`) son fijas para este entorno de desarrollo. No hardcodear credenciales distintas sin confirmar con el usuario.
- Después de crear o modificar un caso, ejecutarlo individualmente (`node tests/cpNNN-....js`) antes de darlo por terminado. No asumir que pasa sin correrlo.
- Al agregar un caso nuevo, actualizar también la tabla de casos en `README.md` y en la sección 5 de `CLAUDE_CONTEXT.md` para que la documentación no quede desincronizada.
- `runner.js` descubre automáticamente cualquier archivo que matchee `cpNNN-*.js`; no hace falta registrar el caso en ningún otro lado.

## Skills disponibles

- `crear-caso-prueba` — genera un nuevo `cpNNN-descripcion.js` siguiendo el patrón estándar de la suite.
- `ejecutar-caso` — corre un caso individual y resume el resultado (PASS/FAIL).
- `ejecutar-suite` — corre `runner.js` sobre toda la suite y resume el reporte HTML.
- `inspeccionar-modulo` — genera un script `inspect-*.js` para descubrir selectores de una pantalla nueva antes de automatizarla.
