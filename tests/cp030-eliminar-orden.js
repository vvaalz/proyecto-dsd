const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp030_eliminar_orden() {
  console.log('🔄 Ejecutando CP-030: Verificar que "Eliminar orden" haga desaparecer la orden de la lista...');

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

    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/vehicularReception/vehicularQuickReception');
    await driver.wait(until.elementLocated(By.id('repair_order_search')), 20000);
    await driver.sleep(3000);

    // Buscar una tarjeta claramente sintética/de prueba (no una orden real de
    // otra persona) — placas y nombres de cliente que ya se usan como datos
    // de prueba en otros CP de esta misma suite.
    const targetCard = await driver.executeScript(`
      const markerRegex = /cliente prueba tarea|asterisco|pololeo|ertyu|6qqyq/i;
      const cards = Array.from(document.querySelectorAll('.repair-order-list-item'));
      const match = cards.find((c) => markerRegex.test(c.textContent || ''));
      if (!match) return null;
      const btn = match.querySelector('.options-menu-button');
      if (!btn) return null;
      match.setAttribute('data-cp030-target', 'true');
      return { snippet: (match.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 150) };
    `);

    if (!targetCard) {
      console.log('❌ CP-030 FAILED: No se encontró ninguna orden con datos de prueba reconocibles para eliminar');
      process.exit(1);
    }
    console.log('🎯 Orden de prueba localizada:', targetCard.snippet);

    await driver.executeScript(`
      const card = document.querySelector('[data-cp030-target="true"]');
      card.querySelector('.options-menu-button').dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, view: window })
      );
    `);
    await driver.sleep(800);

    const menuOpened = await driver.executeScript(`
      const card = document.querySelector('[data-cp030-target="true"]');
      const dd = card.querySelector('[id^="myDropdownListOrders_"]') || document.querySelector('[id^="myDropdownListOrders_"]');
      return dd ? window.getComputedStyle(dd).display !== 'none' : false;
    `);
    if (!menuOpened) {
      console.log('❌ CP-030 FAILED: El menú de tres puntos no se desplegó para la orden de prueba');
      process.exit(1);
    }

    // "Eliminar orden" vive dentro de "Opciones avanzadas", colapsada por defecto
    const deleteFound = await driver.executeScript(`
      const card = document.querySelector('[data-cp030-target="true"]');
      const dd = card.querySelector('[id^="myDropdownListOrders_"]') || document.querySelector('[id^="myDropdownListOrders_"]');
      const summary = Array.from(dd.querySelectorAll('summary')).find((s) => /opciones avanzadas/i.test(s.textContent || ''));
      if (summary) summary.click();
      const link = Array.from(dd.querySelectorAll('a')).find((a) => /eliminar orden/i.test(a.textContent || ''));
      if (link) link.click();
      return !!link;
    `);

    if (!deleteFound) {
      console.log('❌ CP-030 FAILED: No se encontró la opción "Eliminar orden" dentro de Opciones avanzadas');
      process.exit(1);
    }
    await driver.sleep(1000);

    // Confirmar el diálogo SweetAlert2 que pide confirmar la eliminación
    // (acción permanente e irreversible sobre la orden de prueba localizada).
    // A diferencia de "Desactivar" (botón .confirm), "Eliminar" usa un modal
    // SweetAlert2 con botón .swal2-confirm.vhe-btn-delete y texto "Eliminar".
    const confirmClicked = await driver.executeScript(`
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const btn = Array.from(document.querySelectorAll('button'))
        .filter(isVisible)
        .find((b) => /^eliminar$/i.test((b.textContent || '').trim()));
      if (btn) { btn.click(); return true; }
      return false;
    `);

    if (!confirmClicked) {
      console.log('❌ CP-030 FAILED: No apareció el diálogo de confirmación para eliminar la orden');
      process.exit(1);
    }
    await driver.sleep(2500);

    // Verificar el resultado: la orden ya no aparece en el listado.
    const bodyAfter = await driver.findElement(By.css('body')).getText();
    console.log('\n📄 Estado de la página tras confirmar la eliminación (primeros 1500 caracteres):');
    console.log(bodyAfter.slice(0, 1500));

    const stillVisible = bodyAfter.includes(targetCard.snippet.slice(0, 40));

    if (!stillVisible) {
      console.log('✅ CP-030 PASSED: La orden de prueba desapareció del listado tras confirmar la eliminación');
    } else {
      console.log('❌ CP-030 FAILED: La orden de prueba sigue apareciendo en el listado tras confirmar la eliminación');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-030 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp030_eliminar_orden();
