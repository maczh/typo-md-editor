import { test } from 'node:test'
import assert from 'node:assert/strict'
import zhCN from '../src/i18n/locales/zh-CN'
import en from '../src/i18n/locales/en'
import zhTW from '../src/i18n/locales/zh-TW'

// PRD REQ-P1-07: three language packs must be complete and in sync. A missing
// key in any locale is a source bug (UI text would fall back / break).
function collectKeys(obj: unknown, prefix = ''): string[] {
  const keys: string[] = []
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${k}` : k
      if (v && typeof v === 'object') keys.push(...collectKeys(v, path))
      else keys.push(path)
    }
  }
  return keys.sort()
}

test('the three language packs share an identical key set', () => {
  const zh = collectKeys(zhCN)
  const enKeys = collectKeys(en)
  const tw = collectKeys(zhTW)
  assert.deepEqual(enKeys, zh, 'en should have the same keys as zh-CN')
  assert.deepEqual(tw, zh, 'zh-TW should have the same keys as zh-CN')
  assert.ok(zh.length > 50, 'expected a reasonably complete locale (>50 keys)')
})

test('every value is a non-empty string', () => {
  for (const [name, pack] of [['zh-CN', zhCN], ['en', en], ['zh-TW', zhTW]] as const) {
    const keys = collectKeys(pack)
    for (const k of keys) {
      const val = k.split('.').reduce<any>((o, p) => o?.[p], pack)
      assert.equal(typeof val, 'string', `${name}.${k} should be a string`)
      assert.ok((val as string).trim().length > 0, `${name}.${k} should not be empty`)
    }
  }
})
