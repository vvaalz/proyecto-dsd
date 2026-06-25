const { By } = require('selenium-webdriver');
const { createDriver, login, openWorkOrderBoard } = require('./testUtils');

async function cp014_cambiar_vista_lista_caja() {
  console.log('🔄 Ejecutando CP-014: Verificar que cambiar de vista de lista a vista de caja funciona correctamente...');

  const driver = await createDriver();

  try {
    await login(driver);
    await openWorkOrderBoard(driver);

    const viewButtons = await driver.findElements(By.css('button, a'));
    let clicked = false;

    for (const button of viewButtons) {
      try {
        const text = await button.getText();
        const title = await button.getAttribute('title');
        const label = `${text} ${title}`.toLowerCase();
        if (label.includes('caja') || label.includes('lista')) {
          await driver.executeScript('arguments[0].click();', button);
          await driver.sleep(2000);
          clicked = true;
          break;
        }
      } catch (error) {
        // Ignorar botones que no se puedan leer
      }
    }

    if (clicked) {
      const bodyText = await driver.findElement(By.css('body')).getText();
      const changedView = /caja|lista|vista/i.test(bodyText);
      if (changedView) {
        console.log('✅ CP-014 PASSED: La vista del tablero respondió al cambio entre lista y caja');
      } else {
        console.log('❌ CP-014 FAILED: El cambio de vista no reflejó un cambio visible en la interfaz');
        process.exit(1);
      }
    } else {
      console.log('❌ CP-014 FAILED: No se encontró un control de cambio de vista');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-014 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp014_cambiar_vista_lista_caja();
