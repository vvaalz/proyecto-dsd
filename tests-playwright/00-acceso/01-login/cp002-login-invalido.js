const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function cp002_login_invalido() {
  console.log('🔄 Ejecutando CP-002: Login con contraseña incorrecta...');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  await context.clearCookies();
  const page = await context.newPage();

  try {
    const inicio = Date.now();
    await page.goto('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
    await page.waitForSelector('#loginButton');
    console.log(`⏱ Carga login: ${Date.now() - inicio}ms`);

    await page.fill('#email', 'qadesignsoftcr@gmail.com');
    await page.fill('#password', 'contraseña_incorrecta');
    await page.click('#loginButton');
    await page.waitForTimeout(3000);

    const url = page.url();
    if (!url.includes('dashboard')) {
      console.log('✅ CP-002 PASSED: El sistema rechazó las credenciales incorrectas correctamente');
    } else {
      throw new Error('El sistema permitió acceso con contraseña incorrecta');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', '..', '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, `cp002-fallo-${Date.now()}.png`) });
    console.log('❌ CP-002 FAILED: ' + error.message);
    await browser.close();
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp002_login_invalido();
