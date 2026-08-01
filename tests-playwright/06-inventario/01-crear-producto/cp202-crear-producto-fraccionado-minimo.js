const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const URL_MODULO = `${BASE_URL}/prod/product`;
const CATEGORIA_ACEITES = '148';

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

async function abrirWizardAgregarProducto(page) {
  await page.waitForSelector('#add_product', { state: 'attached', timeout: 60000 });
  await page.waitForTimeout(1500);
  await dismissNotificationBanner(page);
  await page.evaluate(() => document.getElementById('add_product').click());
  await page.waitForTimeout(3000);
}

async function configurarCabys(page, termino) {
  const abierto = await page.evaluate(() => {
    const heading = Array.from(document.querySelectorAll('*')).find(el => el.children.length === 0 && /^Código CABYS$/i.test((el.textContent || '').trim()));
    let container = heading ? heading.closest('div') : null;
    let btn = null;
    for (let i = 0; i < 4 && container; i++) {
      btn = container.querySelector('button, a.btn');
      if (btn) break;
      container = container.parentElement;
    }
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (!abierto) throw new Error('No se encontró el botón para configurar el Código CABYS');
  await page.waitForTimeout(2000);

  await page.fill('#cabys_code_search', termino);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);

  const aplicado = await page.evaluate(() => {
    const isVis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const btn = Array.from(document.querySelectorAll('a, button')).filter(isVis).find(b => b.textContent.trim() === 'APLICAR');
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (!aplicado) throw new Error('No se encontró ningún botón "APLICAR" en la búsqueda de código CABYS para "' + termino + '"');
  await page.waitForTimeout(2000);
}

function clickBotonWizardPorTexto(page, textoExacto) {
  return page.evaluate((texto) => {
    const isVis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const btn = Array.from(document.querySelectorAll('input[name="next"]')).filter(isVis).find(b => (b.value || '').trim() === texto);
    if (btn) { btn.click(); return true; }
    return false;
  }, textoExacto);
}

async function cp202_crear_producto_fraccionado_minimo() {
  console.log('🔄 Ejecutando CP-202: Crear producto FRACCIONADO (campos mínimos) en el catálogo de Inventario...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;
  const tiempoInicioCP = Date.now();
  const nombreProducto = 'CP-202-PRODUCTO-FRACCIONADO-' + Date.now();

  let productIdGuardado = null;
  let respuestaGuardado = null;

  try {
    const t0 = Date.now();
    ({ context, page } = await navegarAModulo(browser, context, URL_MODULO));
    await page.waitForSelector('#add_product', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(2000);
    evaluarCargaPagina(Date.now() - t0, 'Carga de Inventario (Crear y editar producto)');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('#add_product', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(2000);

    page.on('response', async (r) => {
      if (/\/prod\/saveProductStepOne/i.test(r.url()) && r.request().method() === 'POST') {
        try {
          const body = await r.json();
          if (body && body.product_id) { productIdGuardado = body.product_id; respuestaGuardado = body; }
        } catch {}
      }
    });

    // ── Paso 1: Inf. General (solo lo mínimo: nombre + CABYS + categoría) ──
    await abrirWizardAgregarProducto(page);
    await page.evaluate((nombre) => {
      const n = document.getElementById('product_name');
      n.value = nombre;
      n.dispatchEvent(new Event('input', { bubbles: true }));
    }, nombreProducto);

    await configurarCabys(page, 'herramienta');

    const categoriaOk = await page.evaluate((cat) => {
      const sel = document.getElementById('category_select_spk');
      if (!sel) return false;
      sel.value = cat;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return sel.value === cat;
    }, CATEGORIA_ACEITES);
    if (!categoriaOk) throw new Error('No se pudo seleccionar la categoría del producto');
    await page.waitForTimeout(1000);

    const avanzoACostos = await clickBotonWizardPorTexto(page, 'Siguiente');
    if (!avanzoACostos) throw new Error('No se encontró el botón "Siguiente" en el paso Inf. General');
    await page.waitForTimeout(2000);

    // ── Paso 2: Costos — activar "¿Fraccionar?" y llenar solo los campos mínimos de fraccionado ──
    const activado = await page.evaluate(() => {
      const cb = document.getElementById('is_fragment');
      if (!cb) return false;
      if (!cb.checked) cb.click();
      return true;
    });
    if (!activado) throw new Error('No se encontró el checkbox "¿Fraccionar?" (is_fragment)');
    await page.waitForTimeout(1500);

    const costosOk = await page.evaluate(() => {
      const setVal = (id, val) => { const el = document.getElementById(id); if (!el) return false; el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); return true; };
      const okCost = setVal('product_cost', '180');
      const okCajas = setVal('product_quantity_box', '5');
      const okFraccPorCaja = setVal('fragments_per_unit', '6');
      const okPrecioCaja = setVal('product_price_box', '1080');
      const okPrecioFraccion = setVal('product_price_fragment', '200');
      const fraccionadoActivo = document.getElementById('is_fragment') && document.getElementById('is_fragment').checked;
      return okCost && okCajas && okFraccPorCaja && okPrecioCaja && okPrecioFraccion && fraccionadoActivo;
    });
    if (!costosOk) throw new Error('No se pudieron llenar los campos mínimos de un producto fraccionado (caja/fracciones/precios), o el checkbox "¿Fraccionar?" no quedó activo');
    await page.waitForTimeout(500);

    const avanzoADesc = await clickBotonWizardPorTexto(page, 'Siguiente');
    if (!avanzoADesc) throw new Error('No se encontró el botón "Siguiente" en el paso Costos');
    await page.waitForTimeout(2000);

    // ── Pasos 3-5 (Desc. Producto / Imágenes / Filtro servicios): sin llenar, campos mínimos ──
    const avanzoAImagenes = await clickBotonWizardPorTexto(page, 'Siguiente');
    if (!avanzoAImagenes) throw new Error('No se encontró el botón "Siguiente" en el paso Desc. Producto');
    await page.waitForTimeout(2000);

    const avanzoAFiltroServicios = await clickBotonWizardPorTexto(page, 'Siguiente');
    if (!avanzoAFiltroServicios) throw new Error('No se encontró el botón "Siguiente" en el paso Imágenes');
    await page.waitForTimeout(2000);

    const avanzoAFiltroAutos = await clickBotonWizardPorTexto(page, 'Siguiente');
    if (!avanzoAFiltroAutos) throw new Error('No se encontró el botón "Siguiente" en el paso Filtro servicios');
    await page.waitForTimeout(2000);

    // ── Paso 6: Filtro Autos — Guardar (botón <button>, distinto del input[name="next"] de los pasos anteriores) ──
    const t1 = Date.now();
    const guardado = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const btn = Array.from(document.querySelectorAll('input, button')).filter(isVis).find(b => (b.value || b.textContent || '').trim() === 'Guardar');
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (!guardado) throw new Error('No se encontró el botón "Guardar" en el paso Filtro Autos');
    await page.waitForTimeout(3000);
    console.log('⏱ Guardar producto: ' + (Date.now() - t1) + 'ms');

    // ── Verificación de persistencia: buscar el producto en el listado (SIN carrito) ──
    await refrescarConCacheLimpia(page);
    await page.waitForSelector('#add_product', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(2000);
    await dismissNotificationBanner(page);

    const busquedaOk = await page.evaluate((nombre) => {
      const isVis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const input = Array.from(document.querySelectorAll('input[type="text"]')).filter(isVis).find(i => /uscar/i.test(i.placeholder || ''));
      if (!input) return false;
      input.value = nombre;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }, nombreProducto);
    if (!busquedaOk) throw new Error('No se encontró el campo de búsqueda del listado de productos');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2500);
    await page.evaluate(() => { const btn = document.getElementById('btn_product_search'); if (btn) btn.click(); });
    await page.waitForTimeout(2000);

    const apareceEnListado = await page.evaluate((nombre) => document.body.innerText.includes(nombre), nombreProducto);

    // ── VALIDACIONES ──
    const v1 = productIdGuardado !== null && respuestaGuardado && respuestaGuardado.status === 1;
    const v2 = apareceEnListado;
    console.log('\n📊 === VALIDACIONES CP-202 ===');
    console.log('  POST /prod/saveProductStepOne respondió status:1 con product_id: ' + (v1 ? '✅ (product_id=' + productIdGuardado + ')' : '❌'));
    console.log('  El producto fraccionado "' + nombreProducto + '" aparece en el listado del catálogo: ' + (v2 ? '✅' : '❌'));

    if (!v1) throw new Error('El guardado del producto fraccionado no fue confirmado por el servidor (sin product_id o status distinto de 1)');
    if (!v2) throw new Error('El producto fraccionado creado no aparece en el listado del catálogo tras buscarlo');

    console.log('✅ CP-202 PASSED | producto fraccionado "' + nombreProducto + '" creado (id=' + productIdGuardado + ') y verificado en el catálogo | validaciones: 2/2');
    registrarResultado({ cp: 'CP-202', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: Date.now() - tiempoInicioCP });

  } catch (error) {
    await screenshotOnFail(page, 'cp202-fail');
    console.log('❌ CP-202 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-202', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp202_crear_producto_fraccionado_minimo();
