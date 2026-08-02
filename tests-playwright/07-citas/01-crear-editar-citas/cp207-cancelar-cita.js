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
    if (r.url().includes('/reservation/delete_reservation') && r.request().method() === 'POST') {
      try {
        const texto = (await r.text()).trim();
        callbacks.onDeleted(texto === '1');
      } catch {}
    }
    if (r.url().includes('/reservation/get_reservations_by_month') && r.request().method() === 'POST') {
      try {
        const body = await r.json();
        callbacks.onListado(Array.isArray(body) ? body : []);
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

async function cp207_cancelar_cita() {
  console.log('🔄 Ejecutando CP-207: Cancelar (Eliminar) una cita en el módulo Citas...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;
  const tiempoInicioCP = Date.now();
  const tituloCita = 'CP-207-CANCELAR-' + Date.now();
  const horaInicio = horaUnicaHHMM();

  let reservationIdCreado = null;
  let deleteConfirmadoPorRed = null;
  let ultimoListadoMes = null;

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
      onDeleted: (ok) => { deleteConfirmadoPorRed = ok; },
      onListado: (lista) => { ultimoListadoMes = lista; }
    });

    await crearCitaDescartable(page, tituloCita, horaInicio);
    if (reservationIdCreado === null) throw new Error('No se pudo crear la cita descartable de prueba para este CP');
    const idCreado = reservationIdCreado;

    // ── Abrir detalle y Eliminar (cancelar) ──
    await refrescarConCacheLimpia(page);
    await page.waitForSelector('#btn_add_cita_new', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(2000);

    const abrio = await abrirDetallePorHora(page, horaInicio);
    if (!abrio) throw new Error('No se encontró en la vista Agenda la cita descartable recién creada (hora "' + horaInicio + '")');
    await page.waitForTimeout(1500);

    const clickEliminar = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const btn = Array.from(document.querySelectorAll('button, a')).filter(isVis).find(b => (b.textContent || '').trim() === 'Eliminar');
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (!clickEliminar) throw new Error('No se encontró el botón "Eliminar" en el detalle de la cita');
    await page.waitForTimeout(1500);

    // Confirmar el SweetAlert "¡Eliminar cita! ¿Esta seguro que desea continuar?" por texto exacto "Aceptar"
    const confirmoSweetAlert = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const btn = Array.from(document.querySelectorAll('.sweet-alert button, [class*="swal"] button')).filter(isVis).find(b => /aceptar/i.test((b.textContent || '').trim()));
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (!confirmoSweetAlert) throw new Error('No se encontró el botón "Aceptar" en el SweetAlert de confirmación de eliminar');
    await page.waitForTimeout(2500);

    // ── Verificar que ya no aparece en un listado fresco del mes ──
    ultimoListadoMes = null;
    await refrescarConCacheLimpia(page);
    await page.waitForSelector('#btn_add_cita_new', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(2500);

    // ── VALIDACIONES ──
    // Nota: "Eliminar" es un soft-delete — la cita sigue en el feed de get_reservations_by_month
    // (con is_active=0), no desaparece de la lista. La verificación correcta es su estado, no su ausencia.
    const entradaTrasEliminar = Array.isArray(ultimoListadoMes) ? ultimoListadoMes.find(r => r.id === idCreado) : null;
    const v1 = deleteConfirmadoPorRed === true;
    const v2 = entradaTrasEliminar && entradaTrasEliminar.is_active === 0;
    console.log('\n📊 === VALIDACIONES CP-207 ===');
    console.log('  delete_reservation confirmado por red: ' + (v1 ? '✅' : '❌ (respuesta=' + deleteConfirmadoPorRed + ')'));
    console.log('  La cita (id=' + idCreado + ') queda marcada is_active=0 (anulada) tras refrescar: ' + (v2 ? '✅' : '❌ (entrada=' + JSON.stringify(entradaTrasEliminar) + ')'));

    if (!v1) throw new Error('El servidor no confirmó la eliminación (delete_reservation no devolvió éxito)');
    if (!v2) throw new Error('La cita eliminada no quedó marcada como inactiva (is_active=0) en el listado del mes');

    console.log('✅ CP-207 PASSED | cita "' + tituloCita + '" (id=' + idCreado + ') creada y cancelada (soft-delete, is_active=0) correctamente | validaciones: 2/2');
    registrarResultado({ cp: 'CP-207', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: Date.now() - tiempoInicioCP });

  } catch (error) {
    await screenshotOnFail(page, 'cp207-fail');
    console.log('❌ CP-207 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-207', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp207_cancelar_cita();
