#!/usr/bin/env node
if (process.argv[2] !== 'review') {
  console.error('Usage: assure review <PR URL | base head> [--deterministic] [--json]')
  process.exitCode = 1
} else {
  require('@swc-node/register')
  require('../src/analysis/analyze-pr.ts').main(process.argv.slice(3))
}
