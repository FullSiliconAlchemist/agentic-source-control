const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { BedrockRuntimeClient } = require('@aws-sdk/client-bedrock-runtime')

const { pr, files, findings } = JSON.parse(readFileSync(0, 'utf8'))
const prUrl = `https://api.github.com/repos/${pr.base.repo.full_name}/pulls/${pr.number}`
globalThis.fetch = async (url) => {
  if (url === prUrl) return Response.json(pr)
  if (url === `${prUrl}/files?per_page=100&page=1`) return Response.json(files)
  if (url.startsWith('https://api.github.com/') && url.includes('/contents/')) {
    return new Response(null, { status: 404 })
  }
  throw new Error(`Unexpected mock GitHub URL: ${url}`)
}

let modelCalled = false
BedrockRuntimeClient.prototype.send = async (command) => {
  assert.equal(modelCalled, false, 'Expected one model request')
  modelCalled = true
  const evidence = JSON.parse(command.input.messages[0].content[0].text)
  assert.equal(evidence.title, pr.title)
  assert.equal(evidence.headSha, pr.head.sha)
  assert.deepEqual(evidence.files.map(({ path }) => path).sort(), files.map(({ filename }) => filename).sort())
  return {
    stopReason: 'tool_use',
    output: {
      message: {
        content: [{
          toolUse: {
            name: 'submit_attention_report',
            input: { intent: pr.title, findings },
          },
        }],
      },
    },
  }
}
