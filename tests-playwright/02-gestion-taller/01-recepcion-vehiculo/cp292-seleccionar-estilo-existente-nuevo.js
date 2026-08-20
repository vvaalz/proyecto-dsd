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

async function iniciarRecepcionHastaEstilo(page) {
  await page.click('button.add-reception-btn', { timeout: 15000 });
  await page.waitForTimeout(1500);
  const placa = 'CP292-' + Date.now().toString().slice(-9);
  await page.fill('#vehicle_plaque', placa);
  await page.click('#vr_add_vehicle_btn');
  await page.waitForTimeout(2000);

  await page.fill('#vehicular_reception_customer_search', 'cliente prueba tarea 5');
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    const candidato = Array.from(document.querySelectorAll('*')).filter(isVis).find(el => el.textContent.trim() === 'cliente prueba tarea 5' && el.children.length === 0);
    if (candidato) { (candidato.closest('[onclick], .client-search-result-item, li, div[role="button"]') || candidato).click(); }
  });
  await page.waitForTimeout(2500);
  return placa;
}

async function cp292_seleccionar_estilo_existente_nuevo() {
  console.log('🔄 Ejecutando CP-292: Recepción Vehicular — Seleccionar Estilo (existente + nuevo)...');
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

    const placa = await iniciarRecepcionHastaEstilo(page);
    console.log('📋 Nueva recepción iniciada con placa:', placa, '(cliente existente ya seleccionado, wizard en "Seleccionar estilo")');

    // ── 1) Seleccionar ESTILO EXISTENTE (tarjeta real, ej. SEDAN) ──
    console.log('\n🚙 Flujo 1: Seleccionar estilo existente (SEDAN)...');
    const tEstilo = Date.now();
    const estiloExistenteClickeado = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const candidatos = Array.from(document.querySelectorAll('*')).filter(isVis).filter(el => (el.textContent||'').trim() === 'SEDAN');
      const masChico = candidatos.sort((a,b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length)[0];
      const tarjeta = masChico ? masChico.closest('.card.style-vehicle, [onclick*="setVehicleStyle"]') : null;
      if (tarjeta) { tarjeta.click(); return true; }
      return false;
    });
    await page.waitForTimeout(2000);
    evaluarAccion(Date.now() - tEstilo, 'Seleccionar estilo existente (tarjeta SEDAN)');
    if (!estiloExistenteClickeado) { await screenshotOnFail(page, 'cp292-fail-estilo-existente'); throw new Error('No se encontró/clickeó la tarjeta de estilo "SEDAN"'); }

    const avanzoADetalles = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      return Array.from(document.querySelectorAll('input')).filter(isVis).some(i => i.id === 'vehicle_licence_plate' || i.id === 'p_vehicle_battery_percent');
    });
    console.log('  ✅ Estilo SEDAN seleccionado. Wizard avanzó a "Detalles del vehículo":', avanzoADetalles);

    // ── 2) Agregar ESTILO NUEVO — volver con "Anterior" primero ──
    console.log('\n🚙 Flujo 2: Agregar estilo nuevo...');
    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(b => b.textContent.trim() === 'Anterior');
      if (btn) btn.click();
    });
    await page.waitForTimeout(2000);

    const tAgregarEstilo = Date.now();
    const abrioModalNuevoEstilo = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = Array.from(document.querySelectorAll('button,a')).filter(isVis).find(b => b.textContent.trim() === 'Agregar Estilo');
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (!abrioModalNuevoEstilo) { await screenshotOnFail(page, 'cp292-fail-abrir-nuevo-estilo'); throw new Error('No se encontró/clickeó el botón "Agregar Estilo"'); }
    await page.waitForSelector('#vehicle_admin_style_name', { state: 'visible', timeout: 30000 });
    evaluarAccion(Date.now() - tAgregarEstilo, 'Abrir modal "Agregar Estilo"');

    const nombreEstiloNuevo = 'CP292 Estilo ' + Date.now().toString().slice(-6);
    await page.fill('#vehicle_admin_style_name', nombreEstiloNuevo);
    await page.waitForTimeout(500);

    // El segundo campo del modal es un <select> tipo Chosen ("Select an Option") — hallar el
    // select real visible dentro del modal y setearlo con jQuery(...).trigger('chosen:updated')
    const tipoSeleccionado = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select'));
      const sel = selects.find(s => s.id && /vehicle_admin_style_type|style_type/i.test(s.id));
      if (!sel || sel.options.length < 2) return false;
      sel.value = sel.options[1].value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      if (window.jQuery) jQuery(sel).trigger('chosen:updated');
      return true;
    });
    console.log('  Tipo de estilo seleccionado (select Chosen):', tipoSeleccionado);
    await page.waitForTimeout(500);

    const tGuardarEstilo = Date.now();
    const guardoEstiloNuevo = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(b => b.textContent.trim() === 'Guardar');
      if (btn) { btn.click(); return true; }
      return false;
    });
    await page.waitForTimeout(2500);
    evaluarAccion(Date.now() - tGuardarEstilo, 'Guardar estilo nuevo');
    if (!guardoEstiloNuevo) { await screenshotOnFail(page, 'cp292-fail-guardar-estilo'); throw new Error('No se encontró/clickeó "Guardar" al crear el estilo nuevo'); }

    await screenshotOnFail(page, 'cp292-estado-final');

    console.log('\n📊 === VALIDACIONES CP-292 ===');
    console.log('  Estilo existente (SEDAN) seleccionado y wizard avanzó: ' + (estiloExistenteClickeado && avanzoADetalles ? '✅' : '❌'));
    console.log('  Modal "Agregar Estilo" abrió correctamente:            ' + (abrioModalNuevoEstilo ? '✅' : '❌'));
    console.log('  Tipo de estilo seleccionado (Chosen):                  ' + (tipoSeleccionado ? '✅' : '⚠️ no confirmado'));
    console.log('  Estilo nuevo guardado ("Guardar"):                     ' + (guardoEstiloNuevo ? '✅' : '❌'));

    if (!estiloExistenteClickeado || !avanzoADetalles) throw new Error('No se pudo seleccionar un estilo existente o el wizard no avanzó');
    if (!guardoEstiloNuevo) throw new Error('No se pudo guardar el estilo nuevo');

    const tiempoTotalCP = Date.now() - tiempoInicioCP;
    console.log('✅ CP-292 PASSED | placa: ' + placa + ' | estilo existente: ok | estilo nuevo: ' + nombreEstiloNuevo + ' | tiempo: ' + tiempoTotalCP + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp292-fail');
    console.log('❌ CP-292 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp292_seleccionar_estilo_existente_nuevo();
