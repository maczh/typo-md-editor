import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useTranslation } from '@/i18n'
import { useFind } from '@/composables/useFind'

export interface FindDialogProps {
  modelValue?: boolean
  onClose: () => void
}

export default function FindDialog({ modelValue = true, onClose }: FindDialogProps) {
  const { t } = useTranslation()
  const f = useFind()
  const findInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    findInputRef.current?.focus()
    findInputRef.current?.select()
  }, [])

  function closeBar(): void {
    f.close()
    onClose()
  }

  function onKey(e: ReactKeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) f.findPrev()
      else f.findNext()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      closeBar()
    }
  }

  if (!modelValue) return null

  return (
    <div className="find-bar" onKeyDown={onKey}>
      <input
        ref={findInputRef}
        className="fld"
        value={f.findText.value}
        placeholder={t('find.placeholder')}
        onChange={(e) => {
          f.findText.value = e.target.value
          f.findNext()
        }}
      />
      <label className="chk">
        <input
          type="checkbox"
          checked={f.matchCase.value}
          onChange={(e) => {
            f.matchCase.value = e.target.checked
          }}
        />
        {t('find.matchCase')}
      </label>
      <button className="btn" title={t('find.prev')} onClick={() => f.findPrev()}>
        ↑
      </button>
      <button className="btn" title={t('find.next')} onClick={() => f.findNext()}>
        ↓
      </button>
      <button
        className="btn"
        onClick={() => {
          f.replaceVisible.value = !f.replaceVisible.value
        }}
      >
        {t('find.replace')}
      </button>

      {f.replaceVisible.value && (
        <>
          <input
            className="fld"
            value={f.replaceText.value}
            placeholder={t('find.replaceWith')}
            onChange={(e) => {
              f.replaceText.value = e.target.value
            }}
          />
          <button className="btn" onClick={() => f.replaceOne()}>
            {t('find.replaceOne')}
          </button>
          <button className="btn" onClick={() => f.replaceAll()}>
            {t('find.replaceAll')}
          </button>
        </>
      )}

      <button className="btn close" title={t('common.close')} onClick={closeBar}>
        ✕
      </button>
    </div>
  )
}
