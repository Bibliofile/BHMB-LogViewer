import { MessageBot } from '@bhmb/bot'
import { UIExtensionExports } from '@bhmb/ui'
import flatpickr, { Options as fpOptions, Instance as fpInstance } from 'flatpickr'

function debounce(func: () => void, wait: number) {
  let timeout: number
  return () => {
    clearTimeout(timeout)
    timeout = setTimeout(func, wait)
  }
}


// message is a string, you can also load .css and .html files like this
import html from './tab.html'

interface SearchOptions {
  search: string[]
  online: string[]
  sender: string[]
  context: number
}

function parse(search: string): SearchOptions {
  let ret: SearchOptions = { search: [], online: [], sender: [], context: 0 }
  search.toLocaleLowerCase().split(/\s/).filter(Boolean).forEach(word => {
    if (word.startsWith('online=')) ret.online.push(word.substr(7))
    else if (word.startsWith('sender=')) ret.sender.push(word.substr(7))
    else if (word.startsWith('context=')) ret.context = Math.abs(parseInt(word.substr(8), 10)) || 0
    else ret.search.push(word)
  })
  ret.online = ret.online.map(v => v.toLocaleUpperCase())
  ret.sender = ret.sender.map(v => v.toLocaleUpperCase())
  return ret
}

function findIndexes<T>(arr: T[], checker: (item: T, index: number, arr: T[]) => boolean) {
  let indexes: number[] = []
  arr.forEach((el, index) => checker(el, index, arr) && indexes.push(index))
  return indexes
}

MessageBot.registerExtension('bibliofile/logs', async ex => {
  const ui = ex.bot.getExports('ui') as UIExtensionExports | undefined
  if (!ui) return
  let tab = ui.addTab('Logs')
  tab.innerHTML = html
  const query = (selector: string) => tab.querySelector(selector) as HTMLElement

  let logs = await ex.world.getLogs(true)
  let startDate = logs[0].timestamp
  let endDate = logs[logs.length - 1].timestamp

  const render = () => {
    let startIndex = logs.findIndex(entry => entry.timestamp >= startDate) - 1
    let endIndex = logs.findIndex(entry => entry.timestamp >= endDate) + 1

    let list = query('ol')
    let template = query('template') as HTMLTemplateElement
    while (list.firstChild) list.removeChild(list.firstChild)

    let search = query('[data-for=search]') as HTMLInputElement
    let parsed = parse(search.value)

    let online = new Set<string>()
    let matchIndexes = findIndexes(logs, ({message}, index) => {
      let joinMatch = message.match(/ - Player Connected (.*?) \| \d{2,3}\.\d{2,3}\.\d{2,3}\.\d{2,3} \| .{32}$/)
      if (joinMatch) online.add(joinMatch[1].replace(/\s/g, ''))
      let leaveMatch = message.match(/ - Player Disconnected (.*)$/)
      if (leaveMatch) online.delete(leaveMatch[1].replace(/\s/g, ''))

      return [
        !parsed.search.length || parsed.search.some(v => message.toLocaleLowerCase().includes(v)),
        !parsed.sender.length || parsed.sender.some(v => message.startsWith(v)),
        !parsed.online.length || parsed.online.every(name => online.has(name)),
        index >= startIndex,
        index <= endIndex
      ].every(Boolean)
    })

    let currentMatchIndex = 0
    let toRender = logs.filter((_, index) => {
      if (index >= matchIndexes[currentMatchIndex] + parsed.context + 1) currentMatchIndex++
      return Math.abs(matchIndexes[currentMatchIndex] - index) <= parsed.context
    })

    if (toRender.length > 1000) {
      ui.notify(`Showing first 1000 of ${toRender.length} lines`)
      toRender.length = 1000
    }

    toRender.forEach(entry => {
      ui.buildTemplate(template, list, [
        { selector: '.t', text: `${entry.timestamp.toLocaleDateString()} ${entry.timestamp.toLocaleTimeString()}` },
        { selector: '.m', text: entry.message }
      ])
    })
  }
  const debouncedRender = debounce(render, 500)

  let pickerOptions: fpOptions = {
      enableTime: true,
      minDate: logs[0].timestamp,
      inline: true,
  }
  let pickers = [
    flatpickr(query('[data-for=start]'), { ...pickerOptions,
      defaultDate: startDate,
      onChange([date]) { startDate = date; debouncedRender() }
    }) as fpInstance,
    flatpickr(query('[data-for=stop]'), { ...pickerOptions,
      defaultDate: endDate,
      onChange([date]) { endDate = date; debouncedRender() }
    }) as fpInstance,
  ]

  query('[data-for=search]').addEventListener('input', debouncedRender)

  ex.remove = () => {
    pickers.forEach(picker => picker.destroy())
    ui.removeTab(tab)
  }
})
