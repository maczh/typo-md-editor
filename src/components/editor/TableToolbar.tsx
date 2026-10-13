import { useMilkdown } from '@/composables/useMilkdown'
import { useTranslation } from '@/i18n'
import * as table from '@/milkdown/plugins/table'

export default function TableToolbar() {
  const milkdown = useMilkdown()
  const { t } = useTranslation()

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
      <button className="icon-btn" title="Row +" onClick={() => run((e) => table.addRow(e, true))}>
        ＋行
      </button>
      <button className="icon-btn" title="Row −" onClick={() => run((e) => table.removeRow(e))}>
        －行
      </button>
      <button className="icon-btn" title="Col +" onClick={() => run((e) => table.addColumn(e))}>
        ＋列
      </button>
      <button className="icon-btn" title="Col −" onClick={() => run((e) => table.removeColumn(e))}>
        －列
      </button>
    </div>
  )
}
