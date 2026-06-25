const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function createDriver() {
  const options = new chrome.Options();
  options.addArguments('--disable-notifications');
  options.addArguments('--window-size=1440,1200');
  return new Builder().forBrowser('chrome').setChromeOptions(options).build();
}

async function login(driver) {
  await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
  await driver.findElement(By.id('email')).sendKeys('qadesignsoftcr@gmail.com');
  await driver.findElement(By.id('password')).sendKeys('qa0000');
  await driver.findElement(By.id('loginButton')).click();
  await driver.wait(until.urlContains('dashboard'), 20000);
}

async function openReceptionModule(driver) {
  await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/vehicularReception/vehicularQuickReception');
  await driver.wait(until.elementLocated(By.css('body')), 20000);
  await driver.sleep(3000);
}

async function openWorkOrderBoard(driver) {
  await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/vehicularReception/workOrderBoard');
  await driver.wait(until.elementLocated(By.id('repair_order_search')), 20000);
  await driver.sleep(2000);
}

module.exports = { createDriver, login, openReceptionModule, openWorkOrderBoard };
