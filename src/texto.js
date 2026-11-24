export function normalizar(valor) {
  return String(valor || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function tienePalabra(texto, palabra) {
  const frase = normalizar(palabra)
  if (!frase) return false
  const base = normalizar(texto)
  if (frase.includes(' ')) return base.includes(frase)
  return ` ${base} `.includes(` ${frase} `)
}

export function coincideRaiz(texto, raiz) {
  const r = normalizar(raiz)
  if (!r) return false
  return normalizar(texto)
    .split(' ')
    .some((palabra) => palabra === r || palabra === `${r}s` || palabra === `${r}es`)
}

export function partir(texto, max) {
  const limpio = String(texto || '')
  if (limpio.length <= max) return [limpio]
  const partes = []
  for (let i = 0; i < limpio.length; i += max) partes.push(limpio.slice(i, i + max))
  return partes
}

export function neutralizar(texto) {
  return String(texto || '')
    .replaceAll('\0', '')
    .replaceAll('---', '—')
    .replaceAll('MENSAJE_CLIENTE', 'mensaje')
    .replaceAll('FIN MANUAL', 'fin del manual')
}
