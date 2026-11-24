/** GTIN-8, GTIN-12, GTIN-13 a GTIN-14 majú rovnaký kontrolný súčet. */
export function validGtin(input: string) {
  const code = input.trim()
  if (!/^(?:\d{8}|\d{12,14})$/.test(code) || /^0+$/.test(code)) return undefined
  let sum = 0
  for (let index = code.length - 2, factor = 3; index >= 0; index -= 1, factor = 4 - factor) {
    sum += Number(code[index]) * factor
  }
  return (10 - sum % 10) % 10 === Number(code.at(-1)) ? code : undefined
}

export function equivalentGtin(first: string | undefined, second: string) {
  if (!first) return false
  return first.padStart(14, '0') === second.padStart(14, '0')
}

export function offBarcode(code: string) {
  return code.length === 12 ? `0${code}` : code
}

export function expandUpcE(code: string) {
  if (!/^[01]\d{7}$/.test(code)) return undefined
  const [system, a, b, c, d, e, f, checksum] = code
  const expanded = f === '0' || f === '1' || f === '2' ? `${a}${b}${f}0000${c}${d}${e}`
    : f === '3' ? `${a}${b}${c}00000${d}${e}`
    : f === '4' ? `${a}${b}${c}${d}00000${e}`
    : `${a}${b}${c}${d}${e}0000${f}`
  return validGtin(`${system}${expanded}${checksum}`)
}
