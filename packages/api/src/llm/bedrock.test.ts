import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBedrockModel } from './bedrock'

afterEach(() => vi.restoreAllMocks())

describe('Bedrock model', () => {
  it('sends the instructions and evidence in a single Converse call', async () => {
    const send = vi.spyOn(BedrockRuntimeClient.prototype, 'send').mockResolvedValue({
      stopReason: 'tool_use',
      output: { message: { content: [{ toolUse: { name: 'submit_attention_report', input: { findings: [] } } }] } },
    })

    const model = createBedrockModel('amazon.nova-lite-v1:0', 'us-east-1')
    const schema = { type: 'object', properties: {}, required: [], additionalProperties: false }
    await expect(model.generateJson('Produce JSON.', { files: [] }, schema)).resolves.toBe('{"findings":[]}')
    expect(send).toHaveBeenCalledTimes(1)
    const command = send.mock.calls[0][0]
    expect(command).toBeInstanceOf(ConverseCommand)
    expect(command.input).toMatchObject({
      modelId: 'amazon.nova-lite-v1:0',
      inferenceConfig: { maxTokens: 10_000, temperature: 0 },
      additionalModelRequestFields: { inferenceConfig: { topK: 1 } },
      system: [{ text: expect.stringContaining('Produce JSON.') }],
      toolConfig: { toolChoice: { tool: { name: 'submit_attention_report' } } },
      messages: [{ role: 'user', content: [{ text: '{"files":[]}' }] }],
    })
  })

  it('rejects responses that stop before completion', async () => {
    vi.spyOn(BedrockRuntimeClient.prototype, 'send').mockResolvedValue({ stopReason: 'max_tokens' })

    await expect(createBedrockModel('amazon.nova-lite-v1:0').generateJson('Produce JSON.', {}, {}))
      .rejects.toThrow('Bedrock did not return a complete analysis.')
  })
})
