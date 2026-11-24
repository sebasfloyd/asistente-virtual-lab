import fs from 'node:fs'
import path from 'node:path'

const TOKEN_TELEGRAM = /\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g

export function redactar(valor, secretos = []) {
  let texto = typeof valor === 'string' ? valor : JSON.stringify(valor)
  for (const secreto of secretos) {
    if (typeof secreto === 'string' && secreto.length >= 6) texto = texto.split(secreto).join('[secreto]')
  }
  return texto.replace(TOKEN_TELEGRAM, '[secreto]')
}

export function crearLog({ ruta, secretos = [], consola = console }) {
  return {
    info(evento, campos = {}) {
      const linea = redactar(JSON.stringify({ t: new Date().toISOString(), evento, ...campos }), secretos)
      try {
        fs.mkdirSync(path.dirname(ruta), { recursive: true })
        fs.appendFileSync(ruta, `${linea}\n`, { mode: 0o600 })
      } catch {
        consola.error('No pude escribir el log local.')
      }
      return linea
    },
    error(evento, campos = {}) {
      const linea = this.info(evento, campos)
      consola.error(linea)
      return linea
    },
  }
}
