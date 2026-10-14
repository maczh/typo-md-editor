import { useEffect, useState } from 'react'
import { useMilkdown } from '@/composables/useMilkdown'
import { useTranslation } from '@/i18n'
import * as table from '@/milkdown/plugins/table'

/**
 * Table toolbar. It used to be mounted unconditionally, so its buttons sat
 * above the editor at all times and silently did nothing whenever the caret was
 * outside a table (`withTableContext` bails). It now shows only while the
 * selection is inside a table — which is what "表格浮动工具条" means.
 */
export default function TableToolbar() {
  const milkdown = useMilkdown()
  const { t } = useTranslation()
  const [inTable, setInTable] = useState(false)

  useEffect(() => {
    function check(): void {
      setInTable(table.isInTable(milkdown.getEditor()))
    }
    document.addEventListener('selectionchange', check)
    check()
    return () => document.removeEventListener('selectionchange', check)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!inTable) return null

  function run(fn: (editor: Parameters<typeof table.insertTable>[0]) => void): void {
    const editor = milkdown.getEditor()
    if (editor) fn(editor)
  }

  return (
    <div className="table-toolbar">
      <button
        className="icon-btn"
        title={t('menu.insertTable')}
        onClick={() => run(table.insertTable)}
      >
        ⊞ {t('menu.insertTable')}
      </button>
      <span className="sep" />
      <button className="icon-btn" title={t('tableToolbar.addRow')} onClick={() => run((e) => table.addRow(e, true))}>
        ＋{t('tableToolbar.row')}
      </button>
      <button className="icon-btn" title={t('tableToolbar.removeRow')} onClick={() => run((e) => table.removeRow(e))}>
        －{t('tableToolbar.row')}
      </button>
      <button className="icon-btn" title={t('tableToolbar.addColumn')} onClick={() => run((e) => table.addColumn(e))}>
        ＋{t('tableToolbar.column')}
      </button>
      <button className="icon-btn" title={t('tableToolbar.removeColumn')} onClick={() => run((e) => table.removeColumn(e))}>
        －{t('tableToolbar.column')}
      </button>
    </div>
  )
}
