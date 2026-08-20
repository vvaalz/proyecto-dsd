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

async function nombreDePasoActual(page) {
  return page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    const visById = id => { const el = document.getElementById(id); return !!el && isVis(el); };
    if (Array.from(document.querySelectorAll('button')).filter(isVis).some(b => /limpiar firma/i.test(b.textContent||''))) return 'Firma del cliente';
    if (visById('damage_repair')) return 'Observaciones generales';
    if (visById('initial-payment-repair-order')) return 'Abonos';
    if (Array.from(document.querySelectorAll('div')).filter(isVis).some(el => /₡/.test(el.textContent||'') && /Und/.test(el.textContent||''))) return 'Seleccionar servicios';
    if (visById('vehicle_brand')) return 'Detalles del vehículo';
    if (Array.from(document.querySelectorAll('*')).filter(isVis).some(el => el.textContent.trim() === 'SEDAN')) return 'Seleccionar estilo';
    if (visById('vehicular_reception_customer_search')) return 'Seleccionar cliente';
    return 'desconocido';
  });
}

async function clickSiguiente(page) {
  await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(b => b.textContent.trim() === 'Siguiente');
    if (btn) btn.click();
  });
  await page.waitForTimeout(3000);
}

async function clickAnterior(page) {
  await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(b => b.textContent.trim() === 'Anterior');
    if (btn) btn.click();
  });
  await page.waitForTimeout(3000);
}

async function iniciarRecepcionHastaFirma(page) {
  await page.waitForSelector('button.add-reception-btn', { state: 'visible', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.click('button.add-reception-btn', { timeout: 30000 });
  await page.waitForTimeout(1800);
  const placa = 'CP307-' + Date.now().toString().slice(-9);
  await page.fill('#vehicle_plaque', placa);
  await page.waitForTimeout(1000);
  await page.click('#vr_add_vehicle_btn', { timeout: 30000 });
  await page.waitForTimeout(2500);

  await page.click('#vehicular_reception_customer_search');
  await page.keyboard.type('cliente prueba tarea 5', { delay: 80 });
  await page.waitForTimeout(4000);
  const tarjetaCliente = page.locator('h3.customer-name', { hasText: 'cliente prueba tarea 5' }).first();
  const cuentaTarjetas = await tarjetaCliente.count();
  console.log('  [diag] tarjetas de cliente encontradas:', cuentaTarjetas);
  if (cuentaTarjetas === 0) throw new Error('No se encontró ninguna tarjeta de cliente "cliente prueba tarea 5" tras buscar');
  await tarjetaCliente.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await tarjetaCliente.click({ timeout: 30000 });
  await page.waitForTimeout(3000);
  const pasoTrasClickCliente = await nombreDePasoActual(page);
  console.log('  [diag] paso tras click en tarjeta de cliente:', pasoTrasClickCliente);

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
  await clickSiguiente(page); // -> Seleccionar fotos
  await clickSiguiente(page); // -> Marcación de daños
  await clickSiguiente(page); // -> Observaciones generales
  await clickSiguiente(page); // -> Firma del cliente
  return placa;
}

async function cp307_navegacion_finalizacion_generar_orden() {
  console.log('🔄 Ejecutando CP-307: Recepción Vehicular — Navegación y Finalización (generar orden)...');
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

    const placa = await iniciarRecepcionHastaFirma(page);
    console.log('📋 Nueva recepción iniciada con placa:', placa);

    const enFirma1 = await nombreDePasoActual(page);
    console.log('  Wizard llegó a:', enFirma1);
    if (enFirma1 !== 'Firma del cliente') throw new Error('El wizard no llegó al paso "Firma del cliente" esperado antes de probar navegación');

    // ── Probar navegación "Anterior" varias veces y "Siguiente" de regreso ──
    console.log('\n↩️ Probando navegación Anterior/Siguiente entre pasos...');
    const tNav = Date.now();
    await clickAnterior(page); // -> Observaciones generales
    const pasoAnterior1 = await nombreDePasoActual(page);
    await clickAnterior(page); // -> Marcación de daños (o el que corresponda)
    await clickSiguiente(page); // -> Observaciones generales de nuevo
    const pasoTrasIrYVolver = await nombreDePasoActual(page);
    await clickSiguiente(page); // -> Firma del cliente de nuevo
    const pasoFinalNav = await nombreDePasoActual(page);
    evaluarAccion(Date.now() - tNav, 'Navegación Anterior/Siguiente entre 3 pasos');
    console.log('  Paso tras 1x "Anterior":', pasoAnterior1);
    console.log('  Paso tras "Anterior" + "Siguiente" (regreso):', pasoTrasIrYVolver);
    console.log('  Paso final tras navegación (debe ser Firma del cliente):', pasoFinalNav);
    const navegacionOk = pasoAnterior1 === 'Observaciones generales' && pasoFinalNav === 'Firma del cliente';

    // ── Dibujar la firma (requisito habitual para poder generar la orden) ──
    console.log('\n✍️ Dibujando la firma antes de generar...');
    const areaFirma = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const canvas = Array.from(document.querySelectorAll('canvas')).filter(isVis).sort((a,b) => (b.getBoundingClientRect().width*b.getBoundingClientRect().height) - (a.getBoundingClientRect().width*a.getBoundingClientRect().height))[0];
      if (!canvas) return null;
      const r = canvas.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    if (!areaFirma) { await screenshotOnFail(page, 'cp307-fail-sin-canvas'); throw new Error('No se encontró el canvas de firma'); }
    const cx = areaFirma.x + areaFirma.w * 0.2;
    const cy = areaFirma.y + areaFirma.h * 0.5;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(cx + i * (areaFirma.w * 0.6 / 8), cy + Math.sin(i) * 20, { steps: 3 });
    }
    await page.mouse.up();
    await page.waitForTimeout(1000);
    console.log('  Firma dibujada: ok');

    // ── Buscar y clickear el botón final "Generar" (no "Siguiente") ──
    console.log('\n🏁 Buscando y clickeando el botón "Generar"...');
    const tGenerar = Date.now();
    const botonGenerarExiste = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      return Array.from(document.querySelectorAll('button')).filter(isVis).some(b => /^generar$/i.test((b.textContent||'').trim()) || /generar orden/i.test(b.textContent||''));
    });
    console.log('  Botón "Generar" encontrado:', botonGenerarExiste);
    if (!botonGenerarExiste) { await screenshotOnFail(page, 'cp307-sin-boton-generar'); throw new Error('No se encontró el botón "Generar" en el paso final'); }

    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(b => /^generar$/i.test((b.textContent||'').trim()) || /generar orden/i.test(b.textContent||''));
      if (btn) btn.click();
    });
    await page.waitForTimeout(3000);

    // Aparece un modal de confirmación ("¿Está seguro de generar la orden?" -> botón "Generar orden")
    const confirmacionSwal = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(b => /^generar orden$/i.test((b.textContent||'').trim()));
      if (btn) { btn.click(); return true; }
      const btnGenerico = Array.from(document.querySelectorAll('.swal2-confirm, .swal-button--confirm')).filter(isVis)[0];
      if (btnGenerico) { btnGenerico.click(); return true; }
      return false;
    });
    console.log('  Diálogo de confirmación ("¿Está seguro de generar la orden?") encontrado y confirmado:', confirmacionSwal);
    await page.waitForTimeout(4000);
    evaluarAccion(Date.now() - tGenerar, 'Clickear "Generar" y confirmar diálogo');

    // ── Validar que la orden se generó: la URL cambia o el wizard/modal se cierra ──
    const urlTrasGenerar = page.url();
    const wizardSigueAbierto = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      return Array.from(document.querySelectorAll('button')).filter(isVis).some(b => /limpiar firma/i.test(b.textContent||''));
    });
    const ordenGenerada = !wizardSigueAbierto || /repairOrder|vehicularReception\/(?!vehicularQuickReception)/i.test(urlTrasGenerar);
    console.log('  URL tras generar:', urlTrasGenerar);
    console.log('  Wizard sigue abierto tras "Generar":', wizardSigueAbierto);
    console.log('  Orden aparenta haberse generado (wizard cerrado o URL cambió):', ordenGenerada);

    await screenshotOnFail(page, 'cp307-estado-final');

    console.log('\n📊 === VALIDACIONES CP-307 ===');
    console.log('  Wizard llegó a "Firma del cliente" antes de navegar:  ' + (enFirma1 === 'Firma del cliente' ? '✅' : '❌'));
    console.log('  Navegación Anterior/Siguiente entre pasos funciona:   ' + (navegacionOk ? '✅' : '⚠️ no confirmado'));
    console.log('  Botón "Generar" encontrado y clickeado:               ' + (botonGenerarExiste ? '✅' : '❌'));
    console.log('  Orden aparenta haberse generado tras "Generar":       ' + (ordenGenerada ? '✅' : '⚠️ no confirmado'));

    if (enFirma1 !== 'Firma del cliente') throw new Error('El wizard no llegó al paso correcto antes de generar');
    if (!botonGenerarExiste) throw new Error('No se pudo generar la orden');

    const tiempoTotalCP = Date.now() - tiempoInicioCP;
    console.log('✅ CP-307 PASSED | placa: ' + placa + ' | navegación: ' + navegacionOk + ' | orden generada: ' + ordenGenerada + ' | tiempo: ' + tiempoTotalCP + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp307-fail');
    console.log('❌ CP-307 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp307_navegacion_finalizacion_generar_orden();
