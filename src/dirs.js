import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export function crearSandbox() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'asistente-cliente-'))
}

export function dirsDe(config, raiz = process.cwd()) {
  const base = path.resolve(raiz, config.dirDatos)
  const sandbox = crearSandbox()
  const espacioDuenio = path.join(base, 'espacio-duenio')
  const relativo = path.relative(path.resolve(raiz), sandbox)
  if (relativo === '' || (!relativo.startsWith('..') && !path.isAbsolute(relativo))) {
    throw new Error('El sandbox del cliente quedó dentro del proyecto.')
  }
  return {
    raiz: path.resolve(raiz),
    base,
    estado: path.join(base, 'estado.json'),
    ocupado: path.join(base, 'ocupado.json'),
    sandbox,
    espacioDuenio,
    mcpVacio: path.join(sandbox, 'mcp-vacio.json'),
    ajustesCliente: path.join(sandbox, 'ajustes.json'),
    sistemaCliente: path.join(sandbox, 'sistema.txt'),
    sistemaDuenio: path.join(espacioDuenio, 'sistema.txt'),
    sesionWhatsapp: path.join(base, 'sesion-whatsapp'),
    log: path.join(base, 'logs', 'asistente.log'),
    acciones: path.join(base, 'logs', 'acciones.log'),
    propuestas: path.join(base, 'propuestas'),
    mcpVacioDuenio: path.join(espacioDuenio, 'mcp-vacio.json'),
  }
}
