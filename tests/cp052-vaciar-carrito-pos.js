const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp052_vaciar_carrito_pos() {
  console.log('🔄 Ejecutando CP-052: Verificar que vaciar el carrito lo deje vacío...');

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

    const added = await driver.executeScript(`
      const boxes = Array.from(document.querySelectorAll('.product_box'));
      const target = boxes.find((b) => /aaa-mult[ií]metro automotriz digital/i.test(b.textContent || ''));
      if (!target) return false;
      const clickable = target.querySelector('.product_box_quantity_content') || target;
      clickable.click();
      return true;
    `);
    if (!added) {
      console.log('❌ CP-052 FAILED: No se pudo agregar el producto de prueba al carrito');
      process.exit(1);
    }
    await driver.sleep(1500);

    const cartHasItemBefore = await driver.executeScript(`
      const t = document.getElementById('tb_table_buy_list');
      return t ? /aaa-mult[ií]metro automotriz digital/i.test(t.textContent || '') : false;
    `);
    if (!cartHasItemBefore) {
      console.log('❌ CP-052 FAILED: El producto no quedó en el carrito antes de intentar vaciarlo');
      process.exit(1);
    }

    const emptyClicked = await driver.executeScript(`
      const btn = document.getElementById('cancel_sale');
      if (!btn) return false;
      const link = btn.querySelector('a') || btn;
      link.click();
      return true;
    `);
    if (!emptyClicked) {
      console.log('❌ CP-052 FAILED: No se encontró el botón de vaciar carrito (cancel_sale)');
      process.exit(1);
    }
    await driver.sleep(2000);

    // Vaciar carrito pasa por un diálogo de confirmación con botón "Limpiar lista"
    const confirmClicked = await driver.executeScript(`
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const btn = Array.from(document.querySelectorAll('button.confirm')).filter(isVisible)
        .find((b) => /limpiar lista/i.test((b.textContent || '').trim()));
      if (btn) { btn.click(); return true; }
      return false;
    `);
    if (confirmClicked) {
      await driver.sleep(1500);
    }

    const cartEmptyAfter = await driver.executeScript(`
      const t = document.getElementById('tb_table_buy_list');
      const stillHasItem = t ? /aaa-mult[ií]metro automotriz digital/i.test(t.textContent || '') : false;
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const showsEmptyPlaceholder = Array.from(document.querySelectorAll('*')).filter(isVisible)
        .some((el) => /agrega productos para facturar/i.test((el.textContent || '').trim()) && (el.textContent || '').trim().length < 60);
      return { stillHasItem, showsEmptyPlaceholder };
    `);
    console.log('🛒 Estado del carrito tras vaciarlo:', JSON.stringify(cartEmptyAfter));

    if (!cartEmptyAfter.stillHasItem && cartEmptyAfter.showsEmptyPlaceholder) {
      console.log('✅ CP-052 PASSED: El carrito quedó vacío tras hacer clic en vaciar carrito');
    } else {
      console.log('❌ CP-052 FAILED: El carrito no quedó vacío tras intentar vaciarlo');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-052 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp052_vaciar_carrito_pos();
