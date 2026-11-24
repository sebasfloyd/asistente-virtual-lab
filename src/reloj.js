import { armarFechaZona, fechaEnZona, interpretarDia } from './huecos.js'

const NOMBRES = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']

function horaValida(hora, minuto) {
  return hora >= 0 && hora <= 23 && minuto >= 0 && minuto <= 59
}

export function parsearRecordar(resto, ahora, zona) {
  const t = String(resto || '').trim()
  const iso = t.match(/^(20\d{2}-\d{2}-\d{2})\s+(\d{1,2})(?::(\d{2}))?\s+([\s\S]+)$/)
  const rel = t.match(/^(.+?)\s+(\d{1,2})(?::(\d{2}))?\s+([\s\S]+)$/)
  const m = iso || rel
  if (!m) return null
  const diaTexto = m[1]
  const hora = Number(m[2])
  const minuto = Number(m[3] || 0)
  const cuerpo = m[4].trim()
  if (!horaValida(hora, minuto) || !cuerpo) return null
  const dia = interpretarDia(diaTexto, ahora, zona)
  if (!dia) return null
  const cuando = armarFechaZona({ ...dia, hora, minuto }, zona).getTime()
  if (!Number.isFinite(cuando)) return null
  if (cuando <= ahora) return { error: 'pasado' }
  return { cuando, texto: cuerpo.slice(0, 500) }
}

export function parsearProgramar(resto) {
  const crudo = String(resto || '').trim()
  const n = crudo.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  let dias = null
  if (/^(todos los dias|todos|cada dia|diario)\b/.test(n)) dias = [0, 1, 2, 3, 4, 5, 6]
  else {
    for (let i = 0; i < NOMBRES.length; i += 1) {
      if (n.startsWith(`${NOMBRES[i]} `)) {
        dias = [i]
        break
      }
    }
  }
  if (!dias) return null
  const horaM = crudo.match(/(\d{1,2})(?::(\d{2}))?/)
  if (!horaM) return null
  const hora = Number(horaM[1])
  const minuto = Number(horaM[2] || 0)
  if (!horaValida(hora, minuto)) return null
  const texto = crudo.slice(horaM.index + horaM[0].length).trim()
  if (!texto) return null
  return {
    dias,
    hora: `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`,
    texto: texto.slice(0, 500),
  }
}

export function textoTareas(tareas) {
  if (!tareas?.length) return 'No hay tareas programadas. Ejemplo: /programar lunes 9:00 resumen del día'
  return tareas.map((tarea) => {
    const cuando = tarea.dias.length === 7 ? 'todos los días' : tarea.dias.map((d) => NOMBRES[d]).join(', ')
    return `${tarea.id}. ${cuando} ${tarea.hora} — ${tarea.texto}`
  }).join('\n')
}

export function textoRecordatorios(lista, zona) {
  const vivos = (lista || []).filter((item) => !item.avisado)
  if (!vivos.length) return ''
  const lineas = vivos.map((item) => {
    const p = fechaEnZona(new Date(item.cuando), zona)
    const dia = `${p.anio}-${String(p.mes).padStart(2, '0')}-${String(p.dia).padStart(2, '0')}`
    const hora = `${String(p.hora).padStart(2, '0')}:${String(p.minuto).padStart(2, '0')}`
    return `${item.id}. ${dia} ${hora} — ${item.texto}`
  })
  return `Recordatorios:\n${lineas.join('\n')}`
}

export function tomarAvisos(estado, ahora, zona) {
  const salidas = []
  const ahoraMs = typeof ahora === 'number' ? ahora : ahora.getTime()
  for (const item of estado.recordatorios || []) {
    if (item.avisado || item.cuando > ahoraMs) continue
    item.avisado = true
    salidas.push({ tipo: 'recordatorio', id: item.id, texto: `Recordatorio: ${item.texto}` })
  }
  const local = fechaEnZona(new Date(ahoraMs), zona)
  const clave = `${local.anio}-${local.mes}-${local.dia}`
  const minutos = local.hora * 60 + local.minuto
  for (const tarea of estado.tareas || []) {
    if (!tarea.dias.includes(local.weekday)) continue
    const [h, m] = String(tarea.hora).split(':').map(Number)
    const objetivo = h * 60 + m
    if (minutos < objetivo || minutos > objetivo + 5) continue
    if (tarea.ultimo === clave) continue
    tarea.ultimo = clave
    salidas.push({ tipo: 'tarea', id: tarea.id, texto: `Tarea programada: ${tarea.texto}` })
  }
  return salidas
}
