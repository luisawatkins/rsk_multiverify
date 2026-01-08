export type Network = 'rskMainnet' | 'rskTestnet'

export type StandardJsonInput = {
  language: string
  sources: Record<string, { content: string }>
  settings?: Record<string, unknown>
  [key: string]: unknown
}

export type StandardJsonOutput = {
  contracts: Record<string, Record<string, unknown>>
  sources?: Record<string, unknown>
  errors?: unknown[]
  [key: string]: unknown
}

export type BuildInfoJson = {
  id?: string
  solcVersion?: string
  solcLongVersion?: string
  input: StandardJsonInput
  output: StandardJsonOutput
}

export type ContractArtifact = {
  fullyQualifiedName: string
  sourcePath: string
  contractName: string
  compilerVersion: string
  evmVersion?: string
  optimizer?: { enabled: boolean; runs?: number }
  standardJsonInput: unknown
  abi?: unknown
}

export type DeploymentSpec = {
  address: string
  fullyQualifiedName?: string
  contractName?: string
  constructorArgs?: unknown[]
  constructorArgsHex?: string
  libraries?: Record<string, string>
}

export type PlanItemStatus =
  | 'pending'
  | 'submitting'
  | 'queued'
  | 'success'
  | 'failed'

export type VerificationPlanItem = {
  id: string
  address: string
  fullyQualifiedName: string
  contractName: string
  compilerVersion: string
  standardJsonInput: unknown
  constructorArgsHex?: string
  status: PlanItemStatus
  message?: string
  guid?: string
  explorerUrl?: string
}

