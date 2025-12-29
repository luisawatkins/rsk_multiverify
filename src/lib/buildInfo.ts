import type { BuildInfoJson, ContractArtifact } from './types'

type HardhatOutputContracts = Record<
  string,
  Record<string, { abi?: unknown }>
>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeCompilerVersion(version: unknown): string {
  if (typeof version !== 'string') return ''
  const trimmed = version.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('v')) return trimmed
  return `v${trimmed}`
}

function pickCompilerVersion(buildInfo: BuildInfoJson): string {
  const direct = normalizeCompilerVersion(buildInfo.solcLongVersion ?? buildInfo.solcVersion)
  if (direct) return direct
  const input = buildInfo.input
  if (isRecord(input) && typeof input['compiler'] === 'string') {
    return normalizeCompilerVersion(input['compiler'])
  }
  return ''
}

export function parseBuildInfoFileText(text: string): BuildInfoJson[] {
  const parsed = JSON.parse(text) as unknown
  const list = Array.isArray(parsed) ? parsed : [parsed]
  const out: BuildInfoJson[] = []
  for (const item of list) {
    if (!isRecord(item)) continue
    if (!('input' in item) || !('output' in item)) continue
    out.push(item as BuildInfoJson)
  }
  return out
}

export function extractContractsFromBuildInfos(buildInfos: BuildInfoJson[]): ContractArtifact[] {
  const artifacts: ContractArtifact[] = []

  for (const buildInfo of buildInfos) {
    const compilerVersion = pickCompilerVersion(buildInfo)

    const input = buildInfo.input
    const output = buildInfo.output
    if (!isRecord(input) || !isRecord(output)) continue

    const settings = isRecord(input['settings']) ? (input['settings'] as Record<string, unknown>) : undefined
    const optimizerSettings = isRecord(settings?.['optimizer'])
      ? (settings?.['optimizer'] as Record<string, unknown>)
      : undefined
    const optimizer =
      optimizerSettings && typeof optimizerSettings['enabled'] === 'boolean'
        ? {
            enabled: optimizerSettings['enabled'],
            runs: typeof optimizerSettings['runs'] === 'number' ? optimizerSettings['runs'] : undefined,
          }
        : undefined

    const evmVersion = typeof settings?.['evmVersion'] === 'string' ? settings?.['evmVersion'] : undefined

    const contracts = output['contracts']
    if (!isRecord(contracts)) continue
    const typedContracts = contracts as HardhatOutputContracts

    for (const sourcePath of Object.keys(typedContracts)) {
      const byName = typedContracts[sourcePath]
      for (const contractName of Object.keys(byName ?? {})) {
        const fullyQualifiedName = `${sourcePath}:${contractName}`
        const abi = byName?.[contractName]?.abi
        artifacts.push({
          fullyQualifiedName,
          sourcePath,
          contractName,
          compilerVersion,
          evmVersion,
          optimizer,
          standardJsonInput: input,
          abi,
        })
      }
    }
  }

  const deduped = new Map<string, ContractArtifact>()
  for (const a of artifacts) {
    const key = `${a.compilerVersion}::${a.fullyQualifiedName}`
    if (!deduped.has(key)) deduped.set(key, a)
  }

  return [...deduped.values()].sort((a, b) => a.fullyQualifiedName.localeCompare(b.fullyQualifiedName))
}

