/* eslint-env node */
import { execSync } from 'node:child_process'

function sh(cmd, opts = {}) {
  return execSync(cmd, { stdio: ['pipe', 'pipe', 'pipe'], ...opts }).toString().trim()
}

function getLatestTag() {
  try {
    return sh('git describe --tags --abbrev=0')
  } catch {
    return 'v0.0.0'
  }
}

function parseVersion(tag) {
  const t = tag.startsWith('v') ? tag.slice(1) : tag
  const [maj, min, pat] = t.split('.').map(n => parseInt(n || '0', 10))
  return { maj: maj || 0, min: min || 0, pat: pat || 0 }
}

function formatVersion({ maj, min, pat }) {
  return `v${maj}.${min}.${pat}`
}

function bump(version, type) {
  const v = { ...version }
  if (type === 'major') { v.maj++; v.min = 0; v.pat = 0 }
  else if (type === 'minor') { v.min++; v.pat = 0 }
  else if (type === 'patch') { v.pat++ }
  return v
}

function getLastCommitMessage() {
  try {
    const envMsg = process.env.GIT_MESSAGE
    if (envMsg && envMsg.trim()) return envMsg.trim()
  } catch {
  }
  return sh('git log -1 --pretty=%B')
}

function decideBumpType(message) {
  const firstLine = message.split('\n')[0]
  const breakingInHeader = /!:/u.test(firstLine)
  const match = /^(?<type>feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([\w-]+\))?(!)?:/u.exec(firstLine)
  const breakingInBody = /(^|\n)BREAKING CHANGE:/iu.test(message)

  if (breakingInHeader || breakingInBody) return 'major'
  if (match?.groups?.type === 'feat') return 'minor'
  if (match?.groups?.type) return 'patch'
  return null
}

function tagExists(tag) {
  try {
    sh(`git rev-parse -q --verify refs/tags/${tag}`)
    return true
  } catch {
    return false
  }
}

function ensureGitIdentity() {
  try { sh('git config user.name') } catch { sh('git config user.name "auto-tagger"') }
  try { sh('git config user.email') } catch { sh('git config user.email "auto-tagger@local"') }
}

;(function main() {
  try {
    sh('git rev-parse --is-inside-work-tree')
  } catch {
    console.error('Not inside a git repository.')
    process.exit(1)
  }

  const msg = getLastCommitMessage()
  const bumpType = decideBumpType(msg)

  if (!bumpType) {
    console.log('No conventional commit -> skip tagging.')
    process.exit(0)
  }

  const latest = getLatestTag()
  const next = formatVersion(bump(parseVersion(latest), bumpType))

  if (tagExists(next)) {
    console.log(`Tag ${next} already exists -> skip.`)
    process.exit(0)
  }

  ensureGitIdentity()
  sh(`git tag -a ${next} -m "chore(release): ${next}"`)

  const remote = process.env.GIT_REMOTE || 'origin'
  const autoPush = (process.env.AUTO_PUSH || 'true').toLowerCase() === 'true'

  console.log(`Created tag ${next}.`)
  if (autoPush) {
    try {
      sh(`git push ${remote} ${next}`)
      console.log(`Pushed tag ${next} to ${remote}.`)
    } catch {
      console.error('Pushing tag failed. You can push manually:')
      console.error(`  git push ${remote} ${next}`)
      process.exit(1)
    }
  }
})()
// shanu