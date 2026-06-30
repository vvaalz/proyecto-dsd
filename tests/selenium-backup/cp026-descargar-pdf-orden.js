const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp026_descargar_pdf_orden() {
  console.log('🔄 Ejecutando CP-026: Verificar que se pueda descargar el PDF de una orden desde el menú de tres puntos...');

  const options = new chrome.Options();
  options.addArguments('--disable-notifications');
  options.addArguments('--window-size=1440,1200');
  const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();

  try {
    // Login
    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await driver.findElement(By.id('email')).sendKeys('qadesignsoftcr@gmail.com');
    await driver.findElement(By.id('password')).sendKeys('qa0000');
    await driver.findElement(By.id('loginButton')).click();
    await driver.wait(until.urlContains('dashboard'), 20000);

    // Navegar a Recepción de Vehículo (URL correcta según CLAUDE_CONTEXT.md
    // sección 6; .../public/vehicularQuickReception sin el segmento
    // "vehicularReception/" devuelve 404 en este entorno).
    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/vehicularReception/vehicularQuickReception');
    await driver.wait(until.elementLocated(By.id('repair_order_search')), 20000);
    await driver.sleep(3000);

    // Localizar el menú de "tres puntos" de la primera tarjeta de orden
    const menuButton = await driver.findElement(By.css('.options-menu-button')).catch(() => null);
    if (!menuButton) {
      console.log('❌ CP-026 FAILED: No se encontró el menú de tres puntos en ninguna tarjeta de orden');
      process.exit(1);
    }

    // Un clic nativo de Selenium no abre este menú de forma confiable (el
    // punto de clic puede caer sobre otro elemento superpuesto en la tarjeta);
    // se dispara el evento de clic directamente sobre el botón vía JS.
    await driver.executeScript(`
      document.querySelector('.options-menu-button').dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, view: window })
      );
    `);
    await driver.sleep(800);

    const menuOpened = await driver.executeScript(`
      const dd = document.querySelector('[id^="myDropdownListOrders_"]');
      return dd ? window.getComputedStyle(dd).display !== 'none' : false;
    `);
    if (!menuOpened) {
      console.log('❌ CP-026 FAILED: El menú de tres puntos no se desplegó');
      process.exit(1);
    }

    // La opción de PDF vive dentro de la sección "Documentos" del menú,
    // colapsada por defecto (<details>); hay que expandirla primero.
    const pdfLink = await driver.executeScript(`
      const dd = document.querySelector('[id^="myDropdownListOrders_"]');
      const summary = Array.from(dd.querySelectorAll('summary')).find((s) => /documento/i.test(s.textContent || ''));
      if (summary) summary.click();
      const link = Array.from(dd.querySelectorAll('a')).find((a) => /crear pdf general/i.test(a.textContent || ''));
      return link ? { href: link.getAttribute('href') } : null;
    `);

    if (!pdfLink || !pdfLink.href) {
      console.log('❌ CP-026 FAILED: No se encontró la opción de descargar PDF dentro del menú');
      process.exit(1);
    }

    // Hacer clic real en la opción de descarga (interacción real de UI)
    await driver.executeScript(`
      const dd = document.querySelector('[id^="myDropdownListOrders_"]');
      const link = Array.from(dd.querySelectorAll('a')).find((a) => /crear pdf general/i.test(a.textContent || ''));
      if (link) link.click();
    `);
    await driver.sleep(1500);

    // Verificación determinística de que la descarga se activa sin errores:
    // el enlace responde con un PDF real (no solo que el clic no lanzó
    // excepción), revisando status, content-type y content-disposition.
    const downloadCheck = await driver.executeAsyncScript(`
      const url = arguments[0];
      const callback = arguments[1];
      fetch(url, { credentials: 'same-origin' })
        .then((res) => callback({
          ok: res.ok,
          status: res.status,
          contentType: res.headers.get('content-type'),
          contentDisposition: res.headers.get('content-disposition')
        }))
        .catch((err) => callback({ ok: false, error: err.message }));
    `, pdfLink.href);

    const isPdfDownload = downloadCheck.ok &&
      downloadCheck.status === 200 &&
      /pdf/i.test(downloadCheck.contentType || '') &&
      /attachment/i.test(downloadCheck.contentDisposition || '');

    if (isPdfDownload) {
      console.log('✅ CP-026 PASSED: La descarga del PDF se activó sin errores (' + downloadCheck.contentDisposition + ')');
    } else {
      console.log('❌ CP-026 FAILED: La descarga no respondió como un PDF válido: ' + JSON.stringify(downloadCheck));
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-026 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp026_descargar_pdf_orden();
