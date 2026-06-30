const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp067_comentario_factura_electronica() {
  console.log('🔄 Ejecutando CP-067: Agregar comentario a un producto + Factura Electrónica...');

  const options = new chrome.Options();
  options.addArguments('--disable-notifications');
  options.addArguments('--window-size=1440,1200');
  options.addArguments('--kiosk-printing');
  const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
  const comentarioTexto = 'Comentario de prueba CP-067';

  try {
    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await driver.manage().deleteAllCookies();
    await driver.executeScript('window.localStorage.clear();');
    await driver.executeScript('window.sessionStorage.clear();');
    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await driver.findElement(By.id('email')).sendKeys('qadesignsoftcr@gmail.com');
    await driver.findElement(By.id('password')).sendKeys('qa0000');
    await driver.findElement(By.id('loginButton')).click();
    await driver.wait(until.urlContains('dashboard'), 20000);

    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1');
    await driver.wait(until.elementLocated(By.id('product_search')), 20000);

    await driver.wait(until.elementLocated(By.css('.product_box')), 15000);
    const added = await driver.executeScript(`
      const boxes = Array.from(document.querySelectorAll('.product_box'));
      const target = boxes.find((b) => /aaa-mult[ií]metro automotriz digital/i.test((b.textContent || '').replace(/\\s+/g, ' ')));
      if (!target) return false;
      const clickable = target.querySelector('.product_box_quantity_content') || target;
      clickable.click();
      return true;
    `);
    if (!added) {
      console.log('❌ CP-067 FAILED: No se encontró el producto de prueba');
      process.exit(1);
    }
    await driver.wait(until.elementLocated(By.id('tb_table_buy_list')), 20000);
    await driver.wait(async () => {
      const text = await driver.executeScript(`return document.getElementById('tb_table_buy_list').textContent;`);
      return /aaa-mult[ií]metro/i.test(text);
    }, 10000);

    // Abrir el diálogo de comentario del producto recién agregado
    // (botón "comment" de la fila, add_comment_to_product_item(<uuid>)).
    const opened = await driver.executeScript(`
      const row = Array.from(document.querySelectorAll('#table_buy_list tr.main_row')).find((r) => /aaa-mult[ií]metro/i.test((r.textContent || '').replace(/\\s+/g, ' ')));
      if (!row) return false;
      const btn = row.querySelector('.btn-panel-prod');
      if (!btn) return false;
      btn.click();
      return true;
    `);
    if (!opened) {
      console.log('❌ CP-067 FAILED: No se encontró el botón de comentario en la fila del producto');
      process.exit(1);
    }
    await driver.wait(until.elementLocated(By.id('dialog_product_item_comment')), 10000);
    await driver.sleep(800);

    // El diálogo abre mostrando una lista de comentarios predefinidos
    // (APLICAR); el textarea y "Guardar" quedan ocultos hasta hacer clic en
    // el botón "+" (nuevo comentario).
    await driver.executeScript(`
      const modal = document.getElementById('dialog_product_item_comment');
      const plusBtn = modal.querySelector('.btn._add_plus');
      if (plusBtn) plusBtn.click();
    `);
    await driver.wait(until.elementLocated(By.id('ta_product_item_comment')), 5000);
    await driver.sleep(500);

    await driver.executeScript(`
      const ta = document.getElementById('ta_product_item_comment');
      ta.value = ${JSON.stringify(comentarioTexto)};
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    `);
    const saved = await driver.executeScript(`
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const modal = document.getElementById('dialog_product_item_comment');
      const btn = Array.from(modal.querySelectorAll('button')).filter(isVisible).find((b) => /guardar/i.test(b.textContent || ''));
      if (!btn) return false;
      btn.click();
      return true;
    `);
    if (!saved) {
      console.log('❌ CP-067 FAILED: No se encontró el botón "Guardar" del comentario');
      process.exit(1);
    }
    await driver.sleep(1500);

    // Reabrir el diálogo de comentario para validar que el texto quedó guardado
    await driver.executeScript(`
      const row = Array.from(document.querySelectorAll('#table_buy_list tr.main_row')).find((r) => /aaa-mult[ií]metro/i.test((r.textContent || '').replace(/\\s+/g, ' ')));
      row.querySelector('.btn-panel-prod').click();
    `);
    await driver.wait(until.elementLocated(By.id('dialog_product_item_comment')), 10000);
    await driver.sleep(800);

    const commentPersisted = await driver.executeScript(`
      const ta = document.getElementById('ta_product_item_comment');
      return ta ? ta.value : null;
    `);
    console.log('💬 Comentario recuperado al reabrir el diálogo:', commentPersisted);

    if (commentPersisted !== comentarioTexto) {
      console.log('❌ CP-067 FAILED: El comentario no se reflejó al reabrir el diálogo (esperado: "' + comentarioTexto + '", obtenido: "' + commentPersisted + '")');
      process.exit(1);
    }

    // Cerrar el diálogo de comentario
    await driver.executeScript(`
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0;
      };
      const modal = document.getElementById('dialog_product_item_comment');
      const btn = Array.from(modal.querySelectorAll('button')).filter(isVisible).find((b) => /cerrar/i.test(b.textContent || ''));
      if (btn) btn.click();
    `);
    await driver.sleep(800);

    // Asociar cliente y completar la factura como "Factura Electrónica"
    const customerSelected = await driver.executeScript(`
      try {
        selectCustomerToPos(12735);
        return document.getElementById('customer_select') ? document.getElementById('customer_select').value : null;
      } catch (e) {
        return null;
      }
    `);
    if (customerSelected !== '12735') {
      console.log('❌ CP-067 FAILED: No se pudo asociar el cliente de prueba (id 12735) a la factura');
      process.exit(1);
    }
    await driver.sleep(1200);

    await driver.executeScript(`document.getElementById('btn_cash_pos').click();`);
    await driver.wait(async () => {
      const m = await driver.executeScript(`
        const el = document.getElementById('dialog_payment');
        return el ? window.getComputedStyle(el).display !== 'none' : false;
      `);
      return m;
    }, 10000, 'El modal de pago no se abrió');

    // El select de tipo de documento usa el plugin "chosen" de jQuery; hay
    // que disparar chosen:updated además del evento change nativo (ver
    // CP-068), o el widget visual revierte el valor a Factura Interna.
    await driver.executeScript(`
      const select = document.getElementById('payment_electronic_document_type');
      if (select) {
        select.value = '1';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        if (window.jQuery && jQuery(select).data('chosen')) jQuery(select).trigger('chosen:updated');
      }
    `);
    await driver.sleep(500);
    await driver.executeScript(`
      const cash = document.getElementById('ck_is_payment_cash');
      if (cash && !cash.checked) { cash.checked = true; cash.dispatchEvent(new Event('change', { bubbles: true })); }
      const efectivo = document.getElementById('is_payment_cash');
      if (efectivo && !efectivo.checked) { efectivo.checked = true; efectivo.dispatchEvent(new Event('change', { bubbles: true })); }
    `);
    await driver.sleep(500);
    await driver.executeScript(`document.getElementById('make_payment').click();`);

    let cartEmpty = false;
    for (let i = 0; i < 12 && !cartEmpty; i++) {
      await driver.sleep(1000);
      const state = await driver.executeScript(`
        const isVisible = (el) => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const sweetAlert = Array.from(document.querySelectorAll('.sweet-alert')).filter(isVisible)[0];
        return {
          hasSweetAlert: !!sweetAlert,
          cartHasProduct: /aaa-mult[ií]metro/i.test(document.getElementById('tb_table_buy_list').textContent)
        };
      `);
      if (state.hasSweetAlert) {
        await driver.executeScript(`
          const isVisible = (el) => {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return rect.width > 0 && rect.height > 0;
          };
          const btn = Array.from(document.querySelectorAll('.sweet-alert button.confirm')).filter(isVisible)[0];
          if (btn) btn.click();
        `);
      }
      cartEmpty = !state.cartHasProduct;
    }

    if (cartEmpty) {
      console.log('✅ CP-067 PASSED: El comentario quedó asociado al producto y se completó la Factura Electrónica');
    } else {
      console.log('❌ CP-067 FAILED: La Factura Electrónica no se confirmó (el producto sigue en el carrito)');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-067 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp067_comentario_factura_electronica();
