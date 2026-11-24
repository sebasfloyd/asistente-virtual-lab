// Un mail pedido en la charla del dueño. El modelo solo propone un bloque [[MAIL]];
// el código lo valida y lo deja en cola hasta /si. El destinatario tiene que ser una
// dirección que escribió el dueño: un mail leído no puede meter otra.
const BLOQUE = /\[\[MAIL\]\]([\s\S]*?)\[\[\/MAIL\]\]/i
const BLOQUES = /\[\[MAIL\]\][\s\S]*?(?:\[\[\/MAIL\]\]|$)/gi
const DIRECCION = /^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i

function direccionesDe(texto) {
  return (String(texto || '').match(/[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi) || []).map((m) => m.toLowerCase())
}

export function extraerMail(salida, { mensaje = '', historial = [] } = {}) {
  const crudo = String(salida || '')
  if (!/\[\[MAIL\]\]/i.test(crudo)) return { texto: crudo, mail: null, error: '' }
  const texto = crudo.replace(BLOQUES, '').trim()
  let datos = null
  try {
    datos = JSON.parse(crudo.match(BLOQUE)?.[1].trim())
  } catch {
    datos = null
  }
  const para = String(datos?.para || '').trim().toLowerCase()
  const asunto = String(datos?.asunto || '').replace(/\s+/g, ' ').trim().slice(0, 200)
  const cuerpo = String(datos?.cuerpo || '').trim()
  if (!datos || !DIRECCION.test(para) || !asunto || !cuerpo) return { texto, mail: null, error: 'formato' }
  const permitidas = new Set(direccionesDe(mensaje))
  for (const item of historial) {
    if (item?.rol === 'cliente') for (const d of direccionesDe(item.texto)) permitidas.add(d)
  }
  if (!permitidas.has(para)) return { texto, mail: null, error: 'destino' }
  return { texto, mail: { para, asunto, cuerpo }, error: '' }
}
