// Print-CSS driven PDF export: render the HTML into a hidden iframe and invoke
// the system print dialog (user chooses "Save as PDF"). This is the stable,
// cross-platform approach in a pure browser environment (no print-to-pdf API).
import printCss from '@/styles/print.css?url'

export async function toPdf(htmlContent: string): Promise<void> {
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)

  const doc = iframe.contentDocument
  if (!doc) {
    window.print()
    return
  }
  doc.open()
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8" />` +
      `<link rel="stylesheet" href="${printCss}" /></head>` +
      `<body>${htmlContent}</body></html>`,
  )
  doc.close()

  const w = iframe.contentWindow
  if (w) {
    w.focus()
    w.print()
  }
  window.setTimeout(() => iframe.remove(), 1000)
}
