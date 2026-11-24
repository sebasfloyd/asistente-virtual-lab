export function tomarCupo(mapa, clave, ahora, max, ventanaMs) {
  const previos = (mapa[clave] || []).filter((t) => ahora - t < ventanaMs)
  if (previos.length >= max) {
    mapa[clave] = previos
    return false
  }
  previos.push(ahora)
  mapa[clave] = previos
  return true
}
