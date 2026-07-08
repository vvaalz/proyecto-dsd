const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';
// Producto de referencia: AAA-Multímetro Automotriz Digital (id 12480)
// input_hide_product_code_12480 = "7441003590489" — en este sistema el código interno
// del producto y su código de barras son el mismo campo (CABYS/EAN usado como código)
const CODIGO_BARRAS_COMPLETO = '7441003590489';
const CODIGO_PARCIAL = '744100359';

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','..','..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
};
function evaluarCargaPagina(ms, e) { if(ms>8000) console.log('❌ PERFORMANCE FAILED: '+e+' tardó '+ms+'ms'); else if(ms>3000) console.log('⚠️ LENTO: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }
function evaluarAccion(ms, e) { if(ms>4000) console.log('❌ Acción lenta: '+e+' tardó '+ms+'ms'); else if(ms>1500) console.log('⚠️ Acción algo lenta: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }

async function buscarProducto(page, termino) {
  await page.click('#product_search').catch(() => {});
  await page.fill('#product_search', '');
  await page.fill('#product_search', termino);
  await page.waitForTimeout(800);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2000);

  return page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    const boxes = Array.from(document.querySelectorAll('.product_box')).filter(isVis)
      .filter(b => !/^\s*crear\s*producto\s*$/i.test(b.textContent.replace(/\s+/g,' ').trim()));
    return boxes.map(b => {
      const nameEl = b.querySelector('.product_box_name, .product-name');
      return nameEl ? nameEl.textContent.trim() : b.textContent.replace(/\s+/g,' ').trim().substring(0,60);
    });
  });
}

async function cp122_buscador_productos() {
  console.log('🔄 Ejecutando CP-122: Buscador de productos por nombre, código y código de barras...');
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
    await page.goto(POS_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 40000 });
    await page.waitForTimeout(3000);
    await page.waitForSelector('.product_box', { timeout: 15000 });
    evaluarCargaPagina(Date.now() - t0, 'Carga POS');

    // ── Búsqueda 1: por NOMBRE ──
    const tNombre = Date.now();
    const resultadosNombre = await buscarProducto(page, 'multimetro');
    evaluarAccion(Date.now() - tNombre, 'Búsqueda por nombre');
    console.log('🔎 Búsqueda por nombre "multimetro":', JSON.stringify(resultadosNombre));
    const matchNombre = resultadosNombre.some(n => /multímetro|multimetro/i.test(n));

    // ── Búsqueda 2: por CÓDIGO completo (código de barras / CABYS interno) ──
    const tCodigo = Date.now();
    const resultadosCodigo = await buscarProducto(page, CODIGO_BARRAS_COMPLETO);
    evaluarAccion(Date.now() - tCodigo, 'Búsqueda por código completo');
    console.log('🔎 Búsqueda por código "' + CODIGO_BARRAS_COMPLETO + '":', JSON.stringify(resultadosCodigo));
    const matchCodigo = resultadosCodigo.some(n => /multímetro|multimetro/i.test(n));

    // ── Búsqueda 3: por CÓDIGO DE BARRAS parcial (simula lectura parcial de escáner) ──
    const tBarras = Date.now();
    const resultadosBarras = await buscarProducto(page, CODIGO_PARCIAL);
    evaluarAccion(Date.now() - tBarras, 'Búsqueda por código de barras parcial');
    console.log('🔎 Búsqueda por código de barras parcial "' + CODIGO_PARCIAL + '":', JSON.stringify(resultadosBarras));
    const matchBarras = resultadosBarras.some(n => /multímetro|multimetro/i.test(n));

    // ── VALIDACIONES ──
    const v1 = matchNombre;
    const v2 = matchCodigo;
    const v3 = matchBarras;

    console.log('\n📊 === VALIDACIONES CP-122 ===');
    console.log('  Búsqueda por nombre encuentra el producto:         ' + (v1 ? '✅' : '❌'));
    console.log('  Búsqueda por código encuentra el producto:         ' + (v2 ? '✅' : '❌'));
    console.log('  Búsqueda por código de barras (parcial) encuentra: ' + (v3 ? '✅' : '❌'));
    console.log('  (Nota: en este sistema el código interno y el código de barras comparten el mismo campo — input_hide_product_code_<id>)');

    if (!v1) throw new Error('La búsqueda por nombre no encontró el producto esperado');
    if (!v2) throw new Error('La búsqueda por código no encontró el producto esperado');
    if (!v3) throw new Error('La búsqueda por código de barras parcial no encontró el producto esperado');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-122 PASSED | nombre: ' + resultadosNombre.length + ' resultado(s) | código: ' + resultadosCodigo.length + ' resultado(s) | código de barras: ' + resultadosBarras.length + ' resultado(s) | validaciones: 3/3 | tiempo: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp122-fail');
    console.log('❌ CP-122 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp122_buscador_productos();
