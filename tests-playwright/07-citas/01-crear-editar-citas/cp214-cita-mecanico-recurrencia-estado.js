const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const URL_MODULO = `${BASE_URL}/reservation/reservation`;
const CLIENTE_BUSQUEDA = 'cliente prueba tarea 5';
const MECANICO_VALOR = '321'; // "valentina mecanico prueba" — mecánico de prueba ya usado en otras partes del proyecto
const RECURRENCIA_VALOR = '1'; // Semanal
const ESTADO_VALOR = '2'; // Suspensión — probado en exploración que persiste correctamente vía red

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

function expandirSeccion(page, texto) {
  return page.evaluate((t) => {
    const isVis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const el = Array.from(document.querySelectorAll('*')).filter(isVis).find(e => e.children.length <= 2 && (e.textContent || '').trim() === t);
    if (!el) return false;
    const clickable = el.closest('[class*="accordion"], [class*="collaps"], .card-header, div');
    (clickable || el).click();
    return true;
  }, texto);
}

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

function setSelectValor(page, id, valor) {
  return page.evaluate(({ id, valor }) => {
    const sel = document.getElementById(id);
    if (!sel) return false;
    sel.value = valor;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return sel.value === valor;
  }, { id, valor });
}

function escucharReservation(page, callbacks) {
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

function horaUnicaHHMM() {
  const ahora = new Date();
  const minutosDesdeMedianoche = ahora.getHours() * 60 + ahora.getMinutes();
  const offset = (Date.now() % 180) + 1;
  const totalMin = (minutosDesdeMedianoche + offset) % (22 * 60);
  const hh = Math.floor(totalMin / 60).toString().padStart(2, '0');
  const mm = (totalMin % 60).toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

async function cp214_cita_mecanico_recurrencia_estado() {
  console.log('🔄 Ejecutando CP-214: Crear cita con mecánico asignado, recurrencia y estado...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;
  const tiempoInicioCP = Date.now();
  const tituloCita = 'CP-214-CITA-MECANICO-' + Date.now();
  const horaInicio = horaUnicaHHMM();

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

    escucharReservation(page, {
      onSaved: (id) => { reservationIdCreado = id; },
      onViewed: (reservation) => { reservationVista = reservation; }
    });

    await abrirFormularioCrearCita(page);
    await page.fill('#title_reservation', tituloCita);
    await page.fill('#start_schedule_reservation', horaInicio);

    const clienteSeleccionado = await buscarYSeleccionarCliente(page, CLIENTE_BUSQUEDA);
    if (!clienteSeleccionado) throw new Error('No se pudo seleccionar el cliente "' + CLIENTE_BUSQUEDA + '"');
    await page.waitForTimeout(800);

    // ── Recurrencia: Asignar a (mecánico) + Recurrencia + Estado ──
    await expandirSeccion(page, 'Recurrencia');
    await page.waitForTimeout(800);
    const mecanicoOk = await setSelectValor(page, 'assigned_to_reservation', MECANICO_VALOR);
    const recurrenciaOk = await setSelectValor(page, 'recurrence_reservation', RECURRENCIA_VALOR);
    const estadoOk = await setSelectValor(page, 'status_reservation', ESTADO_VALOR);
    if (!mecanicoOk) throw new Error('No se pudo asignar el mecánico (assigned_to_reservation)');
    if (!recurrenciaOk) throw new Error('No se pudo asignar la recurrencia (recurrence_reservation)');
    if (!estadoOk) throw new Error('No se pudo asignar el estado (status_reservation)');
    await page.waitForTimeout(500);

    const t1 = Date.now();
    await page.evaluate(() => document.getElementById('saveBtn').click());
    await page.waitForTimeout(3000);
    console.log('⏱ Guardar cita: ' + (Date.now() - t1) + 'ms');

    // ── VALIDACIONES ──
    // La propia app dispara automáticamente view_reservation justo después de guardar (ver sección 28
    // de CLAUDE_CONTEXT.md) — su respuesta ya trae assigned_to/recurrence_reservation/status_reservation
    // con los datos reales persistidos.
    const v1 = reservationIdCreado !== null && reservationVista !== null && reservationVista.id === reservationIdCreado;
    const v2 = reservationVista && reservationVista.assigned_to === parseInt(MECANICO_VALOR, 10)
      && String(reservationVista.recurrence_reservation) === RECURRENCIA_VALOR
      && String(reservationVista.status_reservation) === ESTADO_VALOR;
    console.log('\n📊 === VALIDACIONES CP-214 ===');
    console.log('  Guardado confirmado por red (mismo id en view_reservation): ' + (v1 ? '✅ (id=' + reservationIdCreado + ')' : '❌'));
    console.log('  Mecánico/Recurrencia/Estado persisten (assigned_to=' + (reservationVista && reservationVista.assigned_to) + ', recurrence=' + (reservationVista && reservationVista.recurrence_reservation) + ', status=' + (reservationVista && reservationVista.status_reservation) + '): ' + (v2 ? '✅' : '❌'));

    if (!v1) throw new Error('No se confirmó por red la creación de la cita');
    if (!v2) throw new Error('Mecánico/Recurrencia/Estado no persistieron correctamente en la respuesta del servidor');

    console.log('✅ CP-214 PASSED | cita (id=' + reservationIdCreado + ') con mecánico/recurrencia/estado asignados y verificados | validaciones: 2/2');
    registrarResultado({ cp: 'CP-214', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: Date.now() - tiempoInicioCP });

  } catch (error) {
    await screenshotOnFail(page, 'cp214-fail');
    console.log('❌ CP-214 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-214', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp214_cita_mecanico_recurrencia_estado();
