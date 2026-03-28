import { prisma } from '../db/client.js';

export async function getCameraSettings(): Promise<Record<string, unknown>> {
  const rows = await prisma.cameraSettings.findMany();
  const settings: Record<string, unknown> = {};
  for (const row of rows) {
    settings[row.key] = JSON.parse(row.value);
  }
  return settings;
}

export async function upsertCameraSettings(settings: Record<string, unknown>): Promise<void> {
  await Promise.all(
    Object.entries(settings).map(([key, value]) =>
      prisma.cameraSettings.upsert({
        where: { key },
        update: { value: JSON.stringify(value) },
        create: { key, value: JSON.stringify(value) },
      }),
    ),
  );
}
