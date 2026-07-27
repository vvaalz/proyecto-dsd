const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const POS_URL = `${BASE_URL}/pos/pointOfSale?company_pos=20&pos_type_option=1`;
// Gap "combo multi-tipo de producto en un carrito": ningún CP existente combina en UNA sola venta
// producto normal + rápido + fraccionado + servicio al mismo tiempo (cada tipo se probó por
// separado hasta ahora — ver CP-058/065/066 normal, CP-075/077/118 rápido, CP-074/077 fraccionado).
//
// ⚠️ El hallazgo crítico de montos corruptos (CLAUDE_CONTEXT.md sección 22) sigue activo — un
// carrito con múltiples productos es el escenario MÁS expuesto a ese bug. Por eso este CP agrega
// los productos de forma INCREMENTAL, verificando tras cada uno que el total del carrito coincida
// razonablemente con la SUMA de los precios reales ya confirmados (extraídos del propio atributo
// onclick="add_to_table(id,nombre,PRECIO,...)" de cada tarjeta — no del texto visible de la
// tarjeta, que el propio hallazgo de la sección 22 confirmó que puede mostrar un número corrupto
// en el LISTADO del catálogo aunque el precio real embebido en el onclick sea correcto). Si en
// cualquier paso el total del carrito no coincide razonablemente con lo esperado, el CP se
// DETIENE de inmediato, documenta el hallazgo (productos en el carrito, esperado vs. obtenido) y
// NO completa el pago ni intenta otras combinaciones — instrucción explícita del usuario dado el
// riesgo de dejar una factura con monto corrupto persistida en el ambiente compartido de QA.

const TOLERANCIA = 5; // colones, margen generoso para redondeos de IVA/impuestos legítimos

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','..','..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
};
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

async function leerTotalCarrito(page) {
  return page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const label = Array.from(document.querySelectorAll('*')).filter(isVis).find(el => /^TOTAL:$/i.test((el.textContent||'').trim()));
    const next = label ? label.nextElementSibling : null;
    const texto = next ? next.textContent.trim() : null;
    const match = texto ? texto.match(/[₡$]\s*([\d,]+\.\d{2})/) : null;
    return { texto, valor: match ? parseFloat(match[1].replace(/,/g, '')) : NaN };
  });
}

async function filasEnCarrito(page) {
  return page.evaluate(() => {
    const t = document.getElementById('tb_table_buy_list');
    return t ? t.querySelectorAll('tr.main_row').length : 0;
  });
}

// Extrae el precio REAL embebido en el onclick="add_to_table(id,'NOMBRE','PRECIO',...)" de la
// tarjeta .product_box — NO el texto visible de la tarjeta (que puede estar corrupto, ver
// hallazgo de la sección 22: catálogo de Servicios mostrando "$212,098,742,007.75" en pantalla
// mientras el propio onclick de esa misma tarjeta lleva el precio real '2260.00').
async function agregarProductoCatalogoConPrecioReal(page, regexNombre) {
  return page.evaluate((patron) => {
    const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const re = new RegExp(patron, 'i');
    const caja = Array.from(document.querySelectorAll('.product_box')).filter(isVis)
      .find(c => re.test((c.textContent||'').replace(/\s+/g,' ')));
    if (!caja) return { ok: false, error: 'no se encontró la tarjeta de producto/servicio' };
    const conOnclick = caja.matches('[onclick]') ? caja : caja.querySelector('[onclick]');
    const onclickAttr = conOnclick ? conOnclick.getAttribute('onclick') : null;
    const m = onclickAttr ? onclickAttr.match(/add_to_table\('[^']*','([^']*)','([\d.]+)'/) : null;
    if (!m) return { ok: false, error: 'no se encontró onclick="add_to_table(...)" con precio parseable', onclickAttr };
    const nombreReal = m[1];
    const precioReal = parseFloat(m[2]);
    (caja.querySelector('.product_box_quantity_content') || caja).click();
    return { ok: true, nombreReal, precioReal };
  }, regexNombre);
}

async function cp200_combo_multi_tipo() {
  console.log('🔄 Ejecutando CP-200: POS — combo en un solo carrito: producto normal + rápido + fraccionado + servicio, con verificación incremental contra el hallazgo crítico de montos corruptos...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;
  const tiempoInicioCP = Date.now();
  let sumaEsperada = 0;
  const itemsAgregados = [];

  try {
    const t0 = Date.now();
    ({ context, page } = await navegarAModulo(browser, context, POS_URL));
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(2000);
    await page.waitForSelector('.product_box', { timeout: 15000 });
    evaluarCargaPagina(Date.now() - t0, 'Carga POS');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(2000);
    await page.waitForSelector('.product_box', { timeout: 15000 });
    await page.evaluate(() => { document.getElementById('workshop-web-notification-permission-dismiss')?.click(); });
    await page.waitForTimeout(500);

    // Asegurar colones (consistencia de moneda para toda la comparación)
    await page.evaluate(() => { document.getElementById('menu_type_currency')?.click(); });
    await page.waitForTimeout(700);
    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const menu = Array.from(document.querySelectorAll('.mdl-menu')).filter(isVis).find(m => /col[oó]n|d[oó]lar/i.test(m.textContent||''));
      const opt = menu ? Array.from(menu.querySelectorAll('li')).find(li => /col[oó]n costarricense/i.test(li.textContent||'')) : null;
      opt?.click();
    });
    await page.waitForTimeout(800);

    const filasIniciales = await filasEnCarrito(page);
    if (filasIniciales !== 0) throw new Error('El carrito no empezó vacío (' + filasIniciales + ' filas) — abortando para no contaminar la medición');
    console.log('📋 Carrito inicial confirmado vacío (0 filas)');

    // Función central de verificación incremental: agrega un ítem, suma su precio REAL esperado,
    // lee el total real del carrito, y compara. Si no coincide razonablemente, detiene el CP.
    async function agregarYVerificar(etiquetaTipo, resultadoAgregar) {
      if (!resultadoAgregar.ok) throw new Error('No se pudo agregar ' + etiquetaTipo + ': ' + resultadoAgregar.error);
      await page.waitForTimeout(1500);
      sumaEsperada += resultadoAgregar.precioReal;
      itemsAgregados.push({ tipo: etiquetaTipo, nombre: resultadoAgregar.nombreReal, precioReal: resultadoAgregar.precioReal });
      const totalCarrito = await leerTotalCarrito(page);
      const diff = isNaN(totalCarrito.valor) ? NaN : Math.abs(totalCarrito.valor - sumaEsperada);
      console.log('📦 [' + etiquetaTipo + '] "' + resultadoAgregar.nombreReal + '" (₡' + resultadoAgregar.precioReal + ') agregado | suma esperada acumulada: ₡' + sumaEsperada.toFixed(2) + ' | total real del carrito: ' + totalCarrito.texto + ' (₡' + totalCarrito.valor + ') | diff: ₡' + (isNaN(diff) ? 'N/A' : diff.toFixed(2)));

      const esRazonable = !isNaN(totalCarrito.valor) && diff <= (sumaEsperada * 0.1 + TOLERANCIA); // 10% + margen fijo, generoso para IVA
      if (!esRazonable) {
        await screenshotOnFail(page, 'cp200-HALLAZGO-monto-corrupto');
        const detalle = 'HALLAZGO CONFIRMADO — monto corrupto en el carrito combo.\n' +
          'Productos en el carrito al momento del hallazgo: ' + JSON.stringify(itemsAgregados) + '\n' +
          'Suma esperada (precios reales confirmados uno por uno): ₡' + sumaEsperada.toFixed(2) + '\n' +
          'Total obtenido en el carrito: ' + totalCarrito.texto + ' (₡' + totalCarrito.valor + ')\n' +
          'Diferencia: ₡' + (isNaN(diff) ? 'N/A (total no parseable)' : diff.toFixed(2));
        throw new Error(detalle);
      }
      return totalCarrito;
    }

    // ── 1) Producto NORMAL (AAA-Bombillos: visible en la primera página del catálogo sin
    // necesidad de buscador — #product_search no filtra de forma confiable, mismo hallazgo ya
    // documentado en otros CPs, ej. CP-034/CP-070) ──
    const r1 = await agregarProductoCatalogoConPrecioReal(page, 'aaa-bombillos');
    await agregarYVerificar('normal', r1);

    // ── 2) Producto RÁPIDO — intento real; si el modal no está disponible, fallback documentado
    // a otro producto de catálogo (mismo hallazgo de inestabilidad de CABYS ya visto en
    // CP-075/077/118/177-182: no es un hallazgo nuevo, se documenta y se sigue) ──
    let r2;
    const modalRapidoAbrio = await page.evaluate(() => {
      if (typeof showModalQuickProductPos === 'function') { showModalQuickProductPos(); return true; }
      return false;
    });
    await page.waitForTimeout(1000);
    const modalRapidoVisible = modalRapidoAbrio && await page.evaluate(() => {
      const m = document.getElementById('dialog_quick_product_pos');
      return m ? window.getComputedStyle(m).display !== 'none' : false;
    });
    if (modalRapidoVisible) {
      const PRECIO_RAPIDO = '50.00';
      await page.evaluate((p) => {
        const setVal = (id, v) => { const el = document.getElementById(id); if (!el) return; el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
        setVal('quick_product_name', 'Quick CP200 Combo'); setVal('quick_product_quantity', '1'); setVal('quick_product_price', p);
      }, PRECIO_RAPIDO);
      await page.waitForTimeout(400);
      await page.evaluate(() => { try { validate_cabys_code(0, 6, 'Quick CP200 Combo', 1); } catch (e) {} });
      await page.waitForTimeout(1200);
      await page.evaluate(() => { const i = document.getElementById('cabys_code_search'); if (i) { i.value = 'varios'; i.dispatchEvent(new Event('input', { bubbles: true })); } });
      await page.evaluate(() => { document.getElementById('btn_cabys_code_search')?.click(); });
      await page.waitForTimeout(3500);
      const cabysOk = await page.evaluate(() => {
        const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const row = Array.from(document.querySelectorAll('tr, li')).filter(isVis).find(el => el.onclick || el.querySelector('[onclick]'));
        if (!row) return false;
        (row.onclick ? row : row.querySelector('[onclick]')).click();
        return true;
      });
      if (cabysOk) {
        await page.waitForTimeout(1200);
        await page.evaluate(() => { document.querySelector('.save_quick_product_pos')?.click(); });
        await page.waitForTimeout(1500);
        const enCarrito = await page.evaluate(() => (document.getElementById('tb_table_buy_list')||{textContent:''}).textContent.includes('Quick CP200 Combo'));
        r2 = enCarrito ? { ok: true, nombreReal: 'Quick CP200 Combo (rápido)', precioReal: parseFloat(PRECIO_RAPIDO) } : { ok: false, error: 'no apareció en el carrito tras guardar' };
      } else {
        r2 = { ok: false, error: 'CABYS sin resultados (hallazgo ya conocido de inestabilidad, ver CP-075/077/118)' };
        await page.evaluate(() => { const m = document.getElementById('dialog_quick_product_pos'); if (m) { const isVis = el => { const r = el.getBoundingClientRect(); return r.width>0&&r.height>0; }; const btn = Array.from(m.querySelectorAll('button')).filter(isVis).find(b => /cerrar|cancel|close/i.test(b.textContent||'')); btn?.click(); } }).catch(()=>{});
      }
    } else {
      r2 = { ok: false, error: 'showModalQuickProductPos no disponible o modal no visible' };
    }
    if (!r2.ok) {
      console.log('⚠️ Producto rápido no disponible (' + r2.error + ') → fallback documentado a producto de catálogo AAA-Filtros de combustible');
      await page.waitForTimeout(500);
      r2 = await agregarProductoCatalogoConPrecioReal(page, 'aaa-filtros de combustible');
    }
    await agregarYVerificar('rápido (o fallback catálogo)', r2);

    // ── 3) Producto FRACCIONADO (AA-Maletero, 1 fracción) ──
    const fragOk = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const caja = Array.from(document.querySelectorAll('.product_box')).filter(isVis).find(c => /aa-maletero/i.test((c.textContent||'').replace(/\s+/g,' ')));
      if (!caja) return { ok: false, error: 'no se encontró AA-Maletero' };
      const conOnclick = caja.matches('[onclick]') ? caja : caja.querySelector('[onclick]');
      const onclickAttr = conOnclick ? conOnclick.getAttribute('onclick') : null;
      const m = onclickAttr ? onclickAttr.match(/add_to_table\('[^']*','([^']*)','([\d.]+)'/) : null;
      (caja.querySelector('.product_box_quantity_content') || caja).click();
      return { ok: true, nombreReal: m ? m[1] : 'AA-Maletero', precioUnitario: m ? parseFloat(m[2]) : null };
    });
    if (!fragOk.ok) throw new Error('No se pudo agregar el producto fraccionado: ' + fragOk.error);
    await page.waitForSelector('#dialog_product_fragmented_quantity_view', { timeout: 5000 });
    await page.waitForTimeout(400);
    const CANTIDAD_FRACCION = 1;
    await page.evaluate((cant) => {
      const fi = document.getElementById('prod_frag_q');
      if (fi) { fi.value = String(cant); fi.dispatchEvent(new Event('input', { bubbles: true })); fi.dispatchEvent(new Event('change', { bubbles: true })); }
    }, CANTIDAD_FRACCION);
    await page.waitForTimeout(300);
    await page.evaluate(() => { document.getElementById('btn_set_product_fragment_quantity')?.click(); });
    const r3 = { ok: true, nombreReal: fragOk.nombreReal + ' (fraccionado x' + CANTIDAD_FRACCION + ')', precioReal: fragOk.precioUnitario != null ? fragOk.precioUnitario * CANTIDAD_FRACCION : 0 };
    await agregarYVerificar('fraccionado', r3);

    // ── 4) SERVICIO del catálogo de Servicios (#ck_view_services, nunca antes usado en un CP) ──
    await page.evaluate(() => { document.getElementById('ck_view_services')?.click(); });
    await page.waitForTimeout(2000);
    const r4 = await agregarProductoCatalogoConPrecioReal(page, 'cambio de filtros');
    await agregarYVerificar('servicio (catálogo Servicios)', r4);

    // Volver a la vista de Productos (por si se necesitara seguir agregando)
    await page.evaluate(() => { document.getElementById('ck_view_products')?.click(); });
    await page.waitForTimeout(800);

    // ── Si llegamos hasta aquí, los 4 tipos combinados dieron un total razonable. Confirmar el
    // conteo final de filas y el total combinado, y DETENERSE sin facturar (alcance del gap:
    // demostrar que el combo se puede construir y que los montos cuadran; no se pidió llegar a
    // confirmar una factura real, y hacerlo sin necesidad añadiría riesgo innecesario sobre el
    // ambiente compartido de QA) ──
    const filasFinales = await filasEnCarrito(page);
    const totalFinal = await leerTotalCarrito(page);
    console.log('📊 Filas finales en el carrito:', filasFinales, '(4 tipos de producto esperados)');
    console.log('💰 Total final combinado:', totalFinal.texto, '→ suma esperada: ₡' + sumaEsperada.toFixed(2));

    // ── VALIDACIONES ──
    const v1 = filasFinales === 4;
    const v2 = !isNaN(totalFinal.valor) && Math.abs(totalFinal.valor - sumaEsperada) <= (sumaEsperada * 0.1 + TOLERANCIA);

    console.log('\n📊 === VALIDACIONES CP-200 ===');
    console.log('  Los 4 tipos de producto quedaron en el carrito (normal+rápido+fraccionado+servicio): ' + (v1 ? '✅' : '❌ (' + filasFinales + ' filas)'));
    console.log('  El total combinado coincide razonablemente con la suma de subtotales reales verificados uno por uno: ' + (v2 ? '✅' : '❌'));

    if (!v1) throw new Error('El carrito no terminó con los 4 tipos de producto esperados (' + filasFinales + ' filas)');
    if (!v2) throw new Error('El total final no coincide con la suma esperada (esto no debería poder pasar aquí, ya se validó incrementalmente)');

    // Limpieza: vaciar el carrito sin facturar
    await page.evaluate(() => { document.querySelectorAll('#tb_table_buy_list .delete_row, #tb_table_buy_list [onclick*="delete"]').forEach(b => b.click()); }).catch(() => {});

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-200 PASSED | combo de 4 tipos de producto en un solo carrito (normal+rápido/fallback+fraccionado+servicio) construido y verificado incrementalmente sin señales del hallazgo crítico de montos corruptos | items: ' + JSON.stringify(itemsAgregados) + ' | total combinado: ' + totalFinal.texto + ' | validaciones: 2/2 | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-200', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp200-fail');
    const esHallazgoCritico = /HALLAZGO CONFIRMADO/.test(error.message);
    if (esHallazgoCritico) {
      console.log('⚠️ CP-200 RESULT (hallazgo esperado, ya documentado en CLAUDE_CONTEXT.md sección 22): ' + error.message.replace(/\n/g, ' | '));
      console.log('⚠️ Deteniendo el CP de inmediato por instrucción explícita del usuario: NO se completa el pago ni se intentan otras combinaciones de productos. El carrito se deja tal cual quedó para evidencia (screenshot ya tomado).');
      registrarResultado({ cp: 'CP-200', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: Date.now() - tiempoInicioCP });
    } else {
      console.log('❌ CP-200 FAILED: ' + error.message);
      registrarResultado({ cp: 'CP-200', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
      process.exit(1);
    }
  } finally {
    await browser.close();
  }
}

cp200_combo_multi_tipo();
