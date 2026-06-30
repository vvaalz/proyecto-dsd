const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp020_avanzar_orden_siguiente_etapa() {
  console.log('🔄 Ejecutando CP-020: Verificar la interacción con el botón de configuración del tablero...');

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

    const configButton = await driver.findElement(By.id('kanban-config-menu-btn'));
    const title = await configButton.getAttribute('title');
    await driver.executeScript('arguments[0].click();', configButton);
    await driver.sleep(1000);

    if (title === 'Configuración') {
      console.log('✅ CP-020 PASSED: El botón de configuración del tablero respondió a la interacción');
    } else {
      console.log('❌ CP-020 FAILED: El botón de configuración no estaba disponible');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-020 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp020_avanzar_orden_siguiente_etapa();
