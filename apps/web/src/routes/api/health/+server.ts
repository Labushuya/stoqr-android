import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const GIT_SHA = process.env.STOQR_GIT_SHA ?? 'unknown';
const BUILD_TIME = process.env.STOQR_BUILD_TIME ?? 'unknown';

export const GET: RequestHandler = () => {
	return json({ ok: true, ts: Date.now(), gitSha: GIT_SHA, buildTime: BUILD_TIME }, { status: 200 });
};
