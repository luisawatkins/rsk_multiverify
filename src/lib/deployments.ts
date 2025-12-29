import type { DeploymentSpec } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeAddress(address: string): string {
  const trimmed = address.trim()
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) throw new Error(`Invalid address: ${address}`)
  return trimmed
}

function tryParseHexString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!/^0x[0-9a-fA-F]*$/.test(trimmed)) return undefined
  return trimmed
}

function parseDeploymentItem(item: unknown): DeploymentSpec | undefined {
  if (!isRecord(item)) return undefined
  const addressRaw = item['address'] ?? item['contractAddress'] ?? item['addressHash']
  if (typeof addressRaw !== 'string') return undefined
  const address = normalizeAddress(addressRaw)

  const fullyQualifiedName =
    typeof item['fullyQualifiedName'] === 'string' ? item['fullyQualifiedName'] : undefined

  const contractName =
    typeof item['contractName'] === 'string'
      ? item['contractName']
      : typeof item['name'] === 'string'
        ? item['name']
        : undefined

  const constructorArgs =
    Array.isArray(item['constructorArgs']) ? (item['constructorArgs'] as unknown[]) : Array.isArray(item['args']) ? (item['args'] as unknown[]) : undefined

  const constructorArgsHex =
    tryParseHexString(item['constructorArgsHex']) ??
    tryParseHexString(item['constructorArgs']) ??
    tryParseHexString(item['constructor_arguments']) ??
    tryParseHexString(item['constructorArguements'])

  const libraries = isRecord(item['libraries'])
    ? Object.fromEntries(
        Object.entries(item['libraries']).filter(
          (e): e is [string, string] => typeof e[0] === 'string' && typeof e[1] === 'string',
        ),
      )
    : undefined

  return {
    address,
    fullyQualifiedName,
    contractName,
    constructorArgs,
    constructorArgsHex,
    libraries,
  }
}

export function parseDeploymentsText(text: string): DeploymentSpec[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  const parsed = JSON.parse(trimmed) as unknown
  const out: DeploymentSpec[] = []

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const spec = parseDeploymentItem(item)
      if (spec) out.push(spec)
    }
    return out
  }

  if (isRecord(parsed) && Array.isArray(parsed['transactions'])) {
    const txs = parsed['transactions'] as unknown[]
    for (const tx of txs) {
      if (!isRecord(tx)) continue
      const created = tx['contractAddress'] ?? tx['address']
      const name = tx['contractName'] ?? tx['name']
      const args = tx['arguments'] ?? tx['constructorArgs']
      const spec = parseDeploymentItem({
        address: created,
        contractName: name,
        constructorArgs: Array.isArray(args) ? args : undefined,
        constructorArgsHex: tryParseHexString(tx['constructorArgsHex']) ?? tryParseHexString(tx['constructorArgs']),
      })
      if (spec) out.push(spec)
    }
    return out
  }

  const single = parseDeploymentItem(parsed)
  return single ? [single] : []
}

