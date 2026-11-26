// The integration test maps GitHub's Git remote to a local fixture repository.
const fixture = JSON.parse(process.env.REVIEW_FIXTURE)
global.fetch = async url => {
  if (url === 'https://api.github.com/repos/fixture/project/pulls/42') {
    return Response.json({ base: { sha: fixture.base, repo: { private: false } }, head: { sha: fixture.head } })
  }
  if (url === `https://api.github.com/repos/fixture/project/compare/${fixture.base}...${fixture.head}?per_page=1`) {
    return Response.json({ merge_base_commit: { sha: fixture.mergeBase } })
  }
  throw new Error('Unexpected HTTP request: ' + url)
}
const Module = require('node:module')
const original = Module._load
Module._load = function (name, ...args) {
  if (name === '../llm/bedrock' && process.env.MOCK_RENDERER) {
    return { createBedrockModel: () => ({ async generateJson(instructions, evidence) {
      if (!instructions.includes('Explain only the supplied facts. Do not infer behavior that is not represented in the structured input.')) {
        throw new Error('Missing grounding instruction')
      }
      if (process.env.MOCK_RENDERER === 'failed') throw new Error('Bedrock unavailable')
      const notes = Object.fromEntries(evidence.map(area => [area.label, 0]))
      if (process.env.MOCK_RENDERER === 'invalid') notes[evidence[0].label] = -1
      return JSON.stringify(notes)
    } }) }
  }
  if (name.includes('bedrock') || name.includes('/llm/')) process.exit(91)
  return original.call(this, name, ...args)
}
