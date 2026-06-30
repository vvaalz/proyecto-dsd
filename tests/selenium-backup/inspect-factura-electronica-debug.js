const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function run() {
  console.log('🔍 Debug: qué bloquea la Factura Electrónica con cliente 12735...');
  const options = new chrome.Options();
  options.addArguments('--disable-notifications');
  options.addArguments('--window-size=1440,1200');
  options.addArguments('--kiosk-printing');
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

    await driver.executeScript(`
      const boxes = Array.from(document.querySelectorAll('.product_box'));
      const target = boxes.find((b) => /aaa-mult[ií]metro automotriz digital/i.test((b.textContent||'').replace(/\s+/g,' ')));
      const clickable = target.querySelector('.product_box_quantity_content') || target;
      clickable.click();
    `);
    await driver.sleep(2000);

    await driver.executeScript(`selectCustomerToPos(12735);`);
    await driver.sleep(1200);

    await driver.executeScript(`document.getElementById('btn_cash_pos').click();`);
    await driver.sleep(1500);

    const docTypeInfo = await driver.executeScript(`
      const select = document.getElementById('payment_electronic_document_type');
      select.value = '1';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      const cash = document.getElementById('ck_is_payment_cash');
      if (cash && !cash.checked) { cash.checked = true; cash.dispatchEvent(new Event('change', { bubbles: true })); }
      const efectivo = document.getElementById('is_payment_cash');
      if (efectivo && !efectivo.checked) { efectivo.checked = true; efectivo.dispatchEvent(new Event('change', { bubbles: true })); }
      return {
        email: document.getElementById('email_customer') ? document.getElementById('email_customer').value : null,
        idType: document.getElementById('identification_type_customer') ? document.getElementById('identification_type_customer').value : null,
        idNum: document.getElementById('identification_customer') ? document.getElementById('identification_customer').value : null,
        name: document.getElementById('name_customer') ? document.getElementById('name_customer').value : null
      };
    `);
    console.log('Datos del cliente en el modal de pago:', JSON.stringify(docTypeInfo));

    await driver.executeScript(`document.getElementById('make_payment').click();`);

    for (let i = 0; i < 8; i++) {
      await driver.sleep(1000);
      const snap = await driver.executeScript(`
        const isVisible = (el) => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const alert = Array.from(document.querySelectorAll('.sweet-alert')).filter(isVisible)[0];
        return alert ? { title: alert.querySelector('h2') ? alert.querySelector('h2').textContent : null, text: (alert.textContent||'').replace(/\s+/g,' ').trim().substring(0,300) } : null;
      `);
      console.log('t+'+(i+1)+'s sweet-alert:', JSON.stringify(snap));
      if (snap) {
        // no la cerramos todavía, solo reportamos en la primera aparición y luego salimos
        break;
      }
    }
  } catch (error) {
    console.log('Error:', error.message);
  } finally {
    await driver.quit();
  }
}
run();
