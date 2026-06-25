const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp021_carga_modulo_reporte_ordenes() {
  console.log('🔄 Ejecutando CP-021: Verificar que el módulo de Reporte de Órdenes cargue sin errores...');

  const options = new chrome.Options();
  options.addArguments('--disable-notifications');
  options.addArguments('--window-size=1440,1200');
  const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();

  try {
    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await driver.findElement(By.id('email')).sendKeys('qadesignsoftcr@gmail.com');
    await driver.findElement(By.id('password')).sendKeys('qa0000');
    await driver.findElement(By.id('loginButton')).click();
    await driver.wait(until.urlContains('dashboard'), 20000);

    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/reports/order_report');
    await driver.sleep(5000);

    const currentUrl = await driver.getCurrentUrl();
    const bodyText = await driver.findElement(By.css('body')).getText();
    const loaded = currentUrl.includes('order_report') && (bodyText.includes('Reporte') || bodyText.includes('órden') || bodyText.includes('Orden'));

    if (loaded) {
      console.log('✅ CP-021 PASSED: El módulo de Reporte de Órdenes cargó correctamente');
    } else {
      console.log('❌ CP-021 FAILED: El módulo no cargó como se esperaba');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-021 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp021_carga_modulo_reporte_ordenes();
