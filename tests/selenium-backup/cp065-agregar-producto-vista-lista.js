const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp065_agregar_producto_vista_lista() {
  console.log('🔄 Ejecutando CP-065: Verificar que se pueda agregar un producto al carrito en formato lista...');

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
    await driver.wait(until.elementLocated(By.css('.product_box')), 15000);

    const styleListBtn = await driver.findElement(By.id('style_list')).catch(() => null);
    if (!styleListBtn) {
      console.log('❌ CP-065 FAILED: No se encontró el botón de vista lista (style_list)');
      process.exit(1);
    }

    await driver.executeScript(`document.getElementById('style_list').click();`);
    await driver.sleep(1200);

    const added = await driver.executeScript(`
      const boxes = Array.from(document.querySelectorAll('.product_box'));
      const target = boxes.find((b) => /aaa-mult[ií]metro automotriz digital/i.test((b.textContent || '').replace(/\\s+/g, ' ')));
      if (!target) return false;
      const clickable = target.querySelector('.product_box_quantity_content') || target;
      clickable.click();
      return true;
    `);
    if (!added) {
      console.log('❌ CP-065 FAILED: No se encontró el producto de prueba en la vista lista');
      process.exit(1);
    }

    const productInCart = await driver.wait(async () => {
      const text = await driver.executeScript(`return document.getElementById('tb_table_buy_list').textContent;`);
      return /aaa-mult[ií]metro/i.test(text);
    }, 10000).catch(() => false);

    if (productInCart) {
      console.log('✅ CP-065 PASSED: Se agregó el producto al carrito correctamente desde la vista lista');
    } else {
      console.log('❌ CP-065 FAILED: El producto no se reflejó en el carrito tras agregarlo desde la vista lista');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-065 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp065_agregar_producto_vista_lista();
