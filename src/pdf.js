import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function escaparPdf(texto) {
  return String(texto || '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

export function pdfBasico({ titulo = 'Propuesta', cuerpo = '' } = {}) {
  const lineas = []
  const ancho = 86
  for (const cruda of String(cuerpo || titulo).replace(/\r\n/g, '\n').split('\n')) {
    const linea = cruda.replace(/\t/g, '  ')
    if (!linea) {
      lineas.push('')
      continue
    }
    let resto = linea
    while (resto.length > ancho) {
      let corte = resto.lastIndexOf(' ', ancho)
      if (corte < 40) corte = ancho
      lineas.push(resto.slice(0, corte))
      resto = resto.slice(corte).trimStart()
    }
    lineas.push(resto)
  }
  const usable = lineas.slice(0, 48)
  const startY = 780
  const cmds = ['BT', '/F1 18 Tf', '50 800 Td', `(${escaparPdf(titulo.slice(0, 80))}) Tj`, '/F1 11 Tf']
  usable.forEach((linea, i) => {
    const y = startY - i * 16
    cmds.push(`1 0 0 1 50 ${y} Tm`, `(${escaparPdf(linea)}) Tj`)
  })
  cmds.push('ET')
  const stream = cmds.join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let cuerpoPdf = '%PDF-1.4\n'
  const offsets = [0]
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.byteLength(cuerpoPdf))
    cuerpoPdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`
  }
  const startxref = Buffer.byteLength(cuerpoPdf)
  cuerpoPdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let i = 1; i <= objects.length; i += 1) {
    cuerpoPdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  cuerpoPdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`
  return Buffer.from(cuerpoPdf)
}

function chromeBin() {
  const candidatos = [
    process.env.CHROME_PATH,
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
  ].filter(Boolean)
  for (const bin of candidatos) {
    if (bin.includes('/') && fs.existsSync(bin)) return bin
    const which = spawnSync('which', [bin], { encoding: 'utf8' })
    if (which.status === 0 && which.stdout.trim()) return which.stdout.trim()
  }
  return ''
}

function weasyBin() {
  const candidatos = [
    'weasyprint',
    '/Library/Frameworks/Python.framework/Versions/3.12/bin/weasyprint',
    '/opt/homebrew/bin/weasyprint',
  ]
  for (const bin of candidatos) {
    if (bin.includes('/') && fs.existsSync(bin)) return bin
    const which = spawnSync('which', [bin], { encoding: 'utf8' })
    if (which.status === 0 && which.stdout.trim()) return which.stdout.trim()
  }
  return ''
}

export function renderizarPropuesta({ html, texto, titulo, destino, htmlPath }) {
  fs.mkdirSync(path.dirname(destino), { recursive: true })
  const tmpHtml = htmlPath || path.join(os.tmpdir(), `propuesta-${Date.now()}.html`)
  fs.writeFileSync(tmpHtml, html, 'utf8')
  const mdPath = destino.replace(/\.pdf$/i, '.md')
  const htmlDestino = destino.replace(/\.pdf$/i, '.html')
  fs.writeFileSync(mdPath, texto, 'utf8')
  fs.copyFileSync(tmpHtml, htmlDestino)

  const weasy = weasyBin()
  if (weasy) {
    const r = spawnSync(weasy, [tmpHtml, destino], { encoding: 'utf8', timeout: 20000 })
    if (r.status === 0 && fs.existsSync(destino) && fs.statSync(destino).size > 8) {
      return { ok: true, ruta: destino, motor: 'weasyprint', html: htmlDestino, md: mdPath }
    }
  }
  const quiereChrome = process.env.PROPUESTA_PDF === 'chrome' || process.env.CHROME_PATH
  const chrome = quiereChrome ? chromeBin() : ''
  if (chrome) {
    const r = spawnSync(chrome, [
      '--headless=old',
      '--disable-gpu',
      '--no-sandbox',
      '--allow-file-access-from-files',
      `--print-to-pdf=${destino}`,
      `file://${tmpHtml}`,
    ], { encoding: 'utf8', timeout: 20000 })
    if ((r.status === 0 || fs.existsSync(destino)) && fs.existsSync(destino) && fs.statSync(destino).size > 8) {
      return { ok: true, ruta: destino, motor: 'chrome', html: htmlDestino, md: mdPath }
    }
  }
  fs.writeFileSync(destino, pdfBasico({ titulo, cuerpo: texto }))
  return { ok: true, ruta: destino, motor: 'basico', html: htmlDestino, md: mdPath }
}
