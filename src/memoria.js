import fs from 'node:fs'
import path from 'node:path'

const ENCABEZADO = '# Memoria'

function unaLinea(texto) {
  return String(texto || '').replace(/\s+/g, ' ').trim().slice(0, 500)
}

export function leerMemoria(ruta) {
  try {
    return fs.readFileSync(ruta, 'utf8')
  } catch {
    return ''
  }
}

export function escribirMemoria(ruta, texto) {
  fs.mkdirSync(path.dirname(ruta), { recursive: true })
  const cuerpo = String(texto || '')
  fs.writeFileSync(ruta, cuerpo.endsWith('\n') ? cuerpo : `${cuerpo}\n`, { mode: 0o600 })
}

export function entradasDe(md) {
  const out = []
  for (const parte of String(md || '').split(/\n(?=## \d+\n)/)) {
    const m = parte.match(/## (\d+)\n([\s\S]*)/)
    if (!m) continue
    const campos = { id: Number(m[1]) }
    for (const linea of m[2].split('\n')) {
      const c = linea.match(/^([a-z]+): (.*)$/)
      if (c) campos[c[1]] = c[2]
    }
    if (campos.tipo) out.push(campos)
  }
  return out
}

function render(entradas) {
  const cuerpo = entradas.map((entrada, i) => {
    const lineas = Object.entries(entrada)
      .filter(([clave]) => clave !== 'id')
      .map(([clave, valor]) => `${clave}: ${valor}`)
    return `## ${i + 1}\n${lineas.join('\n')}`
  }).join('\n\n')
  return cuerpo ? `${ENCABEZADO}\n\n${cuerpo}\n` : `${ENCABEZADO}\n`
}

export function aprender(md, texto, fecha) {
  const limpio = unaLinea(texto)
  if (!limpio) return { md, ok: false }
  const entradas = entradasDe(md)
  entradas.push({ tipo: 'regla', fecha, texto: limpio })
  return { md: render(entradas), ok: true }
}

export function olvidar(md, id) {
  const antes = entradasDe(md)
  const queda = antes.filter((entrada) => entrada.id !== id)
  return { md: render(queda), ok: queda.length !== antes.length }
}

export function anotarEjemplo(md, { pregunta, borrador, correccion, fecha }) {
  const entradas = entradasDe(md)
  entradas.push({
    tipo: 'ejemplo',
    fecha,
    pregunta: unaLinea(pregunta),
    borrador: unaLinea(borrador),
    correccion: unaLinea(correccion),
  })
  return render(entradas)
}

export function listarMemoria(md) {
  const entradas = entradasDe(md)
  if (!entradas.length) return 'La memoria está vacía. Enseñame con /aprender y un texto.'
  return entradas.map((entrada) => {
    if (entrada.tipo === 'ejemplo') {
      return `${entrada.id}. [${entrada.fecha}] ejemplo: "${entrada.pregunta}" → "${entrada.correccion}"`
    }
    return `${entrada.id}. [${entrada.fecha}] ${entrada.texto}`
  }).join('\n')
}
