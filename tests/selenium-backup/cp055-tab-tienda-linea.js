const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp055_tab_tienda_linea() {
  console.log('🔄 Ejecutando CP-055: Verificar que el tab "Tienda en línea" cargue correctamente...');

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

    const tabBtn = await driver.findElement(By.id('btn_get_virtual_order_list')).catch(() => null);
    if (!tabBtn) {
      console.log('❌ CP-055 FAILED: No se encontró el tab "Tienda en línea"');
      process.exit(1);
    }

    await driver.executeScript(`document.getElementById('btn_get_virtual_order_list').click();`);
    await driver.sleep(2500);

    const bodyText = await driver.findElement(By.css('body')).getText();
    const loaded = /[oó]rdenes pendientes/i.test(bodyText) && /[oó]rdenes aprobadas/i.test(bodyText);

    if (loaded) {
      console.log('✅ CP-055 PASSED: El tab "Tienda en línea" cargó correctamente');
    } else {
      console.log('❌ CP-055 FAILED: El tab "Tienda en línea" no mostró contenido reconocible');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-055 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp055_tab_tienda_linea();
