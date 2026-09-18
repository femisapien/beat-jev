import os
import asyncio
import httpx
from render import RenderAsync

render = RenderAsync()
WORKFLOW = os.getenv("RENDER_WORKFLOW_SLUG", "beat-jev-python")
TASKS = {}
WORKFLOW_ID = None


async def read_trace(run_id, owner):
    global WORKFLOW_ID
    root = (await render.workflows.get_task_run(run_id)).to_dict()
    base = os.getenv("RENDER_LOCAL_DEV_URL", "https://api.render.com")
    headers = (
        {"Authorization": f"Bearer {os.environ['RENDER_API_KEY']}"}
        if os.getenv("RENDER_API_KEY")
        else {}
    )
    async with httpx.AsyncClient(timeout=10, headers=headers) as client:

        async def info(task_id):
            if task_id not in TASKS:
                response = await client.get(f"{base}/v1/tasks/{task_id}")
                response.raise_for_status()
                TASKS[task_id] = response.json()
            return TASKS[task_id]

        task = await info(root["taskId"])
        if (
            root["input"][0].get("owner") != owner
            or root.get("parentTaskRunId")
            or task["name"] not in ["start_game", "take_penalty"]
        ):
            raise LookupError("Trace not found.")
        if not os.getenv("RENDER_LOCAL_DEV_URL"):
            if not WORKFLOW_ID:
                res = await client.get(
                    f"{base}/v1/tasks",
                    params={"taskSlug": f"{WORKFLOW}/start_game", "limit": 1},
                )
                res.raise_for_status()
                WORKFLOW_ID = res.json()[0]["task"].get("workflowId")
            if not WORKFLOW_ID or task.get("workflowId") != WORKFLOW_ID:
                raise LookupError("Trace not found.")
        response = await client.get(
            f"{base}/v1/task-runs", params={"rootTaskRunId": run_id, "limit": 30}
        )
        response.raise_for_status()
        ids = [
            r["taskRun"]["id"]
            for r in response.json()
            if r["taskRun"]["id"] != run_id
            and r["taskRun"].get("rootTaskRunId") == run_id
        ]
        children = [
            r.to_dict()
            for r in await asyncio.gather(
                *(render.workflows.get_task_run(i) for i in ids)
            )
        ]
        spans = []
        for run in [root, *children]:
            spans.append(
                dict(
                    id=run["id"],
                    name=(await info(run["taskId"]))["name"],
                    status=run["status"],
                    startedAt=run.get("startedAt"),
                    completedAt=run.get("completedAt"),
                    retries=run.get("retries", 0),
                )
            )
    return dict(
        id=run_id,
        status=root["status"],
        spans=spans,
        number=root["input"][0].get("number"),
    )
