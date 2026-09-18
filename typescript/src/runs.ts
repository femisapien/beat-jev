import { Render } from "@renderinc/sdk";
import type { Command, Span, Trace } from "../../shared/types";
export const render = new Render();
export const workflow =
  process.env.RENDER_WORKFLOW_SLUG || "beat-jev-typescript";
const metadata = new Map<string, { name: string; workflowId?: string }>();
let workflowId: string | undefined;
async function api(path: string) {
  const response = await fetch(
    `${process.env.RENDER_LOCAL_DEV_URL || "https://api.render.com"}/v1/${path}`,
    {
      headers: process.env.RENDER_API_KEY
        ? { Authorization: `Bearer ${process.env.RENDER_API_KEY}` }
        : {},
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok) throw new Error("Trace unavailable.");
  return response.json();
}
async function taskInfo(id: string) {
  if (!metadata.has(id)) metadata.set(id, await api(`tasks/${id}`));
  return metadata.get(id)!;
}
export async function readTrace(id: string, owner: string): Promise<Trace> {
  const root = await render.workflows.getTaskRun(id);
  const cmd = (root.input as Command[])[0];
  const info = await taskInfo(root.taskId);
  if (
    cmd?.owner !== owner ||
    root.parentTaskRunId ||
    !["start_game", "take_shot"].includes(info.name)
  )
    throw new Error("Trace not found.");
  if (!process.env.RENDER_LOCAL_DEV_URL) {
    if (!workflowId)
      workflowId = (
        await api(`tasks?taskSlug=${workflow}/start_game&limit=1`)
      )[0]?.task.workflowId;
    if (!workflowId || info.workflowId !== workflowId)
      throw new Error("Trace not found.");
  }
  const listed = await render.workflows.listTaskRuns({
    rootTaskRunId: [id],
    limit: 30,
  });
  const children = await Promise.all(
    listed
      .filter((r) => r.taskRun.id !== id && r.taskRun.rootTaskRunId === id)
      .map((r) => render.workflows.getTaskRun(r.taskRun.id)),
  );
  const spans: Span[] = await Promise.all(
    [root, ...children].map(async (r) => ({
      id: r.id,
      name: (await taskInfo(r.taskId)).name,
      status: r.status,
      startedAt: r.startedAt,
      completedAt: r.completedAt,
      retries: r.retries,
    })),
  );
  return { id, status: root.status, spans };
}
