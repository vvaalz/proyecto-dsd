const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp033_agregar_producto_carrito() {
  console.log('🔄 Ejecutando CP-033: Verificar que agregar un producto al carrito muestre el precio correcto...');

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
      console.log('❌ CP-033 FAILED: No se encontró la tarjeta de "AAA-Multímetro Automotriz Digital" para agregar al carrito');
      process.exit(1);
    }
    await driver.sleep(2000);

    const cartRowFull = await driver.executeScript(`
      const table = document.getElementById('tb_table_buy_list');
      if (!table) return null;
      const text = (table.textContent || '').replace(/\\s+/g, ' ').trim();
      return text.includes('AAA-Multímetro Automotriz Digital') ? text : null;
    `);
    const cartRow = cartRowFull ? cartRowFull.slice(0, 400) : null;
    const hasCorrectPrice = cartRowFull && /100\.00|100,00|₡\s*100\b/.test(cartRowFull);

    const cartTotal = await driver.executeScript(`
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const totalLabel = Array.from(document.querySelectorAll('*')).filter(isVisible).find((el) => /^TOTAL:$/i.test((el.textContent || '').trim()));
      const next = totalLabel ? totalLabel.nextElementSibling : null;
      return next ? next.textContent.trim() : null;
    `);

    const priceCorrect = hasCorrectPrice && cartTotal === '₡100.00';

    if (priceCorrect) {
      console.log('✅ CP-033 PASSED: El producto aparece en el carrito con el precio correcto (₡100.00). Total: ' + cartTotal);
    } else {
      console.log(`❌ CP-033 FAILED: cartRow=${JSON.stringify(cartRow)}, cartTotal=${cartTotal}`);
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-033 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp033_agregar_producto_carrito();
