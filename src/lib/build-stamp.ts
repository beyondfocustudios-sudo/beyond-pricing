export type BuildStampInfo = {
  env: string;
  branch: string;
  sha: string;
  shortSha: string;
  buildTime: string;
  deploymentUrl: string;
  stamp: string;
};

function normalizeText(value: string | undefined | null, fallback: string) {
  const raw = (value ?? "").trim();
  return raw.length > 0 ? raw : fallback;
}

function resolveBuildTimeRaw() {
  return normalizeText(
    process.env.NEXT_PUBLIC_BUILD_TIME
      ?? process.env.VERCEL_GIT_COMMIT_TIMESTAMP
      ?? process.env.BUILD_TIME_UTC
      ?? process.env.VERCEL_DEPLOYMENT_CREATED_AT,
    new Date().toISOString(),
  );
}

function formatLisbonDate(isoLike: string) {
  const date = new Date(isoLike);
  if (Number.isNaN(date.getTime())) return isoLike;
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const map = new Map(parts.map((part) => [part.type, part.value]));
  return `${map.get("year")}-${map.get("month")}-${map.get("day")} ${map.get("hour")}:${map.get("minute")}`;
}

export function getBuildStampInfo(): BuildStampInfo {
  const env = normalizeText(process.env.VERCEL_ENV ?? process.env.NODE_ENV, "local");
  const branch = normalizeText(
    process.env.VERCEL_GIT_COMMIT_REF
      ?? process.env.GIT_BRANCH
      ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF,
    "local",
  );

  const sha = normalizeText(
    process.env.VERCEL_GIT_COMMIT_SHA
      ?? process.env.GIT_COMMIT_SHA
      ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    "local",
  );

  const shortSha = sha === "local" ? "local" : sha.slice(0, 7);
  const buildTime = formatLisbonDate(resolveBuildTimeRaw());
  const deploymentUrl = normalizeText(process.env.VERCEL_URL ?? process.env.NEXT_PUBLIC_VERCEL_URL, "local");

  return {
    env,
    branch,
    sha,
    shortSha,
    buildTime,
    deploymentUrl,
    stamp: `${env} • ${branch} • ${shortSha} • ${buildTime}`,
  };
}
