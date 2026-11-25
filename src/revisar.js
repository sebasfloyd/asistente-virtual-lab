// npm run revisar: chequea todo lo que suele fallar y dice qué hacer, sin mostrar secretos.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { leerConfig } from './config.js'
import { listarConectoresMcp } from './conectores.js'
import { procesoVivo } from './candado.js'
import { tokenValido } from './entorno.js'

const raiz = process.cwd()
const bien = (t) => console.log(`  ✓ ${t}`)
const mal = (t, paso) => console.log(`  ✗ ${t}${paso ? `\n      → ${paso}` : ''}`)
const ojo = (t) => console.log(`  • ${t}`)
let errores = 0
const falla = (t, paso) => { errores += 1; mal(t, paso) }

async function main() {
  console.log('Revisando el asistente...\n')
  const major = Number(process.versions.node.split('.')[0])
  if (major >= 22) bien(`Node ${process.versions.node}`)
  else falla(`Node ${process.versions.node} es viejo`, 'Instalá Node 22 o más nuevo desde https://nodejs.org')

  const claude = spawnSync('claude', ['--version'], { encoding: 'utf8', shell: process.platform === 'win32', timeout: 15000 })
  if (claude.status === 0) bien(`Claude Code en la terminal (${String(claude.stdout).trim()})`)
  else falla('No encuentro el comando claude en la terminal (la app de escritorio sola no alcanza)', 'npm install -g @anthropic-ai/claude-code  y después  claude  → /login')

  if (!fs.existsSync(path.join(raiz, '.env'))) {
    falla('No hay archivo .env', 'Corré  npm run setup  (te lo arma sin que pegues el token en ningún chat)')
  } else {
    bien('Archivo .env encontrado (es oculto: en Mac se ve con Cmd+Shift+punto)')
  }
  const config = leerConfig(process.env)
  if (!config.telegram && !config.whatsapp) ojo('No hay canales prendidos (TELEGRAM y WHATSAPP en false). Para practicar: npm run simulador')

  if (config.telegram) {
    if (!config.telegramToken) falla('TELEGRAM=true pero falta el token', 'npm run setup')
    else if (!tokenValido(config.telegramToken)) falla('El token no tiene forma de token de Telegram', 'npm run setup')
    else {
      try {
        const base = `https://api.telegram.org/bot${config.telegramToken}`
        const yo = await fetch(`${base}/getMe`, { signal: AbortSignal.timeout(15000) })
        if (yo.status === 401) falla('Telegram rechaza el token (¿lo revocaste?)', 'En @BotFather pedí uno nuevo y corré npm run setup')
        else {
          const data = await yo.json()
          bien(`Token OK: bot @${data?.result?.username || '?'}`)
          const up = await fetch(`${base}/getUpdates`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ timeout: 0, limit: 1, allowed_updates: ['message'] }),
            signal: AbortSignal.timeout(15000),
          })
          if (up.status === 409) ojo('Hay una copia del bot conectada ahora mismo con este token. Si no es la que querés, cerrala antes de otro npm start.')
        }
      } catch {
        ojo('No pude hablar con Telegram (¿sin internet?).')
      }
    }
    if (config.ownerTelegramId) bien('Dueño de Telegram configurado')
    else falla('Falta OWNER_TELEGRAM_ID (tu ID de dueño)', 'npm run setup  te lo toma solo cuando le mandás /start al bot')
  }

  if (config.whatsapp && config.whatsappModo === 'api') {
    const api = config.whatsappApi
    if (!api.activo) falla('WHATSAPP_MODO=api pero faltan WHATSAPP_API_TOKEN o WHATSAPP_API_PHONE_ID', 'npm run setup')
    else {
      try {
        const { crearClienteApi } = await import('./canales/whatsapp-api.js')
        const info = await crearClienteApi(api).info()
        bien(`WhatsApp API oficial OK: ${info.display_phone_number || '?'}${info.verified_name ? ` (${info.verified_name})` : ''}`)
      } catch (e) {
        falla(`WhatsApp API: ${e.message}`, 'Revisá el token y el phone number id en Meta, y corré npm run setup')
      }
    }
    if (!api.verifyToken) falla('Falta WHATSAPP_API_VERIFY_TOKEN (la clave que Meta usa para verificar tu webhook)', 'npm run setup  te genera una')
    if (!api.appSecret) ojo('Sin WHATSAPP_API_APP_SECRET no puedo comprobar que los mensajes vengan de Meta. Recomendado.')
    ojo(`El webhook escucha en http://localhost:${api.puerto}/webhook. Meta necesita una URL https pública: cloudflared tunnel --url http://localhost:${api.puerto}`)
    if (!config.ownerWhatsapp) falla('Falta OWNER_WHATSAPP (tu número, con código de país)', 'npm run setup')
  } else if (config.whatsapp) {
    const tiene = fs.existsSync(path.join(raiz, 'node_modules', '@whiskeysockets', 'baileys'))
    if (tiene) bien('WhatsApp por QR instalado')
    else falla('WHATSAPP=true pero falta instalarlo', 'npm install @whiskeysockets/baileys@6.7.24 qrcode-terminal pino@9')
    ojo('WhatsApp por QR no es oficial: usá un chip aparte, Meta puede bloquear el número.')
    if (!config.ownerWhatsapp) falla('Falta OWNER_WHATSAPP (tu número, con código de país)', 'Completalo en .env')
  }
  if (config.whatsapp && !config.whatsappClientes) ojo('WhatsApp solo te va a atender a vos. Para clientes: WHATSAPP_CLIENTES=5491111111111,5491122222222 (o todos)')

  const pidRuta = path.resolve(raiz, config.dirDatos, 'asistente.pid')
  const pid = fs.existsSync(pidRuta) ? Number(fs.readFileSync(pidRuta, 'utf8').trim()) : 0
  if (pid && procesoVivo(pid)) ojo(`El asistente ya está corriendo desde esta carpeta (proceso ${pid}). No abras otro npm start.`)

  if (config.mail.activo) bien(`Mail propio configurado (${config.mail.usuario})${config.mail.copia ? `, con copia a ${config.mail.copia}` : ''}`)
  else ojo('Mail propio sin configurar: los mails que pidas quedan como borrador en tu Gmail (si está conectado). Para que salgan solos: MAIL_USUARIO y MAIL_CLAVE_APP.')

  if (config.cerebro === 'claude' && claude.status === 0) {
    const conectores = listarConectoresMcp()
    if (conectores.length) bien(`Conectores de Claude: ${conectores.join(', ')}`)
    else ojo('No veo conectores (Gmail, Calendar, Drive). Se conectan en https://claude.ai/customize/connectors')
  }

  if (process.argv.includes('--probar') && claude.status === 0) {
    const r = spawnSync('claude', ['-p', '--output-format', 'json', '--no-session-persistence', '--max-turns', '1'], {
      input: 'Respondé solo: ok', encoding: 'utf8', shell: process.platform === 'win32', timeout: 90000,
    })
    if (r.status === 0 && /"is_error"\s*:\s*false/.test(r.stdout)) bien('Claude Code responde con tu sesión')
    else falla('Claude Code no respondió', 'Corré  claude  en la terminal y escribí /login')
  }

  console.log(errores ? `\nHay ${errores} cosa(s) para arreglar. Si te trabás, pasale esta salida a Claude.` : '\nTodo en orden. npm start para arrancar.')
}

main()
