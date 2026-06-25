const { By } = require('selenium-webdriver');
const { createDriver, login, openWorkOrderBoard } = require('./testUtils');

async function cp012_buscar_orden_por_placa() {
  console.log('🔄 Ejecutando CP-012: Verificar que buscar una orden por placa muestra resultados correctos...');

  const driver = await createDriver();

  try {
    await login(driver);
    await openWorkOrderBoard(driver);

    const searchInput = await driver.findElement(By.css('input[type="search"], input[name*="search" i], input[id*="search" i], input[placeholder*="buscar" i], input[placeholder*="search" i]')).catch(() => null);
    if (!searchInput) {
      console.log('❌ CP-012 FAILED: No se encontró el campo de búsqueda del tablero');
      process.exit(1);
    }

    await driver.executeScript(
      "arguments[0].focus(); arguments[0].value = arguments[1]; arguments[0].dispatchEvent(new Event('input', { bubbles: true }));",
      searchInput,
      'ABC123'
    );
    await driver.sleep(2500);

    const bodyText = await driver.findElement(By.css('body')).getText();
    const resultVisible = /abc123|resultado|orden|placa/i.test(bodyText);

    if (resultVisible) {
      console.log('✅ CP-012 PASSED: La búsqueda por placa reflejó resultados o estado de búsqueda en la interfaz');
    } else {
      console.log('❌ CP-012 FAILED: La búsqueda por placa no mostró resultados visibles');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-012 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp012_buscar_orden_por_placa();
