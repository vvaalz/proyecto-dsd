const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp054_tab_taller_pos() {
  console.log('🔄 Ejecutando CP-054: Verificar que el tab (F3) Taller cargue la vista de selección de vehículo...');

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

    const tabBtn = await driver.findElement(By.id('btn_taller_option')).catch(() => null);
    if (!tabBtn) {
      console.log('❌ CP-054 FAILED: No se encontró el tab "(F3) Taller"');
      process.exit(1);
    }

    await driver.executeScript(`document.getElementById('btn_taller_option').click();`);
    await driver.sleep(2500);

    const bodyText = await driver.findElement(By.css('body')).getText();
    const showsVehicle = /placa:/i.test(bodyText) && /marca:/i.test(bodyText);
    const showsStage = /etapa:/i.test(bodyText) || /seleccionar servicios/i.test(bodyText);

    if (showsVehicle && showsStage) {
      console.log('✅ CP-054 PASSED: El tab "(F3) Taller" cargó la vista de selección de vehículo con su etapa/servicios');
    } else {
      console.log('❌ CP-054 FAILED: El tab "(F3) Taller" no mostró la vista esperada (showsVehicle=' + showsVehicle + ', showsStage=' + showsStage + ')');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-054 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp054_tab_taller_pos();
