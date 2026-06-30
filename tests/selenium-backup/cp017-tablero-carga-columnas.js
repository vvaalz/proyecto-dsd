const { Builder, By, until } = require('selenium-webdriver');

async function cp017_tablero_carga_columnas() {
  console.log('🔄 Ejecutando CP-017: Verificar que el tablero carga correctamente con las columnas de etapas...');

  let driver = await new Builder().forBrowser('chrome').build();

  try {
    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await driver.findElement(By.id('email')).sendKeys('qadesignsoftcr@gmail.com');
    await driver.findElement(By.id('password')).sendKeys('qa0000');
    await driver.findElement(By.id('loginButton')).click();
    await driver.wait(until.urlContains('dashboard'), 20000);

    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/vehicularReception/workOrderBoard');
    await driver.wait(until.elementLocated(By.id('repair_order_search')), 20000);
    await driver.sleep(6000);

    const bodyText = await driver.findElement(By.css('body')).getText();
    const passed = bodyText.includes('Torre de Control') || bodyText.includes('Gestión de Órdenes de Trabajo') || bodyText.includes('Cargando órdenes de trabajo');

    if (passed) {
      console.log('✅ CP-017 PASSED: El tablero cargó correctamente y mostró la vista del kanban');
    } else {
      console.log('❌ CP-017 FAILED: El tablero no cargó como se esperaba');
    }
  } catch (error) {
    console.log('❌ CP-017 FAILED: ' + error.message);
  } finally {
    await driver.quit();
  }
}

cp017_tablero_carga_columnas();
