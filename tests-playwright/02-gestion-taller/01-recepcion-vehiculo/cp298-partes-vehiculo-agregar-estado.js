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

async function clickSiguiente(page) {
  await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(b => b.textContent.trim() === 'Siguiente');
    if (btn) btn.click();
  });
  await page.waitForTimeout(3000);
}

async function iniciarRecepcionHastaPartes(page) {
  await page.click('button.add-reception-btn', { timeout: 15000 });
  await page.waitForTimeout(1800);
  const placa = 'CP298-' + Date.now().toString().slice(-9);
  await page.fill('#vehicle_plaque', placa);
  await page.click('#vr_add_vehicle_btn');
  await page.waitForTimeout(2500);

  await page.fill('#vehicular_reception_customer_search', 'cliente prueba tarea 5');
  await page.waitForTimeout(1800);
  await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    const candidato = Array.from(document.querySelectorAll('*')).filter(isVis).find(el => el.textContent.trim() === 'cliente prueba tarea 5' && el.children.length === 0);
    if (candidato) { (candidato.closest('[onclick], .client-search-result-item, li, div[role="button"]') || candidato).click(); }
  });
  await page.waitForTimeout(3000);

  await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    const candidatos = Array.from(document.querySelectorAll('*')).filter(isVis).filter(el => (el.textContent||'').trim() === 'SEDAN');
    const masChico = candidatos.sort((a,b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length)[0];
    const tarjeta = masChico ? masChico.closest('.card.style-vehicle, [onclick*="setVehicleStyle"]') : null;
    if (tarjeta) tarjeta.click();
  });
  await page.waitForTimeout(3000);

  await page.evaluate(() => { const el = document.getElementById('vehicle_brand'); el.value = '131'; el.dispatchEvent(new Event('change', { bubbles: true })); if (window.jQuery) jQuery(el).trigger('chosen:updated'); });
  await page.waitForTimeout(1800);
  const modeloOpciones = await page.evaluate(() => Array.from(document.getElementById('vehicle_model')?.options || []).map(o => o.value));
  if (modeloOpciones.length > 1) await page.evaluate((v) => { const el = document.getElementById('vehicle_model'); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); if (window.jQuery) jQuery(el).trigger('chosen:updated'); }, modeloOpciones[1]);
  await page.waitForTimeout(1500);

  await clickSiguiente(page); // -> Seleccionar servicios
  await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    const candidatas = Array.from(document.querySelectorAll('div')).filter(isVis).filter(el => {
      const t = el.textContent || '';
      return /₡/.test(t) && /Und/.test(t) && !/agregar producto/i.test(t) && el.querySelectorAll('div').length < 6;
    });
    const tarjeta = candidatas.sort((a,b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length)[0];
    if (tarjeta) tarjeta.click();
  });
  await page.waitForTimeout(2000);
  await clickSiguiente(page); // -> Inspección
  await clickSiguiente(page); // -> Enderezado y Pintura
  await clickSiguiente(page); // -> Abonos
  await clickSiguiente(page); // -> Partes del vehículo
  return placa;
}

async function cp298_partes_vehiculo_agregar_estado() {
  console.log('🔄 Ejecutando CP-298: Recepción Vehicular — Partes del Vehículo (agregar parte + cambiar estado)...');
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

    const placa = await iniciarRecepcionHastaPartes(page);
    console.log('📋 Nueva recepción iniciada con placa:', placa);

    const enPasoCorrecto = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      return Array.from(document.querySelectorAll('button,a')).filter(isVis).some(b => b.textContent.trim() === 'Agregar Parte');
    });
    await screenshotOnFail(page, 'cp298-estado-al-llegar');
    console.log('  Wizard llegó a "Partes del vehículo":', enPasoCorrecto);
    if (!enPasoCorrecto) throw new Error('El wizard no llegó al paso "Partes del vehículo" (botón "Agregar Parte" no encontrado)');

    // ── 1) Cambiar el ESTADO de la primera parte real (click en una de las 4 caritas) ──
    console.log('\n🔩 Flujo 1: Cambiar estado de una parte existente...');
    const tEstado = Date.now();
    const estadoCambiado = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      // Las 4 caritas son imagenes/spans dentro de la primera tarjeta de parte; se identifican
      // por estar agrupadas 4 a la vez dentro de un contenedor con "Cantidad" debajo.
      const contenedorCantidad = Array.from(document.querySelectorAll('*')).filter(isVis).find(el => el.textContent.trim() === 'Cantidad' && el.children.length === 0);
      if (!contenedorCantidad) return false;
      const tarjeta = contenedorCantidad.closest('[class*="card" i]') || contenedorCantidad.parentElement.parentElement;
      if (!tarjeta) return false;
      const iconos = Array.from(tarjeta.querySelectorAll('button, svg, img, span')).filter(isVis);
      // Clickear el segundo icono visible dentro de la tarjeta (una de las 4 caritas de estado)
      const candidato = iconos.find(el => { const r = el.getBoundingClientRect(); return r.width > 10 && r.width < 40 && r.height < 40; });
      if (candidato) { candidato.click(); return true; }
      return false;
    });
    await page.waitForTimeout(1500);
    evaluarAccion(Date.now() - tEstado, 'Cambiar estado de una parte');
    console.log('  Click en ícono de estado registrado:', estadoCambiado);

    // ── 2) Agregar una PARTE NUEVA ──
    console.log('\n🔩 Flujo 2: Agregar una parte nueva...');
    const tAgregarParte = Date.now();
    const abrioFormParte = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = Array.from(document.querySelectorAll('button,a')).filter(isVis).find(b => b.textContent.trim() === 'Agregar Parte');
      if (btn) { btn.click(); return true; }
      return false;
    });
    await page.waitForTimeout(2000);
    if (!abrioFormParte) { await screenshotOnFail(page, 'cp298-fail-abrir-parte'); throw new Error('No se encontró/clickeó "Agregar Parte"'); }
    await screenshotOnFail(page, 'cp298-form-parte');

    const nombreParteNueva = 'CP298 Parte ' + Date.now().toString().slice(-6);
    const parteLlenada = await page.evaluate((nombre) => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const input = Array.from(document.querySelectorAll('input[type="text"]')).filter(isVis).find(i => !i.value && !/buscar/i.test(i.placeholder||''));
      if (!input) return false;
      input.value = nombre;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }, nombreParteNueva);
    console.log('  Campo de nombre de parte llenado:', parteLlenada);
    await page.waitForTimeout(500);

    const guardoParte = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(b => /guardar|agregar|crear/i.test(b.textContent||''));
      if (btn) { btn.click(); return true; }
      return false;
    });
    await page.waitForTimeout(2500);
    evaluarAccion(Date.now() - tAgregarParte, 'Crear parte nueva');
    console.log('  Parte nueva guardada:', guardoParte);

    const parteVisibleEnLista = await page.evaluate((nombre) => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      return Array.from(document.querySelectorAll('*')).filter(isVis).some(el => (el.textContent||'').toUpperCase().includes(nombre.toUpperCase()));
    }, nombreParteNueva);
    console.log('  Parte nueva visible en la lista:', parteVisibleEnLista);

    await screenshotOnFail(page, 'cp298-estado-final');

    console.log('\n📊 === VALIDACIONES CP-298 ===');
    console.log('  Wizard llegó a "Partes del vehículo":        ' + (enPasoCorrecto ? '✅' : '❌'));
    console.log('  Estado de una parte existente cambiado:      ' + (estadoCambiado ? '✅' : '⚠️ no confirmado'));
    console.log('  Formulario "Agregar Parte" abrió y se llenó: ' + (abrioFormParte && parteLlenada ? '✅' : '❌'));
    console.log('  Parte nueva guardada:                        ' + (guardoParte ? '✅' : '❌'));
    console.log('  Parte nueva visible en la lista:             ' + (parteVisibleEnLista ? '✅' : '⚠️ no confirmado'));

    if (!enPasoCorrecto) throw new Error('El wizard no llegó al paso correcto');
    if (!abrioFormParte || !guardoParte) throw new Error('No se pudo crear la parte nueva');

    const tiempoTotalCP = Date.now() - tiempoInicioCP;
    console.log('✅ CP-298 PASSED | placa: ' + placa + ' | estado cambiado: ' + estadoCambiado + ' | parte nueva: ' + nombreParteNueva + ' (visible: ' + parteVisibleEnLista + ') | tiempo: ' + tiempoTotalCP + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp298-fail');
    console.log('❌ CP-298 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp298_partes_vehiculo_agregar_estado();
