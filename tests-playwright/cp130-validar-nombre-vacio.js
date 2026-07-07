const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../auth/usar-sesion');

const RUTAS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/route/adminRoute';

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
};
function evaluarCargaPagina(ms, e) { if(ms>8000) console.log('❌ PERFORMANCE FAILED: '+e+' tardó '+ms+'ms'); else if(ms>3000) console.log('⚠️ LENTO: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }

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

function contarRutas(page) {
  return page.evaluate(() => {
    const tabla = document.querySelector('.pce-table');
    if (!tabla) return 0;
    return Array.from(tabla.querySelectorAll('tr')).filter(tr => /clientes/i.test(tr.textContent||'')).length;
  });
}

async function cp130_validar_nombre_vacio() {
  console.log('🔄 Ejecutando CP-130: Validar que el formulario rechaza nombre de ruta vacío...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;

  try {
    const t0 = Date.now();
    ({ context, page } = await navegarAModulo(browser, context, RUTAS_URL));
    await refrescarConCacheLimpia(page);
    await page.waitForTimeout(1500);
    evaluarCargaPagina(Date.now() - t0, 'Carga Admin. Rutas');

    // Tras refrescarConCacheLimpia la tabla puede tardar en poblarse vía AJAX
    for (let i = 0; i < 20; i++) {
      if ((await contarRutas(page)) > 0) break;
      await page.waitForTimeout(500);
    }
    const rutasAntes = await contarRutas(page);
    console.log('📋 Cantidad de rutas antes del intento:', rutasAntes);

    // ── Abrir formulario y dejar el nombre vacío ──
    await page.evaluate(() => { document.getElementById('btn_add_route')?.click(); });
    await page.waitForSelector('#dialog_add_route', { timeout: 8000 });
    await page.waitForTimeout(800);

    await page.evaluate(() => { document.getElementById('route_name_input').value = ''; });
    const zonaSeleccionada = await page.evaluate(() => {
      const sel = document.getElementById('route_zone_select');
      const opcionReal = sel ? Array.from(sel.options).find(o => o.value && o.value !== '') : null;
      if (opcionReal) { sel.value = opcionReal.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      return opcionReal ? opcionReal.textContent.trim() : null;
    });
    await page.waitForTimeout(500);

    // ── Intentar guardar con nombre vacío ──
    await page.evaluate(() => { document.getElementById('btn_save_new_route')?.click(); });
    await page.waitForTimeout(1500);

    const modalSigueAbierto = await page.evaluate(() => {
      const m = document.getElementById('dialog_add_route');
      return m ? window.getComputedStyle(m).display !== 'none' : false;
    });
    console.log('🪟 Modal sigue abierto tras intentar guardar vacío:', modalSigueAbierto);

    // Cerrar el modal para no dejar el estado sucio
    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width>0&&r.height>0; };
      const btn = Array.from(document.querySelectorAll('#dialog_add_route button')).filter(isVis).find(b => /cancelar/i.test(b.textContent||''));
      if (btn) btn.click();
    });
    await page.waitForTimeout(1000);

    const rutasDespues = await contarRutas(page);
    console.log('📋 Cantidad de rutas después del intento:', rutasDespues);

    // ── VALIDACIONES ──
    const v1 = modalSigueAbierto;
    const v2 = rutasDespues === rutasAntes;

    console.log('\n📊 === VALIDACIONES CP-130 ===');
    console.log('  Modal NO se cierra con nombre vacío:   ' + (v1 ? '✅' : '❌'));
    console.log('  No se creó ninguna ruta nueva:          ' + (v2 ? '✅' : '❌') + ' (' + rutasAntes + ' → ' + rutasDespues + ')');

    if (!v1) throw new Error('El modal se cerró aunque el nombre estaba vacío — validación no está funcionando');
    if (!v2) throw new Error('Se creó una ruta nueva a pesar de dejar el nombre vacío (' + rutasAntes + ' → ' + rutasDespues + ')');

    console.log('✅ CP-130 PASSED | validación de nombre requerido funciona correctamente | validaciones: 2/2');

  } catch (error) {
    await screenshotOnFail(page, 'cp130-fail');
    console.log('❌ CP-130 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp130_validar_nombre_vacio();
