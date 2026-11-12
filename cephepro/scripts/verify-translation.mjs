// Offline verification only. No credentials, provider requests or billable calls.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const files=['../tests/local-translation.test.mjs','../tests/i18n.test.mjs'].map(path=>fileURLToPath(new URL(path,import.meta.url)));
const result=spawnSync(process.execPath,['--test','--test-concurrency=1',...files],{stdio:'inherit'});
process.exitCode=result.status??1;
