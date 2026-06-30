const { By } = require('selenium-webdriver');
const { createDriver, login, openReceptionModule } = require('./testUtils');

async function cp011_whatsapp_modal_orden() {
  console.log('🔄 Ejecutando CP-011: Verificar que el modal de WhatsApp aparece tras generar la orden...');

  const driver = await createDriver();

  try {
    await login(driver);
    await openReceptionModule(driver);

    const addReceptionButton = await driver.findElement(By.css('button.add-reception-btn, button.btn-success, button.btn-primary')).catch(() => null);
    if (addReceptionButton) {
      await driver.executeScript('arguments[0].click();', addReceptionButton);
      await driver.sleep(4000);
    }

    const saveButton = await driver.findElement(By.css('button.btn-success, button.btn-primary, button[type="submit"], button[id*="save"]')).catch(() => null);
    if (saveButton) {
      await driver.executeScript('arguments[0].click();', saveButton);
      await driver.sleep(4000);
    }

    const bodyText = await driver.findElement(By.css('body')).getText();
    const modalVisible = /whatsapp|whats app|wa\.|wa /i.test(bodyText);

    const interactiveElements = await driver.findElements(By.css('button, a, div, span'));
    let whatsappControlFound = false;
    for (const element of interactiveElements.slice(0, 60)) {
      try {
        const text = await element.getText();
        const title = await element.getAttribute('title');
        const label = `${text} ${title}`.toLowerCase();
        if (label.includes('whatsapp') || label.includes('whats app')) {
          whatsappControlFound = true;
          break;
        }
      } catch (error) {
        // Ignorar elementos no accesibles
      }
    }

    if (modalVisible || whatsappControlFound) {
      console.log('✅ CP-011 PASSED: El modal o mensaje de WhatsApp quedó visible tras generar la orden');
    } else {
      console.log('❌ CP-011 FAILED: No se detectó el modal de WhatsApp tras la generación de la orden');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-011 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp011_whatsapp_modal_orden();
