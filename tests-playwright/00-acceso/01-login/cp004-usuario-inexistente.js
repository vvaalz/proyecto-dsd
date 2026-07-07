const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function cp004_usuario_inexistente() {
  console.log('🔄 Ejecutando CP-004: Login con usuario inexistente...');

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

    await page.fill('#email', 'usuario_falso@noexiste.com');
    await page.fill('#password', 'cualquier123');
    await page.click('#loginButton');
    await page.waitForTimeout(3000);

    const url = page.url();
    if (!url.includes('dashboard')) {
      console.log('✅ CP-004 PASSED: El sistema rechazó el usuario inexistente correctamente');
    } else {
      throw new Error('El sistema permitió acceso con usuario inexistente');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', '..', '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, `cp004-fallo-${Date.now()}.png`) });
    console.log('❌ CP-004 FAILED: ' + error.message);
    await browser.close();
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp004_usuario_inexistente();
