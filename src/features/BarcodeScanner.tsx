import { useEffect, useRef, useState } from 'react'
import { ActionError } from './shared'

type Capture = { stream?: MediaStream; interval?: number }

function cameraMessage(error: unknown) {
  const name = error && typeof error === 'object' && 'name' in error ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Prístup ku kamere bol zamietnutý. Skontrolujte povolenia alebo zadajte kód ručne.'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Vhodná kamera sa nenašla. Zadajte kód ručne.'
  if (name === 'NotReadableError' || name === 'AbortError') return 'Kamera je zaneprázdnená alebo nedostupná. Zadajte kód ručne.'
  return 'Skenovanie sa nepodarilo spustiť. Zadajte kód ručne.'
}

function release(capture: Capture | undefined, video: HTMLVideoElement | null) {
  if (!capture) return
  window.clearInterval(capture.interval)
  capture.stream?.getTracks().forEach((track) => track.stop())
  if (video) video.srcObject = null
}

export function BarcodeScanner({ onCode, disabled }: { onCode: (code: string) => void; disabled: boolean }) {
  const video = useRef<HTMLVideoElement>(null)
  const active = useRef<Capture | undefined>(undefined)
  const [state, setState] = useState<'idle' | 'starting' | 'scanning'>('idle')
  const [error, setError] = useState('')

  function stop() {
    release(active.current, video.current)
    active.current = undefined
    setState('idle')
  }

  useEffect(() => {
    const stopHidden = () => { if (document.hidden) stop() }
    document.addEventListener('visibilitychange', stopHidden)
    return () => {
      document.removeEventListener('visibilitychange', stopHidden)
      release(active.current, video.current)
      active.current = undefined
    }
  }, [])

  useEffect(() => {
    if (disabled && active.current) stop()
  }, [disabled])

  async function start() {
    if (active.current) return
    setError('')
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError('Kamera vyžaduje HTTPS a podporovaný prehliadač. Zadajte kód ručne.')
      return
    }
    const capture: Capture = {}
    const preview = video.current!
    active.current = capture
    setState('starting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } })
      capture.stream = stream
      if (active.current !== capture) {
        release(capture, null)
        return
      }
      const { createBarcodeDecoder } = await import('../data/barcodeDecoder')
      if (active.current !== capture) return
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) throw new Error('Canvas unavailable')
      const decode = createBarcodeDecoder()
      preview.srcObject = stream
      await preview.play()
      if (active.current !== capture) return
      setState('scanning')
      for (const track of stream.getVideoTracks()) track.addEventListener('ended', () => {
        if (active.current !== capture) return
        stop()
        setError('Prístup ku kamere sa prerušil. Zadajte kód ručne.')
      }, { once: true })
      capture.interval = window.setInterval(() => {
        if (preview.readyState < 2 || !preview.videoWidth) return
        const scale = Math.min(1, 960 / Math.max(preview.videoWidth, preview.videoHeight))
        const width = Math.round(preview.videoWidth * scale)
        const height = Math.round(preview.videoHeight * scale)
        if (canvas.width !== width) canvas.width = width
        if (canvas.height !== height) canvas.height = height
        try {
          context.drawImage(preview, 0, 0, width, height)
          const code = decode(context.getImageData(0, 0, width, height))
          if (code) {
            stop()
            onCode(code)
          }
        } catch {
          stop()
          setError('Náhľad kamery nie je dostupný. Zadajte kód ručne.')
        }
      }, 220)
    } catch (reason) {
      if (active.current !== capture) return
      stop()
      setError(cameraMessage(reason))
    }
  }

  return (
    <div className="form-stack">
      {state === 'idle'
        ? <button type="button" className="button secondary" disabled={disabled} onClick={() => void start()}>Spustiť kameru</button>
        : <button type="button" className="button secondary" onClick={stop}>Zatvoriť skener</button>}
      <video ref={video} muted playsInline autoPlay aria-label="Náhľad kamery" hidden={state === 'idle'} className="scanner-preview" />
      {state === 'starting' && <p role="status">Otváram kameru…</p>}
      {state === 'scanning' && <p role="status">Zarovnajte čiarový kód do stredu náhľadu.</p>}
      <ActionError message={error} />
    </div>
  )
}
