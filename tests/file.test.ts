import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dirname, basename, replaceExtension, resolveAssetPath } from '../src/utils/file'

// PRD REQ-P0-03 / shared path conventions: asset-relative paths, ext replacement.
test('basename extracts the file name on posix and windows separators', () => {
  assert.equal(basename('/a/b/c.md'), 'c.md')
  assert.equal(basename('a/b/c.md'), 'c.md')
  // backslashes are normalised to forward slashes
  assert.equal(basename('C:\\Users\\me\\doc.md'), 'doc.md')
  assert.equal(basename('no-slash'), 'no-slash')
})

test('dirname returns the parent directory', () => {
  assert.equal(dirname('/a/b/c.md'), '/a/b')
  assert.equal(dirname('a/b/c.md'), 'a/b')
  // single segment (no slash) -> current dir
  assert.equal(dirname('c.md'), '.')
  // file at root -> '.'
  assert.equal(dirname('/c.md'), '.')
})

test('replaceExtension swaps the extension (with or without leading dot)', () => {
  assert.equal(replaceExtension('/a/b/c.md', 'html'), '/a/b/c.html')
  assert.equal(replaceExtension('/a/b/c.md', '.html'), '/a/b/c.html')
  assert.equal(replaceExtension('/a/b/c.md', 'DOCX'), '/a/b/c.DOCX')
})

test('replaceExtension handles missing / dotfile extensions', () => {
  assert.equal(replaceExtension('/a/b/README', 'md'), '/a/b/README.md')
  assert.equal(replaceExtension('/a/b/.gitignore', 'txt'), '/a/b/.gitignore.txt')
})

test('resolveAssetPath joins doc dir with the asset-relative path', () => {
  assert.equal(resolveAssetPath('/docs/note.md', 'assets/x.png'), '/docs/assets/x.png')
  assert.equal(resolveAssetPath('note.md', 'assets/x.png'), './assets/x.png')
  // collapses accidental double slashes
  assert.equal(resolveAssetPath('/docs/', 'assets/x.png'), '/docs/assets/x.png')
})
