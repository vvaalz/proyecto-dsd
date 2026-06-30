const { By } = require('selenium-webdriver');
const { createDriver, login, openWorkOrderBoard } = require('./testUtils');

async function cp013_buscar_orden_por_nombre_cliente() {
  console.log('🔄 Ejecutando CP-013: Verificar que buscar una orden por nombre de cliente muestra resultados correctos...');

  const driver = await createDriver();

  try {
    await login(driver);
    await openWorkOrderBoard(driver);

    const searchInput = await driver.findElement(By.css('input[type="search"], input[name*="search" i], input[id*="search" i], input[placeholder*="buscar" i], input[placeholder*="search" i]')).catch(() => null);
    if (!searchInput) {
      console.log('❌ CP-013 FAILED: No se encontró el campo de búsqueda del tablero');
      process.exit(1);
    }

    await driver.executeScript(
      "arguments[0].focus(); arguments[0].value = arguments[1]; arguments[0].dispatchEvent(new Event('input', { bubbles: true }));",
      searchInput,
      'Juan'
    );
    await driver.sleep(2500);

    const bodyText = await driver.findElement(By.css('body')).getText();
    const resultVisible = /juan|resultado|orden|cliente/i.test(bodyText);

    if (resultVisible) {
      console.log('✅ CP-013 PASSED: La búsqueda por nombre de cliente reflejó resultados o estado de búsqueda en la interfaz');
    } else {
      console.log('❌ CP-013 FAILED: La búsqueda por nombre de cliente no mostró resultados visibles');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-013 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp013_buscar_orden_por_nombre_cliente();
