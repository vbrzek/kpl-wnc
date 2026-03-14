import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import readline from 'readline'

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask = (q) => new Promise(r => rl.question(q, r))

const current = JSON.parse(readFileSync('package.json', 'utf-8')).version
console.log(`\nAktuální verze: ${current}\n`)

const type = (await ask('Typ releasu [patch / minor / major]: ')).trim()
if (!['patch', 'minor', 'major'].includes(type)) {
  console.error('Neplatný typ. Zadej patch, minor nebo major.')
  process.exit(1)
}

// npm version bumpe package.json, vytvoří commit a git tag
execSync(`npm version ${type} --no-workspaces-update`, { stdio: 'inherit' })

const push = (await ask('\nPushnout na remote? [y/n]: ')).trim()
if (push === 'y') {
  execSync('git push && git push --tags', { stdio: 'inherit' })
  console.log('\nHotovo! Tag i commits jsou na remote.')
} else {
  console.log('\nHotovo! Nezapomeň pushnout: git push && git push --tags')
}

rl.close()
