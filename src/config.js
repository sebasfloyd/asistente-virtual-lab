const CODIGOS_EJEMPLO = new Set(['', 'cambiá-este-código', 'cambia-este-codigo', 'cambia-esto', 'cambiá-esto'])

export function esVerdadero(valor) {
  return ['1', 'true', 'si', 'sí', 'yes', 'on'].includes(String(valor || '').trim().toLowerCase())
}

function entero(valor, defecto, min, max) {
  const n = Number.parseInt(valor, 10)
  if (!Number.isFinite(n)) return defecto
  return Math.min(max, Math.max(min, n))
}

export function esCodigoEjemplo(codigo) {
  return CODIGOS_EJEMPLO.has(String(codigo || '').trim())
}

export function leerConfig(env = process.env) {
  const cerebro = ['claude', 'anthropic', 'simulacion'].includes(env.CEREBRO) ? env.CEREBRO : 'claude'
  return {
    telegram: esVerdadero(env.TELEGRAM),
    whatsapp: esVerdadero(env.WHATSAPP),
    telegramToken: String(env.TELEGRAM_TOKEN || '').trim(),
    ownerTelegramId: String(env.OWNER_TELEGRAM_ID || '').trim(),
    ownerWhatsapp: String(env.OWNER_WHATSAPP || '').replace(/\D/g, ''),
    ownerEmail: String(env.OWNER_EMAIL || '').trim(),
    whatsappClientes: String(env.WHATSAPP_CLIENTES || '').trim(),
    codigoDuenio: String(env.CODIGO_DUENIO || ''),
    modo: env.MODO === 'auto' ? 'auto' : 'aprobar',
    cerebro,
    anthropicKey: String(env.ANTHROPIC_API_KEY || '').trim(),
    anthropicModel: String(env.ANTHROPIC_MODEL || 'claude-sonnet-4-5').trim(),
    huecosLibres: esVerdadero(env.HUECOS_LIBRES),
    zona: String(env.ZONA_HORARIA || 'America/Argentina/Buenos_Aires').trim(),
    jornadaDesde: /^\d{2}:\d{2}$/.test(env.JORNADA_DESDE || '') ? env.JORNADA_DESDE : '09:00',
    jornadaHasta: /^\d{2}:\d{2}$/.test(env.JORNADA_HASTA || '') ? env.JORNADA_HASTA : '18:00',
    duracionMin: entero(env.DURACION_TURNO_MIN, 60, 15, 240),
    limiteMensajes: entero(env.LIMITE_MENSAJES, 8, 1, 100),
    limiteVentanaSeg: entero(env.LIMITE_VENTANA_SEG, 60, 10, 3600),
    dirDatos: String(env.DIR_DATOS || 'data').trim() || 'data',
    reglasPath: String(env.REGLAS_PATH || 'reglas.md').trim() || 'reglas.md',
    duenioSimulador: '',
    ownerConectores: env.OWNER_CONECTORES == null || String(env.OWNER_CONECTORES).trim() === ''
      ? true
      : esVerdadero(env.OWNER_CONECTORES),
    ownerEscritura: esVerdadero(env.OWNER_ESCRITURA),
    menteCmd: comandoMente(env.MENTE_CMD),
    nombre: String(env.ASISTENTE_NOMBRE || '').trim().slice(0, 40),
    memoriaPath: String(env.MEMORIA_PATH || 'memoria.md').trim() || 'memoria.md',
    resumenHora: horaResumen(env.RESUMEN_HORA),
    estiloPath: String(env.ESTILO_PATH || 'estilo.md').trim() || 'estilo.md',
    partirMensajes: env.PARTIR_MENSAJES == null || String(env.PARTIR_MENSAJES).trim() === ''
      ? true
      : esVerdadero(env.PARTIR_MENSAJES),
    pausaEntreMensajesMs: entero(env.PAUSA_ENTRE_MENSAJES_MS, 700, 0, 8000),
    debounceMensajesMs: entero(env.DEBOUNCE_MENSAJES_MS, 2500, 0, 15000),
    agendaAuto: esVerdadero(env.AGENDA_AUTO),
    // Segundos que se espera a Claude Code. El dueño pide cosas largas (propuestas, resúmenes).
    timeoutDuenioSeg: entero(env.TIMEOUT_DUENIO_SEG, 300, 30, 1200),
    timeoutClienteSeg: entero(env.TIMEOUT_CLIENTE_SEG, 120, 20, 600),
    // Mail propio del asistente por SMTP (por ejemplo Gmail con contraseña de aplicación).
    mail: leerMail(env),
  }
}

function leerMail(env) {
  const usuario = String(env.MAIL_USUARIO || '').trim()
  const clave = String(env.MAIL_CLAVE_APP || '').replace(/\s+/g, '')
  const servidor = String(env.MAIL_SMTP || 'smtp.gmail.com:465').trim()
  const [host, puerto] = servidor.split(':')
  const copia = String(env.MAIL_COPIA || '').trim()
  return {
    activo: Boolean(usuario && clave && host),
    usuario,
    clave,
    host: host || 'smtp.gmail.com',
    puerto: entero(puerto, 465, 1, 65535),
    nombre: String(env.MAIL_NOMBRE || env.ASISTENTE_NOMBRE || '').trim().slice(0, 60),
    copia: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(copia) ? copia : '',
  }
}

function horaResumen(valor) {
  const m = String(valor || '').trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return ''
  const hora = Number(m[1])
  const minuto = Number(m[2])
  if (hora > 23 || minuto > 59) return ''
  return `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`
}

function comandoMente(valor) {
  const texto = String(valor || '').trim()
  if (!texto || /[\s;&|`$<>\n"'\\]/.test(texto)) return ''
  return texto
}

export function secretosDe(config) {
  return [config.telegramToken, config.codigoDuenio, config.anthropicKey, config.ownerEmail, config.ownerWhatsapp, config.mail?.clave]
    .filter((s) => typeof s === 'string' && s.length >= 6)
}

export function revisarConfig(config) {
  const problemas = []
  if (config.telegram && !config.telegramToken) problemas.push('TELEGRAM=true pero falta TELEGRAM_TOKEN en .env.')
  if (config.cerebro === 'anthropic' && !config.anthropicKey) problemas.push('CEREBRO=anthropic pero falta ANTHROPIC_API_KEY.')
  if (!config.telegram && !config.whatsapp) {
    problemas.push('No hay canales activos. Para practicar: npm run simulador. Para salir en serio, poné TELEGRAM=true o WHATSAPP=true.')
  }
  return problemas
}
