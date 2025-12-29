export type Network = 'rskMainnet' | 'rskTestnet'

export type BuildInfoJson = {
  id?: string
  solcVersion?: string
  solcLongVersion?: string
  input: unknown
  output: unknown
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

