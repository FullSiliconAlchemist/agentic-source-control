import { resolve } from 'node:path'
import { config } from 'dotenv'

export function loadGitHubEnv() {
  config({ path: resolve(__dirname, '../../../../.local.env'), quiet: true })
}

export function githubHost(host = 'github.com') {
  if (!/^[a-z\d.-]+(?::\d+)?$/i.test(host)) throw new Error('Expected a GitHub hostname, optionally followed by a port.')
  const url = new URL('https://' + host)
  const publicGitHub = url.host === 'github.com'
  return {
    host: url.host, origin: url.origin,
    api: publicGitHub ? 'https://api.github.com' : url.origin + '/api/v3',
    version: publicGitHub ? '2026-03-10' : '2022-11-28',
  }
}

export function pullRequestTarget(values: string[]) {
  let host = githubHost(process.env.GH_HOST)
  let repository: string
  let number: number
  if (values.length === 1 && values[0].startsWith('https://')) {
    const url = new URL(values[0])
    const match = /^\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)(?:\/(?:files|changes))?\/?$/.exec(url.pathname)
    if (!match || url.username || url.password) throw new Error('Expected an HTTPS GitHub pull request URL.')
    host = githubHost(url.host)
    repository = match[1]
    number = Number(match[2])
  } else if (values.length === 2 && /^[\w.-]+\/[\w.-]+$/.test(values[0]) && /^\d+$/.test(values[1])) {
    repository = values[0]
    number = Number(values[1])
  } else return undefined
  let token: string | undefined
  if (host.host === 'github.com') token = process.env.GITHUB_TOKEN
  else if (process.env.GH_HOST && host.host === githubHost(process.env.GH_HOST).host) token = process.env.GH_ENTERPRISE_TOKEN
  else if (process.env.GH_ENTERPRISE_TOKEN) throw new Error('Set GH_HOST to the PR hostname to use GH_ENTERPRISE_TOKEN.')
  return { host, token, repository, number }
}
