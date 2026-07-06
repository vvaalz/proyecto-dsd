const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';
const CLIENTE_ID = 12735; // "valentina cliente prueba" no existe literal en QA (hallazgo conocido, ver CP-034) — se usa el cliente de prueba asociado

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
};
function evaluarCargaPagina(ms, e) { if(ms>8000) console.log('❌ PERFORMANCE FAILED: '+e+' tardó '+ms+'ms'); else if(ms>3000) console.log('⚠️ LENTO: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }
function evaluarAccion(ms, e) { if(ms>4000) console.log('❌ Acción lenta: '+e+' tardó '+ms+'ms'); else if(ms>1500) console.log('⚠️ Acción algo lenta: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }

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
  await page.waitForTimeout(700);
  return added;
}

async function cp124_limpiar_productos_ctrl_x() {
  console.log('🔄 Ejecutando CP-124: Limpiar productos del carrito con Ctrl+X...');
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

    // Moneda en colones (rotando con CP-125 que usará dólares)
    await page.evaluate(() => { document.getElementById('menu_type_currency')?.click(); });
    await page.waitForTimeout(700);
    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const menu = Array.from(document.querySelectorAll('.mdl-menu')).filter(isVis).find(m => /col[oó]n|d[oó]lar/i.test(m.textContent || ''));
      if (menu) { const opt = Array.from(menu.querySelectorAll('li')).find(li => /col[oó]n costarricense/i.test(li.textContent || '')); if (opt) opt.click(); }
    });
    await page.waitForTimeout(700);

    // Asociar cliente de prueba
    const clienteAsociado = await page.evaluate((id) => { try { selectCustomerToPos(id); return document.getElementById('customer_select')?.value; } catch (e) { return null; } }, CLIENTE_ID);
    console.log('👤 Cliente asociado:', clienteAsociado);

    // Agregar 3 productos distintos
    await agregarProducto(page, 'aaa-mult', 'AAA-Multímetro');
    await agregarProducto(page, 'aaa-bombillos', 'AAA-Bombillos');
    await agregarProducto(page, 'aaa-filtros de combustible', 'AAA-Filtros');

    const rowsAntes = await page.evaluate(() => document.getElementById('tb_table_buy_list')?.querySelectorAll('tr.main_row').length || 0);
    console.log('🛒 Filas en carrito antes de Ctrl+X:', rowsAntes);
    if (rowsAntes < 2) { await screenshotOnFail(page, 'cp124-fail-productos'); throw new Error('No se agregaron suficientes productos al carrito (' + rowsAntes + ' filas)'); }

    // ── Ejecutar Ctrl+X ──
    const tCtrlX = Date.now();
    await page.evaluate(() => document.body.focus());
    await page.keyboard.press('Control+x');
    await page.waitForTimeout(1500);

    // Confirmar diálogo "Limpiar lista" si aparece (mismo patrón que cancel_sale en CP-052)
    const confirmClicked = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = Array.from(document.querySelectorAll('button.confirm')).filter(isVis).find(b => /limpiar lista|continuar|s[ií]/i.test((b.textContent||'').trim()));
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (confirmClicked) console.log('🔔 Confirmación de "Limpiar lista" aceptada');
    await page.waitForTimeout(1500);
    evaluarAccion(Date.now() - tCtrlX, 'Ctrl+X (limpiar carrito)');

    // ── VALIDACIONES ──
    const estadoFinal = await page.evaluate(() => {
      const t = document.getElementById('tb_table_buy_list');
      const rows = t ? t.querySelectorAll('tr.main_row').length : -1;
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const showsEmptyPlaceholder = Array.from(document.querySelectorAll('*')).filter(isVis).some(el => /agrega productos para facturar/i.test((el.textContent||'').trim()) && (el.textContent||'').trim().length < 60);
      return { rows, showsEmptyPlaceholder };
    });
    console.log('🛒 Estado del carrito después de Ctrl+X:', JSON.stringify(estadoFinal));

    const v1 = rowsAntes >= 2;
    const v2 = estadoFinal.rows === 0;
    const v3 = estadoFinal.showsEmptyPlaceholder;

    console.log('\n📊 === VALIDACIONES CP-124 ===');
    console.log('  ≥2 productos agregados antes:      ' + (v1 ? '✅' : '❌') + ' (' + rowsAntes + ' filas)');
    console.log('  Carrito con 0 filas tras Ctrl+X:    ' + (v2 ? '✅' : '❌') + ' (' + estadoFinal.rows + ' filas)');
    console.log('  Placeholder de carrito vacío visible:' + (v3 ? '✅' : '❌'));

    if (!v1) throw new Error('No se agregaron suficientes productos antes de la prueba');
    if (!v2) throw new Error('El carrito no quedó completamente vacío tras Ctrl+X (' + estadoFinal.rows + ' filas restantes)');
    if (!v3) throw new Error('No se mostró el placeholder de carrito vacío tras Ctrl+X');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-124 PASSED | productos antes: ' + rowsAntes + ' filas | carrito después: 0 filas | validaciones: 3/3 | tiempo: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp124-fail');
    console.log('❌ CP-124 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp124_limpiar_productos_ctrl_x();
