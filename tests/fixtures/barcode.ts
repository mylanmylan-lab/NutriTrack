// EAN-13 fixture rendered as luminance blocks, including quiet zones.
const left = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
const parity = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']
const right = left.map((bits) => [...bits].map((bit) => bit === '0' ? '1' : '0').join(''))
const alternate = right.map((bits) => [...bits].reverse().join(''))

export function ean13Modules(code: string) {
  const [first, ...digits] = [...code].map(Number)
  const beginning = digits.slice(0, 6).map((digit, index) =>
    parity[first!]![index] === 'L' ? left[digit] : alternate[digit],
  ).join('')
  const ending = digits.slice(6).map((digit) => right[digit]).join('')
  return `000000000000101${beginning}01010${ending}101000000000000`
}
