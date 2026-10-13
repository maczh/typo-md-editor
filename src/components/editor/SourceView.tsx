import { useEffect, useRef, type ChangeEvent } from 'react'

export interface SourceViewProps {
  modelValue: string
  onUpdateModelValue?: (v: string) => void
}

export default function SourceView({ modelValue, onUpdateModelValue }: SourceViewProps) {
  const ta = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    ta.current?.focus()
    ta.current?.select()
  }, [])

  function onInput(e: ChangeEvent<HTMLTextAreaElement>): void {
    onUpdateModelValue?.(e.target.value)
  }

  return (
    <div className="source-view">
      <textarea
        ref={ta}
        className="source-textarea"
        value={modelValue}
        spellCheck={false}
        onChange={onInput}
      />
    </div>
  )
}
