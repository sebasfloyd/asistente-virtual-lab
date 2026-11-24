import { spawnSync } from 'node:child_process'

// Patrones a nivel servidor. En Claude Code 2.1, mcp__* no preaprueba
// los conectores de claude.ai; sí lo hacen mcp__claude_ai_Gmail y
// mcp__claude_ai_Google_Calendar (y la forma con __*).
export const SERVIDORES_LECTURA = [
  'mcp__claude_ai_Gmail',
  'mcp__claude_ai_Gmail__*',
  'mcp__claude_ai_Google_Calendar',
  'mcp__claude_ai_Google_Calendar__*',
  'mcp__claude_ai_Google_Drive',
  'mcp__claude_ai_Google_Drive__*',
]

export const LECTURA_GMAIL = [
  'mcp__claude_ai_Gmail__search_threads',
  'mcp__claude_ai_Gmail__get_message',
  'mcp__claude_ai_Gmail__get_thread',
  'mcp__claude_ai_Gmail__list_drafts',
  'mcp__claude_ai_Gmail__list_filters',
  'mcp__claude_ai_Gmail__list_labels',
  'mcp__claude_ai_Gmail__get_draft',
]

export const LECTURA_CALENDAR = [
  'mcp__claude_ai_Google_Calendar__list_events',
  'mcp__claude_ai_Google_Calendar__get_event',
  'mcp__claude_ai_Google_Calendar__list_calendars',
  'mcp__claude_ai_Google_Calendar__find_events',
  'mcp__claude_ai_Google_Calendar__search_events',
  'mcp__claude_ai_Google_Calendar__get_events',
  'mcp__claude_ai_Google_Calendar__freebusy',
  'mcp__claude_ai_Google_Calendar__suggest_time',
]

export const LECTURA_DRIVE = [
  'mcp__claude_ai_Google_Drive__search_files',
  'mcp__claude_ai_Google_Drive__read_file_content',
  'mcp__claude_ai_Google_Drive__download_file_content',
  'mcp__claude_ai_Google_Drive__get_file_metadata',
  'mcp__claude_ai_Google_Drive__get_file_permissions',
  'mcp__claude_ai_Google_Drive__get_shared_drive_metadata',
  'mcp__claude_ai_Google_Drive__list_file_revisions',
  'mcp__claude_ai_Google_Drive__list_recent_files',
  'mcp__claude_ai_Google_Drive__list_shared_drives',
]

export const ESCRITURA_GMAIL = [
  'mcp__claude_ai_Gmail__send_message',
  'mcp__claude_ai_Gmail__create_draft',
  'mcp__claude_ai_Gmail__update_draft',
  'mcp__claude_ai_Gmail__reply',
  'mcp__claude_ai_Gmail__forward',
  'mcp__claude_ai_Gmail__trash_message',
  'mcp__claude_ai_Gmail__trash_thread',
  'mcp__claude_ai_Gmail__create_label',
  'mcp__claude_ai_Gmail__delete_label',
  'mcp__claude_ai_Gmail__create_filter',
  'mcp__claude_ai_Gmail__label_message',
  'mcp__claude_ai_Gmail__label_thread',
  'mcp__claude_ai_Gmail__unlabel_message',
  'mcp__claude_ai_Gmail__unlabel_thread',
  'mcp__claude_ai_Gmail__mark_message_spam',
  'mcp__claude_ai_Gmail__mark_thread_spam',
  'mcp__claude_ai_Gmail__apply_sensitive_message_label',
  'mcp__claude_ai_Gmail__apply_sensitive_thread_label',
  'mcp__claude_ai_Gmail__delete_draft',
  'mcp__claude_ai_Gmail__update_label',
  'mcp__claude_ai_Gmail__update_message_labels',
  'mcp__claude_ai_Gmail__untrash_message',
  'mcp__claude_ai_Gmail__untrash_thread',
  'mcp__claude_ai_Gmail__unmark_message_spam',
  'mcp__claude_ai_Gmail__unmark_thread_spam',
]

export const ESCRITURA_CALENDAR = [
  'mcp__claude_ai_Google_Calendar__create_event',
  'mcp__claude_ai_Google_Calendar__update_event',
  'mcp__claude_ai_Google_Calendar__delete_event',
  'mcp__claude_ai_Google_Calendar__insert_event',
  'mcp__claude_ai_Google_Calendar__move_event',
  'mcp__claude_ai_Google_Calendar__respond_to_event',
]

export const GLOBS_DENEGAR_ESCRITURA = [
  'mcp__*send*',
  'mcp__*create*',
  'mcp__*delete*',
  'mcp__*update*',
  'mcp__*reply*',
  'mcp__*forward*',
  'mcp__*trash*',
  'mcp__*respond*',
  'mcp__*share*',
  'mcp__*copy*',
  'mcp__*comment*',
  'mcp__*request_access*',
]

const WRITE_RE = /(?:send_message|send_email|send_event|create_draft|update_draft|delete_draft|create_event|update_event|delete_event|insert_event|move_event|respond_to_event|create_label|delete_label|update_label|update_message_labels|create_filter|label_message|label_thread|unlabel_|trash_|untrash_|mark_.*spam|unmark_.*spam|apply_sensitive|reply|forward|compose|share_file|copy_file|trash_file|create_file|update_file|create_shared_drive|update_shared_drive|add_comment|resolve_comment|request_access)/i

export const TEXTO_CONECTOR_FALTANTE = [
  'No pude leer el mail, el calendario ni Drive en esta corrida.',
  'Para conectarlos, en tu compu abrí https://claude.ai/customize/connectors, conectá Gmail, Google Calendar y Google Drive (con la misma cuenta de Claude), y en la terminal corré `claude mcp list` para verlos.',
  'Después cerrá el asistente y volvé a abrirlo con npm start.',
].join(' ')

export const TEXTO_DRIVE_FALTANTE = [
  'No pude buscar en Google Drive.',
  'Para conectarlo, en tu compu abrí https://claude.ai/customize/connectors, conectá Google Drive con la misma cuenta de Claude, y en la terminal corré `claude mcp list`.',
  'Después cerrá el asistente y volvé a abrirlo con npm start.',
].join(' ')

const PERMISO_TECNICO = /permisos? de Claude Code|configuración de permisos|sistema bloque[oó]|blocked the permission|permission[- ]mode|allowedTools|disallowedTools|bypassPermissions|dontAsk|modo que no pide permisos|no est[aá] preaprobado|fue denegada porque|--allowedTools|herramientas? MCP|MCP server|tool permission|autorizar el acceso/i

export function esHerramientaEscritura(nombre) {
  const n = String(nombre || '')
  const corto = n.includes('__') ? n.slice(n.lastIndexOf('__') + 2) : n
  return WRITE_RE.test(n) || WRITE_RE.test(corto)
}

export function nombreMcp(servidor, herramienta) {
  const servidorNorm = String(servidor || '')
    .replace(/^claude\.ai\s+/i, '')
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
  return `mcp__claude_ai_${servidorNorm}__${herramienta}`
}

export function parsearMcpList(stdout) {
  const texto = String(stdout || '')
  const servidores = []
  for (const linea of texto.split(/\r?\n/)) {
    const recorte = linea.trim()
    if (!recorte || /^no mcp servers/i.test(recorte) || /^checking /i.test(recorte)) continue
    const m = recorte.match(/^(?:[-*]\s*)?(?:claude\.ai\s+)?(.+?)(?:\s*[:—-]\s+|\s+\(|\s+✓|\s+✔|\s+-)/i)
      || recorte.match(/^(?:[-*]\s*)?(Gmail|Google Calendar|Google_Calendar|Google Drive|Google_Drive)\b/i)
    if (m) servidores.push(m[1].replace(/^claude\.ai\s+/i, '').trim())
  }
  return [...new Set(servidores.filter(Boolean))]
}

export function herramientasLectura(servidores = []) {
  const nombres = new Set(SERVIDORES_LECTURA)
  for (const servidor of servidores) {
    const bajo = String(servidor || '').toLowerCase()
    if (/gmail/.test(bajo)) {
      nombres.add('mcp__claude_ai_Gmail')
      nombres.add('mcp__claude_ai_Gmail__*')
    }
    if (/calendar|calendario/.test(bajo)) {
      nombres.add('mcp__claude_ai_Google_Calendar')
      nombres.add('mcp__claude_ai_Google_Calendar__*')
    }
    if (/drive/.test(bajo)) {
      nombres.add('mcp__claude_ai_Google_Drive')
      nombres.add('mcp__claude_ai_Google_Drive__*')
    }
  }
  return [...nombres]
}

// Para mandar un mail alcanza con enviar o dejar un borrador. Nada de borrar ni etiquetar.
export const ESCRITURA_MAIL_ACCION = [
  'mcp__claude_ai_Gmail__send_message',
  'mcp__claude_ai_Gmail__create_draft',
]

export const DENEGAR_EN_ACCION_MAIL = [
  'mcp__*trash*',
  'mcp__*delete*',
  'mcp__*spam*',
  'mcp__*label*',
  'mcp__*filter*',
  'mcp__*forward*',
  'mcp__*Calendar*',
  'mcp__*Drive*',
]

export function herramientasEscritura(tipo) {
  if (tipo === 'mail' || tipo === 'propuesta-mail') return [...ESCRITURA_MAIL_ACCION]
  if (tipo === 'agenda-crear' || tipo === 'agenda-mover' || tipo === 'agenda-invitar') return [...ESCRITURA_CALENDAR]
  return [...ESCRITURA_GMAIL, ...ESCRITURA_CALENDAR]
}

export function parecePedidoDrive(texto) {
  const n = String(texto || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  return /\b(google drive|\bdrive\b|buscar en (mis |el )?archivos|carpeta de drive)\b/.test(n) || /buscar .*en drive|en (mi )?drive/.test(n)
}

export function driveConectado(servidores = []) {
  return (servidores || []).some((s) => /drive/i.test(String(s || '')))
}

export function listarConectoresMcp({ spawnSyncFn = spawnSync, comando = 'claude', timeoutMs = 8000, env = process.env } = {}) {
  try {
    const r = spawnSyncFn(comando, ['mcp', 'list'], { encoding: 'utf8', timeout: timeoutMs, env })
    if (r.error || r.status) return []
    return parsearMcpList(`${r.stdout || ''}\n${r.stderr || ''}`)
  } catch {
    return []
  }
}

export function pareceErrorPermiso(texto) {
  return PERMISO_TECNICO.test(String(texto || ''))
}

export function limpiarTextoDuenio(texto) {
  const t = String(texto || '').trim()
  if (!t) return t
  if (pareceErrorPermiso(t)) return TEXTO_CONECTOR_FALTANTE
  return t
}
