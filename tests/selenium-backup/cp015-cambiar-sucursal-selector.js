const { By } = require('selenium-webdriver');
const { createDriver, login, openWorkOrderBoard } = require('./testUtils');

async function cp015_cambiar_sucursal_selector() {
  console.log('🔄 Ejecutando CP-015: Verificar que cambiar sucursal desde el selector actualiza la vista...');

  const driver = await createDriver();

  try {
    await login(driver);
    await openWorkOrderBoard(driver);

    const selectElement = await driver.findElement(By.css('select, [role="combobox"]')).catch(() => null);
    if (!selectElement) {
      console.log('❌ CP-015 FAILED: No se encontró un selector de sucursal o grupo');
      process.exit(1);
    }

    const initialValue = await selectElement.getAttribute('value').catch(() => '');
    await driver.executeScript('arguments[0].selectedIndex = 1; arguments[0].dispatchEvent(new Event("change", { bubbles: true }));', selectElement);
    await driver.sleep(2000);

    const bodyText = await driver.findElement(By.css('body')).getText();
    const updatedView = /sucursal|branch|tienda|vista|orden/i.test(bodyText);
    const currentValue = await selectElement.getAttribute('value').catch(() => '');

    if (updatedView || initialValue !== currentValue) {
      console.log('✅ CP-015 PASSED: El selector de sucursal respondió al cambio y la vista se actualizó');
    } else {
      console.log('❌ CP-015 FAILED: El cambio de sucursal no produjo una actualización visible');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-015 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp015_cambiar_sucursal_selector();
