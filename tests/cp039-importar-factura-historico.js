const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp039_importar_factura_historico() {
  console.log('🔄 Ejecutando CP-039: Verificar que el tab (F5) Importar factura cargue el historial de facturas...');

  const options = new chrome.Options();
  options.addArguments('--disable-notifications');
  options.addArguments('--window-size=1440,1200');
  const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();

  try {
    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await driver.findElement(By.id('email')).sendKeys('qadesignsoftcr@gmail.com');
    await driver.findElement(By.id('password')).sendKeys('qa0000');
    await driver.findElement(By.id('loginButton')).click();
    await driver.wait(until.urlContains('dashboard'), 20000);

    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1');
    await driver.wait(until.elementLocated(By.id('product_search')), 20000);
    await driver.sleep(3000);

    await driver.executeScript(`document.getElementById('btn_import_invoice_option').click();`);
    await driver.sleep(3000);

    // El historial se renderiza como tarjetas (no <table>); se cuentan los
    // encabezados "No. <consecutivo> - ..." que identifican cada factura.
    const importPanelInfo = await driver.executeScript(`
      const bodyText = document.body.innerText;
      const matches = bodyText.match(/No\\.\\s*\\d+\\s*-/g) || [];
      return { invoiceRecordCount: matches.length };
    `);
    console.log('📋 Estado del panel tras hacer clic en (F5) Importar factura:', JSON.stringify(importPanelInfo, null, 2));

    if (importPanelInfo.invoiceRecordCount === 0) {
      const bodyNow = await driver.findElement(By.css('body')).getText();
      console.log('\n📄 body (primeros 2000 caracteres) para diagnóstico:');
      console.log(bodyNow.slice(0, 2000));
    }

    const loadedHistory = importPanelInfo.invoiceRecordCount > 0;

    if (loadedHistory) {
      console.log(`✅ CP-039 PASSED: El historial de facturas cargó con ${importPanelInfo.invoiceRecordCount} registro(s) visibles`);
    } else {
      console.log('❌ CP-039 FAILED: No se encontraron registros visibles en el historial de facturas tras abrir el tab');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-039 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp039_importar_factura_historico();
