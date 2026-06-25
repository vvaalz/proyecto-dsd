const { Builder, By, until } = require('selenium-webdriver');

(async () => {
  let driver = await new Builder().forBrowser('chrome').build();
  try {
    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await driver.findElement(By.id('email')).sendKeys('qadesignsoftcr@gmail.com');
    await driver.findElement(By.id('password')).sendKeys('qa0000');
    await driver.findElement(By.id('loginButton')).click();
    await driver.wait(until.urlContains('dashboard'), 20000);

    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/vehicularReception/workOrderBoard');
    await driver.sleep(8000);

    const ids = ['repair_order_search','kanban-new-section-name','kanban-config-menu-btn','kanban-color-picker','kanban-new-section-save-btn','kanban-new-section-cancel-btn'];
    for (const id of ids) {
      try {
        const el = await driver.findElement(By.id(id));
        const tag = await el.getTagName();
        const text = await el.getText();
        const value = await el.getAttribute('value');
        const cls = await el.getAttribute('class');
        const placeholder = await el.getAttribute('placeholder');
        console.log(id, { tag, text, value, cls, placeholder });
      } catch (e) {
        console.log('NOT_FOUND', id, e.message);
      }
    }

    const configBtn = await driver.findElement(By.id('kanban-config-menu-btn')).catch(() => null);
    if (configBtn) {
      await configBtn.click();
      await driver.sleep(3000);
      const bodyText = await driver.findElement(By.css('body')).getText();
      console.log('AFTER_CLICK_BODY:\n' + bodyText.slice(0, 6000));
    }

    const buttons = await driver.findElements(By.css('button'));
    console.log('BUTTONS_COUNT', buttons.length);
    for (const button of buttons.slice(0, 20)) {
      try {
        const text = await button.getText();
        const title = await button.getAttribute('title');
        const id = await button.getAttribute('id');
        if (text || title || id) {
          console.log('BUTTON', { text, title, id });
        }
      } catch (error) {
        // ignore
      }
    }
  } catch (e) {
    console.error(e);
  } finally {
    await driver.quit();
  }
})();
