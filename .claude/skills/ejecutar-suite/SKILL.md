---
name: ejecutar-suite
description: Ejecuta todos los casos de prueba de la suite con runner.js y genera el reporte HTML en reports/reporte-pruebas.html. Usar cuando el usuario quiera correr todas las pruebas o generar el reporte completo.
---

# Ejecutar suite completa

## Cómo funciona el runner

- Lee todos los archivos `cp\d{3}-*.js` de la carpeta `tests/` en orden alfabético
- Los ejecuta uno por uno con `spawnSync` (secuencial, no paralelo)
- Captura stdout/stderr de cada caso
- Determina PASS si exit code = 0, FAIL si exit code = 1
- Genera `reports/reporte-pruebas.html` con resumen y tabla de resultados
- Exit code del runner = 1 si algún caso falló

## Pasos

1. **Ejecutar desde la raíz del proyecto:**
```bash
node tests/runner.js
```

2. **Monitorear la consola** — verás:
```
🚀 Iniciando ejecución de la suite de pruebas...
===== Ejecutando cpNNN-descripcion.js =====
✅/❌ CP-NNN PASSED/FAILED: ...
===== Resumen de resultados =====
Total: N | Pasaron: N | Fallaron: N
Reporte HTML generado en: .../reports/reporte-pruebas.html
```

3. **Ver el reporte HTML** — abrir en el navegador:
```bash
start reports/reporte-pruebas.html
```

4. **Si hay fallos masivos**, verificar primero que el sistema bajo prueba esté disponible antes de revisar cada caso individualmente.

## No hacer
- No ejecutar `runner.js` desde dentro de `tests/` — los paths se rompen.
- No interrumpir la ejecución a mitad — cada caso abre y cierra Chrome, es normal que tarde.