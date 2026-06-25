---
name: ejecutar-caso
description: Ejecuta un caso de prueba individual (cpNNN-descripcion.js) y muestra su resultado en consola. Usar cuando el usuario quiera correr, probar o verificar un caso específico sin ejecutar toda la suite.
---

# Ejecutar caso de prueba individual

## Pasos

1. **Identificar el archivo** a ejecutar — puede ser por número (CP-021) o descripción. Si hay ambigüedad, listar los archivos en `tests/cp*.js` y confirmar con el usuario.

2. **Ejecutar en la terminal:**
```bash
node tests/cpNNN-descripcion.js
```

3. **Interpretar el resultado:**
   - `✅ CP-NNN PASSED:` → el caso pasó, exit code 0
   - `❌ CP-NNN FAILED:` → el caso falló, exit code 1
   - Error de sintaxis o módulo → problema en el código, no en el sistema bajo prueba

4. **Si falla**, revisar:
   - ¿El sistema `dev.designsoftcr.com/qa_talleralpha` está disponible?
   - ¿Los selectores siguen siendo válidos? (usar skill `inspeccionar-modulo`)
   - ¿Cambió algún flujo del sistema?

## No hacer
- No correr el caso desde dentro de `tests/` — siempre desde la raíz del proyecto o con la ruta completa.
- No interpretar un FAILED como error del script sin revisar primero el estado del sistema.