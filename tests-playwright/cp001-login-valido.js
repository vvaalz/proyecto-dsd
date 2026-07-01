const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function cp001_login_valido() {
  console.log('🔄 Ejecutando CP-001: Login con credenciales válidas...');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  await context.clearCookies();
  const page = await context.newPage();

  try {
    const inicio = Date.now();
    await page.goto('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
    await page.waitForSelector('#loginButton');
    const tiempoCarga = Date.now() - inicio;
    if (tiempoCarga > 8000) console.log(`❌ PERFORMANCE FAILED: carga login tardó ${tiempoCarga}ms`);
    else if (tiempoCarga > 3000) console.log(`⚠️ LENTO: carga login tardó ${tiempoCarga}ms`);
    else console.log(`⏱ Carga login: ${tiempoCarga}ms`);

    await page.fill('#email', 'qadesignsoftcr@gmail.com');
    await page.fill('#password', 'qa0000');
    await page.click('#loginButton');
    await page.waitForURL('**/dashboard**', { timeout: 40000 });

    const url = page.url();
    if (url.includes('dashboard')) {
      console.log('✅ CP-001 PASSED: Login exitoso, redirigió al dashboard correctamente');
    } else {
      throw new Error('No redirigió al dashboard (URL actual: ' + url + ')');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, `cp001-fallo-${Date.now()}.png`) });
    console.log('❌ CP-001 FAILED: ' + error.message);
    await browser.close();
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp001_login_valido();
