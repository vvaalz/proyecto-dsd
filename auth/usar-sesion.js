const fs = require('fs');
const path = require('path');
const { generarSesion } = require('./generar-sesion');

const SESION_PATH = path.join(__dirname, 'sesion-qa.json');
const MAX_ANTIGUEDAD_MS = 2 * 60 * 60 * 1000; // 2 horas

function sesionVigente() {
  if (!fs.existsSync(SESION_PATH)) return false;
  const { mtime } = fs.statSync(SESION_PATH);
  return (Date.now() - mtime.getTime()) < MAX_ANTIGUEDAD_MS;
}

async function abrirContextoConSesion(browser) {
  if (!sesionVigente()) {
    console.log('🔐 Sesión ausente o vencida (>2h) — generando una nueva...');
    await generarSesion();
  } else {
    console.log('🔐 Reutilizando sesión vigente:', SESION_PATH);
  }

  const context = await browser.newContext({
    storageState: SESION_PATH,
    viewport: { width: 1440, height: 1200 }
  });
  return context;
}

async function refrescarConCacheLimpia(page) {
  const client = await page.context().newCDPSession(page);
  await client.send('Network.clearBrowserCache');
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await client.detach();
}

module.exports = { abrirContextoConSesion, sesionVigente, refrescarConCacheLimpia, SESION_PATH };
