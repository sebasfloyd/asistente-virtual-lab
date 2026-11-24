import { anexarAccion, encolarAccion, promptDeAccion, textoConfirmacion } from './acciones.js'
import { TEXTO_AYUDA_DUENIO, parsearComando } from './comandos.js'
import { TEXTO_DRIVE_FALTANTE, driveConectado, parecePedidoDrive } from './conectores.js'
import { parsearHorarios, parecePedidoHorarios, promptDeHorarios, parsearSlotsCerebro, proponerTresHuecos, textoSlots } from './horarios.js'
import { parsearPedidoEnvio, parecePedidoEnvio, pideTelegram, textoPedirCuerpo, textoPedirDestino, textoWhatsappApagado } from './envio-tercero.js'
import { TOPE_HISTORIAL_DUENIO } from './prompt.js'
import { guardarPropuesta, leerPlantillas, noInventarPrecios, parsearPropuesta, promptDePropuesta, propuestaDeSimulacion } from './propuesta.js'
import {
  TEXTO_COLA_LLENA,
  TEXTO_ERROR,
  TEXTO_ESPERA,
  TEXTO_LIMITE,
  TEXTO_RECHAZO,
  TEXTO_SIN_DUENIO,
  decidirEntrega,
  formatearAviso,
} from './aprobacion.js'
import { armarInvocacion, armarInvocacionAccion } from './cerebro.js'
import { secretosDe } from './config.js'
import { filtrarSalidaCliente } from './filtro.js'
import { calcularHuecos, esPreguntaDeHuecos, interpretarDia, intervaloHorario, textoHuecos, textoOcupados } from './huecos.js'
import { tomarCupo } from './limite.js'
import { anotarEjemplo, aprender, listarMemoria, olvidar } from './memoria.js'
import { limpiarEstilo } from './estilo.js'
import { armarPrompt } from './prompt.js'
import { esSensible, pareceInyeccion, parsearReglas } from './reglas.js'
import { parsearProgramar, parsearRecordar, textoRecordatorios, textoTareas } from './reloj.js'
import { PROMPT_MAILS } from './resumen.js'
import { caminoDe, codigosIguales, esDuenio, hayDuenio, jidDe, registroHabilitado } from './seguridad.js'

const TOPE_PENDIENTES = 30

function al(entrada, texto, audiencia, ctx) {
  return {
    canal: entrada.canal,
    destino: entrada.responderId || entrada.senderId,
    texto: limpiarEstilo(texto, { nombre: ctx?.config?.nombre }),
    audiencia,
  }
}

function claveHistorial(canal, id) {
  return `${canal}:${id}`
}

function recordar(estado, clave, item) {
  const lista = estado.historial[clave] || []
  lista.push({
    rol: item.rol,
    texto: String(item.texto).slice(0, 2000),
    cuando: Number.isFinite(item.cuando) ? item.cuando : null,
  })
  estado.historial[clave] = lista.slice(-TOPE_HISTORIAL_DUENIO)
}

function anotarConocido(estado, entrada) {
  const lista = estado.conocidos?.[entrada.canal]
  if (!lista || lista.includes(entrada.senderId)) return
  lista.push(String(entrada.senderId))
}

function destinosDuenio(estado, config, canalesActivos) {
  const quiere = (canal) => (canalesActivos || []).includes(canal)
  const destinos = []
  if (quiere('telegram')) {
    const id = estado.duenio.telegram || config.ownerTelegramId
    if (id) destinos.push({ canal: 'telegram', destino: id })
  }
  if (quiere('whatsapp')) {
    const id = estado.duenio.whatsapp || (config.ownerWhatsapp ? jidDe(config.ownerWhatsapp) : '')
    if (id) destinos.push({ canal: 'whatsapp', destino: id })
  }
  if (quiere('simulador')) {
    const id = estado.duenio.simulador || config.duenioSimulador
    if (id) destinos.push({ canal: 'simulador', destino: id })
  }
  return destinos
}

function paraCliente(entrada, texto, ctx) {
  const { texto: limpio, oculto } = filtrarSalidaCliente(texto, {
    reglas: ctx.reglasTexto || '',
    emailDuenio: ctx.config.ownerEmail,
    telefonoDuenio: ctx.config.ownerWhatsapp,
    rutas: [ctx.dirs?.raiz, ctx.dirs?.base].filter(Boolean),
  })
  if (oculto) ctx.log?.info('salida_filtrada', { canal: entrada.canal })
  return al(entrada, limpio, 'cliente', ctx)
}

function fechaDe(ctx) {
  return new Date(ctx.ahora()).toISOString().slice(0, 10)
}

function memoriaPara(ctx, camino) {
  const cruda = ctx.leerMemoria?.() || ''
  if (!cruda || camino === 'duenio') return cruda
  return filtrarSalidaCliente(cruda, {
    reglas: ctx.reglasTexto || '',
    emailDuenio: ctx.config.ownerEmail,
    telefonoDuenio: ctx.config.ownerWhatsapp,
    rutas: [ctx.dirs?.raiz, ctx.dirs?.base].filter(Boolean),
  }).texto
}

function avisarDuenio(respuestas, estado, ctx, texto) {
  const destinos = destinosDuenio(estado, ctx.config, ctx.canalesActivos)
  for (const destino of destinos) respuestas.push({ ...destino, texto: limpiarEstilo(texto, { nombre: ctx.config?.nombre }), audiencia: 'duenio' })
  if (!destinos.length) ctx.log?.info('sin_destino_duenio', {})
  return destinos.length
}

async function pedirCerebro(ctx, { camino, mensaje, reglas, historial }) {
  const prompt = armarPrompt({
    camino,
    reglas,
    historial,
    mensaje,
    memoria: memoriaPara(ctx, camino),
    nombre: ctx.config.nombre,
    estilo: ctx.leerEstilo?.() || '',
  })
  const invocacion = armarInvocacion({ camino, dirs: ctx.dirs, env: ctx.env || process.env, config: ctx.config })
  const salida = await ctx.cerebro({ camino, prompt, invocacion, mensaje, reglas })
  return limpiarEstilo(String(salida || '').slice(0, 3500), { nombre: ctx.config.nombre })
}

export function avisosDuenio(estado, config, canalesActivos, texto) {
  return destinosDuenio(estado, config, canalesActivos).map((destino) => ({ ...destino, texto: limpiarEstilo(texto, { nombre: config?.nombre }), audiencia: 'duenio' }))
}

export async function procesarMensaje(entrada, estado, ctx) {
  const siguiente = structuredClone(estado)
  const respuestas = []
  const texto = String(entrada?.texto || '').trim().slice(0, 2000)
  if (!texto || !entrada?.senderId || !entrada?.canal) return { estado: siguiente, respuestas }

  anotarConocido(siguiente, entrada)
  ctx.reglasTexto = ctx.reglas()
  const duenio = esDuenio(entrada, siguiente, ctx.config)
  const comando = parsearComando(texto)

  if (comando?.tipo === 'start') {
    if (duenio) {
      respuestas.push(al(entrada, `Tu ID es ${entrada.senderId}. Ya estás como dueño.`, 'duenio'))
    } else if (entrada.canal === 'telegram'
      ? Boolean(ctx.config.ownerTelegramId || siguiente.duenio?.telegram)
      : hayDuenio(siguiente, ctx.config)) {
      const nombre = ctx.config.nombre
      const saludo = nombre
        ? `Hola, soy ${nombre}. Decime en qué te puedo ayudar.`
        : 'Hola, soy el asistente. Decime en qué te puedo ayudar.'
      respuestas.push(al(entrada, saludo, 'cliente'))
    } else {
      respuestas.push(al(entrada, `Tu ID es ${entrada.senderId}. Pegalo en OWNER_TELEGRAM_ID del .env y reiniciá.`, 'cliente'))
    }
    return { estado: siguiente, respuestas }
  }

  if (!duenio) {
    const ok = tomarCupo(
      siguiente.limites,
      `${entrada.canal}:${entrada.senderId}`,
      ctx.ahora(),
      ctx.config.limiteMensajes,
      ctx.config.limiteVentanaSeg * 1000,
    )
    if (!ok) {
      respuestas.push(al(entrada, TEXTO_LIMITE, 'cliente'))
      return { estado: siguiente, respuestas }
    }
  }

  if (comando?.tipo === 'registrar') {
    if (duenio) {
      respuestas.push(al(entrada, 'Ya estás registrado como dueño.', 'duenio'))
      return { estado: siguiente, respuestas }
    }
    return registrar(entrada, siguiente, ctx, comando.codigo, respuestas)
  }

  if (duenio && comando) return ejecutarComando(entrada, siguiente, ctx, comando, respuestas)
  if (duenio) return hablarDuenio(entrada, siguiente, ctx, texto, respuestas)
  if (!hayDuenio(siguiente, ctx.config)) {
    respuestas.push(al(entrada, TEXTO_SIN_DUENIO, 'cliente'))
    return { estado: siguiente, respuestas }
  }
  return hablarCliente(entrada, siguiente, ctx, texto, respuestas)
}

function registrar(entrada, estado, ctx, codigo, respuestas) {
  if (!registroHabilitado(estado, ctx.config) || !codigosIguales(codigo, ctx.config.codigoDuenio)) {
    respuestas.push(al(entrada, 'No te registré. El código no coincide o el registro ya está cerrado.', 'cliente'))
    ctx.log?.info('registro_fallido', { canal: entrada.canal })
    return { estado, respuestas }
  }
  if (!['telegram', 'whatsapp', 'simulador'].includes(entrada.canal)) return { estado, respuestas }
  estado.duenio[entrada.canal] = entrada.senderId
  estado.registroAbierto = false
  ctx.config.codigoDuenio = ''
  respuestas.push(al(
    entrada,
    `Listo, quedaste como dueño en ${entrada.canal}. Tu ID es ${entrada.senderId}. El código ya no sirve: borralo del .env.`,
    'duenio',
  ))
  ctx.log?.info('registro_ok', { canal: entrada.canal, senderId: entrada.senderId })
  return { estado, respuestas }
}

async function ejecutarComando(entrada, estado, ctx, comando, respuestas) {
  if (comando.tipo === 'ayuda') {
    respuestas.push(al(entrada, TEXTO_AYUDA_DUENIO, 'duenio'))
    return { estado, respuestas }
  }
  if (comando.tipo === 'pendientes') {
    if (!estado.pendientes.length) {
      respuestas.push(al(entrada, 'No hay borradores esperando.', 'duenio'))
      return { estado, respuestas }
    }
    const lista = estado.pendientes.map((p) => `#${p.id} (${p.canal}): ${p.textoCliente.slice(0, 80)}`).join('\n')
    respuestas.push(al(entrada, lista, 'duenio'))
    return { estado, respuestas }
  }
  if (comando.tipo === 'modo') {
    estado.modo = comando.modo
    respuestas.push(al(entrada, `Modo ${comando.modo}. Los temas sensibles igual te los voy a pedir.`, 'duenio'))
    return { estado, respuestas }
  }
  if (comando.tipo === 'aprobar' || comando.tipo === 'rechazar' || comando.tipo === 'editar') {
    return resolverBorrador(entrada, estado, ctx, comando, respuestas)
  }
  if (comando.tipo.startsWith('ocupado')) return ocupado(entrada, estado, ctx, comando, respuestas)
  if (comando.tipo === 'aprender' || comando.tipo === 'olvidar' || comando.tipo === 'memoria') {
    return memoriaComando(entrada, estado, ctx, comando, respuestas)
  }
  if (comando.tipo === 'recordar' || comando.tipo === 'programar' || comando.tipo === 'tareas' || comando.tipo === 'borrar') {
    return relojComando(entrada, estado, ctx, comando, respuestas)
  }
  if (comando.tipo === 'si' || comando.tipo === 'no') return resolverAccion(entrada, estado, ctx, comando, respuestas)
  if (comando.tipo === 'seguimientos') return seguimientos(entrada, estado, ctx, respuestas)
  if (comando.tipo === 'mails') return pedirMails(entrada, estado, ctx, respuestas)
  if (comando.tipo === 'propuesta') return armarPropuesta(entrada, estado, ctx, comando, respuestas)
  if (comando.tipo === 'horarios') {
    const pedido = parsearHorarios(comando.texto ? `/horarios ${comando.texto}` : '/horarios')
    if (!pedido) {
      respuestas.push(al(entrada, 'No entendí. Ejemplo: /horarios Ana Pérez <ana@negocio.com> | reunión de 30 min esta semana', 'duenio'))
      return { estado, respuestas }
    }
    return ofrecerHorarios(entrada, estado, ctx, pedido, respuestas)
  }
  if (comando.tipo === 'mail' || comando.tipo.startsWith('agenda') || comando.tipo === 'telegram' || comando.tipo === 'whatsapp') {
    return proponerAccion(entrada, estado, ctx, comando, respuestas)
  }
  return { estado, respuestas }
}

function resolverBorrador(entrada, estado, ctx, comando, respuestas) {
  const pendiente = estado.pendientes.find((p) => p.id === comando.id)
  if (!pendiente) {
    respuestas.push(al(entrada, `No encuentro el borrador #${comando.id}. Mirá /pendientes.`, 'duenio'))
    return { estado, respuestas }
  }
  estado.pendientes = estado.pendientes.filter((p) => p.id !== comando.id)
  const destino = { canal: pendiente.canal, senderId: pendiente.senderId, responderId: pendiente.destino }
  if (comando.tipo === 'rechazar') {
    const salida = paraCliente(destino, TEXTO_RECHAZO, ctx)
    respuestas.push(salida)
    recordar(estado, claveHistorial(pendiente.canal, pendiente.senderId), { rol: 'asistente', texto: salida.texto, cuando: ctx.ahora() })
    respuestas.push(al(entrada, `Listo, no mandé el borrador #${pendiente.id}.`, 'duenio'))
    return { estado, respuestas }
  }
  const crudo = comando.tipo === 'editar' ? comando.texto : pendiente.borrador
  if (comando.tipo === 'editar' && ctx.guardarMemoria) {
    ctx.guardarMemoria(anotarEjemplo(ctx.leerMemoria?.() || '', {
      pregunta: pendiente.textoCliente,
      borrador: pendiente.borrador,
      correccion: comando.texto,
      fecha: fechaDe(ctx),
    }))
  }
  const salida = paraCliente(destino, crudo, ctx)
  respuestas.push(salida)
  recordar(estado, claveHistorial(pendiente.canal, pendiente.senderId), { rol: 'asistente', texto: salida.texto, cuando: ctx.ahora() })
  respuestas.push(al(entrada, `Listo, mandé el #${pendiente.id}.`, 'duenio'))
  return { estado, respuestas }
}

async function ocupado(entrada, estado, ctx, comando, respuestas) {
  const actual = await ctx.leerOcupado()
  if (comando.tipo === 'ocupado-ver') {
    respuestas.push(al(entrada, textoOcupados(actual.intervalos, ctx.config.zona), 'duenio'))
    return { estado, respuestas }
  }
  const nuevo = intervaloHorario({ ...comando, zona: ctx.config.zona })
  if (!nuevo) {
    respuestas.push(al(entrada, 'No entendí el horario. Usá /ocupado 2026-11-25 10:00 11:00', 'duenio'))
    return { estado, respuestas }
  }
  const queda = comando.tipo === 'ocupado-borrar'
    ? actual.intervalos.filter((item) => Date.parse(item.inicio) !== Date.parse(nuevo.inicio) || Date.parse(item.fin) !== Date.parse(nuevo.fin))
    : [...actual.intervalos, nuevo]
  await ctx.guardarOcupado(queda)
  respuestas.push(al(entrada, textoOcupados(queda, ctx.config.zona), 'duenio'))
  return { estado, respuestas }
}

function memoriaComando(entrada, estado, ctx, comando, respuestas) {
  const actual = ctx.leerMemoria?.() || ''
  if (comando.tipo === 'memoria') {
    respuestas.push(al(entrada, listarMemoria(actual), 'duenio'))
    return { estado, respuestas }
  }
  if (!ctx.guardarMemoria) {
    respuestas.push(al(entrada, 'Esta corrida no tiene archivo de memoria.', 'duenio'))
    return { estado, respuestas }
  }
  if (comando.tipo === 'aprender') {
    const resultado = aprender(actual, comando.texto, fechaDe(ctx))
    if (!resultado.ok) {
      respuestas.push(al(entrada, 'Decime qué querés que recuerde.', 'duenio'))
      return { estado, respuestas }
    }
    ctx.guardarMemoria(resultado.md)
    respuestas.push(al(entrada, 'Listo, lo anoté en la memoria.', 'duenio'))
    return { estado, respuestas }
  }
  const resultado = olvidar(actual, comando.id)
  if (!resultado.ok) {
    respuestas.push(al(entrada, `No encuentro la nota #${comando.id}. Mirá /memoria.`, 'duenio'))
    return { estado, respuestas }
  }
  ctx.guardarMemoria(resultado.md)
  respuestas.push(al(entrada, `Borré la nota #${comando.id}.`, 'duenio'))
  return { estado, respuestas }
}

function relojComando(entrada, estado, ctx, comando, respuestas) {
  if (comando.tipo === 'tareas') {
    const tareas = textoTareas(estado.tareas)
    const recordatorios = textoRecordatorios(estado.recordatorios, ctx.config.zona)
    respuestas.push(al(entrada, [tareas, recordatorios].filter(Boolean).join('\n\n'), 'duenio'))
    return { estado, respuestas }
  }
  if (comando.tipo === 'borrar') {
    const habia = estado.tareas.some((tarea) => tarea.id === comando.id)
    estado.tareas = estado.tareas.filter((tarea) => tarea.id !== comando.id)
    respuestas.push(al(entrada, habia ? `Borré la tarea #${comando.id}.` : `No hay una tarea #${comando.id}. Mirá /tareas.`, 'duenio'))
    return { estado, respuestas }
  }
  if (comando.tipo === 'recordar') {
    const parsed = parsearRecordar(comando.texto, ctx.ahora(), ctx.config.zona)
    if (!parsed) {
      respuestas.push(al(entrada, 'No entendí. Ejemplo: /recordar mañana 10:00 llamar al proveedor', 'duenio'))
      return { estado, respuestas }
    }
    if (parsed.error === 'pasado') {
      respuestas.push(al(entrada, 'Esa hora ya pasó. Decime un momento que todavía no llegó.', 'duenio'))
      return { estado, respuestas }
    }
    const id = estado.proximoRecordatorio
    estado.proximoRecordatorio += 1
    estado.recordatorios.push({ id, cuando: parsed.cuando, texto: parsed.texto, avisado: false })
    respuestas.push(al(entrada, `Anoté el recordatorio #${id}. Te aviso mientras el programa esté corriendo.\n${textoRecordatorios(estado.recordatorios, ctx.config.zona)}`, 'duenio'))
    return { estado, respuestas }
  }
  const parsed = parsearProgramar(comando.texto)
  if (!parsed) {
    respuestas.push(al(entrada, 'No entendí. Ejemplo: /programar lunes 9:00 resumen del día', 'duenio'))
    return { estado, respuestas }
  }
  const id = estado.proximoTarea
  estado.proximoTarea += 1
  estado.tareas.push({ id, dias: parsed.dias, hora: parsed.hora, texto: parsed.texto, ultimo: '' })
  respuestas.push(al(entrada, `Programé la tarea #${id}. Corre mientras el programa esté abierto.\n${textoTareas(estado.tareas)}`, 'duenio'))
  return { estado, respuestas }
}

function proponerAccion(entrada, estado, ctx, comando, respuestas) {
  if (comando.tipo === 'telegram' && !estado.conocidos.telegram?.includes(comando.destino)) {
    respuestas.push(al(entrada, 'Ese chat nunca le escribió al bot. No armo un envío a un desconocido.', 'duenio'))
    return { estado, respuestas }
  }
  if (comando.tipo === 'whatsapp') {
    if (!ctx.canalesActivos?.includes('whatsapp')) {
      respuestas.push(al(entrada, 'WhatsApp no está prendido. No armo ese envío.', 'duenio'))
      return { estado, respuestas }
    }
    if (!comando.destino || comando.destino.length < 8) {
      respuestas.push(al(entrada, 'Ese número no sirve.', 'duenio'))
      return { estado, respuestas }
    }
  }
  if (comando.tipo === 'mail' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(comando.para)) {
    respuestas.push(al(entrada, 'Ese mail no tiene forma de dirección.', 'duenio'))
    return { estado, respuestas }
  }
  if (estado.acciones.length >= 30) {
    respuestas.push(al(entrada, 'Hay demasiadas acciones esperando. Cancelá alguna con /no.', 'duenio'))
    return { estado, respuestas }
  }
  const { tipo, ...resto } = comando
  const accion = encolarAccion(estado, { tipo, ...resto })
  respuestas.push(al(entrada, textoConfirmacion(accion), 'duenio'))
  return { estado, respuestas }
}

async function aplicarAgendaLocal(accion, ctx) {
  const actual = await ctx.leerOcupado()
  if (accion.tipo === 'agenda-crear' || accion.tipo === 'agenda-invitar') {
    const nuevo = intervaloHorario({ fecha: accion.fecha, desde: accion.desde, hasta: accion.hasta, zona: ctx.config.zona })
    if (!nuevo) return false
    await ctx.guardarOcupado([...actual.intervalos, nuevo])
    return true
  }
  const viejo = intervaloHorario({ fecha: accion.fecha, desde: accion.desde, hasta: accion.hasta, zona: ctx.config.zona })
  const nuevo = intervaloHorario({ fecha: accion.fechaNueva, desde: accion.desdeNuevo, hasta: accion.hastaNuevo, zona: ctx.config.zona })
  if (!viejo || !nuevo) return false
  const queda = actual.intervalos.filter((item) => Date.parse(item.inicio) !== Date.parse(viejo.inicio) || Date.parse(item.fin) !== Date.parse(viejo.fin))
  await ctx.guardarOcupado([...queda, nuevo])
  return true
}

async function resolverAccion(entrada, estado, ctx, comando, respuestas) {
  const accion = estado.acciones.find((item) => item.id === comando.id)
  if (!accion) {
    respuestas.push(al(entrada, `No hay una acción #${comando.id}.`, 'duenio'))
    return { estado, respuestas }
  }
  if (comando.tipo === 'no') {
    estado.acciones = estado.acciones.filter((item) => item.id !== accion.id)
    respuestas.push(al(entrada, `Cancelé la acción #${accion.id}. No salió nada.`, 'duenio'))
    return { estado, respuestas }
  }
  if (comando.para && (accion.tipo === 'propuesta-mail' || accion.tipo === 'agenda-invitar')) {
    accion.para = comando.para
  }
  if (accion.tipo === 'recordatorio-propuesta') {
    const id = estado.proximoRecordatorio
    estado.proximoRecordatorio += 1
    estado.recordatorios.push({ id, cuando: accion.cuando, texto: accion.texto, avisado: false })
    estado.acciones = estado.acciones.filter((item) => item.id !== accion.id)
    respuestas.push(al(entrada, `Anoté el recordatorio #${id} en 3 días para seguir la propuesta.`, 'duenio'))
    return { estado, respuestas }
  }
  if (accion.tipo === 'agenda-invitar') {
    const idx = (comando.hueco || 1) - 1
    const slot = (accion.slots || [])[idx]
    if (!slot) {
      respuestas.push(al(entrada, `Elegí un hueco con /si ${accion.id} 1 (o 2 o 3). Todavía no creé el evento.`, 'duenio'))
      return { estado, respuestas }
    }
    accion.fecha = slot.fecha
    accion.desde = slot.desde
    accion.hasta = slot.hasta
    accion.titulo = accion.titulo || `Reunión con ${accion.quien || 'el invitado'}`
  }
  if (accion.tipo === 'propuesta-mail' && !accion.para) {
    respuestas.push(al(entrada, `Falta el mail del cliente. Escribí /si ${accion.id} ana@correo.com. No mandé nada.`, 'duenio'))
    return { estado, respuestas }
  }
  if (accion.tipo === 'telegram' || accion.tipo === 'whatsapp') {
    if (accion.tipo === 'telegram' && !estado.conocidos.telegram?.includes(accion.destino)) {
      respuestas.push(al(entrada, 'Ese chat ya no está entre los conocidos. No lo mando.', 'duenio'))
      return { estado, respuestas }
    }
    if (accion.tipo === 'whatsapp' && !ctx.canalesActivos?.includes('whatsapp')) {
      respuestas.push(al(entrada, 'WhatsApp no está prendido. No lo mando.', 'duenio'))
      return { estado, respuestas }
    }
    const destino = accion.tipo === 'whatsapp' ? jidDe(accion.destino) : accion.destino
    respuestas.push({ canal: accion.tipo, destino, texto: accion.texto, audiencia: 'externo' })
    estado.acciones = estado.acciones.filter((item) => item.id !== accion.id)
    anexarAccion(ctx.dirs?.acciones, {
      id: accion.id,
      tipo: accion.tipo,
      destino,
      texto: accion.texto,
      simulado: false,
      detalle: `enviado por ${accion.tipo}`,
    }, secretosDe(ctx.config))
    respuestas.push(al(entrada, `Listo, mandé la acción #${accion.id}.`, 'duenio'))
    return { estado, respuestas }
  }
  let detalle = ''
  let simulado = false
  if (accion.tipo === 'agenda-crear' || accion.tipo === 'agenda-mover' || accion.tipo === 'agenda-invitar') {
    const ok = await aplicarAgendaLocal(accion, ctx)
    if (!ok) {
      respuestas.push(al(entrada, `No pude guardar el horario de la acción #${accion.id}. Sigue pendiente.`, 'duenio'))
      return { estado, respuestas }
    }
  }
  const conConector = ctx.config.cerebro === 'claude' && ctx.config.ownerConectores && (accion.tipo === 'mail' || accion.tipo === 'propuesta-mail' || accion.tipo.startsWith('agenda'))
  if (conConector) {
    try {
      const invocacion = armarInvocacionAccion({ dirs: ctx.dirs, env: ctx.env || process.env, tipo: accion.tipo })
      const prompt = promptDeAccion(accion)
      detalle = await ctx.cerebro({
        camino: 'duenio',
        prompt,
        invocacion,
        mensaje: `accion ${accion.tipo} ${accion.id}`,
        reglas: ctx.reglasTexto || '',
      })
    } catch (error) {
      ctx.log?.error('accion', { mensaje: error.message })
      if (!accion.tipo.startsWith('agenda')) {
        respuestas.push(al(entrada, `No pude ejecutar la acción #${accion.id}. Sigue pendiente.`, 'duenio'))
        return { estado, respuestas }
      }
      detalle = 'La agenda local quedó actualizada. El conector no respondió.'
      simulado = true
    }
  } else if (accion.tipo === 'mail' || accion.tipo === 'propuesta-mail') {
    simulado = true
    detalle = 'confirmada sin conector: CEREBRO no es claude o OWNER_CONECTORES está apagado'
  } else {
    simulado = true
    detalle = 'agenda local actualizada; no hay conector en esta corrida'
  }
  estado.acciones = estado.acciones.filter((item) => item.id !== accion.id)
  anexarAccion(ctx.dirs?.acciones, {
    id: accion.id,
    tipo: accion.tipo,
    destino: accion.para || '',
    titulo: accion.titulo || accion.asunto || '',
    texto: accion.cuerpo || '',
    simulado,
    detalle: String(detalle || '').slice(0, 500),
  }, secretosDe(ctx.config))
  let aviso = accion.tipo === 'mail' && simulado
    ? `Confirmaste la acción #${accion.id}. En esta corrida no hay un conector de Gmail: no mandé el mail. Quedó en el registro.`
    : accion.tipo === 'propuesta-mail' && simulado
      ? `Confirmaste la acción #${accion.id}. En esta corrida no hay un conector de Gmail: no mandé el mail. El PDF quedó en ${accion.adjunto || 'data/propuestas/'}. Quedó en el registro.`
    : accion.tipo.startsWith('agenda') && simulado
      ? `Confirmaste la acción #${accion.id}. Actualicé la agenda local. El conector de Google Calendar no se usó en esta corrida.`
      : `Listo, ejecuté la acción #${accion.id}.`
  if (accion.tipo === 'propuesta-mail') {
    const rec = encolarAccion(estado, {
      tipo: 'recordatorio-propuesta',
      cuando: ctx.ahora() + 3 * 24 * 60 * 60 * 1000,
      texto: `Seguimiento de la propuesta para ${accion.cliente || accion.para}`,
    })
    aviso += `\n\nSi querés un recordatorio en 3 días para seguir esta propuesta, /si ${rec.id}.`
  }
  respuestas.push(al(entrada, aviso, 'duenio'))
  return { estado, respuestas }
}

function seguimientos(entrada, estado, ctx, respuestas) {
  const corte = ctx.ahora() - 24 * 60 * 60 * 1000
  const espera = []
  for (const [clave, items] of Object.entries(estado.historial || {})) {
    if (clave.startsWith('duenio:')) continue
    const ultimo = items.at(-1)
    if (!ultimo || ultimo.rol !== 'cliente' || !Number.isFinite(ultimo.cuando) || ultimo.cuando > corte) continue
    const sep = clave.indexOf(':')
    const canal = clave.slice(0, sep)
    const senderId = clave.slice(sep + 1)
    if (!canal || !senderId) continue
    espera.push({ canal, senderId, texto: ultimo.texto })
  }
  if (!espera.length) {
    respuestas.push(al(entrada, 'No hay conversaciones esperando respuesta hace más de 24 horas.', 'duenio'))
    return { estado, respuestas }
  }
  const ids = []
  for (const item of espera.slice(0, 5)) {
    if (estado.pendientes.length >= TOPE_PENDIENTES) break
    const id = estado.proximoId
    estado.proximoId += 1
    ids.push(id)
    estado.pendientes.push({
      id,
      canal: item.canal,
      destino: item.senderId,
      senderId: item.senderId,
      textoCliente: item.texto,
      borrador: `Hola, te escribo para retomar: "${String(item.texto).slice(0, 180)}". Seguimos?`,
      motivo: 'seguimiento',
    })
  }
  const lista = estado.pendientes.filter((p) => ids.includes(p.id)).map((p) => `#${p.id} ${p.canal} ${p.senderId}`).join('\n')
  respuestas.push(al(entrada, `Armé borradores de seguimiento. No salieron: mandalos con /aprobar.\n${lista}`, 'duenio'))
  return { estado, respuestas }
}

async function pedirMails(entrada, estado, ctx, respuestas) {
  if (ctx.config.cerebro !== 'claude' || ctx.config.ownerConectores === false) {
    respuestas.push(al(entrada, 'No hay conector de Gmail en esta corrida. No invento mails. Para mandar uno: /mail destino | asunto | texto y después /si.', 'duenio'))
    return { estado, respuestas }
  }
  try {
    const invocacion = armarInvocacion({
      camino: 'duenio',
      dirs: ctx.dirs,
      env: ctx.env || process.env,
      config: { ...ctx.config, ownerEscritura: false },
    })
    const texto = await ctx.cerebro({
      camino: 'duenio',
      prompt: PROMPT_MAILS,
      invocacion,
      mensaje: 'leer mails',
      reglas: ctx.reglasTexto || '',
    })
    respuestas.push(al(entrada, `${texto}\n\nNo mandé nada. Si querés enviar uno: /mail destino | asunto | texto y después /si.`, 'duenio'))
  } catch (error) {
    ctx.log?.error('mails', { mensaje: error.message })
    respuestas.push(al(entrada, 'No pude leer el conector de Gmail. No invento mails.', 'duenio'))
  }
  return { estado, respuestas }
}


function fechaLocal(ctx) {
  const zona = ctx.config.zona || 'America/Argentina/Buenos_Aires'
  return new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ctx.ahora()))
}

async function armarPropuesta(entrada, estado, ctx, comando, respuestas) {
  const parsed = parsearPropuesta(`/propuesta ${comando.texto}`)
  if (!parsed) {
    respuestas.push(al(entrada, 'No entendí. Ejemplo: /propuesta Ana Pérez <ana@negocio.com> / implementación del asistente', 'duenio'))
    return { estado, respuestas }
  }
  const { plantilla, servicios } = leerPlantillas(ctx.dirs.raiz)
  const fecha = fechaLocal(ctx)
  let markdown = ''
  if (ctx.config.cerebro === 'claude' && ctx.config.ownerConectores !== false) {
    try {
      const invocacion = armarInvocacion({
        camino: 'duenio',
        dirs: ctx.dirs,
        env: ctx.env || process.env,
        config: { ...ctx.config, ownerEscritura: false },
      })
      markdown = await ctx.cerebro({
        camino: 'duenio',
        prompt: promptDePropuesta({
          plantilla,
          servicios,
          cliente: parsed.cliente,
          pedido: parsed.pedido,
          fecha,
          negocio: ctx.config.nombre || '',
        }),
        invocacion,
        mensaje: `propuesta ${parsed.cliente}`,
        reglas: ctx.reglasTexto || '',
      })
    } catch (error) {
      ctx.log?.error('propuesta', { mensaje: error.message })
    }
  }
  if (!String(markdown || '').trim()) {
    markdown = propuestaDeSimulacion({ plantilla, servicios, cliente: parsed.cliente, pedido: parsed.pedido, fecha })
  }
  markdown = noInventarPrecios(markdown, servicios)
  const guardado = guardarPropuesta({
    dir: ctx.dirs.propuestas,
    cliente: parsed.cliente,
    pedido: parsed.pedido,
    markdown,
    ahora: ctx.ahora(),
  })
  const accion = encolarAccion(estado, {
    tipo: 'propuesta-mail',
    para: parsed.para,
    cliente: parsed.cliente,
    pedido: parsed.pedido,
    asunto: `Propuesta — ${parsed.pedido}`.slice(0, 120),
    cuerpo: `Hola ${parsed.cliente}, te mando la propuesta. Cualquier ajuste lo vemos.`,
    adjunto: guardado.ruta,
    html: guardado.html,
    md: guardado.md,
    slug: guardado.slug,
  })
  const falta = parsed.para
    ? `Si está bien, /si ${accion.id} la manda por mail. Hasta el /si no sale nada.`
    : `Falta el mail del cliente. Cuando lo tengas: /si ${accion.id} ana@correo.com`
  const texto = [
    `Armé la propuesta para ${parsed.cliente} y la guardé en data/propuestas/.`,
    falta,
  ].join(' ')
  respuestas.push({
    ...al(entrada, texto, 'duenio'),
    archivo: guardado.ruta,
    epigrafe: `Propuesta para ${parsed.cliente}`,
  })
  return { estado, respuestas }
}

async function ofrecerHorarios(entrada, estado, ctx, pedido, respuestas) {
  const zona = ctx.config.zona || 'America/Argentina/Buenos_Aires'
  let slots = []
  if (ctx.config.cerebro === 'claude' && ctx.config.ownerConectores !== false) {
    try {
      const invocacion = armarInvocacion({
        camino: 'duenio',
        dirs: ctx.dirs,
        env: ctx.env || process.env,
        config: { ...ctx.config, ownerEscritura: false },
      })
      const crudo = await ctx.cerebro({
        camino: 'duenio',
        prompt: promptDeHorarios({
          quien: pedido.quien,
          duracionMin: pedido.duracionMin,
          zona,
          desde: ctx.config.jornadaDesde,
          hasta: ctx.config.jornadaHasta,
        }),
        invocacion,
        mensaje: `horarios ${pedido.quien}`,
        reglas: ctx.reglasTexto || '',
      })
      slots = parsearSlotsCerebro(crudo, zona)
    } catch (error) {
      ctx.log?.error('horarios', { mensaje: error.message })
    }
  }
  if (!slots.length) {
    const agenda = await ctx.leerOcupado()
    slots = proponerTresHuecos({
      ocupados: agenda.intervalos || [],
      ahora: ctx.ahora(),
      zona,
      desde: ctx.config.jornadaDesde,
      hasta: ctx.config.jornadaHasta,
      duracionMin: pedido.duracionMin,
    })
  }
  if (!slots.length) {
    respuestas.push(al(entrada, 'No encontré 3 huecos libres en esta semana, en el horario de atención.', 'duenio'))
    return { estado, respuestas }
  }
  const accion = encolarAccion(estado, {
    tipo: 'agenda-invitar',
    quien: pedido.quien,
    para: pedido.para,
    duracionMin: pedido.duracionMin,
    titulo: `Reunión con ${pedido.quien}`,
    slots,
  })
  const texto = `${textoSlots(slots, zona, { quien: pedido.quien, duracionMin: pedido.duracionMin })}\n\n${textoConfirmacion(accion)}`
  respuestas.push(al(entrada, texto, 'duenio'))
  return { estado, respuestas }
}


function manejarEnvioTercero(entrada, estado, ctx, texto, respuestas) {
  const clave = `duenio:${entrada.canal}:${entrada.senderId}`
  const historial = estado.historial[clave] || []
  if (!parecePedidoEnvio(texto, { borrador: estado.envioBorrador, historial })) return null
  const pedido = parsearPedidoEnvio(texto, { borrador: estado.envioBorrador, historial })
  if (!pedido) return null
  if (pedido.destino || pedido.nombre) {
    estado.envioBorrador = {
      canal: 'whatsapp',
      destino: pedido.destino || estado.envioBorrador?.destino || '',
      nombre: pedido.nombre || estado.envioBorrador?.nombre || '',
    }
  }
  const cerrar = (msg) => {
    recordar(estado, clave, { rol: 'cliente', texto, cuando: ctx.ahora() })
    recordar(estado, clave, { rol: 'asistente', texto: msg, cuando: ctx.ahora() })
    respuestas.push(al(entrada, msg, 'duenio'))
    return { estado, respuestas }
  }
  if (!pedido.destino) return cerrar(textoPedirDestino())
  if (!pedido.texto) return cerrar(textoPedirCuerpo({ destino: pedido.destino, nombre: pedido.nombre }))
  const whatsappOn = ctx.canalesActivos?.includes('whatsapp')
  const porTelegram = pedido.canal === 'telegram' || pideTelegram(texto)
  if (!whatsappOn) {
    const msg = textoWhatsappApagado({
      destino: pedido.destino,
      nombre: pedido.nombre,
      texto: pedido.texto,
      porTelegram,
    })
    return cerrar(msg)
  }
  if (porTelegram) {
    const intro = [
      `Un bot de Telegram no puede escribirle a un número de celular. Solo puede hablarle a alguien que ya le haya escrito al bot.`,
      `Te armo el envío por WhatsApp a ${pedido.nombre || 'ese número'} (${pedido.destino}).`,
    ].join(' ')
    estado.envioBorrador = null
    const accion = encolarAccion(estado, { tipo: 'whatsapp', destino: pedido.destino, texto: pedido.texto })
    return cerrar(`${intro}\n\n${textoConfirmacion(accion)}`)
  }
  estado.envioBorrador = null
  const accion = encolarAccion(estado, { tipo: 'whatsapp', destino: pedido.destino, texto: pedido.texto })
  return cerrar(textoConfirmacion(accion))
}

async function hablarDuenio(entrada, estado, ctx, texto, respuestas) {
  const pedidoHorarios = parsearHorarios(texto)
  if (pedidoHorarios) return ofrecerHorarios(entrada, estado, ctx, pedidoHorarios, respuestas)
  const envio = manejarEnvioTercero(entrada, estado, ctx, texto, respuestas)
  if (envio) return envio
  if (parecePedidoDrive(texto)) {
    const servidores = ctx.config.conectoresDetectados || []
    if (servidores.length && !driveConectado(servidores)) {
      respuestas.push(al(entrada, TEXTO_DRIVE_FALTANTE, 'duenio'))
      return { estado, respuestas }
    }
  }
  const clave = `duenio:${entrada.canal}:${entrada.senderId}`
  try {
    const salida = await pedirCerebro(ctx, {
      camino: 'duenio',
      mensaje: texto,
      reglas: ctx.reglasTexto,
      historial: (estado.historial[clave] || []).slice(-TOPE_HISTORIAL_DUENIO),
    })
    recordar(estado, clave, { rol: 'cliente', texto, cuando: ctx.ahora() })
    recordar(estado, clave, { rol: 'asistente', texto: salida, cuando: ctx.ahora() })
    respuestas.push(al(entrada, salida || 'No me salió ninguna respuesta.', 'duenio'))
  } catch (error) {
    ctx.log?.error('cerebro_duenio', { mensaje: error.message })
    respuestas.push(al(entrada, 'No pude usar el cerebro en tu camino. Casi siempre es que falta Claude Code o no iniciaste sesión.', 'duenio'))
  }
  return { estado, respuestas }
}

async function hablarCliente(entrada, estado, ctx, texto, respuestas) {
  const reglas = parsearReglas(ctx.reglasTexto)
  const clave = claveHistorial(entrada.canal, entrada.senderId)
  let borrador
  const sensible = esSensible(texto, reglas) || pareceInyeccion(texto)
  if (ctx.config.huecosLibres && esPreguntaDeHuecos(texto) && !sensible) {
    const agenda = await ctx.leerOcupado()
    const dia = interpretarDia(texto, ctx.ahora(), ctx.config.zona)
    const huecos = dia && agenda.hayDatos
      ? calcularHuecos({
        ocupados: agenda.intervalos,
        dia,
        desde: ctx.config.jornadaDesde,
        hasta: ctx.config.jornadaHasta,
        duracionMin: ctx.config.duracionMin,
        zona: ctx.config.zona,
      })
      : []
    borrador = textoHuecos({
      huecos,
      dia,
      zona: ctx.config.zona,
      hayDatos: agenda.hayDatos,
      diaEntendido: Boolean(dia),
    })
  } else {
    try {
      borrador = await pedirCerebro(ctx, {
        camino: 'cliente',
        mensaje: texto,
        reglas: ctx.reglasTexto,
        historial: (estado.historial[clave] || []).slice(-8),
      })
    } catch (error) {
      ctx.log?.error('cerebro_cliente', { mensaje: error.message })
      respuestas.push(paraCliente(entrada, TEXTO_ERROR, ctx))
      avisarDuenio(respuestas, estado, ctx, 'Falló el cerebro con un cliente. Revisá que `claude` esté instalado y que hayas iniciado sesión.')
      return { estado, respuestas }
    }
  }

  recordar(estado, clave, { rol: 'cliente', texto, cuando: ctx.ahora() })
  const filtrado = filtrarSalidaCliente(borrador, {
    reglas: ctx.reglasTexto,
    emailDuenio: ctx.config.ownerEmail,
    telefonoDuenio: ctx.config.ownerWhatsapp,
    rutas: [ctx.dirs?.raiz, ctx.dirs?.base].filter(Boolean),
  })
  if (filtrado.oculto) ctx.log?.info('salida_filtrada', { canal: entrada.canal })
  borrador = filtrado.texto

  const decision = decidirEntrega({
    modo: estado.modo || ctx.config.modo,
    textoCliente: texto,
    borrador,
    reglas,
  })
  if (decision.accion === 'enviar') {
    const salida = paraCliente(entrada, borrador, ctx)
    respuestas.push(salida)
    recordar(estado, clave, { rol: 'asistente', texto: salida.texto, cuando: ctx.ahora() })
    return { estado, respuestas }
  }
  if (estado.pendientes.length >= TOPE_PENDIENTES) {
    respuestas.push(paraCliente(entrada, TEXTO_COLA_LLENA, ctx))
    return { estado, respuestas }
  }
  const id = estado.proximoId
  estado.proximoId += 1
  estado.pendientes.push({
    id,
    canal: entrada.canal,
    destino: entrada.responderId || entrada.senderId,
    senderId: entrada.senderId,
    textoCliente: texto,
    borrador,
    motivo: decision.motivo,
  })
  respuestas.push(paraCliente(entrada, TEXTO_ESPERA, ctx))
  avisarDuenio(respuestas, estado, ctx, formatearAviso({
    id,
    canal: entrada.canal,
    textoCliente: texto,
    borrador,
    motivo: decision.motivo,
  }))
  return { estado, respuestas }
}

export function caminoPara(entrada, estado, config) {
  return caminoDe(entrada, estado, config)
}
