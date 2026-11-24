import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { filtrarSalidaCliente } from './filtro.js'
import { MARCA_CLIENTE, MARCA_FIN_CLIENTE, SISTEMA_CLIENTE, SISTEMA_DUENIO } from './prompt.js'
import {
  DENEGAR_EN_ACCION_MAIL,
  GLOBS_DENEGAR_ESCRITURA,
  herramientasEscritura,
  herramientasLectura,
  limpiarTextoDuenio,
} from './conectores.js'
import { esSensible } from './reglas.js'

// El camino del cliente solo puede llegar a Claude sin herramientas.
// Si los flags no están, nos negamos a ejecutar. Eso es código, no un ruego en el prompt.

const CLAVES_ENTORNO_CLIENTE = [
  'PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM',
  'TMPDIR', 'TMP', 'TEMP', 'SHELL',
  'SystemRoot', 'ComSpec', 'PATHEXT', 'WINDIR', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA',
  'HOMEDRIVE', 'HOMEPATH',
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy',
  'CLAUDE_CODE_DISABLE_CLAUDE_MDS', 'CLAUDE_CODE_DISABLE_AUTO_MEMORY',
]

const SECRETOS_APP = ['TELEGRAM_TOKEN', 'ANTHROPIC_API_KEY', 'CODIGO_DUENIO', 'OWNER_TELEGRAM_ID', 'OWNER_WHATSAPP', 'OWNER_EMAIL', 'MAIL_CLAVE_APP', 'MAIL_USUARIO']

export function prepararEntorno(dirs) {
  if (path.resolve(dirs.sandbox) === path.resolve(dirs.raiz)) {
    throw new Error('El sandbox del cliente no puede ser la carpeta del proyecto.')
  }
  fs.mkdirSync(dirs.sandbox, { recursive: true })
  fs.mkdirSync(dirs.espacioDuenio, { recursive: true })
  for (const basura of ['.env', '.env.local', 'reglas.md', 'package.json', '.mcp.json', 'CLAUDE.md', 'CLAUDE.local.md']) {
    fs.rmSync(path.join(dirs.sandbox, basura), { force: true })
  }
  fs.rmSync(path.join(dirs.sandbox, '.claude'), { recursive: true, force: true })
  fs.writeFileSync(dirs.mcpVacio, '{"mcpServers":{}}\n', { mode: 0o600 })
  fs.writeFileSync(dirs.mcpVacioDuenio, '{"mcpServers":{}}\n', { mode: 0o600 })
  fs.writeFileSync(dirs.ajustesCliente, '{"disableAllHooks":true}\n', { mode: 0o600 })
  fs.writeFileSync(dirs.sistemaCliente, `${SISTEMA_CLIENTE}\n`, { mode: 0o600 })
  fs.writeFileSync(dirs.sistemaDuenio, `${SISTEMA_DUENIO}\n`, { mode: 0o600 })
}

function filtrarEnvCliente(env) {
  const out = {}
  for (const clave of CLAVES_ENTORNO_CLIENTE) {
    if (env[clave]) out[clave] = env[clave]
  }
  // Aunque HOME quede (hace falta para la sesión de Claude), no se carga memoria ni CLAUDE.md.
  out.CLAUDE_CODE_DISABLE_CLAUDE_MDS = '1'
  out.CLAUDE_CODE_DISABLE_AUTO_MEMORY = '1'
  return out
}

function filtrarEnvDuenio(env) {
  const out = {}
  for (const [clave, valor] of Object.entries(env)) {
    if (SECRETOS_APP.includes(clave)) continue
    out[clave] = valor
  }
  return out
}

function entornoDuenio(env, conectores) {
  const out = filtrarEnvDuenio(env)
  if (conectores) out.ENABLE_CLAUDEAI_MCP_SERVERS = 'true'
  else out.ENABLE_CLAUDEAI_MCP_SERVERS = 'false'
  return out
}

function pushTools(args, flag, herramientas) {
  for (const herramienta of herramientas) {
    args.push(flag, herramienta)
  }
}

function escribirWrapperMente(dir, comando) {
  const ruta = path.join(dir, 'consultar-mente.mjs')
  const cuerpo = `#!/usr/bin/env node
import { spawn } from 'node:child_process'
const pedido = process.argv.slice(2).join(' ').slice(0, 4000)
const child = spawn(${JSON.stringify(comando)}, [pedido], { stdio: 'inherit', shell: false })
child.on('error', () => process.exit(1))
child.on('exit', (code) => process.exit(code ?? 1))
`
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(ruta, cuerpo, { mode: 0o700 })
  return ruta
}

function argsDuenio(dirs, config) {
  const conectores = config?.ownerConectores !== false
  const escritura = config?.ownerEscritura === true
  const mente = config?.menteCmd || ''
  const args = ['-p', '--output-format', 'json', '--no-session-persistence', '--disable-slash-commands']
  if (!conectores) {
    args.push('--strict-mcp-config', '--mcp-config', dirs.mcpVacioDuenio, '--disallowedTools', 'mcp__*')
  } else {
    pushTools(args, '--allowedTools', herramientasLectura(config?.conectoresDetectados || []))
  }
  if (escritura && conectores) {
    args.push('--permission-mode', 'bypassPermissions')
    pushTools(args, '--disallowedTools', GLOBS_DENEGAR_ESCRITURA)
  } else {
    args.push('--permission-mode', 'dontAsk')
    for (const herramienta of ['Edit', 'Write', 'NotebookEdit']) args.push('--disallowedTools', herramienta)
    if (!mente) args.push('--disallowedTools', 'Bash')
    if (conectores) pushTools(args, '--disallowedTools', GLOBS_DENEGAR_ESCRITURA)
  }
  if (mente) args.push('--allowedTools', `Bash(${escribirWrapperMente(dirs.espacioDuenio, mente)} *)`)
  args.push('--append-system-prompt-file', dirs.sistemaDuenio)
  return args
}

function adentro(carpeta, archivo) {
  if (!archivo) return false
  const rel = path.relative(path.resolve(carpeta), path.resolve(archivo))
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

function valoresFlag(args, flag) {
  const out = []
  for (let i = 0; i < args.length - 1; i += 1) if (args[i] === flag) out.push(args[i + 1])
  return out
}

// En una prueba real, `claude -p` mete el mail de la cuenta (y a veces memoria o CLAUDE.md)
// aunque no haya herramientas. Acá se apagan settings, memoria, CLAUDE.md y MCP.
// No usamos --bare: desde Claude Code 2.1 ese flag ignora el login OAuth / llavero
// y solo acepta ANTHROPIC_API_KEY. El dueño entra con `claude login`, así que --bare
// hacía fallar el camino cliente (“Not logged in”) aunque el del dueño anduviera.
// El mail de la cuenta no sale con flags: lo tapa src/filtro.js antes de llegar al cliente.
export function armarInvocacion({ camino, dirs, env, config }) {
  if (camino === 'cliente') {
    return {
      comando: 'claude',
      args: [
        '-p',
        '--output-format', 'json',
        '--allowedTools', '',
        '--disallowedTools', '*',
        '--disallowedTools', 'mcp__*',
        '--tools', '',
        '--strict-mcp-config',
        '--mcp-config', dirs.mcpVacio,
        '--setting-sources', '',
        '--settings', dirs.ajustesCliente,
        '--permission-mode', 'dontAsk',
        '--no-session-persistence',
        '--disable-slash-commands',
        '--append-system-prompt-file', dirs.sistemaCliente,
      ],
      cwd: dirs.sandbox,
      env: filtrarEnvCliente(env),
    }
  }
  if (camino === 'duenio') {
    const conectores = config?.ownerConectores !== false
    return {
      comando: 'claude',
      args: argsDuenio(dirs, config),
      cwd: dirs.espacioDuenio,
      env: entornoDuenio(env, conectores),
    }
  }
  throw new Error('Camino desconocido.')
}

export function armarInvocacionAccion({ dirs, env, tipo } = {}) {
  const args = [
    '-p',
    '--output-format', 'json',
    '--permission-mode', 'bypassPermissions',
    '--disallowedTools', 'Bash',
    '--disallowedTools', 'Edit',
    '--disallowedTools', 'Write',
    '--disallowedTools', 'NotebookEdit',
    '--no-session-persistence',
    '--disable-slash-commands',
    '--append-system-prompt-file', dirs.sistemaDuenio,
  ]
  pushTools(args, '--allowedTools', herramientasEscritura(tipo))
  if (tipo === 'mail' || tipo === 'propuesta-mail') pushTools(args, '--disallowedTools', DENEGAR_EN_ACCION_MAIL)
  return {
    comando: 'claude',
    args,
    cwd: dirs.espacioDuenio,
    env: entornoDuenio(env, true),
  }
}

function esCarpetaTemporal(cwd) {
  if (!cwd || !path.basename(cwd).startsWith('asistente-cliente-')) return false
  const tmp = fs.realpathSync(os.tmpdir())
  const real = fs.existsSync(cwd) ? fs.realpathSync(cwd) : path.resolve(cwd)
  const rel = path.relative(tmp, real)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

export function invocacionClienteValida(inv) {
  if (!inv || !esCarpetaTemporal(inv.cwd)) return false
  if (fs.existsSync(path.join(inv.cwd, '.env')) || fs.existsSync(path.join(inv.cwd, 'package.json'))) return false
  if (fs.existsSync(path.join(inv.cwd, 'CLAUDE.md')) || fs.existsSync(path.join(inv.cwd, '.claude'))) return false
  const args = inv.args || []
  const unido = args.join('\n')
  if (unido.includes('bypassPermissions') || args.includes('--add-dir') || args.includes('--plugin-dir')) return false
  if (!valoresFlag(args, '--allowedTools').includes('')) return false
  if (!valoresFlag(args, '--tools').includes('')) return false
  const denegadas = valoresFlag(args, '--disallowedTools')
  if (!denegadas.includes('*') || !denegadas.includes('mcp__*')) return false
  if (args.includes('--bare')) return false
  if (!args.includes('--strict-mcp-config')) return false
  if (!valoresFlag(args, '--permission-mode').includes('dontAsk')) return false
  if (!valoresFlag(args, '--setting-sources').includes('')) return false
  if (!adentro(inv.cwd, valoresFlag(args, '--mcp-config')[0])) return false
  if (!adentro(inv.cwd, valoresFlag(args, '--settings')[0])) return false
  if (!adentro(inv.cwd, valoresFlag(args, '--append-system-prompt-file')[0])) return false
  const claves = Object.keys(inv.env || {})
  if (claves.some((clave) => !CLAVES_ENTORNO_CLIENTE.includes(clave) || SECRETOS_APP.includes(clave))) return false
  if (inv.env?.CLAUDE_CODE_DISABLE_CLAUDE_MDS !== '1') return false
  if (inv.env?.CLAUDE_CODE_DISABLE_AUTO_MEMORY !== '1') return false
  return true
}

export function invocacionDuenioValida(inv) {
  if (!inv || path.basename(inv.cwd || '') !== 'espacio-duenio') return false
  const args = inv.args || []
  if (args.includes('--bare') || args.includes('--tools') || args.includes('--setting-sources')) return false
  if (valoresFlag(args, '--allowedTools').includes('')) return false
  const modo = valoresFlag(args, '--permission-mode')
  if (!modo.includes('dontAsk') && !modo.includes('bypassPermissions')) return false
  if (args.includes('--strict-mcp-config')) {
    if (!adentro(inv.cwd, valoresFlag(args, '--mcp-config')[0])) return false
    if (!valoresFlag(args, '--disallowedTools').includes('mcp__*')) return false
  }
  if (Object.keys(inv.env || {}).some((clave) => SECRETOS_APP.includes(clave))) return false
  return true
}

function sellarSandbox(inv) {
  const mcp = valoresFlag(inv.args, '--mcp-config')[0]
  const ajustes = valoresFlag(inv.args, '--settings')[0]
  fs.mkdirSync(inv.cwd, { recursive: true })
  for (const basura of ['CLAUDE.md', 'CLAUDE.local.md', '.mcp.json', '.env', 'package.json', 'reglas.md']) {
    fs.rmSync(path.join(inv.cwd, basura), { force: true })
  }
  fs.rmSync(path.join(inv.cwd, '.claude'), { recursive: true, force: true })
  fs.writeFileSync(mcp, '{"mcpServers":{}}\n', { mode: 0o600 })
  fs.writeFileSync(ajustes, '{"disableAllHooks":true}\n', { mode: 0o600 })
}

export function afirmarInvocacionSegura(pedido) {
  const inv = pedido.invocacion
  const args = inv?.args || []
  if (pedido.mensaje && pedido.mensaje.length > 12 && args.some((arg) => String(arg).includes(pedido.mensaje))) {
    throw new Error('El mensaje no va en los argumentos del proceso.')
  }
  if (pedido.camino === 'cliente') {
    if (!pedido.prompt?.includes(MARCA_CLIENTE) || !pedido.prompt?.includes(MARCA_FIN_CLIENTE)) {
      throw new Error('El camino cliente llegó sin la envoltura de datos no confiables.')
    }
    const inicio = pedido.prompt.indexOf(MARCA_CLIENTE)
    const fin = pedido.prompt.lastIndexOf(MARCA_FIN_CLIENTE)
    if (fin < inicio) throw new Error('La envoltura del mensaje cliente está rota.')
    if (!invocacionClienteValida(inv)) throw new Error('Me negué a ejecutar el camino cliente: faltan las trabas de herramientas.')
    sellarSandbox(inv)
    if (!invocacionClienteValida(inv)) throw new Error('Me negué a ejecutar el camino cliente: faltan las trabas de herramientas.')
    return
  }
  if (pedido.camino === 'duenio') {
    if (pedido.prompt?.includes(MARCA_CLIENTE)) throw new Error('Un prompt de cliente no puede ir al camino del dueño.')
    if (!invocacionDuenioValida(inv)) throw new Error('Me negué a ejecutar el camino del dueño con una invocación de cliente.')
    return
  }
  throw new Error('Camino desconocido.')
}

export class ErrorCerebro extends Error {
  constructor(mensaje, tipo = 'otro') {
    super(mensaje)
    this.tipo = tipo
  }
}

const SIN_SESION = /not logged in|please run \/login|run `?claude`? (?:and )?\/?login|invalid api key|authentication[_ ]error|oauth token (?:has )?expired|credit balance is too low/i
const LIMITE = /usage limit|limit reached|rate[_ ]limit|too many requests|overloaded/i

export function tipoDeFalla(texto) {
  const t = String(texto || '')
  if (SIN_SESION.test(t)) return 'sin-sesion'
  if (LIMITE.test(t)) return 'limite'
  return 'otro'
}

// Lo que ve el dueño cuando Claude Code falla. En criollo y con el paso a seguir.
export function textoErrorCerebro(error) {
  const tipo = error?.tipo || ''
  if (tipo === 'timeout') return 'Tardé demasiado y lo corté. Si era algo largo, pedilo por partes, o para propuestas usá /propuesta (te la mando en PDF).'
  if (tipo === 'sin-claude') return 'No encuentro Claude Code en esta compu (el comando claude). Instalalo con  npm install -g @anthropic-ai/claude-code  y después corré  claude  una vez para iniciar sesión. Con  npm run revisar  te digo qué falta.'
  if (tipo === 'sin-sesion') return 'Claude Code no tiene la sesión iniciada. En la terminal corré  claude  y escribí /login. Después volvé a escribirme.'
  if (tipo === 'limite') return 'Claude llegó al límite de uso de tu plan por ahora. Probá de nuevo en un rato.'
  return 'Claude Code falló con este pedido. Probá de nuevo; si sigue, corré  npm run revisar  y mirá data/logs/asistente.log.'
}

export function extraerResultado(stdout) {
  const texto = String(stdout || '').trim()
  if (!texto) throw new Error('Claude Code no devolvió texto.')
  let json
  try {
    json = JSON.parse(texto)
  } catch {
    const inicio = texto.indexOf('\n{')
    if (inicio === -1) throw new Error('Claude Code no devolvió JSON.')
    json = JSON.parse(texto.slice(inicio + 1))
  }
  if (json.is_error) throw new ErrorCerebro('Claude Code marcó error.', tipoDeFalla(json.result))
  if (typeof json.result !== 'string' || !json.result.trim()) throw new Error('Claude Code no devolvió texto.')
  return json.result.trim()
}

export function comillaParaCmd(arg) {
  const texto = String(arg)
  if (texto === '') return '""'
  if (/[\s"&|<>^]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`
  return texto
}

export function armarLineaWindows(invocacion) {
  return [invocacion.comando, ...invocacion.args.map(comillaParaCmd)].join(' ')
}

function lanzar(invocacion, spawnFn) {
  const opts = { cwd: invocacion.cwd, env: invocacion.env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }
  if (process.platform === 'win32') {
    opts.windowsVerbatimArguments = true
    const linea = armarLineaWindows(invocacion)
    return spawnFn('cmd.exe', ['/d', '/s', '/c', `"${linea}"`], opts)
  }
  return spawnFn(invocacion.comando, invocacion.args, opts)
}

export async function ejecutarClaude(pedido, opciones = {}) {
  afirmarInvocacionSegura(pedido)
  const spawnFn = opciones.spawnFn || spawn
  const timeoutMs = opciones.timeoutMs || 120000
  const child = lanzar(pedido.invocacion, spawnFn)
  let stdout = ''
  let stderr = ''
  let terminado = false

  const resultado = new Promise((resolve, reject) => {
    const cerrar = (fn) => {
      if (terminado) return
      terminado = true
      clearTimeout(timer)
      fn()
    }
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      cerrar(() => reject(new ErrorCerebro(`Claude Code tardó más de ${Math.round(timeoutMs / 1000)} s.`, 'timeout')))
    }, timeoutMs)
    child.on('error', (error) => {
      const sinClaude = error?.code === 'ENOENT'
      const mensaje = sinClaude
        ? 'No encontré el comando claude. Instalá Claude Code e iniciá sesión.'
        : 'No pude iniciar Claude Code.'
      cerrar(() => reject(new ErrorCerebro(mensaje, sinClaude ? 'sin-claude' : 'otro')))
    })
    child.stdout?.on('data', (buf) => {
      stdout += buf.toString('utf8')
      if (stdout.length > 200000) {
        child.kill('SIGKILL')
        cerrar(() => reject(new Error('La respuesta de Claude Code vino demasiado larga.')))
      }
    })
    child.stderr?.on('data', (buf) => {
      stderr += buf.toString('utf8')
      if (stderr.length > 20000) stderr = stderr.slice(-20000)
    })
    child.on('close', (code) => {
      cerrar(() => {
        if (code !== 0) {
          opciones.onStderr?.(stderr)
          const tipo = tipoDeFalla(`${stdout}\n${stderr}`)
          reject(new ErrorCerebro(pedido.camino === 'cliente'
            ? 'Claude Code no pudo responder en el camino cliente.'
            : 'Claude Code no pudo responder en el camino del dueño.', tipo))
          return
        }
        try {
          resolve(extraerResultado(stdout).slice(0, pedido.camino === 'cliente' ? 3500 : 12000))
        } catch (error) {
          opciones.onStderr?.(stderr)
          if (error instanceof ErrorCerebro) reject(error)
          else reject(new ErrorCerebro('Claude Code contestó en un formato que no entiendo.', tipoDeFalla(`${stdout}\n${stderr}`)))
        }
      })
    })
  })

  child.stdin?.on('error', () => {})
  child.stdin?.end(pedido.prompt, 'utf8')
  return resultado
}

export function cuerpoAnthropic({ camino, model, prompt }) {
  return {
    model,
    max_tokens: 700,
    system: camino === 'cliente' ? SISTEMA_CLIENTE : SISTEMA_DUENIO,
    messages: [{ role: 'user', content: prompt }],
  }
}

export async function ejecutarAnthropic(pedido, config, fetchFn = fetch) {
  afirmarInvocacionSegura(pedido)
  const body = cuerpoAnthropic({ camino: pedido.camino, model: config.anthropicModel, prompt: pedido.prompt })
  if ('tools' in body) throw new Error('El modo API no lleva herramientas.')
  let respuesta
  try {
    respuesta = await fetchFn('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    })
  } catch {
    throw new Error('No pude hablar con la API de Anthropic.')
  }
  if (!respuesta.ok) throw new Error('Anthropic rechazó el pedido.')
  const data = await respuesta.json()
  const texto = data?.content?.find((parte) => parte.type === 'text')?.text || ''
  if (!texto.trim()) throw new Error('Anthropic no devolvió texto.')
  return texto.trim().slice(0, 3500)
}

export async function cerebroSimulacion(pedido) {
  afirmarInvocacionSegura(pedido)
  if (pedido.camino === 'duenio') {
    return 'Estoy en simulación, en el camino del dueño. No abrí Claude ni herramientas. Con CEREBRO=claude voy a poder usar lo que tengas conectado, solo cuando me escribe el dueño.'
  }
  if (esSensible(pedido.mensaje) || /mail|correo|archivo|bash|prompt/i.test(pedido.mensaje || '')) {
    return 'Eso se lo tengo que preguntar al dueño.'
  }
  return 'Hola. Estoy en simulación, sin modelo. Puedo practicar el circuito de aprobación. Con CEREBRO=claude uso el manual de verdad.'
}

export function crearCerebro(config, extras = {}) {
  const base = config.cerebro === 'simulacion'
    ? cerebroSimulacion
    : config.cerebro === 'anthropic'
      ? (pedido) => ejecutarAnthropic(pedido, config, extras.fetchFn)
      : (pedido) => ejecutarClaude(pedido, {
        ...extras,
        timeoutMs: extras.timeoutMs || 1000 * (pedido.camino === 'cliente'
          ? (config.timeoutClienteSeg || 120)
          : (config.timeoutDuenioSeg || 300)),
      })
  return async (pedido) => {
    const texto = await base(pedido)
    if (pedido.camino !== 'cliente') return limpiarTextoDuenio(texto)
    return filtrarSalidaCliente(texto, {
      reglas: pedido.reglas || '',
      emailDuenio: config.ownerEmail,
      telefonoDuenio: config.ownerWhatsapp,
    }).texto
  }
}
