const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','..','..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
};
function evaluarCargaPagina(ms, e) { if(ms>8000) console.log('❌ PERFORMANCE FAILED: '+e+' tardó '+ms+'ms'); else if(ms>3000) console.log('⚠️ LENTO: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }
function evaluarAccion(ms, e) { if(ms>4000) console.log('❌ Acción lenta: '+e+' tardó '+ms+'ms'); else if(ms>1500) console.log('⚠️ Acción algo lenta: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }

async function agregarProducto(page, src, nombre) {
  const added = await page.evaluate(({ src }) => {
    const re = new RegExp(src, 'i');
    const box = Array.from(document.querySelectorAll('.product_box')).find(b => re.test((b.textContent||'').replace(/\s+/g,' ')));
    if (!box) return false;
    (box.querySelector('.product_box_quantity_content') || box).click(); return true;
  }, { src });
  if (added) {
    await page.waitForFunction(({ src }) => new RegExp(src,'i').test((document.getElementById('tb_table_buy_list')||{textContent:''}).textContent), { src }, { timeout: 15000 }).catch(()=>{});
  } else {
    console.log('⚠️ No encontrado: ' + nombre);
  }
  await page.waitForTimeout(800);
  return added;
}

async function cp123_vista_cuadricula_lista() {
  console.log('🔄 Ejecutando CP-123: Cambiar vista de cuadrícula a lista y viceversa...');
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

    // ── PASO 1: Cambiar a vista LISTA (style_list) y agregar un producto ──
    const tLista = Date.now();
    const listaOk = await page.evaluate(() => {
      const btn = document.getElementById('style_list');
      if (!btn) return false;
      btn.click(); return true;
    });
    await page.waitForTimeout(2500);
    evaluarAccion(Date.now() - tLista, 'Cambiar a vista lista');
    if (!listaOk) { await screenshotOnFail(page, 'cp123-fail-style-list'); throw new Error('No se encontró el botón style_list'); }

    const vistaListaClase = await page.evaluate(() => document.querySelector('.product_box')?.className || null);
    console.log('👁️ Clase del product_box en vista lista:', vistaListaClase);

    const producto1 = await agregarProducto(page, 'aaa-mult', 'AAA-Multímetro (vista lista)');
    if (!producto1) { await screenshotOnFail(page, 'cp123-fail-producto-lista'); throw new Error('No se pudo agregar producto en vista lista'); }
    const rowsTrasLista = await page.evaluate(() => document.getElementById('tb_table_buy_list')?.querySelectorAll('tr.main_row').length || 0);
    console.log('🛒 Filas en carrito tras vista lista:', rowsTrasLista);

    // ── PASO 2: Cambiar a vista CUADRÍCULA (style_box) y agregar otro producto ──
    const tBox = Date.now();
    const boxOk = await page.evaluate(() => {
      const btn = document.getElementById('style_box');
      if (!btn) return false;
      btn.click(); return true;
    });
    await page.waitForTimeout(2500);
    evaluarAccion(Date.now() - tBox, 'Cambiar a vista cuadrícula');
    if (!boxOk) { await screenshotOnFail(page, 'cp123-fail-style-box'); throw new Error('No se encontró el botón style_box'); }

    const vistaBoxClase = await page.evaluate(() => document.querySelector('.product_box')?.className || null);
    console.log('👁️ Clase del product_box en vista cuadrícula:', vistaBoxClase);

    const producto2 = await agregarProducto(page, 'aaa-bombillos', 'AAA-Bombillos (vista cuadrícula)');
    if (!producto2) { await screenshotOnFail(page, 'cp123-fail-producto-cuadricula'); throw new Error('No se pudo agregar producto en vista cuadrícula'); }
    const rowsTrasBox = await page.evaluate(() => document.getElementById('tb_table_buy_list')?.querySelectorAll('tr.main_row').length || 0);
    console.log('🛒 Filas en carrito tras vista cuadrícula:', rowsTrasBox);

    // ── VALIDACIONES ──
    const carritoTexto = await page.evaluate(() => document.getElementById('tb_table_buy_list')?.textContent || '');
    const v1 = listaOk;
    const v2 = producto1;
    const v3 = boxOk;
    const v4 = producto2;
    const v5 = /multímetro/i.test(carritoTexto) && /bombillos/i.test(carritoTexto);

    console.log('\n📊 === VALIDACIONES CP-123 ===');
    console.log('  Cambio a vista lista:                ' + (v1 ? '✅' : '❌'));
    console.log('  Producto agregado en vista lista:    ' + (v2 ? '✅' : '❌'));
    console.log('  Cambio a vista cuadrícula:            ' + (v3 ? '✅' : '❌'));
    console.log('  Producto agregado en vista cuadrícula:' + (v4 ? '✅' : '❌'));
    console.log('  Ambos productos quedan en el carrito: ' + (v5 ? '✅' : '❌'));

    if (!v1) throw new Error('No se pudo cambiar a vista lista');
    if (!v2) throw new Error('No se pudo agregar producto en vista lista');
    if (!v3) throw new Error('No se pudo cambiar a vista cuadrícula');
    if (!v4) throw new Error('No se pudo agregar producto en vista cuadrícula');
    if (!v5) throw new Error('No ambos productos quedaron en el carrito tras cambiar de vista');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-123 PASSED | vista lista → producto 1 agregado | vista cuadrícula → producto 2 agregado | carrito final: ' + rowsTrasBox + ' filas | validaciones: 5/5 | tiempo: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp123-fail');
    console.log('❌ CP-123 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp123_vista_cuadricula_lista();
