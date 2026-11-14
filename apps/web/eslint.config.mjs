// @ts-check
// Web app lint: the repo's shared rules plus React hooks + Next.js rules.
// Plugins live in the workspace root devDependencies (see ../../eslint.config.mjs).
import { baseConfig, webConfig } from '../../eslint.config.mjs';

export default [...baseConfig, ...webConfig('.'), { ignores: ['public/**'] }];
