/**
 * R-DEP-16 (doc 14 §13.2) and doc 18 §5.3: a deployment that would serve sign-in insecurely, or
 * put verification codes in the log, does not start. Failing here names the variable in the log
 * and in systemd/WinSW; failing later would be a quiet hole in production.
 *
 * Node-only (it exits the process), so `instrumentation.ts` reaches it through `import()`, like
 * its other Node-only wiring — that file is also bundled for the Edge runtime.
 */
import { authDeploymentProblems, type Logger } from '@buybox/shared';

export async function refuseInvalidDeployment(logger: Logger): Promise<void> {
  const problems = authDeploymentProblems(process.env);
  try {
    const { getSmsSender } = await import('./lib/server/auth/sms');
    getSmsSender();
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }
  if (problems.length > 0) {
    logger.error('auth.deploymentRefused', { problems });
    process.exit(1);
  }
}
