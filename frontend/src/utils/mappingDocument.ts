const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

const inlineMarkdown = (value: string) => {
  let output = escapeHtml(value)
  output = output.replace(/`([^`]+)`/g, '<code>$1</code>')
  output = output.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  output = output.replace(/__([^_]+)__/g, '<strong>$1</strong>')
  output = output.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  output = output.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  )
  return output
}

const isTableDivider = (line: string) =>
  /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line)

const tableCells = (line: string) =>
  line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim())

export const renderMappingMarkdown = (markdown: string) => {
  const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n')
  const output: string[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index] ?? ''
    const trimmed = line.trim()
    if (!trimmed) {
      index += 1
      continue
    }

    if (/^:::(warning|info|success|danger)\s*$/.test(trimmed)) {
      const tone = trimmed.slice(3)
      const body: string[] = []
      index += 1
      while (index < lines.length && (lines[index] ?? '').trim() !== ':::') {
        body.push(lines[index] ?? '')
        index += 1
      }
      output.push(
        `<aside class="mapping-callout mapping-callout--${tone}">${body
          .filter(Boolean)
          .map(item => `<p>${inlineMarkdown(item)}</p>`)
          .join('')}</aside>`
      )
      index += 1
      continue
    }

    if (/^```/.test(trimmed)) {
      const code: string[] = []
      index += 1
      while (index < lines.length && !/^```/.test((lines[index] ?? '').trim())) {
        code.push(lines[index] ?? '')
        index += 1
      }
      output.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
      index += 1
      continue
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/)
    if (heading) {
      const level = (heading[1] ?? '#').length
      output.push(`<h${level}>${inlineMarkdown(heading[2] ?? '')}</h${level}>`)
      index += 1
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      output.push('<hr>')
      index += 1
      continue
    }

    if (trimmed.includes('|') && index + 1 < lines.length && isTableDivider(lines[index + 1] ?? '')) {
      let headers = tableCells(trimmed)
      index += 2
      const rows: string[][] = []
      while (index < lines.length && (lines[index] ?? '').trim().includes('|') && (lines[index] ?? '').trim()) {
        rows.push(tableCells(lines[index] ?? ''))
        index += 1
      }
      if (headers.every(header => !header.trim()) && rows.length) {
        headers = rows.shift() || headers
      }
      output.push(
        `<div class="mapping-table-wrap"><table><thead><tr>${headers
          .map(cell => `<th>${inlineMarkdown(cell)}</th>`)
          .join('')}</tr></thead><tbody>${rows
          .map(row => `<tr>${headers.map((_, cellIndex) => `<td>${inlineMarkdown(row[cellIndex] || '')}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`
      )
      continue
    }

    if (/^>\s?/.test(trimmed)) {
      const quote: string[] = []
      while (index < lines.length && /^>\s?/.test((lines[index] ?? '').trim())) {
        quote.push((lines[index] ?? '').trim().replace(/^>\s?/, ''))
        index += 1
      }
      output.push(`<blockquote>${quote.map(item => `<p>${inlineMarkdown(item)}</p>`).join('')}</blockquote>`)
      continue
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = []
      while (index < lines.length && /^[-*]\s+/.test((lines[index] ?? '').trim())) {
        const item = (lines[index] ?? '').trim().replace(/^[-*]\s+/, '')
        const checkbox = item.match(/^\[([ xX])]\s*(.*)$/)
        items.push(
          checkbox
            ? `<li class="mapping-check"><span aria-hidden="true">${(checkbox[1] ?? '').trim() ? '✓' : '○'}</span>${inlineMarkdown(checkbox[2] ?? '')}</li>`
            : `<li>${inlineMarkdown(item)}</li>`
        )
        index += 1
      }
      output.push(`<ul>${items.join('')}</ul>`)
      continue
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = []
      while (index < lines.length && /^\d+\.\s+/.test((lines[index] ?? '').trim())) {
        items.push(`<li>${inlineMarkdown((lines[index] ?? '').trim().replace(/^\d+\.\s+/, ''))}</li>`)
        index += 1
      }
      output.push(`<ol>${items.join('')}</ol>`)
      continue
    }

    const paragraph = [trimmed]
    index += 1
    while (
      index < lines.length &&
      (lines[index] ?? '').trim() &&
      !/^(#{1,4})\s+/.test((lines[index] ?? '').trim()) &&
      !/^([-*]\s+|\d+\.\s+|>\s?|:::|(-{3,}|\*{3,}|_{3,})$)/.test((lines[index] ?? '').trim()) &&
      !((lines[index] ?? '').includes('|') && index + 1 < lines.length && isTableDivider(lines[index + 1] ?? ''))
    ) {
      paragraph.push((lines[index] ?? '').trim())
      index += 1
    }
    output.push(`<p>${paragraph.map(inlineMarkdown).join('<br>')}</p>`)
  }

  return output.join('')
}

export const blankMappingTemplate = (name: string, source: string, target: string) => `# DE-PARA · ${name} (${source} → ${target})

:::warning
Documento em elaboração. As decisões abaixo devem ser validadas antes da publicação.
:::

---

## Visão geral

**Objetivo:** [descreva o resultado esperado]

**Responsáveis pela validação:** [nomes ou área]

## Mapeamento principal

| Origem (${source}) | Destino (${target}) | Status | Observações / ações |
| --- | --- | --- | --- |
| [valor de origem] | [valor de destino] | ⚠️ | [decisão necessária] |

## Decisões e dúvidas

### Pergunta 1 — [título objetivo]

[descreva a pergunta e o impacto da decisão]

**Resposta:** [preencher]

## Regras e exceções

- [regra]
- [exceção]

## Pré-requisitos para ativação

- [ ] Mapeamento revisado pelo cliente
- [ ] Valores obrigatórios cadastrados no sistema de destino
- [ ] Cenário de teste aprovado

## Observações finais

[inclua responsabilidades, limitações e comportamento após a ativação]
`

export const migrationMappingTemplate = (name: string, source: string, target: string) => `${blankMappingTemplate(name, source, target)}

## Execução da migração

**A migração pode ocorrer imediatamente?** [Sim / Não]

**Data acordada:** [dd/mm/aaaa]

### Estratégia para valores não encontrados

**Permitir valor padrão (fallback)?** [Sim / Não]

**Valor padrão:** [preencher quando aplicável]

### Responsabilidades após a migração

[descreva quem mantém os novos registros e como serão tratadas correções posteriores]
`

export const inferMappingMetadata = (text: string, fileName: string) => {
  const normalized = String(text || '').replace(/^\uFEFF/, '')
  const titleLine = normalized.split(/\r?\n/).find(line => /^#\s+/.test(line.trim()))
  const heading = titleLine?.replace(/^#\s+/, '').trim() || ''
  const systems = heading.match(/\(([^()]+?)\s*(?:→|->|â†’)\s*([^()]+?)\)\s*$/)
  const cleanedHeading = heading
    .replace(/^DE-PARA\s*[·\-:]\s*/i, '')
    .replace(/\s*\([^()]+?(?:→|->|â†’)[^()]+?\)\s*$/, '')
    .trim()
  const fallbackName = fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim()
  return {
    name: cleanedHeading || fallbackName || 'Novo de-para',
    sourceSystem: systems?.[1]?.trim() || '',
    targetSystem: systems?.[2]?.trim() || ''
  }
}

export const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo'))
    reader.onload = () => resolve(String(reader.result || '').split(',').pop() || '')
    reader.readAsDataURL(file)
  })

export const readTextAttachment = async (file: File) => {
  const extension = file.name.split('.').pop()?.toLowerCase() || ''
  if (!['md', 'markdown', 'txt', 'csv', 'tsv', 'json', 'html', 'htm', 'xml', 'yaml', 'yml'].includes(extension)) {
    return ''
  }
  const text = (await file.text()).replace(/^\uFEFF/, '')
  if (extension === 'json') {
    try {
      return `## Conteúdo importado\n\n\`\`\`json\n${JSON.stringify(JSON.parse(text), null, 2)}\n\`\`\`\n`
    } catch {
      return text
    }
  }
  if (extension === 'csv' || extension === 'tsv') {
    const separator = extension === 'tsv' ? '\t' : ','
    const rows = text.split(/\r?\n/).filter(Boolean).map(line => {
      const values: string[] = []
      let current = ''
      let quoted = false
      for (let index = 0; index < line.length; index += 1) {
        const character = line[index] ?? ''
        if (character === '"' && line[index + 1] === '"') {
          current += '"'
          index += 1
        } else if (character === '"') {
          quoted = !quoted
        } else if (character === separator && !quoted) {
          values.push(current.trim())
          current = ''
        } else {
          current += character
        }
      }
      values.push(current.trim())
      return values
    })
    if (!rows.length) return text
    const width = Math.max(...rows.map(row => row.length))
    const normalizedRows = rows.map(row => Array.from({ length: width }, (_, index) => (row[index] || '').replace(/\|/g, '\\|')))
    return [
      `| ${normalizedRows[0]?.join(' | ')} |`,
      `| ${Array.from({ length: width }, () => '---').join(' | ')} |`,
      ...normalizedRows.slice(1).map(row => `| ${row.join(' | ')} |`)
    ].join('\n')
  }
  return text
}

export interface ImportedMappingEntry {
  section: string | null
  sourcePath: string
  targetPath: string
  mappingStatus: 'mapped' | 'pending' | 'attention' | 'ignored'
  notes: string | null
}

export const extractMappingEntries = (
  markdown: string,
  sourceSystem: string,
  targetSystem: string
): ImportedMappingEntry[] => {
  const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n')
  const entries: ImportedMappingEntry[] = []
  let currentSection = ''
  let index = 0
  const normalize = (value: string) => value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  while (index < lines.length) {
    const line = (lines[index] || '').trim()
    const heading = line.match(/^#{2,4}\s+(.+)$/)
    if (heading) currentSection = heading[1]?.trim() || ''

    if (line.includes('|') && index + 1 < lines.length && isTableDivider(lines[index + 1] || '')) {
      let headers = tableCells(line)
      const rows: string[][] = []
      index += 2
      while (index < lines.length && (lines[index] || '').trim().includes('|')) {
        rows.push(tableCells(lines[index] || ''))
        index += 1
      }
      if (headers.every(header => !header.trim()) && rows.length) {
        headers = rows.shift() || headers
      }
      const firstHeader = normalize(headers[0] || '')
      const secondHeader = normalize(headers[1] || '')
      const sourceName = normalize(sourceSystem)
      const targetName = normalize(targetSystem)
      const looksLikeMapping =
        headers.length >= 2 &&
        !firstHeader.includes('opcao') &&
        (
          (sourceName && firstHeader.includes(sourceName)) ||
          (targetName && secondHeader.includes(targetName)) ||
          /(origem|campo|conta|condicao|forma|configuracao|valor)/.test(firstHeader)
        ) &&
        /(destino|correspondente|codigo|meio|valor|sistema)/.test(secondHeader + ` ${targetName}`)

      for (const cells of rows) {
        const sourcePath = cells[0]?.replace(/`/g, '').trim() || ''
        const targetPath = cells[1]?.replace(/`/g, '').trim() || ''
        if (looksLikeMapping && sourcePath && targetPath && !/^[-—]+$/.test(sourcePath + targetPath)) {
          const rawStatus = cells[2] || ''
          const statusText = normalize(rawStatus)
          const notes = cells.slice(3).join(' | ').trim()
          const combined = normalize(`${targetPath} ${statusText} ${notes}`)
          const mappingStatus: ImportedMappingEntry['mappingStatus'] =
            combined.includes('desconsider') || combined.includes('nao sera usad')
              ? 'ignored'
              : combined.includes('atencao') || combined.includes('corrigir') || combined.includes('duplicidade') || combined.includes('impede')
                ? 'attention'
                : rawStatus.includes('✅')
                  ? 'mapped'
                  : rawStatus.includes('⚠') || combined.includes('precisa') || combined.includes('criar') || combined.includes('definir')
                    ? 'pending'
                    : 'mapped'
          entries.push({
            section: currentSection || null,
            sourcePath,
            targetPath,
            mappingStatus,
            notes: notes || null
          })
        }
      }
      continue
    }
    index += 1
  }

  return entries.slice(0, 500)
}
