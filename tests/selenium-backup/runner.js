const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const testsDir = __dirname;
const reportDir = path.join(projectRoot, 'reports');
const reportFile = path.join(reportDir, 'reporte-pruebas.html');

function getTestFiles() {
  return fs.readdirSync(testsDir)
    .filter((file) => /^cp\d{3}-.*\.js$/.test(file) && file !== 'runner.js')
    .sort()
    .map((file) => path.join(testsDir, file));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function writeHtmlReport(summary) {
  fs.mkdirSync(reportDir, { recursive: true });

  const rows = summary.tests.map((test) => {
    const statusClass = test.status === 'PASS' ? 'pass' : 'fail';
    return `
      <tr>
        <td>${escapeHtml(test.file)}</td>
        <td><span class="badge ${statusClass}">${escapeHtml(test.status)}</span></td>
      </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Reporte de pruebas Selenium</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #1f2937; }
      h1 { color: #111827; }
      .summary { display: flex; gap: 16px; margin: 20px 0; }
      .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 16px; background: #f9fafb; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { border: 1px solid #e5e7eb; padding: 10px; text-align: left; }
      th { background: #f3f4f6; }
      .badge { display: inline-block; padding: 4px 8px; border-radius: 999px; font-weight: bold; }
      .pass { background: #dcfce7; color: #166534; }
      .fail { background: #fee2e2; color: #991b1b; }
    </style>
  </head>
  <body>
    <h1>Reporte de pruebas Selenium</h1>
    <p>Generado el: ${escapeHtml(summary.generatedAt)}</p>

    <div class="summary">
      <div class="card"><strong>Total:</strong> ${summary.total}</div>
      <div class="card"><strong>Pasaron:</strong> ${summary.passed}</div>
      <div class="card"><strong>Fallaron:</strong> ${summary.failed}</div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Prueba</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </body>
</html>`;

  fs.writeFileSync(reportFile, html, 'utf8');
}

function main() {
  const testFiles = getTestFiles();

  if (testFiles.length === 0) {
    console.log('No se encontraron archivos de prueba para ejecutar.');
    process.exit(0);
  }

  let passed = 0;
  let failed = 0;
  const results = [];

  console.log('🚀 Iniciando ejecución de la suite de pruebas...');

  for (const testFile of testFiles) {
    const fileName = path.basename(testFile);
    console.log(`\n===== Ejecutando ${fileName} =====`);

    const result = spawnSync(process.execPath, [testFile], {
      cwd: projectRoot,
      encoding: 'utf8'
    });

    if (result.stdout) {
      process.stdout.write(result.stdout);
    }

    if (result.stderr) {
      process.stderr.write(result.stderr);
    }

    const status = result.status === 0 ? 'PASS' : 'FAIL';
    if (result.status === 0) {
      passed += 1;
    } else {
      failed += 1;
    }

    results.push({ file: fileName, status });
  }

  const summary = {
    generatedAt: new Date().toLocaleString('es-CR'),
    total: results.length,
    passed,
    failed,
    tests: results
  };

  writeHtmlReport(summary);

  console.log('\n===== Resumen de resultados =====');
  console.log(`Total de pruebas: ${summary.total}`);
  console.log(`Pasaron: ${summary.passed}`);
  console.log(`Fallaron: ${summary.failed}`);

  results.forEach((item) => {
    console.log(`- ${item.file}: ${item.status}`);
  });

  console.log(`\nReporte HTML generado en: ${reportFile}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();
