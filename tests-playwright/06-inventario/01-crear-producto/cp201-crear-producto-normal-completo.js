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

async function cp201_crear_producto_normal_completo() {
  console.log('🔄 Ejecutando CP-201: Crear producto NORMAL completo en el catálogo de Inventario...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;
  const tiempoInicioCP = Date.now();
  const nombreProducto = 'CP-201-PRODUCTO-NORMAL-' + Date.now();

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

    // ── Paso 1: Inf. General ──
    await abrirWizardAgregarProducto(page);
    await page.evaluate((nombre) => {
      const n = document.getElementById('product_name');
      n.value = nombre;
      n.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('product_code').value = 'CPCODE' + Date.now();
      document.getElementById('product_bar_code').value = '750' + Date.now().toString().slice(-10);
      document.getElementById('product_brand').value = 'Marca CP-201';
      document.getElementById('product_color_name').value = 'Negro';
      document.getElementById('product_quality').value = 'Nueva';
      document.getElementById('product_name_english').value = 'CP-201 Test Product';
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

    // ── Paso 2: Costos ──
    const costosOk = await page.evaluate(() => {
      const setVal = (id, val) => { const el = document.getElementById(id); if (!el) return false; el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); return true; };
      const okCost = setVal('product_cost', '5000');
      const okPrice = setVal('product_price', '8500');
      setVal('product_quantity', '10');
      setVal('product_discount', '5');
      setVal('product_utility', '20');
      setVal('product_commission', '2');
      setVal('product_max_discount', '10');
      setVal('product_stock_min', '2');
      setVal('product_stock_max', '50');
      const unit = document.getElementById('product_unit_type');
      if (unit) { unit.value = '6'; unit.dispatchEvent(new Event('change', { bubbles: true })); } // Caja
      const isFragment = document.getElementById('is_fragment');
      const fraccionadoApagado = !isFragment || !isFragment.checked;
      return okCost && okPrice && fraccionadoApagado;
    });
    if (!costosOk) throw new Error('No se pudieron llenar los campos de Costos, o el producto quedó marcado como fraccionado por error');
    await page.waitForTimeout(500);

    const avanzoADesc = await clickBotonWizardPorTexto(page, 'Siguiente');
    if (!avanzoADesc) throw new Error('No se encontró el botón "Siguiente" en el paso Costos');
    await page.waitForTimeout(2000);

    // ── Paso 3: Desc. Producto ──
    await page.evaluate(() => {
      const setVal = (id, val) => { const el = document.getElementById(id); if (el) { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); } };
      setVal('product_size', 'Mediano');
      setVal('product_description', 'Producto de prueba creado por CP-201 (verificacion de creacion de producto en catalogo).');
      setVal('product_dimensions', '10x10x10 cm');
    });
    await page.waitForTimeout(500);

    const avanzoAImagenes = await clickBotonWizardPorTexto(page, 'Siguiente');
    if (!avanzoAImagenes) throw new Error('No se encontró el botón "Siguiente" en el paso Desc. Producto');
    await page.waitForTimeout(2000);

    // ── Paso 4: Imágenes (sin llenar, opcional) ──
    const avanzoAFiltroServicios = await clickBotonWizardPorTexto(page, 'Siguiente');
    if (!avanzoAFiltroServicios) throw new Error('No se encontró el botón "Siguiente" en el paso Imágenes');
    await page.waitForTimeout(2000);

    // ── Paso 5: Filtro servicios (sin campos para esta categoría) ──
    const avanzoAFiltroAutos = await clickBotonWizardPorTexto(page, 'Siguiente');
    if (!avanzoAFiltroAutos) throw new Error('No se encontró el botón "Siguiente" en el paso Filtro servicios');
    await page.waitForTimeout(2000);

    // ── Paso 6: Filtro Autos — Guardar ──
    // A diferencia de los pasos 1-5 (donde "Guardar"/"Siguiente" son input[name="next"]),
    // en Filtro Autos el guardado final del producto es un <button> distinto.
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
    console.log('\n📊 === VALIDACIONES CP-201 ===');
    console.log('  POST /prod/saveProductStepOne respondió status:1 con product_id: ' + (v1 ? '✅ (product_id=' + productIdGuardado + ')' : '❌'));
    console.log('  El producto "' + nombreProducto + '" aparece en el listado del catálogo: ' + (v2 ? '✅' : '❌'));

    if (!v1) throw new Error('El guardado del producto no fue confirmado por el servidor (sin product_id o status distinto de 1)');
    if (!v2) throw new Error('El producto creado no aparece en el listado del catálogo tras buscarlo');

    console.log('✅ CP-201 PASSED | producto "' + nombreProducto + '" creado (id=' + productIdGuardado + ') y verificado en el catálogo | validaciones: 2/2');
    registrarResultado({ cp: 'CP-201', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: Date.now() - tiempoInicioCP });

  } catch (error) {
    await screenshotOnFail(page, 'cp201-fail');
    console.log('❌ CP-201 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-201', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp201_crear_producto_normal_completo();
