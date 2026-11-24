// Leer y escribir .env sin mostrar secretos.
import fs from 'node:fs'

export const FORMATO_TOKEN = /^\d{6,12}:[A-Za-z0-9_-]{30,}$/

export function tokenValido(token) {
  return FORMATO_TOKEN.test(String(token || '').trim())
}

// Cambia o agrega claves en el texto de un .env, sin tocar comentarios ni el resto.
export function actualizarEnv(texto, cambios) {
  const lineas = String(texto || '').replace(/\r\n/g, '\n').split('\n')
  const pendientes = new Map(Object.entries(cambios))
  const out = lineas.map((linea) => {
    const m = linea.match(/^\s*#?\s*([A-Z0-9_]+)\s*=/)
    if (!m || !pendientes.has(m[1])) return linea
    const comentada = /^\s*#/.test(linea)
    // Una línea comentada de ejemplo se reemplaza solo si no hay una activa más abajo.
    if (comentada && lineas.some((l) => new RegExp(`^\\s*${m[1]}\\s*=`).test(l))) return linea
    const valor = pendientes.get(m[1])
    pendientes.delete(m[1])
    return `${m[1]}=${valor}`
  })
  for (const [clave, valor] of pendientes) out.push(`${clave}=${valor}`)
  return out.join('\n').replace(/\n*$/, '\n')
}

export function leerEnv(texto) {
  const out = {}
  for (const linea of String(texto || '').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=(.*)$/)
    if (m) out[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2')
  }
  return out
}

export function escribirEnv(ruta, texto) {
  fs.writeFileSync(ruta, texto, { mode: 0o600 })
  try { fs.chmodSync(ruta, 0o600) } catch {}
}
