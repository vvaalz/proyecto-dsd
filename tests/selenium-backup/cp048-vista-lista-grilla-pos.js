const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp048_vista_lista_grilla_pos() {
  console.log('🔄 Ejecutando CP-048: Verificar que los botones de vista lista/grilla cambien la visualización de productos...');

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

    const listBtn = await driver.findElement(By.id('style_list')).catch(() => null);
    const boxBtn = await driver.findElement(By.id('style_box')).catch(() => null);
    if (!listBtn || !boxBtn) {
      console.log('❌ CP-048 FAILED: No se encontraron los botones de vista lista/grilla (style_list / style_box)');
      process.exit(1);
    }

    const dimsBefore = await driver.executeScript(`
      const box = document.querySelector('.product_box');
      const r = box.getBoundingClientRect();
      return { width: Math.round(r.width), height: Math.round(r.height) };
    `);
    console.log('📐 Dimensiones de la tarjeta de producto (vista inicial):', JSON.stringify(dimsBefore));

    await driver.executeScript(`document.getElementById('style_list').click();`);
    await driver.sleep(1200);
    const dimsListView = await driver.executeScript(`
      const box = document.querySelector('.product_box');
      const r = box.getBoundingClientRect();
      return { width: Math.round(r.width), height: Math.round(r.height) };
    `);
    console.log('📐 Dimensiones tras clic en vista lista:', JSON.stringify(dimsListView));

    await driver.executeScript(`document.getElementById('style_box').click();`);
    await driver.sleep(1200);
    const dimsBoxView = await driver.executeScript(`
      const box = document.querySelector('.product_box');
      const r = box.getBoundingClientRect();
      return { width: Math.round(r.width), height: Math.round(r.height) };
    `);
    console.log('📐 Dimensiones tras clic en vista grilla:', JSON.stringify(dimsBoxView));

    const changedToList = dimsListView.width !== dimsBefore.width || dimsListView.height !== dimsBefore.height;
    const changedBackToGrid = dimsBoxView.width !== dimsListView.width || dimsBoxView.height !== dimsListView.height;

    if (changedToList && changedBackToGrid) {
      console.log('✅ CP-048 PASSED: La visualización de productos cambió correctamente entre lista y grilla');
    } else {
      console.log('❌ CP-048 FAILED: La visualización de productos no cambió al alternar entre lista y grilla');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-048 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp048_vista_lista_grilla_pos();
