import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

// Build-Herkunft aus dem Image (vom CI via Dockerfile-ARG gesetzt).
const GIT_SHA = process.env.STOQR_GIT_SHA ?? 'unknown'
const GIT_REF = process.env.STOQR_GIT_REF ?? 'unknown'
const BUILD_TIME = process.env.STOQR_BUILD_TIME ?? 'unknown'

// Öffentliches Repo — kein Token nötig; read-only.
const REPO = 'Labushuya/stoqr'
const BRANCH = 'main'

/**
 * GET /api/version
 *
 * Liefert die laufende Build-Version (Git-SHA + Build-Zeit) und prüft — nur auf
 * Anfrage — gegen GitHub, ob auf `main` ein neuerer Commit existiert.
 * Reine Information; kein Eingriff. Fehlertolerant: bei fehlender Netz-/API-
 * Antwort ist `updateAvailable: null` (Prüfung nicht möglich).
 */
export const GET: RequestHandler = async () => {
	const current = {
		gitSha: GIT_SHA,
		gitShaShort: GIT_SHA === 'unknown' ? 'unknown' : GIT_SHA.slice(0, 7),
		gitRef: GIT_REF,
		buildTime: BUILD_TIME,
	}

	// Ohne bekannten laufenden SHA lässt sich nicht vergleichen.
	if (GIT_SHA === 'unknown') {
		return json({ current, latest: null, updateAvailable: null, reason: 'no-build-sha' })
	}

	try {
		const ctrl = new AbortController()
		const t = setTimeout(() => ctrl.abort(), 5000)
		const res = await fetch(`https://api.github.com/repos/${REPO}/commits/${BRANCH}`, {
			headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'stoqr-version-check' },
			signal: ctrl.signal,
		})
		clearTimeout(t)
		if (!res.ok) {
			return json({ current, latest: null, updateAvailable: null, reason: `github-${res.status}` })
		}
		const body = (await res.json()) as {
			sha?: string
			commit?: { message?: string; author?: { date?: string } }
		}
		const latestSha = body.sha ?? null
		const latest = latestSha
			? {
					gitSha: latestSha,
					gitShaShort: latestSha.slice(0, 7),
					message: (body.commit?.message ?? '').split('\n')[0],
					date: body.commit?.author?.date ?? null,
				}
			: null
		const updateAvailable = latestSha ? latestSha !== GIT_SHA : null
		return json({ current, latest, updateAvailable, reason: latestSha ? undefined : 'no-latest-sha' })
	} catch {
		return json({ current, latest: null, updateAvailable: null, reason: 'fetch-failed' })
	}
}
