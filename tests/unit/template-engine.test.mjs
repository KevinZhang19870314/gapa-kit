/**
 * Unit tests for lib/core/template-engine.mjs
 *
 * Validates: Requirements 8.1, 8.5
 */

import { describe, it, expect } from 'vitest'
import {
  loadTemplates,
  replacePlaceholders,
  injectIntoWrapper,
  loadAdapterTemplate,
  SUPPORTED_LANGS,
  DEFAULT_LANG,
} from '../../lib/core/template-engine.mjs'

// ─── loadTemplates ───

describe('loadTemplates', () => {
  it('loads all 6 zh templates', () => {
    const t = loadTemplates('zh')
    expect(t).toHaveProperty('gapaRules')
    expect(t).toHaveProperty('contextLoadPrompt')
    expect(t).toHaveProperty('evaluationPrompt')
    expect(t).toHaveProperty('memoryTemplate')
    expect(t).toHaveProperty('preferencesTemplate')
    expect(t).toHaveProperty('skillExampleTemplate')

    // zh templates should contain Chinese characters
    expect(t.gapaRules).toContain('GAPA')
    expect(t.gapaRules).toContain('任务评估')
    expect(t.memoryTemplate).toContain('任务评估记录')
    expect(t.preferencesTemplate).toContain('用户偏好')
    expect(t.skillExampleTemplate).toContain('触发场景')
    expect(t.contextLoadPrompt).toContain('实质性任务')
    expect(t.evaluationPrompt).toContain('评估流程')
  })

  it('loads all 6 en templates', () => {
    const t = loadTemplates('en')
    expect(t).toHaveProperty('gapaRules')
    expect(t).toHaveProperty('contextLoadPrompt')
    expect(t).toHaveProperty('evaluationPrompt')
    expect(t).toHaveProperty('memoryTemplate')
    expect(t).toHaveProperty('preferencesTemplate')
    expect(t).toHaveProperty('skillExampleTemplate')

    // en templates should contain English text
    expect(t.gapaRules).toContain('GAPA')
    expect(t.gapaRules).toContain('Task Evaluation')
    expect(t.memoryTemplate).toContain('Task Evaluation Records')
    expect(t.preferencesTemplate).toContain('User Preference')
    expect(t.skillExampleTemplate).toContain('Trigger Scenarios')
    expect(t.contextLoadPrompt).toContain('substantive task')
    expect(t.evaluationPrompt).toContain('evaluation process')
  })

  it('all template fields are non-empty strings', () => {
    for (const lang of SUPPORTED_LANGS) {
      const t = loadTemplates(lang)
      for (const [key, value] of Object.entries(t)) {
        expect(typeof value).toBe('string')
        expect(value.trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('throws on unsupported language', () => {
    expect(() => loadTemplates('fr')).toThrow(/Unsupported language/)
    expect(() => loadTemplates('fr')).toThrow(/zh, en/)
  })

  it('default language is zh', () => {
    expect(DEFAULT_LANG).toBe('zh')
  })

  it('templates contain {{gapaDir}} placeholders for path replacement', () => {
    for (const lang of SUPPORTED_LANGS) {
      const t = loadTemplates(lang)
      // gapa-rules.md and prompts reference {{gapaDir}}
      expect(t.gapaRules).toContain('{{gapaDir}}')
      expect(t.contextLoadPrompt).toContain('{{gapaDir}}')
      expect(t.evaluationPrompt).toContain('{{gapaDir}}')
    }
  })
})

// ─── replacePlaceholders ───

describe('replacePlaceholders', () => {
  it('replaces {{gapaDir}} placeholder', () => {
    const result = replacePlaceholders('path: {{gapaDir}}/memory.md', {
      gapaDir: '.gapa',
    })
    expect(result).toBe('path: .gapa/memory.md')
  })

  it('replaces multiple different placeholders', () => {
    const result = replacePlaceholders(
      '{{gapaDir}}/file and {{configDir}}/other v{{version}}',
      { gapaDir: '.gapa', configDir: '.kiro', version: '0.2.0' }
    )
    expect(result).toBe('.gapa/file and .kiro/other v0.2.0')
  })

  it('replaces all occurrences of the same placeholder', () => {
    const result = replacePlaceholders(
      '{{gapaDir}}/a and {{gapaDir}}/b',
      { gapaDir: '.gapa' }
    )
    expect(result).toBe('.gapa/a and .gapa/b')
  })

  it('handles placeholders with spaces: {{ gapaDir }}', () => {
    const result = replacePlaceholders('{{ gapaDir }}/memory.md', {
      gapaDir: '.gapa',
    })
    expect(result).toBe('.gapa/memory.md')
  })

  it('leaves content unchanged when no matching placeholders', () => {
    const content = 'no placeholders here'
    expect(replacePlaceholders(content, { gapaDir: '.gapa' })).toBe(content)
  })

  it('works with actual loaded templates', () => {
    const t = loadTemplates('zh')
    const replaced = replacePlaceholders(t.gapaRules, { gapaDir: '.gapa' })
    expect(replaced).not.toContain('{{gapaDir}}')
    expect(replaced).toContain('.gapa/memory.md')
  })

  it('replaces placeholders in en templates too', () => {
    const t = loadTemplates('en')
    const replaced = replacePlaceholders(t.evaluationPrompt, { gapaDir: '.gapa' })
    expect(replaced).not.toContain('{{gapaDir}}')
    expect(replaced).toContain('.gapa/')
  })
})


// ─── injectIntoWrapper ───

describe('injectIntoWrapper', () => {
  it('injects content into {{slot:name}} placeholders', () => {
    const wrapper = '---\n# Title\n\n{{slot:gapaRules}}\n\n## Footer'
    const result = injectIntoWrapper(wrapper, {
      gapaRules: 'GAPA rules content here',
    })
    expect(result).toBe('---\n# Title\n\nGAPA rules content here\n\n## Footer')
  })

  it('injects multiple slots', () => {
    const wrapper = '{{slot:gapaRules}}\n---\n{{slot:fallbackSteering}}'
    const result = injectIntoWrapper(wrapper, {
      gapaRules: 'Rules',
      fallbackSteering: 'Steering',
    })
    expect(result).toBe('Rules\n---\nSteering')
  })

  it('handles slots with spaces: {{ slot: name }}', () => {
    const wrapper = '{{ slot: gapaRules }}'
    const result = injectIntoWrapper(wrapper, { gapaRules: 'content' })
    expect(result).toBe('content')
  })

  it('works with actual cursor mdc-wrapper template', () => {
    const wrapper = loadAdapterTemplate('cursor', 'mdc-wrapper.tpl')
    const result = injectIntoWrapper(wrapper, {
      description: 'GAPA Self-Learning System',
      gapaRules: '# GAPA Rules',
      contextLoadGuidance: '### Before task\nLoad context',
    })
    expect(result).toContain('alwaysApply: true')
    expect(result).toContain('# GAPA Rules')
    expect(result).toContain('### Before task')
    expect(result).not.toContain('{{slot:')
  })

  it('works with actual kiro steering-wrapper template', () => {
    const wrapper = loadAdapterTemplate('kiro', 'steering-wrapper.tpl')
    const result = injectIntoWrapper(wrapper, {
      inclusion: 'manual',
      gapaRules: '# GAPA Rules Content',
    })
    expect(result).toContain('inclusion: manual')
    expect(result).toContain('# GAPA Rules Content')
    expect(result).not.toContain('{{slot:')
  })

  it('works with actual kiro hook template', () => {
    const wrapper = loadAdapterTemplate('kiro', 'hook.tpl')
    const result = injectIntoWrapper(wrapper, {
      hookName: 'gapa-context-load',
      triggerType: 'UserPromptSubmit',
      prompt: 'Load memory and preferences',
    })
    expect(result).toContain('"name": "gapa-context-load"')
    expect(result).toContain('"trigger": "UserPromptSubmit"')
    // Should be valid JSON
    const parsed = JSON.parse(result)
    expect(parsed.version).toBe('v1')
    expect(parsed.hooks[0].name).toBe('gapa-context-load')
    expect(parsed.hooks[0].action.type).toBe('agent')
    expect(result).not.toContain('{{slot:')
  })

  it('works with windsurf rules-wrapper template', () => {
    const wrapper = loadAdapterTemplate('windsurf', 'rules-wrapper.tpl')
    const result = injectIntoWrapper(wrapper, {
      gapaRules: 'Rules',
      fallbackSteering: 'Steering',
    })
    expect(result).toContain('trigger: always_on')
    expect(result).toContain('Rules')
    expect(result).not.toContain('{{slot:')
  })

  it('works with trae skill-wrapper template', () => {
    const wrapper = loadAdapterTemplate('trae', 'skill-wrapper.tpl')
    const result = injectIntoWrapper(wrapper, {
      skillName: 'gapa-evaluation',
      skillDescription: 'GAPA evaluation skill',
      skillContent: '# Evaluation\n\nDo evaluation.',
    })
    expect(result).toContain('name: gapa-evaluation')
    expect(result).toContain('description: GAPA evaluation skill')
    expect(result).toContain('# Evaluation')
    expect(result).not.toContain('{{slot:')
  })
})

// ─── loadAdapterTemplate ───

describe('loadAdapterTemplate', () => {
  it('loads kiro steering-wrapper template', () => {
    const tpl = loadAdapterTemplate('kiro', 'steering-wrapper.tpl')
    expect(tpl).toContain('{{slot:inclusion}}')
    expect(tpl).toContain('{{slot:gapaRules}}')
  })

  it('loads kiro hook template', () => {
    const tpl = loadAdapterTemplate('kiro', 'hook.tpl')
    expect(tpl).toContain('{{slot:hookName}}')
    expect(tpl).toContain('"version": "v1"')
  })

  it('loads cursor mdc-wrapper template', () => {
    const tpl = loadAdapterTemplate('cursor', 'mdc-wrapper.tpl')
    expect(tpl).toContain('alwaysApply: true')
    expect(tpl).toContain('{{slot:gapaRules}}')
  })

  it('loads claude-code claudemd-wrapper template', () => {
    const tpl = loadAdapterTemplate('claude-code', 'claudemd-wrapper.tpl')
    expect(tpl).toContain('GAPA:START')
    expect(tpl).toContain('GAPA:END')
  })

  it('loads vscode instructions-overview template', () => {
    const tpl = loadAdapterTemplate('vscode', 'instructions-overview.tpl')
    expect(tpl).toContain('GAPA:START')
    expect(tpl).toContain('GAPA:END')
  })

  it('loads windsurf rules-wrapper template', () => {
    const tpl = loadAdapterTemplate('windsurf', 'rules-wrapper.tpl')
    expect(tpl).toContain('trigger: always_on')
  })

  it('loads trae rules-wrapper template', () => {
    const tpl = loadAdapterTemplate('trae', 'rules-wrapper.tpl')
    expect(tpl).toContain('{{slot:gapaRules}}')
  })

  it('loads trae skill-wrapper template', () => {
    const tpl = loadAdapterTemplate('trae', 'skill-wrapper.tpl')
    expect(tpl).toContain('{{slot:skillName}}')
  })

  it('throws on non-existent adapter template', () => {
    expect(() => loadAdapterTemplate('kiro', 'nonexistent.tpl')).toThrow(
      /Adapter template not found/
    )
  })

  it('throws on non-existent IDE', () => {
    expect(() => loadAdapterTemplate('nonexistent-ide', 'wrapper.tpl')).toThrow(
      /Adapter template not found/
    )
  })
})

// ─── End-to-end: load → replace → inject ───

describe('end-to-end template pipeline', () => {
  it('loads zh templates, replaces placeholders, injects into cursor wrapper', () => {
    // 1. Load core templates
    const templates = loadTemplates('zh')

    // 2. Replace placeholders in core content
    const vars = { gapaDir: '.gapa', configDir: '.cursor', version: '0.2.0' }
    const gapaRules = replacePlaceholders(templates.gapaRules, vars)
    const contextLoad = replacePlaceholders(templates.contextLoadPrompt, vars)

    // Verify no unreplaced placeholders remain
    expect(gapaRules).not.toContain('{{gapaDir}}')
    expect(contextLoad).not.toContain('{{gapaDir}}')

    // 3. Inject into cursor wrapper (new slot names: description, gapaRules, contextLoadGuidance)
    const wrapper = loadAdapterTemplate('cursor', 'mdc-wrapper.tpl')
    const output = injectIntoWrapper(wrapper, {
      description: 'GAPA 自我学习系统 — 评估规则与行为指引',
      gapaRules,
      contextLoadGuidance: contextLoad,
    })

    // Verify final output
    expect(output).toContain('alwaysApply: true')
    expect(output).toContain('.gapa/memory.md')
    expect(output).not.toContain('{{slot:')
    expect(output).not.toContain('{{gapaDir}}')
  })

  it('loads en templates, replaces placeholders, injects into kiro wrapper', () => {
    const templates = loadTemplates('en')
    const vars = { gapaDir: '.gapa', configDir: '.kiro', version: '0.2.0' }
    const gapaRules = replacePlaceholders(templates.gapaRules, vars)

    expect(gapaRules).not.toContain('{{gapaDir}}')
    expect(gapaRules).toContain('.gapa/')

    const wrapper = loadAdapterTemplate('kiro', 'steering-wrapper.tpl')
    const output = injectIntoWrapper(wrapper, {
      inclusion: 'manual',
      gapaRules,
    })

    expect(output).toContain('inclusion: manual')
    expect(output).toContain('Task Evaluation')
    expect(output).not.toContain('{{slot:')
    expect(output).not.toContain('{{gapaDir}}')
  })
})
