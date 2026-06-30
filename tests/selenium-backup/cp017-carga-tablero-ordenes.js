const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp017_carga_tablero_ordenes() {
  console.log('🔄 Ejecutando CP-017: Verificar que el tablero de órdenes se cargue correctamente...');

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

    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/vehicularReception/workOrderBoard');
    await driver.wait(until.elementLocated(By.id('repair_order_search')), 20000);
    await driver.sleep(2000);

    const searchInput = await driver.findElement(By.id('repair_order_search'));
    const visible = await searchInput.isDisplayed();
    const placeholder = await searchInput.getAttribute('placeholder');
    const url = await driver.getCurrentUrl();

    if (visible && placeholder === 'Buscar órdenes...' && url.includes('workOrderBoard')) {
      console.log('✅ CP-017 PASSED: El tablero se cargó y el buscador está disponible');
    } else {
      console.log('❌ CP-017 FAILED: El tablero no cargó como se esperaba');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-017 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp017_carga_tablero_ordenes();
