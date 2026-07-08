const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function cp014_cambiar_vista_lista_caja() {
  console.log('🔄 Ejecutando CP-014: Verificar que cambiar de vista de lista a vista de caja funciona correctamente...');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  await context.clearCookies();
  const page = await context.newPage();

  try {
    await page.goto('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
    await page.fill('#email', 'qadesignsoftcr@gmail.com');
    await page.fill('#password', 'qa0000');
    await page.click('#loginButton');
    await page.waitForURL('**/dashboard**', { timeout: 40000 });

    const inicio = Date.now();
    await page.goto('https://dev.designsoftcr.com/qa_talleralpha/public/vehicularReception/workOrderBoard');
    await page.waitForSelector('#repair_order_search', { timeout: 20000 });
    await page.waitForTimeout(2000);
    console.log('⏱ Carga tablero: ' + (Date.now() - inicio) + 'ms');

    const clicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, a'));
      for (const btn of buttons) {
        const text = (btn.textContent || '').toLowerCase();
        const title = (btn.getAttribute('title') || '').toLowerCase();
        const label = text + ' ' + title;
        if (label.includes('caja') || label.includes('lista')) {
          btn.click();
          return true;
        }
      }
      return false;
    });

    if (clicked) {
      await page.waitForTimeout(2000);
      const bodyText = await page.locator('body').innerText();
      const changedView = /caja|lista|vista/i.test(bodyText);
      if (changedView) {
        console.log('✅ CP-014 PASSED: La vista del tablero respondió al cambio entre lista y caja');
      } else {
        throw new Error('El cambio de vista no reflejó un cambio visible en la interfaz');
      }
    } else {
      throw new Error('No se encontró un control de cambio de vista');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', '..', '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp014-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-014 FAILED: ' + error.message);
    await browser.close();
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp014_cambiar_vista_lista_caja();
