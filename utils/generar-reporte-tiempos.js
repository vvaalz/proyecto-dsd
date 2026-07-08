const fs = require('fs');
const path = require('path');

const RUTA_JSON = path.join(__dirname, '..', 'reports', 'tiempos-ejecucion.json');
const RUTA_HTML = path.join(__dirname, '..', 'reports', 'reporte-tiempos.html');

// Mismos umbrales de rendimiento ya documentados en el proyecto (evaluarCargaPagina /
// evaluarAccion): >8000ms = hallazgo crítico (❌), >3000ms = lento (⚠️), si no, ✅.
const UMBRAL_FAIL_MS = 8000;
const UMBRAL_WARN_MS = 3000;

function clasificar(tiempoMs) {
  if (tiempoMs > UMBRAL_FAIL_MS) return { icono: '❌', clase: 'fail' };
  if (tiempoMs > UMBRAL_WARN_MS) return { icono: '⚠️', clase: 'warn' };
  return { icono: '✅', clase: 'pass' };
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function generarReporte() {
  if (!fs.existsSync(RUTA_JSON)) {
    console.log('⚠️ No existe ' + RUTA_JSON + ' — no hay registros de tiempos todavía. Ejecutá algún CP nuevo con registrarResultado() primero.');
    return;
  }

  const registros = JSON.parse(fs.readFileSync(RUTA_JSON, 'utf8'));
  if (!Array.isArray(registros) || registros.length === 0) {
    console.log('⚠️ El archivo de tiempos está vacío — nada que reportar.');
    return;
  }

  // ── Promedio de tiempo por módulo ──
  const porModulo = {};
  for (const r of registros) {
    if (!porModulo[r.modulo]) porModulo[r.modulo] = { suma: 0, cantidad: 0 };
    porModulo[r.modulo].suma += r.tiempoMs;
    porModulo[r.modulo].cantidad += 1;
  }
  const promediosPorModulo = Object.entries(porModulo)
    .map(([modulo, { suma, cantidad }]) => ({ modulo, promedio: Math.round(suma / cantidad), cantidad }))
    .sort((a, b) => b.promedio - a.promedio);

  // ── Top 10 CPs más lentos ──
  const top10Lentos = [...registros].sort((a, b) => b.tiempoMs - a.tiempoMs).slice(0, 10);

  // ── Totales generales ──
  const total = registros.length;
  const pasaron = registros.filter(r => r.estado === 'pass').length;
  const fallaron = registros.filter(r => r.estado === 'fail').length;
  const tiempoPromedioGeneral = Math.round(registros.reduce((acc, r) => acc + r.tiempoMs, 0) / total);
  const idsLentos = new Set(top10Lentos.map(r => r.timestamp + '|' + r.cp));

  const filasTodos = registros
    .slice()
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .map(r => {
      const { icono, clase } = clasificar(r.tiempoMs);
      const esLento = idsLentos.has(r.timestamp + '|' + r.cp);
      return `
      <tr class="${esLento ? 'destacado' : ''}">
        <td>${escapeHtml(r.cp)}</td>
        <td>${escapeHtml(r.modulo)}</td>
        <td><span class="badge ${r.estado === 'pass' ? 'pass' : 'fail'}">${r.estado === 'pass' ? 'PASS' : 'FAIL'}</span></td>
        <td>${r.tiempoMs.toLocaleString('es-CR')} ms ${icono}</td>
        <td>${new Date(r.timestamp).toLocaleString('es-CR')}</td>
      </tr>`;
    }).join('\n');

  const filasPromedio = promediosPorModulo.map(m => `
      <tr>
        <td>${escapeHtml(m.modulo)}</td>
        <td>${m.cantidad}</td>
        <td>${m.promedio.toLocaleString('es-CR')} ms</td>
      </tr>`).join('\n');

  const filasTop10 = top10Lentos.map((r, i) => {
    const { icono } = clasificar(r.tiempoMs);
    return `
      <tr class="destacado">
        <td>#${i + 1}</td>
        <td>${escapeHtml(r.cp)}</td>
        <td>${escapeHtml(r.modulo)}</td>
        <td>${r.tiempoMs.toLocaleString('es-CR')} ms ${icono}</td>
      </tr>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Reporte de tiempos de ejecución</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #1f2937; }
      h1 { color: #111827; }
      h2 { color: #111827; margin-top: 40px; }
      .summary { display: flex; gap: 16px; margin: 20px 0; flex-wrap: wrap; }
      .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 16px; background: #f9fafb; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { border: 1px solid #e5e7eb; padding: 8px 10px; text-align: left; font-size: 14px; }
      th { background: #f3f4f6; }
      .badge { display: inline-block; padding: 3px 8px; border-radius: 999px; font-weight: bold; font-size: 12px; }
      .pass { background: #dcfce7; color: #166534; }
      .fail { background: #fee2e2; color: #991b1b; }
      .destacado { background: #fef9c3; }
      .nota { color: #6b7280; font-size: 13px; }
    </style>
  </head>
  <body>
    <h1>Reporte de tiempos de ejecución</h1>
    <p>Generado el: ${new Date().toLocaleString('es-CR')}</p>
    <p class="nota">Umbrales de rendimiento (mismos que evaluarCargaPagina/evaluarAccion del proyecto, aplicados al tiempo total del CP): ✅ &le; ${UMBRAL_WARN_MS}ms | ⚠️ &gt; ${UMBRAL_WARN_MS}ms | ❌ &gt; ${UMBRAL_FAIL_MS}ms.</p>
    <p class="nota">Nota: este reporte solo incluye CPs que llaman a registrarResultado() (CP-146 en adelante) — CP-001 a CP-127 no están instrumentados.</p>

    <div class="summary">
      <div class="card"><strong>Total registros:</strong> ${total}</div>
      <div class="card"><strong>Pasaron:</strong> ${pasaron}</div>
      <div class="card"><strong>Fallaron:</strong> ${fallaron}</div>
      <div class="card"><strong>Tiempo promedio general:</strong> ${tiempoPromedioGeneral.toLocaleString('es-CR')} ms</div>
    </div>

    <h2>Top 10 CPs más lentos</h2>
    <table>
      <thead><tr><th>#</th><th>CP</th><th>Módulo</th><th>Tiempo</th></tr></thead>
      <tbody>${filasTop10}</tbody>
    </table>

    <h2>Promedio de tiempo por módulo</h2>
    <table>
      <thead><tr><th>Módulo</th><th>Cantidad de CPs</th><th>Promedio</th></tr></thead>
      <tbody>${filasPromedio}</tbody>
    </table>

    <h2>Todos los CPs registrados</h2>
    <table>
      <thead><tr><th>CP</th><th>Módulo</th><th>Estado</th><th>Tiempo</th><th>Fecha</th></tr></thead>
      <tbody>${filasTodos}</tbody>
    </table>
  </body>
</html>
`;

  fs.mkdirSync(path.dirname(RUTA_HTML), { recursive: true });
  fs.writeFileSync(RUTA_HTML, html, 'utf8');
  console.log('✅ Reporte generado en ' + RUTA_HTML + ' (' + total + ' registros)');
}

generarReporte();
