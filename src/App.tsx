import { useMemo, useRef, useState } from 'react'
import './App.css'
import { extractContractsFromBuildInfos, parseBuildInfoFileText } from './lib/buildInfo'
import { getExplorerBaseUrl, submitStandardJsonInputVerification, waitForFinalStatus } from './lib/blockscout'
import { parseDeploymentsText } from './lib/deployments'
import { buildVerificationPlan, prettifyJson } from './lib/plan'
import type { BuildInfoJson, ContractArtifact, Network, VerificationPlanItem } from './lib/types'

function App() {
  const [network, setNetwork] = useState<Network>('rskTestnet')
  const [apiKey, setApiKey] = useState('')
  const [buildInfos, setBuildInfos] = useState<BuildInfoJson[]>([])
  const [contracts, setContracts] = useState<ContractArtifact[]>([])
  const [buildInfoError, setBuildInfoError] = useState<string | undefined>()

  const [deploymentsText, setDeploymentsText] = useState('')
  const [deploymentsError, setDeploymentsError] = useState<string | undefined>()

  const [plan, setPlan] = useState<VerificationPlanItem[]>([])
  const [planError, setPlanError] = useState<string | undefined>()

  const [isRunning, setIsRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const explorerBaseUrl = useMemo(() => getExplorerBaseUrl(network), [network])

  const stats = useMemo(() => {
    const by = (s: VerificationPlanItem['status']) => plan.filter((p) => p.status === s).length
    return {
      totalContracts: contracts.length,
      totalBuildInfos: buildInfos.length,
      totalPlan: plan.length,
      pending: by('pending'),
      submitting: by('submitting'),
      queued: by('queued'),
      success: by('success'),
      failed: by('failed'),
    }
  }, [contracts.length, buildInfos.length, plan])

  function updatePlanItem(id: string, patch: Partial<VerificationPlanItem>) {
    setPlan((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  async function onBuildInfoFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return
    setBuildInfoError(undefined)
    try {
      const all: BuildInfoJson[] = []
      for (const file of Array.from(files)) {
        const text = await file.text()
        const parsed = parseBuildInfoFileText(text)
        all.push(...parsed)
      }
      setBuildInfos(all)
      const extracted = extractContractsFromBuildInfos(all)
      setContracts(extracted)
      setPlan([])
    } catch (e) {
      setBuildInfoError(e instanceof Error ? e.message : 'Failed to parse build-info')
      setBuildInfos([])
      setContracts([])
      setPlan([])
    }
  }

  async function onDeploymentFileSelected(files: FileList | null) {
    if (!files || files.length === 0) return
    const file = files[0]
    const text = await file.text()
    setDeploymentsText(text)
  }

  function generatePlan() {
    setDeploymentsError(undefined)
    setPlanError(undefined)
    try {
      const deployments = parseDeploymentsText(deploymentsText)
      if (deployments.length === 0) {
        setPlan([])
        setDeploymentsError('No deployments detected from the provided JSON.')
        return
      }
      const nextPlan = buildVerificationPlan(contracts, deployments, explorerBaseUrl)
      if (nextPlan.length === 0) {
        setPlan([])
        setPlanError('No plan items could be matched to uploaded build-info contracts.')
        return
      }
      setPlan(nextPlan)
    } catch (e) {
      setPlan([])
      setDeploymentsError(e instanceof Error ? e.message : 'Failed to parse deployments JSON')
    }
  }

  async function runPlan() {
    if (isRunning) return
    if (plan.length === 0) return
    setIsRunning(true)
    setPlanError(undefined)
    const controller = new AbortController()
    abortRef.current = controller

    try {
      for (const item of plan) {
        if (controller.signal.aborted) break
        if (item.status === 'success') continue
        updatePlanItem(item.id, { status: 'submitting', message: undefined })

        const compilerVersion = item.compilerVersion?.trim()
        if (!compilerVersion) {
          updatePlanItem(item.id, { status: 'failed', message: 'Missing compiler version in build-info.' })
          continue
        }

        const { guid } = await submitStandardJsonInputVerification({
          explorerBaseUrl,
          apiKey: apiKey.trim() ? apiKey.trim() : undefined,
          contractAddress: item.address,
          contractName: item.fullyQualifiedName,
          compilerVersion,
          standardJsonInput: item.standardJsonInput,
          constructorArgsHex: item.constructorArgsHex,
          signal: controller.signal,
        })

        updatePlanItem(item.id, { status: 'queued', guid, message: 'Submitted. Waiting for verification result…' })

        const { statusText } = await waitForFinalStatus({
          explorerBaseUrl,
          guid,
          signal: controller.signal,
        })

        if (/Pass - Verified/i.test(statusText)) {
          updatePlanItem(item.id, { status: 'success', message: statusText })
        } else {
          updatePlanItem(item.id, { status: 'failed', message: statusText })
        }
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setPlanError('Run canceled.')
      } else {
        setPlanError(e instanceof Error ? e.message : 'Verification run failed')
      }
    } finally {
      setIsRunning(false)
      abortRef.current = null
    }
  }

  function cancelRun() {
    abortRef.current?.abort()
  }

  return (
    <div className="container">
      <header className="header">
        <div className="hero">
          <div className="heroLeft">
            <div className="title">RSK Multi-Verify</div>
            <div className="subtitle">Upload build-info, paste deployments, and verify your whole deployment in one run.</div>
            <div className="metaRow">
              <span className={`chip ${network === 'rskMainnet' ? 'chip-mainnet' : 'chip-testnet'}`}>
                <span className="chipDot" />
                {network === 'rskMainnet' ? 'Rootstock Mainnet' : 'Rootstock Testnet'}
              </span>
              <a className="chipLink" href={explorerBaseUrl} target="_blank" rel="noreferrer">
                {explorerBaseUrl}
              </a>
            </div>
          </div>
          <div className="heroRight">
            <div className="heroCard">
              <div className="heroStats">
                <div className="stat">
                  <div className="statValue">{stats.totalContracts}</div>
                  <div className="statLabel">Contracts detected</div>
                </div>
                <div className="stat">
                  <div className="statValue">{stats.totalPlan}</div>
                  <div className="statLabel">Plan items</div>
                </div>
                <div className="stat">
                  <div className="statValue">{stats.success}</div>
                  <div className="statLabel">Verified</div>
                </div>
                <div className="stat">
                  <div className="statValue">{stats.failed}</div>
                  <div className="statLabel">Failed</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="panel">
        <div className="panelTitle">
          <div>1) Inputs</div>
          <div className="hint">
            {stats.totalBuildInfos > 0 ? `${stats.totalBuildInfos} build-info • ${stats.totalContracts} contracts` : 'Upload build-info to begin'}
          </div>
        </div>

        <div className="grid">
          <div className="field">
            <label>Network</label>
            <select value={network} onChange={(e) => setNetwork(e.target.value as Network)} disabled={isRunning}>
              <option value="rskTestnet">Rootstock Testnet</option>
              <option value="rskMainnet">Rootstock Mainnet</option>
            </select>
          </div>

          <div className="field">
            <label>Blockscout API Key (optional)</label>
            <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API key" disabled={isRunning} />
          </div>
        </div>

        <div className="field">
          <label>Upload Hardhat build-info JSON (artifacts/build-info/*.json)</label>
          <input type="file" accept="application/json" multiple onChange={(e) => void onBuildInfoFilesSelected(e.target.files)} disabled={isRunning} />
          {buildInfoError ? <div className="error">{buildInfoError}</div> : null}
          <div className="hint">
            Detected {stats.totalBuildInfos} build-info file(s) and {stats.totalContracts} contract(s).
          </div>
        </div>

        <div className="field">
          <label>Deployments JSON</label>
          <div className="row">
            <input type="file" accept="application/json" onChange={(e) => void onDeploymentFileSelected(e.target.files)} disabled={isRunning} />
            <button onClick={generatePlan} disabled={isRunning || contracts.length === 0}>
              Generate plan
            </button>
          </div>
          <textarea
            value={deploymentsText}
            onChange={(e) => setDeploymentsText(e.target.value)}
            placeholder={prettifyJson([
              {
                address: '0x0000000000000000000000000000000000000000',
                fullyQualifiedName: 'contracts/Token.sol:Token',
                constructorArgs: ['MyToken', 'MTK', 18],
              },
            ])}
            rows={8}
            spellCheck={false}
            disabled={isRunning}
          />
          {deploymentsError ? <div className="error">{deploymentsError}</div> : null}
        </div>
      </section>

      <section className="panel">
        <div className="panelTitle">
          <div>2) Verification Plan</div>
          <div className="row">
            <button onClick={runPlan} disabled={isRunning || plan.length === 0}>
              Run verification
            </button>
            <button className="btnDanger" onClick={cancelRun} disabled={!isRunning}>
              Cancel
            </button>
            <a className="btnLink" href={explorerBaseUrl} target="_blank" rel="noreferrer">
              Open Explorer
            </a>
          </div>
        </div>

        <div className="summaryRow">
          <div className="pill">Total: {stats.totalPlan}</div>
          <div className="pill">Pending: {stats.pending}</div>
          <div className="pill">Queued: {stats.queued}</div>
          <div className="pill">Success: {stats.success}</div>
          <div className="pill">Failed: {stats.failed}</div>
        </div>

        {planError ? <div className="error">{planError}</div> : null}

        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th>Address</th>
                <th>Contract</th>
                <th>Status</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {plan.length === 0 ? (
                <tr>
                  <td colSpan={4} className="empty">
                    Upload build-info and deployments, then generate a plan.
                  </td>
                </tr>
              ) : (
                plan.map((p) => (
                  <tr key={p.id}>
                    <td className="mono">
                      <a className="link" href={p.explorerUrl} target="_blank" rel="noreferrer">
                        {p.address}
                      </a>
                    </td>
                    <td className="mono">{p.fullyQualifiedName}</td>
                    <td>
                      <span className={`status status-${p.status}`}>{p.status}</span>
                    </td>
                    <td className="resultCell">
                      <div className="resultLine">{p.message ?? ''}</div>
                      {p.guid ? <div className="mono small">guid: {p.guid}</div> : null}
                      {p.constructorArgsHex ? (
                        <div className="mono small">constructor: 0x{p.constructorArgsHex}</div>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export default App
