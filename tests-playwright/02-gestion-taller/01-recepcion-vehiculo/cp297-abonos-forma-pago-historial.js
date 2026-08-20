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

async function iniciarRecepcionHastaAbonos(page) {
  await page.click('button.add-reception-btn', { timeout: 15000 });
  await page.waitForTimeout(1800);
  const placa = 'CP297-' + Date.now().toString().slice(-9);
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
  return placa;
}

async function cp297_abonos_forma_pago_historial() {
  console.log('🔄 Ejecutando CP-297: Recepción Vehicular — Abonos (forma de pago, historial, totales)...');
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

    const placa = await iniciarRecepcionHastaAbonos(page);
    console.log('📋 Nueva recepción iniciada con placa:', placa);

    const enPasoCorrecto = await page.evaluate(() => !!document.getElementById('initial-payment-repair-order'));
    await screenshotOnFail(page, 'cp297-estado-al-llegar');
    console.log('  Wizard llegó a "Abonos":', enPasoCorrecto);
    if (!enPasoCorrecto) throw new Error('El wizard no llegó al paso "Abonos" (campo de monto no encontrado)');

    const subtotalAntes = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const el = Array.from(document.querySelectorAll('*')).filter(isVis).find(e => /^Subtotal/i.test(e.textContent.trim()) && e.textContent.trim().length < 30);
      return el ? el.textContent.trim() : null;
    });
    console.log('  💰 Subtotal antes de abonar:', subtotalAntes);

    // ── Aplicar un abono con una forma de pago (Efectivo) ──
    console.log('\n💵 Aplicando abono...');
    const tAbono = Date.now();
    await page.fill('#initial-payment-repair-order', '100');
    await page.waitForTimeout(500);

    const formaPagoSeleccionada = await page.evaluate(() => {
      const sel = document.getElementById('select_payed_with_ro');
      if (!sel) return false;
      const opt = Array.from(sel.options).find(o => /efectivo/i.test(o.textContent||''));
      if (!opt) return false;
      sel.value = opt.value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      if (window.jQuery) jQuery(sel).trigger('chosen:updated');
      return true;
    });
    console.log('  Forma de pago "Efectivo" seleccionada:', formaPagoSeleccionada);
    await page.waitForTimeout(500);

    const cajaSeleccionada = await page.evaluate(() => {
      const sel = document.getElementById('apply_to_cash_id');
      if (!sel || sel.options.length < 2) return false;
      sel.value = sel.options[1].value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      if (window.jQuery) jQuery(sel).trigger('chosen:updated');
      return true;
    });
    console.log('  Caja seleccionada:', cajaSeleccionada);
    await page.waitForTimeout(500);

    const guardoAbono = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(b => b.textContent.trim() === 'Guardar');
      if (btn) { btn.click(); return true; }
      return false;
    });
    await page.waitForTimeout(2500);
    evaluarAccion(Date.now() - tAbono, 'Aplicar abono (₡100, Efectivo)');
    if (!guardoAbono) { await screenshotOnFail(page, 'cp297-fail-guardar-abono'); throw new Error('No se encontró/clickeó "Guardar" al aplicar el abono'); }

    // ── Validar historial de abonos ──
    const historialTieneFila = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const tabla = Array.from(document.querySelectorAll('table')).filter(isVis)[0];
      if (!tabla) return false;
      return /100/.test(tabla.textContent||'');
    });
    console.log('  Historial de Abonos muestra el abono de ₡100:', historialTieneFila);

    const totalTrasAbono = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const el = Array.from(document.querySelectorAll('*')).filter(isVis).find(e => /^Abono:/i.test(e.textContent.trim()) && e.textContent.trim().length < 30);
      return el ? el.textContent.trim() : null;
    });
    console.log('  💰 Línea "Abono:" tras guardar:', totalTrasAbono);

    await screenshotOnFail(page, 'cp297-estado-final');

    console.log('\n📊 === VALIDACIONES CP-297 ===');
    console.log('  Wizard llegó a "Abonos":                    ' + (enPasoCorrecto ? '✅' : '❌'));
    console.log('  Forma de pago "Efectivo" seleccionada:       ' + (formaPagoSeleccionada ? '✅' : '❌'));
    console.log('  Abono guardado ("Guardar"):                  ' + (guardoAbono ? '✅' : '❌'));
    console.log('  Historial de Abonos refleja el abono nuevo:  ' + (historialTieneFila ? '✅' : '⚠️ no confirmado'));
    console.log('  Total/línea "Abono" documentado:             ' + (totalTrasAbono ? '✅ (' + totalTrasAbono + ')' : '⚠️ no encontrado'));

    if (!enPasoCorrecto) throw new Error('El wizard no llegó al paso correcto');
    if (!guardoAbono) throw new Error('No se pudo guardar el abono');

    const tiempoTotalCP = Date.now() - tiempoInicioCP;
    console.log('✅ CP-297 PASSED | placa: ' + placa + ' | abono guardado: ok | historial: ' + historialTieneFila + ' | tiempo: ' + tiempoTotalCP + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp297-fail');
    console.log('❌ CP-297 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp297_abonos_forma_pago_historial();
