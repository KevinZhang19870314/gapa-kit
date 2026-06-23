/**
 * CLI Commands — 单元测试
 *
 * 使用 child_process.execFile 调用 CLI 入口，验证：
 * - 参数解析（--target, --lang）
 * - 不支持的 target/lang 值的错误输出
 * - init 命令生成文件
 * - update 命令保留用户数据
 * - status 命令输出
 * - help/version 命令
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CLI_PATH = resolve(__dirname, '..', '..', 'bin', 'gapa.mjs')
const NODE = process.execPath

/**
 * Run the CLI with given args in a specific cwd.
 * @param {string[]} args
 * @param {string} [cwd]
 * @returns {Promise<{ stdout: string, stderr: string, code: number }>}
 */
function runCLI(args, cwd) {
  return new Promise((res) => {
    execFile(NODE, [CLI_PATH, ...args], { cwd, env: { ...process.env } }, (err, stdout, stderr) => {
      res({
        stdout: stdout || '',
        stderr: stderr || '',
        code: err ? err.code : 0,
      })
    })
  })
}

describe('CLI — help & version', () => {
  it('should show help with no arguments', async () => {
    const { stdout } = await runCLI(['help'])
    expect(stdout).toContain('gapa v')
    expect(stdout).toContain('--target')
    expect(stdout).toContain('--lang')
  })

  it('should show version', async () => {
    const { stdout } = await runCLI(['version'])
    expect(stdout).toMatch(/gapa v\d+\.\d+\.\d+/)
  })
})

describe('CLI — argument validation', () => {
  it('should error on unsupported --target', async () => {
    const { stderr, code } = await runCLI(['init', '--target', 'emacs'])
    expect(code).not.toBe(0)
    expect(stderr).toContain('emacs')
    expect(stderr).toContain('kiro')
  })

  it('should error on unsupported --lang', async () => {
    const { stderr, code } = await runCLI(['init', '--target', 'kiro', '--lang', 'fr'])
    expect(code).not.toBe(0)
    expect(stderr).toContain('fr')
    expect(stderr).toContain('zh')
    expect(stderr).toContain('en')
  })

  it('should error on missing --target value', async () => {
    const { stderr, code } = await runCLI(['init', '--target'])
    expect(code).not.toBe(0)
    expect(stderr).toContain('--target')
  })

  it('should error on missing --lang value', async () => {
    const { stderr, code } = await runCLI(['init', '--target', 'kiro', '--lang'])
    expect(code).not.toBe(0)
    expect(stderr).toContain('--lang')
  })
})


describe('CLI — init command', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'gapa-cli-init-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should init for kiro target and generate shared + IDE files', async () => {
    const { stdout, code } = await runCLI(['init', '--target', 'kiro'], tmpDir)
    expect(code).toBe(0)

    // Shared .gapa/ files
    expect(existsSync(resolve(tmpDir, '.gapa/memory.md'))).toBe(true)
    expect(existsSync(resolve(tmpDir, '.gapa/preferences.md'))).toBe(true)
    expect(existsSync(resolve(tmpDir, '.gapa/skills/_example.md'))).toBe(true)
    expect(existsSync(resolve(tmpDir, '.gapa/.gaparc.json'))).toBe(true)
    expect(existsSync(resolve(tmpDir, '.gapa/.gitignore'))).toBe(true)

    // Kiro-specific files
    expect(existsSync(resolve(tmpDir, '.kiro/steering/gapa.md'))).toBe(true)
    expect(existsSync(resolve(tmpDir, '.kiro/steering/gapa-preferences.md'))).toBe(true)
    expect(existsSync(resolve(tmpDir, '.kiro/hooks/gapa-context-load.json'))).toBe(true)
    expect(existsSync(resolve(tmpDir, '.kiro/hooks/gapa-evaluation.json'))).toBe(true)

    // .gaparc.json should contain kiro adapter info
    const config = JSON.parse(readFileSync(resolve(tmpDir, '.gapa/.gaparc.json'), 'utf-8'))
    expect(config.lang).toBe('zh')
    expect(config.installedAdapters.kiro).toBeDefined()
    expect(config.installedAdapters.kiro.formatVersion).toBe('1.0')
  })

  it('should init with --lang en', async () => {
    const { code } = await runCLI(['init', '--target', 'kiro', '--lang', 'en'], tmpDir)
    expect(code).toBe(0)

    const config = JSON.parse(readFileSync(resolve(tmpDir, '.gapa/.gaparc.json'), 'utf-8'))
    expect(config.lang).toBe('en')
  })

  it('should init for multiple targets', async () => {
    const { code } = await runCLI(['init', '--target', 'kiro', '--target', 'cursor'], tmpDir)
    expect(code).toBe(0)

    // Kiro files
    expect(existsSync(resolve(tmpDir, '.kiro/steering/gapa.md'))).toBe(true)
    // Cursor files
    expect(existsSync(resolve(tmpDir, '.cursor/rules/gapa-rules.mdc'))).toBe(true)

    // Shared files only once
    expect(existsSync(resolve(tmpDir, '.gapa/memory.md'))).toBe(true)

    // Config should have both adapters
    const config = JSON.parse(readFileSync(resolve(tmpDir, '.gapa/.gaparc.json'), 'utf-8'))
    expect(config.installedAdapters.kiro).toBeDefined()
    expect(config.installedAdapters.cursor).toBeDefined()
  })

  it('should generate .gapa/.gitignore with memory.md excluded', async () => {
    await runCLI(['init', '--target', 'kiro'], tmpDir)
    const gitignore = readFileSync(resolve(tmpDir, '.gapa/.gitignore'), 'utf-8')
    expect(gitignore).toContain('memory.md')
  })
})

describe('CLI — update command', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'gapa-cli-update-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should error when .gaparc.json does not exist', async () => {
    const { stderr, code } = await runCLI(['update', '--target', 'kiro'], tmpDir)
    expect(code).not.toBe(0)
    expect(stderr).toContain('init')
  })

  it('should update framework files and preserve memory/preferences', async () => {
    // First init
    await runCLI(['init', '--target', 'kiro'], tmpDir)

    // Modify memory and preferences (user data)
    const memoryPath = resolve(tmpDir, '.gapa/memory.md')
    const prefsPath = resolve(tmpDir, '.gapa/preferences.md')
    writeFileSync(memoryPath, '### GAPA-001 | 2025-01-01 | Test task\n- **做得好的：** great\n')
    writeFileSync(prefsPath, '# Custom Preferences\n- I like tabs\n')

    // Run update
    const { code } = await runCLI(['update', '--target', 'kiro'], tmpDir)
    expect(code).toBe(0)

    // Memory and preferences should be preserved
    const memoryContent = readFileSync(memoryPath, 'utf-8')
    expect(memoryContent).toContain('GAPA-001')
    const prefsContent = readFileSync(prefsPath, 'utf-8')
    expect(prefsContent).toContain('I like tabs')

    // Framework files should be updated
    expect(existsSync(resolve(tmpDir, '.kiro/steering/gapa.md'))).toBe(true)
  })

  it('should use language from .gaparc.json', async () => {
    // Init with English
    await runCLI(['init', '--target', 'kiro', '--lang', 'en'], tmpDir)

    // Update (no --lang specified, should use 'en' from config)
    const { stdout, code } = await runCLI(['update', '--target', 'kiro'], tmpDir)
    expect(code).toBe(0)
    // English messages
    expect(stdout).toContain('Updating')
  })

  it('should update .gaparc.json version info', async () => {
    await runCLI(['init', '--target', 'kiro'], tmpDir)

    const configBefore = JSON.parse(readFileSync(resolve(tmpDir, '.gapa/.gaparc.json'), 'utf-8'))
    const installedAt = configBefore.installedAdapters.kiro.installedAt

    // Small delay to ensure updatedAt differs
    await new Promise((r) => setTimeout(r, 50))

    await runCLI(['update', '--target', 'kiro'], tmpDir)

    const configAfter = JSON.parse(readFileSync(resolve(tmpDir, '.gapa/.gaparc.json'), 'utf-8'))
    expect(configAfter.installedAdapters.kiro.installedAt).toBe(installedAt)
    expect(configAfter.installedAdapters.kiro.updatedAt).not.toBe(installedAt)
  })
})

describe('CLI — status command', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'gapa-cli-status-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should error when not installed', async () => {
    const { stderr, code } = await runCLI(['status'], tmpDir)
    expect(code).not.toBe(0)
    expect(stderr).toContain('init')
  })

  it('should show status after init', async () => {
    await runCLI(['init', '--target', 'kiro'], tmpDir)

    const { stdout, code } = await runCLI(['status'], tmpDir)
    expect(code).toBe(0)
    expect(stdout).toContain('Memory')
    expect(stdout).toContain('Preferences')
    expect(stdout).toContain('kiro')
    expect(stdout).toContain('Skills')
  })

  it('should count memory entries', async () => {
    await runCLI(['init', '--target', 'kiro'], tmpDir)

    // Add memory entries
    const memoryPath = resolve(tmpDir, '.gapa/memory.md')
    writeFileSync(memoryPath, [
      '# GAPA Memory',
      '',
      '### GAPA-001 | 2025-01-01 | Task 1',
      '- **做得好的：** good',
      '',
      '### GAPA-002 | 2025-01-02 | Task 2',
      '- **做得好的：** great',
    ].join('\n'))

    const { stdout } = await runCLI(['status'], tmpDir)
    expect(stdout).toContain('2')
  })

  it('should report fully installed status', async () => {
    await runCLI(['init', '--target', 'kiro'], tmpDir)
    const { stdout } = await runCLI(['status'], tmpDir)
    expect(stdout).toMatch(/✅.*安装|✅.*installed/i)
  })
})
