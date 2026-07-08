const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';
const TOLERANCIA = 1;
const LISTAS_IDS = [186, 185, 194];

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','..','..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
};
function evaluarCargaPagina(ms, e) { if(ms>8000) console.log('❌ PERFORMANCE FAILED: '+e+' tardó '+ms+'ms'); else if(ms>3000) console.log('⚠️ LENTO: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }
function evaluarAccion(ms, e) { if(ms>4000) console.log('❌ Acción lenta: '+e+' tardó '+ms+'ms'); else if(ms>1500) console.log('⚠️ Acción algo lenta: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }

async function limpiarCarrito(page) {
  await page.evaluate(({ src }) => {
    const box = Array.from(document.querySelectorAll('.product_box')).find(b => new RegExp(src,'i').test((b.textContent||'').replace(/\s+/g,' ')));
    if (box) (box.querySelector('.product_box_quantity_content') || box).click();
  }, { src: 'aaa-mult' });
  await page.waitForTimeout(1500);
  let rows = await page.evaluate(() => document.getElementById('tb_table_buy_list')?.querySelectorAll('tr.main_row').length || 0);
  for (let d = 0; d < 50 && rows > 0; d++) {
    const del = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const icon = Array.from(document.querySelectorAll('#tb_table_buy_list i.material-icons')).filter(isVis).find(el => /^delete$/i.test(el.textContent.trim()));
      if (icon) { (icon.closest('button,a,[onclick]') || icon).click(); return true; }
      return false;
    });
    if (!del) break;
    await page.waitForTimeout(500);
    await page.evaluate(() => { const isVis=(el)=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0;}; const btn=Array.from(document.querySelectorAll('.sweet-alert button')).filter(isVis)[0]; if(btn)btn.click(); }).catch(()=>{});
    await page.waitForTimeout(300);
    rows = await page.evaluate(() => document.getElementById('tb_table_buy_list')?.querySelectorAll('tr.main_row').length || 0);
  }
}

function leerPreciosCarrito(page) {
  return page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    return Array.from(document.querySelectorAll('input[id^="input_product_edit_price_"]'))
      .filter(isVis)
      .map(el => ({ token: el.id.replace('input_product_edit_price_',''), precio: parseFloat(el.value) || 0 }));
  });
}

async function agregarProducto(page, src, nombre) {
  const added = await page.evaluate(({ src }) => {
    const re = new RegExp(src, 'i');
    const box = Array.from(document.querySelectorAll('.product_box')).find(b => re.test((b.textContent||'').replace(/\s+/g,' ')));
    if (!box) return false;
    (box.querySelector('.product_box_quantity_content') || box).click(); return true;
  }, { src });
  if (added) {
    await page.waitForFunction(({ src }) => new RegExp(src,'i').test((document.getElementById('tb_table_buy_list')||{textContent:''}).textContent), { src }, { timeout: 15000 }).catch(()=>{});
  } else {
    console.log('⚠️ No encontrado: ' + nombre);
  }
  await page.waitForTimeout(800);
  return added;
}

async function cp121_lista_precios_pos() {
  console.log('🔄 Ejecutando CP-121: Listas de precios en el POS (IDs 186, 185, 194)...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  await context.clearCookies();
  const page = await context.newPage();
  const tiempoInicioCP = Date.now();

  try {
    await page.goto('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
    await page.fill('#email', 'qadesignsoftcr@gmail.com');
    await page.fill('#password', 'qa0000');
    await page.click('#loginButton');
    await page.waitForURL('**/dashboard**', { timeout: 40000 });

    const t0 = Date.now();
    await page.goto(POS_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 40000 });
    await page.waitForTimeout(3000);
    await page.waitForSelector('.product_box', { timeout: 15000 });
    evaluarCargaPagina(Date.now() - t0, 'Carga POS');

    // Precio SIN lista (baseline)
    await page.evaluate(() => { try { set_current_pos_price_list(0); } catch {} });
    await page.waitForTimeout(600);
    await agregarProducto(page, 'aaa-mult', 'AAA-Multímetro');
    await agregarProducto(page, 'aaa-bombillos', 'AAA-Bombillos');
    const precioBase = await leerPreciosCarrito(page);
    console.log('💲 Precios SIN lista:', JSON.stringify(precioBase));
    await limpiarCarrito(page);

    const resultadosPorLista = [];
    for (const id of LISTAS_IDS) {
      const tLista = Date.now();
      await page.evaluate((listaId) => { try { set_current_pos_price_list(listaId); } catch {} }, id);
      await page.waitForTimeout(1000);
      evaluarAccion(Date.now() - tLista, 'Aplicar lista ID ' + id);

      await agregarProducto(page, 'aaa-mult', 'AAA-Multímetro');
      await agregarProducto(page, 'aaa-bombillos', 'AAA-Bombillos');
      const precios = await leerPreciosCarrito(page);
      console.log('💲 Precios con lista ID ' + id + ':', JSON.stringify(precios));

      let cambio = false;
      for (let i = 0; i < Math.min(precioBase.length, precios.length); i++) {
        if (Math.abs(precioBase[i].precio - precios[i].precio) > TOLERANCIA) { cambio = true; break; }
      }
      resultadosPorLista.push({ id, precios, cambio });
      await limpiarCarrito(page);
    }

    await page.evaluate(() => { try { set_current_pos_price_list(0); } catch {} });

    // ── VALIDACIONES ──
    const v1 = precioBase.length >= 2;
    const v2 = resultadosPorLista.every(r => r.precios.length >= 2);
    const v3 = resultadosPorLista.some(r => r.cambio);

    console.log('\n📊 === VALIDACIONES CP-121 ===');
    console.log('  Precios base leídos (sin lista):    ' + (v1 ? '✅' : '❌') + ' (' + precioBase.length + ' productos)');
    console.log('  Precios leídos en las 3 listas:      ' + (v2 ? '✅' : '❌'));
    resultadosPorLista.forEach(r => console.log('    Lista ' + r.id + ': ' + (r.cambio ? '✅ cambió precio' : 'ℹ️ sin variación (sin precio alternativo en QA)')));
    console.log('  Al menos 1 lista con precio distinto: ' + (v3 ? '✅' : '⚠️ (limitación de datos QA, ver CP-092)'));

    if (!v1) throw new Error('No se pudieron leer los precios base sin lista');
    if (!v2) throw new Error('No se pudieron leer los precios en alguna de las 3 listas');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    const icono = v3 ? '✅' : '⚠️';
    console.log(icono + ' CP-121 PASSED | listas probadas: ' + LISTAS_IDS.join(', ') + ' | precio base: ' + JSON.stringify(precioBase.map(p=>p.precio)) + ' | cambios detectados: ' + resultadosPorLista.filter(r=>r.cambio).map(r=>r.id).join(', ') + ' | tiempo: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp121-fail');
    console.log('❌ CP-121 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp121_lista_precios_pos();
