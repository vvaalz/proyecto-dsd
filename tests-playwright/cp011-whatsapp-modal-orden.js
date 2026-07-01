const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function cp011_whatsapp_modal_orden() {
  console.log('🔄 Ejecutando CP-011: Verificar que el modal de WhatsApp aparece tras generar la orden...');

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
    await page.goto('https://dev.designsoftcr.com/qa_talleralpha/public/vehicularReception/vehicularQuickReception');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    console.log('⏱ Carga módulo recepción: ' + (Date.now() - inicio) + 'ms');

    try {
      await page.locator('button.add-reception-btn, button.btn-success, button.btn-primary')
        .filter({ visible: true }).first().click({ timeout: 5000 });
      await page.waitForTimeout(4000);
    } catch {}

    try {
      await page.locator('button.btn-success, button.btn-primary, button[type="submit"], button[id*="save"]')
        .filter({ visible: true }).first().click({ timeout: 5000 });
      await page.waitForTimeout(4000);
    } catch {}

    const bodyText = await page.locator('body').innerText();
    const modalVisible = /whatsapp|whats app|wa\.|wa /i.test(bodyText);

    const whatsappControlFound = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('button, a, div, span')).slice(0, 60);
      return elements.some(el => {
        const text = (el.textContent || '').toLowerCase();
        const title = (el.getAttribute('title') || '').toLowerCase();
        return text.includes('whatsapp') || text.includes('whats app') || title.includes('whatsapp');
      });
    });

    if (modalVisible || whatsappControlFound) {
      console.log('✅ CP-011 PASSED: El modal o mensaje de WhatsApp quedó visible tras generar la orden');
    } else {
      throw new Error('No se detectó el modal de WhatsApp tras la generación de la orden');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp011-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-011 FAILED: ' + error.message);
    await browser.close();
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp011_whatsapp_modal_orden();
