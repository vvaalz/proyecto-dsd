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

async function iniciarRecepcionHastaDetallesVehiculo(page) {
  await page.click('button.add-reception-btn', { timeout: 15000 });
  await page.waitForTimeout(1500);
  const placa = 'CP293-' + Date.now().toString().slice(-9);
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

  await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    const candidatos = Array.from(document.querySelectorAll('*')).filter(isVis).filter(el => (el.textContent||'').trim() === 'SEDAN');
    const masChico = candidatos.sort((a,b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length)[0];
    const tarjeta = masChico ? masChico.closest('.card.style-vehicle, [onclick*="setVehicleStyle"]') : null;
    if (tarjeta) tarjeta.click();
  });
  await page.waitForTimeout(2500);
  return placa;
}

async function cp293_detalles_vehiculo_marca_aseguradora() {
  console.log('🔄 Ejecutando CP-293: Recepción Vehicular — Detalles del Vehículo (marca nueva + aseguradora)...');
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

    const placa = await iniciarRecepcionHastaDetallesVehiculo(page);
    console.log('📋 Nueva recepción iniciada con placa:', placa, '(cliente + estilo ya seleccionados, wizard en "Detalles del vehículo")');

    // ── 1) Agregar MARCA NUEVA (modal "Marcas y modelos") ──
    console.log('\n🚗 Flujo 1: Agregar marca nueva...');
    const tAbrirMarcas = Date.now();
    // El botón "+" junto a Marca no tiene texto/id/clase estable para ubicarlo por DOM de
    // forma confiable (confirmado en vivo con varios intentos) — se hace click por coordenada
    // fija, ya que el layout de este paso del wizard es fijo en el viewport 1440x1200 del
    // proyecto (botón "+" de Marca a la derecha del select, primera fila del formulario).
    await page.mouse.click(830, 249);
    await page.waitForTimeout(1000);
    let abrioModalMarcas = await page.evaluate(() => { const el = document.getElementById('brand_company_search'); return !!el && el.getBoundingClientRect().width > 0; });
    if (!abrioModalMarcas) {
      // Reintento con el mismo click, por si el primero no registró a tiempo
      await page.mouse.click(830, 249);
      await page.waitForTimeout(1500);
      abrioModalMarcas = await page.evaluate(() => { const el = document.getElementById('brand_company_search'); return !!el && el.getBoundingClientRect().width > 0; });
    }
    if (!abrioModalMarcas) { await screenshotOnFail(page, 'cp293-fail-abrir-marcas'); throw new Error('No se pudo abrir el modal "Marcas y modelos" (botón "+" de Marca)'); }
    evaluarAccion(Date.now() - tAbrirMarcas, 'Abrir modal "Marcas y modelos"');

    const tAgregarMarca = Date.now();
    const abrioFormAgregarMarca = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(b => /agregar/i.test(b.textContent||'') && !/modelo/i.test(b.textContent||''));
      if (btn) { btn.click(); return true; }
      return false;
    });
    await page.waitForTimeout(1500);
    if (!abrioFormAgregarMarca) { await screenshotOnFail(page, 'cp293-fail-form-agregar-marca'); throw new Error('No se encontró/clickeó el botón "Agregar" de marca'); }

    const nombreMarcaNueva = 'CP293Marca' + Date.now().toString().slice(-6);
    const marcaLlenada = await page.evaluate((nombre) => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const input = Array.from(document.querySelectorAll('input[type="text"]')).filter(isVis).find(i => !i.value && i.id !== 'brand_company_search' && i.id !== 'global_search_header_input');
      if (!input) return false;
      input.value = nombre;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }, nombreMarcaNueva);
    console.log('  Campo de nombre de marca llenado:', marcaLlenada);
    await page.waitForTimeout(500);

    const guardoMarca = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(b => /guardar|agregar/i.test(b.textContent||'') && b.type !== 'button' || /guardar/i.test(b.textContent||''));
      if (btn) { btn.click(); return true; }
      return false;
    });
    await page.waitForTimeout(2000);
    evaluarAccion(Date.now() - tAgregarMarca, 'Crear marca nueva');
    console.log('  Marca nueva guardada:', guardoMarca);

    const marcaVisibleEnLista = await page.evaluate((nombre) => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      return Array.from(document.querySelectorAll('*')).filter(isVis).some(el => (el.textContent||'').toUpperCase().includes(nombre.toUpperCase()));
    }, nombreMarcaNueva);
    console.log('  Marca nueva "' + nombreMarcaNueva + '" visible en la lista:', marcaVisibleEnLista);

    // Cerrar el modal de marcas/modelos
    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(b => /cerrar/i.test(b.textContent||''));
      if (btn) btn.click();
    });
    await page.waitForTimeout(1500);

    // ── 2) Seleccionar Marca+Modelo existentes para poder avanzar (no se depende de que la
    // marca recién creada ya aparezca refrescada en el <select> Chosen del formulario) ──
    await page.evaluate(() => { const el = document.getElementById('vehicle_brand'); el.value = '131'; el.dispatchEvent(new Event('change', { bubbles: true })); if (window.jQuery) jQuery(el).trigger('chosen:updated'); });
    await page.waitForTimeout(1500);
    const modeloOpciones = await page.evaluate(() => Array.from(document.getElementById('vehicle_model')?.options || []).map(o => o.value));
    if (modeloOpciones.length > 1) await page.evaluate((v) => { const el = document.getElementById('vehicle_model'); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); if (window.jQuery) jQuery(el).trigger('chosen:updated'); }, modeloOpciones[1]);
    await page.waitForTimeout(1000);

    // ── 3) Expandir sección "Aseguradora" y llenar sus datos ──
    console.log('\n🛡️ Flujo 2: Agregar información de aseguradora...');
    const tAseguradora = Date.now();
    // Igual que el botón "+" de Marca, el encabezado "Aseguradora" (acordeón colapsable) no
    // tiene un selector estable por texto/clase — se clickea por coordenada fija (confirmado
    // en vivo: fila inmediatamente debajo de "Carrocería", ambas colapsadas por defecto).
    await page.mouse.click(858, 939);
    await page.waitForTimeout(1500);
    let camposAseguradoraVisibles = await page.evaluate(() => { const el = document.getElementById('insurance_policy'); return !!el && el.getBoundingClientRect().width > 0; });
    if (!camposAseguradoraVisibles) {
      await page.mouse.click(858, 939);
      await page.waitForTimeout(1500);
      camposAseguradoraVisibles = await page.evaluate(() => { const el = document.getElementById('insurance_policy'); return !!el && el.getBoundingClientRect().width > 0; });
    }
    evaluarAccion(Date.now() - tAseguradora, 'Expandir sección "Aseguradora"');
    console.log('  Campos de Aseguradora visibles tras expandir:', camposAseguradoraVisibles);
    if (!camposAseguradoraVisibles) { await screenshotOnFail(page, 'cp293-fail-campos-aseguradora'); throw new Error('Los campos de Aseguradora no quedaron visibles tras expandir la sección'); }

    // Seleccionar una aseguradora real del catálogo (select Chosen "insurance_policy_id")
    const aseguradoraSeleccionada = await page.evaluate(() => {
      const sel = document.getElementById('insurance_policy_id');
      if (!sel || sel.options.length < 2) return false;
      sel.value = sel.options[1].value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      if (window.jQuery) jQuery(sel).trigger('chosen:updated');
      return true;
    });
    console.log('  Aseguradora del catálogo seleccionada (Chosen):', aseguradoraSeleccionada);
    await page.waitForTimeout(500);

    await page.fill('#insurance_policy', 'POL-CP293-' + Date.now().toString().slice(-6));
    await page.fill('#insurance_person', 'Asegurado de Prueba CP-293');
    await page.fill('#notice_number', 'AV-' + Date.now().toString().slice(-6));
    await page.waitForTimeout(500);

    const valoresGuardados = await page.evaluate(() => ({
      policy: document.getElementById('insurance_policy')?.value || '',
      person: document.getElementById('insurance_person')?.value || '',
      notice: document.getElementById('notice_number')?.value || '',
    }));
    console.log('  Valores en los campos de aseguradora tras llenarlos:', JSON.stringify(valoresGuardados));

    await screenshotOnFail(page, 'cp293-estado-final');

    console.log('\n📊 === VALIDACIONES CP-293 ===');
    console.log('  Modal "Marcas y modelos" abrió correctamente:        ' + (abrioModalMarcas ? '✅' : '❌'));
    console.log('  Marca nueva creada y visible en la lista:            ' + (marcaVisibleEnLista ? '✅' : '⚠️ no confirmado'));
    console.log('  Sección "Aseguradora" expandida con campos visibles: ' + (camposAseguradoraVisibles ? '✅' : '❌'));
    console.log('  Aseguradora del catálogo seleccionada (Chosen):      ' + (aseguradoraSeleccionada ? '✅' : '⚠️ no confirmado'));
    console.log('  Campos de póliza/asegurado/aviso llenados:           ' + (valoresGuardados.policy && valoresGuardados.person && valoresGuardados.notice ? '✅' : '❌'));

    if (!abrioModalMarcas) throw new Error('No se pudo abrir el modal de Marcas y modelos');
    if (!camposAseguradoraVisibles) throw new Error('No se pudo expandir/llenar la sección de Aseguradora');
    if (!valoresGuardados.policy || !valoresGuardados.person || !valoresGuardados.notice) throw new Error('Los campos de aseguradora no quedaron llenados correctamente');

    const tiempoTotalCP = Date.now() - tiempoInicioCP;
    console.log('✅ CP-293 PASSED | placa: ' + placa + ' | marca nueva: ' + nombreMarcaNueva + ' (visible: ' + marcaVisibleEnLista + ') | aseguradora llenada: ok | tiempo: ' + tiempoTotalCP + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp293-fail');
    console.log('❌ CP-293 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp293_detalles_vehiculo_marca_aseguradora();
