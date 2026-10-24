import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = new URL('../../docs/product/policies-draft-20261024/', import.meta.url);
const banner = '[시험용 정책] 현재 테스트 계정의 가입 흐름 확인용 초안입니다. 정식 출시 시행일은 미정입니다. 아래 원문은 추후 새 버전으로 교체합니다.\n\n';
const quote = value => "'" + value.replaceAll("'", "''") + "'";
export function prepareTestPolicySql({ terms, privacy, location, publishedAt, version = 'runpen-test-20261024-v1' }) {
  if (!/^runpen-test-[a-zA-Z0-9._-]+$/.test(version) || version.length > 70) throw new Error('Use a new runpen-test- version (at most 70 characters).');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(publishedAt ?? '') || !Number.isFinite(Date.parse(publishedAt))) throw new Error('Provide the chosen TEST publication timestamp with timezone. This is not a launch effective date.');
  for (const body of [terms, privacy, location]) if (typeof body !== 'string' || !body.trim() || [...banner + body].length > 100000 || body.includes('\0')) throw new Error('Invalid policy document.');
  const body = value => quote(banner + value);
  return `-- PREPARATION ONLY. Review and execute later, after explicit deployment approval.
-- Test publication: ${publishedAt}; formal launch effective date remains UNDECIDED.
-- Source documents are unchanged after the test banner. No account/consent writes.
BEGIN;
SET LOCAL standard_conforming_strings = on;
LOCK TABLE public.membership_policies, public.service_policies IN SHARE ROW EXCLUSIVE MODE;
-- Refuse existing versions before changing active publication. No upsert or body update.
DO $guard$
BEGIN
 IF EXISTS (SELECT 1 FROM public.membership_policies WHERE id=${quote(version)})
 OR EXISTS (SELECT 1 FROM public.service_policies WHERE id IN (${quote(version + '-privacy')},${quote(version + '-location')})) THEN
  RAISE EXCEPTION 'Version already exists. Inspect the prior publication; use a new version for changes.';
 END IF;
END;
$guard$;
UPDATE public.membership_policies SET active=false WHERE active;
INSERT INTO public.membership_policies(id,terms_body,privacy_body,published_at,active)
VALUES (${quote(version)},${body(terms)},${body(privacy)},${quote(publishedAt)}::timestamptz,true);
-- effective_at is the existing API availability timestamp for TEST publication only.
INSERT INTO public.service_policies(id,kind,body,effective_at,published) VALUES
(${quote(version + '-privacy')},'privacy',${body(privacy)},${quote(publishedAt)}::timestamptz,true),
(${quote(version + '-location')},'location',${body(location)},${quote(publishedAt)}::timestamptz,true);
-- Existing get_service_policy('terms') reads membership_policies; no duplicate terms row.
COMMIT;
-- Read-only smoke queries, to run during the later approved verification step:
-- SELECT public.get_membership_policy();
-- SELECT public.get_service_policy('terms'),public.get_service_policy('privacy'),public.get_service_policy('location');
`;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg, index) => index % 2 === 0 && !['--published-at', '--version', '--out'].includes(arg)) || args.length % 2) throw new Error('Usage: --published-at <test timestamp> --out <new SQL path> [--version <new runpen-test- id>]');
  const options = Object.fromEntries(Array.from({ length: args.length / 2 }, (_, i) => [args[i * 2], args[i * 2 + 1]]));
  if (!options['--out']) throw new Error('Choose an output SQL file; this script never connects to a database.');
  const [terms, privacy, location] = await Promise.all(['terms.md', 'privacy.md', 'location.md'].map(name => readFile(new URL(name, root), 'utf8')));
  const sql = prepareTestPolicySql({ terms, privacy, location, publishedAt: options['--published-at'], version: options['--version'] });
  await writeFile(resolve(options['--out']), sql, { encoding: 'utf8', flag: 'wx' });
  console.log('Prepared SQL only. Nothing was published.');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
