const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp029_desactivar_orden() {
  console.log('🔄 Ejecutando CP-029: Verificar que "Desactivar orden" cambie el estado de una orden a inactiva...');

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
      match.setAttribute('data-cp029-target', 'true');
      return { snippet: (match.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 150) };
    `);

    if (!targetCard) {
      console.log('❌ CP-029 FAILED: No se encontró ninguna orden con datos de prueba reconocibles para desactivar');
      process.exit(1);
    }
    console.log('🎯 Orden de prueba localizada:', targetCard.snippet);

    await driver.executeScript(`
      const card = document.querySelector('[data-cp029-target="true"]');
      card.querySelector('.options-menu-button').dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, view: window })
      );
    `);
    await driver.sleep(800);

    const menuOpened = await driver.executeScript(`
      const card = document.querySelector('[data-cp029-target="true"]');
      const dd = card.querySelector('[id^="myDropdownListOrders_"]') || document.querySelector('[id^="myDropdownListOrders_"]');
      return dd ? window.getComputedStyle(dd).display !== 'none' : false;
    `);
    if (!menuOpened) {
      console.log('❌ CP-029 FAILED: El menú de tres puntos no se desplegó para la orden de prueba');
      process.exit(1);
    }

    // "Desactivar orden" vive dentro de "Opciones avanzadas", colapsada por defecto
    const deactivateFound = await driver.executeScript(`
      const card = document.querySelector('[data-cp029-target="true"]');
      const dd = card.querySelector('[id^="myDropdownListOrders_"]') || document.querySelector('[id^="myDropdownListOrders_"]');
      const summary = Array.from(dd.querySelectorAll('summary')).find((s) => /opciones avanzadas/i.test(s.textContent || ''));
      if (summary) summary.click();
      const link = Array.from(dd.querySelectorAll('a')).find((a) => /desactivar orden/i.test(a.textContent || ''));
      if (link) link.click();
      return !!link;
    `);

    if (!deactivateFound) {
      console.log('❌ CP-029 FAILED: No se encontró la opción "Desactivar orden" dentro de Opciones avanzadas');
      process.exit(1);
    }
    await driver.sleep(1000);

    // Confirmar el diálogo de SweetAlert que pide confirmar la desactivación
    const confirmClicked = await driver.executeScript(`
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const btn = Array.from(document.querySelectorAll('button.confirm')).find(isVisible);
      if (btn) { btn.click(); return true; }
      return false;
    `);

    if (!confirmClicked) {
      console.log('❌ CP-029 FAILED: No apareció el diálogo de confirmación para desactivar la orden');
      process.exit(1);
    }
    await driver.sleep(2500);

    // Verificar el resultado: la orden ya no aparece como activa en el listado,
    // o muestra una marca/estado de inactiva.
    const bodyAfter = await driver.findElement(By.css('body')).getText();
    console.log('\n📄 Estado de la página tras confirmar la desactivación (primeros 1500 caracteres):');
    console.log(bodyAfter.slice(0, 1500));

    const stillActiveSnippetVisible = bodyAfter.includes(targetCard.snippet.slice(0, 40));
    const showsInactiveMarker = /inactiv/i.test(bodyAfter);

    if (!stillActiveSnippetVisible || showsInactiveMarker) {
      console.log('✅ CP-029 PASSED: La orden de prueba cambió de estado (ya no aparece activa en el listado, o se marcó como inactiva)');
    } else {
      console.log('❌ CP-029 FAILED: La orden de prueba sigue apareciendo como activa tras confirmar la desactivación');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-029 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp029_desactivar_orden();
