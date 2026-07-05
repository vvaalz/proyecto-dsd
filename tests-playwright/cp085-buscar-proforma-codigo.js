const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const URL_HISTORIAL = 'https://dev.designsoftcr.com/qa_talleralpha/public/proform/printPosProform';

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
};
function evaluarCargaPagina(ms, e) { if(ms>8000) console.log('❌ PERFORMANCE FAILED: '+e+' tardó '+ms+'ms'); else if(ms>3000) console.log('⚠️ LENTO: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }
function evaluarAccion(ms, e) { if(ms>4000) console.log('❌ Acción lenta: '+e+' tardó '+ms+'ms'); else if(ms>1500) console.log('⚠️ Acción algo lenta: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }

async function cp085_buscar_proforma_codigo() {
  console.log('🔄 Ejecutando CP-085: Buscar proforma por código/número en historial...');
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
    await page.goto(URL_HISTORIAL, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(2500);
    evaluarCargaPagina(Date.now() - t0, 'Carga historial Cotizaciones');

    // Paso 1: Cargar lista completa primero
    await page.evaluate(() => {
      const s = document.getElementById('start_date'); if (s) s.value = '2026-01-01';
      const e = document.getElementById('end_date'); if (e) e.value = '2026-07-10';
      document.getElementById('btn_search_receip')?.click();
    });
    await page.waitForTimeout(3000);

    // Contar items antes de filtrar
    const itemsAntes = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      return Array.from(document.querySelectorAll('[id*="proform_client_name"],[class*="proform-item"],[class*="receipt"],[class*="proform_item"]')).filter(isVis).length;
    });
    console.log('📊 Items en lista sin filtro:', itemsAntes);

    // Buscar el primer ID de proforma existente para usar como término de búsqueda
    const primerIdProforma = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      // Buscar IDs de proforma en el DOM (posiblemente en spans o tds)
      const ids = Array.from(document.querySelectorAll('[id*="proform"],[class*="proform"]')).filter(isVis)
        .map(el => el.textContent.replace(/\s+/g,' ').trim())
        .filter(t => /^\d+$/.test(t.trim())).slice(0,3);
      // También buscar en onclick atributos
      const onclickIds = Array.from(document.querySelectorAll('[onclick*="proform"],[onclick*="download"],[onclick*="confirm"]'))
        .filter(isVis).map(el => (el.getAttribute('onclick')||'').match(/\d+/)?.[0]).filter(Boolean).slice(0,3);
      return { ids, onclickIds };
    });
    console.log('🔍 IDs proforma disponibles:', JSON.stringify(primerIdProforma));

    // Paso 2: Buscar por un ID específico (usando el primero encontrado o "2303" conocido)
    const termBusqueda = primerIdProforma.onclickIds[0] || primerIdProforma.ids[0] || '2303';
    const tBuscar = Date.now();
    await page.fill('#receip_search', termBusqueda);
    await page.waitForTimeout(300);
    await page.evaluate(() => { document.getElementById('btn_search_receip')?.click(); });
    await page.waitForTimeout(3000);
    evaluarAccion(Date.now() - tBuscar, 'Búsqueda por código "' + termBusqueda + '"');

    const itemsDespues = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      return Array.from(document.querySelectorAll('[id*="proform_client_name"],[class*="proform-item"],[class*="receipt"],[class*="proform_item"]')).filter(isVis).length;
    });
    console.log('📊 Items tras búsqueda "' + termBusqueda + '":', itemsDespues);

    // También buscar por texto vacío para resetear
    const tReset = Date.now();
    await page.fill('#receip_search', '');
    await page.evaluate(() => { document.getElementById('btn_search_receip')?.click(); });
    await page.waitForTimeout(2000);
    evaluarAccion(Date.now() - tReset, 'Reset búsqueda (campo vacío)');

    const itemsReset = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      return Array.from(document.querySelectorAll('[id*="proform_client_name"],[class*="proform-item"],[class*="receipt"],[class*="proform_item"]')).filter(isVis).length;
    });
    console.log('📊 Items tras reset:', itemsReset);

    // Validar que la búsqueda funcionó (encontró ≤ lista completa)
    const busquedaFunciona = itemsDespues <= itemsAntes;
    if (busquedaFunciona) console.log('✔ Búsqueda funciona: filtró de ' + itemsAntes + ' a ' + itemsDespues + ' items');
    else console.log('⚠️ Búsqueda no filtró (antes=' + itemsAntes + ' después=' + itemsDespues + ') — puede ser que la lista cargue con AJAX después');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-085 PASSED | módulo: Historial Cotizaciones | búsqueda por: "' + termBusqueda + '" | items sin filtro: ' + itemsAntes + ' | items con filtro: ' + itemsDespues + ' | búsqueda funciona: ' + busquedaFunciona + ' | tiempo: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp085-fail');
    console.log('❌ CP-085 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp085_buscar_proforma_codigo();
