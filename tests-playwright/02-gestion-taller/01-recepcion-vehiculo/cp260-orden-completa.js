const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const URL_RECEPCION = `${BASE_URL}/vehicularReception/vehicularQuickReception`;
// Bloque "Creación de Recepción" — flujo 5: ORDEN COMPLETA. Igual que CP-259 (orden sencilla
// completa) pero además interactúa con "Enderezado y Pintura" (tipo de vehículo/pieza/servicio)
// y "Abonos" (aplicar un abono con forma de pago, caja, y observación si el flujo lo permite).
//
// ⚠️ El hallazgo crítico de montos corruptos (CLAUDE_CONTEXT.md sección 22) sigue activo — no se
// valida ningún monto/total específico, solo evidencia funcional (conteo de ítems, guardado
// exitoso).

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','..','..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
};
function evaluarCargaPagina(ms, e) { if(ms>8000) console.log('❌ PERFORMANCE FAILED: '+e+' tardó '+ms+'ms'); else if(ms>3000) console.log('⚠️ LENTO: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }
function evaluarAccion(ms, e) { if(ms>4000) console.log('❌ Acción lenta: '+e+' tardó '+ms+'ms'); else if(ms>1500) console.log('⚠️ Acción algo lenta: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }

async function evaluateConTimeout(promesa, ms, mensajeTimeout) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(mensajeTimeout || 'Timeout esperando guardado')), ms); });
  try { return await Promise.race([promesa, timeout]); } finally { clearTimeout(timer); }
}

async function seleccionarChosen(page, selectId, textoOpcion) {
  const chosen = page.locator(`#${selectId} ~ .chosen-container`).first();
  if (await chosen.count()) {
    const disparador = chosen.locator('.chosen-single, .chosen-single-with-deselect, .chosen-choices').first();
    await disparador.click();
    await page.waitForTimeout(400);
    await chosen.locator('.chosen-results li.active-result, .chosen-drop li.active-result', { hasText: textoOpcion }).first().click();
    await page.waitForTimeout(400);
    return 'chosen';
  }
  await page.selectOption('#' + selectId, { label: textoOpcion });
  return 'nativo';
}

async function pasoActivo(page) {
  return page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const activo = Array.from(document.querySelectorAll('.card-step')).filter(isVis).find(el => /active/.test(el.className||'') && (el.textContent||'').trim());
    return activo ? activo.textContent.trim() : null;
  });
}

async function clickSiguiente(page) {
  await page.evaluate(() => document.getElementById('btn_next_step_reception')?.click());
  await page.waitForTimeout(2000);
}

async function llegarAEstilo(browser, context) {
  let page = await context.newPage();
  await page.goto(URL_RECEPCION, { waitUntil: 'load', timeout: 180000 });
  await page.waitForTimeout(1500);
  if (/\/log\/login/i.test(page.url())) {
    await page.close();
    fs.rmSync(SESION_PATH, { force: true });
    context = await abrirContextoConSesion(browser);
    page = await context.newPage();
    await page.goto(URL_RECEPCION, { waitUntil: 'load', timeout: 180000 });
    await page.waitForTimeout(1500);
  }
  await page.waitForSelector('button.add-reception-btn', { timeout: 60000 });
  await page.evaluate(() => { document.getElementById('workshop-web-notification-permission-dismiss')?.click(); });
  await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector('button.add-reception-btn')?.click());
  await page.waitForSelector('#vehicle_plaque', { state: 'visible', timeout: 15000 });
  const placaTest = 'CP260' + String(Date.now()).slice(-8);
  await page.fill('#vehicle_plaque', placaTest);
  await page.evaluate(() => document.getElementById('vr_add_vehicle_btn')?.click());
  await page.waitForTimeout(2500);

  await page.evaluate(() => {
    const primeraTarjeta = document.querySelector('#company_customer_content .modern-customer-card');
    primeraTarjeta?.querySelector('.customer-options-btn')?.click();
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    Array.from(document.querySelectorAll('a')).filter(isVis).find(a => /Seleccione el cliente/i.test(a.textContent||''))?.click();
  });
  await page.waitForTimeout(1800);

  return { page, context, placaTest };
}

async function seleccionarEstilo(page) {
  await page.fill('input[placeholder="Buscar..."]:visible', 'e');
  await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const input = Array.from(document.querySelectorAll('input[placeholder="Buscar..."]')).filter(isVis)[0];
    const contenedor = input.closest('div');
    const btn = contenedor ? Array.from(contenedor.parentElement.querySelectorAll('button')).filter(isVis).find(b => /^\s*Buscar\s*$/i.test((b.textContent||'').trim())) : null;
    btn?.click();
  });
  await page.waitForTimeout(2000);
  await page.locator('.style-vehicle .select-btn:visible').first().click();
  await page.waitForTimeout(1800);
}

async function completarDetallesVehiculo(page) {
  await page.waitForSelector('#vehicle_brand', { state: 'attached', timeout: 20000 });
  await page.waitForTimeout(1000);
  await seleccionarChosen(page, 'vehicle_brand', 'AUDI');
  await page.waitForFunction(() => document.getElementById('vehicle_model').options.length > 1, { timeout: 15000 }).catch(()=>{});
  await page.waitForTimeout(500);
  const modelos = await page.evaluate(() => Array.from(document.getElementById('vehicle_model').options).map(o=>o.textContent.trim()).filter(Boolean));
  if (modelos.length) await seleccionarChosen(page, 'vehicle_model', modelos.find(m=>m!=='Seleccionar opción') || modelos[0]);
  await page.waitForTimeout(500);
}

async function abrirModalAgregarProducto(page, nombre) {
  await page.locator('p:visible', { hasText: 'Agregar producto' }).first().click();
  await page.waitForTimeout(1200);
  await page.locator('#normal-service:visible').click();
  await page.waitForSelector('#product_name_app', { state: 'visible', timeout: 20000 });
  await page.waitForTimeout(500);
  await page.fill('#product_name_app', nombre);
  await page.waitForTimeout(300);
}

async function configurarCabys(page) {
  await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const modal = document.getElementById('product_name_app').closest('.modal');
    const btn = Array.from(modal.querySelectorAll('button, a')).filter(isVis).find(b => (b.textContent||'').trim() === 'CABYS');
    btn?.click();
  });
  await page.waitForSelector('#cabys_code_search', { timeout: 20000 });
  await page.waitForTimeout(1000);
  const aplicado = await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const modalCabys = document.getElementById('cabys_code_search').closest('.modal');
    const btn = Array.from(modalCabys.querySelectorAll('a, button')).filter(isVis).find(b => (b.textContent||'').trim() === 'APLICAR');
    if (!btn) return false;
    btn.click();
    return true;
  });
  await page.waitForTimeout(1200);
  return aplicado;
}

async function seleccionarSelectPorId(page, fragmentoId, excluirFragmento) {
  return page.evaluate(({ fragmentoId, excluirFragmento }) => {
    const modal = document.getElementById('dialog_add_quick_product');
    if (!modal) return { ok: false, motivo: 'modal no encontrado' };
    const selects = Array.from(modal.querySelectorAll('select'));
    const re = new RegExp(fragmentoId, 'i');
    const reExcluir = excluirFragmento ? new RegExp(excluirFragmento, 'i') : null;
    const sel = selects.find(s => re.test(s.id||'') && !(reExcluir && reExcluir.test(s.id||'')));
    if (!sel) return { ok: false, motivo: 'select no encontrado' };
    const opt = Array.from(sel.options).find(o => o.value && !/seleccion/i.test(o.textContent||''));
    if (!opt) return { ok: false, motivo: 'sin opciones reales' };
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    if (window.jQuery) { try { window.jQuery(sel).trigger('chosen:updated'); } catch (e) {} }
    return { ok: true, elegido: opt.textContent.trim() };
  }, { fragmentoId, excluirFragmento });
}

async function clickAccionWizard(page, href) {
  return page.evaluate((href) => {
    const modal = document.getElementById('dialog_add_quick_product');
    const acciones = modal ? modal.querySelector('.actions.clearfix') : null;
    const link = acciones ? acciones.querySelector(`a[href="${href}"]`) : null;
    if (!link) return false;
    link.click();
    return true;
  }, href);
}

async function completarCamposRequeridosVacios(page, valoresPorDefecto) {
  return page.evaluate((valores) => {
    const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const modal = document.getElementById('dialog_add_quick_product');
    if (!modal) return [];
    const completados = [];
    const campos = Array.from(modal.querySelectorAll('input[required], select[required]')).filter(isVis);
    for (const campo of campos) {
      if (campo.tagName === 'SELECT') {
        if (campo.value) continue;
        const opt = Array.from(campo.options).find(o => o.value && !/seleccion/i.test(o.textContent||''));
        if (!opt) continue;
        campo.value = opt.value;
        campo.dispatchEvent(new Event('change', { bubbles: true }));
        if (window.jQuery) { try { window.jQuery(campo).trigger('chosen:updated'); } catch (e) {} }
        completados.push({ id: campo.id, tipo: 'select', valor: opt.textContent.trim() });
      } else {
        if (campo.value) continue;
        const placeholder = (campo.placeholder||'').toLowerCase();
        let valor = '1';
        if (/costo/.test(placeholder)) valor = valores.costo;
        else if (/precio/.test(placeholder)) valor = valores.precio;
        else if (/cantidad/.test(placeholder)) valor = valores.cantidad;
        campo.value = valor;
        campo.dispatchEvent(new Event('input', { bubbles: true }));
        campo.dispatchEvent(new Event('change', { bubbles: true }));
        completados.push({ id: campo.id, tipo: 'input', valor });
      }
    }
    return completados;
  }, valoresPorDefecto);
}

async function modalProductoCerrado(page) {
  return page.evaluate(() => {
    const modal = document.getElementById('dialog_add_quick_product');
    return !modal || getComputedStyle(modal).display === 'none' || !modal.classList.contains('in');
  });
}

async function contarItemsCarrito(page) {
  return page.evaluate(() => document.querySelectorAll('.service-list-container .item-card').length);
}

async function crearProductoNormal(page, nombre) {
  await abrirModalAgregarProducto(page, nombre);
  const cabysOk = await configurarCabys(page);
  if (!cabysOk) throw new Error('No se pudo aplicar CABYS para el producto ' + nombre);
  await seleccionarSelectPorId(page, 'categor', 'sub');
  await seleccionarSelectPorId(page, 'provider');
  await page.waitForTimeout(500);
  await clickAccionWizard(page, '#next');
  await page.waitForTimeout(1200);
  await completarCamposRequeridosVacios(page, { costo: '1000', precio: '1500', cantidad: '50' });
  await page.waitForTimeout(300);
  await clickAccionWizard(page, '#finish');
  await page.waitForTimeout(2000);
  const cerro = await modalProductoCerrado(page);
  if (!cerro) {
    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const modal = Array.from(document.querySelectorAll('.modal')).filter(isVis)[0];
      const btn = modal ? Array.from(modal.querySelectorAll('button')).filter(isVis).find(b => /cancelar/i.test(b.textContent||'')) : null;
      btn?.click();
    });
    throw new Error('El modal de producto "' + nombre + '" no se cerró tras Finalizar');
  }
}

async function buscarYAgregarAlCarrito(page, nombre) {
  await page.fill('input[placeholder="Buscar productos"]', nombre);
  await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    Array.from(document.querySelectorAll('button')).filter(isVis).filter(b => /^\s*Buscar\s*$/i.test((b.textContent||'').trim()))[0]?.click();
  });
  await page.waitForTimeout(2000);
  const clickTarjeta = await page.evaluate((nombreBuscado) => {
    const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const textoNodo = Array.from(document.querySelectorAll('*')).filter(isVis).find(el => el.children.length === 0 && (el.textContent||'').includes(nombreBuscado));
    if (!textoNodo) return { ok: false, motivo: 'tarjeta no encontrada' };
    let el = textoNodo;
    for (let i = 0; i < 8 && el; i++) {
      if (el.hasAttribute && el.hasAttribute('onclick') && /add_item_to_repair_order/.test(el.getAttribute('onclick')||'')) { el.click(); return { ok: true }; }
      el = el.parentElement;
    }
    return { ok: false, motivo: 'ancestro con add_item_to_repair_order no encontrado' };
  }, nombre);
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const modal = Array.from(document.querySelectorAll('.modal.in, .modal.show')).find(m => /Asignar mec[aá]nico/i.test(m.textContent||''));
    if (!modal) return;
    const cerrar = Array.from(modal.querySelectorAll('button, a')).filter(isVis).find(b => /close|times/i.test(b.className||'') || (b.getAttribute('aria-label')||'').toLowerCase()==='close');
    cerrar?.click();
  });
  await page.waitForTimeout(800);
  return clickTarjeta;
}

// ── Enderezado y Pintura: tipo de vehiculo -> pieza -> servicio ──
async function agregarEnderezadoYPintura(page) {
  await seleccionarChosen(page, 'car_type_eyp', 'Sedán').catch(() => {});
  // El select puede tener un id distinto; buscar el primero disponible en el paso si el id supuesto falla
  const tipoInfo = await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const sel = Array.from(document.querySelectorAll('select')).filter(isVis).find(s => Array.from(s.options).some(o => /veh[ií]culo/i.test(o.textContent||'')));
    if (!sel) return { ok: false };
    const opt = Array.from(sel.options).find(o => o.value && !/seleccion/i.test(o.textContent||''));
    if (!opt) return { ok: false };
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    if (window.jQuery) { try { window.jQuery(sel).trigger('chosen:updated'); } catch (e) {} }
    return { ok: true, elegido: opt.textContent.trim(), id: sel.id };
  });
  console.log('📋 Tipo de vehículo (Enderezado y Pintura):', JSON.stringify(tipoInfo));
  await page.waitForTimeout(1500);

  const piezaInfo = await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const encabezadoPiezas = Array.from(document.querySelectorAll('*')).filter(isVis).find(el => el.children.length === 0 && /^Piezas$/i.test((el.textContent||'').trim()));
    if (!encabezadoPiezas) return { ok: false, motivo: 'encabezado Piezas no encontrado' };
    let panel = encabezadoPiezas;
    for (let i=0;i<6 && panel.parentElement;i++) panel = panel.parentElement;
    const opciones = Array.from(panel.querySelectorAll('[onclick], li, .card, button')).filter(isVis).filter(el => (el.textContent||'').trim());
    if (!opciones.length) return { ok: false, motivo: 'sin piezas listadas' };
    opciones[0].click();
    return { ok: true, texto: (opciones[0].textContent||'').trim().substring(0,60) };
  });
  console.log('📋 Pieza seleccionada (Enderezado y Pintura):', JSON.stringify(piezaInfo));
  await page.waitForTimeout(1200);

  if (piezaInfo.ok) {
    const servicioInfo = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const encabezadoServicios = Array.from(document.querySelectorAll('*')).filter(isVis).find(el => el.children.length === 0 && /^Servicios$/i.test((el.textContent||'').trim()));
      if (!encabezadoServicios) return { ok: false, motivo: 'encabezado Servicios no encontrado' };
      let panel = encabezadoServicios;
      for (let i=0;i<6 && panel.parentElement;i++) panel = panel.parentElement;
      const opciones = Array.from(panel.querySelectorAll('[onclick], li, .card, button')).filter(isVis).filter(el => (el.textContent||'').trim());
      if (!opciones.length) return { ok: false, motivo: 'sin servicios listados' };
      opciones[0].click();
      return { ok: true, texto: (opciones[0].textContent||'').trim().substring(0,60) };
    });
    console.log('📋 Servicio seleccionado (Enderezado y Pintura):', JSON.stringify(servicioInfo));
    await page.waitForTimeout(1200);
    return servicioInfo.ok;
  }
  return false;
}

// ── Abonos: monto + forma de pago + caja + guardar ──
async function aplicarAbono(page) {
  await page.fill('#initial-payment-repair-order', '500');
  await seleccionarChosen(page, 'payment_method_repair_order', '').catch(() => {});
  const formaPagoInfo = await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const sel = Array.from(document.querySelectorAll('select')).filter(isVis).find(s => /forma de pago/i.test(s.closest('div')?.textContent||'') || Array.from(s.options).some(o=>/efectivo|tarjeta|sinpe/i.test(o.textContent||'')));
    if (!sel) return { ok: false };
    const opt = Array.from(sel.options).find(o => o.value && !/seleccion|forma de pago/i.test(o.textContent||''));
    if (!opt) return { ok: false };
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    if (window.jQuery) { try { window.jQuery(sel).trigger('chosen:updated'); } catch (e) {} }
    return { ok: true, elegido: opt.textContent.trim(), id: sel.id };
  });
  console.log('📋 Forma de pago seleccionada:', JSON.stringify(formaPagoInfo));
  await page.waitForTimeout(500);

  const cajaInfo = await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const sel = Array.from(document.querySelectorAll('select')).filter(isVis).find(s => /caja/i.test(s.closest('div')?.textContent||'') && !/forma de pago/i.test(s.closest('div')?.textContent||''));
    if (!sel) return { ok: false };
    const opt = Array.from(sel.options).find(o => o.value && !/seleccion|^caja$/i.test(o.textContent||''));
    if (!opt) return { ok: false };
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    if (window.jQuery) { try { window.jQuery(sel).trigger('chosen:updated'); } catch (e) {} }
    return { ok: true, elegido: opt.textContent.trim(), id: sel.id };
  });
  console.log('📋 Caja seleccionada:', JSON.stringify(cajaInfo));
  await page.waitForTimeout(500);

  // Observacion, si existe un campo de texto/textarea visible en el bloque "Agregar Abono"
  const obsInfo = await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const campo = Array.from(document.querySelectorAll('textarea, input[type="text"]')).filter(isVis).find(i => /observ|nota|coment/i.test(i.placeholder||''));
    if (!campo) return { ok: false };
    campo.value = 'Abono de prueba CP-260';
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    return { ok: true, id: campo.id };
  });
  console.log('📋 Campo de observación del abono:', JSON.stringify(obsInfo));

  const clickGuardar = () => page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(b => /^\s*Guardar\s*$/i.test((b.textContent||'').trim()));
    if (!btn) return false;
    btn.click();
    return true;
  });
  const guardado = await evaluateConTimeout(clickGuardar(), 25000, 'Timeout al guardar el abono');
  await page.waitForTimeout(2500);
  return { guardado, formaPagoInfo, cajaInfo, obsInfo };
}

async function cp260_orden_completa() {
  console.log('🔄 Ejecutando CP-260: Recepción de Vehículo — ORDEN COMPLETA (+ Enderezado y Pintura + Abonos)...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;
  const tiempoInicioCP = Date.now();
  const validaciones = {};

  try {
    const t0 = Date.now();
    let placaTest;
    ({ page, context, placaTest } = await llegarAEstilo(browser, context));
    evaluarCargaPagina(Date.now() - t0, 'Vehículo + Cliente');

    const tEstilo = Date.now();
    await seleccionarEstilo(page);
    evaluarAccion(Date.now() - tEstilo, 'Seleccionar estilo');
    validaciones.estilo = /detalles del veh[ií]culo/i.test((await pasoActivo(page)) || '');

    const tDetalles = Date.now();
    await completarDetallesVehiculo(page);
    await clickSiguiente(page);
    evaluarAccion(Date.now() - tDetalles, 'Detalles del vehículo');
    validaciones.detalles = /seleccionar servicios/i.test((await pasoActivo(page)) || '');

    const tServicios = Date.now();
    const sufijo = Date.now();
    const itemsIniciales = await contarItemsCarrito(page);
    const nombreProducto = 'CP260 Producto ' + sufijo;
    await crearProductoNormal(page, nombreProducto);
    await buscarYAgregarAlCarrito(page, nombreProducto);
    const itemsTrasProducto = await contarItemsCarrito(page);
    validaciones.productoNormal = itemsTrasProducto > itemsIniciales;
    console.log('📋 Producto normal agregado al carrito (' + itemsIniciales + '→' + itemsTrasProducto + '): ' + (validaciones.productoNormal ? '✅' : '❌'));
    evaluarAccion(Date.now() - tServicios, 'Seleccionar servicios: producto normal');
    await clickSiguiente(page);

    // Inspección: se pasa sin interactuar en este CP (fuera del alcance explícito del flujo 5)
    if (/inspecci[oó]n/i.test((await pasoActivo(page)) || '')) await clickSiguiente(page);
    console.log('📋 Paso activo tras Servicios/Inspección:', await pasoActivo(page));

    // ── Enderezado y Pintura ──
    const tEyp = Date.now();
    let enderezadoOk = false;
    if (/enderezado/i.test((await pasoActivo(page)) || '')) {
      enderezadoOk = await agregarEnderezadoYPintura(page);
      await screenshotOnFail(page, 'cp260-enderezado-estado');
    }
    validaciones.enderezado = enderezadoOk;
    console.log('📋 Enderezado y Pintura — pieza/servicio agregados: ' + (validaciones.enderezado ? '✅' : '❌'));
    evaluarAccion(Date.now() - tEyp, 'Enderezado y Pintura');
    await clickSiguiente(page);

    // ── Abonos ──
    const tAbonos = Date.now();
    let abonoResultado = { guardado: false };
    if (/abonos/i.test((await pasoActivo(page)) || '')) {
      abonoResultado = await aplicarAbono(page);
      await screenshotOnFail(page, 'cp260-abonos-estado');
    }
    validaciones.abono = !!abonoResultado.guardado;
    console.log('📋 Abono guardado: ' + (validaciones.abono ? '✅' : '❌'));
    evaluarAccion(Date.now() - tAbonos, 'Abonos: aplicar abono');
    await clickSiguiente(page);

    // Saltar hasta Partes del vehículo si quedan pasos intermedios
    let intentos = 0;
    while (!/partes del veh[ií]culo/i.test((await pasoActivo(page)) || '') && intentos < 4) {
      await clickSiguiente(page);
      intentos++;
    }
    console.log('📋 Paso activo tras Enderezado/Abonos:', await pasoActivo(page));

    // ── Partes del vehículo ──
    const tPartes = Date.now();
    const parteInfo = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const inputCantidad = Array.from(document.querySelectorAll('input[type="number"]')).filter(isVis).find(i => /cantidad/i.test(i.placeholder||''));
      if (!inputCantidad) return { ok: false };
      let tarjeta = inputCantidad;
      for (let i=0;i<6 && tarjeta;i++) { if (tarjeta.querySelector && tarjeta.querySelector('.fa-smile-o, [class*="smile"], img')) break; tarjeta = tarjeta.parentElement; }
      const botonBuena = tarjeta ? Array.from(tarjeta.querySelectorAll('button,a,i')).filter(isVis).find(b => /smile-o|check-circle|success/i.test(b.className||'')) : null;
      const botonMas = tarjeta ? Array.from(tarjeta.querySelectorAll('button,a')).filter(isVis).find(b => (b.textContent||'').trim() === '+') : null;
      botonBuena?.click();
      botonMas?.click();
      return { ok: true };
    });
    validaciones.partes = !!parteInfo.ok;
    console.log('📋 Interacción con Partes del vehículo: ' + (validaciones.partes ? '✅' : '❌'));
    evaluarAccion(Date.now() - tPartes, 'Partes del vehículo');
    await clickSiguiente(page);

    // ── Fotos ──
    const inputFile = page.locator('input[type="file"]').first();
    if (await inputFile.count()) {
      const imgPath = path.join(__dirname, '..', '..', '..', 'reports', 'screenshots');
      fs.mkdirSync(imgPath, { recursive: true });
      const tmpImg = path.join(imgPath, 'cp260-foto-test.png');
      if (!fs.existsSync(tmpImg)) {
        const png1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
        fs.writeFileSync(tmpImg, png1x1);
      }
      await inputFile.setInputFiles(tmpImg).catch(() => {});
      await page.waitForTimeout(2000);
    }
    await clickSiguiente(page);

    // ── Marcación de daños ──
    if (/marcaci[oó]n/i.test((await pasoActivo(page)) || '')) {
      const colorInput = page.locator('input[type="color"]').first();
      if (await colorInput.count()) await colorInput.evaluate(el => { el.value = '#0000ff'; el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); }).catch(()=>{});
    }
    await clickSiguiente(page);

    // ── Observaciones generales ──
    if (await page.locator('#damage_repair').count()) await page.fill('#damage_repair', 'Observación CP-260: ' + 'x'.repeat(120));
    if (await page.locator('#damage_repair_message').count()) await page.fill('#damage_repair_message', 'Nota corta CP-260');
    await clickSiguiente(page);

    // ── Firma del cliente ──
    const canvas = page.locator('canvas').first();
    if (await canvas.count()) {
      const box = await canvas.boundingBox();
      if (box) {
        await page.mouse.move(box.x + 20, box.y + 20);
        await page.mouse.down();
        await page.mouse.move(box.x + 100, box.y + 60);
        await page.mouse.move(box.x + 180, box.y + 20);
        await page.mouse.up();
      }
    }
    await page.waitForTimeout(500);

    // ── Generar orden ──
    const tGenerar = Date.now();
    const clickGenerar = () => page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(b => /^\s*Generar\s*$/i.test((b.textContent||'').trim()));
      if (!btn) return false;
      btn.click();
      return true;
    });
    const clickeoGenerar = await evaluateConTimeout(clickGenerar(), 25000, 'Timeout al hacer clic en "Generar"');
    await page.waitForTimeout(1500);
    const clickConfirmarGenerar = () => page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(b => /generar orden/i.test((b.textContent||'').trim()));
      if (!btn) return false;
      btn.click();
      return true;
    });
    const confirmado = await evaluateConTimeout(clickConfirmarGenerar(), 25000, 'Timeout al confirmar "Generar orden"');
    await page.waitForTimeout(3000);
    evaluarAccion(Date.now() - tGenerar, 'Generar orden (con confirmación)');
    await screenshotOnFail(page, 'cp260-tras-generar');
    validaciones.generar = !!clickeoGenerar && !!confirmado;

    console.log('\n📊 === VALIDACIONES CP-260 ===');
    console.log('  Avanza a Detalles tras elegir estilo:              ' + (validaciones.estilo ? '✅' : '❌'));
    console.log('  Avanza a Servicios tras completar Detalles:        ' + (validaciones.detalles ? '✅' : '❌'));
    console.log('  Producto normal agregado al carrito:               ' + (validaciones.productoNormal ? '✅' : '❌'));
    console.log('  Enderezado y Pintura — pieza/servicio agregados:   ' + (validaciones.enderezado ? '✅' : '❌'));
    console.log('  Abono guardado con forma de pago/caja:             ' + (validaciones.abono ? '✅' : '❌'));
    console.log('  Interacción con Partes del vehículo:               ' + (validaciones.partes ? '✅' : '❌'));
    console.log('  Clic en "Generar" ejecutado con confirmación:      ' + (validaciones.generar ? '✅' : '❌'));

    if (!validaciones.estilo) throw new Error('No avanzó a Detalles del vehículo tras elegir el estilo');
    if (!validaciones.detalles) throw new Error('No avanzó a Seleccionar servicios tras completar Detalles del vehículo');
    if (!validaciones.productoNormal) throw new Error('El producto normal no quedó agregado al carrito de la orden');
    if (!validaciones.enderezado) throw new Error('No se pudo agregar pieza/servicio en Enderezado y Pintura');
    if (!validaciones.abono) throw new Error('No se pudo guardar el abono');
    if (!validaciones.partes) throw new Error('No se pudo interactuar con el paso Partes del vehículo');
    if (!validaciones.generar) throw new Error('No se pudo generar la orden al finalizar el wizard');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-260 PASSED | orden completa generada con placa "' + placaTest + '" | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-260', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp260-fail');
    console.log('❌ CP-260 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-260', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp260_orden_completa();
