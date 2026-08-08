import { parse } from 'yaml'

export interface ISelfHostedWorkflowRisk {
  readonly job: string
  readonly trigger: UntrustedWorkflowTrigger
  readonly reason:
    | 'self-hosted'
    | 'configured-label'
    | 'dynamic-runner'
    | 'reusable-workflow'
    | 'untrusted-workflow-source'
}

export type UntrustedWorkflowTrigger = string

/** Only these events are trusted to select a persistent local runner directly. */
const DirectlyTrustedWorkflowTriggers = new Set([
  'push',
  'workflow_dispatch',
  'schedule',
  'release',
  'repository_dispatch',
])

/** These events execute a workflow definition from a ref containing proposed code. */
const UntrustedWorkflowSourceTriggers = new Set(['pull_request', 'merge_group'])

function triggerNames(value: unknown): ReadonlySet<string> {
  if (typeof value === 'string') {
    return new Set([value])
  }
  if (Array.isArray(value)) {
    return new Set(value.filter(item => typeof item === 'string'))
  }
  if (typeof value === 'object' && value !== null) {
    return new Set(Object.keys(value))
  }
  return new Set()
}

function textContainsSelfHosted(value: unknown): boolean {
  if (typeof value === 'string') {
    return /(^|[^a-z0-9-])self-hosted([^a-z0-9-]|$)/i.test(value)
  }
  if (Array.isArray(value)) {
    return value.some(textContainsSelfHosted)
  }
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).some(textContainsSelfHosted)
  )
}

function textContainsRunnerLabel(
  value: unknown,
  runnerLabels: ReadonlyArray<string>
): boolean {
  if (typeof value === 'string') {
    return runnerLabels.some(label => {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(label)) {
        return false
      }
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return new RegExp(
        `(^|[^A-Za-z0-9._-])${escaped}([^A-Za-z0-9._-]|$)`,
        'i'
      ).test(value)
    })
  }
  if (Array.isArray(value)) {
    return value.some(candidate =>
      textContainsRunnerLabel(candidate, runnerLabels)
    )
  }
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).some(candidate =>
      textContainsRunnerLabel(candidate, runnerLabels)
    )
  )
}

function stripExpressionDelimiters(value: string): string {
  const trimmed = value.trim()
  return trimmed.startsWith('${{') && trimmed.endsWith('}}')
    ? trimmed.slice(3, -2).trim()
    : trimmed
}

function unwrapParentheses(value: string): string {
  let expression = value.trim()
  while (expression.startsWith('(') && expression.endsWith(')')) {
    let depth = 0
    let quote: "'" | '"' | null = null
    let wrapsWholeExpression = true
    for (let index = 0; index < expression.length; index++) {
      const character = expression[index]
      if (quote !== null) {
        if (character === quote && expression[index - 1] !== '\\') {
          quote = null
        }
        continue
      }
      if (character === "'" || character === '"') {
        quote = character
      } else if (character === '(') {
        depth++
      } else if (character === ')') {
        depth--
        if (depth === 0 && index !== expression.length - 1) {
          wrapsWholeExpression = false
          break
        }
      }
    }
    if (!wrapsWholeExpression || depth !== 0 || quote !== null) {
      break
    }
    expression = expression.slice(1, -1).trim()
  }
  return expression
}

function splitTopLevel(value: string, operator: '&&' | '||'): string[] {
  const expression = unwrapParentheses(stripExpressionDelimiters(value))
  const parts: string[] = []
  let start = 0
  let depth = 0
  let quote: "'" | '"' | null = null
  for (let index = 0; index < expression.length - 1; index++) {
    const character = expression[index]
    if (quote !== null) {
      if (character === quote && expression[index - 1] !== '\\') {
        quote = null
      }
      continue
    }
    if (character === "'" || character === '"') {
      quote = character
      continue
    }
    if (character === '(' || character === '[' || character === '{') {
      depth++
      continue
    }
    if (character === ')' || character === ']' || character === '}') {
      depth--
      continue
    }
    if (depth === 0 && expression.slice(index, index + 2) === operator) {
      parts.push(expression.slice(start, index).trim())
      start = index + 2
      index++
    }
  }
  parts.push(expression.slice(start).trim())
  return parts
}

function normalizedClause(value: string): string {
  return unwrapParentheses(value).replace(/\s+/g, '')
}

function hasExactEquality(
  conjunction: string,
  left: string,
  right: string
): boolean {
  const escapedLeft = left.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const escapedRight = right.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const equality = new RegExp(`^${escapedLeft}==(['"])${escapedRight}\\1$`, 'i')
  return splitTopLevel(conjunction, '&&').some(clause =>
    equality.test(normalizedClause(clause))
  )
}

function isDispatchConjunction(value: string): boolean {
  return hasExactEquality(value, 'github.event_name', 'workflow_dispatch')
}

function isDispatchOnlyCondition(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    splitTopLevel(value, '||').length === 1 &&
    isDispatchConjunction(value)
  )
}

function runnerTargetIsDispatchGated(
  value: unknown,
  runnerLabels: ReadonlyArray<string>
): boolean {
  if (typeof value !== 'string') {
    return false
  }
  const alternatives = splitTopLevel(value, '||')
  if (alternatives.length !== 2) {
    return false
  }
  const [selfHostedAlternative, hostedFallback] = alternatives
  return (
    (textContainsSelfHosted(selfHostedAlternative) ||
      textContainsRunnerLabel(selfHostedAlternative, runnerLabels)) &&
    isDispatchConjunction(selfHostedAlternative) &&
    /^(['"])[A-Za-z0-9._-]+\1\}*$/.test(hostedFallback.replace(/\s+/g, '')) &&
    !textContainsSelfHosted(hostedFallback) &&
    !textContainsRunnerLabel(hostedFallback, runnerLabels)
  )
}

function workflowCallIsRepositoryMainOnly(
  value: unknown,
  expectedRepository: string
): boolean {
  if (typeof value !== 'string') {
    return false
  }
  const alternatives = splitTopLevel(value, '||')
  let workflowCallArms = 0
  for (const alternative of alternatives) {
    if (isDispatchConjunction(alternative)) {
      continue
    }
    const workflowCall = hasExactEquality(
      alternative,
      'github.event_name',
      'workflow_call'
    )
    if (!workflowCall) {
      return false
    }
    workflowCallArms++
    if (
      !hasExactEquality(alternative, 'github.repository', expectedRepository) ||
      !hasExactEquality(alternative, 'github.ref', 'refs/heads/main')
    ) {
      return false
    }
  }
  return workflowCallArms > 0
}

function isDynamicRunsOn(value: unknown): boolean {
  if (typeof value === 'string') {
    return /\$\{\{|\b(?:matrix|vars|inputs)\.|fromJSON\s*\(/i.test(value)
  }
  if (Array.isArray(value)) {
    return value.some(isDynamicRunsOn)
  }
  return typeof value === 'object' && value !== null
}

/**
 * Flag any workflow whose event ref can replace the audited definition, then
 * inspect the remaining untrusted events for direct runner targeting.
 */
export function assessSelfHostedWorkflowRisk(
  source: string,
  expectedRepository: string,
  runnerLabels: ReadonlyArray<string> = []
): ReadonlyArray<ISelfHostedWorkflowRisk> {
  const document = parse(source) as unknown
  if (
    typeof document !== 'object' ||
    document === null ||
    Array.isArray(document)
  ) {
    throw new Error('workflow-invalid')
  }
  const root = document as Record<string, unknown>
  const triggers = triggerNames(root.on)
  const riskyTriggers = [...triggers].filter(
    trigger => !DirectlyTrustedWorkflowTriggers.has(trigger)
  )
  if (riskyTriggers.length === 0) {
    return []
  }
  if (
    typeof root.jobs !== 'object' ||
    root.jobs === null ||
    Array.isArray(root.jobs)
  ) {
    throw new Error('workflow-jobs-invalid')
  }
  const risks: ISelfHostedWorkflowRisk[] = riskyTriggers
    .filter(trigger => UntrustedWorkflowSourceTriggers.has(trigger))
    .map(trigger => ({
      job: '*',
      trigger,
      reason: 'untrusted-workflow-source',
    }))
  const runnerTargetTriggers = riskyTriggers.filter(
    trigger => !UntrustedWorkflowSourceTriggers.has(trigger)
  )
  for (const [jobName, rawJob] of Object.entries(root.jobs)) {
    if (
      typeof rawJob !== 'object' ||
      rawJob === null ||
      Array.isArray(rawJob)
    ) {
      continue
    }
    const job = rawJob as Record<string, unknown>
    if (job.uses !== undefined && runnerTargetTriggers.length > 0) {
      for (const trigger of runnerTargetTriggers) {
        risks.push({ job: jobName, trigger, reason: 'reusable-workflow' })
      }
      continue
    }
    const selfHosted = textContainsSelfHosted(job['runs-on'])
    const configuredLabel = textContainsRunnerLabel(
      job['runs-on'],
      runnerLabels
    )
    const dynamic = isDynamicRunsOn(job['runs-on'])
    if (!selfHosted && !configuredLabel && !dynamic) {
      continue
    }
    if (isDispatchOnlyCondition(job.if)) {
      continue
    }
    for (const trigger of runnerTargetTriggers) {
      if (runnerTargetIsDispatchGated(job['runs-on'], runnerLabels)) {
        continue
      }
      if (
        trigger === 'workflow_call' &&
        workflowCallIsRepositoryMainOnly(job.if, expectedRepository)
      ) {
        continue
      }
      risks.push({
        job: jobName,
        trigger,
        reason: selfHosted
          ? 'self-hosted'
          : configuredLabel
          ? 'configured-label'
          : 'dynamic-runner',
      })
    }
  }
  return risks
}
