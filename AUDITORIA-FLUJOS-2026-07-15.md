# Auditoría de flujos vs. cobertura de CPs — 2026-07-15

Cruce de decenas de flujos de negocio del sistema TallerAlpha contra los CPs existentes en ese momento, para identificar gaps de cobertura antes de la entrega final (~15/08/2026).

## Gaps principales encontrados

1. **Retomar una proforma existente y facturarla** — el gap más grande. Bloqueado desde el 19/07/2026 por el hallazgo crítico de corrupción de montos en el carrito del POS (`CLAUDE_CONTEXT.md` sección 22); el bloque queda pausado hasta que el ambiente se confirme corregido.
2. **Creación de cliente completo** desde el POS (más allá del atajo de nombre rápido) — cubierto CP-193, CP-195, CP-197–CP-199 (ver `CLAUDE_CONTEXT.md` sección 25).
3. **Creación de producto en el catálogo** (módulo Inventario, `/prod/product`) — cubierto CP-201–CP-202 (ver `CLAUDE_CONTEXT.md` sección 26).
4. **Combos multi-tipo de producto en un carrito** (normal + rápido + fraccionado + servicio juntos) — nunca antes probado junto; CP-200 documenta el hallazgo (el bug de montos de la sección 22 afecta también este escenario) sin llegar a un CP de cobertura "feliz".
5. **Tab "Tienda en línea" del POS** — ya resuelto (CP-196, ver `CLAUDE_CONTEXT.md` sección 24).
6. **Acciones en lote de Ruteo** (tablero dentro del POS) — ya resuelto (CP-183–CP-192, ver `CLAUDE_CONTEXT.md` sección 15).
7. **Taller — vista de orden** — en curso.

## Cómo usar este documento

Cada gap resuelto queda documentado en detalle en la sección correspondiente de `CLAUDE_CONTEXT.md` (selectores, hallazgos técnicos, estado de implementación). Ver `PLAN-PROYECTO-FINAL.md` para la priorización general del proyecto.
