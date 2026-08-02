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

// Genera un horario de inicio único (HH:MM) dentro del día de hoy para poder ubicar
// la fila correcta en la vista "Agenda" sin ambigüedad frente a otras citas del mismo
// cliente de prueba creadas por otros CPs/sesiones.
function horaUnicaHHMM() {
  const ahora = new Date();
  const minutosDesdeMedianoche = ahora.getHours() * 60 + ahora.getMinutes();
  const offset = (Date.now() % 180) + 1; // 1–180 min de offset, determinístico por el instante de ejecución
  const totalMin = (minutosDesdeMedianoche + offset) % (23 * 60); // evitar pasar de las 23:00
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
  const clicked = await page.evaluate((hora) => {
    const isVis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const fila = Array.from(document.querySelectorAll('.fc-list-item')).filter(isVis).find(f => (f.textContent || '').includes(hora));
    if (!fila) return false;
    fila.click();
    return true;
  }, horaInicio);
  return clicked;
}

async function cp205_ver_detalle_cita() {
  console.log('🔄 Ejecutando CP-205: Ver detalle de una cita en el módulo Citas...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;
  const tiempoInicioCP = Date.now();
  const tituloCita = 'CP-205-VER-DETALLE-' + Date.now();
  const horaInicio = horaUnicaHHMM();

  let reservationIdCreado = null;
  let reservationVistaAlCrear = null;
  let reservationVistaAlAbrirDetalle = null;

  try {
    const t0 = Date.now();
    ({ context, page } = await navegarAModulo(browser, context, URL_MODULO));
    await page.waitForSelector('#btn_add_cita_new', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(2000);
    evaluarCargaPagina(Date.now() - t0, 'Carga del módulo Citas');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('#btn_add_cita_new', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(2000);

    let modoVista = 'crear';
    escucharGuardadoReservation(page, {
      onSaved: (id) => { reservationIdCreado = id; },
      onViewed: (reservation) => {
        if (modoVista === 'crear') reservationVistaAlCrear = reservation;
        else reservationVistaAlAbrirDetalle = reservation;
      }
    });

    await crearCitaDescartable(page, tituloCita, horaInicio);
    if (reservationIdCreado === null) throw new Error('No se pudo crear la cita descartable de prueba para este CP');

    // ── Ver detalle: reabrir la cita desde la vista Agenda (como lo haría un usuario real) ──
    await refrescarConCacheLimpia(page);
    await page.waitForSelector('#btn_add_cita_new', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(2000);
    modoVista = 'ver';

    const abrio = await abrirDetallePorHora(page, horaInicio);
    if (!abrio) throw new Error('No se encontró en la vista Agenda la fila correspondiente a la hora "' + horaInicio + '" de la cita creada');
    await page.waitForTimeout(1500);

    // ── Confirmar que el modal de detalle muestra las acciones reales de un usuario ──
    const accionesDisponibles = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      return Array.from(document.querySelectorAll('button, a')).filter(isVis)
        .map(b => (b.textContent || '').trim())
        .filter(t => ['Eliminar', 'WhatsApp', 'Email', 'Editar', 'Convertir a orden'].includes(t));
    });

    const totalGeneralTexto = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const el = Array.from(document.querySelectorAll('*')).filter(isVis).find(e => e.children.length === 0 && /^Total General/i.test((e.textContent || '').trim()));
      if (!el) return null;
      let fila = el.parentElement;
      for (let i = 0; i < 3 && fila; i++) {
        if (/₡/.test(fila.textContent || '')) return fila.textContent.replace(/\s+/g, ' ').trim();
        fila = fila.parentElement;
      }
      return el.textContent.trim();
    });

    // ── VALIDACIONES ──
    const v1 = reservationVistaAlAbrirDetalle !== null && reservationVistaAlAbrirDetalle.id === reservationIdCreado;
    const v2 = accionesDisponibles.length >= 4; // Eliminar, WhatsApp, Email, Editar (Convertir a orden puede o no aparecer según el estado)
    const v3 = /₡\s*0\.00/.test(totalGeneralTexto || '');
    console.log('\n📊 === VALIDACIONES CP-205 ===');
    console.log('  El detalle abierto corresponde a la cita creada (mismo id por red): ' + (v1 ? '✅ (id=' + reservationIdCreado + ')' : '❌'));
    console.log('  Acciones reales visibles en el detalle (Eliminar/WhatsApp/Email/Editar): ' + (v2 ? '✅ (' + JSON.stringify(accionesDisponibles) + ')' : '❌ (' + JSON.stringify(accionesDisponibles) + ')'));
    console.log('  "Total General" se muestra en ₡0.00 (sin servicios/productos agregados, independiente del bug de montos): ' + (v3 ? '✅ (' + totalGeneralTexto + ')' : '⚠️ (' + totalGeneralTexto + ')'));

    if (!v1) throw new Error('El detalle abierto no corresponde a la cita recién creada (posible fila equivocada en la Agenda)');
    if (!v2) throw new Error('No se encontraron las acciones esperadas (Eliminar/WhatsApp/Email/Editar) en el modal de detalle');

    console.log('✅ CP-205 PASSED | detalle de la cita (id=' + reservationIdCreado + ') verificado con sus acciones reales | validaciones: 2/2' + (v3 ? ' (+ hallazgo de monto confirmado)' : ''));
    registrarResultado({ cp: 'CP-205', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: Date.now() - tiempoInicioCP });

  } catch (error) {
    await screenshotOnFail(page, 'cp205-fail');
    console.log('❌ CP-205 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-205', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp205_ver_detalle_cita();
