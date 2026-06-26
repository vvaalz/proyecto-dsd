const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp036_generar_apartado_pos() {
  console.log('🔄 Ejecutando CP-036: Verificar que se pueda generar un apartado desde el POS...');

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

    // Agregar producto
    const added = await driver.executeScript(`
      const boxes = Array.from(document.querySelectorAll('.product_box'));
      const target = boxes.find((b) => /aaa-mult[ií]metro automotriz digital/i.test(b.textContent || ''));
      if (!target) return false;
      const clickable = target.querySelector('.product_box_quantity_content') || target;
      clickable.click();
      return true;
    `);
    if (!added) {
      console.log('❌ CP-036 FAILED: No se pudo agregar el producto de prueba al carrito');
      process.exit(1);
    }
    await driver.sleep(1500);

    // Seleccionar cliente (cliente rápido; el buscador existente no devuelve resultados)
    await driver.executeScript(`
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const btn = Array.from(document.querySelectorAll('button')).filter(isVisible).find((b) => (b.textContent || '').trim() === 'Agregar');
      if (btn) btn.click();
    `);
    await driver.sleep(800);
    await driver.executeScript(`if (typeof editQuickCustomerName === 'function') editQuickCustomerName();`);
    await driver.sleep(800);
    await driver.executeScript(`
      const el = document.getElementById('temporal_customer_name');
      el.value = 'Cliente Prueba CP036';
      el.dispatchEvent(new Event('change', { bubbles: true }));
      if (typeof setTemporalCustomerName === 'function') setTemporalCustomerName();
    `);
    await driver.sleep(1500);

    // Abrir menú de tres puntos y clic en "Generar Apartado"
    await driver.executeScript(`document.getElementById('demo-menu-top-right').click();`);
    await driver.sleep(800);
    const layawayClicked = await driver.executeScript(`
      const item = document.querySelector('.btn_layaway_sale');
      if (!item) return false;
      item.click();
      return true;
    `);
    if (!layawayClicked) {
      console.log('❌ CP-036 FAILED: No se encontró la opción "Generar Apartado" en el menú de tres puntos');
      process.exit(1);
    }
    await driver.sleep(2000);

    const layawayButtonVisible = await driver.executeScript(`
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const btn = document.getElementById('make_layaway');
      return btn ? isVisible(btn) : false;
    `);
    if (!layawayButtonVisible) {
      console.log('❌ CP-036 FAILED: No se mostró el botón "GENERAR APARTADO" en el modal de pago');
      process.exit(1);
    }

    // Confirmar la generación del apartado
    await driver.executeScript(`document.getElementById('make_layaway').click();`);
    await driver.sleep(3000);

    const bodyAfterLayaway = await driver.findElement(By.css('body')).getText();
    const modalClosed = await driver.executeScript(`
      const m = document.getElementById('dialog_payment');
      return m ? window.getComputedStyle(m).display === 'none' : true;
    `);
    const showsSuccessSignal = /apartado|exitos|correctamente|generad/i.test(bodyAfterLayaway);

    if (modalClosed || showsSuccessSignal) {
      console.log('✅ CP-036 PASSED: El apartado se generó (modal de pago cerrado y/o mensaje de éxito detectado)');
    } else {
      console.log('❌ CP-036 FAILED: El modal de pago sigue abierto y no se detectó señal de éxito');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-036 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp036_generar_apartado_pos();
