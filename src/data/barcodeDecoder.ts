import { BarcodeFormat, BinaryBitmap, DecodeHintType, HybridBinarizer, MultiFormatOneDReader, RGBLuminanceSource } from '@zxing/library'
import { expandUpcE, validGtin } from './gtin'

const formats = [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.ITF]

export function createBarcodeDecoder() {
  const hints = new Map<DecodeHintType, unknown>([
    [DecodeHintType.POSSIBLE_FORMATS, formats],
    [DecodeHintType.TRY_HARDER, true],
    [DecodeHintType.ALLOWED_LENGTHS, [14]],
  ])
  const reader = new MultiFormatOneDReader(hints)
  return (frame: ImageData) => {
    const luminance = new Uint8ClampedArray(frame.width * frame.height)
    for (let pixel = 0, index = 0; pixel < luminance.length; pixel += 1, index += 4) {
      luminance[pixel] = (frame.data[index]! + 2 * frame.data[index + 1]! + frame.data[index + 2]!) / 4
    }
    const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminance, frame.width, frame.height)))
    try {
      const result = reader.decode(bitmap, hints)
      return result.getBarcodeFormat() === BarcodeFormat.UPC_E ? expandUpcE(result.getText()) : validGtin(result.getText())
    } catch {
      // Snímky bez čitateľného kódu sú pri živom náhľade bežné.
      return undefined
    }
  }
}
