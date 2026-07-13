const { chromium } = require('@playwright/test');
const path = require('path');
const { abrirContextoConSesion, refrescarConCacheLimpia } = require('../auth/usar-sesion');
const { BASE_URL } = require('../config');

const PANEL_URL = `${BASE_URL}/sett/setting`;

async function run() {
  const browser = await chromium.launch({ headless: false });
  const context = await abrirContextoConSesion(browser);
  const page = await context.newPage();

  await page.goto(PANEL_URL, { waitUntil: 'load', timeout: 180000 });
  await page.waitForTimeout(3000);
  await page.waitForSelector('.nav-tabs', { state: 'attached', timeout: 60000 });
  await page.waitForTimeout(1500);
  await refrescarConCacheLimpia(page);
  await page.waitForSelector('.nav-tabs', { state: 'attached', timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { document.getElementById('workshop-web-notification-permission-dismiss')?.click(); });
  await page.waitForTimeout(500);

  // Click en el tab "Tienda online"
  await page.click('a[href="#store"]');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(__dirname, '..', '_inspect_to_1_tab.png'), fullPage: true }).catch(() => {});

  const tabActivo = await page.evaluate(() => document.querySelector('#store')?.classList.contains('active'));
  console.log('📋 Tab "Tienda online" activo:', tabActivo);

  // Enumerar todos los campos dentro del tab-pane #store
  const campos = await page.evaluate(() => {
    const cont = document.getElementById('store');
    if (!cont) return [];
    const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const elementos = Array.from(cont.querySelectorAll('input, select, textarea, button'));
    return elementos.map(el => {
      let label = '';
      let prev = el.previousElementSibling;
      if (prev && prev.tagName !== 'INPUT' && prev.tagName !== 'SELECT') label = prev.textContent.replace(/\s+/g,' ').trim().substring(0, 100);
      if (!label) {
        let p = el.parentElement;
        for (let i = 0; i < 3 && p; i++) {
          const txt = p.textContent.replace(/\s+/g,' ').trim();
          if (txt && txt.length < 150) { label = txt.substring(0, 120); break; }
          p = p.parentElement;
        }
      }
      let opciones = null;
      if (el.tagName === 'SELECT') opciones = Array.from(el.options).map(o => ({ value: o.value, text: o.textContent.trim() }));
      return {
        tag: el.tagName,
        type: el.type || null,
        id: el.id || null,
        name: el.name || null,
        multiple: el.multiple || false,
        visible: isVis(el),
        value: el.type === 'checkbox' ? el.checked : (el.value || '').substring(0, 60),
        opciones,
        label,
        onclick: el.getAttribute('onclick')
      };
    });
  });

  console.log('📋 Total campos encontrados en #store:', campos.length);
  console.log(JSON.stringify(campos, null, 2));

  // Buscar el botón de guardado propio y confirmar que es independiente
  const btnGuardar = await page.evaluate(() => {
    const btn = document.getElementById('save_settings_store');
    return btn ? { tag: btn.tagName, type: btn.type, txt: btn.textContent.replace(/\s+/g,' ').trim() } : null;
  });
  console.log('📋 Botón de guardado #save_settings_store:', JSON.stringify(btnGuardar));

  console.log('FIN');
  await browser.close();
}
run().catch(e => { console.log('ERROR:', e.message); process.exit(1); });
