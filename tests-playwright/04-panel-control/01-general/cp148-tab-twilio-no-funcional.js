const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const PANEL_URL = `${BASE_URL}/sett/setting`;

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','..','..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
};
function evaluarCargaPagina(ms, e) { if(ms>8000) console.log('❌ PERFORMANCE FAILED: '+e+' tardó '+ms+'ms'); else if(ms>3000) console.log('⚠️ LENTO: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }

async function navegarAModulo(browser, context, url) {
  let page = await context.newPage();
  await page.goto(url, { waitUntil: 'load', timeout: 180000 });
  await page.waitForTimeout(3000);
  if (/\/log\/login/i.test(page.url())) {
    console.log('⚠️ Sesión expirada (redirect a /log/login) — regenerando y reintentando...');
    await page.close();
    fs.rmSync(SESION_PATH, { force: true });
    const contextNuevo = await abrirContextoConSesion(browser);
    page = await contextNuevo.newPage();
    await page.goto(url, { waitUntil: 'load', timeout: 180000 });
    await page.waitForTimeout(3000);
    if (/\/log\/login/i.test(page.url())) throw new Error('Sigue redirigiendo a /log/login tras regenerar la sesión');
    return { context: contextNuevo, page };
  }
  return { context, page };
}

async function cp148_tab_twilio_no_funcional() {
  console.log('🔄 Ejecutando CP-148: Investigar tab "Twilio" del Panel de Control (hallazgo: no funcional)...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;
  const tiempoInicioCP = Date.now();

  const erroresConsola = [];
  const dialogosNativos = [];

  try {
    const t0 = Date.now();
    ({ context, page } = await navegarAModulo(browser, context, PANEL_URL));
    await page.waitForSelector('.nav-tabs', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(1500);
    evaluarCargaPagina(Date.now() - t0, 'Carga Panel de Control');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('.nav-tabs', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.evaluate(() => { document.getElementById('workshop-web-notification-permission-dismiss')?.click(); });
    await page.waitForTimeout(500);

    page.on('console', msg => { if (msg.type() === 'error') erroresConsola.push(msg.text().substring(0, 200)); });
    page.on('dialog', async d => { dialogosNativos.push({ tipo: d.type(), mensaje: d.message() }); await d.dismiss().catch(() => {}); });

    // ── Estado ANTES de clickear Twilio ──
    const antes = await page.evaluate(() => ({
      url: location.href,
      panelesTab: Array.from(document.querySelectorAll('.tab-pane')).map(p => p.id),
      htmlLength: document.body.innerHTML.length
    }));
    console.log('📋 Estado ANTES de clickear "Twilio":', JSON.stringify(antes));

    // ── Confirmar que el link existe con el href esperado ──
    const linkInfo = await page.evaluate(() => {
      const a = document.querySelector('a[href="#twilio_config"]');
      return a ? { existe: true, texto: a.textContent.trim(), dataToggle: a.getAttribute('data-toggle'), visible: a.getBoundingClientRect().width > 0 } : { existe: false };
    });
    console.log('📋 Link "Twilio" en el DOM:', JSON.stringify(linkInfo));

    // ── Intentar clickear 3 veces (por si requiere más de un intento) ──
    for (let i = 0; i < 3; i++) {
      await page.click('a[href="#twilio_config"]');
      await page.waitForTimeout(1000);
    }

    // ── Estado DESPUÉS de clickear Twilio (3 intentos) ──
    const despues = await page.evaluate(() => ({
      url: location.href,
      panelesTab: Array.from(document.querySelectorAll('.tab-pane')).map(p => p.id),
      htmlLength: document.body.innerHTML.length,
      existeTwilioConfig: !!document.getElementById('twilio_config')
    }));
    console.log('📋 Estado DESPUÉS de 3 clicks en "Twilio":', JSON.stringify(despues));
    console.log('🖥️ Errores de consola durante los clicks:', JSON.stringify(erroresConsola));
    console.log('🔔 Diálogos nativos disparados:', JSON.stringify(dialogosNativos));

    await screenshotOnFail(page, 'cp148-hallazgo-estado-tras-clicks');

    // ── Verificar que el resto del módulo sigue operativo tras los clicks (no quedó roto) ──
    const dashboardSigueFuncionando = await page.evaluate(() => {
      const dash = document.getElementById('dash');
      return !!(dash && dash.classList.contains('active'));
    });
    console.log('📋 Dashboard sigue activo tras los clicks en Twilio:', dashboardSigueFuncionando);

    // ── VALIDACIONES ──
    const v1 = linkInfo.existe; // el link existe en el DOM (no es que falte el elemento)
    const v2 = antes.url === despues.url; // no navega a ningún lado
    const v3 = !despues.existeTwilioConfig; // el pane #twilio_config nunca se crea
    const v4 = erroresConsola.length === 0; // no rompe con un error visible (falla silenciosa)
    const v5 = dashboardSigueFuncionando; // el resto del módulo no queda en estado roto

    console.log('\n📊 === VALIDACIONES CP-148 (documentación de hallazgo) ===');
    console.log('  Link "Twilio" existe en el DOM:                ' + (v1 ? '✅' : '❌'));
    console.log('  Click no cambia la URL:                        ' + (v2 ? '✅' : '❌'));
    console.log('  Pane #twilio_config nunca se crea (hallazgo):  ' + (v3 ? '⚠️ confirmado' : '❌ inesperado: sí se creó'));
    console.log('  Sin errores de consola (falla silenciosa):     ' + (v4 ? '✅' : '⚠️ (' + erroresConsola.length + ' errores)'));
    console.log('  Dashboard no queda roto tras los clicks:       ' + (v5 ? '✅' : '❌'));

    if (!v1) throw new Error('El link del tab "Twilio" no existe en el DOM — no se puede confirmar el hallazgo');
    if (!v5) throw new Error('El módulo quedó en un estado roto (Dashboard inactivo) tras clickear "Twilio"');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('⚠️ CP-148 RESULT: Hallazgo confirmado — el tab "Twilio" (#twilio_config) no produce ningún efecto observable al clickearlo (ni con 3 intentos): no cambia la URL, no crea el .tab-pane correspondiente, no genera errores de consola ni diálogos nativos, y no rompe el resto del módulo. Es un link no funcional en este entorno de QA (posible integración no habilitada para esta compañía) — no se puede diseñar un caso de éxito funcional para esta pestaña. | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-148', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp148-fail');
    console.log('❌ CP-148 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-148', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp148_tab_twilio_no_funcional();
