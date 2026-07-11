import { syncWindsor, WindsorSyncError } from "~/server/windsor/sync";

try {
  const summary = await syncWindsor();
  console.info(JSON.stringify(summary));
} catch (error) {
  if (error instanceof WindsorSyncError) {
    console.error(JSON.stringify(error.summary));
  } else {
    console.error("Windsor synchronization failed before a run was created.");
  }
  process.exitCode = 1;
}
