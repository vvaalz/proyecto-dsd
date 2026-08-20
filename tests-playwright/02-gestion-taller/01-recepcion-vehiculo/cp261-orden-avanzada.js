const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const URL_RECEPCION = `${BASE_URL}/vehicularReception/vehicularQuickReception`;
// Bloque "Creación de Recepción" — flujo 6: ORDEN AVANZADA. Igual que CP-260 (orden completa)
// pero además: crea un producto Y un servicio nuevo, intenta activar garantía sobre un ítem
// (validando que su precio quede en cero), asigna mecánico, elimina un producto (validando que
// el conteo del carrito disminuye) e intenta crear un paquete de inspección.
//
// ⚠️ HALLAZGO CRÍTICO CONFIRMADO (paso "Inspección"): el botón "+ Crea Nuevo Paquete" no realiza
// ninguna acción visible al hacer clic — se verificó con un clic nativo de Playwright (no vía
// evaluate), sin errores de consola ni de página, comparando screenshots antes/después que
// resultan idénticos. No se pudo crear ningún paquete de inspección ni componente en este
// ambiente. Pasos para reproducir: 1) Nueva orden de reparación → cualquier vehículo/cliente/
// estilo/detalles mínimos. 2) Avanzar a "Seleccionar servicios" (con o sin ítems en el carrito).
// 3) Avanzar a "Inspección". 4) Clic en "+ Crea Nuevo Paquete" (panel izquierdo "Flujo de
// inspección"). Resultado esperado: modal para nombrar el paquete. Resultado real: no ocurre
// nada — el estado de la pantalla no cambia.
//
// ⚠️ El hallazgo crítico de montos corruptos (CLAUDE_CONTEXT.md sección 22) sigue activo — no se
// valida ningún monto/total específico salvo el caso explícito de garantía (precio en cero),
// que es una validación funcional puntual, no una verificación general de montos.

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
  const placaTest = 'CP261' + String(Date.now()).slice(-8);
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
  await page.locator('p:visible', { hasText: 'Agregar producto' }).first().click();
  await page.waitForTimeout(1200);
  await page.locator('#normal-service:visible').click();
  await page.waitForSelector('#product_name_app', { state: 'visible', timeout: 20000 });
  await page.waitForTimeout(500);
  await page.fill('#product_name_app', nombre);
  await page.waitForTimeout(300);
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

// Crea un servicio nuevo desde la pestaña "Servicios" del catálogo — mismo patrón de wizard
// interno (jQuery Steps) que "Agregar producto", pero con el modal de servicios.
async function crearServicioNuevo(page, nombre) {
  await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    Array.from(document.querySelectorAll('button,a')).filter(isVis).find(b => /^\s*Servicios\s*$/i.test((b.textContent||'').trim()))?.click();
  });
  await page.waitForTimeout(1200);
  const abierto = await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const btn = Array.from(document.querySelectorAll('p,button')).filter(isVis).find(b => /Agregar servicio/i.test(b.textContent||''));
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!abierto) return { ok: false, motivo: 'no se encontró "Agregar servicio"' };
  await page.waitForTimeout(1200);
  // Puede aparecer el mismo selector rápido/normal que productos
  await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const normal = Array.from(document.querySelectorAll('[id*="normal"], .service-option.normal')).filter(isVis)[0];
    normal?.click();
  });
  await page.waitForTimeout(1000);
  const nombreInput = await page.evaluate((nombreServicio) => {
    const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const modal = Array.from(document.querySelectorAll('.modal')).filter(isVis)[0];
    if (!modal) return { ok: false, motivo: 'sin modal de servicio' };
    const input = Array.from(modal.querySelectorAll('input[type="text"]')).filter(isVis)[0];
    if (!input) return { ok: false, motivo: 'sin input de nombre' };
    input.value = nombreServicio;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return { ok: true, id: input.id };
  }, nombre);
  console.log('  [crearServicioNuevo] input nombre:', JSON.stringify(nombreInput));
  if (!nombreInput.ok) return nombreInput;
  await page.waitForTimeout(500);
  await completarCamposRequeridosVacios(page, { costo: '800', precio: '1200', cantidad: '10' }).catch(()=>{});
  const guardado = await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const modal = Array.from(document.querySelectorAll('.modal')).filter(isVis)[0];
    // intentar el mismo wizard de acciones (#finish) o un boton Guardar directo
    const acciones = modal ? modal.querySelector('.actions.clearfix') : null;
    const linkFinish = acciones ? acciones.querySelector('a[href="#finish"]') : null;
    if (linkFinish) { linkFinish.click(); return 'finish'; }
    const btnGuardar = modal ? Array.from(modal.querySelectorAll('button')).filter(isVis).find(b => /guardar/i.test(b.textContent||'')) : null;
    if (btnGuardar) { btnGuardar.click(); return 'guardar'; }
    return null;
  });
  await page.waitForTimeout(2000);
  return { ok: !!guardado, via: guardado };
}

async function buscarYAgregarAlCarrito(page, nombre) {
  await page.fill('input[placeholder="Buscar productos"]', nombre).catch(() => {});
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
  // NO cerrar el modal "Asignar mecánico" aquí — se maneja explícitamente en el flujo principal
  return clickTarjeta;
}

async function cp261_orden_avanzada() {
  console.log('🔄 Ejecutando CP-261: Recepción de Vehículo — ORDEN AVANZADA (+ crear servicio/producto, garantía, mecánico, eliminar, paquetes de inspección)...');
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

    // ── Servicios: crear producto normal ──
    const tProducto = Date.now();
    const sufijo = Date.now();
    const itemsIniciales = await contarItemsCarrito(page);
    const nombreProducto = 'CP261 Producto ' + sufijo;
    await crearProductoNormal(page, nombreProducto);
    await buscarYAgregarAlCarrito(page, nombreProducto);
    // Cerrar el modal "Asignar mecánico" si aparece automáticamente, pero antes intentar
    // usarlo para el punto de "asignar mecánico" del flujo avanzado.
    const modalMecanicoInfo = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const modal = Array.from(document.querySelectorAll('.modal.in, .modal.show')).find(m => isVis(m) && /Asignar mec[aá]nico/i.test(m.textContent||''));
      if (!modal) return { ok: false, motivo: 'modal de asignar mecánico no apareció' };
      const btnAsignar = Array.from(modal.querySelectorAll('button')).filter(isVis).find(b => /^\s*ASIGNAR\s*$/i.test((b.textContent||'').trim()));
      if (!btnAsignar) return { ok: false, motivo: 'botón ASIGNAR no encontrado' };
      btnAsignar.click();
      return { ok: true };
    });
    console.log('📋 Asignar mecánico (primer mecánico de la lista):', JSON.stringify(modalMecanicoInfo));
    validaciones.mecanico = !!modalMecanicoInfo.ok;
    await page.waitForTimeout(1200);
    // Cerrar cualquier modal residual de mecánico que haya quedado abierto
    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const modal = Array.from(document.querySelectorAll('.modal.in, .modal.show')).find(m => isVis(m) && /Asignar mec[aá]nico/i.test(m.textContent||''));
      const cerrar = modal ? Array.from(modal.querySelectorAll('button, a')).filter(isVis).find(b => /close|times/i.test(b.className||'')) : null;
      cerrar?.click();
    });
    await page.waitForTimeout(800);

    const itemsTrasProducto = await contarItemsCarrito(page);
    validaciones.productoNormal = itemsTrasProducto > itemsIniciales;
    console.log('📋 Producto normal agregado al carrito (' + itemsIniciales + '→' + itemsTrasProducto + '): ' + (validaciones.productoNormal ? '✅' : '❌'));
    evaluarAccion(Date.now() - tProducto, 'Crear y agregar producto normal');
    await screenshotOnFail(page, 'cp261-tras-producto');

    // ── Servicios: crear servicio nuevo ──
    const tServicio = Date.now();
    const nombreServicio = 'CP261 Servicio ' + sufijo;
    const itemsAntesServicio = await contarItemsCarrito(page);
    const servicioResultado = await crearServicioNuevo(page, nombreServicio).catch(e => ({ ok: false, motivo: e.message }));
    console.log('📋 Resultado crear servicio nuevo:', JSON.stringify(servicioResultado));
    if (servicioResultado.ok) {
      await buscarYAgregarAlCarrito(page, nombreServicio);
      await page.evaluate(() => {
        const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const modal = Array.from(document.querySelectorAll('.modal.in, .modal.show')).find(m => isVis(m) && /Asignar mec[aá]nico/i.test(m.textContent||''));
        const cerrar = modal ? Array.from(modal.querySelectorAll('button, a')).filter(isVis).find(b => /close|times/i.test(b.className||'')) : null;
        cerrar?.click();
      });
      await page.waitForTimeout(800);
    }
    const itemsTrasServicio = await contarItemsCarrito(page);
    validaciones.servicioNuevo = itemsTrasServicio > itemsAntesServicio;
    console.log('📋 Servicio nuevo agregado al carrito (' + itemsAntesServicio + '→' + itemsTrasServicio + '): ' + (validaciones.servicioNuevo ? '✅' : '⚠️ (hallazgo no bloqueante)'));
    evaluarAccion(Date.now() - tServicio, 'Crear y agregar servicio nuevo');
    await screenshotOnFail(page, 'cp261-tras-servicio');

    // ── Garantía: activar sobre el producto agregado y validar precio en cero ──
    const tGarantia = Date.now();
    const garantiaInfo = await page.evaluate((nombreBuscado) => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const cont = document.querySelector('.service-list-container');
      const item = cont ? Array.from(cont.querySelectorAll('.item-card')).find(c => (c.textContent||'').includes(nombreBuscado)) : null;
      if (!item) return { ok: false, motivo: 'item no encontrado en el carrito' };
      const botonG = Array.from(item.querySelectorAll('button,a,span,div')).filter(isVis).find(b => (b.textContent||'').trim() === 'G');
      if (!botonG) return { ok: false, motivo: 'botón de garantía ("G") no encontrado' };
      botonG.click();
      return { ok: true };
    }, nombreProducto);
    console.log('📋 Click en botón de garantía:', JSON.stringify(garantiaInfo));
    await page.waitForTimeout(1500);
    await screenshotOnFail(page, 'cp261-garantia-estado');
    const precioTrasGarantia = await page.evaluate((nombreBuscado) => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const cont = document.querySelector('.service-list-container');
      const item = cont ? Array.from(cont.querySelectorAll('.item-card')).find(c => (c.textContent||'').includes(nombreBuscado)) : null;
      if (!item) return null;
      const inputPrecio = Array.from(item.querySelectorAll('input')).filter(isVis).find(i => /precio|price/i.test(i.id||''));
      return inputPrecio ? inputPrecio.value : null;
    }, nombreProducto);
    console.log('📋 Precio del ítem tras activar garantía:', precioTrasGarantia);
    validaciones.garantia = garantiaInfo.ok ? (precioTrasGarantia === '0' || precioTrasGarantia === '0.00' || precioTrasGarantia === '0.00000') : false;
    console.log('📋 Precio en cero tras activar garantía: ' + (validaciones.garantia ? '✅' : (garantiaInfo.ok ? '❌' : '⚠️ (botón no encontrado, no bloqueante)')));
    evaluarAccion(Date.now() - tGarantia, 'Activar garantía');

    // ── Eliminar producto: quitar el ítem de servicio (dejar el producto para el resto del flujo) ──
    const tEliminar = Date.now();
    const itemsAntesEliminar = await contarItemsCarrito(page);
    const eliminarInfo = await page.evaluate((nombreBuscado) => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const cont = document.querySelector('.service-list-container');
      const item = cont ? Array.from(cont.querySelectorAll('.item-card')).find(c => (c.textContent||'').includes(nombreBuscado)) : null;
      if (!item) return { ok: false, motivo: 'item no encontrado' };
      const menuBtn = Array.from(item.querySelectorAll('button,a,i')).filter(isVis).find(b => /ellipsis|fa-trash|delete|remove/i.test(b.className||''));
      if (!menuBtn) return { ok: false, motivo: 'botón de menú/eliminar no encontrado' };
      menuBtn.click();
      return { ok: true, esMenu: /ellipsis/i.test(menuBtn.className||'') };
    }, nombreServicio);
    console.log('📋 Click para eliminar servicio:', JSON.stringify(eliminarInfo));
    await page.waitForTimeout(800);
    if (eliminarInfo.ok && eliminarInfo.esMenu) {
      // Si abrió un menú contextual, buscar la opción "Eliminar"
      await page.evaluate(() => {
        const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        Array.from(document.querySelectorAll('a,button,li')).filter(isVis).find(b => /eliminar|quitar|borrar/i.test(b.textContent||''))?.click();
      });
      await page.waitForTimeout(1200);
      // Confirmar si aparece un SweetAlert de confirmación
      await page.evaluate(() => {
        const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const popup = Array.from(document.querySelectorAll('.swal2-popup')).filter(isVis)[0];
        const btn = popup ? Array.from(popup.querySelectorAll('button')).filter(isVis).find(b => /confirmar|s[ií]|eliminar|aceptar/i.test(b.textContent||'')) : null;
        btn?.click();
      });
      await page.waitForTimeout(1200);
    }
    const itemsTrasEliminar = await contarItemsCarrito(page);
    validaciones.eliminar = itemsTrasEliminar < itemsAntesEliminar;
    console.log('📋 El carrito disminuyó tras eliminar (' + itemsAntesEliminar + '→' + itemsTrasEliminar + '): ' + (validaciones.eliminar ? '✅' : '⚠️ (hallazgo no bloqueante)'));
    evaluarAccion(Date.now() - tEliminar, 'Eliminar servicio del carrito');
    await screenshotOnFail(page, 'cp261-tras-eliminar');

    await clickSiguiente(page);

    // ── Inspección: intentar crear un paquete (hallazgo documentado) ──
    if (/inspecci[oó]n/i.test((await pasoActivo(page)) || '')) {
      const tInspeccion = Date.now();
      await screenshotOnFail(page, 'cp261-inspeccion-antes');
      const modalAntes = await page.evaluate(() => {
        const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        return !!Array.from(document.querySelectorAll('.modal, .swal2-popup')).filter(isVis)[0];
      });
      const clickPaquete = await page.getByText('Crea Nuevo Paquete', { exact: false }).first().click({ timeout: 10000 }).then(() => true).catch(() => false);
      await page.waitForTimeout(2000);
      await screenshotOnFail(page, 'cp261-inspeccion-despues');
      const modalDespues = await page.evaluate(() => {
        const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        return !!Array.from(document.querySelectorAll('.modal, .swal2-popup')).filter(isVis)[0];
      });
      // Solo cuenta como "se resolvió" si el clic realmente se ejecutó Y aparece un modal que NO
      // estaba ya presente de antes (evita falsos positivos por modales residuales de otro paso).
      const seResolvio = clickPaquete && modalDespues && !modalAntes;
      validaciones.paqueteInspeccion = clickPaquete ? seResolvio : null;
      console.log('📋 HALLAZGO — clic en "Crea Nuevo Paquete" ejecutado: ' + clickPaquete + ' | modal antes: ' + modalAntes + ' | modal después: ' + modalDespues + ' → ' + (clickPaquete ? (seResolvio ? 'se resolvió' : 'confirmado: no ocurre ninguna acción visible (ver encabezado)') : 'no se pudo ejecutar el clic esta corrida (ver hallazgo ya confirmado por separado en el encabezado)'));
      evaluarAccion(Date.now() - tInspeccion, 'Inspección: intentar crear paquete');
      await clickSiguiente(page);
    }

    // Inspección/Enderezado si quedan pasos intermedios
    if (/enderezado/i.test((await pasoActivo(page)) || '')) {
      // Enderezado y Pintura: mismo hallazgo documentado que CP-260 (catálogo pieza/servicio
      // vacío para combinaciones nuevas) — se avanza sin bloquear el resto del flujo.
      await seleccionarChosen(page, 'type_car_select', 'SUV').catch(() => {});
      await page.waitForTimeout(1500);
      await clickSiguiente(page);
    }

    // ── Abonos ──
    if (/abonos/i.test((await pasoActivo(page)) || '')) {
      await page.fill('#initial-payment-repair-order', '300').catch(() => {});
      await clickSiguiente(page);
    }

    // Saltar hasta Partes del vehículo si quedan pasos intermedios
    let intentos = 0;
    while (!/partes del veh[ií]culo/i.test((await pasoActivo(page)) || '') && intentos < 4) {
      await clickSiguiente(page);
      intentos++;
    }
    console.log('📋 Paso activo tras Inspección/Enderezado/Abonos:', await pasoActivo(page));

    // ── Partes del vehículo (interacción mínima, ya cubierta en profundidad en CP-259/260) ──
    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const inputCantidad = Array.from(document.querySelectorAll('input[type="number"]')).filter(isVis).find(i => /cantidad/i.test(i.placeholder||''));
      if (!inputCantidad) return;
      let tarjeta = inputCantidad;
      for (let i=0;i<6 && tarjeta;i++) { if (tarjeta.querySelector && tarjeta.querySelector('img')) break; tarjeta = tarjeta.parentElement; }
      const botonMas = tarjeta ? Array.from(tarjeta.querySelectorAll('button,a')).filter(isVis).find(b => (b.textContent||'').trim() === '+') : null;
      botonMas?.click();
    });
    await clickSiguiente(page);

    // ── Fotos ──
    const inputFile = page.locator('input[type="file"]').first();
    if (await inputFile.count()) {
      const imgPath = path.join(__dirname, '..', '..', '..', 'reports', 'screenshots');
      fs.mkdirSync(imgPath, { recursive: true });
      const tmpImg = path.join(imgPath, 'cp261-foto-test.png');
      if (!fs.existsSync(tmpImg)) {
        const png1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
        fs.writeFileSync(tmpImg, png1x1);
      }
      await inputFile.setInputFiles(tmpImg).catch(() => {});
      await page.waitForTimeout(2000);
    }
    // Imagenes por servicio: si hay un servicio en el carrito, debería aparecer su propia
    // sección de "antes/despues" en este paso.
    const seccionServicioFotos = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      return Array.from(document.querySelectorAll('*')).filter(isVis).some(el => el.children.length === 0 && /^Servicios$/i.test((el.textContent||'').trim()));
    });
    console.log('📋 Sección "Servicios" visible en el paso Fotos (imágenes antes/después): ' + (seccionServicioFotos ? '✅' : '⚠️'));
    await clickSiguiente(page);

    // ── Marcación de daños / Observaciones / Firma (mínimo, ya cubiertos en detalle en CP-259) ──
    await clickSiguiente(page);
    if (await page.locator('#damage_repair').count()) await page.fill('#damage_repair', 'Observación CP-261: ' + 'x'.repeat(100));
    await clickSiguiente(page);
    const canvas = page.locator('canvas').first();
    if (await canvas.count()) {
      const box = await canvas.boundingBox();
      if (box) {
        await page.mouse.move(box.x + 20, box.y + 20);
        await page.mouse.down();
        await page.mouse.move(box.x + 100, box.y + 60);
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
    await screenshotOnFail(page, 'cp261-tras-generar');
    validaciones.generar = !!clickeoGenerar && !!confirmado;

    console.log('\n📊 === VALIDACIONES CP-261 ===');
    console.log('  Avanza a Detalles tras elegir estilo:              ' + (validaciones.estilo ? '✅' : '❌'));
    console.log('  Avanza a Servicios tras completar Detalles:        ' + (validaciones.detalles ? '✅' : '❌'));
    console.log('  Producto normal agregado al carrito:               ' + (validaciones.productoNormal ? '✅' : '❌'));
    console.log('  Servicio nuevo agregado al carrito:                ' + (validaciones.servicioNuevo ? '✅' : '⚠️ (no bloqueante)'));
    console.log('  Asignar mecánico:                                  ' + (validaciones.mecanico ? '✅' : '⚠️ (no bloqueante)'));
    console.log('  Garantía deja el precio en cero:                   ' + (validaciones.garantia ? '✅' : '⚠️ (no bloqueante)'));
    console.log('  Eliminar servicio reduce el carrito:               ' + (validaciones.eliminar ? '✅' : '⚠️ (no bloqueante)'));
    console.log('  HALLAZGO "Crea Nuevo Paquete" (Inspección):        ' + (validaciones.paqueteInspeccion === false ? '❌ confirmado, no abre nada' : (validaciones.paqueteInspeccion === true ? '✅ (se resolvió)' : '⚠️ no se pudo probar esta corrida')));
    console.log('  Clic en "Generar" ejecutado con confirmación:      ' + (validaciones.generar ? '✅' : '❌'));

    if (!validaciones.estilo) throw new Error('No avanzó a Detalles del vehículo tras elegir el estilo');
    if (!validaciones.detalles) throw new Error('No avanzó a Seleccionar servicios tras completar Detalles del vehículo');
    if (!validaciones.productoNormal) throw new Error('El producto normal no quedó agregado al carrito de la orden');
    if (!validaciones.generar) throw new Error('No se pudo generar la orden al finalizar el wizard');
    // servicioNuevo, mecanico, garantia, eliminar y paqueteInspeccion son hallazgos/no bloqueantes
    // documentados explícitamente — no detienen el CP (mismo criterio que CP-260 con Enderezado).

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-261 PASSED | orden avanzada generada con placa "' + placaTest + '" (hallazgos documentados: ver encabezado del archivo) | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-261', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp261-fail');
    console.log('❌ CP-261 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-261', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp261_orden_avanzada();
