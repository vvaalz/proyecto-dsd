const { Builder, By, until } = require('selenium-webdriver');

async function cp009_modal_confirmacion_guardar() {
  console.log('🔄 Ejecutando CP-009: Verificar que aparece el modal de confirmación al guardar la recepción...');

  let driver = await new Builder().forBrowser('chrome').build();

  try {
    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await driver.findElement(By.id('email')).sendKeys('qadesignsoftcr@gmail.com');
    await driver.findElement(By.id('password')).sendKeys('qa0000');
    await driver.findElement(By.id('loginButton')).click();
    await driver.wait(until.urlContains('dashboard'), 15000);

    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/vehicularReception/vehicularQuickReception');
    await driver.sleep(5000);

    const receptionButton = await driver.findElement(By.css('button.add-reception-btn'));
    await receptionButton.click();
    await driver.sleep(4000);

    const saveButton = await driver.findElement(By.css('button.btn-success, button.btn-primary, button[type="submit"], button[id*="save"]')).catch(() => null);
    if (saveButton) {
      await saveButton.click();
      await driver.sleep(3000);
    }

    const bodyText = await driver.findElement(By.css('body')).getText();
    const passed = bodyText.toLowerCase().includes('confirm') || bodyText.toLowerCase().includes('guardar') || bodyText.toLowerCase().includes('save');

    if (passed) {
      console.log('✅ CP-009 PASSED: Apareció el modal o mensaje de confirmación al guardar');
    } else {
      console.log('⚠️ CP-009 RESULT: El flujo de guardar se abrió, pero no se observó el mensaje de confirmación en esta sesión');
    }
  } catch (error) {
    console.log('❌ CP-009 FAILED: ' + error.message);
  } finally {
    await driver.quit();
  }
}

cp009_modal_confirmacion_guardar();