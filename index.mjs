// Copyright 2021 Google LLC
// 
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
// 
//     https://www.apache.org/licenses/LICENSE-2.0
// 
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {readAll, iter} from 'https://deno.land/std@0.106.0/io/util.ts'
import {existsSync} from 'https://deno.land/std@0.106.0/fs/exists.ts'
import * as colors from 'https://deno.land/std@0.106.0/fmt/colors.ts'
import {singleArgument as escape} from 'https://deno.land/x/shell_escape@1.0.0/index.ts'

export {colors}

function colorize(cmd) {
  return cmd.replace(/^\w+\s/, substr => {
    return colors.brightGreen(substr)
  })
}

function substitute(arg) {
  if (arg instanceof ProcessOutput) {
    return arg.stdout.replace(/\n$/, '')
  }
  return arg
}

let decoder = new TextDecoder();

export async function $(pieces, ...args) {
  let __from = (new Error().stack.split('at ')[2]).trim()
  let cmd = pieces[0], i = 0
  while (i < args.length) cmd += $.quote(substitute(args[i])) + pieces[++i]

  if ($.verbose) console.log('$', colorize(cmd))

  let options = {
    windowsHide: true,
  }
  let shell = '/bin/sh'
  let cwd = Deno.cwd()
  if (typeof $.shell !== 'undefined') shell = $.shell
  if (typeof $.cwd !== 'undefined') cwd = $.cwd

  let child = Deno.run({
    cmd: [shell, '-c', $.prefix + cmd],
    stdout: 'piped',
    stderr: 'piped',
    cwd,
    env: Deno.env.toObject()
  })
  let stdout = '', stderr = '', combined = ''
  let stdoutPromise = (async function() {
    for await (const chunk of iter(child.stdout)) {
      const decoded = decoder.decode(chunk)
      if ($.verbose) await Deno.stdout.write(chunk)
      stdout += decoded
      combined += decoded
    }
    child.stdout.close()
  })()
  let stderrPromise = (async function() {
    for await (const chunk of iter(child.stderr)) {
      const decoded = decoder.decode(chunk)
      if ($.verbose) await Deno.stderr.write(chunk)
      stderr += decoded
      combined += decoded
    }
    child.stderr.close()
  })()
  const { success, code } = await child.status()
  await Promise.all([stdoutPromise, stderrPromise])
  child.close()
  const output = new ProcessOutput({code, stdout, stderr, combined, __from})
  if (success)
    return output
  throw output
}

$.verbose = true
// Try `command`, should cover all Bourne-like shells.
// Try `which`, should cover most other cases.
// Try `type` command, if the rest fails.
$.shell = `${await exec('command -v bash || which bash || type -p bash')}`.trim()
$.prefix = 'set -euo pipefail;'
$.quote = escape
$.cwd = undefined

export function cd(path) {
  if ($.verbose) console.log('$', colorize(`cd ${path}`))
  if (!existsSync(path)) {
    let __from = (new Error().stack.split('at ')[2]).trim()
    console.error(`cd: ${path}: No such directory`)
    console.error(`  at ${__from}`)
    Deno.exit(1)
  }
  $.cwd = path
}

export async function question(query, options) {
  let completer = undefined
  if (Array.isArray(options?.choices)) {
    completer = function completer(line) {
      const completions = options.choices
      const hits = completions.filter((c) => c.startsWith(line))
      return [hits.length ? hits : completions, line]
    }
  }
  let answer = window.prompt(query) // TODO Use an API that supports completions
  return answer ?? ''
}

const nodeFetch = window.fetch;

export async function fetch(url, init) {
  if ($.verbose) {
    if (typeof init !== 'undefined') {
      console.log('$', colorize(`fetch ${url}`), init)
    } else {
      console.log('$', colorize(`fetch ${url}`))
    }
  }
  return nodeFetch(url, init)
}

export class ProcessOutput {
  #code = 0
  #stdout = ''
  #stderr = ''
  #combined = ''
  #__from = ''

  constructor({code, stdout, stderr, combined, __from}) {
    this.#code = code
    this.#stdout = stdout
    this.#stderr = stderr
    this.#combined = combined
    this.#__from = __from
  }

  toString() {
    return this.#combined
  }

  get stdout() {
    return this.#stdout
  }

  get stderr() {
    return this.#stderr
  }

  get exitCode() {
    return this.#code
  }

  get __from() {
    return this.#__from
  }
}

async function exec(cmd) {
  let proc = Deno.run({ cmd: ['/bin/sh', '-c', cmd], stdout: 'piped' })
  let stdoutPromise = readAll(proc.stdout)
  await proc.status()
  const stdout = await stdoutPromise
  proc.stdout.close()
  proc.close()
  return decoder.decode(stdout)
}
