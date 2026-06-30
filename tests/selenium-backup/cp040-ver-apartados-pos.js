const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp040_ver_apartados_pos() {
  console.log('🔄 Ejecutando CP-040: Verificar que el tab (F7) Apartados cargue la lista de apartados...');

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

    await driver.executeScript(`document.getElementById('btn_layaway_option').click();`);
    await driver.sleep(3000);

    const layawayPanelInfo = await driver.executeScript(`
      const bodyText = document.body.innerText;
      const matches = bodyText.match(/Apartado No:?\\s*\\d+/gi) || [];
      return { layawayRecordCount: matches.length };
    `);
    console.log('📦 Estado del panel tras hacer clic en (F7) Apartados:', JSON.stringify(layawayPanelInfo, null, 2));

    if (layawayPanelInfo.layawayRecordCount === 0) {
      const bodyNow = await driver.findElement(By.css('body')).getText();
      console.log('\n📄 body (primeros 2000 caracteres) para diagnóstico:');
      console.log(bodyNow.slice(0, 2000));
    }

    const loadedLayaways = layawayPanelInfo.layawayRecordCount > 0;

    if (loadedLayaways) {
      console.log(`✅ CP-040 PASSED: La lista de apartados cargó con ${layawayPanelInfo.layawayRecordCount} registro(s) visibles`);
    } else {
      console.log('❌ CP-040 FAILED: No se encontraron registros visibles en la lista de apartados tras abrir el tab');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-040 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp040_ver_apartados_pos();
