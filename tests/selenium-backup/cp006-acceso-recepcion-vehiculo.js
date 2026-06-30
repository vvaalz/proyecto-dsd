const { Builder, By, until } = require('selenium-webdriver');

async function cp006_acceso_recepcion_vehiculo() {
  console.log('🔄 Ejecutando CP-006: Verificar acceso al módulo de Recepción de Vehículo...');

  let driver = await new Builder().forBrowser('chrome').build();

  try {
    // Paso 1: Abrir el sistema y hacer login válido
    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await driver.findElement(By.id('email')).sendKeys('qadesignsoftcr@gmail.com');
    await driver.findElement(By.id('password')).sendKeys('qa0000');
    await driver.findElement(By.id('loginButton')).click();

    // Paso 2: Esperar que cargue el dashboard
    await driver.wait(until.urlContains('dashboard'), 15000);

    // Paso 3: Buscar el módulo de Gestión de Taller / Recepción vehicular
    const moduleLink = await driver.findElement(
      By.xpath("//*[contains(translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚ', 'abcdefghijklmnopqrstuvwxyzáéíóú'), 'recepción vehicular') or contains(translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚ', 'abcdefghijklmnopqrstuvwxyzáéíóú'), 'recepcion vehicular')]")
    );

    // Paso 4: Hacer clic en el módulo
    await moduleLink.click();

    // Paso 5: Esperar que se cargue la vista del módulo
    await driver.wait(async () => {
      const url = await driver.getCurrentUrl();
      const bodyText = await driver.findElement(By.css('body')).getText();
      return url.includes('reception') || url.includes('vehiculo') || url.includes('vehicular') || bodyText.toLowerCase().includes('recepción') || bodyText.toLowerCase().includes('recepcion');
    }, 15000);

    // Paso 6: Verificar acceso
    const currentUrl = await driver.getCurrentUrl();
    const bodyText = await driver.findElement(By.css('body')).getText();
    const isAccessible = currentUrl.includes('reception') || currentUrl.includes('vehiculo') || currentUrl.includes('vehicular') || bodyText.toLowerCase().includes('recepción') || bodyText.toLowerCase().includes('recepcion');

    if (isAccessible) {
      console.log('✅ CP-006 PASSED: Se pudo acceder al módulo de Recepción de Vehículo');
      console.log('   URL actual: ' + currentUrl);
    } else {
      console.log('❌ CP-006 FAILED: No se pudo acceder al módulo de Recepción de Vehículo');
    }
  } catch (error) {
    console.log('❌ CP-006 FAILED: ' + error.message);
  } finally {
    await driver.quit();
  }
}

cp006_acceso_recepcion_vehiculo();
