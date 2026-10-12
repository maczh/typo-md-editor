import type { Editor } from '@milkdown/core'
import { editorViewCtx } from '@milkdown/core'
import { insert } from '@milkdown/utils'
import type { EditorView } from '@milkdown/prose/view'
import type { Node as PMNode } from '@milkdown/prose/model'
import {
  addRowAfter,
  addRowBefore,
  deleteRow,
  addColumnAfter,
  addColumnBefore,
  deleteColumn,
  deleteTable,
} from '@milkdown/prose/tables'

/**
 * Table helpers. Crepe (GFM) already provides editable tables; these helpers
 * insert a starter table and run ProseMirror table-editing commands on the
 * current selection — used by TableToolbar.vue and the editor context menu.
 */

const CELL_TYPES = ['table_cell', 'table_header']

/** Insert a 3x2 starter table at the caret. */
export function insertTable(editor: Editor): void {
  const md = [
    '',
    '| Column 1 | Column 2 | Column 3 |',
    '| --- | --- | --- |',
    '| Cell | Cell | Cell |',
    '| Cell | Cell | Cell |',
    '',
  ].join('\n')
  editor.action(insert(md))
}

type TableCommand = (state: unknown, dispatch?: (tr: unknown) => void) => boolean

function runTableCommand(editor: Editor, cmd: TableCommand): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx) as unknown as EditorView
    cmd(view.state, view.dispatch as unknown as (tr: unknown) => void)
  })
}

function runWithView(editor: Editor, fn: (view: EditorView) => void): void {
  editor.action((ctx) => {
    fn(ctx.get(editorViewCtx) as EditorView)
  })
}

export function addRow(editor: Editor, after = true): void {
  runTableCommand(editor, (after ? addRowAfter : addRowBefore) as never)
}

export function removeRow(editor: Editor): void {
  runTableCommand(editor, deleteRow as never)
}

export function addColumn(editor: Editor, after = true): void {
  runTableCommand(editor, (after ? addColumnAfter : addColumnBefore) as never)
}

export function removeColumn(editor: Editor): void {
  runTableCommand(editor, deleteColumn as never)
}

export function removeTable(editor: Editor): void {
  runTableCommand(editor, deleteTable as never)
}

/** Locate the enclosing `table` node plus the row/cell indices for the caret. */
interface TableContext {
  view: EditorView
  table: PMNode
  tablePos: number
  rowIndex: number
  cellIndex: number
}

function withTableContext(editor: Editor, fn: (t: TableContext) => void): void {
  runWithView(editor, (view) => {
    const { $from } = view.state.selection
    let tableDepth = -1
    let rowDepth = -1
    let cellDepth = -1
    for (let d = $from.depth; d > 0; d -= 1) {
      const name = $from.node(d).type.name
      if (name === 'table' && tableDepth < 0) tableDepth = d
      if (name === 'table_row' && rowDepth < 0) rowDepth = d
      if (CELL_TYPES.includes(name) && cellDepth < 0) cellDepth = d
    }
    if (tableDepth < 0 || rowDepth < 0) return
    const table = $from.node(tableDepth)
    fn({
      view,
      table,
      tablePos: $from.before(tableDepth),
      rowIndex: rowDepth > 0 ? $from.index(rowDepth - 1) : 0,
      cellIndex: cellDepth > 0 ? $from.index(cellDepth - 1) : 0,
    })
  })
}

/** Swap a child node with its neighbour inside a parent, when in range. */
function swapChildren(parent: PMNode, i: number, j: number): PMNode | null {
  if (i < 0 || j < 0 || i >= parent.childCount || j >= parent.childCount) return null
  const children: PMNode[] = []
  parent.forEach((child) => children.push(child))
  const tmp = children[i]
  children[i] = children[j]
  children[j] = tmp
  return parent.type.create(parent.attrs, children, parent.marks)
}

/** Move the current table row up (-1) or down (+1). */
export function moveRow(editor: Editor, dir: -1 | 1): void {
  withTableContext(editor, ({ view, table, tablePos, rowIndex }) => {
    const next = swapChildren(table, rowIndex, rowIndex + dir)
    if (!next) return
    const tr = view.state.tr.replaceWith(tablePos, tablePos + table.nodeSize, next)
    view.dispatch(tr.scrollIntoView())
  })
}

/** Move the current table column left (-1) or right (+1). */
export function moveColumn(editor: Editor, dir: -1 | 1): void {
  withTableContext(editor, ({ view, table, tablePos, cellIndex }) => {
    const rows: PMNode[] = []
    let ok = true
    table.forEach((row) => {
      const moved = swapChildren(row, cellIndex, cellIndex + dir)
      if (!moved) {
        ok = false
        rows.push(row)
      } else {
        rows.push(moved)
      }
    })
    if (!ok) return
    const next = table.type.create(table.attrs, rows, table.marks)
    const tr = view.state.tr.replaceWith(tablePos, tablePos + table.nodeSize, next)
    view.dispatch(tr.scrollIntoView())
  })
}

/** Drop every explicit column width so the table auto-sizes to its content. */
export function clearColumnWidths(editor: Editor): void {
  withTableContext(editor, ({ view, table, tablePos }) => {
    const rows: PMNode[] = []
    table.forEach((row) => {
      const cells: PMNode[] = []
      row.forEach((cell) => {
        cells.push(cell.type.create({ ...cell.attrs, colwidth: null }, cell.content, cell.marks))
      })
      rows.push(row.type.create(row.attrs, cells, row.marks))
    })
    const next = table.type.create(table.attrs, rows, table.marks)
    const tr = view.state.tr.replaceWith(tablePos, tablePos + table.nodeSize, next)
    view.dispatch(tr)
  })
}

/** Serialise the current table to GFM Markdown (for "copy table"). */
export function tableToMarkdown(editor: Editor): string {
  let md = ''
  withTableContext(editor, ({ table }) => {
    const rows: string[] = []
    table.forEach((row, _offset, index) => {
      const cells: string[] = []
      row.forEach((cell) => {
        cells.push(cell.textContent.replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim())
      })
      rows.push(`| ${cells.join(' | ')} |`)
      if (index === 0) {
        rows.push(`| ${cells.map(() => '---').join(' | ')} |`)
      }
    })
    md = rows.join('\n')
  })
  return md
}

/** Whether the caret currently sits inside a table. */
export function isInTable(editor: Editor | null): boolean {
  if (!editor) return false
  let inTable = false
  runWithView(editor, (view) => {
    const { $from } = view.state.selection
    for (let d = $from.depth; d > 0; d -= 1) {
      if ($from.node(d).type.name === 'table') {
        inTable = true
        return
      }
    }
  })
  return inTable
}
