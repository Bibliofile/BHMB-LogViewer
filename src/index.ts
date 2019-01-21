import { MessageBot } from '@bhmb/bot'
import { UIExtensionExports } from '@bhmb/ui'
import flatpickr from 'flatpickr'

function debounce(func: () => void, wait: number) {
  let timeout: number
  return () => {
    clearTimeout(timeout)
    timeout = setTimeout(func, wait) as any
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
  const query = <T extends HTMLElement>(selector: string) => tab.querySelector<T>(selector)!
  const queryAll = <T extends HTMLElement>(selector: string) => tab.querySelectorAll<T>(selector)

  let logs = await ex.world.getLogs(true)

  if (!logs.length) {
    ui.notify('No logs fetched, world offline?')
    return
  }

  let startDate = logs[0].timestamp
  let endDate = logs[logs.length - 1].timestamp

  const render = () => {
    let startIndex = logs.findIndex(entry => entry.timestamp >= startDate) - 1
    let endIndex = logs.findIndex(entry => entry.timestamp >= endDate) + 1

    let list = query('ol')
    let template = query<HTMLTemplateElement>('template')
    while (list.firstChild) list.removeChild(list.firstChild)

    let search = query<HTMLInputElement>('[data-for=search]')
    let parsed = parse(search.value)

    // Settings
    let hideWorldMessages = query<HTMLInputElement>('[data-for=world_messages]').checked
    let hideJoinMessages = query<HTMLInputElement>('[data-for=join_messages]').checked
    let hideLeaveMessages = query<HTMLInputElement>('[data-for=leave_messages]').checked
    let hideServerMessages = query<HTMLInputElement>('[data-for=server_messages]').checked

    let online = new Set<string>()
    let matchIndexes = findIndexes(logs, ({message}, index) => {
      let joinMatch = message.match(/ - Player Connected (.*?) \| \d{2,3}\.\d{2,3}\.\d{2,3}\.\d{2,3} \| .{32}$/)
      if (joinMatch) online.add(joinMatch[1].replace(/\s/g, ''))
      let leaveMatch = message.match(/ - Player Disconnected (.*)$/)
      if (leaveMatch) online.delete(leaveMatch[1].replace(/\s/g, ''))

      return [
        !parsed.search.length || parsed.search.some(v => message.toLocaleLowerCase().includes(v)),
        !parsed.sender.length || parsed.sender.some(v => message.replace(/\s/g, '').startsWith(v + ':')),
        !parsed.online.length || parsed.online.every(name => online.has(name)),
        index >= startIndex,
        index <= endIndex
      ].every(Boolean)
    })

    let currentMatchIndex = 0
    let toRender = logs.filter(({message}, index) => {
      if (index >= matchIndexes[currentMatchIndex] + parsed.context + 1) currentMatchIndex++
      return [
        // Matched by context
        Math.abs(matchIndexes[currentMatchIndex] - index) <= parsed.context,
        // Hide world messages?
        !hideWorldMessages || /^[^a-z]+ /.test(message),
        // Hide Join messages?
        !hideJoinMessages || !message.includes(' - Player Connected '),
        // Hide Leave messages?
        !hideLeaveMessages || !(message.includes(' - Player Disconnected') || message.includes(' - Client disconnected:')),
        // Hide server messages?
        !hideServerMessages || !message.startsWith('SERVER: ')
      ].every(Boolean)
    })

    if (toRender.length > 1000) {
      ui.notify(`Showing first 1000 of ${toRender.length} lines`)
      toRender.length = 1000
    }

    toRender.forEach(entry => {
      ui.buildTemplate(template, list, [
        { selector: '.time', text: `${entry.timestamp.toLocaleDateString()} ${entry.timestamp.toLocaleTimeString()}` },
        { selector: '.entry', text: entry.message.replace(/\n/g, '\n\t') }
      ])
    })
  }
  const debouncedRender = debounce(render, 500)

  let pickerOptions: flatpickr.Options.Options = {
      enableTime: true,
      minDate: logs[0].timestamp,
      // inline: true,
  }
  let pickers = [
    flatpickr(query('[data-for=start]'), {
      ...pickerOptions,
      defaultDate: startDate,
      onChange([date]) { startDate = date; debouncedRender() }
    }) as flatpickr.Instance,
    flatpickr(query('[data-for=stop]'), {
      ...pickerOptions,
      defaultDate: endDate,
      onChange([date]) { endDate = date; debouncedRender() }
    }) as flatpickr.Instance,
  ]

  query('[data-for=search]').addEventListener('input', debouncedRender)

  queryAll('.checkbox input').forEach(box => box.addEventListener('change', debouncedRender))

  query('[data-for=toggle]').addEventListener('change', () => {
    let to = query<HTMLInputElement>('[data-for=toggle]').checked
    queryAll<HTMLInputElement>('.checkbox input').forEach(box => box.checked = to)
  })

  ex.remove = () => {
    pickers.forEach(picker => picker.destroy())
    ui.removeTab(tab)
  }
})
