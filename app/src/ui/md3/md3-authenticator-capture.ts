import {
  decodeQrFromRgba,
  QrDecodeFailure,
  QrDecodeResult,
} from '../../lib/authenticator/qr-decode'

/**
 * Getting pixels in front of the QR decoder — from a file, from the clipboard,
 * and from a camera.
 *
 * Every route here is local. There is no upload, no remote decoder and no
 * network call of any kind: an image picked here is turned into an
 * `ImageData`-shaped byte array in this process and handed to the decoder in
 * the same tick. The camera route asks the platform for a device and stops it
 * the moment scanning ends, so nothing keeps a capture stream alive behind a
 * closed dialog.
 */

/** The longest edge a captured frame is scaled to before decoding. */
export const MaximumCaptureEdge = 1600

/** How often the camera route samples a frame, in milliseconds. */
export const CameraSampleIntervalMs = 200

/** The result of a capture attempt: pixels decoded, or a named reason. */
export type Md3CaptureResult =
  | { readonly ok: true; readonly text: string }
  | {
      readonly ok: false
      readonly reason: QrDecodeFailure | 'no-image' | 'unreadable-file'
    }

/**
 * Draw a bitmap onto a canvas and return its RGBA bytes.
 *
 * Large images are scaled down first: decoding is linear in pixel count, and a
 * twelve-megapixel phone screenshot carries no more QR detail than a bounded
 * copy of itself.
 */
function pixelsFromBitmap(bitmap: ImageBitmap): ImageData | null {
  const scale = Math.min(
    1,
    MaximumCaptureEdge / Math.max(bitmap.width, bitmap.height)
  )
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (context === null) {
    return null
  }
  context.drawImage(bitmap, 0, 0, width, height)
  return context.getImageData(0, 0, width, height)
}

function decodeImageData(pixels: ImageData | null): Md3CaptureResult {
  if (pixels === null) {
    return { ok: false, reason: 'no-image' }
  }
  const result: QrDecodeResult = decodeQrFromRgba(
    pixels.width,
    pixels.height,
    pixels.data
  )
  return result.ok
    ? { ok: true, text: result.text }
    : { ok: false, reason: result.reason }
}

/** Decode a QR out of an image file or blob. */
export async function decodeQrFromBlob(blob: Blob): Promise<Md3CaptureResult> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(blob)
  } catch {
    return { ok: false, reason: 'unreadable-file' }
  }

  try {
    return decodeImageData(pixelsFromBitmap(bitmap))
  } finally {
    bitmap.close()
  }
}

/**
 * Read a QR from whatever the clipboard holds.
 *
 * An image is decoded; failing that, plain text is returned verbatim so a
 * copied `otpauth://` URI still works. The caller parses the text, because
 * only it knows what a valid payload looks like.
 */
export async function readQrFromClipboard(): Promise<Md3CaptureResult> {
  const clipboard = navigator.clipboard
  if (clipboard === undefined) {
    return { ok: false, reason: 'no-image' }
  }

  if (typeof clipboard.read === 'function') {
    try {
      for (const item of await clipboard.read()) {
        const imageType = item.types.find(type => type.startsWith('image/'))
        if (imageType === undefined) {
          continue
        }
        const result = await decodeQrFromBlob(await item.getType(imageType))
        if (result.ok) {
          return result
        }
      }
    } catch {
      // Fall through to text: a clipboard that refuses image reads is a
      // permission state, not a reason to give up on a pasted URI.
    }
  }

  if (typeof clipboard.readText === 'function') {
    try {
      const text = await clipboard.readText()
      if (text.trim().length > 0) {
        return { ok: true, text: text.trim() }
      }
    } catch {
      return { ok: false, reason: 'no-image' }
    }
  }

  return { ok: false, reason: 'no-image' }
}

/** Whether this machine exposes a camera the scan route could use. */
export async function hasCameraDevice(): Promise<boolean> {
  const devices = navigator.mediaDevices
  if (devices === undefined || typeof devices.enumerateDevices !== 'function') {
    return false
  }
  try {
    const found = await devices.enumerateDevices()
    return found.some(device => device.kind === 'videoinput')
  } catch {
    return false
  }
}

/** A running camera scan. Call {@linkcode IMd3CameraScan.stop} to end it. */
export interface IMd3CameraScan {
  readonly stop: () => void
}

/**
 * Open a camera, sample frames, and report the first decoded payload.
 *
 * The video element is supplied by the caller so the frames are visible while
 * scanning — a scanner with nothing on screen gives the user no way to aim.
 * The stream's tracks are stopped on the first success and on `stop()`, so the
 * platform's own recording indicator goes out when the dialog closes.
 */
export async function startCameraScan(
  video: HTMLVideoElement,
  onDecoded: (text: string) => void,
  onFailed: (reason: 'no-camera' | 'refused') => void
): Promise<IMd3CameraScan> {
  const devices = navigator.mediaDevices
  if (devices === undefined || typeof devices.getUserMedia !== 'function') {
    onFailed('no-camera')
    return { stop: () => {} }
  }

  let stream: MediaStream
  try {
    stream = await devices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    })
  } catch {
    onFailed('refused')
    return { stop: () => {} }
  }

  let timer: ReturnType<typeof setInterval> | null = null
  const stop = () => {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
    for (const track of stream.getTracks()) {
      track.stop()
    }
    video.srcObject = null
  }

  video.srcObject = stream
  video.muted = true
  try {
    await video.play()
  } catch {
    // Autoplay refusal only means the first frame waits for a user gesture;
    // sampling still works once it starts.
  }

  const canvas = document.createElement('canvas')
  timer = setInterval(() => {
    const width = video.videoWidth
    const height = video.videoHeight
    if (width === 0 || height === 0) {
      return
    }
    const scale = Math.min(1, MaximumCaptureEdge / Math.max(width, height))
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (context === null) {
      return
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
    const result = decodeQrFromRgba(pixels.width, pixels.height, pixels.data)
    if (result.ok) {
      stop()
      onDecoded(result.text)
    }
  }, CameraSampleIntervalMs)

  return { stop }
}
