# Beat Jev · Python

You and Jev take five kicks each. **Render Workflows** runs the whole match and its subtasks; **TypeSafe Jev** chooses shots and saves; **Render Postgres** keeps the score.

<a href="https://render.com/docs/workflows?utm_source=github&utm_medium=referral&utm_campaign=ojus_demos&utm_content=readme_workflows" target="_blank" rel="noopener noreferrer"><img alt="Render Workflows" src="https://img.shields.io/badge/Render-Workflows-6D3BC6?logo=render&logoColor=white" /></a>
<a href="https://typesafe.ai" target="_blank" rel="noopener noreferrer"><img alt="TypeSafe Jev" src="https://img.shields.io/badge/TypeSafe-Jev-252525" /></a>
<a href="https://render.com/docs/postgresql" target="_blank" rel="noopener noreferrer"><img alt="Render Postgres" src="https://img.shields.io/badge/Postgres-4169E1?logo=postgresql&logoColor=white" /></a>
<a href="https://threejs.org" target="_blank" rel="noopener noreferrer"><img alt="Three.js" src="https://img.shields.io/badge/Three.js-222222?logo=threedotjs&logoColor=white" /></a>

<a href="https://dashboard.render.com/login?next=%2Fblueprint%2Fnew%3Frepo%3Dhttps%253A%252F%252Fgithub.com%252Fojusave%252Fbeat-jev%26path%3Dpython%252Frender.yaml%26utm_source%3Dgithub%26utm_medium%3Dreferral%26utm_campaign%3Dojus_demos%26utm_content%3Dreadme_deploy_python&utm_source=github&utm_medium=referral&utm_campaign=ojus_demos&utm_content=readme_deploy_python" target="_blank" rel="noopener noreferrer"><img src="https://render.com/images/deploy-to-render-button.svg" alt="Deploy to Render" /></a>

<a href="https://beat-jev-python-web.onrender.com" target="_blank" rel="noopener noreferrer">Play the live game ↗</a>

## Deploy

The Blueprint creates a paid web service, a usage-billed workflow with all eleven tasks, and a paid Postgres database. Enter your **Render API key** and **TypeSafe API key** when prompted. Database connections and the workflow slug are wired automatically. No OpenRouter key is needed.

## Play

1. Enter a nickname and press **Play**.
2. Tap to aim, or swipe for power and curl. Release to kick. Arrow keys and Space also work.
3. Roles swap automatically. A short countdown announces Jev’s kick. Use Left/Right to move and hold Space to jump, or use the touch controls.
4. Five kicks each. Most goals wins. Press **Try again** for a new match.

One parent task owns ten alternating turns. Player and keeper subtasks run in parallel; saving the result waits for both. Jev commits his shot before seeing your current movement. The **Render Workflows** panel shows the real task tree; expand Jev’s decision for its input and response.

## Local development

From the repository root, with Node 24, the Render CLI, and a Postgres database:

```sh
npm ci
uv sync --project python
cp .env.example .env
# Set DATABASE_URL and TYPESAFE_API_KEY in .env.
npm run dev:python
```

Open `http://127.0.0.1:5183`. Local mode uses Render’s local workflow server. The database schema is created on API startup.

<a href="https://github.com/ojusave/beat-jev/blob/main/docs/architecture.md" target="_blank" rel="noopener noreferrer">Architecture, retries, and tests ↗</a>
