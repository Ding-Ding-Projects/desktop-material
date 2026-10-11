/** Parse Windows command lines without loading a native addon or invoking a shell.
 * The first value retains CommandLineToArgvW's executable-name rules. An empty
 * input returns no arguments rather than the current process executable.
 */
export function parseCommandLineArgv(commandLine: string): string[] {
  // Native command lines end at NUL, including when supplied by integrations.
  commandLine = commandLine.split('\0', 1)[0]
  if (commandLine.length === 0) {
    return []
  }
  const argv: string[] = []
  let offset = 0
  let value = ''
  const isSeparator = (char: string) => char === ' ' || char === '\t'

  if (commandLine[offset] === '"') {
    offset++
    while (offset < commandLine.length && commandLine[offset] !== '"') {
      value += commandLine[offset++]
    }
    if (commandLine[offset] === '"') offset++
  } else {
    // The executable-name scan recognizes ASCII control whitespace as well.
    while (offset < commandLine.length && !/[ \t\n\r\v\f]/.test(commandLine[offset])) {
      value += commandLine[offset++]
    }
    if (offset < commandLine.length) offset++
  }
  argv.push(value)

  while (offset < commandLine.length) {
    while (isSeparator(commandLine[offset])) offset++
    if (offset === commandLine.length) break
    value = ''
    let quotes = 0
    while (offset < commandLine.length) {
      if (isSeparator(commandLine[offset]) && quotes === 0) break
      let backslashes = 0
      while (commandLine[offset] === '\\') {
        backslashes++
        offset++
      }
      if (commandLine[offset] === '"') {
        value += '\\'.repeat(Math.floor(backslashes / 2))
        if (backslashes % 2 === 0) {
          quotes++
        } else {
          value += '"'
        }
        offset++
        while (commandLine[offset] === '"') {
          quotes++
          if (quotes === 3) {
            value += '"'
            quotes = 0
          }
          offset++
        }
        if (quotes === 2) quotes = 0
      } else {
        value += '\\'.repeat(backslashes)
        if (offset === commandLine.length) break
        if (isSeparator(commandLine[offset]) && quotes === 0) break
        value += commandLine[offset++]
      }
    }
    argv.push(value)
  }
  return argv
}
