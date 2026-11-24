import os from 'node:os'

const INVISIBLE = /[\u200B-\u200D\uFEFF]/g

function reEmail() {
  return /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi
}

function escapar(valor) {
  return String(valor).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function emailsEn(texto) {
  return [...String(texto || '').matchAll(reEmail())].map((m) => m[0])
}

export function filtrarSalidaCliente(texto, { reglas = '', emailDuenio = '', telefonoDuenio = '', rutas = [] } = {}) {
  const permitidos = new Set(emailsEn(reglas).map((mail) => mail.toLowerCase()))
  if (emailDuenio) permitidos.delete(emailDuenio.toLowerCase())
  let out = String(texto || '').replace(INVISIBLE, '')
  let oculto = false

  const tapar = (reemplazo) => {
    oculto = true
    return reemplazo
  }

  if (emailDuenio) {
    const re = new RegExp(escapar(emailDuenio), 'gi')
    out = out.replace(re, () => tapar('[dato privado]'))
  }

  out = out.replace(reEmail(), (mail) => (permitidos.has(mail.toLowerCase()) ? mail : tapar('[dato privado]')))

  const digitos = String(telefonoDuenio || '').replace(/\D/g, '')
  if (digitos.length >= 8) {
    const flexible = digitos.split('').join('[\\s\\-().]*')
    const re = new RegExp(`\\+?${flexible}`, 'g')
    out = out.replace(re, () => tapar('[dato privado]'))
  }

  const rutasPropias = [os.homedir(), ...rutas].filter((ruta) => typeof ruta === 'string' && ruta.length > 3)
  for (const ruta of rutasPropias) {
    if (out.includes(ruta)) {
      oculto = true
      out = out.split(ruta).join('[ruta]')
    }
  }
  out = out.replace(/\/Users\/[^\s"'`]+/g, () => tapar('[ruta]'))
  out = out.replace(/\/home\/[^\s"'`]+/g, () => tapar('[ruta]'))
  out = out.replace(/[A-Za-z]:\\Users\\[^\s"'`]+/g, () => tapar('[ruta]'))

  return { texto: out, oculto }
}
