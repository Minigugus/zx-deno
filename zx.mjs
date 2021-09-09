#!/usr/bin/env -S deno run --unstable --allow-run --allow-read --allow-env

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

import {readAll} from 'https://deno.land/std@0.106.0/io/util.ts'
import {resolve} from 'https://deno.land/std@0.106.0/path/mod.ts'
import * as fs from 'https://deno.land/std@0.106.0/node/fs.ts';
import * as os from 'https://deno.land/std@0.106.0/node/os.ts';
import {$, cd, question, colors, fetch, ProcessOutput} from './index.mjs'
import {version} from './version.js'

Object.assign(window, {
  $,
  cd,
  fetch,
  question,
  colors,
  fs: {...fs, ...fs.promises}, // FIXME Not all functions promisified
  os
})

try {
  let firstArg = Deno.args[0]

  if (['-v', '-V', '--version'].includes(firstArg)) {
    console.log(`zx version ${version}`)
    Deno.exit(0)
  }

  if (typeof firstArg === 'undefined') {
    let ok = await scriptFromStdin()
    if (!ok) {
      console.log(`usage: zx <script>`)
      Deno.exit(2)
    }
  } else if (firstArg.startsWith('http://') || firstArg.startsWith('https://') || firstArg.startsWith('file:///')) {
    await import(firstArg)
  } else {
    await import(resolve(Deno.cwd(), firstArg))
  }

} catch (p) {
  if (p instanceof ProcessOutput) {
    console.error('  at ' + p.__from)
    Deno.exit(1)
  } else {
    throw p
  }
}

async function scriptFromStdin() {
  let script = ''
  if (!Deno.isatty(Deno.stdin.rid)) {
    script = new TextDecoder().decode(await readAll(Deno.stdin))

    if (script.length > 0) {
      await import('data:application/javascript,' + encodeURIComponent(script))
      return true
    }
  }
  return false
}

