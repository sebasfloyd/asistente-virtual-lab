import { esSensible, esTemaSeguro, pareceInyeccion } from './reglas.js'

export const TEXTO_ESPERA = 'Dale, se lo consulto al dueño y te respondo.'
export const TEXTO_RECHAZO = 'Por ahora no te puedo confirmar eso. Si querés, preguntame otra cosa.'
export const TEXTO_LIMITE = 'Estás mandando mensajes muy seguido. Esperá un minuto y probá de nuevo.'
export const TEXTO_SIN_DUENIO = 'Todavía no hay un dueño configurado, así que no contesto consultas. Si lo instalaste vos, completá el .env y registrate con /soyelduenio y el código.'
export const TEXTO_ERROR = 'Ahora no puedo responder. Ya quedó aviso para revisarlo en la compu del dueño.'
export const TEXTO_COLA_LLENA = 'Tengo muchas consultas esperando al dueño. Probá más tarde.'

export function decidirEntrega({ modo, textoCliente, borrador, reglas }) {
  const respuesta = String(borrador || '').trim()
  if (!respuesta) return { accion: 'escalar', motivo: 'respuesta vacía' }
  if (esSensible(textoCliente, reglas) || pareceInyeccion(textoCliente)) {
    return { accion: 'escalar', motivo: 'tema sensible o pedido que no se automatiza' }
  }
  if (esSensible(respuesta, reglas) || pareceInyeccion(respuesta, { dueno: false })) {
    return { accion: 'escalar', motivo: 'la respuesta toca un tema que siempre se revisa' }
  }
  if (modo !== 'auto') return { accion: 'escalar', motivo: 'modo aprobar todo' }
  if (esTemaSeguro(textoCliente, reglas)) return { accion: 'enviar', motivo: 'tema seguro en modo auto' }
  return { accion: 'escalar', motivo: 'el tema no está en la lista segura' }
}

export function formatearAviso({ id, canal, textoCliente, borrador, motivo }) {
  return [
    `Borrador #${id} para responder por ${canal}.`,
    `Motivo: ${motivo}.`,
    '',
    'La persona escribió:',
    textoCliente,
    '',
    'Borrador:',
    borrador,
    '',
    `Para mandarlo: /aprobar ${id}`,
    `Para no mandarlo: /rechazar ${id}`,
    `Para cambiarlo: /editar ${id} el texto final`,
  ].join('\n')
}
