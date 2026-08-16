#!/usr/bin/env node
// Karaoke Propio — pitch-worker
//
// Stateless FFmpeg/rubberband transcoding service. Runs in its own container
// (Debian bookworm + ffmpeg + rubberband-cli) because the karaoke-eternal
// image is Alpine-based and Alpine's ffmpeg build lacks the rubberband
// filter. Never exposed publicly — internal Docker network only.
//
// No third-party dependencies on purpose: only Node built-ins, so the image
// needs nothing beyond `apt-get install ffmpeg rubberband-cli`.
'use strict'

const http = require('node:http')
const path = require('node:path')
const fs = require('node:fs')
const fsPromises = require('node:fs/promises')
const { execFile } = require('node:child_process')

const PORT = parseInt(process.env.PORT, 10) || 4000
const FFMPEG_TIMEOUT_MS = parseInt(process.env.PITCH_WORKER_TIMEOUT_MS, 10) || 15 * 60 * 1000

/**
 * factor = 2 ** (semitones / 12), the validated FFmpeg rubberband technique
 * from the karaoke-propio pitch research (see prompt_de_implementacion.md #17).
 */
function pitchFactor (semitones) {
  return 2 ** (semitones / 12)
}

function buildArgs ({ inputPath, tmpPath, mediaKind, pitchSemitones }) {
  const factor = pitchFactor(pitchSemitones).toFixed(6)
  const rubberband = `rubberband=pitch=${factor}:tempo=1`

  if (mediaKind === 'mp4') {
    // copy video untouched; only the audio is transposed
    return [
      '-y', '-i', inputPath,
      '-filter:a', rubberband,
      '-c:v', 'copy',
      '-c:a', 'aac', '-b:a', '192k',
      '-movflags', '+faststart',
      tmpPath,
    ]
  }

  // CDG companion audio: re-encode to AAC/m4a regardless of source container
  // (mp3/m4a/extracted-from-zip) for a single consistent cache format
  return [
    '-y', '-i', inputPath,
    '-filter:a', rubberband,
    '-c:a', 'aac', '-b:a', '192k',
    tmpPath,
  ]
}

function isSafeAbsolutePath (p) {
  return typeof p === 'string' && path.isAbsolute(p) && !p.includes('\0')
}

async function handleTranscode (req, res) {
  const body = await readJsonBody(req)

  const { inputPath, outputPath, tmpPath, mediaKind, pitchSemitones } = body || {}

  if (!isSafeAbsolutePath(inputPath) || !isSafeAbsolutePath(outputPath) || !isSafeAbsolutePath(tmpPath)) {
    return sendJson(res, 422, { error: 'inputPath/outputPath/tmpPath must be absolute paths' })
  }

  if (mediaKind !== 'mp4' && mediaKind !== 'audio') {
    return sendJson(res, 422, { error: 'mediaKind must be "mp4" or "audio"' })
  }

  if (!Number.isInteger(pitchSemitones) || pitchSemitones === 0) {
    return sendJson(res, 422, { error: 'pitchSemitones must be a non-zero integer' })
  }

  try {
    await fsPromises.access(inputPath, fs.constants.R_OK)
  } catch {
    return sendJson(res, 404, { error: `inputPath not readable: ${inputPath}` })
  }

  await fsPromises.mkdir(path.dirname(outputPath), { recursive: true })
  await fsPromises.mkdir(path.dirname(tmpPath), { recursive: true })

  // the caller (PitchManager) already generates a tmp path unique to this
  // request, with the correct extension for ffmpeg's output-format sniffing
  // (see server/Pitch/pitchCache.ts); do NOT append anything after it here
  const args = buildArgs({ inputPath, tmpPath, mediaKind, pitchSemitones })

  try {
    await runFfmpeg(args)
    await fsPromises.rename(tmpPath, outputPath) // atomic publish
    return sendJson(res, 200, { outputPath })
  } catch (err) {
    await fsPromises.unlink(tmpPath).catch(() => {})
    return sendJson(res, 500, { error: err.message })
  }
}

function runFfmpeg (args) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', args, { timeout: FFMPEG_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const tail = (stderr || err.message || '').slice(-2000)
        return reject(new Error(`ffmpeg failed: ${tail}`))
      }
      resolve()
    })
  })
}

function readJsonBody (req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', chunk => { data += chunk })
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {})
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

function sendJson (res, status, obj) {
  const json = JSON.stringify(obj)
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(json) })
  res.end(json)
}


// ---------------------------------------------------------------------------
// Key detection
// ---------------------------------------------------------------------------
//
// Estimates the musical key from the audio itself, for songs with no note data
// (see server/Media/songNotes.ts — only UltraStar/USDB acquisitions carry the
// melody). This says which key the backing track is in, NOT what the singer
// should sing: a karaoke recording has no lead vocal to analyse.
//
// Method: decode a mono excerpt, take the magnitude spectrum in overlapping
// frames, fold every bin onto the 12 pitch classes to build a chroma profile,
// then correlate that against the Krumhansl-Schmuckler key profiles and pick
// the best of the 24 major/minor candidates.

const KRUMHANSL_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
const KRUMHANSL_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
const PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const PITCH_CLASSES_ES = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si']

const ANALYSIS_RATE = 11025 // plenty for pitch classes, and 4x less data to crunch
const FFT_SIZE = 4096
// skip the intro and analyse the body of the song, where the key is established
const ANALYSIS_START_S = 20
const ANALYSIS_SECONDS = 90

/** In-place iterative radix-2 FFT on real/imaginary arrays. */
function fft (re, im) {
  const n = re.length

  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]] }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len
    const wRe = Math.cos(ang)
    const wIm = Math.sin(ang)

    for (let i = 0; i < n; i += len) {
      let curRe = 1
      let curIm = 0

      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k]
        const uIm = im[i + k]
        const vRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm
        const vIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe

        re[i + k] = uRe + vRe
        im[i + k] = uIm + vIm
        re[i + k + len / 2] = uRe - vRe
        im[i + k + len / 2] = uIm - vIm

        const nextRe = curRe * wRe - curIm * wIm
        curIm = curRe * wIm + curIm * wRe
        curRe = nextRe
      }
    }
  }
}

function chromaFromPcm (samples, sampleRate) {
  const chroma = new Array(12).fill(0)
  const hop = FFT_SIZE / 2
  const window = new Float64Array(FFT_SIZE)
  for (let i = 0; i < FFT_SIZE; i++) window[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (FFT_SIZE - 1)) // Hann

  for (let start = 0; start + FFT_SIZE <= samples.length; start += hop) {
    const re = new Float64Array(FFT_SIZE)
    const im = new Float64Array(FFT_SIZE)
    for (let i = 0; i < FFT_SIZE; i++) re[i] = samples[start + i] * window[i]

    fft(re, im)

    for (let bin = 1; bin < FFT_SIZE / 2; bin++) {
      const freq = bin * sampleRate / FFT_SIZE
      // outside this band is mostly bass rumble and cymbals, neither of which
      // says anything useful about the key
      if (freq < 65 || freq > 2000) continue

      const magnitude = Math.hypot(re[bin], im[bin])
      const midi = 69 + 12 * Math.log2(freq / 440)
      chroma[((Math.round(midi) % 12) + 12) % 12] += magnitude
    }
  }

  return chroma
}

function correlate (chroma, profile, rotation) {
  const n = 12
  let sumA = 0
  let sumB = 0
  for (let i = 0; i < n; i++) { sumA += chroma[i]; sumB += profile[i] }
  const meanA = sumA / n
  const meanB = sumB / n

  let num = 0
  let denA = 0
  let denB = 0
  for (let i = 0; i < n; i++) {
    const a = chroma[(i + rotation) % n] - meanA
    const b = profile[i] - meanB
    num += a * b
    denA += a * a
    denB += b * b
  }

  return denA && denB ? num / Math.sqrt(denA * denB) : 0
}

async function handleDetectKey (req, res) {
  const body = await readJsonBody(req)
  const { inputPath } = body || {}

  if (!isSafeAbsolutePath(inputPath)) {
    return sendJson(res, 422, { error: 'inputPath must be an absolute path' })
  }

  // this worker has no execFileP helper (that lives in acquisition-worker), and
  // the PCM must stay binary — encoding:'buffer' matters, a utf8 decode would
  // corrupt every sample
  const stdout = await new Promise((resolve, reject) => {
    execFile('ffmpeg', [
      '-v', 'error',
      '-ss', String(ANALYSIS_START_S),
      '-t', String(ANALYSIS_SECONDS),
      '-i', inputPath,
      '-ac', '1',
      '-ar', String(ANALYSIS_RATE),
      '-f', 'f32le',
      'pipe:1',
    ], { timeout: 120000, maxBuffer: 256 * 1024 * 1024, encoding: 'buffer' }, (err, out, stderr) => {
      if (err) return reject(new Error(`ffmpeg failed: ${String(stderr).slice(-500)}`))
      resolve(out)
    })
  })

  const samples = new Float32Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.length / 4))
  if (samples.length < FFT_SIZE) {
    return sendJson(res, 200, { key: null, reason: 'not enough audio to analyse' })
  }

  const chroma = chromaFromPcm(samples, ANALYSIS_RATE)

  let best = null
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const [mode, profile] of [['major', KRUMHANSL_MAJOR], ['minor', KRUMHANSL_MINOR]]) {
      const score = correlate(chroma, profile, tonic)
      if (!best || score > best.score) best = { tonic, mode, score }
    }
  }

  return sendJson(res, 200, {
    key: {
      tonic: PITCH_CLASSES[best.tonic],
      tonicEs: PITCH_CLASSES_ES[best.tonic],
      mode: best.mode,
      // how strongly the audio matched; a weak match is worth showing as
      // uncertain rather than stating a key with false confidence
      confidence: Math.max(0, Math.min(1, best.score)),
    },
  })
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    return sendJson(res, 200, { ok: true })
  }

  if (req.method === 'POST' && req.url === '/detect-key') {
    return handleDetectKey(req, res).catch((err) => {
      sendJson(res, 500, { error: err.message })
    })
  }

  if (req.method === 'POST' && req.url === '/transcode') {
    return handleTranscode(req, res).catch((err) => {
      sendJson(res, 400, { error: err.message })
    })
  }

  sendJson(res, 404, { error: 'not found' })
})

server.listen(PORT, () => {
  console.log(`pitch-worker listening on :${PORT}`)
})
