const fs = require('fs');
const path = require('path');

const RUTA_JSON = path.join(__dirname, '..', 'reports', 'tiempos-ejecucion.json');

// Deriva el módulo/submódulo (ej. "01-facturar/09-ruteo-pos") a partir del __dirname
// del CP que llama a esta función.
function moduloDesdeRuta(dirname) {
  const partes = dirname.split(path.sep);
  const idx = partes.lastIndexOf('tests-playwright');
  if (idx === -1 || idx + 2 >= partes.length) return 'desconocido';
  return partes.slice(idx + 1, idx + 3).join('/');
}

// Agrega un registro al historial acumulado de tiempos de ejecución.
// datos: { cp: 'CP-146', modulo: '01-facturar/09-ruteo-pos', estado: 'pass'|'fail', tiempoMs: 12345 }
function registrarResultado({ cp, modulo, estado, tiempoMs }) {
  let registros = [];
  try {
    if (fs.existsSync(RUTA_JSON)) {
      const contenido = JSON.parse(fs.readFileSync(RUTA_JSON, 'utf8'));
      if (Array.isArray(contenido)) registros = contenido;
    }
  } catch {
    registros = [];
  }

  registros.push({
    cp,
    modulo,
    estado,
    tiempoMs,
    timestamp: new Date().toISOString()
  });

  fs.mkdirSync(path.dirname(RUTA_JSON), { recursive: true });
  fs.writeFileSync(RUTA_JSON, JSON.stringify(registros, null, 2), 'utf8');
}

module.exports = { registrarResultado, moduloDesdeRuta, RUTA_JSON };
