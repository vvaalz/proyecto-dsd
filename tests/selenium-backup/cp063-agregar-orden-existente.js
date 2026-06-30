const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp063_agregar_orden_existente() {
  console.log('🔄 Ejecutando CP-063: Agregar productos a una orden existente (Taller) y luego facturar...');

  const options = new chrome.Options();
  options.addArguments('--disable-notifications');
  options.addArguments('--window-size=1440,1200');
  options.addArguments('--kiosk-printing');
  const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();

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
    await driver.sleep(2000);

    // (F3) Taller: tomar la primera orden de reparación disponible y cargar
    // sus servicios al carrito invocando directamente add_repair_order_to_table(),
    // la misma función que dispara la tarjeta "pos-order-card" al hacer clic.
    await driver.executeScript(`document.getElementById('btn_taller_option').click();`);
    await driver.sleep(2500);

    const onclickAttr = await driver.executeScript(`
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const card = Array.from(document.querySelectorAll('.pos-order-card')).filter(isVisible)[0];
      return card ? card.getAttribute('onclick') : null;
    `);
    if (!onclickAttr) {
      console.log('❌ CP-063 FAILED: No se encontró ninguna orden existente en el tab (F3) Taller');
      process.exit(1);
    }
    console.log('📋 Orden seleccionada:', onclickAttr);

    await driver.executeScript(onclickAttr);
    await driver.sleep(2000);

    // Volver a (F1) POS Facturación para ver el carrito con los servicios de la orden
    await driver.executeScript(`document.getElementById('btn_pos_option').click();`);
    await driver.wait(until.elementLocated(By.id('product_search')), 15000);
    await driver.sleep(1500);

    const rowsFromOrder = await driver.executeScript(`return document.querySelectorAll('#table_buy_list tr.main_row').length;`);
    if (!(rowsFromOrder > 0)) {
      console.log('❌ CP-063 FAILED: La orden existente no agregó servicios/productos al carrito');
      process.exit(1);
    }
    console.log('🧾 Filas en el carrito provenientes de la orden:', rowsFromOrder);

    // Agregar un producto adicional a la orden ya cargada
    await driver.wait(until.elementLocated(By.css('.product_box')), 15000);
    const added = await driver.executeScript(`
      const boxes = Array.from(document.querySelectorAll('.product_box'));
      const target = boxes.find((b) => /aaa-mult[ií]metro automotriz digital/i.test(b.textContent || ''));
      if (!target) return false;
      const clickable = target.querySelector('.product_box_quantity_content') || target;
      clickable.click();
      return true;
    `);
    if (!added) {
      console.log('❌ CP-063 FAILED: No se pudo agregar el producto adicional a la orden');
      process.exit(1);
    }
    await driver.sleep(1500);

    const productAddedToCart = await driver.wait(async () => {
      const text = await driver.executeScript(`return document.getElementById('tb_table_buy_list').textContent;`);
      return /aaa-mult[ií]metro/i.test(text);
    }, 8000).catch(() => false);
    if (!productAddedToCart) {
      console.log('❌ CP-063 FAILED: El producto adicional no se reflejó en el carrito de la orden');
      process.exit(1);
    }
    console.log('🧾 Producto adicional agregado correctamente al carrito de la orden');

    // La orden de Taller ya trae asociado el cliente propietario del
    // vehículo; solo se fuerza el cliente de prueba (12735) si la orden no
    // dejó ninguno seleccionado.
    const existingCustomer = await driver.executeScript(`
      const el = document.getElementById('customer_select');
      return el ? el.value : null;
    `);
    console.log('👤 Cliente ya asociado por la orden:', existingCustomer);

    let customerOk = existingCustomer && existingCustomer !== '0' && existingCustomer !== '';
    if (!customerOk) {
      const customerSelected = await driver.executeScript(`
        try {
          selectCustomerToPos(12735);
          return document.getElementById('customer_select') ? document.getElementById('customer_select').value : null;
        } catch (e) {
          return null;
        }
      `);
      customerOk = customerSelected === '12735';
    }
    if (!customerOk) {
      console.log('❌ CP-063 FAILED: No se pudo asociar ningún cliente (ni el de la orden ni el de prueba) a la factura');
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

    await driver.executeScript(`
      const cash = document.getElementById('ck_is_payment_cash');
      if (cash && !cash.checked) { cash.checked = true; cash.dispatchEvent(new Event('change', { bubbles: true })); }
      const efectivo = document.getElementById('is_payment_cash');
      if (efectivo && !efectivo.checked) { efectivo.checked = true; efectivo.dispatchEvent(new Event('change', { bubbles: true })); }
    `);
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
          rows: document.querySelectorAll('#table_buy_list tr.main_row').length
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
      cartEmpty = state.rows === 0;
    }

    if (cartEmpty) {
      console.log('✅ CP-063 PASSED: Se agregaron productos a la orden existente y se completó la factura');
    } else {
      console.log('❌ CP-063 FAILED: La factura de la orden con productos agregados no se confirmó');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-063 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp063_agregar_orden_existente();
