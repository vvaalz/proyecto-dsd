const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');

const RUTAS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/route/adminRoute';
const POS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';
const NOMBRE_RUTA = 'Ruta QA CP139 integracion ' + Date.now();

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','..','..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
};
function evaluarCargaPagina(ms, e) { if(ms>8000) console.log('❌ PERFORMANCE FAILED: '+e+' tardó '+ms+'ms'); else if(ms>3000) console.log('⚠️ LENTO: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }
function evaluarAccion(ms, e) { if(ms>4000) console.log('❌ Acción lenta: '+e+' tardó '+ms+'ms'); else if(ms>1500) console.log('⚠️ Acción algo lenta: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }

async function navegarAModulo(browser, context, url) {
  let page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (/\/log\/login/i.test(page.url())) {
    console.log('⚠️ Sesión expirada (redirect a /log/login) — regenerando y reintentando...');
    await page.close();
    fs.rmSync(SESION_PATH, { force: true });
    const contextNuevo = await abrirContextoConSesion(browser);
    page = await contextNuevo.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (/\/log\/login/i.test(page.url())) throw new Error('Sigue redirigiendo a /log/login tras regenerar la sesión');
    return { context: contextNuevo, page };
  }
  return { context, page };
}

async function cp139_integracion_ruta_pos() {
  console.log('🔄 Ejecutando CP-139: Integración — una ruta nueva de Admin. Rutas aparece en "Orden de ruteo" del POS...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;

  try {
    // ── PASO 1: Crear una ruta nueva en Admin. Rutas ──
    const t0 = Date.now();
    ({ context, page } = await navegarAModulo(browser, context, RUTAS_URL));
    await refrescarConCacheLimpia(page);
    await page.waitForTimeout(1500);
    evaluarCargaPagina(Date.now() - t0, 'Carga Admin. Rutas');

    for (let i = 0; i < 20; i++) {
      const hay = await page.evaluate(() => /clientes/i.test(document.querySelector('.pce-table')?.textContent || ''));
      if (hay) break;
      await page.waitForTimeout(500);
    }

    await page.evaluate(() => { document.getElementById('btn_add_route')?.click(); });
    await page.waitForSelector('#dialog_add_route', { timeout: 8000 });
    await page.waitForTimeout(800);
    await page.fill('#route_name_input', NOMBRE_RUTA);
    await page.evaluate(() => {
      const sel = document.getElementById('route_zone_select');
      const opcion = sel ? Array.from(sel.options).find(o => o.value && o.value !== '') : null;
      if (opcion) { sel.value = opcion.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => { document.getElementById('btn_save_new_route')?.click(); });
    await page.waitForTimeout(2000);
    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width>0&&r.height>0; };
      const btn = Array.from(document.querySelectorAll('.sweet-alert button')).filter(isVis)[0];
      if (btn) btn.click();
    });
    await page.waitForTimeout(1000);
    console.log('🆕 Ruta creada en Admin. Rutas:', NOMBRE_RUTA);

    // ── PASO 2: Ir al POS, agregar un producto y abrir "Orden de ruteo" ──
    const t1 = Date.now();
    ({ context, page } = await navegarAModulo(browser, context, POS_URL));
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 180000 });
    await page.waitForTimeout(3000);
    await page.waitForSelector('.product_box', { timeout: 60000 });
    await page.evaluate(() => { window.print = () => {}; });
    evaluarCargaPagina(Date.now() - t1, 'Carga POS');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(2000);
    await page.evaluate(() => { window.print = () => {}; });

    const productoAgregado = await page.evaluate(() => {
      const box = Array.from(document.querySelectorAll('.product_box')).find(b => /aaa-mult[ií]metro/i.test((b.textContent||'').replace(/\s+/g,' ')));
      if (!box) return false;
      (box.querySelector('.product_box_quantity_content') || box).click();
      return true;
    });
    if (!productoAgregado) { await screenshotOnFail(page, 'cp139-fail-producto'); throw new Error('No se pudo agregar un producto al carrito'); }
    await page.waitForTimeout(1000);

    const tAbrir = Date.now();
    await page.evaluate(() => { try { create_routing_order(); } catch (e) {} });
    await page.waitForSelector('#dialog_add_routing_order', { timeout: 10000 });
    await page.waitForTimeout(1500);
    evaluarAccion(Date.now() - tAbrir, 'Abrir modal Orden de ruteo');

    // ── PASO 3: Buscar la ruta recién creada en el select "Asignar ruta" ──
    const rutaEncontrada = await page.evaluate((nombre) => {
      const sel = document.getElementById('send_routing_order_route');
      if (!sel) return { encontrado: false, motivo: 'select no existe' };
      const opcion = Array.from(sel.options).find(o => o.textContent.trim() === nombre);
      return { encontrado: !!opcion, totalOpciones: sel.options.length, value: opcion ? opcion.value : null };
    }, NOMBRE_RUTA);
    console.log('🔎 Ruta buscada en el selector "Asignar ruta":', JSON.stringify(rutaEncontrada));

    // ── VALIDACIONES ──
    const v1 = rutaEncontrada.encontrado;
    const v2 = rutaEncontrada.totalOpciones > 1; // al menos la ruta nueva + el placeholder

    console.log('\n📊 === VALIDACIONES CP-139 ===');
    console.log('  Ruta nueva aparece en el selector del POS:  ' + (v1 ? '✅' : '❌') + ' (' + NOMBRE_RUTA + ')');
    console.log('  Selector tiene múltiples opciones:           ' + (v2 ? '✅' : '❌') + ' (' + rutaEncontrada.totalOpciones + ')');

    if (!v1) throw new Error('La ruta "' + NOMBRE_RUTA + '" creada en Admin. Rutas no aparece en el selector "Asignar ruta" del POS');
    if (!v2) throw new Error('El selector de ruta no tiene las opciones esperadas');

    console.log('✅ CP-139 PASSED | ruta creada en Admin. Rutas y confirmada en el selector del POS | validaciones: 2/2');

  } catch (error) {
    await screenshotOnFail(page, 'cp139-fail');
    console.log('❌ CP-139 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp139_integracion_ruta_pos();
