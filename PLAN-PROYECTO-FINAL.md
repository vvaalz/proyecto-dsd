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
9. **Creación de producto** — cerrado (CP-201–CP-202, ver `CLAUDE_CONTEXT.md` sección 26).
10. **Proforma: retomar y facturar** — pausado por el bug de montos (sección 22 de `CLAUDE_CONTEXT.md`).
11. **Retroactualización de CP-001 a CP-127** (migrar al patrón moderno de sesión reutilizable/`config.js`) — al final del proyecto.
12. **Módulo "Ventas"** (Histórico de Ventas, Abono Cuentas por Cobrar, Lista de Cobros, Historial Mov. de Caja, Devoluciones, Nota de crédito) — cerrado dentro del alcance autorizado (CP-208–CP-210, CP-211–CP-213, 2026-08-01/02). Explorado en vivo: confirmado que el bug de montos de la sección 22 ya afecta registros PERSISTIDOS (facturas, devoluciones y notas de crédito reales, incluyendo el panel resumen agregado de Notas de Crédito con ₡57 mil millones acumulados) — no solo el carrito en vivo como se pensaba hasta CP-200. Por decisión del usuario, se cubrió con 6 CPs de **solo lectura** (navegación por menú + filtros + búsqueda de las 6 sub-pantallas), **sin validar ningún monto/cifra en ningún momento**. Ver `CLAUDE_CONTEXT.md` sección 27.
13. **Módulo "Citas"** — ✅ **CERRADO COMPLETO** (CP-204–CP-207, CP-214, 2026-08-01/02): ciclo completo de crear/ver/editar/cancelar una cita + asignar mecánico/recurrencia/estado, ver `CLAUDE_CONTEXT.md` sección 28. **Pausado por decisión del usuario** (2026-08-02, mismo criterio que el punto 10 y el punto 12): agregar servicios/productos a una cita (calcula Total Servicios/Productos/General igual que el carrito del POS) y el botón "Convertir a orden" (crea una orden de taller real desde la cita) — ambos dependen del mismo motor de precios ya confirmado corrupto, no se investiga más. Documentado como hallazgo/límite conocido (no como pendiente): vincular un vehículo nuevo a una cita (widget propio de marca/modelo) y los botones WhatsApp/Email del detalle (envío real a un canal externo, no ejercidos).

Ver `AUDITORIA-FLUJOS-2026-07-15.md` para el detalle de los gaps que originaron los puntos 6–10 y 13.
