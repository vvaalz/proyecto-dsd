const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp057_tab_cotizacion_f4() {
  console.log('🔄 Ejecutando CP-057: Verificar que el tab (F4) Cotización cargue el listado de cotizaciones...');

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

    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1');
    await driver.wait(until.elementLocated(By.id('product_search')), 20000);
    await driver.sleep(3000);

    const tabBtn = await driver.findElement(By.id('btn_proform_option')).catch(() => null);
    if (!tabBtn) {
      console.log('❌ CP-057 FAILED: No se encontró el tab "(F4) Cotización"');
      process.exit(1);
    }

    await driver.executeScript(`document.getElementById('btn_proform_option').click();`);
    await driver.sleep(2500);

    const bodyText = await driver.findElement(By.css('body')).getText();
    const loaded = /cotizaci[oó]n #\d+/i.test(bodyText) || /no se encontraron/i.test(bodyText);

    if (loaded) {
      console.log('✅ CP-057 PASSED: El tab "(F4) Cotización" cargó el listado de cotizaciones');
    } else {
      console.log('❌ CP-057 FAILED: El tab "(F4) Cotización" no mostró el listado esperado');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-057 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp057_tab_cotizacion_f4();
