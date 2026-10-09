import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

test('project entry files exist', () => {
  assert.ok(existsSync('index.html'))
  assert.ok(existsSync('package.json'))
  assert.ok(existsSync('src'))
})

test('package.json defines build and lint scripts', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  assert.ok(pkg.scripts.build)
  assert.ok(pkg.scripts.lint)
})
