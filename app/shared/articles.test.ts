import { describe, expect, it } from 'vitest'
import { stripArticles } from './articles.js'

describe('stripArticles', () => {
  it('undoes the stored "X, The" form', () => {
    expect(stripArticles('Eagles, The')).toBe('Eagles')
    expect(stripArticles('Beatles, The')).toBe('Beatles')
    expect(stripArticles('Show Must Go On, The')).toBe('Show Must Go On')
  })

  it('drops a leading article, so both spellings meet in the middle', () => {
    expect(stripArticles('The Eagles')).toBe('Eagles')
    expect(stripArticles('A Hard Day\'s Night')).toBe('Hard Day\'s Night')
  })

  it('is what makes the two forms match', () => {
    expect(stripArticles('The Eagles')).toBe(stripArticles('Eagles, The'))
  })

  it('leaves names alone when the article is part of them', () => {
    // not a trailing article: no comma
    expect(stripArticles('Take That')).toBe('Take That')
    expect(stripArticles('Theatre of Tragedy')).toBe('Theatre of Tragedy')
    expect(stripArticles('Anthrax')).toBe('Anthrax')
  })

  it('handles an artist that is only an article-looking word', () => {
    expect(stripArticles('Them')).toBe('Them')
  })
})
