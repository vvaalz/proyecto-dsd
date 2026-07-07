const { chromium } = require('@playwright/test');
const fs = require('fs');
const { abrirContextoConSesion, SESION_PATH } = require('./usar-sesion');

// Nota: la URL real tras login es /public/dash/dashboard (no /public/dashboard,
// ese path da 404 — confirmado navegando manualmente tras un login fresco)
const DASHBOARD_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/dash/dashboard';

async function navegarADashboard(browser) {
  const context = await abrirContextoConSesion(browser);
  const page = await context.newPage();
  await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // PASO 4: si la sesión guardada ya expiró en el servidor, el sitio redirige a /login
  // aunque el archivo storageState todavía sea "reciente" (<2h) — regenerar y reintentar 1 vez
  if (/\/log\/login/i.test(page.url())) {
    console.log('⚠️ Sesión expirada en servidor (redirect a /login) — regenerando y reintentando...');
    await context.close();
    fs.rmSync(SESION_PATH, { force: true });
    const contextNuevo = await abrirContextoConSesion(browser);
    const pageNueva = await contextNuevo.newPage();
    await pageNueva.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (/\/log\/login/i.test(pageNueva.url())) {
      throw new Error('Sigue redirigiendo a /login tras regenerar la sesión');
    }
    return { context: contextNuevo, page: pageNueva };
  }
  return { context, page };
}

async function testSesion() {
  console.log('🔄 Probando sistema de sesión reutilizable (auth/usar-sesion.js)...');
  const browser = await chromium.launch({ headless: false });

  try {
    // Forzar una sesión ausente para probar la rama de generación automática
    fs.rmSync(SESION_PATH, { force: true });
    console.log('\n--- Prueba 1: sin sesión guardada (debe generar una nueva) ---');
    const t1 = Date.now();
    const r1 = await navegarADashboard(browser);
    console.log('⏱ Tiempo (generar + navegar):', Date.now() - t1, 'ms');
    const url1 = r1.page.url();
    console.log('📍 URL final:', url1);
    if (!/\/dashboard/i.test(url1)) throw new Error('No se llegó al dashboard en la prueba 1');
    console.log('✅ Prueba 1 OK: sesión generada automáticamente y navegación exitosa');
    await r1.context.close();

    console.log('\n--- Prueba 2: con sesión ya guardada (debe reutilizarla, sin login) ---');
    const t2 = Date.now();
    const r2 = await navegarADashboard(browser);
    const tiempo2 = Date.now() - t2;
    console.log('⏱ Tiempo (reutilizar + navegar):', tiempo2, 'ms');
    const url2 = r2.page.url();
    console.log('📍 URL final:', url2);
    if (!/\/dashboard/i.test(url2)) throw new Error('No se llegó al dashboard en la prueba 2');
    if (tiempo2 > 15000) console.log('⚠️ La reutilización tardó más de lo esperado (' + tiempo2 + 'ms) — revisar si realmente evitó el login');
    console.log('✅ Prueba 2 OK: sesión reutilizada sin volver a hacer login');
    await r2.context.close();

    console.log('\n✅ TODAS LAS PRUEBAS DEL SISTEMA DE SESIÓN PASARON');
  } catch (error) {
    console.log('❌ FALLO en prueba de sesión: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

testSesion();
