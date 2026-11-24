// Problemas que aparecieron en la clase en vivo del 24/11 y quedaron cubiertos.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { armar, duenioTelegram } from './ayuda.js'
import { procesarMensaje } from '../src/turno.js'
import { aPlano, aTelegramHtml, aWhatsapp, esDocumento, normalizarMarkdown, partirPorParrafos } from '../src/formato.js'
import { partesParaEnviar, sacarFirma } from '../src/estilo.js'
import { armarMime, enviarMail, ErrorMail } from '../src/correo.js'
import { soltarCandado, tomarCandado } from '../src/candado.js'
import { actualizarEnv, leerEnv, tokenValido } from '../src/entorno.js'
import { pedidoPropuestaLibre } from '../src/propuesta.js'
import { ErrorCerebro, ejecutarClaude, textoErrorCerebro, tipoDeFalla } from '../src/cerebro.js'
import { crearTelegram } from '../src/canales/telegram.js'
import { leerConfig, secretosDe } from '../src/config.js'
import { textoConfirmacion, viaMail } from '../src/acciones.js'

function aislado(env = {}, extras = {}) {
  const dir = `data-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  return armar({ DIR_DATOS: dir, OWNER_TELEGRAM_ID: '42', ...env }, extras)
}

const PROPUESTA = `**PROPUESTA COMERCIAL**
**LAB de Inteligencia Artificial**

**Para:** Ana Pérez **Fecha:** 24 de noviembre de 2026

---

## Qué proponemos

Un programa de 8 semanas.

| Ítem | Precio |
| --- | --- |
| LAB completo | [completar] |

---

- Revisamos juntos
- Arrancamos`

test('markdown: Telegram recibe HTML, sin --- sueltos ni **asteriscos**', () => {
  const html = aTelegramHtml(PROPUESTA)
  assert.equal(html.includes('**'), false)
  assert.equal(/^---$/m.test(html), false)
  assert.match(html, /<b>PROPUESTA COMERCIAL<\/b>/)
  assert.match(html, /<b>Qué proponemos<\/b>/)
  assert.match(html, /- LAB completo: \[completar\]/)
  assert.equal(aTelegramHtml('a < b & c'), 'a &lt; b &amp; c')
  assert.equal(aPlano('**Para:** Ana').trim(), 'Para: Ana')
  assert.equal(aWhatsapp('**Para:** Ana'), '*Para:* Ana')
  assert.equal(normalizarMarkdown('Hola\n---\nChau'), 'Hola\nChau')
})

test('un documento no se parte en 40 burbujas; la charla corta sí', () => {
  assert.equal(esDocumento(PROPUESTA), true)
  const partes = partesParaEnviar(PROPUESTA)
  assert.equal(partes.length, 1)
  assert.equal(partes.some((p) => p.trim() === '---'), false)
  const charla = partesParaEnviar('Dale. Lo veo mañana. Te aviso.')
  assert.equal(charla.length, 3)
  const largo = Array.from({ length: 30 }, (_, i) => `Párrafo ${i} con bastante texto para ocupar lugar en el mensaje y pasar el límite.`).join('\n\n')
  const trozos = partirPorParrafos(largo, 500)
  assert.ok(trozos.length > 1)
  assert.ok(trozos.every((t) => t.length <= 500))
})

test('una lista al final no se borra como si fuera una firma', () => {
  assert.equal(sacarFirma('Llevá:\n- Tijera\n- Algodón'), 'Llevá:\n- Tijera\n- Algodón')
  assert.equal(sacarFirma('Horario: lunes - Viernes'), 'Horario: lunes - Viernes')
  assert.equal(sacarFirma('Dale, lo veo.\n— Luli'), 'Dale, lo veo.')
})

test('el dueño pide mandar un mail: queda en cola, /si sin número lo resuelve, y dice la verdad', async () => {
  const salida = 'Te armé el mail.\n[[MAIL]]{"para":"seba@correo.com","asunto":"Prueba en vivo","cuerpo":"Hola Seba, es una prueba en vivo."}[[/MAIL]]'
  const vivo = aislado({ CEREBRO: 'claude' }, {
    cerebro: async (pedido) => (pedido.mensaje?.startsWith('accion') ? 'BORRADOR' : salida),
  })
  const r1 = await procesarMensaje(duenioTelegram('Podés mandar un email a seba@correo.com diciendo que es una prueba en vivo?'), vivo.estado, vivo.ctx)
  assert.equal(r1.estado.acciones.length, 1)
  assert.match(r1.respuestas[0].texto, /lo intento mandar con tu Gmail/)
  assert.match(r1.respuestas[0].texto, /Borradores/)
  const r2 = await procesarMensaje(duenioTelegram('/si'), r1.estado, vivo.ctx)
  assert.equal(r2.estado.acciones.length, 0)
  assert.match(r2.respuestas[0].texto, /Borradores de tu Gmail/)
  assert.doesNotMatch(r2.respuestas[0].texto, /Listo, mandé/)
})

test('con MAIL_USUARIO y MAIL_CLAVE_APP el mail sale por SMTP con copia', async () => {
  const enviados = []
  const vivo = aislado({ CEREBRO: 'claude', MAIL_USUARIO: 'asistente@gmail.com', MAIL_CLAVE_APP: 'abcd efgh ijkl mnop', MAIL_COPIA: 'duenio@correo.com' })
  vivo.ctx.enviarMail = async (config, mensaje) => { enviados.push({ config, mensaje }); return { para: mensaje.para, cc: mensaje.cc } }
  const r1 = await procesarMensaje(duenioTelegram('/mail ana@negocio.com | Hola | Texto exacto'), vivo.estado, vivo.ctx)
  assert.match(r1.respuestas[0].texto, /lo mando desde asistente@gmail.com con copia a duenio@correo.com/)
  const r2 = await procesarMensaje(duenioTelegram('/si 1'), r1.estado, vivo.ctx)
  assert.equal(enviados.length, 1)
  assert.equal(enviados[0].mensaje.cuerpo, 'Texto exacto')
  assert.equal(enviados[0].config.clave, 'abcdefghijklmnop')
  assert.match(r2.respuestas[0].texto, /Listo, mandé el mail a ana@negocio.com, con copia a duenio@correo.com/)
  assert.equal(vivo.pedidos.length, 0)
})

test('si el SMTP falla, el mail sigue pendiente y se explica por qué', async () => {
  const vivo = aislado({ MAIL_USUARIO: 'asistente@gmail.com', MAIL_CLAVE_APP: 'clave-app-larga' })
  vivo.ctx.enviarMail = async () => { throw new ErrorMail('El servidor rechazó el usuario o la contraseña de aplicación.') }
  const r1 = await procesarMensaje(duenioTelegram('/mail ana@negocio.com | Hola | Texto'), vivo.estado, vivo.ctx)
  const r2 = await procesarMensaje(duenioTelegram('/si 1'), r1.estado, vivo.ctx)
  assert.equal(r2.estado.acciones.length, 1)
  assert.match(r2.respuestas[0].texto, /no salió.*contraseña de aplicación.*Sigue pendiente/)
})

test('sin SMTP ni conector, la confirmación avisa antes que no va a salir', () => {
  const config = leerConfig({ CEREBRO: 'simulacion' })
  assert.equal(viaMail(config), 'ninguna')
  const texto = textoConfirmacion({ id: 3, tipo: 'mail', para: 'a@b.com', asunto: 'x', cuerpo: 'y' }, { via: 'ninguna', config })
  assert.match(texto, /no tengo cómo mandar mails/)
})

test('la clave del mail no llega a Claude ni a los logs', () => {
  const config = leerConfig({ MAIL_USUARIO: 'asistente@gmail.com', MAIL_CLAVE_APP: 'superclave123' })
  assert.ok(secretosDe(config).includes('superclave123'))
})

function servidorSmtp({ rechazarLogin = false } = {}) {
  const recibido = { comandos: [], data: '' }
  const server = net.createServer((sock) => {
    let enData = false
    let buffer = ''
    sock.on('error', () => {})
    sock.write('220 prueba ESMTP\r\n')
    sock.on('data', (chunk) => {
      buffer += chunk.toString()
      let i
      while ((i = buffer.indexOf('\r\n')) !== -1) {
        const linea = buffer.slice(0, i)
        buffer = buffer.slice(i + 2)
        if (enData) {
          if (linea === '.') { enData = false; sock.write('250 OK encolado\r\n') } else recibido.data += `${linea}\n`
          continue
        }
        recibido.comandos.push(linea)
        if (/^EHLO/.test(linea)) sock.write('250-prueba\r\n250 AUTH PLAIN\r\n')
        else if (/^AUTH/.test(linea)) sock.write(rechazarLogin ? '535 5.7.8 no\r\n' : '235 ok\r\n')
        else if (/^MAIL|^RCPT/.test(linea)) sock.write('250 ok\r\n')
        else if (linea === 'DATA') { enData = true; sock.write('354 dale\r\n') } else if (linea === 'QUIT') { sock.write('221 chau\r\n'); sock.end() }
      }
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, puerto: server.address().port, recibido })))
}

test('cliente SMTP: login, destinatario, copia, asunto con acentos y adjunto', async () => {
  const { server, puerto, recibido } = await servidorSmtp()
  const pdf = path.join(os.tmpdir(), `prop-${process.pid}.pdf`)
  fs.writeFileSync(pdf, '%PDF-1.4 prueba')
  const config = { activo: true, usuario: 'asistente@gmail.com', clave: 'clave', host: '127.0.0.1', puerto: 2525, nombre: 'Martín' }
  const conectar = () => new Promise((resolve) => { const s = net.connect(puerto, '127.0.0.1', () => resolve(s)) })
  const r = await enviarMail(config, { para: 'ana@negocio.com', cc: 'duenio@correo.com', asunto: 'Propuesta — LAB', cuerpo: 'Hola.\n.\nChau', adjuntos: [{ ruta: pdf, tipo: 'application/pdf' }] }, { conectar })
  server.close()
  assert.equal(r.cc, 'duenio@correo.com')
  assert.ok(recibido.comandos.includes('RCPT TO:<ana@negocio.com>'))
  assert.ok(recibido.comandos.includes('RCPT TO:<duenio@correo.com>'))
  assert.match(recibido.data, /Subject: =\?UTF-8\?B\?/)
  assert.match(recibido.data, /filename="prop-/)
  assert.equal(recibido.comandos.some((c) => c.includes('clave') && !c.startsWith('AUTH')), false)
})

test('cliente SMTP: contraseña mala da un mensaje claro', async () => {
  const { server, puerto } = await servidorSmtp({ rechazarLogin: true })
  const config = { activo: true, usuario: 'a@gmail.com', clave: 'x', host: '127.0.0.1', puerto: 2525 }
  const conectar = () => new Promise((resolve) => { const s = net.connect(puerto, '127.0.0.1', () => resolve(s)) })
  await assert.rejects(enviarMail(config, { para: 'b@c.com', asunto: 'x', cuerpo: 'y' }, { conectar }), /contraseña de aplicación/)
  server.close()
})

test('MIME sin adjunto es texto plano UTF-8', () => {
  const mime = armarMime({ de: 'a@b.com', para: 'c@d.com', asunto: 'Hola', cuerpo: 'ñandú', ahora: new Date('2026-11-24T12:00:00Z'), id: 'x' })
  assert.match(mime, /Content-Type: text\/plain; charset=UTF-8/)
  assert.match(mime, /Subject: Hola/)
})

test('"armame una propuesta para Ana Pérez para el lab" va al PDF, no al chat', async () => {
  assert.deepEqual(pedidoPropuestaLibre('Podés armar una propuesta comercial para Ana Pérez para el lab?'), { cliente: 'Ana Pérez', para: '', pedido: 'el lab' })
  assert.deepEqual(pedidoPropuestaLibre('haceme una propuesta para Ana <ana@x.com>'), { cliente: 'Ana', para: 'ana@x.com', pedido: 'propuesta comercial' })
  assert.equal(pedidoPropuestaLibre('qué onda la propuesta de ayer?'), null)
  const avisos = []
  const sim = aislado()
  sim.ctx.avisarYa = async (_e, texto) => { avisos.push(texto) }
  const r = await procesarMensaje(duenioTelegram('Podés armar una propuesta comercial para Ana Pérez para el lab?'), sim.estado, sim.ctx)
  assert.match(avisos[0], /armo la propuesta para Ana Pérez/)
  assert.ok(r.respuestas[0].archivo)
  assert.equal(r.estado.acciones.at(-1).tipo, 'propuesta-mail')
  const hist = Object.entries(r.estado.historial).find(([k]) => k.startsWith('duenio:'))[1]
  assert.match(hist.at(-1).texto, /Acción #/)
})

test('errores del cerebro en criollo, con el paso a seguir', async () => {
  assert.equal(tipoDeFalla('Invalid API key · Please run /login'), 'sin-sesion')
  assert.equal(tipoDeFalla('Claude AI usage limit reached'), 'limite')
  assert.match(textoErrorCerebro(new ErrorCerebro('x', 'timeout')), /Tardé demasiado/)
  assert.match(textoErrorCerebro(new ErrorCerebro('x', 'sin-claude')), /npm install -g @anthropic-ai\/claude-code/)
  assert.match(textoErrorCerebro(new ErrorCerebro('x', 'sin-sesion')), /\/login/)
  const vivo = aislado({ CEREBRO: 'claude' }, { cerebro: async () => { throw new ErrorCerebro('lento', 'timeout') } })
  const r = await procesarMensaje(duenioTelegram('contame algo'), vivo.estado, vivo.ctx)
  assert.match(r.respuestas[0].texto, /Tardé demasiado/)
  assert.doesNotMatch(r.respuestas[0].texto, /no iniciaste sesión/)
})

test('timeout del dueño: 300 s por defecto y configurable', () => {
  assert.equal(leerConfig({}).timeoutDuenioSeg, 300)
  assert.equal(leerConfig({ TIMEOUT_DUENIO_SEG: '600' }).timeoutDuenioSeg, 600)
  assert.equal(leerConfig({}).timeoutClienteSeg, 120)
})

test('ejecutarClaude marca el timeout como timeout', async () => {
  const sim = aislado({ CEREBRO: 'claude' })
  const { armarInvocacion } = await import('../src/cerebro.js')
  const invocacion = armarInvocacion({ camino: 'duenio', dirs: sim.ctx.dirs, env: sim.ctx.env, config: sim.ctx.config })
  const { EventEmitter } = await import('node:events')
  const spawnFn = () => {
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.stdin = { on() {}, end() {} }
    child.kill = () => {}
    return child
  }
  await assert.rejects(ejecutarClaude({ camino: 'duenio', prompt: 'hola', invocacion, mensaje: 'hola' }, { spawnFn, timeoutMs: 30 }), (e) => e.tipo === 'timeout')
})

test('candado: una sola copia por carpeta', () => {
  const ruta = path.join(os.tmpdir(), `candado-${process.pid}-${Date.now()}`, 'asistente.pid')
  assert.equal(tomarCandado(ruta, { pid: 111, vivo: () => false }).ok, true)
  const segundo = tomarCandado(ruta, { pid: 222, vivo: (pid) => pid === 111 })
  assert.equal(segundo.ok, false)
  assert.equal(segundo.pid, 111)
  assert.equal(tomarCandado(ruta, { pid: 333, vivo: () => false }).ok, true)
  soltarCandado(ruta, { pid: 333 })
  assert.equal(fs.existsSync(ruta), false)
})

test('setup: escribe el .env sin tocar el resto y valida el token', () => {
  const base = '# comentario\nTELEGRAM=false\nTELEGRAM_TOKEN=\nOWNER_TELEGRAM_ID=\n# DIR_DATOS=data\n'
  const nuevo = actualizarEnv(base, { TELEGRAM: 'true', TELEGRAM_TOKEN: '123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', ASISTENTE_NOMBRE: 'Martín' })
  const env = leerEnv(nuevo)
  assert.equal(env.TELEGRAM, 'true')
  assert.equal(env.ASISTENTE_NOMBRE, 'Martín')
  assert.match(nuevo, /^# comentario/)
  assert.equal(tokenValido(env.TELEGRAM_TOKEN), true)
  assert.equal(tokenValido('hola'), false)
})

test('telegram: 409 se avisa una vez y claro; HTML rechazado cae a texto plano', async () => {
  const enviados = []
  let pedidosUpdates = 0
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      if (req.url.includes('getUpdates')) {
        pedidosUpdates += 1
        res.statusCode = 409
        res.end(JSON.stringify({ ok: false, description: 'Conflict: terminated by other getUpdates request' }))
        return
      }
      const cuerpo = JSON.parse(body)
      enviados.push(cuerpo)
      if (cuerpo.parse_mode === 'HTML') { res.statusCode = 400; res.end('{"ok":false}'); return }
      res.end('{"ok":true,"result":{}}')
    })
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const logs = []
  const tg = crearTelegram({ token: '1:x', apiBase: `http://127.0.0.1:${server.address().port}`, onMensaje: async () => {}, log: (m) => logs.push(m), esperaConflictoMs: 20, timeoutSeg: 0 })
  await new Promise((r) => setTimeout(r, 200))
  await tg.enviar('5', '**Hola** Seba')
  tg.cerrar()
  server.close()
  assert.ok(pedidosUpdates > 2)
  assert.equal(logs.length, 1)
  assert.match(logs[0], /otra copia del bot/)
  assert.equal(enviados.at(-1).text, 'Hola Seba')
  assert.equal(enviados.at(-1).parse_mode, undefined)
})
