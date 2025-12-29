function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stripHexPrefix(hex: string): string {
  return hex.startsWith('0x') ? hex.slice(2) : hex
}

function assertEvenHex(hex: string): string {
  return hex.length % 2 === 0 ? hex : `0${hex}`
}

function padLeft(hex: string, bytes: number): string {
  const target = bytes * 2
  if (hex.length > target) throw new Error(`Value exceeds ${bytes} bytes`)
  return hex.padStart(target, '0')
}

function padRight(hex: string, bytes: number): string {
  const target = bytes * 2
  if (hex.length > target) throw new Error(`Value exceeds ${bytes} bytes`)
  return hex.padEnd(target, '0')
}

function toUint256(value: bigint): string {
  if (value < 0n) throw new Error('uint cannot be negative')
  return padLeft(value.toString(16), 32)
}

function toInt256(value: bigint): string {
  const min = -(1n << 255n)
  const max = (1n << 255n) - 1n
  if (value < min || value > max) throw new Error('int out of range')
  if (value >= 0n) return padLeft(value.toString(16), 32)
  const mod = 1n << 256n
  return padLeft((mod + value).toString(16), 32)
}

function parseBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) throw new Error('number must be an integer')
    return BigInt(value)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) return BigInt(trimmed)
    if (trimmed.length === 0) throw new Error('empty string')
    return BigInt(trimmed)
  }
  throw new Error('unsupported numeric type')
}

function utf8ToHex(value: string): string {
  return Array.from(new TextEncoder().encode(value))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function normalizeAddress(value: unknown): string {
  if (typeof value !== 'string') throw new Error('address must be a string')
  const hex = stripHexPrefix(value.trim())
  if (!/^[0-9a-fA-F]{40}$/.test(hex)) throw new Error('invalid address')
  return hex.toLowerCase()
}

function normalizeHexBytes(value: unknown): string {
  if (typeof value === 'string') {
    const hex = stripHexPrefix(value.trim())
    if (!/^[0-9a-fA-F]*$/.test(hex)) throw new Error('invalid hex')
    return assertEvenHex(hex.toLowerCase())
  }
  if (value instanceof Uint8Array) {
    return Array.from(value)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }
  throw new Error('bytes must be hex string or Uint8Array')
}

type Encoded = { head: string; tail: string; dynamic: boolean }

function isDynamicType(type: string): boolean {
  if (type === 'string' || type === 'bytes') return true
  if (/\[\]$/.test(type)) return true
  const arrayMatch = type.match(/^(.*)\[(\d+)\]$/)
  if (arrayMatch) return isDynamicType(arrayMatch[1])
  if (type.startsWith('tuple')) return true
  return false
}

function staticWords(type: string): number | undefined {
  if (isDynamicType(type)) return undefined
  const fixedArrayMatch = type.match(/^(.*)\[(\d+)\]$/)
  if (fixedArrayMatch) {
    const inner = fixedArrayMatch[1]
    const length = Number(fixedArrayMatch[2])
    const innerWords = staticWords(inner)
    if (!innerWords) return undefined
    return length * innerWords
  }
  return 1
}

function encodePrimitive(type: string, value: unknown): Encoded {
  if (type === 'address') {
    const addr = normalizeAddress(value)
    return { head: padLeft(addr, 32), tail: '', dynamic: false }
  }
  if (type === 'bool') {
    const v = typeof value === 'boolean' ? value : value === 1 || value === '1' || value === 'true'
    return { head: padLeft(v ? '1' : '0', 32), tail: '', dynamic: false }
  }
  if (type === 'string') {
    const str = typeof value === 'string' ? value : JSON.stringify(value)
    const data = utf8ToHex(str)
    const lengthWord = toUint256(BigInt(data.length / 2))
    const padded = padRight(data, Math.ceil(data.length / 64) * 32)
    return { head: '', tail: `${lengthWord}${padded}`, dynamic: true }
  }
  if (type === 'bytes') {
    const data = normalizeHexBytes(value)
    const lengthWord = toUint256(BigInt(data.length / 2))
    const padded = padRight(data, Math.ceil(data.length / 64) * 32)
    return { head: '', tail: `${lengthWord}${padded}`, dynamic: true }
  }

  const bytesN = type.match(/^bytes(\d{1,2})$/)
  if (bytesN) {
    const n = Number(bytesN[1])
    if (n < 1 || n > 32) throw new Error('invalid bytesN')
    const data = normalizeHexBytes(value)
    if (data.length / 2 !== n) throw new Error(`bytes${n} must be exactly ${n} bytes`)
    return { head: padRight(data, 32), tail: '', dynamic: false }
  }

  const uintN = type.match(/^uint(\d{1,3})?$/)
  if (uintN) {
    const bits = uintN[1] ? Number(uintN[1]) : 256
    if (bits < 8 || bits > 256 || bits % 8 !== 0) throw new Error('invalid uint bits')
    const v = parseBigInt(value)
    const max = (1n << BigInt(bits)) - 1n
    if (v < 0n || v > max) throw new Error('uint out of range')
    return { head: toUint256(v), tail: '', dynamic: false }
  }

  const intN = type.match(/^int(\d{1,3})?$/)
  if (intN) {
    const bits = intN[1] ? Number(intN[1]) : 256
    if (bits < 8 || bits > 256 || bits % 8 !== 0) throw new Error('invalid int bits')
    const v = parseBigInt(value)
    const min = -(1n << (BigInt(bits) - 1n))
    const max = (1n << (BigInt(bits) - 1n)) - 1n
    if (v < min || v > max) throw new Error('int out of range')
    return { head: toInt256(v), tail: '', dynamic: false }
  }

  throw new Error(`unsupported type: ${type}`)
}

function encodeArray(type: string, value: unknown): Encoded {
  const dynamicArrayMatch = type.match(/^(.*)\[\]$/)
  const fixedArrayMatch = type.match(/^(.*)\[(\d+)\]$/)

  if (dynamicArrayMatch) {
    const inner = dynamicArrayMatch[1]
    if (!Array.isArray(value)) throw new Error('dynamic array value must be an array')
    const lengthWord = toUint256(BigInt(value.length))
    const encoded = encodeTupleLike(Array(value.length).fill(inner), value)
    return { head: '', tail: `${lengthWord}${encoded}`, dynamic: true }
  }

  if (fixedArrayMatch) {
    const inner = fixedArrayMatch[1]
    const length = Number(fixedArrayMatch[2])
    if (!Array.isArray(value)) throw new Error('fixed array value must be an array')
    if (value.length !== length) throw new Error('fixed array length mismatch')
    const encoded = encodeTupleLike(Array(length).fill(inner), value)
    const isInnerDynamic = isDynamicType(inner)
    if (isInnerDynamic) return { head: '', tail: encoded, dynamic: true }
    return { head: encoded, tail: '', dynamic: false }
  }

  throw new Error('not an array type')
}

function encodeTupleLike(types: string[], values: unknown[]): string {
  if (types.length !== values.length) throw new Error('types/values length mismatch')

  const encodings: Encoded[] = types.map((t, i) => {
    if (t.startsWith('tuple')) throw new Error('tuple types not supported')
    if (t.includes('[')) return encodeArray(t, values[i])
    return encodePrimitive(t, values[i])
  })

  const headParts = encodings.map((e) => (e.dynamic ? '' : e.head))
  const headSizeBytes = types.reduce((sum, t) => {
    const words = staticWords(t)
    return sum + (words ? words * 32 : 32)
  }, 0)

  let offset = BigInt(headSizeBytes)
  for (let i = 0; i < encodings.length; i++) {
    const e = encodings[i]
    if (!e.dynamic) continue
    headParts[i] = toUint256(offset)
    offset += BigInt(e.tail.length / 2)
  }

  const head = headParts.join('')
  const tail = encodings.filter((e) => e.dynamic).map((e) => e.tail).join('')
  return `${head}${tail}`
}

export type AbiConstructorInput = { name?: string; type: string }

export function extractConstructorInputs(abi: unknown): AbiConstructorInput[] | undefined {
  if (!Array.isArray(abi)) return undefined
  for (const item of abi) {
    if (!isRecord(item)) continue
    if (item['type'] !== 'constructor') continue
    const inputs = item['inputs']
    if (!Array.isArray(inputs)) return []
    const out: AbiConstructorInput[] = []
    for (const input of inputs) {
      if (!isRecord(input)) continue
      if (typeof input['type'] !== 'string') continue
      out.push({ name: typeof input['name'] === 'string' ? input['name'] : undefined, type: input['type'] })
    }
    return out
  }
  return []
}

export function encodeConstructorArgsHex(
  abi: unknown,
  constructorArgs: unknown[] | undefined,
): string | undefined {
  const inputs = extractConstructorInputs(abi)
  if (!inputs) return undefined
  const args = constructorArgs ?? []
  const types = inputs.map((i) => i.type)
  const encoded = encodeTupleLike(types, args)
  return encoded
}
