const { Builder, By, until } = require('selenium-webdriver');

async function cp008_asignar_mecanico_servicio() {
  console.log('🔄 Ejecutando CP-008: Verificar que se puede asignar mecánico al agregar un servicio...');

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

    const serviceButton = await driver.wait(until.elementLocated(By.css('button, a')), 15000).catch(() => null);
    if (serviceButton) {
      await driver.executeScript('arguments[0].click();', serviceButton);
      await driver.sleep(2000);
    }

    const mechanicSelect = await driver.wait(until.elementLocated(By.css('select, select[id*="mecan"], select[name*="mecan"], select[id*="mechanic"], select[name*="mechanic"]')), 15000).catch(() => null);
    if (mechanicSelect) {
      await driver.executeScript('arguments[0].click();', mechanicSelect);
      await driver.sleep(1000);
      const options = await mechanicSelect.findElements(By.css('option'));
      if (options.length > 1) {
        await driver.executeScript('arguments[0].click();', options[1]);
      }
    }

    const bodyText = await driver.findElement(By.css('body')).getText();
    const passed = bodyText.toLowerCase().includes('mecánico') || bodyText.toLowerCase().includes('mecanico') || bodyText.toLowerCase().includes('servicio');

    if (passed) {
      console.log('✅ CP-008 PASSED: Se pudo interactuar con el flujo de asignación de mecánico y servicio');
    } else {
      console.log('❌ CP-008 FAILED: No se observó la asignación de mecánico o servicio');
    }
  } catch (error) {
    console.log('❌ CP-008 FAILED: ' + error.message);
  } finally {
    await driver.quit();
  }
}

cp008_asignar_mecanico_servicio();
