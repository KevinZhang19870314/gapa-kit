/**
 * Property 6: Kiro hook 文件格式有效性
 *
 * 对于任意语言设置，KiroAdapter.generateHooks() 输出的每个文件应是有效 JSON，
 * 且包含 version: "v1"、hooks 数组，每个 hook 包含 name、trigger、action.type、action.prompt 字段。
 *
 * Feature: cross-ide-gapa-kit, Property 6: Kiro hook 文件格式有效性
 *
 * **Validates: Requirements 3.1**
 */

import { describe, it } from 'vitest'
import fc from 'fast-check'
import { loadTemplates } from '../../lib/core/template-engine.mjs'
import KiroAdapter from '../../lib/adapters/kiro-adapter.mjs'

const adapter = new KiroAdapter()

describe('Property 6: Kiro hook 文件格式有效性', () => {
  it('对于任意语言设置，generateHooks() 输出的每个文件应是有效 JSON 且包含必需字段', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('zh', 'en'),
        (lang) => {
          const templates = loadTemplates(lang)
          const ctx = {
            projectRoot: '/tmp/test',
            lang,
            gapaDir: '.gapa',
            templates,
            isUpdate: false,
          }

          const hookFiles = adapter.generateHooks(ctx)

          // Should produce at least one hook file
          if (!Array.isArray(hookFiles) || hookFiles.length === 0) {
            throw new Error('generateHooks() should return a non-empty array')
          }

          for (const file of hookFiles) {
            // Each file must have relativePath and content
            if (typeof file.relativePath !== 'string' || !file.relativePath) {
              throw new Error('Hook file missing relativePath')
            }
            if (typeof file.content !== 'string' || !file.content) {
              throw new Error(`Hook file ${file.relativePath} missing content`)
            }

            // Content must be valid JSON
            let parsed
            try {
              parsed = JSON.parse(file.content)
            } catch (e) {
              throw new Error(
                `Hook file ${file.relativePath} is not valid JSON: ${e.message}`
              )
            }

            // Required top-level fields: version, hooks
            if (parsed.version !== 'v1') {
              throw new Error(
                `Hook file ${file.relativePath} missing or invalid "version" field (expected "v1")`
              )
            }
            if (!Array.isArray(parsed.hooks) || parsed.hooks.length === 0) {
              throw new Error(
                `Hook file ${file.relativePath} missing or empty "hooks" array`
              )
            }

            // Each hook entry: name, trigger, action.type, action.prompt
            for (const hook of parsed.hooks) {
              if (typeof hook.name !== 'string' || !hook.name) {
                throw new Error(
                  `Hook file ${file.relativePath} hook entry missing or empty "name" field`
                )
              }
              if (typeof hook.trigger !== 'string' || !hook.trigger) {
                throw new Error(
                  `Hook file ${file.relativePath} hook entry missing or empty "trigger" field`
                )
              }
              if (!hook.action || typeof hook.action.type !== 'string' || !hook.action.type) {
                throw new Error(
                  `Hook file ${file.relativePath} hook entry missing or invalid "action.type" field`
                )
              }
              if (typeof hook.action.prompt !== 'string' || !hook.action.prompt) {
                throw new Error(
                  `Hook file ${file.relativePath} hook entry missing or empty "action.prompt" field`
                )
              }
            }
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})


// ─── Property 7 ───

/**
 * Property 7: IDE 特定文件格式有效性
 *
 * 对于任意语言设置和任意 IDE 适配器，生成的 steering/rules 文件应符合该 IDE 的格式要求：
 * - Kiro 文件包含有效 YAML front-matter（含 inclusion 字段）
 * - Cursor 文件包含 MDC front-matter（含 alwaysApply: true）
 * - Windsurf 文件包含 YAML front-matter（含 trigger: always_on）
 *
 * Feature: cross-ide-gapa-kit, Property 7: IDE 特定文件格式有效性
 *
 * **Validates: Requirements 3.2, 4.1, 4.2**
 */

import CursorAdapter from '../../lib/adapters/cursor-adapter.mjs'
import WindsurfAdapter from '../../lib/adapters/windsurf-adapter.mjs'

/**
 * Parse YAML front-matter from a markdown/mdc string.
 * Returns the raw YAML block between the first pair of `---` delimiters.
 * Returns null if no valid front-matter found.
 */
function parseFrontMatter(content) {
  const trimmed = content.trimStart()
  if (!trimmed.startsWith('---')) return null
  const endIdx = trimmed.indexOf('---', 3)
  if (endIdx === -1) return null
  return trimmed.substring(3, endIdx).trim()
}

/**
 * Extract a simple key: value from a YAML block.
 * Handles both quoted and unquoted values.
 */
function yamlValue(yaml, key) {
  const re = new RegExp(`^${key}:\\s*(.+)$`, 'm')
  const m = yaml.match(re)
  if (!m) return undefined
  let val = m[1].trim()
  // Strip surrounding quotes
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1)
  }
  return val
}

const kiroAdapter = new KiroAdapter()
const cursorAdapter = new CursorAdapter()
const windsurfAdapter = new WindsurfAdapter()

describe('Property 7: IDE 特定文件格式有效性', () => {
  it('Kiro steering 文件包含有效 YAML front-matter（含 inclusion 字段）', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('zh', 'en'),
        (lang) => {
          const templates = loadTemplates(lang)
          const ctx = {
            projectRoot: '/tmp/test',
            lang,
            gapaDir: '.gapa',
            templates,
            isUpdate: false,
          }

          const files = kiroAdapter.generateSteering(ctx)

          if (!Array.isArray(files) || files.length === 0) {
            throw new Error('generateSteering() should return a non-empty array')
          }

          for (const file of files) {
            const fm = parseFrontMatter(file.content)
            if (fm === null) {
              throw new Error(
                `Kiro steering file ${file.relativePath} missing YAML front-matter`
              )
            }

            const inclusion = yamlValue(fm, 'inclusion')
            if (!inclusion) {
              throw new Error(
                `Kiro steering file ${file.relativePath} front-matter missing "inclusion" field`
              )
            }
            if (inclusion !== 'auto' && inclusion !== 'manual') {
              throw new Error(
                `Kiro steering file ${file.relativePath} "inclusion" should be "auto" or "manual", got "${inclusion}"`
              )
            }
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('Cursor MDC 文件包含 front-matter（含 alwaysApply: true）', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('zh', 'en'),
        (lang) => {
          const templates = loadTemplates(lang)
          const ctx = {
            projectRoot: '/tmp/test',
            lang,
            gapaDir: '.gapa',
            templates,
            isUpdate: false,
          }

          const files = cursorAdapter.generateSteering(ctx)

          if (!Array.isArray(files) || files.length === 0) {
            throw new Error('generateSteering() should return a non-empty array')
          }

          for (const file of files) {
            const fm = parseFrontMatter(file.content)
            if (fm === null) {
              throw new Error(
                `Cursor MDC file ${file.relativePath} missing front-matter`
              )
            }

            const alwaysApply = yamlValue(fm, 'alwaysApply')
            if (alwaysApply !== 'true') {
              throw new Error(
                `Cursor MDC file ${file.relativePath} front-matter missing or invalid "alwaysApply" field, expected "true", got "${alwaysApply}"`
              )
            }
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('Windsurf 文件包含 YAML front-matter（含 trigger: always_on）', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('zh', 'en'),
        (lang) => {
          const templates = loadTemplates(lang)
          const ctx = {
            projectRoot: '/tmp/test',
            lang,
            gapaDir: '.gapa',
            templates,
            isUpdate: false,
          }

          const files = windsurfAdapter.generateSteering(ctx)

          if (!Array.isArray(files) || files.length === 0) {
            throw new Error('generateSteering() should return a non-empty array')
          }

          for (const file of files) {
            const fm = parseFrontMatter(file.content)
            if (fm === null) {
              throw new Error(
                `Windsurf file ${file.relativePath} missing YAML front-matter`
              )
            }

            const trigger = yamlValue(fm, 'trigger')
            if (trigger !== 'always_on') {
              throw new Error(
                `Windsurf file ${file.relativePath} front-matter missing or invalid "trigger" field, expected "always_on", got "${trigger}"`
              )
            }
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
