// Mail propio del asistente por SMTP, sin dependencias.
// Pensado para Gmail con "contraseña de aplicación" (smtp.gmail.com:465), pero sirve
// con cualquier SMTP con TLS (465) o STARTTLS (587). La clave nunca se loguea.
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import tls from 'node:tls'
import crypto from 'node:crypto'

function b64(texto) {
  return Buffer.from(String(texto), 'utf8').toString('base64')
}

function encabezado(texto) {
  const t = String(texto || '').replace(/[\r\n]+/g, ' ').trim()
  return /^[\x20-\x7e]*$/.test(t) ? t : `=?UTF-8?B?${b64(t)}?=`
}

function direccion(mail, nombre = '') {
  const m = String(mail || '').trim()
  return nombre ? `${encabezado(nombre)} <${m}>` : `<${m}>`
}

function lineas76(base64) {
  return base64.replace(/.{1,76}/g, '$&\r\n').trimEnd()
}

export function esMail(valor) {
  return /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(String(valor || '').trim())
}

export function armarMime({ de, nombre = '', para, cc = '', asunto, cuerpo, adjuntos = [], ahora = new Date(), id = crypto.randomUUID() }) {
  const dominio = String(de).split('@')[1] || 'localhost'
  const cabeza = [
    `From: ${direccion(de, nombre)}`,
    `To: ${direccion(para)}`,
    cc ? `Cc: ${direccion(cc)}` : '',
    `Subject: ${encabezado(asunto)}`,
    `Date: ${ahora.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${id}@${dominio}>`,
    'MIME-Version: 1.0',
  ].filter(Boolean)
  const texto = lineas76(b64(String(cuerpo || '').replace(/\r?\n/g, '\r\n')))
  if (!adjuntos.length) {
    return [...cabeza, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', texto, ''].join('\r\n')
  }
  const limite = `=_asistente_${id.replace(/-/g, '')}`
  const partes = [
    ...cabeza,
    `Content-Type: multipart/mixed; boundary="${limite}"`,
    '',
    `--${limite}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    texto,
  ]
  for (const adj of adjuntos) {
    const nombreArchivo = encabezado(adj.nombre || path.basename(adj.ruta || 'archivo'))
    const datos = adj.datos || fs.readFileSync(adj.ruta)
    partes.push(
      `--${limite}`,
      `Content-Type: ${adj.tipo || 'application/octet-stream'}; name="${nombreArchivo}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${nombreArchivo}"`,
      '',
      lineas76(Buffer.from(datos).toString('base64')),
    )
  }
  partes.push(`--${limite}--`, '')
  return partes.join('\r\n')
}

// Lector de respuestas SMTP: junta líneas "250-..." hasta la "250 ...".
function crearLector(socket) {
  let buffer = ''
  let actual = []
  const listas = []
  const esperando = []
  let error = null
  const entregar = () => {
    while (listas.length && esperando.length) esperando.shift().resolve(listas.shift())
  }
  const alDato = (chunk) => {
    buffer += chunk.toString('utf8')
    let i
    while ((i = buffer.indexOf('\n')) !== -1) {
      const linea = buffer.slice(0, i).replace(/\r$/, '')
      buffer = buffer.slice(i + 1)
      actual.push(linea)
      if (/^\d{3} /.test(linea) || /^\d{3}$/.test(linea)) {
        listas.push({ codigo: Number(linea.slice(0, 3)), texto: actual.join('\n') })
        actual = []
      }
    }
    entregar()
  }
  const alError = (e) => {
    error = e
    while (esperando.length) esperando.shift().reject(e)
  }
  socket.on('data', alDato)
  socket.on('error', alError)
  socket.on('close', () => alError(new Error('El servidor de mail cortó la conexión.')))
  return {
    leer() {
      if (listas.length) return Promise.resolve(listas.shift())
      if (error) return Promise.reject(error)
      return new Promise((resolve, reject) => { esperando.push({ resolve, reject }) })
    },
    soltar() {
      socket.off('data', alDato)
      socket.off('error', alError)
      socket.removeAllListeners('close')
    },
  }
}

function conectarDefault({ host, puerto }) {
  return new Promise((resolve, reject) => {
    const opciones = { host, port: puerto, servername: host, timeout: 20000 }
    const socket = puerto === 465 ? tls.connect(opciones) : net.connect(opciones)
    socket.once(puerto === 465 ? 'secureConnect' : 'connect', () => resolve(socket))
    socket.once('error', reject)
    socket.setTimeout(30000, () => socket.destroy(new Error('El servidor de mail no respondió a tiempo.')))
  })
}

function subirATls(socket, host) {
  return new Promise((resolve, reject) => {
    const seguro = tls.connect({ socket, servername: host }, () => resolve(seguro))
    seguro.once('error', reject)
  })
}

export class ErrorMail extends Error {}

export async function enviarMail(config, mensaje, { conectar = conectarDefault, subir = subirATls, ahora = new Date() } = {}) {
  if (!config?.activo) throw new ErrorMail('No hay mail propio configurado (MAIL_USUARIO y MAIL_CLAVE_APP).')
  if (!esMail(mensaje.para)) throw new ErrorMail('La dirección de destino no es válida.')
  const cc = esMail(mensaje.cc) && mensaje.cc.toLowerCase() !== mensaje.para.toLowerCase() ? mensaje.cc : ''
  let socket = await conectar({ host: config.host, puerto: config.puerto })
  let lector = crearLector(socket)
  const esperar = async (codigos, que) => {
    const r = await lector.leer()
    if (!codigos.includes(r.codigo)) {
      const motivo = r.codigo === 535 || r.codigo === 534
        ? 'El servidor rechazó el usuario o la contraseña de aplicación.'
        : `El servidor de mail rechazó ${que} (${r.codigo}).`
      throw new ErrorMail(motivo)
    }
    return r
  }
  const decir = async (linea, codigos, que) => {
    socket.write(`${linea}\r\n`)
    return esperar(codigos, que)
  }
  try {
    await esperar([220], 'la conexión')
    let ehlo = await decir('EHLO asistente.local', [250], 'el saludo')
    if (config.puerto !== 465 && /STARTTLS/i.test(ehlo.texto)) {
      await decir('STARTTLS', [220], 'el cifrado')
      lector.soltar()
      socket = await subir(socket, config.host)
      lector = crearLector(socket)
      ehlo = await decir('EHLO asistente.local', [250], 'el saludo')
    }
    const plano = Buffer.from(`\0${config.usuario}\0${config.clave}`, 'utf8').toString('base64')
    await decir(`AUTH PLAIN ${plano}`, [235], 'el login')
    await decir(`MAIL FROM:<${config.usuario}>`, [250], 'el remitente')
    await decir(`RCPT TO:<${mensaje.para}>`, [250, 251], 'el destinatario')
    if (cc) await decir(`RCPT TO:<${cc}>`, [250, 251], 'la copia')
    await decir('DATA', [354], 'el envío')
    const mime = armarMime({
      de: config.usuario,
      nombre: config.nombre,
      para: mensaje.para,
      cc,
      asunto: mensaje.asunto,
      cuerpo: mensaje.cuerpo,
      adjuntos: mensaje.adjuntos || [],
      ahora,
    })
    const cuerpoData = mime.replace(/\r\n\./g, '\r\n..')
    socket.write(`${cuerpoData}\r\n.\r\n`)
    await esperar([250], 'el mail')
    socket.write('QUIT\r\n')
    return { para: mensaje.para, cc }
  } finally {
    lector.soltar()
    socket.end?.()
    socket.destroy?.()
  }
}
