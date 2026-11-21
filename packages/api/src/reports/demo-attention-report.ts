import { renderAttentionReport, type AttentionReport } from './attention-report'
import snapshot from './fixtures/prettier-20305.json'

const { repository, number, title, url, files, changedFiles } = snapshot
const filesWithoutPatches = files.filter((file) => !file.patch)
const report: AttentionReport = {
  pr: { repository, number, title, url },
  intent: 'Preserve SCSS selector lists when an empty quoted attribute value appears near a line comment.',
  startHere: [
    {
      file: 'src/language-css/parse/parse-selector.js',
      lines: '10-13',
      summary: 'Changes when a selector bypasses parsing.',
      reason: 'If comment detection misses a real line comment, formatting can move the next selector onto the comment line and change which styles apply.',
      reviewerQuestion: 'Is preserving the entire selector the intended fallback whenever a real comment appears in the list?',
    },
  ],
  remainingHighAttention: [
    {
      file: 'src/language-css/print/misc.js',
      lines: '28-30',
      summary: 'Reuses the printer’s quoted-string matcher before comment detection.',
      reason: 'The matcher now determines what the selector parser hides before looking for comment delimiters. Quoting and escape handling affect that boundary.',
      reviewerQuestion: 'Do the added cases cover both quote styles, escaped quotes, and delimiters inside quoted attribute values?',
    },
  ],
  routineChanges: [
    'Changelog entry and SCSS regression test inputs with their expected output snapshots.',
  ],
  coverage: {
    patchesAvailable: files.length - filesWithoutPatches.length,
    changedFiles,
    notes: [
      ...filesWithoutPatches.map((file) => `Patch unavailable for ${file.path}.`),
      'The shared string matcher is outside the saved patch. See src/language-css/print/misc.js:10 at the pinned head commit.',
    ],
  },
}

console.log(renderAttentionReport(report))
