import { describe, expect, it } from 'vitest'
import { parseSearchResults, parseYoutubeLinks } from './UsdbClient.js'

/**
 * These fixtures are SYNTHETIC, built to match the markup shape confirmed by
 * live (anonymous, pre-login) requests to usdb.animux.de on 2026-08-13 —
 * `show_detail(ID)` handlers, `list_tr1`/`list_tr2` row classes, `<td>`
 * columns — combined with the request/response shape documented in
 * UltraScrap CLI (MIT). They are NOT captured from a real authenticated
 * search result, since no USDB credentials were available in this session
 * (every unauthenticated request returned "You are not logged in"). Treat
 * these tests as verifying the parser's mechanics are self-consistent, not
 * as end-to-end validation against real USDB output.
 */

const SEARCH_ROW = `
<tr class="list_tr1" onmouseover="this.className='list_tr1_hover'" onmouseout="this.className='list_tr1'" onclick="show_detail(4902)">
  <td class="row1">Soda Stereo</td>
  <td class="row1">De música ligera</td>
  <td class="row1">1990</td>
  <td class="row1">Rock</td>
  <td class="row1">5</td>
  <td class="row1">2</td>
  <td class="row1">Spanish, English</td>
</tr>
`

const SEARCH_ROW_2 = `
<tr class="list_tr2" onclick="show_detail(1234)">
  <td class="row2">Rick Astley</td>
  <td class="row2">Never Gonna Give You Up</td>
  <td class="row2">1987</td>
  <td class="row2">Pop</td>
  <td class="row2">10</td>
  <td class="row2">1</td>
  <td class="row2">English</td>
</tr>
`

const MALFORMED_ROW = `
<tr class="list_tr1" onclick="show_detail(999)">
  <td class="row1">Only One Cell</td>
</tr>
`

describe('parseSearchResults', () => {
  it('extracts id/artist/title/languages from a well-formed row', () => {
    const results = parseSearchResults(SEARCH_ROW)
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      id: '4902',
      artist: 'Soda Stereo',
      title: 'De música ligera',
      languages: ['spanish', 'english'],
    })
  })

  it('parses multiple rows regardless of list_tr1/list_tr2 alternation', () => {
    const results = parseSearchResults(SEARCH_ROW + SEARCH_ROW_2)
    expect(results.map(r => r.id)).toEqual(['4902', '1234'])
  })

  it('skips a row with too few cells rather than throwing', () => {
    const results = parseSearchResults(SEARCH_ROW + MALFORMED_ROW)
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('4902')
  })

  it('returns an empty array (not an error) for the real "not logged in" response', () => {
    // captured live on 2026-08-13 from an anonymous POST to ?link=list
    const notLoggedIn = `
      <center><tr><td class='row1'>
      <br>ERROR:<br>
      You are not logged in. Login to use this function.<br><br></td></tr></center>
    `
    expect(parseSearchResults(notLoggedIn)).toEqual([])
  })
})

describe('parseYoutubeLinks', () => {
  it('extracts a thumbnail-embed style link with its comment date, most recent first', () => {
    const html = `
      <td>15.03.2024 - 10:30</td><td><img src="http://img.youtube.com/vi/aaaaaaaaaaa/0.jpg" /></td>
      <td>20.03.2024 - 09:00</td><td><img src="http://img.youtube.com/vi/bbbbbbbbbbb/0.jpg" /></td>
    `
    const links = parseYoutubeLinks(html)
    expect(links.map(l => l.videoId)).toEqual(['bbbbbbbbbbb', 'aaaaaaaaaaa'])
  })

  it('extracts a plain hyperlink style comment (href, not img src)', () => {
    const html = `
      <td>01.01.2025 - 12:00</td><td>check this out: <a href="https://youtu.be/ccccccccccc">link</a></td>
    `
    const links = parseYoutubeLinks(html)
    expect(links.map(l => l.videoId)).toEqual(['ccccccccccc'])
  })

  it('returns an empty array when no comments reference YouTube', () => {
    expect(parseYoutubeLinks('<td>no links here</td>')).toEqual([])
  })
})
