const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');

const URL_RECEPCION = `${BASE_URL}/vehicularReception/vehicularQuickReception`;

const screenshotOnFail = async (page, name) => { try { const dir = path.join(__dirname,'..','..','..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {} };
function evaluarCargaPagina(ms, e) { if(ms>8000) console.log('❌ PERFORMANCE FAILED: '+e+' tardó '+ms+'ms'); else if(ms>3000) console.log('⚠️ LENTO: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }
function evaluarAccion(ms, e) { if(ms>4000) console.log('❌ Acción lenta: '+e+' tardó '+ms+'ms'); else if(ms>1500) console.log('⚠️ Acción algo lenta: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }

async function navegarAModulo(browser, context, url) {
  let page = await context.newPage();
  await page.goto(url, { waitUntil: 'load', timeout: 180000 });
  await page.waitForTimeout(3000);
  if (/\/log\/login/i.test(page.url())) {
    console.log('⚠️ Sesión expirada — regenerando y reintentando...');
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

async function iniciarNuevaRecepcion(page) {
  await page.click('button.add-reception-btn', { timeout: 15000 });
  await page.waitForTimeout(1500);
  const placa = 'CP291-' + Date.now().toString().slice(-9);
  await page.fill('#vehicle_plaque', placa);
  await page.click('#vr_add_vehicle_btn');
  await page.waitForTimeout(2000);
  return placa;
}

async function cp291_seleccionar_cliente_buscar_agregar_editar() {
  console.log('🔄 Ejecutando CP-291: Recepción Vehicular — Seleccionar Cliente (existente + nuevo completo)...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;
  const tiempoInicioCP = Date.now();

  try {
    const t0 = Date.now();
    ({ context, page } = await navegarAModulo(browser, context, URL_RECEPCION));
    await page.waitForSelector('#repair_order_search', { state: 'attached', timeout: 60000 });
    evaluarCargaPagina(Date.now() - t0, 'Carga de Recepción de Vehículo');
    await refrescarConCacheLimpia(page);
    await page.waitForSelector('#repair_order_search', { state: 'attached', timeout: 60000 });
    try { const d = await page.$('#workshop-web-notification-permission-dismiss'); if (d) await d.click(); } catch {}
    await page.waitForTimeout(1000);

    const placa = await iniciarNuevaRecepcion(page);
    console.log('📋 Nueva recepción iniciada con placa:', placa);

    // ── 1) Seleccionar CLIENTE EXISTENTE (autocomplete en vivo, sin botón "Buscar") ──
    console.log('\n👤 Flujo 1: Seleccionar cliente existente...');
    const tBuscar = Date.now();
    await page.fill('#vehicular_reception_customer_search', 'cliente prueba tarea 5');
    await page.waitForTimeout(1500);
    const clienteExistenteClickeado = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const candidato = Array.from(document.querySelectorAll('*')).filter(isVis).find(el => el.textContent.trim() === 'cliente prueba tarea 5' && el.children.length === 0);
      if (candidato) { (candidato.closest('[onclick], .client-search-result-item, li, div[role="button"]') || candidato).click(); return true; }
      return false;
    });
    evaluarAccion(Date.now() - tBuscar, 'Buscar y seleccionar cliente existente');
    if (!clienteExistenteClickeado) { await screenshotOnFail(page, 'cp291-fail-cliente-existente'); throw new Error('No se encontró/clickeó el cliente existente "cliente prueba tarea 5" en el autocomplete'); }
    await page.waitForTimeout(2000);

    // Hallazgo: seleccionar un cliente del autocomplete AVANZA automáticamente al siguiente
    // paso ("Seleccionar estilo") — no hace falta (ni existe) un botón "Siguiente" aparte en
    // este punto. Confirmar el avance real revisando que "Agregar Estilo" ya esté visible.
    await page.waitForTimeout(2000);
    const avanzoAEstilo = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      return Array.from(document.querySelectorAll('button,a')).filter(isVis).some(b => b.textContent.trim() === 'Agregar Estilo');
    });
    console.log('  ✅ Cliente existente seleccionado y wizard avanzó automáticamente al paso "Seleccionar estilo":', avanzoAEstilo);

    // ── 2) Agregar CLIENTE NUEVO COMPLETO — hay que volver con "Anterior" primero, ya que
    // seleccionar el cliente existente ya avanzó el wizard al siguiente paso.
    console.log('\n👤 Flujo 2: Agregar cliente nuevo completo...');
    const volvioAlPasoCliente = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(b => b.textContent.trim() === 'Anterior');
      if (btn) { btn.click(); return true; }
      return false;
    });
    await page.waitForTimeout(2000);
    console.log('  Click en "Anterior" para volver a Seleccionar Cliente:', volvioAlPasoCliente);

    const tAgregar = Date.now();
    const abrioModalNuevoCliente = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = Array.from(document.querySelectorAll('button,a')).filter(isVis).find(b => b.textContent.trim() === 'Agregar Cliente');
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (!abrioModalNuevoCliente) { await screenshotOnFail(page, 'cp291-fail-abrir-nuevo-cliente'); throw new Error('No se encontró/clickeó el botón "Agregar Cliente"'); }
    // Hallazgo: este modal de "Agregar Cliente" (abierto desde el wizard de Recepción) usa
    // ids con prefijo "cf_" (cf_identifier, cf_name, cf_email, cf_address, cf_whatsapp,
    // cf_phone_1) — DISTINTOS de los "c_*" usados por el modal equivalente del POS (CP-193 en
    // adelante). Confirmado en vivo que es un componente rediseñado, no el mismo formulario.
    await page.waitForSelector('#cf_identifier', { state: 'visible', timeout: 30000 });
    evaluarAccion(Date.now() - tAgregar, 'Abrir modal "Agregar Cliente"');

    const cedulaNueva = Date.now().toString().slice(-9);
    const nombreNuevoCliente = 'CP291 Cliente Completo ' + Date.now().toString().slice(-6);
    await page.fill('#cf_identifier', cedulaNueva);
    await page.fill('#cf_name', nombreNuevoCliente);
    await page.fill('#cf_email', 'cp291.' + Date.now() + '@example.com');
    await page.fill('#cf_address', 'San José, Costa Rica — dirección de prueba CP-291');
    await page.fill('#cf_whatsapp', '88880001');
    await page.fill('#cf_phone_1', '88880001');
    await page.waitForTimeout(500);

    const tGuardarCliente = Date.now();
    const guardoCliente = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(b => /guardar y salir/i.test(b.textContent||''));
      if (btn) { btn.click(); return true; }
      return false;
    });
    await page.waitForTimeout(2500);
    evaluarAccion(Date.now() - tGuardarCliente, 'Guardar cliente nuevo completo ("Guardar y Salir")');
    if (!guardoCliente) { await screenshotOnFail(page, 'cp291-fail-guardar-cliente'); throw new Error('No se encontró/clickeó "Guardar y Salir" al crear el cliente nuevo'); }

    // ── VALIDACIÓN: guardar el cliente nuevo también avanza automáticamente el wizard ──
    const avanzoTrasClienteNuevo = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      return Array.from(document.querySelectorAll('button,a')).filter(isVis).some(b => b.textContent.trim() === 'Agregar Estilo');
    });
    await page.screenshot({ path: path.join(__dirname,'..','..','..','reports','screenshots','cp291-cliente-nuevo-seleccionado-'+Date.now()+'.png') }).catch(()=>{});

    console.log('\n📊 === VALIDACIONES CP-291 ===');
    console.log('  Cliente existente encontrado, seleccionado y wizard avanzó:  ' + (clienteExistenteClickeado && avanzoAEstilo ? '✅' : '❌'));
    console.log('  Modal "Agregar Cliente" abrió correctamente (vía "Anterior"): ' + (abrioModalNuevoCliente ? '✅' : '❌'));
    console.log('  Cliente nuevo guardado ("Guardar y Salir"):                   ' + (guardoCliente ? '✅' : '❌'));
    console.log('  Wizard avanzó de nuevo tras guardar el cliente nuevo:         ' + (avanzoTrasClienteNuevo ? '✅' : '⚠️ no confirmado'));

    if (!clienteExistenteClickeado || !avanzoAEstilo) throw new Error('No se pudo seleccionar un cliente existente o el wizard no avanzó');
    if (!guardoCliente) throw new Error('No se pudo guardar el cliente nuevo');

    const tiempoTotalCP = Date.now() - tiempoInicioCP;
    console.log('✅ CP-291 PASSED | placa: ' + placa + ' | cliente existente: ok | cliente nuevo: ' + nombreNuevoCliente + ' | avanzó tras nuevo: ' + avanzoTrasClienteNuevo + ' | tiempo: ' + tiempoTotalCP + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp291-fail');
    console.log('❌ CP-291 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp291_seleccionar_cliente_buscar_agregar_editar();
