const runningJobs = new Map<string, Promise<void>>();

export function runJob(key: string, job: () => Promise<void>) {
  if (runningJobs.has(key)) {
    return false;
  }

  const promise = job()
    .catch(() => {
      return;
    })
    .finally(() => {
      runningJobs.delete(key);
    });

  runningJobs.set(key, promise);
  return true;
}

export function hasRunningJob(key: string) {
  return runningJobs.has(key);
}
