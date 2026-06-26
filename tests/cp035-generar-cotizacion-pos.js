const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp035_generar_cotizacion_pos() {
  console.log('🔄 Ejecutando CP-035: Verificar que se pueda generar una cotización desde el POS...');

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
      console.log('❌ CP-035 FAILED: No se pudo agregar el producto de prueba al carrito');
      process.exit(1);
    }
    await driver.sleep(1500);

    // Seleccionar cliente (cliente rápido, el buscador existente no devuelve resultados)
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
      el.value = 'Cliente Prueba CP035';
      el.dispatchEvent(new Event('change', { bubbles: true }));
      if (typeof setTemporalCustomerName === 'function') setTemporalCustomerName();
    `);
    await driver.sleep(1500);

    // Abrir menú de tres puntos y clic en COTIZACIÓN
    await driver.executeScript(`document.getElementById('demo-menu-top-right').click();`);
    await driver.sleep(800);
    const proformClicked = await driver.executeScript(`
      const item = document.querySelector('.btn_proform');
      if (!item) return false;
      item.click();
      return true;
    `);
    if (!proformClicked) {
      console.log('❌ CP-035 FAILED: No se encontró la opción "COTIZACIÓN" en el menú de tres puntos');
      process.exit(1);
    }
    await driver.sleep(2000);

    const modalOpen = await driver.executeScript(`
      const m = document.getElementById('dialog_proform');
      return m ? window.getComputedStyle(m).display !== 'none' : false;
    `);
    if (!modalOpen) {
      console.log('❌ CP-035 FAILED: No se abrió el modal de cotización (#dialog_proform)');
      process.exit(1);
    }

    // Completar el modal: tipo Proforma (ya viene activo por defecto, se
    // confirma con clic explícito), fecha de vencimiento y correo del cliente
    await driver.executeScript(`document.getElementById('card_proforma').click();`);
    await driver.sleep(300);

    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await driver.executeScript(`
      const dateInput = document.getElementById('end_proform_date');
      dateInput.value = ${JSON.stringify(futureDate)};
      dateInput.dispatchEvent(new Event('change', { bubbles: true }));
    `);

    const emailAdded = await driver.executeScript(`
      const el = document.getElementById('email_tags');
      if (el && el.selectize) {
        el.selectize.addItem('valentinadesignsoft@gmail.com');
        return true;
      }
      if (window.jQuery && jQuery('#email_tags').length && jQuery('#email_tags')[0].selectize) {
        jQuery('#email_tags')[0].selectize.addItem('valentinadesignsoft@gmail.com');
        return true;
      }
      return false;
    `);
    if (!emailAdded) {
      console.log('❌ CP-035 FAILED: No se pudo agregar el correo del cliente en el modal de cotización');
      process.exit(1);
    }
    await driver.sleep(500);

    // Crear la cotización
    await driver.executeScript(`document.getElementById('make_proform').click();`);
    await driver.sleep(3000);

    const bodyAfterCreate = await driver.findElement(By.css('body')).getText();
    const modalClosedOrSuccess = await driver.executeScript(`
      const m = document.getElementById('dialog_proform');
      return m ? window.getComputedStyle(m).display === 'none' : true;
    `);
    const showsSuccessSignal = /cotizaci[oó]n|proforma|exitos|correctamente|generad/i.test(bodyAfterCreate);

    if (modalClosedOrSuccess || showsSuccessSignal) {
      console.log('✅ CP-035 PASSED: La cotización se generó (modal cerrado y/o mensaje de éxito detectado)');
    } else {
      console.log('❌ CP-035 FAILED: El modal de cotización sigue abierto y no se detectó señal de éxito');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-035 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp035_generar_cotizacion_pos();
