import fs from 'node:fs/promises'
import path from 'node:path'

export function estadoInicial() {
  return {
    registroAbierto: true,
    duenio: { telegram: null, whatsapp: null, simulador: null },
    pendientes: [],
    historial: {},
    limites: {},
    proximoId: 1,
    proximoAccion: 1,
    modo: null,
    conocidos: { telegram: [], whatsapp: [], simulador: [] },
    acciones: [],
    recordatorios: [],
    proximoRecordatorio: 1,
    tareas: [],
    proximoTarea: 1,
    ultimoResumen: '',
    envioBorrador: null,
  }
}

function sanear(crudo) {
  const base = estadoInicial()
  if (!crudo || typeof crudo !== 'object') return base
  base.registroAbierto = crudo.registroAbierto !== false
  for (const canal of ['telegram', 'whatsapp', 'simulador']) {
    const id = crudo.duenio?.[canal]
    base.duenio[canal] = typeof id === 'string' && id ? id : null
  }
  base.pendientes = Array.isArray(crudo.pendientes) ? crudo.pendientes.filter((p) => p && p.id && p.borrador && p.destino) : []
  base.historial = crudo.historial && typeof crudo.historial === 'object' ? crudo.historial : {}
  base.limites = crudo.limites && typeof crudo.limites === 'object' ? crudo.limites : {}
  base.proximoId = Number.isInteger(crudo.proximoId) && crudo.proximoId > 0 ? crudo.proximoId : 1
  base.modo = crudo.modo === 'auto' || crudo.modo === 'aprobar' ? crudo.modo : null
  base.proximoAccion = Number.isInteger(crudo.proximoAccion) && crudo.proximoAccion > 0 ? crudo.proximoAccion : 1
  for (const canal of ['telegram', 'whatsapp', 'simulador']) {
    const lista = crudo.conocidos?.[canal]
    base.conocidos[canal] = Array.isArray(lista) ? lista.filter((id) => typeof id === 'string' && id).slice(-200) : []
  }
  base.acciones = Array.isArray(crudo.acciones) ? crudo.acciones.filter((a) => a && a.id && a.tipo).slice(-30) : []
  base.recordatorios = Array.isArray(crudo.recordatorios)
    ? crudo.recordatorios.filter((r) => r && r.id && Number.isFinite(r.cuando) && r.texto).slice(-50)
    : []
  base.proximoRecordatorio = Number.isInteger(crudo.proximoRecordatorio) && crudo.proximoRecordatorio > 0 ? crudo.proximoRecordatorio : 1
  base.tareas = Array.isArray(crudo.tareas)
    ? crudo.tareas.filter((t) => t && t.id && Array.isArray(t.dias) && t.hora && t.texto).slice(-50)
    : []
  base.proximoTarea = Number.isInteger(crudo.proximoTarea) && crudo.proximoTarea > 0 ? crudo.proximoTarea : 1
  base.ultimoResumen = /^\d{4}-\d{1,2}-\d{1,2}$/.test(crudo.ultimoResumen || '') ? crudo.ultimoResumen : ''
  const b = crudo.envioBorrador
  if (b && typeof b === 'object' && typeof b.destino === 'string' && b.destino) {
    base.envioBorrador = {
      canal: b.canal === 'telegram' ? 'telegram' : 'whatsapp',
      destino: String(b.destino).replace(/\D/g, '').slice(0, 20),
      nombre: String(b.nombre || '').slice(0, 80),
    }
  } else {
    base.envioBorrador = null
  }
  return base
}

export async function cargarEstado(ruta) {
  try {
    const texto = await fs.readFile(ruta, 'utf8')
    return sanear(JSON.parse(texto))
  } catch (error) {
    if (error.code === 'ENOENT') return estadoInicial()
    const roto = `${ruta}.roto-${Date.now()}`
    await fs.mkdir(path.dirname(ruta), { recursive: true })
    await fs.rename(ruta, roto).catch(() => {})
    return estadoInicial()
  }
}

export async function guardarEstado(ruta, estado) {
  await fs.mkdir(path.dirname(ruta), { recursive: true })
  const tmp = `${ruta}.tmp`
  await fs.writeFile(tmp, JSON.stringify(estado, null, 2), { mode: 0o600 })
  await fs.rename(tmp, ruta)
}
