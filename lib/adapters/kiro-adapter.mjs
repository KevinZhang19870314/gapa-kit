/**
 * Kiro IDE Adapter — Kiro 适配器
 *
 * Kiro 原生支持 hook 和 steering 机制：
 * - steering 文件使用 YAML front-matter（inclusion: auto/manual）
 * - hook 文件使用 JSON 格式（.kiro/hooks/<id>.json）
 *
 * 生成文件：
 * - .kiro/steering/gapa.md          — GAPA 主规则（inclusion: manual）
 * - .kiro/steering/gapa-preferences.md — 偏好指引（inclusion: auto，指向 .gapa/preferences.md）
 * - .kiro/hooks/gapa-context-load.json — 上下文加载 hook（UserPromptSubmit 触发）
 * - .kiro/hooks/gapa-evaluation.json   — 评估 hook（Stop 触发）
 *
 * @module lib/adapters/kiro-adapter
 */

import { IDEAdapter } from './base-adapter.mjs'
import {
  replacePlaceholders,
  injectIntoWrapper,
  loadAdapterTemplate,
} from '../core/template-engine.mjs'

/** Kiro steering 文件中偏好指引的内容模板（中文） */
const PREFERENCES_POINTER_ZH =
  '用户的沟通偏好、代码风格和项目习惯。在所有交互中提供个性化上下文。\n\n' +
  '请读取 `{{gapaDir}}/preferences.md` 获取用户偏好信息，并在后续交互中应用这些偏好。'

/** Kiro steering 文件中偏好指引的内容模板（英文） */
const PREFERENCES_POINTER_EN =
  "User's communication preferences, code style and project habits. Provides personalized context across all interactions.\n\n" +
  'Please read `{{gapaDir}}/preferences.md` for user preferences and apply them in subsequent interactions.'

export default class KiroAdapter extends IDEAdapter {
  get name() { return 'kiro' }
  get formatVersion() { return '1.0' }
  get configDir() { return '.kiro' }
  get supportsHooks() { return true }

  /**
   * 检测当前项目是否已安装 Kiro 的 GAPA 配置。
   * @param {string} projectRoot
   * @returns {boolean}
   */
  detect(projectRoot) {
    return this.anyPathExists(projectRoot, ['.kiro/steering/', '.kiro/hooks/'])
  }

  /**
   * 生成 Kiro steering 文件。
   *
   * @param {import('./base-adapter.mjs').GenerateContext} ctx
   * @returns {import('./base-adapter.mjs').FileOutput[]}
   */
  generateSteering(ctx) {
    const { lang, gapaDir, templates } = ctx
    const vars = { gapaDir }

    // --- gapa.md: GAPA 主规则 steering ---
    const steeringWrapper = loadAdapterTemplate('kiro', 'steering-wrapper.tpl')
    const rulesContent = replacePlaceholders(templates.gapaRules, vars)
    const gapaSteeringContent = injectIntoWrapper(steeringWrapper, {
      inclusion: 'manual',
      gapaRules: rulesContent,
    })

    // --- gapa-preferences.md: 偏好指引 steering ---
    const prefsPointerRaw = lang === 'en' ? PREFERENCES_POINTER_EN : PREFERENCES_POINTER_ZH
    const prefsPointerContent = replacePlaceholders(prefsPointerRaw, vars)
    const prefsSteeringContent = injectIntoWrapper(steeringWrapper, {
      inclusion: 'auto',
      gapaRules: prefsPointerContent,
    })

    return [
      {
        relativePath: '.kiro/steering/gapa.md',
        content: gapaSteeringContent,
        writeStrategy: 'overwrite',
      },
      {
        relativePath: '.kiro/steering/gapa-preferences.md',
        content: prefsSteeringContent,
        writeStrategy: 'overwrite',
      },
    ]
  }

  /**
   * 生成 Kiro hook 文件。
   *
   * @param {import('./base-adapter.mjs').GenerateContext} ctx
   * @returns {import('./base-adapter.mjs').FileOutput[]}
   */
  generateHooks(ctx) {
    const { gapaDir, templates } = ctx
    const vars = { gapaDir }
    const hookWrapper = loadAdapterTemplate('kiro', 'hook.tpl')

    // --- context-load hook: UserPromptSubmit 触发 ---
    const contextLoadPrompt = replacePlaceholders(templates.contextLoadPrompt, vars).trim()
    const contextLoadContent = injectIntoWrapper(hookWrapper, {
      hookName: 'GAPA Context Load',
      triggerType: 'UserPromptSubmit',
      prompt: escapeJsonString(contextLoadPrompt),
    })

    // --- evaluation hook: Stop 触发 ---
    // Kiro 将 GAPA 规则嵌入 .kiro/steering/gapa.md，而非生成独立的 .gapa/gapa-rules.md，
    // 因此需要将 evaluation prompt 中的 {{gapaDir}}/gapa-rules.md 替换为实际的 steering 路径。
    const evaluationPromptRaw = replacePlaceholders(templates.evaluationPrompt, vars).trim()
    const evaluationPrompt = evaluationPromptRaw.replace(
      new RegExp(`${escapeRegExp(gapaDir)}/gapa-rules\\.md`, 'g'),
      '.kiro/steering/gapa.md'
    )
    const evaluationContent = injectIntoWrapper(hookWrapper, {
      hookName: 'GAPA Post-Task Evaluation',
      triggerType: 'Stop',
      prompt: escapeJsonString(evaluationPrompt),
    })

    return [
      {
        relativePath: '.kiro/hooks/gapa-context-load.json',
        content: contextLoadContent,
        writeStrategy: 'overwrite',
      },
      {
        relativePath: '.kiro/hooks/gapa-evaluation.json',
        content: evaluationContent,
        writeStrategy: 'overwrite',
      },
    ]
  }

  /**
   * 获取 Kiro 已安装的 GAPA 文件列表。
   *
   * @param {string} projectRoot
   * @returns {import('./base-adapter.mjs').InstalledFile[]}
   */
  getInstalledFiles(projectRoot) {
    const files = [
      { relativePath: '.kiro/steering/gapa.md', label: 'GAPA Rules (steering)' },
      { relativePath: '.kiro/steering/gapa-preferences.md', label: 'Preferences Pointer (steering)' },
      { relativePath: '.kiro/hooks/gapa-context-load.json', label: 'Context Load Hook' },
      { relativePath: '.kiro/hooks/gapa-evaluation.json', label: 'Evaluation Hook' },
    ]

    return files.map((f) => ({
      ...f,
      exists: this.pathExists(projectRoot, f.relativePath),
    }))
  }
}

// ─── Internal helpers ───

/**
 * 转义正则表达式中的特殊字符。
 * @param {string} str
 * @returns {string}
 */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 转义 JSON 字符串中的特殊字符。
 * hook.tpl 中 prompt 字段需要是合法的 JSON 字符串值。
 * @param {string} str
 * @returns {string}
 */
function escapeJsonString(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
}
