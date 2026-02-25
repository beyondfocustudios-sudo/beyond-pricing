export type BuildStamp = {
  env: string;
  ref: string;
  sha: string;
  deploymentUrl: string;
  builtAt: string;
};

export function getBuildStamp(): BuildStamp {
  const env = process.env.VERCEL_ENV ?? "local";
  const ref = process.env.VERCEL_GIT_COMMIT_REF ?? "local";
  const sha = (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7);
  const deploymentHost =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.VERCEL_BRANCH_URL ??
    process.env.VERCEL_URL;

  return {
    env,
    ref,
    sha,
    deploymentUrl: deploymentHost ? `https://${deploymentHost}` : "local",
    builtAt: new Date().toISOString(),
  };
}
