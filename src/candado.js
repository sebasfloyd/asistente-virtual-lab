// Una sola copia del asistente por carpeta. Dos copias con el mismo token de Telegram
// se pisan (error 409) y el bot deja de contestar.
import fs from 'node:fs'
import path from 'node:path'

export function procesoVivo(pid, kill = process.kill.bind(process)) {
  const n = Number(pid)
  if (!Number.isInteger(n) || n <= 0) return false
  try {
    kill(n, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

export function tomarCandado(ruta, { pid = process.pid, vivo = procesoVivo } = {}) {
  fs.mkdirSync(path.dirname(ruta), { recursive: true })
  try {
    const previo = Number(String(fs.readFileSync(ruta, 'utf8')).trim())
    if (previo && previo !== pid && vivo(previo)) return { ok: false, pid: previo }
  } catch {}
  fs.writeFileSync(ruta, `${pid}\n`, { mode: 0o600 })
  return { ok: true, pid }
}

export function soltarCandado(ruta, { pid = process.pid } = {}) {
  try {
    const actual = Number(String(fs.readFileSync(ruta, 'utf8')).trim())
    if (actual === pid) fs.rmSync(ruta, { force: true })
  } catch {}
}

export function textoOtraCopia(pid) {
  return [
    `Ya hay un asistente corriendo desde esta carpeta (proceso ${pid}).`,
    'Dos copias con el mismo bot se pisan y Telegram deja de contestar.',
    'Si lo querés reiniciar: andá a la terminal donde corre y apretá Ctrl-C,',
    `o cerralo con:  kill ${pid}   (o  pkill -f "src/index.js"  para cerrar todas).`,
    'Después volvé a correr npm start.',
  ].join('\n')
}
