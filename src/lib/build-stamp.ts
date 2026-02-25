export type BuildStamp = {
  env: string;
  ref: string;
  sha: string;
  deploymentUrl: string;
  builtAt: string;
};

const BUILT_AT = new Date().toISOString();

export function getBuildStamp(): BuildStamp {
  const valueOr = (value: string | undefined, fallback: string) => (value && value.trim() ? value : fallback);

  const env = valueOr(process.env.VERCEL_ENV, process.env.NODE_ENV === "production" ? "production" : "local");
  const ref = valueOr(process.env.VERCEL_GIT_COMMIT_REF, "local");
  const fullSha = valueOr(process.env.VERCEL_GIT_COMMIT_SHA, "local");
  const sha = fullSha === "local" ? "local" : fullSha.slice(0, 7);
  const vercelUrl = valueOr(process.env.VERCEL_URL, "");
  const deploymentUrl = vercelUrl ? `https://${vercelUrl}` : "local";

  return {
    env,
    ref,
    sha,
    deploymentUrl,
    builtAt: BUILT_AT,
  };
}
