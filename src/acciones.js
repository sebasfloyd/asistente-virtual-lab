import fs from 'node:fs'
import path from 'node:path'
import { redactar } from './log.js'

export function textoConfirmacion(accion) {
  const pie = `\n\n/si ${accion.id} para hacerlo, /no ${accion.id} para cancelar.`
  if (accion.tipo === 'mail') {
    return `Acción #${accion.id}: mandar un mail\nPara: ${accion.para}\nAsunto: ${accion.asunto}\nTexto:\n${accion.cuerpo}${pie}`
  }
  if (accion.tipo === 'telegram') {
    return `Acción #${accion.id}: mandar un Telegram\nChat: ${accion.destino}\nTexto:\n${accion.texto}${pie}`
  }
  if (accion.tipo === 'whatsapp') {
    return `Acción #${accion.id}: mandar un WhatsApp\nNúmero: ${accion.destino}\nTexto:\n${accion.texto}${pie}`
  }
  if (accion.tipo === 'agenda-crear') {
    return `Acción #${accion.id}: crear un evento\nTítulo: ${accion.titulo}\nCuándo: ${accion.fecha} ${accion.desde}–${accion.hasta}${pie}`
  }
  if (accion.tipo === 'agenda-mover') {
    return `Acción #${accion.id}: mover un evento\nTítulo: ${accion.titulo}\nDe: ${accion.fecha} ${accion.desde}–${accion.hasta}\nA: ${accion.fechaNueva} ${accion.desdeNuevo}–${accion.hastaNuevo}${pie}`
  }
  if (accion.tipo === 'agenda-invitar') {
    const lista = (accion.slots || []).map((s, i) => `${i + 1}. ${s.fecha} ${s.desde}–${s.hasta}`).join('\n')
    const invitado = accion.para ? `\nInvitado: ${accion.para}` : ''
    return `Acción #${accion.id}: crear una reunión con ${accion.quien || 'el invitado'}${invitado}\nHuecos:\n${lista}\n\n/si ${accion.id} 1 elige el primer hueco (o 2 o 3). Hasta el /si no se crea el evento.`
  }
  if (accion.tipo === 'propuesta-mail') {
    const dest = accion.para ? `\nPara: ${accion.para}` : '\nFalta el mail del cliente: /si ' + accion.id + ' ana@correo.com'
    return `Acción #${accion.id}: mandar la propuesta a ${accion.cliente || 'el cliente'}${dest}\nAsunto: ${accion.asunto}\nArchivo: ${accion.adjunto || ''}${pie}`
  }
  if (accion.tipo === 'recordatorio-propuesta') {
    return `Acción #${accion.id}: anotar un recordatorio en 3 días\n${accion.texto}${pie}`
  }
  return `Acción #${accion.id}: ${accion.tipo}${pie}`
}

export function encolarAccion(estado, campos) {
  const accion = { id: estado.proximoAccion, ...campos }
  estado.proximoAccion += 1
  estado.acciones.push(accion)
  return accion
}

export function promptDeAccion(accion) {
  if (accion.tipo === 'mail') {
    return [
      'Ejecutá solo esta acción con el conector de Gmail. No hagas ninguna otra.',
      `Para: ${accion.para}`,
      `Asunto: ${accion.asunto}`,
      'Cuerpo:',
      accion.cuerpo,
    ].join('\n')
  }
  if (accion.tipo === 'propuesta-mail') {
    return [
      'Ejecutá solo esta acción con el conector de Gmail. No hagas ninguna otra.',
      `Para: ${accion.para}`,
      `Asunto: ${accion.asunto}`,
      accion.adjunto ? `Hay un PDF local en: ${accion.adjunto}` : '',
      'Intentá mandar el mail con el PDF adjunto (send_message).',
      'Si esa herramienta no acepta adjuntos, creá un borrador con create_draft y el mismo archivo, y no lo envíes.',
      'Si tampoco podés adjuntar, dejá el mail o el borrador sin archivo y decí claro que el PDF quedó en esa ruta y no se pudo adjuntar.',
      'No inventes otro destinatario. No borres mails.',
      'Cuerpo:',
      accion.cuerpo,
    ].filter(Boolean).join('\n')
  }
  if (accion.tipo === 'agenda-crear') {
    return [
      'Creá solo este evento en Google Calendar. No borres ni cambies ningún otro.',
      `Título: ${accion.titulo}`,
      `Inicio: ${accion.fecha} ${accion.desde}`,
      `Fin: ${accion.fecha} ${accion.hasta}`,
    ].join('\n')
  }
  if (accion.tipo === 'agenda-invitar') {
    return [
      'Creá solo este evento en Google Calendar e invitá al invitado. No borres ni cambies ningún otro.',
      `Título: ${accion.titulo}`,
      `Inicio: ${accion.fecha} ${accion.desde}`,
      `Fin: ${accion.fecha} ${accion.hasta}`,
      accion.para ? `Invitado (guest): ${accion.para}` : 'No hay mail de invitado: creá el evento igual, sin invitados.',
      accion.quien ? `Nombre: ${accion.quien}` : '',
    ].filter(Boolean).join('\n')
  }
  if (accion.tipo === 'agenda-mover') {
    return [
      'Mové solo este evento en Google Calendar. No toques ningún otro.',
      `Título: ${accion.titulo}`,
      `Desde: ${accion.fecha} ${accion.desde}–${accion.hasta}`,
      `Hacia: ${accion.fechaNueva} ${accion.desdeNuevo}–${accion.hastaNuevo}`,
    ].join('\n')
  }
  return ''
}

export function anexarAccion(ruta, registro, secretos = []) {
  if (!ruta) return
  const linea = redactar({ t: new Date().toISOString(), ...registro }, secretos)
  fs.mkdirSync(path.dirname(ruta), { recursive: true })
  fs.appendFileSync(ruta, `${linea}\n`, { mode: 0o600 })
}
