import fs from 'node:fs/promises'
import path from 'node:path'
import { intervalosDesdeEventos } from './huecos.js'

export async function leerOcupado(ruta) {
  try {
    const json = JSON.parse(await fs.readFile(ruta, 'utf8'))
    const lista = Array.isArray(json) ? json : json?.intervalos
    return { hayDatos: true, intervalos: intervalosDesdeEventos(lista) }
  } catch (error) {
    if (error.code === 'ENOENT') return { hayDatos: false, intervalos: [] }
    return { hayDatos: false, intervalos: [] }
  }
}

export async function guardarOcupado(ruta, intervalos) {
  const limpio = intervalosDesdeEventos(intervalos)
  await fs.mkdir(path.dirname(ruta), { recursive: true })
  await fs.writeFile(ruta, JSON.stringify({ intervalos: limpio }, null, 2), { mode: 0o600 })
  return limpio
}
