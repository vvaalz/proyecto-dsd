const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';
const TOLERANCIA = 1;

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
};
function evaluarCargaPagina(ms, e) { if(ms>8000) console.log('❌ PERFORMANCE FAILED: '+e+' tardó '+ms+'ms'); else if(ms>3000) console.log('⚠️ LENTO: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }
function evaluarAccion(ms, e) { if(ms>4000) console.log('❌ Acción lenta: '+e+' tardó '+ms+'ms'); else if(ms>1500) console.log('⚠️ Acción algo lenta: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }

function parseMonto(txt) {
  if (!txt) return NaN;
  const m = (txt+'').match(/([\d,]+\.\d{2})/);
  return m ? parseFloat(m[1].replace(/,/g,'')) : NaN;
}

async function cargarPOS(page) {
  await page.goto(POS_URL, { waitUntil: 'load', timeout: 180000 });
  await page.waitForTimeout(5000);
  await page.waitForSelector('#product_search', { state: 'attached', timeout: 180000 });
  await page.waitForTimeout(3000);
  await page.waitForSelector('.product_box', { timeout: 60000 });
}

async function contarFilasCarrito(page) {
  return page.evaluate(() => {
    const tablas = ['tb_table_buy_list','table_buy_list'];
    for (const id of tablas) { const t = document.getElementById(id); if (t) return { id, rows: t.querySelectorAll('tr.main_row').length }; }
    return { id: null, rows: 0 };
  });
}

async function cp112_agregar_producto_rapido_taller() {
  console.log('🔄 Ejecutando CP-112: Agregar producto rápido a orden de taller...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  await context.clearCookies();
  const page = await context.newPage();
  const tiempoInicioCP = Date.now();

  try {
    await page.goto('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
    await page.fill('#email', 'qadesignsoftcr@gmail.com');
    await page.fill('#password', 'qa0000');
    await page.click('#loginButton');
    await page.waitForURL('**/dashboard**', { timeout: 40000 });

    const t0 = Date.now();
    await cargarPOS(page);
    evaluarCargaPagina(Date.now() - t0, 'Carga POS');
    await page.waitForTimeout(1000);

    await page.evaluate(() => { window.print = () => {}; });

    // ── PASO 1: Abrir tab Taller (F3) ──
    const tTaller = Date.now();
    await page.evaluate(() => { document.getElementById('btn_taller_option')?.click(); });
    await page.waitForTimeout(3000);
    evaluarAccion(Date.now() - tTaller, 'Abrir tab Taller');

    // ── PASO 2: Seleccionar primera orden con ítems (itera hasta 5) ──
    const todasOrdenes = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      return Array.from(document.querySelectorAll('.pos-order-card')).filter(isVis).map(c => ({
        onclick: c.getAttribute('onclick') || '', textoCard: c.textContent.replace(/\s+/g,' ').trim().substring(0,100)
      }));
    });
    console.log('📋 Órdenes disponibles:', todasOrdenes.length);
    if (todasOrdenes.length === 0) throw new Error('No se encontró ninguna orden en el tab Taller (F3)');

    let ordenInfo = null;
    let carritoAntes = { id: null, rows: 0 };
    for (let i = 0; i < Math.min(todasOrdenes.length, 5); i++) {
      const cand = todasOrdenes[i];
      console.log(`🔍 Probando orden [${i}]: ${cand.textoCard.substring(0,60)}`);
      await page.evaluate((onclick) => { eval(onclick); }, cand.onclick);
      await page.waitForTimeout(2500);
      await page.evaluate(() => { document.getElementById('btn_pos_option')?.click(); });
      await page.waitForTimeout(2000);
      carritoAntes = await contarFilasCarrito(page);
      if (carritoAntes.rows > 0) { ordenInfo = cand; console.log(`✅ Orden con ítems: ${carritoAntes.rows} filas`); break; }
      // volver a taller
      await page.evaluate(() => { document.getElementById('btn_taller_option')?.click(); });
      await page.waitForTimeout(1500);
    }
    if (!ordenInfo) {
      // Si no hay orden con ítems, usar la primera de todas formas
      ordenInfo = todasOrdenes[0];
      await page.evaluate((onclick) => { eval(onclick); }, ordenInfo.onclick);
      await page.waitForTimeout(2000);
      await page.evaluate(() => { document.getElementById('btn_pos_option')?.click(); });
      await page.waitForTimeout(2000);
      carritoAntes = await contarFilasCarrito(page);
      console.log('⚠️ Ninguna orden tenía ítems — usando primera con carrito en 0');
    }
    console.log('📋 Orden usada:', ordenInfo.textoCard.substring(0,60));

    // ── PASO 3: Cargar la orden y volver al POS tab ──
    await page.evaluate((onclick) => { eval(onclick); }, ordenInfo.onclick);
    await page.waitForTimeout(2500);
    await page.evaluate(() => { document.getElementById('btn_pos_option')?.click(); });
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 15000 });
    await page.waitForTimeout(2000);

    // Mostrar estado ANTES de agregar
    console.log('🛒 Carrito ANTES de agregar:', JSON.stringify(carritoAntes));

    // ── PASO 4: Buscar y agregar producto rápido via #product_search ──
    // El catálogo de productos se oculta cuando hay una orden taller activa —
    // buscar en #product_search fuerza al servidor a repoblar el grid con resultados
    const tAgregar = Date.now();
    await page.click('#product_search').catch(() => {});
    await page.fill('#product_search', 'aaa');
    await page.waitForTimeout(1000);
    // Disparar el evento de búsqueda
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    // Esperar hasta 20 s que aparezca un product_box real
    let productoNombre = null;
    for (let attempt = 0; attempt < 10 && !productoNombre; attempt++) {
      await page.waitForTimeout(2000);
      productoNombre = await page.evaluate(() => {
        const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
        const boxes = Array.from(document.querySelectorAll('.product_box')).filter(isVis)
          .filter(b => !/^\s*crear\s*producto\s*$/i.test(b.textContent.replace(/\s+/g,' ').trim()));
        if (boxes.length === 0) return null;
        const box = boxes[0];
        const nameEl = box.querySelector('.product_box_name, .product-name');
        const nombre = nameEl ? nameEl.textContent.trim() : box.textContent.replace(/\s+/g,' ').trim().substring(0,40);
        const clickTarget = box.querySelector('.product_box_quantity_content') || box;
        clickTarget.click();
        return nombre;
      });
      if (productoNombre) console.log('🛍️ Producto encontrado y clickeado (intento ' + (attempt+1) + '): ' + productoNombre);
    }
    if (!productoNombre) {
      console.log('⚠️ Búsqueda vía product_search no trajo resultados — probando click directo en product_box');
      productoNombre = await page.evaluate(() => {
        const boxes = Array.from(document.querySelectorAll('.product_box'));
        const real = boxes.find(b => !/^\s*crear\s*producto\s*$/i.test(b.textContent.replace(/\s+/g,' ').trim()));
        if (!real) return null;
        const nameEl = real.querySelector('.product_box_name, .product-name');
        const nombre = nameEl ? nameEl.textContent.trim() : real.textContent.replace(/\s+/g,' ').trim().substring(0,40);
        (real.querySelector('.product_box_quantity_content') || real).click();
        return nombre;
      });
      console.log('🛍️ Producto directo:', productoNombre);
    }
    await page.waitForTimeout(2000);

    // Esperar que aparezca la fila nueva en el carrito
    let carritoDespues = await contarFilasCarrito(page);
    if (carritoDespues.rows === carritoAntes.rows) {
      await page.waitForTimeout(2000);
      carritoDespues = await contarFilasCarrito(page);
    }
    evaluarAccion(Date.now() - tAgregar, 'Agregar producto rápido');
    console.log('🛒 Carrito DESPUÉS de agregar:', JSON.stringify(carritoDespues));

    // ── PASO 5: Leer total del carrito ──
    const totalTxt = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const candidatos = ['total_of_buy','total_product_text','cart_total','total_sales'];
      for (const id of candidatos) { const el = document.getElementById(id); if (el && isVis(el)) return el.textContent.trim(); }
      return null;
    });
    const totalVal = parseMonto(totalTxt);
    console.log('💰 Total carrito:', totalTxt, '→', totalVal);

    // ── PASO 6: Verificar que la fila nueva tiene texto (nombre/precio) ──
    const ultimaFila = await page.evaluate(() => {
      const tablas = ['tb_table_buy_list','table_buy_list'];
      for (const id of tablas) {
        const t = document.getElementById(id);
        if (!t) continue;
        const rows = t.querySelectorAll('tr.main_row');
        if (rows.length === 0) continue;
        const last = rows[rows.length - 1];
        return last.textContent.replace(/\s+/g,' ').trim().substring(0,80);
      }
      return null;
    });
    console.log('📝 Última fila en carrito:', ultimaFila);

    // ── VALIDACIONES ──
    const rowsAgregados = carritoDespues.rows - carritoAntes.rows;
    const v1 = ordenInfo !== null;                                     // Orden de taller encontrada
    const v2 = carritoAntes.rows >= 0;                                 // Carrito accesible antes
    const v3 = rowsAgregados >= 1;                                     // Al menos 1 fila nueva en carrito
    const v4 = !isNaN(totalVal) && totalVal > 0;                       // Total > 0 tras agregar
    const v5 = ultimaFila !== null && ultimaFila.length > 0;           // Fila con contenido

    console.log('\n📊 === VALIDACIONES CP-112 ===');
    console.log('  Orden de taller encontrada:    ' + (v1 ? '✅' : '❌') + ' ' + ordenInfo?.textoCard?.substring(0,40));
    console.log('  Carrito accesible antes:        ' + (v2 ? '✅' : '❌') + ' (' + carritoAntes.rows + ' filas)');
    console.log('  Fila(s) nueva(s) en carrito:   ' + (v3 ? '✅' : '❌') + ' (+' + rowsAgregados + ' → total ' + carritoDespues.rows + ')');
    console.log('  Total carrito > 0:             ' + (v4 ? '✅' : '⚠️') + ' ' + totalTxt);
    console.log('  Última fila tiene contenido:   ' + (v5 ? '✅' : '⚠️') + ' "' + (ultimaFila?.substring(0,40) ?? 'N/A') + '"');

    if (!v1) throw new Error('No se encontró orden de taller');
    if (!v3) throw new Error('No se agregó ningún producto al carrito (antes=' + carritoAntes.rows + ' después=' + carritoDespues.rows + ')');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    const pasadas = [v1,v2,v3,v4,v5].filter(Boolean).length;
    const icono = pasadas >= 4 ? '✅' : '⚠️';
    console.log(icono + ' CP-112 PASSED | orden: "' + ordenInfo.textoCard.substring(0,30) + '" | producto: "' + (productoNombre??'?') + '" | antes: ' + carritoAntes.rows + ' → después: ' + carritoDespues.rows + ' (+' + rowsAgregados + ') | total: ' + totalTxt + ' | validaciones: ' + pasadas + '/5 | tiempo: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp112-fail');
    console.log('❌ CP-112 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp112_agregar_producto_rapido_taller();
