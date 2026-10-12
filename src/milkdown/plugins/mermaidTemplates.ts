/**
 * Mermaid diagram templates for the toolbar "图表(Mermaid)" dropdown.
 *
 * Each entry provides a small, valid example for one Mermaid diagram type. The
 * toolbar renders a popover listing these (icon + i18n label); picking one calls
 * `insertDiagramTemplate(id)`, which inserts the example as a ```` ```mermaid ````
 * fenced block at the caret (see `src/milkdown/plugins/mermaid.ts`).
 *
 * `labelKey` points at the `diagram.*` namespace added to every locale file.
 * `code` is the raw Mermaid definition (no surrounding fences).
 */

export interface MermaidTemplate {
  id: string
  icon: string
  labelKey: string
  code: string
}

export const MERMAID_TEMPLATES: MermaidTemplate[] = [
  {
    id: 'flowchart',
    icon: '🔀',
    labelKey: 'diagram.flowchart',
    code: `flowchart TD
    A[开始] --> B{条件判断}
    B -- 是 --> C[执行操作]
    B -- 否 --> D[结束]`,
  },
  {
    id: 'sequence',
    icon: '⇄',
    labelKey: 'diagram.sequence',
    code: `sequenceDiagram
    用户->>服务: 发起请求
    服务-->>用户: 返回响应`,
  },
  {
    id: 'class',
    icon: '▭',
    labelKey: 'diagram.class',
    code: `classDiagram
    class Animal {
      +String name
      +makeSound()
    }
    class Dog {
      +bark()
    }
    Animal <|-- Dog`,
  },
  {
    id: 'state',
    icon: '◉',
    labelKey: 'diagram.state',
    code: `stateDiagram-v2
    [*] --> 待处理
    待处理 --> 处理中
    处理中 --> 已完成
    已完成 --> [*]`,
  },
  {
    id: 'er',
    icon: '⛁',
    labelKey: 'diagram.er',
    code: `erDiagram
    CUSTOMER ||--o{ ORDER : 下单
    ORDER ||--|{ ORDER_ITEM : 包含
    CUSTOMER {
      string name
      string email
    }`,
  },
  {
    id: 'gantt',
    icon: '▤',
    labelKey: 'diagram.gantt',
    code: `gantt
    title 项目计划
    dateFormat YYYY-MM-DD
    section 阶段一
    需求分析 :a1, 2026-01-01, 7d
    设计     :a2, after a1, 5d`,
  },
  {
    id: 'pie',
    icon: '◔',
    labelKey: 'diagram.pie',
    code: `pie title 占比
    "方案A" : 45
    "方案B" : 30
    "方案C" : 25`,
  },
  {
    id: 'journey',
    icon: '➤',
    labelKey: 'diagram.journey',
    code: `journey
    title 用户体验
    section 注册
      打开页面: 5: 用户
      填写表单: 3: 用户`,
  },
]

/** Resolve a template by id, falling back to the first (flowchart). */
export function findTemplate(id: string): MermaidTemplate {
  return MERMAID_TEMPLATES.find((t) => t.id === id) ?? MERMAID_TEMPLATES[0]
}
