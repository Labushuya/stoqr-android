import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import Tesseract from 'tesseract.js'
import { parseMhdText, type OcrResult } from '$lib/utils/mhd-parse'

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { imageData?: string }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { imageData } = body
  if (!imageData || typeof imageData !== 'string') {
    return json({ error: 'imageData is required' }, { status: 400 })
  }

  // Strip optional data-URL prefix (data:image/png;base64,...)
  const base64 = imageData.replace(/^data:image\/[a-z]+;base64,/i, '')

  let buffer: Buffer
  try {
    buffer = Buffer.from(base64, 'base64')
  } catch {
    return json({ error: 'Invalid base64 data' }, { status: 400 })
  }

  let rawText = ''

  try {
    const {
      data: { text },
    } = await Tesseract.recognize(buffer, 'deu+eng', { logger: () => {} })
    rawText = text ?? ''
  } catch {
    const fallback: OcrResult = { found: false, date: null, raw: '' }
    return json(fallback)
  }

  const result = parseMhdText(rawText)

  return json(result)
}
