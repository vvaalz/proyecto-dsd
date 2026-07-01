const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';

async function cp049_filtro_vehiculos_pos() {
  console.log('🔄 Ejecutando CP-049: Verificar que "Filtros de Vehículos" despliegue las opciones de filtrado...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  await context.clearCookies();
  const page = await context.newPage();
  try {
    await page.goto('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
    await page.fill('#email', 'qadesignsoftcr@gmail.com');
    await page.fill('#password', 'qa0000');
    await page.click('#loginButton');
    await page.waitForURL('**/dashboard**', { timeout: 40000 });

    const t0 = Date.now();
    await page.goto(POS, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 40000 });
    await page.waitForTimeout(3000);
    console.log('⏱ Carga POS: ' + (Date.now() - t0) + 'ms');

    const filterBtnExists = await page.evaluate(() => !!document.getElementById('btn_toggle_pos_vehicle_filters'));
    if (!filterBtnExists) throw new Error('No se encontró el botón "Filtros de Vehículos"');

    const t1 = Date.now();
    await page.evaluate(() => document.getElementById('btn_toggle_pos_vehicle_filters').click());
    await page.waitForTimeout(1500);
    console.log('⏱ Abrir panel filtros: ' + (Date.now() - t1) + 'ms');

    const filtersText = await page.evaluate(() => {
      const isVis = (el) => { const r=el.getBoundingClientRect(),s=window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const c = document.getElementById('pos_vehicle_filters_container');
      return c&&isVis(c) ? c.textContent.replace(/\s+/g,' ').trim() : null;
    });
    console.log('🚗 Contenido visible del panel de filtros de vehículos:', filtersText);

    const requiredFilters = ['Marca','Modelo','Año','Transmisión','Motor','Categoría'];
    const missing = filtersText ? requiredFilters.filter(f => !filtersText.includes(f)) : requiredFilters;

    if (missing.length === 0) {
      console.log('✅ CP-049 PASSED: El panel de filtros de vehículos despliega Marca, Modelo, Año, Transmisión, Motor y Categoría');
    } else {
      throw new Error('Faltan filtros en el panel: ' + JSON.stringify(missing));
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp049-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-049 FAILED: ' + error.message);
    process.exit(1);
  } finally { await browser.close(); }
}
cp049_filtro_vehiculos_pos();
