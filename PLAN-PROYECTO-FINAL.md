# Plan de proyecto final — proyecto-dsd

Entrega: **~15/08/2026**.

Prioridades del proyecto, en orden:

1. **Panel de Control** — cerrado (CP-146–CP-176).
2. **Ruteo** — cerrado (CP-128–CP-145, CP-183–CP-192).
3. **Productos Externos** — cerrado (CP-177–CP-182).
4. **Demo de defensa** — Bloques 1 y 2 cerrados (CP-194). Bloques 3 (Facturación POS) y 4 (Cierre de caja) bloqueados por el bug de montos (`CLAUDE_CONTEXT.md` sección 22).
5. **Tienda en línea POS** — cerrado (CP-196).
6. **Creación de clientes** — en curso (CP-193, CP-195, CP-197–CP-199).
7. **Importar Factura** — en curso.
8. **Taller — vista de orden** — en curso.
9. **Creación de producto** — en curso (CP-201–CP-202, ver `CLAUDE_CONTEXT.md` sección 26).
10. **Proforma: retomar y facturar** — pausado por el bug de montos (sección 22 de `CLAUDE_CONTEXT.md`).
11. **Retroactualización de CP-001 a CP-127** (migrar al patrón moderno de sesión reutilizable/`config.js`) — al final del proyecto.
12. **Módulo "Ventas"** (Histórico de Ventas, Abono Cuentas por Cobrar, Lista de Cobros, Historial Mov. de Caja, Devoluciones, Nota de crédito) — 🔴 **bloqueado** (2026-08-01): explorado en vivo, confirmado que el bug de montos de la sección 22 ya afecta registros PERSISTIDOS (facturas, devoluciones y notas de crédito reales, incluyendo el panel resumen agregado de Notas de Crédito con ₡57 mil millones acumulados) — no solo el carrito en vivo como se pensaba hasta CP-200. Ningún CP escrito, pendiente de decisión del usuario sobre cómo proceder. Ver `CLAUDE_CONTEXT.md` sección 27.

Ver `AUDITORIA-FLUJOS-2026-07-15.md` para el detalle de los gaps que originaron los puntos 6–10.
