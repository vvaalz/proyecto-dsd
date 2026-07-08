const { chromium } = require('@playwright/test');
const path = require('path');
const { LOGIN_URL, EMAIL, PASSWORD } = require('../config');

const SESION_PATH = path.join(__dirname, 'sesion-qa.json');

async function generarSesion() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1200 }
  });
  const page = await context.newPage();

  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('#loginButton');
  await page.waitForURL('**/dashboard**', { timeout: 40000 });

  await context.storageState({ path: SESION_PATH });
  console.log('✅ Sesión guardada en ' + SESION_PATH);

  await browser.close();
}

module.exports = { generarSesion };

if (require.main === module) {
  generarSesion();
}
