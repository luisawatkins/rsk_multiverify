import { encodeConstructorArgsHex } from './abi'
import type { ContractArtifact, DeploymentSpec, VerificationPlanItem } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeHex(hex: string): string {
  const trimmed = hex.trim()
  if (!trimmed) return ''
  if (!/^0x[0-9a-fA-F]*$/.test(trimmed)) return ''
  return trimmed.toLowerCase()
}

export function buildVerificationPlan(
  contracts: ContractArtifact[],
  deployments: DeploymentSpec[],
  explorerBaseUrl: string,
): VerificationPlanItem[] {
  const byName = new Map<string, ContractArtifact[]>()

  for (const c of contracts) {
    byName.set(c.contractName, [...(byName.get(c.contractName) ?? []), c])
  }

  const items: VerificationPlanItem[] = []

  for (const dep of deployments) {
    let artifact: ContractArtifact | undefined

    if (dep.fullyQualifiedName) {
      const exact = contracts.find((c) => c.fullyQualifiedName === dep.fullyQualifiedName) ?? undefined
      artifact = exact
    }

    if (!artifact && dep.contractName) {
      const candidates = byName.get(dep.contractName) ?? []
      artifact = candidates.length === 1 ? candidates[0] : candidates[0]
    }

    if (!artifact) continue

    const constructorArgsHex =
      dep.constructorArgsHex && normalizeHex(dep.constructorArgsHex)
        ? normalizeHex(dep.constructorArgsHex).slice(2)
        : dep.constructorArgs
          ? (() => {
              try {
                return encodeConstructorArgsHex(artifact.abi, dep.constructorArgs)
              } catch {
                return undefined
              }
            })()
          : undefined

    const explorerUrl = `${explorerBaseUrl.replace(/\/$/, '')}/address/${dep.address}#code`

    items.push({
      id: `${dep.address}-${artifact.fullyQualifiedName}`,
      address: dep.address,
      fullyQualifiedName: artifact.fullyQualifiedName,
      contractName: artifact.contractName,
      compilerVersion: artifact.compilerVersion,
      standardJsonInput: artifact.standardJsonInput,
      constructorArgsHex,
      status: 'pending',
      explorerUrl,
    })
  }

  const deduped = new Map<string, VerificationPlanItem>()
  for (const item of items) {
    if (!deduped.has(item.address.toLowerCase())) deduped.set(item.address.toLowerCase(), item)
  }

  return [...deduped.values()].sort((a, b) => a.address.localeCompare(b.address))
}

export function tryParseJsonOrEmpty(text: string): unknown | undefined {
  const trimmed = text.trim()
  if (!trimmed) return undefined
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return undefined
  }
}

export function prettifyJson(value: unknown): string {
  if (value === undefined) return ''
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    if (isRecord(value)) return String(value)
    return ''
  }
}
