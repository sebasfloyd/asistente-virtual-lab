import fs from 'node:fs'

export const ESTILO_DEFAULT = `# Estilo de escritura

- Voseo rioplatense, informal y cálido.
- Mensajes cortos, una idea por mensaje.
- No uses signos de apertura ¿ ni ¡.
- No firmes ni cierres con Saludos, Un abrazo ni el nombre.
- No digas que sos un bot o un sistema, salvo que el dueño te lo pida acá.
- Si no sabés, no inventes: dejame consultarlo y te aviso.
`

const FIRMA_LINEA = /^(?:[-–—]\s*.+|saludos(?:\s*,?\s+[\p{L}. ]+)?|un\s+abrazo(?:s)?|abrazos|atentamente|cordialmente|cordiales\s+saludos|qued[oa]\s+a\s+disposici[oó]n(?:\s+de\s+usted(?:es)?)?|cualquier\s+consulta(?:\s+no\s+dude(?:s|n)?)?)\s*[,.!]?\s*$/iu
const CIERRE_FINAL = /(?:\n\s*)(?:[-–—]\s*.+|saludos(?:\s*,?\s+[\p{L}. ]+)?|un\s+abrazo(?:s)?|atentamente|qued[oa]\s+a\s+disposici[oó]n[^\n]*)\s*$/iu
const APERTURA_FORMAL = /^\s*(?:estimado\/a|estimad[oa]s?|estimad[oa]|distinguido\/a|distinguido[s]?)\s+[^,\n]*,?\s*/iu
const ABREV = /(?:sr|sra|srta|dr|dra|lic|ing|etc|vs|ej|p\.ej|hs|min|tel|pag|pág|nro|núm|num|av|avda)\.$/i
const ITEM_LISTA = /^(?:[-*•]|(\d+[\.)]))\s+\S/

export function leerEstilo(ruta) {
  try {
    const texto = fs.readFileSync(ruta, 'utf8')
    return texto.trim() ? texto : ESTILO_DEFAULT
  } catch {
    return ESTILO_DEFAULT
  }
}

export function sacarAperturas(texto) {
  return String(texto || '').replace(/[¿¡]/g, '')
}

function escapar(valor) {
  return String(valor).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function sacarFirma(texto, nombre = '') {
  let out = String(texto || '').replace(/\s+$/g, '')
  const lineas = out.split(/\n/)
  while (lineas.length > 1 && FIRMA_LINEA.test(lineas.at(-1).trim())) lineas.pop()
  out = lineas.join('\n')
  out = out.replace(CIERRE_FINAL, '')
  const limpio = String(nombre || '').trim()
  if (limpio) {
    const reNombre = new RegExp(`(?:\\n\\s*)?(?:[-–—]\\s*)?${escapar(limpio)}\\s*$`, 'u')
    out = out.replace(reNombre, '')
    const reSaludo = new RegExp(`\\n\\s*saludos,?\\s*${escapar(limpio)}\\s*[,.]?\\s*$`, 'iu')
    out = out.replace(reSaludo, '')
  }
  out = out.replace(APERTURA_FORMAL, '')
  out = out.replace(/\s*[-–—]\s*[\p{L}][\p{L}0-9. ]{0,39}\s*$/u, '')
  return out.replace(/[ \t]+\n/g, '\n').trim()
}

export function limpiarEstilo(texto, { nombre = '' } = {}) {
  return sacarAperturas(sacarFirma(texto, nombre)).replace(/[ \t]+\n/g, '\n').trim()
}

function esItemLista(linea) {
  return ITEM_LISTA.test(String(linea || '').trim())
}

function partirOraciones(bloque) {
  const texto = String(bloque || '').trim()
  if (!texto) return []
  const partes = []
  let inicio = 0
  for (let i = 0; i < texto.length; i += 1) {
    if (!/[.!?…]/.test(texto[i])) continue
    const resto = texto.slice(i + 1)
    if (resto && !/^\s/.test(resto)) continue
    const recorte = texto.slice(inicio, i + 1).trim()
    if (ABREV.test(recorte)) continue
    partes.push(recorte)
    inicio = i + 1
    while (inicio < texto.length && /\s/.test(texto[inicio])) inicio += 1
    i = inicio - 1
  }
  if (inicio < texto.length && texto.slice(inicio).trim()) partes.push(texto.slice(inicio).trim())
  return partes.filter(Boolean)
}

function partirBloque(bloque) {
  const lineas = String(bloque || '').split(/\n/)
  const items = []
  const prosa = []
  let hayLista = false
  for (const linea of lineas) {
    if (esItemLista(linea)) {
      hayLista = true
      if (prosa.length) {
        items.push(...partirOraciones(prosa.join('\n')))
        prosa.length = 0
      }
      items.push(linea.trim())
    } else if (hayLista && /^\s+\S/.test(linea)) {
      items[items.length - 1] += '\n' + linea.trim()
    } else {
      hayLista = hayLista && !linea.trim()
      prosa.push(linea)
    }
  }
  if (prosa.length) items.push(...partirOraciones(prosa.join('\n')))
  return items.filter(Boolean)
}

export function partirMensajes(texto) {
  const limpio = String(texto || '').replace(/\r\n/g, '\n').trim()
  if (!limpio) return []
  const bloques = limpio.split(/\n{2,}/)
  const partes = []
  for (const bloque of bloques) partes.push(...partirBloque(bloque))
  return partes.map((p) => p.trim()).filter(Boolean)
}

export function partesParaEnviar(texto, { partir = true, nombre = '' } = {}) {
  const limpio = limpiarEstilo(texto, { nombre })
  if (!limpio) return []
  if (!partir) return [limpio]
  const partes = partirMensajes(limpio)
  return partes.length ? partes : [limpio]
}

export function pausaPorLargo(texto, { baseMs = 700, porCaracterMs = 18, minMs = 400, maxMs = 2800 } = {}) {
  const n = String(texto || '').length
  const ms = Number(baseMs) + n * Number(porCaracterMs)
  const min = Number.isFinite(Number(minMs)) ? Number(minMs) : 0
  const max = Number.isFinite(Number(maxMs)) ? Number(maxMs) : ms
  return Math.min(max, Math.max(min, Math.round(ms)))
}
