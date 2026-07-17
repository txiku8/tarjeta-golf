// Robot de hándicap RFEG: lee el hándicap público de la RFEG con un navegador real
// (Puppeteer) y lo guarda en public/handicap.json. Pensado para GitHub Actions.
// Datos públicos (sin contraseña). Configurables por variables de entorno.
import fs from 'node:fs';
import puppeteer from 'puppeteer';

const NOMBRE = process.env.RFEG_NOMBRE || 'KIMETZ';
const AP1 = process.env.RFEG_AP1 || 'ODRIOZOLA';
const AP2 = process.env.RFEG_AP2 || 'ONDARRA';
const LIC = process.env.RFEG_LICENCIA || 'VB26726281';
const OUT = process.env.RFEG_OUT || 'tarjeta-golf-proyecto/tarjeta-golf-proyecto/public/handicap.json';
const URL = 'https://rfegolf.es/PaginasServicios/ServicioHandicap.aspx';

const run = async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 900 });
    await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });

    const type = async (suffix, val) => {
      if (!val) return;
      const sel = `input[id$='${suffix}']`;
      await page.waitForSelector(sel, { timeout: 20000 });
      await page.click(sel, { clickCount: 3 });
      await page.type(sel, val, { delay: 15 });
    };
    // Con la licencia basta y evita homónimos; el nombre queda de respaldo.
    await type('txt_H_Licencia', LIC);
    if (!LIC) { await type('txt_H_Nombre', NOMBRE); await type('txt_H_Apellido1', AP1); await type('txt_H_Apellido2', AP2); }

    const btn = `[id$='BTEnviar']`;
    await page.waitForSelector(btn, { timeout: 20000 });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
      page.click(btn),
    ]);
    await new Promise(r => setTimeout(r, 2000));

    // Busca en las tablas la fila con la licencia (o el nombre) y saca hándicap/estado/fecha.
    const row = await page.evaluate((lic, ap1) => {
      const key = (lic || ap1 || '').toUpperCase();
      for (const tr of document.querySelectorAll('tr')) {
        const cells = [...tr.querySelectorAll('td')].map(c => c.innerText.trim());
        if (cells.length >= 3 && cells.join(' ').toUpperCase().includes(key)) {
          return cells;
        }
      }
      return null;
    }, LIC, AP1);

    if (!row) throw new Error('No se encontró la fila de resultados');
    // Formato esperado: [Nombre, Licencia, Hándicap, Estado, Modificacion]
    const [nombre, licencia, handicap, estado, fecha] = row;
    const data = {
      nombre: nombre || `${NOMBRE} ${AP1} ${AP2}`.trim(),
      licencia: licencia || LIC,
      handicap: (handicap || '').replace('.', ','),
      estado: estado || '',
      fecha: fecha || '',
      updated: new Date().toISOString().slice(0, 10),
    };
    if (!data.handicap) throw new Error('Hándicap vacío');
    // Solo escribe si cambió algo relevante (evita commits diarios inútiles).
    let prev = null;
    try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch {}
    if (prev && prev.handicap === data.handicap && prev.estado === data.estado && prev.fecha === data.fecha) {
      console.log('Sin cambios:', data.handicap);
      return;
    }
    fs.writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n');
    console.log('Actualizado:', JSON.stringify(data));
  } finally {
    await browser.close();
  }
};

run().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
