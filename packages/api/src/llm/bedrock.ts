import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime'
import type { JsonModel } from './json-model'

const REPORT_TOOL = 'submit_attention_report'

export function createBedrockModel(modelId: string | undefined, region?: string): JsonModel {
  if (!modelId?.trim()) throw new Error('Set BEDROCK_MODEL_ID to analyze a pull request with Bedrock.')

  // The SDK resolves credentials through AWS_PROFILE or its standard credential chain.
  const client = new BedrockRuntimeClient({ region, maxAttempts: 1 })

  return {
    async generateJson(instructions, evidence, schema) {
      const command = new ConverseCommand({
        modelId,
        system: [{ text: `${instructions}\nReturn the report as arguments to ${REPORT_TOOL}.` }],
        messages: [{ role: 'user', content: [{ text: JSON.stringify(evidence) }] }],
        inferenceConfig: { maxTokens: 6_000, temperature: 0 },
        toolConfig: {
          toolChoice: { tool: { name: REPORT_TOOL } },
          tools: [{
            toolSpec: {
              name: REPORT_TOOL,
              description: 'Return the completed Attention Report.',
              inputSchema: { json: schema },
            },
          }],
        },
      })
      const result = await client.send(command, { abortSignal: AbortSignal.timeout(60_000) })
      const tools = result.output?.message?.content?.flatMap(({ toolUse }) => toolUse ? [toolUse] : [])
      const report = tools?.[0]
      if (result.stopReason !== 'tool_use' || tools?.length !== 1 ||
          report?.name !== REPORT_TOOL || report.input == null) {
        throw new Error('Bedrock did not return a complete analysis.')
      }
      return JSON.stringify(report.input)
    },
  }
}
