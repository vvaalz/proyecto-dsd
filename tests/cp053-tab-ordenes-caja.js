const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp053_tab_ordenes_caja() {
  console.log('🔄 Ejecutando CP-053: Verificar que el tab (F2) Órdenes de caja cargue correctamente...');

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

    const tabBtn = await driver.findElement(By.id('btn_cashier_option')).catch(() => null);
    if (!tabBtn) {
      console.log('❌ CP-053 FAILED: No se encontró el tab "(F2) Órdenes de caja"');
      process.exit(1);
    }

    await driver.executeScript(`document.getElementById('btn_cashier_option').click();`);
    await driver.sleep(2500);

    const bodyText = await driver.findElement(By.css('body')).getText();
    const loaded = /orden #\d+/i.test(bodyText) || /no se encontraron/i.test(bodyText);

    if (loaded) {
      console.log('✅ CP-053 PASSED: El tab "(F2) Órdenes de caja" cargó correctamente');
    } else {
      console.log('❌ CP-053 FAILED: El tab "(F2) Órdenes de caja" no mostró contenido reconocible');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-053 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp053_tab_ordenes_caja();
