import { expect, it } from 'vitest'
import type { JsonSchema } from '../llm/json-model'
import { explainAreas } from './explain-review'

it('requires all eight areas and maps out-of-order selections back to canonical IDs', async () => {
  const areas = Array.from({ length: 8 }, (_, i) => ({
    id: 'canonical-' + i, changedSymbols: ['symbol' + i],
    semanticEffects: [{ symbol: 'symbol' + i, effect: 'CALL_REMOVED' as const, callee: 'oldCall' }],
    structuralScore: 6, scoreReasons: [],
    blastRadius: { directDependents: [], transitiveDependents: [], affectedFiles: [], depth: 0 },
  }))
  const labels = areas.map((_, i) => 'area' + (i + 1))
  const notes = await explainAreas(areas, {
    async generateJson(_instructions: string, _evidence: unknown, schema: JsonSchema) {
      expect(schema.required).toEqual(labels)
      expect(Object.keys(schema.properties)).toEqual(labels)
      return JSON.stringify(Object.fromEntries([...labels].reverse().map(key => [key, 0])))
    },
  })
  expect(notes).toEqual(areas.map(area => ({
    areaId: area.id, text: 'The change removes a call to oldCall in ' + area.changedSymbols[0] + '.',
  })))
  await expect(explainAreas(areas, { generateJson: async () => '{"area1":0,"area2":0}' }))
    .rejects.toThrow('missing area3 of 8 areas')
})
