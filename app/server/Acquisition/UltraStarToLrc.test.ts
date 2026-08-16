import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseUltraStarHeaders, ultraStarToLrc, ultraStarToNotes } from './UltraStarToLrc.js'

// the exact fixture prompt_de_implementacion.md #36 validated CDGSharp
// against: 150 syllabic notes, 28 line breaks (29 phrases), BPM 250,
// GAP 24010, "effective beat: 60ms" (BPM*4 = 1000 units/beat -> 60ms/beat)
const FIXTURE_PATH = fileURLToPath(new URL('./__fixtures__/soda-stereo-de-musica-ligera.txt', import.meta.url))
const FIXTURE = fs.readFileSync(FIXTURE_PATH, 'utf8')

describe('parseUltraStarHeaders', () => {
  it('extracts artist/title/bpm/gap from the reference fixture', () => {
    const song = parseUltraStarHeaders(FIXTURE)
    expect(song.artist).toBe('Soda Stereo')
    expect(song.title).toBe('De música ligera')
    expect(song.bpm).toBe(250)
    expect(song.gapMs).toBe(24010)
    expect(song.mp3).toBe('Soda Stereo - De música ligera.mp4')
  })

  it('throws a clear error when required headers are missing', () => {
    expect(() => parseUltraStarHeaders('#BPM:120\n#GAP:0\n')).toThrow(/ARTIST|TITLE/)
    expect(() => parseUltraStarHeaders('#ARTIST:A\n#TITLE:B\n')).toThrow(/BPM/)
  })
})

describe('ultraStarToLrc — reference fixture (validated CDGSharp test case)', () => {
  const lrc = ultraStarToLrc(FIXTURE)

  it('emits [ar:]/[ti:] metadata matching the song', () => {
    expect(lrc).toMatch(/^\[ar:Soda Stereo\]\n\[ti:De música ligera\]\n\n/)
  })

  it('produces exactly 150 timed words (one per syllabic note in the fixture)', () => {
    const wordCount = (lrc.match(/\]\[/g) || []).length // each word has [start][end]-adjacent markers except line boundaries
    // count timestamp pairs directly instead, more robust than the above heuristic:
    const timestamps = lrc.match(/\[\d{2}:\d{2}:\d{2}\]/g) || []
    expect(timestamps.length).toBe(150 * 2) // start+end per word
    expect(wordCount).toBeGreaterThan(0) // sanity: heuristic isn't vacuous
  })

  it('produces 29 phrases (28 line breaks + 1 trailing line)', () => {
    // lines are separated by single \n within a page, and by \n\n between pages;
    // splitting on any run of blank-line-normalized separators recovers all lines
    const body = lrc.split('\n\n').slice(1).join('\n\n') // drop metadata block
    const lineCount = body.split('\n').filter(l => l.trim().length > 0).length
    expect(lineCount).toBe(29)
  })

  it('groups lines into pages of 2 by default', () => {
    const pageCount = lrc.trim().split('\n\n').length - 1 // -1 for the metadata block
    expect(pageCount).toBe(Math.ceil(29 / 2))
  })

  it('honors a custom linesPerPage', () => {
    const lrc4 = ultraStarToLrc(FIXTURE, { linesPerPage: 4 })
    const pageCount = lrc4.trim().split('\n\n').length - 1
    expect(pageCount).toBe(Math.ceil(29 / 4))
  })

  it('computes the first note\'s start time as GAP (beat 0)', () => {
    // beat 0 -> absoluteTime = GAP_ms/1000 + 0 = 24.010s -> [00:24:01]
    expect(lrc).toContain('[00:24:01]')
  })

  it('computes 60ms per beat (BPM*4=1000 "units"/beat, matching the validated reference)', () => {
    // second note starts at beat 4: 24.010 + 4*0.06 = 24.250s -> [00:24:25]
    expect(lrc).toContain('[00:24:25]')
  })

  it('reconstructs "Ella durmio " from the first line\'s syllables with exact spacing', () => {
    // fixture: ": 0 3 -1 E" ": 4 3 -1 lla " ": 8 3 1 dur" ": 12 8 2 mio "
    // concatenated (ignoring timestamps) must read "Elladurmio " -> wait:
    // "E" + "lla " + "dur" + "mio " = "Ella durmio " — trailing spaces are
    // the ONLY word-boundary signal UltraStar gives; losing one merges words
    // lrc = "<metadata>\n\n<page1>\n\n<page2>..." -> split('\n\n')[0] is
    // metadata, [1] is page 1, whose first line is the first sung phrase
    const firstLine = lrc.split('\n\n')[1].split('\n')[0]
    const text = firstLine.replace(/\[\d{2}:\d{2}:\d{2}\]/g, '')
    expect(text).toBe('Ella durmio ')
  })

  it('never emits a raw "[" or "]" inside word text (would be mistaken for a timestamp)', () => {
    const song = '#ARTIST:A\n#TITLE:B\n#BPM:100\n#GAP:0\n: 0 4 0 [bad] \nE\n'
    const out = ultraStarToLrc(song)
    // 2 metadata brackets ([ar:]/[ti:]) + 2 timestamp brackets (start+end)
    // for the single word — the literal "[bad]" text must have had ITS
    // brackets stripped, or this would be 6, not 4
    expect((out.match(/\[/g) || []).length).toBe(4)
    expect(out).toContain('bad')
    expect(out).not.toContain('[bad]')
  })
})

describe('ultraStarToLrc — edge cases', () => {
  it('throws when there are no note lines', () => {
    expect(() => ultraStarToLrc('#ARTIST:A\n#TITLE:B\n#BPM:100\n#GAP:0\nE\n')).toThrow(/no note lines/)
  })

  it('treats golden (*) and freestyle (F) notes the same as normal (:) notes for display', () => {
    const song = '#ARTIST:A\n#TITLE:B\n#BPM:100\n#GAP:0\n: 0 4 0 Hello \n* 4 4 2 Gold \nF 8 4 0 Free\nE\n'
    const out = ultraStarToLrc(song)
    expect(out).toContain('Hello ')
    expect(out).toContain('Gold ')
    expect(out).toContain('Free')
  })

  it('stops parsing at "E" and ignores anything after it', () => {
    const song = '#ARTIST:A\n#TITLE:B\n#BPM:100\n#GAP:0\n: 0 4 0 Hi \nE\n: 999 4 0 ShouldNotAppear\n'
    const out = ultraStarToLrc(song)
    expect(out).not.toContain('ShouldNotAppear')
  })
})

describe('ultraStarToNotes', () => {
  // shape and values taken from a real USDB song.txt
  const songTxt = [
    '#ARTIST:Soda Stereo',
    '#TITLE:De música ligera',
    '#BPM:150',
    '#GAP:1000',
    ': 0 3 -1 E',
    ': 4 3 -1 lla ',
    ': 8 3 1 dur',
    '* 12 8 2 mio ',
    '- 20',
    'E',
  ].join('\n')

  it('turns beats into absolute seconds, honouring GAP', () => {
    const notes = ultraStarToNotes(songTxt)
    const secondsPerBeat = 60 / (150 * 4)

    expect(notes).toHaveLength(4)
    expect(notes[0].timeSeconds).toBeCloseTo(1, 5) // GAP alone
    expect(notes[1].timeSeconds).toBeCloseTo(1 + 4 * secondsPerBeat, 5)
    expect(notes[3].durationSeconds).toBeCloseTo(8 * secondsPerBeat, 5)
  })

  it('names the pitches (UltraStar 0 = C4)', () => {
    const notes = ultraStarToNotes(songTxt)

    expect(notes[0].name).toBe('B3') // -1
    expect(notes[2].name).toBe('C#4') // 1
    expect(notes[3].name).toBe('D4') // 2
  })

  it('marks golden notes', () => {
    const notes = ultraStarToNotes(songTxt)

    expect(notes[3].isGolden).toBe(true)
    expect(notes[0].isGolden).toBe(false)
  })

  it('keeps the syllable each note is sung on', () => {
    expect(ultraStarToNotes(songTxt).map(n => n.text)).toEqual(['E', 'lla ', 'dur', 'mio '])
  })
})
