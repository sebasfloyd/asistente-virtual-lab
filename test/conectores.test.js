import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import {
  armarInvocacion,
  armarInvocacionAccion,
  crearCerebro,
  ejecutarClaude,
} from '../src/cerebro.js'
import {
  LECTURA_GMAIL,
  TEXTO_CONECTOR_FALTANTE,
  TEXTO_DRIVE_FALTANTE,
  esHerramientaEscritura,
  herramientasLectura,
  limpiarTextoDuenio,
  listarConectoresMcp,
  parsearMcpList,
  pareceErrorPermiso,
} from '../src/conectores.js'
import { SISTEMA_DUENIO } from '../src/prompt.js'
import { armar, duenioTelegram } from './ayuda.js'
import { procesarMensaje } from '../src/turno.js'

test('parsea claude mcp list y solo deja herramientas de lectura', () => {
  const servidores = parsearMcpList(`
Checking MCP server health...

claude.ai Gmail: ✓ Connected
claude.ai Google Calendar: ✓ Connected
claude.ai Google Drive: ✓ Connected
`)
  assert.deepEqual(servidores.sort(), ['Gmail', 'Google Calendar', 'Google Drive'])
  const lectura = herramientasLectura(servidores)
  assert.equal(lectura.includes('mcp__claude_ai_Gmail'), true)
  assert.equal(lectura.includes('mcp__claude_ai_Gmail__*'), true)
  assert.equal(lectura.includes('mcp__claude_ai_Google_Calendar'), true)
  assert.equal(lectura.includes('mcp__claude_ai_Google_Drive'), true)
  assert.equal(lectura.includes('mcp__claude_ai_Google_Drive__*'), true)
  assert.equal(lectura.includes('mcp__claude_ai_Gmail__send_message'), false)
  assert.equal(lectura.includes('mcp__claude_ai_Google_Drive__share_file'), false)
  assert.equal(esHerramientaEscritura('mcp__claude_ai_Google_Drive__share_file'), true)
  assert.equal(esHerramientaEscritura('mcp__claude_ai_Google_Drive__search_files'), false)
  assert.equal(lectura.includes('mcp__claude_ai_Google_Calendar__create_event'), false)
  assert.equal(esHerramientaEscritura('mcp__claude_ai_Gmail__send_message'), true)
  assert.equal(esHerramientaEscritura('mcp__claude_ai_Gmail__search_threads'), false)
})

test('listarConectoresMcp usa un claude falso y no arranca el real', () => {
  const llamados = []
  const servidores = listarConectoresMcp({
    spawnSyncFn(comando, args) {
      llamados.push({ comando, args })
      return { status: 0, stdout: 'Gmail: claude.ai Gmail - ✓ Connected\nGoogle Calendar: ✓ Connected\nGoogle Drive: ✓ Connected\n', stderr: '' }
    },
  })
  assert.deepEqual(llamados[0].args, ['mcp', 'list'])
  assert.equal(servidores.includes('Gmail'), true)
  assert.equal(servidores.includes('Google Calendar'), true)
  assert.equal(servidores.includes('Google Drive'), true)
})

test('el dueño, con un claude falso, tiene permitidas solo lecturas de Gmail, Calendar y Drive', async () => {
  const { ctx, pedidos, estado } = armar({ OWNER_TELEGRAM_ID: '42', OWNER_CONECTORES: 'true' })
  ctx.config.conectoresDetectados = parsearMcpList('claude.ai Gmail: ✓ Connected\nclaude.ai Google Calendar: ✓ Connected\nclaude.ai Google Drive: ✓ Connected\n')
  await procesarMensaje(duenioTelegram('Podes ver mis emails?'), estado, ctx)
  const args = pedidos[0].invocacion.args
  const permitidas = args.filter((arg, i) => args[i - 1] === '--allowedTools')
  const denegadas = args.filter((arg, i) => args[i - 1] === '--disallowedTools')
  assert.equal(permitidas.includes('mcp__claude_ai_Gmail'), true)
  assert.equal(permitidas.includes('mcp__claude_ai_Google_Calendar'), true)
  assert.equal(permitidas.includes('mcp__claude_ai_Google_Drive'), true)
  assert.equal(permitidas.includes('mcp__claude_ai_Gmail__*'), true)
  assert.equal(permitidas.includes('mcp__*'), false)
  assert.equal(permitidas.some((arg) => esHerramientaEscritura(arg)), false)
  assert.equal(denegadas.includes('mcp__*send*'), true)
  assert.equal(denegadas.includes('mcp__*create*'), true)
  assert.equal(denegadas.includes('mcp__*share*'), true)
  assert.equal(args[args.indexOf('--permission-mode') + 1], 'dontAsk')
  assert.equal(pedidos[0].invocacion.env.ENABLE_CLAUDEAI_MCP_SERVERS, 'true')
  assert.match(SISTEMA_DUENIO, /customize\/connectors/)
})

test('/si de un mail permite send_message y no abre el camino de lectura', () => {
  const { ctx } = armar({ OWNER_TELEGRAM_ID: '42' })
  const inv = armarInvocacionAccion({ dirs: ctx.dirs, env: ctx.env, tipo: 'mail' })
  const permitidas = inv.args.filter((arg, i) => inv.args[i - 1] === '--allowedTools')
  assert.equal(permitidas.includes('mcp__claude_ai_Gmail__send_message'), true)
  assert.equal(permitidas.includes('mcp__*'), false)
  assert.equal(inv.env.ENABLE_CLAUDEAI_MCP_SERVERS, 'true')
})

test('si Claude habla de permisos, al dueño le llega cómo conectar el conector, no el texto técnico', async () => {
  const { ctx } = armar({ OWNER_TELEGRAM_ID: '42', OWNER_CONECTORES: 'true' })
  const invocacion = armarInvocacion({ camino: 'duenio', dirs: ctx.dirs, env: ctx.env, config: ctx.config })
  const spawnFn = () => {
    const proc = new EventEmitter()
    proc.stdout = new EventEmitter()
    proc.stderr = new EventEmitter()
    proc.stdin = { end() {}, on() {} }
    proc.kill = () => {}
    process.nextTick(() => {
      proc.stdout.emit('data', Buffer.from(JSON.stringify({
        is_error: false,
        result: 'No puedo acceder a tus emails porque el sistema bloqueó el permiso. Tenés que cambiar la configuración de permisos de Claude Code y autorizar el acceso a Gmail.',
      })))
      proc.emit('close', 0)
    })
    return proc
  }
  const crudo = await ejecutarClaude({
    camino: 'duenio',
    mensaje: 'Podes ver mis emails?',
    prompt: 'Pedido del dueño:\nPodes ver mis emails?',
    invocacion,
  }, { spawnFn })
  const cerebro = crearCerebro({ cerebro: 'claude', ownerConectores: true }, { spawnFn })
  const texto = await cerebro({
    camino: 'duenio',
    mensaje: 'Podes ver mis emails?',
    prompt: 'Pedido del dueño:\nPodes ver mis emails?',
    invocacion,
  })
  assert.equal(pareceErrorPermiso(crudo), true)
  assert.equal(texto, TEXTO_CONECTOR_FALTANTE)
  assert.equal(texto.includes('Claude Code'), false)
  assert.equal(texto.includes('permiso'), false)
  assert.match(texto, /claude\.ai\/customize\/connectors/)
  assert.equal(limpiarTextoDuenio('Tenías 3 mails de hoy.'), 'Tenías 3 mails de hoy.')
})

test('si Drive no está conectado, el dueño recibe la nota para conectarlo y no un error técnico', async () => {
  const { ctx, estado } = armar({ OWNER_TELEGRAM_ID: '42', OWNER_CONECTORES: 'true' })
  ctx.config.conectoresDetectados = parsearMcpList('claude.ai Gmail: ✓ Connected\nclaude.ai Google Calendar: ✓ Connected\n')
  const r = await procesarMensaje(duenioTelegram('Podés buscar en Drive el contrato de Ana?'), estado, ctx)
  assert.equal(r.respuestas[0].texto, TEXTO_DRIVE_FALTANTE)
  assert.match(r.respuestas[0].texto, /claude\.ai\/customize\/connectors/)
})
