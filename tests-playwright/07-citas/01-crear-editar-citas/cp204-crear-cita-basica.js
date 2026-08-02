const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const URL_MODULO = `${BASE_URL}/reservation/reservation`;
const CLIENTE_BUSQUEDA = 'cliente prueba tarea 5';

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

async function dismissNotificationBanner(page) {
  await page.evaluate(() => {
    const d = document.getElementById('workshop-web-notification-permission-dismiss');
    if (d) d.click();
  });
  await page.waitForTimeout(300);
}

async function abrirFormularioCrearCita(page) {
  await page.waitForSelector('#btn_add_cita_new', { state: 'attached', timeout: 60000 });
  await page.waitForTimeout(1000);
  await dismissNotificationBanner(page);
  await page.evaluate(() => document.getElementById('btn_add_cita_new').click());
  await page.waitForTimeout(2500);
}

// El buscador de cliente de "Agendar Cita" NO es autocompletado al escribir: hay que
// llenar #clientSearchInput y clickear el botón "Buscar" propio del modal (escopar a
// .appointment-modal-container, porque hay otro botón "Buscar" global en el header).
// Los resultados reales son .client-search-result-item (POST searchClientsSchedule).
async function buscarYSeleccionarCliente(page, termino) {
  await page.fill('#clientSearchInput', termino);
  await page.waitForTimeout(300);
  const buscoOk = await page.evaluate(() => {
    const isVis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const modal = document.querySelector('.appointment-modal-container');
    if (!modal) return false;
    const btn = Array.from(modal.querySelectorAll('button')).filter(isVis).find(b => (b.textContent || '').trim() === 'Buscar');
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (!buscoOk) return false;
  await page.waitForTimeout(2000);
  return page.evaluate(() => {
    const isVis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const modal = document.querySelector('.appointment-modal-container');
    const item = Array.from(modal.querySelectorAll('.client-search-result-item')).filter(isVis)[0];
    if (!item) return false;
    item.click();
    return true;
  });
}

// El guardado real dispara POST /reservation/save_reservation (respuesta: el ID nuevo
// en texto plano, ej. "4351", NO un objeto JSON), e inmediatamente después la propia
// app dispara POST /reservation/view_reservation con el detalle completo (incluyendo
// "title") para mostrar la confirmación — es la señal más confiable de que la cita
// quedó creada con los datos correctos (el calendario en sí NO es útil para verificar:
// las celdas del mes/agenda muestran el NOMBRE DEL CLIENTE, nunca el "Asunto de la Cita").
function escucharGuardadoReservation(page, callbacks) {
  page.on('response', async (r) => {
    if (r.url().includes('/reservation/save_reservation') && r.request().method() === 'POST') {
      try {
        const id = parseInt((await r.text()).trim(), 10);
        if (!Number.isNaN(id)) callbacks.onSaved(id);
      } catch {}
    }
    if (r.url().includes('/reservation/view_reservation') && r.request().method() === 'POST') {
      try {
        const body = await r.json();
        if (body && body.reservation) callbacks.onViewed(body.reservation);
      } catch {}
    }
  });
}

async function cp204_crear_cita_basica() {
  console.log('🔄 Ejecutando CP-204: Crear cita básica en el módulo Citas...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;
  const tiempoInicioCP = Date.now();
  const tituloCita = 'CP-204-CITA-BASICA-' + Date.now();

  let reservationIdCreado = null;
  let reservationVista = null;

  try {
    const t0 = Date.now();
    ({ context, page } = await navegarAModulo(browser, context, URL_MODULO));
    await page.waitForSelector('#btn_add_cita_new', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(2000);
    evaluarCargaPagina(Date.now() - t0, 'Carga del módulo Citas');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('#btn_add_cita_new', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(2000);

    escucharGuardadoReservation(page, {
      onSaved: (id) => { reservationIdCreado = id; },
      onViewed: (reservation) => { reservationVista = reservation; }
    });

    await abrirFormularioCrearCita(page);

    await page.fill('#title_reservation', tituloCita);
    const clienteSeleccionado = await buscarYSeleccionarCliente(page, CLIENTE_BUSQUEDA);
    if (!clienteSeleccionado) throw new Error('No se pudo seleccionar el cliente "' + CLIENTE_BUSQUEDA + '" en el buscador de la cita');
    await page.waitForTimeout(800);

    const t1 = Date.now();
    await page.evaluate(() => document.getElementById('saveBtn').click());
    await page.waitForTimeout(3000);
    console.log('⏱ Guardar cita: ' + (Date.now() - t1) + 'ms');

    // ── VALIDACIONES ──
    const v1 = reservationIdCreado !== null;
    const v2 = reservationVista !== null && reservationVista.id === reservationIdCreado && (reservationVista.title || '').includes(tituloCita);
    console.log('\n📊 === VALIDACIONES CP-204 ===');
    console.log('  Guardado confirmado por red (save_reservation devuelve id): ' + (v1 ? '✅ (id=' + reservationIdCreado + ')' : '❌'));
    console.log('  view_reservation posterior confirma mismo id + título correcto: ' + (v2 ? '✅' : '❌ (título recibido="' + (reservationVista && reservationVista.title) + '")'));

    if (!v1) throw new Error('No se confirmó por red la creación de la cita (save_reservation no devolvió un id)');
    if (!v2) throw new Error('view_reservation no confirmó el mismo id/título tras guardar');

    console.log('✅ CP-204 PASSED | cita "' + tituloCita + '" creada (id=' + reservationIdCreado + ') y confirmada por el servidor | validaciones: 2/2');
    registrarResultado({ cp: 'CP-204', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: Date.now() - tiempoInicioCP });

  } catch (error) {
    await screenshotOnFail(page, 'cp204-fail');
    console.log('❌ CP-204 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-204', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp204_crear_cita_basica();
