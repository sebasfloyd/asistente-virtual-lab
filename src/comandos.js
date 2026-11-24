export function parsearComando(texto) {
  const t = String(texto || '').trim()
  let m
  if (/^\/start(?:@\w+)?\s*$/i.test(t)) return { tipo: 'start' }
  if ((m = t.match(/^\/soyelduenio(?:@\w+)?\s+(\S+)\s*$/i))) return { tipo: 'registrar', codigo: m[1] }
  if ((m = t.match(/^\/aprobar(?:@\w+)?\s+(\d+)\s*$/i))) return { tipo: 'aprobar', id: Number(m[1]) }
  if ((m = t.match(/^\/rechazar(?:@\w+)?\s+(\d+)\s*$/i))) return { tipo: 'rechazar', id: Number(m[1]) }
  if ((m = t.match(/^\/editar(?:@\w+)?\s+(\d+)\s+([\s\S]+)$/i))) return { tipo: 'editar', id: Number(m[1]), texto: m[2].trim() }
  if (/^\/pendientes(?:@\w+)?\s*$/i.test(t)) return { tipo: 'pendientes' }
  if (/^\/ayuda(?:@\w+)?\s*$/i.test(t)) return { tipo: 'ayuda' }
  if ((m = t.match(/^\/modo(?:@\w+)?\s+(aprobar|auto)\s*$/i))) return { tipo: 'modo', modo: m[1].toLowerCase() }
  if (/^\/ocupado(?:@\w+)?\s+ver\s*$/i.test(t)) return { tipo: 'ocupado-ver' }
  if ((m = t.match(/^\/ocupado(?:@\w+)?\s+borrar\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})\s*$/i))) {
    return { tipo: 'ocupado-borrar', fecha: m[1], desde: m[2], hasta: m[3] }
  }
  if ((m = t.match(/^\/ocupado(?:@\w+)?\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})\s*$/i))) {
    return { tipo: 'ocupado-agregar', fecha: m[1], desde: m[2], hasta: m[3] }
  }
  if ((m = t.match(/^\/aprender(?:@\w+)?\s+([\s\S]+)$/i))) return { tipo: 'aprender', texto: m[1].trim() }
  if ((m = t.match(/^\/olvidar(?:@\w+)?\s+(\d+)\s*$/i))) return { tipo: 'olvidar', id: Number(m[1]) }
  if (/^\/memoria(?:@\w+)?\s*$/i.test(t)) return { tipo: 'memoria' }
  if (/^\/seguimientos(?:@\w+)?\s*$/i.test(t)) return { tipo: 'seguimientos' }
  if (/^\/mails(?:@\w+)?\s*$/i.test(t)) return { tipo: 'mails' }
  if ((m = t.match(/^\/si(?:@\w+)?\s+(\d+)\s+(\d+)\s*$/i))) return { tipo: 'si', id: Number(m[1]), hueco: Number(m[2]) }
  if ((m = t.match(/^\/si(?:@\w+)?\s+(\d+)\s+([^\s@]+@[^\s@]+\.[^\s@]+)\s*$/i))) return { tipo: 'si', id: Number(m[1]), para: m[2] }
  if ((m = t.match(/^\/si(?:@\w+)?\s+(\d+)\s*$/i))) return { tipo: 'si', id: Number(m[1]) }
  if ((m = t.match(/^\/no(?:@\w+)?\s+(\d+)\s*$/i))) return { tipo: 'no', id: Number(m[1]) }
  if ((m = t.match(/^\/mail(?:@\w+)?\s+(\S+)\s*\|\s*([^|]+?)\s*\|\s*([\s\S]+)$/i))) {
    return { tipo: 'mail', para: m[1].trim(), asunto: m[2].trim(), cuerpo: m[3].trim() }
  }
  if ((m = t.match(/^\/telegram(?:@\w+)?\s+(\d+)\s*\|\s*([\s\S]+)$/i))) {
    return { tipo: 'telegram', destino: m[1], texto: m[2].trim() }
  }
  if ((m = t.match(/^\/whatsapp(?:@\w+)?\s+([+\d][\d\s-]{6,})\s*\|\s*([\s\S]+)$/i))) {
    return { tipo: 'whatsapp', destino: m[1].replace(/\D/g, ''), texto: m[2].trim() }
  }
  if ((m = t.match(/^\/agenda(?:@\w+)?\s+crear\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})\s*\|\s*([\s\S]+)$/i))) {
    return { tipo: 'agenda-crear', fecha: m[1], desde: m[2], hasta: m[3], titulo: m[4].trim() }
  }
  if ((m = t.match(/^\/recordar(?:@\w+)?\s+([\s\S]+)$/i))) return { tipo: 'recordar', texto: m[1].trim() }
  if ((m = t.match(/^\/programar(?:@\w+)?\s+([\s\S]+)$/i))) return { tipo: 'programar', texto: m[1].trim() }
  if (/^\/tareas(?:@\w+)?\s*$/i.test(t)) return { tipo: 'tareas' }
  if ((m = t.match(/^\/borrar(?:@\w+)?\s+(\d+)\s*$/i))) return { tipo: 'borrar', id: Number(m[1]) }
  if ((m = t.match(/^\/agenda(?:@\w+)?\s+mover\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})\s*\|\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})\s*\|\s*([\s\S]+)$/i))) {
    return {
      tipo: 'agenda-mover',
      fecha: m[1],
      desde: m[2],
      hasta: m[3],
      fechaNueva: m[4],
      desdeNuevo: m[5],
      hastaNuevo: m[6],
      titulo: m[7].trim(),
    }
  }
  if ((m = t.match(/^\/propuesta(?:@\w+)?\s+([\s\S]+)$/i))) return { tipo: 'propuesta', texto: m[1].trim() }
  if ((m = t.match(/^\/horarios(?:@\w+)?\s*([\s\S]*)$/i))) return { tipo: 'horarios', texto: m[1].trim() }
  return null
}

export const TEXTO_AYUDA_DUENIO = [
  'Comandos del dueño:',
  '/pendientes',
  '/aprobar 3',
  '/rechazar 3',
  '/editar 3 el texto que sí querés mandar',
  '/modo aprobar',
  '/modo auto',
  '/ocupado ver',
  '/ocupado 2026-11-25 10:00 11:00',
  '/ocupado borrar 2026-11-25 10:00 11:00',
  '/aprender el texto que querés que recuerde',
  '/olvidar 2',
  '/memoria',
  '/recordar mañana 10:00 llamar al proveedor',
  '/programar lunes 9:00 resumen del día',
  '/tareas',
  '/borrar 2',
  '/propuesta Ana Pérez <ana@negocio.com> / implementación del asistente',
  '/horarios Ana Pérez <ana@negocio.com> | reunión de 30 min esta semana',
  '/mail ana@negocio.com | Asunto | el texto',
  '/agenda crear 2026-11-25 10:00 11:00 | Título',
  '/agenda mover 2026-11-25 10:00 11:00 | 2026-11-25 15:00 16:00 | Título',
  '/telegram 123456 | el texto   (solo un chat que ya escribió)',
  '/whatsapp 5491112345678 | el texto   (si WhatsApp está prendido)',
  '/si 1',
  '/si 1 2',
  '/no 1',
  '/seguimientos',
  '/mails',
  'Nada de eso sale solo: primero te muestro a quién y qué texto, y recién /si lo manda.',
].join('\n')
