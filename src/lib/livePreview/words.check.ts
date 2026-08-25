/**
 * Assertions for the constellation word-list conversion.
 * Run: npm run verify:config
 *
 * This is the code path that can silently destroy the owner's word list, so
 * it is pure and tested away from React.
 */
import { wordsToText, textToWords, MAX_WORDS, MAX_WORD_LEN } from './words'

let failures = 0
const check = (label: string, cond: boolean) => {
  if (!cond) {
    failures++
    console.error(`FAIL  ${label}`)
  } else {
    console.log(`ok    ${label}`)
  }
}

// --- textToWords ---
check('splits on newlines', textToWords('a\nb\nc').join(',') === 'a,b,c')
check('trims surrounding whitespace', textToWords('  a  \n\tb\t').join(',') === 'a,b')
check('drops blank lines', textToWords('a\n\n\nb\n   \nc').join(',') === 'a,b,c')
check('handles CRLF', textToWords('a\r\nb').join(',') === 'a,b')
check('empty input yields no words', textToWords('').length === 0)
check('whitespace-only input yields no words', textToWords('  \n\t\n ').length === 0)
check('caps at MAX_WORDS', textToWords(Array.from({ length: 30 }, (_, i) => `w${i}`).join('\n')).length === MAX_WORDS)
check(
  'truncates an over-long word rather than dropping it',
  textToWords('x'.repeat(40))[0].length === MAX_WORD_LEN,
)
check('preserves order', textToWords('zeta\nalpha\nmid').join(',') === 'zeta,alpha,mid')
check('keeps internal spaces in a phrase', textToWords('two words').join(',') === 'two words')

// --- wordsToText ---
check('joins rows with newlines', wordsToText([{ word: 'a' }, { word: 'b' }]) === 'a\nb')
check('null rows yield empty string', wordsToText(null) === '')
check('undefined rows yield empty string', wordsToText(undefined) === '')
check('empty rows yield empty string', wordsToText([]) === '')
check('skips null/empty words', wordsToText([{ word: 'a' }, { word: null }, { word: '' }, { word: 'b' }]) === 'a\nb')

// --- round trip: the property that actually protects the owner's data ---
const original = ['sketch', 'craft', 'design', 'identity', 'motion', 'detail', 'story', 'precision']
const roundTripped = textToWords(wordsToText(original.map((word) => ({ word }))))
check('round trip preserves every word in order', roundTripped.join(',') === original.join(','))

const messy = [{ word: 'a' }, { word: null }, { word: 'b' }]
check('round trip drops only the empties', textToWords(wordsToText(messy)).join(',') === 'a,b')

console.log(failures === 0 ? '\nAll word-list checks passed.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
