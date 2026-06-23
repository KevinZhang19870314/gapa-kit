/**
 * Property 12: 降级行为指引的完整性与一致性
 *
 * 对于任意 supportsHooks === false 的 IDE 适配器和任意语言设置，
 * generateFallbackSteering() 输出应包含上下文加载 prompt 和评估 prompt，
 * 且这两段 prompt 的核心文本应与 KiroAdapter generateHooks() 中的 prompt 文本一致。
 *
 * Feature: cross-ide-gapa-kit, Property 12: 降级行为指引的完整性与一致性
 *
 * **Validates: Requirements 9.1, 9.2, 9.3**
 */

import { describe, it } from 'vitest'
import fc from 'fast-check'
import { loadTemplates, replacePlaceholders } from '../../lib/core/template-engine.mjs'
import { createAdapter, getSupportedIDEs } from '../../lib/adapters/factory.mjs'

const SUPPORTED_IDES = getSupportedIDEs()

/**
 * Extract the prompt text from a Kiro hook JSON file content.
 * The hook JSON has structure: { version: "v1", hooks: [{ action: { prompt: "..." } }] }
 * The prompt value has escaped newlines (\\n) that need to be unescaped.
 */
function extractHookPrompt(hookContent) {
  const parsed = JSON.parse(hookContent)
  return parsed.hooks[0].action.prompt
}

/**
 * Extract the full fallback steering text from an adapter's output.
 * Combines all file contents into one string for searching.
 */
function extractFallbackText(files) {
  return files.map((f) => f.content).join('\n')
}

/**
 * Normalize prompt text for comparison:
 * - Trim whitespace
 * - Normalize line endings
 * - Collapse multiple blank lines
 */
function normalizePrompt(text) {
  return text
    .replace(/\r\n/g, '\n')
    .trim()
    .replace(/\n{3,}/g, '\n\n')
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegExp(str) {
  return str.split('').map(ch => {
    if ('.*+?^${}()|[]\\'.includes(ch)) return '\\' + ch
    return ch
  }).join('')
}


describe('Property 12: 降级行为指引的完整性与一致性', () => {
  it('对于任意 supportsHooks===false 的适配器，fallback steering 包含与 Kiro hooks 一致的 prompt 文本', async () => {
    // Pre-load all adapters
    const adapterMap = {}
    for (const ide of SUPPORTED_IDES) {
      adapterMap[ide] = await createAdapter(ide)
    }

    // Identify non-hook adapters (supportsHooks === false)
    const nonHookIDEs = SUPPORTED_IDES.filter((ide) => !adapterMap[ide].supportsHooks)
    const kiroAdapter = adapterMap['kiro']

    if (nonHookIDEs.length === 0) {
      throw new Error('No non-hook adapters found — test setup error')
    }

    fc.assert(
      fc.property(
        fc.constantFrom('zh', 'en'),
        fc.constantFrom(...nonHookIDEs),
        (lang, ideName) => {
          const templates = loadTemplates(lang)
          const ctx = {
            projectRoot: '/tmp/test',
            lang,
            gapaDir: '.gapa',
            templates,
            isUpdate: false,
          }

          // 1. Get Kiro hook prompts (the reference)
          const hookFiles = kiroAdapter.generateHooks(ctx)
          if (!Array.isArray(hookFiles) || hookFiles.length < 2) {
            throw new Error('KiroAdapter.generateHooks() should return at least 2 hook files')
          }

          // Find context-load and evaluation hooks
          const contextLoadHook = hookFiles.find((f) =>
            f.relativePath.includes('context-load')
          )
          const evaluationHook = hookFiles.find((f) =>
            f.relativePath.includes('evaluation')
          )

          if (!contextLoadHook) {
            throw new Error('Missing context-load hook file from KiroAdapter')
          }
          if (!evaluationHook) {
            throw new Error('Missing evaluation hook file from KiroAdapter')
          }

          const kiroContextPrompt = normalizePrompt(extractHookPrompt(contextLoadHook.content))
          const kiroEvalPrompt = normalizePrompt(extractHookPrompt(evaluationHook.content))

          // 2. Get fallback steering from the non-hook adapter
          const adapter = adapterMap[ideName]
          const fallbackFiles = adapter.generateFallbackSteering(ctx)

          if (!Array.isArray(fallbackFiles) || fallbackFiles.length === 0) {
            throw new Error(`${ideName} generateFallbackSteering() returned empty array`)
          }

          const fallbackText = extractFallbackText(fallbackFiles)

          // 3. The fallback text should contain both prompts
          // Build the expected prompts from templates (same source as both Kiro hooks and fallback)
          const vars = { gapaDir: '.gapa' }
          const expectedContextPrompt = normalizePrompt(
            replacePlaceholders(templates.contextLoadPrompt, vars)
          )
          const expectedEvalPrompt = normalizePrompt(
            replacePlaceholders(templates.evaluationPrompt, vars)
          )

          // Verify fallback contains context-load prompt
          if (!fallbackText.includes(expectedContextPrompt)) {
            throw new Error(
              `${ideName} fallback steering missing context-load prompt.\n` +
              `Expected to find: ${expectedContextPrompt.substring(0, 80)}...`
            )
          }

          // Verify fallback contains evaluation prompt
          if (!fallbackText.includes(expectedEvalPrompt)) {
            throw new Error(
              `${ideName} fallback steering missing evaluation prompt.\n` +
              `Expected to find: ${expectedEvalPrompt.substring(0, 80)}...`
            )
          }

          // 4. Verify consistency: the core prompt text in fallback should match Kiro hooks
          // Kiro hooks escape the prompt for JSON, so we compare the unescaped versions
          if (kiroContextPrompt !== expectedContextPrompt) {
            throw new Error(
              `Kiro context-load hook prompt differs from template source.\n` +
              `Hook: ${kiroContextPrompt.substring(0, 80)}...\n` +
              `Template: ${expectedContextPrompt.substring(0, 80)}...`
            )
          }

          // Kiro evaluation hook intentionally rewrites .gapa/gapa-rules.md → .kiro/steering/gapa.md
          // because Kiro embeds GAPA rules in steering rather than generating a standalone file.
          // Verify the replacement was applied correctly.
          const gapaRulesPath = vars.gapaDir + '/gapa-rules.md'
          const expectedKiroEvalPrompt = normalizePrompt(
            expectedEvalPrompt.replace(
              new RegExp(escapeRegExp(gapaRulesPath), 'g'),
              '.kiro/steering/gapa.md'
            )
          )
          if (kiroEvalPrompt !== expectedKiroEvalPrompt) {
            throw new Error(
              `Kiro evaluation hook prompt differs from expected (with path rewrite).\n` +
              `Hook: ${kiroEvalPrompt.substring(0, 80)}...\n` +
              `Expected: ${expectedKiroEvalPrompt.substring(0, 80)}...`
            )
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
