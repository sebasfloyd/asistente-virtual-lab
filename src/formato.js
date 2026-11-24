// El modelo escribe en Markdown. Telegram y WhatsApp no lo muestran igual,
// así que cada canal recibe su versión: nada de **asteriscos** ni "---" sueltos.

const REGLA = /^\s*(?:[-*_]\s*){3,}$/
const SEPARADOR_TABLA = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/
const FILA_TABLA = /^\s*\|.*\|\s*$/
const TITULO = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/

// Saca lo que en un chat se ve como basura: reglas horizontales, separadores de tablas,
// y convierte filas de tabla en líneas legibles.
export function normalizarMarkdown(texto) {
  const lineas = String(texto || '').replace(/\r\n/g, '\n').split('\n')
  const out = []
  for (const linea of lineas) {
    if (REGLA.test(linea) || SEPARADOR_TABLA.test(linea)) continue
    if (FILA_TABLA.test(linea)) {
      const celdas = linea.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()).filter(Boolean)
      if (celdas.length) out.push(`- ${celdas.join(': ')}`)
      continue
    }
    out.push(linea)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function escaparHtml(texto) {
  return String(texto || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Markdown simple → HTML de Telegram (parse_mode HTML). Solo negrita, código, títulos y links.
export function aTelegramHtml(texto) {
  const base = normalizarMarkdown(texto)
  return base.split('\n').map((linea) => {
    const titulo = linea.match(TITULO)
    let l = escaparHtml(titulo ? titulo[1] : linea)
    l = l.replace(/\*\*([^*\n]+?)\*\*/g, '<b>$1</b>')
    l = l.replace(/__([^_\n]+?)__/g, '<b>$1</b>')
    l = l.replace(/`([^`\n]+?)`/g, '<code>$1</code>')
    l = l.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => `<a href="${u.replace(/"/g, '%22')}">${t}</a>`)
    if (titulo) l = `<b>${l.replace(/<\/?b>/g, '')}</b>`
    return l
  }).join('\n')
}

// Markdown → texto plano (para cuando Telegram rechaza el HTML, o para logs).
export function aPlano(texto) {
  return normalizarMarkdown(texto).split('\n').map((linea) => {
    const titulo = linea.match(TITULO)
    let l = titulo ? titulo[1] : linea
    l = l.replace(/\*\*([^*\n]+?)\*\*/g, '$1').replace(/__([^_\n]+?)__/g, '$1').replace(/`([^`\n]+?)`/g, '$1')
    l = l.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)')
    return l
  }).join('\n')
}

// Markdown → formato de WhatsApp (*negrita*).
export function aWhatsapp(texto) {
  return normalizarMarkdown(texto).split('\n').map((linea) => {
    const titulo = linea.match(TITULO)
    let l = titulo ? titulo[1] : linea
    l = l.replace(/\*\*([^*\n]+?)\*\*/g, '*$1*').replace(/__([^_\n]+?)__/g, '*$1*')
    l = l.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)')
    if (titulo) l = `*${l.replace(/^\*|\*$/g, '')}*`
    return l
  }).join('\n')
}

// Un documento (propuesta, lista larga, tabla) no se parte en 40 burbujas.
export function esDocumento(texto) {
  const t = String(texto || '')
  if (t.length > 1200) return true
  const lineas = t.split('\n')
  if (lineas.some((l) => TITULO.test(l) || FILA_TABLA.test(l))) return true
  return lineas.filter((l) => /^\s*(?:[-*•]|\d+[.)])\s+\S/.test(l)).length >= 6
}

// Parte un texto largo por párrafos, sin cortar oraciones, en trozos de hasta `max`.
export function partirPorParrafos(texto, max = 3500) {
  const parrafos = String(texto || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  const out = []
  let actual = ''
  const empujar = () => { if (actual.trim()) out.push(actual.trim()); actual = '' }
  for (const p of parrafos) {
    if (p.length > max) {
      empujar()
      let resto = p
      while (resto.length > max) {
        let corte = resto.lastIndexOf('\n', max)
        if (corte < max * 0.5) corte = resto.lastIndexOf('. ', max) + 1
        if (corte < max * 0.5) corte = max
        out.push(resto.slice(0, corte).trim())
        resto = resto.slice(corte).trim()
      }
      actual = resto
      continue
    }
    if ((actual ? actual.length + 2 : 0) + p.length > max) empujar()
    actual = actual ? `${actual}\n\n${p}` : p
  }
  empujar()
  return out
}
