import { resolve } from 'node:path'
import { config } from 'dotenv'
import { createBedrockModel } from '../llm/bedrock'

export function loadAnalysisConfig() {
  const { error } = config({ path: resolve(__dirname, '../../../../.local.env'), quiet: true })
  if (error && (error as NodeJS.ErrnoException).code !== 'ENOENT') {
    throw new Error('Could not read .local.env from the repository root.')
  }

  const { GITHUB_TOKEN, AWS_REGION, BEDROCK_MODEL_ID } = process.env
  return { githubToken: GITHUB_TOKEN, model: createBedrockModel(BEDROCK_MODEL_ID, AWS_REGION) }
}
