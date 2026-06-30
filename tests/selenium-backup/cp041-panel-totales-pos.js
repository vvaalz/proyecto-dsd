const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp041_panel_totales_pos() {
  console.log('🔄 Ejecutando CP-041: Verificar que el panel de totales muestre subtotal, IVA, descuento, devolución, utilidad y total...');

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

    // Agregar producto al carrito
    const added = await driver.executeScript(`
      const boxes = Array.from(document.querySelectorAll('.product_box'));
      const target = boxes.find((b) => /aaa-mult[ií]metro automotriz digital/i.test(b.textContent || ''));
      if (!target) return false;
      const clickable = target.querySelector('.product_box_quantity_content') || target;
      clickable.click();
      return true;
    `);
    if (!added) {
      console.log('❌ CP-041 FAILED: No se pudo agregar el producto de prueba al carrito');
      process.exit(1);
    }
    await driver.sleep(1500);

    // Desplegar el panel de totales (flecha inferior derecha)
    const arrowFound = await driver.executeScript(`
      const btn = document.getElementById('show_invoice_advanced_detail');
      if (!btn) return false;
      btn.click();
      return true;
    `);
    if (!arrowFound) {
      console.log('❌ CP-041 FAILED: No se encontró la flecha para desplegar el panel de totales');
      process.exit(1);
    }
    await driver.sleep(1500);

    const panelText = await driver.executeScript(`
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const candidates = Array.from(document.querySelectorAll('.advanced_invoice_detail, [class*="total_div"], [id="total_utility_div_content"]')).filter(isVisible);
      return candidates.map((el) => (el.textContent || '').replace(/\\s+/g, ' ').trim()).join(' | ');
    `);
    console.log('📋 Contenido visible del panel de totales:', panelText);

    const requiredFields = ['Subtotal', 'IVA', 'Descuento', 'Devolución tarifa', 'Total utilidad'];
    const missingFields = requiredFields.filter((label) => !panelText.includes(label));

    const totalVisible = await driver.executeScript(`
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0;
      };
      return Array.from(document.querySelectorAll('*')).filter(isVisible).some((el) => /^TOTAL:$/i.test((el.textContent || '').trim()));
    `);

    if (missingFields.length === 0 && totalVisible) {
      console.log('✅ CP-041 PASSED: El panel de totales muestra subtotal, IVA, descuento, devolución de tarifa, total utilidad y total');
    } else {
      console.log('❌ CP-041 FAILED: Faltan campos en el panel de totales: ' + JSON.stringify(missingFields) + ', totalVisible=' + totalVisible);
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-041 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp041_panel_totales_pos();
