import { fetchPullRequest } from './pull-request'

async function main() {
  const [repository, number, flag, ...extra] = process.argv.slice(2)
  if (!repository || !number || !/^\d+$/.test(number) || (flag && flag !== '--allow-private') || extra.length) {
    throw new Error('Usage: pnpm fetch-pr owner/repo 123 [--allow-private]')
  }

  const pr = await fetchPullRequest(repository, Number(number), {
    token: process.env.GITHUB_TOKEN,
    allowPrivate: flag === '--allow-private',
  })
  console.log(JSON.stringify(pr, null, 2))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Could not fetch the pull request.')
  process.exitCode = 1
})
