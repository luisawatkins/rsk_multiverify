import type { Network } from './types'

export type BlockscoutVerificationSubmitResponse = {
  status?: string
  message?: string
  result?: string
}

export type BlockscoutVerificationStatusResponse = {
  status?: string
  message?: string
  result?: string
}

export function getExplorerBaseUrl(network: Network): string {
  return network === 'rskMainnet' ? 'https://rootstock.blockscout.com' : 'https://rootstock-testnet.blockscout.com'
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms)
    const onAbort = () => {
      clearTimeout(id)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    if (signal) {
      if (signal.aborted) return onAbort()
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

async function postForm<T>(
  url: string,
  form: Record<string, string>,
  signal?: AbortSignal,
): Promise<T> {
  const body = new FormData()
  for (const [key, value] of Object.entries(form)) body.append(key, value)
  const res = await fetch(url, {
    method: 'POST',
    body,
    signal,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status} ${res.statusText}${text ? `: ${text}` : ''}`)
  }

  return (await res.json()) as T
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status} ${res.statusText}${text ? `: ${text}` : ''}`)
  }
  return (await res.json()) as T
}

export async function submitStandardJsonInputVerification(params: {
  explorerBaseUrl: string
  apiKey?: string
  contractAddress: string
  contractName: string
  compilerVersion: string
  standardJsonInput: unknown
  constructorArgsHex?: string
  signal?: AbortSignal
}): Promise<{ guid: string }> {
  const url = `${params.explorerBaseUrl.replace(/\/$/, '')}/api?module=contract&action=verifysourcecode`

  const form: Record<string, string> = {
    apikey: params.apiKey ?? '',
    module: 'contract',
    action: 'verifysourcecode',
    codeformat: 'solidity-standard-json-input',
    contractaddress: params.contractAddress,
    contractname: params.contractName,
    compilerversion: params.compilerVersion,
    sourceCode: JSON.stringify(params.standardJsonInput),
  }

  if (params.constructorArgsHex && params.constructorArgsHex.length > 0) {
    const hex = params.constructorArgsHex.startsWith('0x') ? params.constructorArgsHex.slice(2) : params.constructorArgsHex
    form['constructorArguements'] = hex
  }

  const resp = await postForm<BlockscoutVerificationSubmitResponse>(url, form, params.signal)
  const guid = typeof resp.result === 'string' ? resp.result : ''
  if (!guid) throw new Error(resp.message || 'Verification submission failed')
  return { guid }
}

export async function checkVerificationStatus(params: {
  explorerBaseUrl: string
  guid: string
  signal?: AbortSignal
}): Promise<{ statusText: string }> {
  const url = `${params.explorerBaseUrl.replace(/\/$/, '')}/api?module=contract&action=checkverifystatus&guid=${encodeURIComponent(params.guid)}`
  const resp = await getJson<BlockscoutVerificationStatusResponse>(url, params.signal)
  const statusText = typeof resp.result === 'string' ? resp.result : ''
  if (!statusText) throw new Error(resp.message || 'Unknown verification status response')
  return { statusText }
}

export async function waitForFinalStatus(params: {
  explorerBaseUrl: string
  guid: string
  signal?: AbortSignal
  maxAttempts?: number
  initialDelayMs?: number
  pollIntervalMs?: number
}): Promise<{ statusText: string }> {
  const maxAttempts = params.maxAttempts ?? 60
  const initialDelayMs = params.initialDelayMs ?? 1500
  const pollIntervalMs = params.pollIntervalMs ?? 2500

  await sleep(initialDelayMs, params.signal)

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { statusText } = await checkVerificationStatus({
      explorerBaseUrl: params.explorerBaseUrl,
      guid: params.guid,
      signal: params.signal,
    })
    if (!/Pending in queue/i.test(statusText)) return { statusText }
    await sleep(pollIntervalMs, params.signal)
  }

  return { statusText: 'Pending in queue' }
}
