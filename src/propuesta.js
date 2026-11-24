import fs from 'node:fs'
import path from 'node:path'
import { renderizarPropuesta } from './pdf.js'

const PLANTILLA_DEFAULT = `# Propuesta comercial

**Para:** [cliente]
**De:** [negocio]
**Fecha:** [fecha]
**Asunto:** Propuesta — [pedido]

## Qué entendimos

[una o dos oraciones sobre el pedido]

## Qué proponemos

[alcance]

## Inversión

| Ítem | Precio |
| --- | --- |
| [servicio] | [completar] |

## Próximos pasos

1. Revisamos juntos esta propuesta.
`

const SERVICIOS_DEFAULT = `# Servicios y precios

- Sesión de consultoría (1 h): [completar]
`

export function parsearPropuesta(texto) {
  const t = String(texto || '').trim()
  let m = t.match(/^\/propuesta(?:@\w+)?\s+([\s\S]+)$/i)
  const cuerpo = m ? m[1].trim() : t
  if (!cuerpo) return null
  const partes = cuerpo.split(/\s*(?:\/|\|)\s*/)
  if (partes.length >= 2) {
    const cliente = partes[0].trim()
    const pedido = partes.slice(1).join(' / ').trim()
    if (!cliente || !pedido) return null
    return { ...extraerMail(cliente), pedido }
  }
  if (!m) return null
  return { ...extraerMail(cuerpo), pedido: cuerpo }
}

function extraerMail(cliente) {
  const mail = String(cliente).match(/[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/)
  const nombre = String(cliente).replace(/<[^>]+>/, '').replace(mail?.[0] || '', '').trim() || String(cliente).trim()
  return { cliente: nombre, para: mail ? mail[0] : '' }
}

export function leerPlantillas(raiz, { propuestaPath = 'propuesta.md', serviciosPath = 'servicios.md' } = {}) {
  const leer = (rel, fallback) => {
    const ruta = path.isAbsolute(rel) ? rel : path.join(raiz, rel)
    try {
      const texto = fs.readFileSync(ruta, 'utf8')
      return texto.trim() ? texto : fallback
    } catch {
      return fallback
    }
  }
  return {
    plantilla: leer(propuestaPath, PLANTILLA_DEFAULT),
    servicios: leer(serviciosPath, SERVICIOS_DEFAULT),
  }
}

export function preciosDe(servicios) {
  const precios = []
  for (const linea of String(servicios || '').split(/\r?\n/)) {
    const m = linea.match(/^\s*[-*]\s+(.+?):\s*(.+?)\s*$/)
    if (!m) continue
    const valor = m[2].trim()
    if (!valor || /\[completar\]/i.test(valor)) continue
    precios.push({ servicio: m[1].trim(), precio: valor })
  }
  return precios
}

export function noInventarPrecios(texto, servicios) {
  let out = String(texto || '')
  const conocidos = preciosDe(servicios).map((p) => p.precio)
  if (!conocidos.length) {
    out = out.replace(/\$\s?[\d.]{2,}/g, '[completar]')
  }
  if (!out.includes('[completar]') && !preciosDe(servicios).length && /inversi[oó]n|precio/i.test(out)) {
    out += '\n\nInversión: [completar]\n'
  }
  return out.trim()
}

export function htmlDeMarkdown(md, { titulo = 'Propuesta' } = {}) {
  const escapar = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const lineas = String(md || '').split(/\n/)
  const partes = []
  for (const linea of lineas) {
    if (/^\s*\|/.test(linea)) {
      const celdas = linea.split('|').slice(1, -1).map((c) => c.trim())
      if (celdas.every((c) => /^[-:]+$/.test(c))) continue
      partes.push(`<tr>${celdas.map((c) => `<td>${escapar(c)}</td>`).join('')}</tr>`)
      continue
    }
    if (/^#\s+/.test(linea)) partes.push(`<h1>${escapar(linea.replace(/^#\s+/, ''))}</h1>`)
    else if (/^##\s+/.test(linea)) partes.push(`<h2>${escapar(linea.replace(/^##\s+/, ''))}</h2>`)
    else if (/^\s*[-*]\s+/.test(linea)) partes.push(`<li>${escapar(linea.replace(/^\s*[-*]\s+/, ''))}</li>`)
    else if (/^\s*\d+\.\s+/.test(linea)) partes.push(`<li>${escapar(linea.replace(/^\s*\d+\.\s+/, ''))}</li>`)
    else if (!linea.trim()) partes.push('<p></p>')
    else partes.push(`<p>${escapar(linea)}</p>`)
  }
  const cuerpo = partes.join('\n')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapar(titulo)}</title>
<style>
  body{margin:0;background:#fff;color:#0C0C0D;font-family:Geist,Helvetica,Arial,sans-serif;padding:48px 56px;}
  .mark{display:inline-block;width:14px;height:14px;background:#F56300;border-radius:3px;margin-right:8px;vertical-align:middle;}
  .brand{font-weight:600;letter-spacing:-0.03em;margin-bottom:28px;}
  h1{font-size:28px;letter-spacing:-0.04em;margin:0 0 24px;}
  h2{font-size:16px;color:#F56300;letter-spacing:0.08em;text-transform:uppercase;margin:28px 0 10px;}
  p,li,td{font-size:14px;line-height:1.45;}
  table{border-collapse:collapse;width:100%;margin:12px 0;}
  td{border-bottom:1px solid #eee;padding:8px 6px;}
  .foot{margin-top:40px;font-size:12px;color:#666;}
</style></head><body>
<div class="brand"><span class="mark"></span>Propuesta</div>
${cuerpo}
<div class="foot">ruptiveai.com</div>
</body></html>`
}

export function slugPropuesta(cliente, ahora = Date.now()) {
  const dia = new Date(ahora).toISOString().slice(0, 10).replace(/-/g, '')
  const slug = String(cliente || 'cliente')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'cliente'
  return `${dia}-${slug}`
}

export function promptDePropuesta({ plantilla, servicios, cliente, pedido, fecha, negocio = '' }) {
  return [
    'Redactá una propuesta comercial en markdown, en español rioplatense, breve y clara.',
    'Usá la PLANTILLA. Completá [cliente], [pedido], [fecha] y lo demás con lo que esté en SERVICIOS.',
    'NUNCA inventes un precio. Si no está en SERVICIOS, escribí [completar].',
    'No firmes. No uses ¿ ni ¡ de apertura. No digas que sos un bot.',
    `Cliente: ${cliente}`,
    `Pedido: ${pedido}`,
    `Fecha: ${fecha}`,
    negocio ? `Negocio: ${negocio}` : '',
    '--- PLANTILLA ---',
    plantilla,
    '--- SERVICIOS ---',
    servicios,
    '--- FIN ---',
    'Devolvé solo el markdown de la propuesta.',
  ].filter(Boolean).join('\n')
}

export function propuestaDeSimulacion({ plantilla, servicios, cliente, pedido, fecha }) {
  let texto = String(plantilla)
    .replace(/\[cliente\]/gi, cliente)
    .replace(/\[pedido\]/gi, pedido)
    .replace(/\[fecha\]/gi, fecha)
    .replace(/\[negocio\]/gi, 'el negocio')
  const precios = preciosDe(servicios)
  if (!precios.length) texto = texto.replace(/\$\s?[\d.]{2,}/g, '[completar]')
  if (!/\[completar\]/.test(texto) && !precios.length) {
    texto = texto.replace(/\[servicio\]/gi, pedido).replace(/\[precio\]/gi, '[completar]')
  }
  return noInventarPrecios(texto, servicios)
}

export function guardarPropuesta({ dir, cliente, pedido, markdown, ahora = Date.now() }) {
  const slug = slugPropuesta(cliente, ahora)
  const base = path.join(dir, slug)
  fs.mkdirSync(dir, { recursive: true })
  const titulo = `Propuesta para ${cliente}`
  const html = htmlDeMarkdown(markdown, { titulo })
  const render = renderizarPropuesta({
    html,
    texto: markdown,
    titulo,
    destino: `${base}.pdf`,
    htmlPath: `${base}.html`,
  })
  return { slug, markdown, ...render, pedido }
}
