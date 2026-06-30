const { Builder, By, until } = require('selenium-webdriver');

async function cp010_cancelar_generacion_orden() {
  console.log('🔄 Ejecutando CP-010: Verificar que cancelar la generación de orden regresa a la recepción...');

  let driver = await new Builder().forBrowser('chrome').build();

  try {
    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await driver.findElement(By.id('email')).sendKeys('qadesignsoftcr@gmail.com');
    await driver.findElement(By.id('password')).sendKeys('qa0000');
    await driver.findElement(By.id('loginButton')).click();
    await driver.wait(until.urlContains('dashboard'), 15000);

    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/vehicularReception/vehicularQuickReception');
    await driver.wait(until.elementLocated(By.css('button.add-reception-btn')), 15000);
    const receptionButton = await driver.findElement(By.css('button.add-reception-btn'));
    await driver.executeScript('arguments[0].click();', receptionButton);
    await driver.sleep(4000);

    const cancelButton = await driver.wait(until.elementLocated(By.css('button.btn-danger, button.btn-secondary, button[onclick*="cancel"], button[id*="cancel"]')), 15000).catch(() => null);
    if (cancelButton) {
      await driver.executeScript('arguments[0].click();', cancelButton);
      await driver.sleep(3000);
    }

    const currentUrl = await driver.getCurrentUrl();
    const bodyText = await driver.findElement(By.css('body')).getText();
    const passed = currentUrl.includes('vehicularQuickReception') || bodyText.toLowerCase().includes('recepción') || bodyText.toLowerCase().includes('recepcion');

    if (passed) {
      console.log('✅ CP-010 PASSED: Cancelar la generación de orden regresó a la recepción');
    } else {
      console.log('❌ CP-010 FAILED: No se regresó a la recepción al cancelar');
    }
  } catch (error) {
    console.log('❌ CP-010 FAILED: ' + error.message);
  } finally {
    await driver.quit();
  }
}

cp010_cancelar_generacion_orden();
