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

function horaUnicaHHMM(offsetExtra) {
  const ahora = new Date();
  const minutosDesdeMedianoche = ahora.getHours() * 60 + ahora.getMinutes();
  const offset = (Date.now() % 180) + 1 + (offsetExtra || 0);
  const totalMin = (minutosDesdeMedianoche + offset) % (22 * 60);
  const hh = Math.floor(totalMin / 60).toString().padStart(2, '0');
  const mm = (totalMin % 60).toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

async function crearCitaDescartable(page, tituloCita, horaInicio) {
  await abrirFormularioCrearCita(page);
  await page.fill('#title_reservation', tituloCita);
  await page.fill('#start_schedule_reservation', horaInicio);
  const clienteSeleccionado = await buscarYSeleccionarCliente(page, CLIENTE_BUSQUEDA);
  if (!clienteSeleccionado) throw new Error('No se pudo seleccionar el cliente "' + CLIENTE_BUSQUEDA + '" al crear la cita descartable');
  await page.waitForTimeout(800);
  await page.evaluate(() => document.getElementById('saveBtn').click());
  await page.waitForTimeout(3000);
}

function irAVistaAgenda(page) {
  return page.evaluate(() => {
    const isVis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(b => b.className.includes('fc-listWeek-button'));
    if (btn) { btn.click(); return true; }
    return false;
  });
}

async function abrirDetallePorHora(page, horaInicio) {
  await irAVistaAgenda(page);
  await page.waitForTimeout(2500);
  return page.evaluate((hora) => {
    const isVis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const fila = Array.from(document.querySelectorAll('.fc-list-item')).filter(isVis).find(f => (f.textContent || '').includes(hora));
    if (!fila) return false;
    fila.click();
    return true;
  }, horaInicio);
}

function clickBotonPorTexto(page, texto) {
  return page.evaluate((t) => {
    const isVis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const btn = Array.from(document.querySelectorAll('button, a')).filter(isVis).find(b => (b.textContent || '').trim() === t);
    if (btn) { btn.click(); return true; }
    return false;
  }, texto);
}

async function cp206_editar_cita() {
  console.log('🔄 Ejecutando CP-206: Editar una cita existente en el módulo Citas...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;
  const tiempoInicioCP = Date.now();
  const tituloOriginal = 'CP-206-ORIGINAL-' + Date.now();
  const tituloEditado = 'CP-206-EDITADO-' + Date.now();
  const horaOriginal = horaUnicaHHMM(0);
  const horaEditada = horaUnicaHHMM(181); // desplazado para no chocar con la original

  let reservationIdCreado = null;
  let ultimaReservationVista = null;

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
      onViewed: (reservation) => { ultimaReservationVista = reservation; }
    });

    await crearCitaDescartable(page, tituloOriginal, horaOriginal);
    if (reservationIdCreado === null) throw new Error('No se pudo crear la cita descartable de prueba para este CP');
    const idOriginal = reservationIdCreado;

    // ── Abrir detalle y editar ──
    await refrescarConCacheLimpia(page);
    await page.waitForSelector('#btn_add_cita_new', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(2000);

    const abrio = await abrirDetallePorHora(page, horaOriginal);
    if (!abrio) throw new Error('No se encontró en la vista Agenda la cita recién creada (hora "' + horaOriginal + '")');
    await page.waitForTimeout(1500);

    const clickEditar = await clickBotonPorTexto(page, 'Editar');
    if (!clickEditar) throw new Error('No se encontró el botón "Editar" en el detalle de la cita');
    await page.waitForTimeout(2000);

    const valorTituloPrevio = await page.evaluate(() => document.getElementById('title_reservation').value);
    if (valorTituloPrevio !== tituloOriginal) throw new Error('El formulario de edición no precargó el título original esperado (obtuvo "' + valorTituloPrevio + '")');

    await page.fill('#title_reservation', tituloEditado);
    await page.fill('#start_schedule_reservation', horaEditada);
    await page.waitForTimeout(500);

    const t1 = Date.now();
    await page.evaluate(() => document.getElementById('saveBtn').click());
    await page.waitForTimeout(3000);
    console.log('⏱ Guardar edición: ' + (Date.now() - t1) + 'ms');

    // ── Reabrir el detalle y confirmar que el cambio persistió ──
    await refrescarConCacheLimpia(page);
    await page.waitForSelector('#btn_add_cita_new', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(2000);

    const reabrio = await abrirDetallePorHora(page, horaEditada);
    if (!reabrio) throw new Error('No se encontró en la vista Agenda la cita con la nueva hora editada ("' + horaEditada + '")');
    await page.waitForTimeout(1500);

    // ── VALIDACIONES ──
    const v1 = ultimaReservationVista !== null && ultimaReservationVista.id === idOriginal;
    const v2 = ultimaReservationVista !== null && (ultimaReservationVista.title || '').includes(tituloEditado);
    console.log('\n📊 === VALIDACIONES CP-206 ===');
    console.log('  El detalle reabierto corresponde al MISMO id original (se editó, no se creó otra cita): ' + (v1 ? '✅ (id=' + idOriginal + ')' : '❌ (id recibido=' + (ultimaReservationVista && ultimaReservationVista.id) + ')'));
    console.log('  El título persistido es el editado, no el original: ' + (v2 ? '✅ ("' + tituloEditado + '")' : '❌ (título recibido="' + (ultimaReservationVista && ultimaReservationVista.title) + '")'));

    if (!v1) throw new Error('El id de la cita reabierta no coincide con el id original — pudo haberse creado una cita nueva en vez de editar');
    if (!v2) throw new Error('El título editado no persistió en el servidor');

    console.log('✅ CP-206 PASSED | cita (id=' + idOriginal + ') editada de "' + tituloOriginal + '" a "' + tituloEditado + '", hora ' + horaOriginal + '→' + horaEditada + ' | validaciones: 2/2');
    registrarResultado({ cp: 'CP-206', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: Date.now() - tiempoInicioCP });

  } catch (error) {
    await screenshotOnFail(page, 'cp206-fail');
    console.log('❌ CP-206 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-206', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp206_editar_cita();
