export type JsonSchema = { [key: string]: JsonSchema | JsonSchema[] | string[] | string | number | boolean }

export interface JsonModel {
  generateJson(instructions: string, evidence: unknown, schema: JsonSchema): Promise<string>
}
