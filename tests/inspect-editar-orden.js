const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function inspectEditarOrden() {
  console.log('🔍 Inspeccionando: Edición de orden (mecánico asignado y estado) en el Tablero...');

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

    // Navegar al Tablero de Órdenes (Kanban)
    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/vehicularReception/workOrderBoard');
    await driver.wait(until.elementLocated(By.id('repair_order_search')), 20000);

    // El tablero carga las órdenes vía AJAX; esperar (con reintentos) hasta que
    // aparezca una tarjeta real. Cada tarjeta muestra el número de orden en su
    // propio nodo de texto (sin "#") seguido de "Placa:" ... "TOTAL:" en el
    // mismo contenedor, así que localizamos ese contenedor ascendiendo desde
    // el nodo del número en vez de adivinar una clase CSS.
    const findCardScript = `
      function isVisible(el) {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      }
      const all = Array.from(document.querySelectorAll('body *'));
      for (const el of all) {
        if (!isVisible(el)) continue;
        const ownTextNodes = Array.from(el.childNodes)
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent.trim())
          .filter((t) => t.length > 0);
        const hasNumberLeaf = ownTextNodes.some((t) => /^\\d{2,6}$/.test(t));
        if (hasNumberLeaf) {
          let ancestor = el;
          let depth = 0;
          let best = null;
          while (ancestor && depth < 12) {
            const text = ancestor.textContent || '';
            const totalCount = (text.match(/TOTAL/g) || []).length;
            // Subir hasta envolver exactamente una tarjeta (una sola "TOTAL:");
            // si se sigue subiendo después de eso, se entra al contenedor de
            // la columna/lista completa (con muchas tarjetas, muchos "TOTAL:").
            if (text.includes('Placa:') && totalCount === 1) {
              best = ancestor;
            } else if (totalCount > 1) {
              break;
            }
            ancestor = ancestor.parentElement;
            depth++;
          }
          if (best) return best;
        }
      }
      return null;
    `;

    // El backend de este entorno de QA puede tardar bastante en responder;
    // se da más margen (hasta 45s) y se evita repetir el escaneo costoso del
    // DOM mientras el tablero siga mostrando "Cargando órdenes de trabajo...".
    let card = null;
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      const stillLoading = await driver.executeScript(
        "return document.body.innerText.includes('Cargando órdenes de trabajo');"
      );
      if (!stillLoading) {
        card = await driver.executeScript(findCardScript);
        if (card) break;
      }
      await driver.sleep(1500);
    }

    const bodyBefore = await driver.findElement(By.css('body')).getText();
    console.log('BODY_BEFORE_CLICK_BEGIN');
    console.log(bodyBefore.slice(0, 4000));
    console.log('BODY_BEFORE_CLICK_END');

    if (!card) {
      console.log('⚠️ No se encontró ninguna tarjeta de orden en el tablero para abrir su edición (puede que no haya órdenes activas para la compañía/sucursal actual).');
      return;
    }

    const cards = [card];
    console.log('\n🗂️ Tarjeta de orden localizada ascendiendo desde el nodo del número hasta el contenedor con "Placa:"/"TOTAL:".');

    const cardOuterHtml = await driver.executeScript('return arguments[0].outerHTML;', cards[0]);
    console.log('\n🧩 outerHTML COMPLETO de la tarjeta candidata:');
    console.log(String(cardOuterHtml));

    // Listar elementos potencialmente accionables (íconos, botones, enlaces,
    // o cualquier nodo con onclick) DENTRO de la tarjeta, ya que el detalle de
    // la orden puede abrirse desde un ícono específico y no desde la tarjeta completa.
    const innerActionable = await driver.executeScript(`
      const card = arguments[0];
      return Array.from(card.querySelectorAll('button, a, i, [onclick], [role="button"], svg')).map((el) => ({
        tag: el.tagName.toLowerCase(),
        className: (el.className || '').toString(),
        id: el.id || '',
        title: el.getAttribute('title') || '',
        onclick: el.getAttribute('onclick') || '',
        text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 60)
      }));
    `, cards[0]);
    console.log('\n🖱️ Elementos accionables DENTRO de la tarjeta (botón/ícono/enlace/onclick):');
    console.log(JSON.stringify(innerActionable, null, 2));

    const cardClassChain = await driver.executeScript(`
      let el = arguments[0];
      const chain = [];
      while (el && el !== document.body) {
        chain.push((el.tagName || '').toLowerCase() + (el.className ? '.' + el.className.toString().trim().replace(/\\s+/g, '.') : ''));
        el = el.parentElement;
      }
      return chain;
    `, cards[0]);
    console.log('\n🔗 Cadena de ancestros (tag.class) desde la tarjeta hasta <body>:');
    console.log(JSON.stringify(cardClassChain, null, 2));

    // La SPA siempre tiene visible un botón "Editar" del panel de perfil de
    // usuario (ajeno a la orden). Para no confundirlo con un botón de edición
    // de la orden, se compara el conjunto de elementos visibles ANTES y
    // DESPUÉS del clic en la tarjeta, y solo se analiza lo que apareció de nuevo.
    const collectVisibleScript = `
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      return Array.from(document.querySelectorAll('input,button,select,a,textarea,[id],[role="button"]'))
        .filter(isVisible)
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          id: el.id || '',
          className: (el.className || '').toString(),
          type: el.type || '',
          name: el.name || '',
          placeholder: el.placeholder || '',
          value: el.value || '',
          text: (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 100),
          href: el.href || ''
        }))
        .filter((el) => el.id || el.text || el.placeholder || el.name || el.tag === 'input' || el.tag === 'button' || el.tag === 'select');
    `;
    const signature = (el) => `${el.tag}|${el.id}|${el.className}|${el.name}|${el.placeholder}|${el.text}`;

    const elementsBefore = await driver.executeScript(collectVisibleScript);
    const beforeSignatures = new Set(elementsBefore.map(signature));

    await driver.executeScript('arguments[0].scrollIntoView(true);', cards[0]);
    await driver.sleep(500);
    // Usar un clic nativo de Selenium (mousedown/mouseup reales) en vez de
    // arguments[0].click() vía JS: la tarjeta vive dentro de un tablero con
    // drag-and-drop, y varias librerías de ese tipo ignoran los clics
    // sintéticos disparados por script.
    try {
      await cards[0].click();
    } catch (error) {
      console.log('⚠️ Clic nativo falló, se reintenta con clic vía JS: ' + error.message);
      await driver.executeScript('arguments[0].click();', cards[0]);
    }
    await driver.sleep(3000);

    const bodyAfter = await driver.findElement(By.css('body')).getText();
    console.log('BODY_AFTER_CLICK_BEGIN');
    console.log(bodyAfter.slice(0, 4000));
    console.log('BODY_AFTER_CLICK_END');

    const elementsAfter = await driver.executeScript(collectVisibleScript);
    let newElements = elementsAfter.filter((el) => !beforeSignatures.has(signature(el)));
    console.log(`\n🆕 Elementos VISIBLES que aparecieron tras el clic en la tarjeta: ${newElements.length}`);

    // Entre lo nuevo, buscar un botón "Editar" propio del detalle de la orden
    const newEditButtons = newElements.filter((el) => /editar/i.test(el.text));
    console.log('\n✏️ Botones "Editar" entre los elementos nuevos:', JSON.stringify(newEditButtons, null, 2));

    if (newEditButtons.length > 0) {
      const target = newEditButtons[0];
      await driver.executeScript(`
        const candidates = Array.from(document.querySelectorAll('button, a, [role="button"], i, span'));
        const match = candidates.find((el) => (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 80) === ${JSON.stringify(target.text)} && (el.className || '').toString() === ${JSON.stringify(target.className)});
        if (match) match.click();
      `);
      await driver.sleep(2000);

      const elementsAfterEdit = await driver.executeScript(collectVisibleScript);
      const afterClickSignatures = new Set(elementsAfter.map(signature));
      const editOnlyNew = elementsAfterEdit.filter((el) => !afterClickSignatures.has(signature(el)));
      console.log(`\n🆕 Elementos VISIBLES que aparecieron tras hacer clic en "Editar": ${editOnlyNew.length}`);
      newElements = newElements.concat(editOnlyNew);
    }

    if (newElements.length === 0) {
      console.log('\n⚠️ El clic en la tarjeta no reveló elementos nuevos visibles. Puede que el detalle se abra en una vista/URL distinta, o que se necesite otro tipo de interacción (doble clic, ícono específico, etc.).');
    }

    console.log('\n📋 Detalle de elementos nuevos:');
    console.log(JSON.stringify(newElements, null, 2));

    // Filtro dirigido: candidatos a "mecánico" (mecanico/mechanic) y "estado" (estado/status/etapa/stage)
    const mecanicoCandidates = newElements.filter((el) =>
      /mecanic|mechanic/i.test(el.id) || /mecanic|mechanic/i.test(el.name) || /mecanic|mechanic/i.test(el.className) ||
      /mecanic|mechanic/i.test(el.placeholder) || /mecanic|mechanic/i.test(el.text)
    );
    const estadoCandidates = newElements.filter((el) =>
      /estado|status|etapa|stage/i.test(el.id) || /estado|status|etapa|stage/i.test(el.name) || /estado|status|etapa|stage/i.test(el.className) ||
      /estado|status|etapa|stage/i.test(el.placeholder) || /estado|status|etapa|stage/i.test(el.text)
    );

    console.log('\n🔧 Candidatos (entre lo nuevo) para "Mecánico asignado":');
    console.log(JSON.stringify(mecanicoCandidates, null, 2));

    console.log('\n📌 Candidatos (entre lo nuevo) para "Estado de la orden":');
    console.log(JSON.stringify(estadoCandidates, null, 2));

    // Si hay <select> visibles, listar sus opciones
    const selects = await driver.findElements(By.css('select'));
    console.log(`\n🔽 <select> totales en el DOM: ${selects.length}`);
    for (let i = 0; i < selects.length; i++) {
      try {
        const isDisplayed = await selects[i].isDisplayed();
        if (!isDisplayed) continue;
        const id = await selects[i].getAttribute('id');
        const name = await selects[i].getAttribute('name');
        const opts = await selects[i].findElements(By.css('option'));
        const optionTexts = [];
        for (const opt of opts) {
          optionTexts.push(await opt.getText());
        }
        console.log(`  select[${i}] (VISIBLE) id="${id}" name="${name}" options=${JSON.stringify(optionTexts)}`);
      } catch (error) {
        // ignorar selects no disponibles
      }
    }
  } catch (error) {
    console.error('❌ Error durante la inspección: ' + error.message);
  } finally {
    await driver.quit();
  }
}

inspectEditarOrden();
